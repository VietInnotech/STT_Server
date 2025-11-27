# Android App - Implementation Guide

**Version:** 1.0  
**Last Updated:** November 27, 2025  
**Parent Document:** [`SYSTEM_INTEGRATION_PLAN.md`](../SYSTEM_INTEGRATION_PLAN.md)  
**Audience:** Android/Mobile Engineers

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Changes](#architecture-changes)
3. [API Migration](#api-migration)
4. [Socket.IO Integration](#socketio-integration)
5. [Reliability Improvements](#reliability-improvements)
6. [Code Examples](#code-examples)
7. [Testing Checklist](#testing-checklist)

---

## Overview

This guide covers the required Android app changes to implement the secure BFF (Backend-for-Frontend) pattern, removing direct MAIE communication and improving reliability.

### Key Changes Summary

| Before                             | After                                   |
| ---------------------------------- | --------------------------------------- |
| Android → MAIE (direct, X-API-Key) | Android → Report Server → MAIE          |
| Hardcoded API key in APK           | No API key on client                    |
| Manual polling for status          | Socket.IO + fallback polling            |
| Basic HTTP uploads                 | WorkManager with retry                  |
| Uploads text only                  | Uploads structured result with metadata |

### Security Improvement

```
BEFORE (Insecure):
┌────────┐   X-API-Key   ┌──────┐
│ Android │─────────────►│ MAIE │  ❌ API Key extractable from APK
└────────┘               └──────┘

AFTER (Secure):
┌────────┐   JWT Token   ┌────────────┐   X-API-Key   ┌──────┐
│ Android │─────────────►│Report Server│─────────────►│ MAIE │  ✅ Key server-side only
└────────┘               └────────────┘               └──────┘
```

---

## Architecture Changes

### Remove Direct MAIE Communication

**Delete these files/classes:**

- `MaieApiService.kt` (or equivalent direct MAIE client)
- Any hardcoded MAIE URL or API key constants

**Update network configuration:**

```kotlin
// BEFORE - remove this
object MaieConfig {
    const val BASE_URL = "http://192.168.1.100:8000"
    const val API_KEY = "hardcoded-api-key-here"  // ❌ INSECURE
}

// AFTER - use Report Server only
object ApiConfig {
    const val REPORT_SERVER_URL = "http://192.168.1.100:3000"
    // No MAIE URL or API key on client!
}
```

### New API Client Structure

```kotlin
// api/ReportServerApi.kt
interface ReportServerApi {

    // === Authentication ===
    @POST("/api/auth/login")
    suspend fun login(@Body credentials: LoginRequest): LoginResponse

    // === Processing (NEW - replaces direct MAIE) ===
    @Multipart
    @POST("/api/process")
    suspend fun submitProcessing(
        @Part file: MultipartBody.Part,
        @Part("template_id") templateId: RequestBody?,
        @Part("features") features: RequestBody?
    ): ProcessingSubmitResponse

    @GET("/api/process/{taskId}/status")
    suspend fun getProcessingStatus(
        @Path("taskId") taskId: String
    ): ProcessingStatusResponse

    @POST("/api/process/text")
    suspend fun submitTextProcessing(
        @Body request: TextProcessingRequest
    ): ProcessingSubmitResponse

    // === Results Upload ===
    @POST("/api/files/processing-result")
    suspend fun uploadProcessingResult(
        @Body result: ProcessingResultPayload
    ): ProcessingResultResponse

    // === Files ===
    @Multipart
    @POST("/api/files/audio")
    suspend fun uploadAudio(
        @Part file: MultipartBody.Part,
        @Part("deviceId") deviceId: RequestBody?
    ): FileUploadResponse

    // === Search ===
    @GET("/api/files/search")
    suspend fun searchFiles(
        @Query("q") query: String?,
        @Query("tags") tags: String?,
        @Query("templateId") templateId: String?,
        @Query("limit") limit: Int = 20,
        @Query("offset") offset: Int = 0
    ): SearchResponse

    @GET("/api/files/tags")
    suspend fun getTags(@Query("limit") limit: Int = 50): TagsResponse

    // === Templates ===
    @GET("/api/templates")
    suspend fun getTemplates(): TemplatesResponse
}
```

---

## API Migration

### Data Classes

```kotlin
// models/Processing.kt

data class ProcessingSubmitResponse(
    val success: Boolean,
    val taskId: String,
    val status: String,
    val message: String?
)

data class ProcessingStatusResponse(
    val taskId: String,
    val status: ProcessingStatus,
    val progress: Int?,
    val result: ProcessingResult?,
    val error: String?,
    val errorCode: String?
)

enum class ProcessingStatus {
    PENDING,
    PREPROCESSING,
    PROCESSING_ASR,
    PROCESSING_LLM,
    COMPLETE,
    FAILED
}

data class ProcessingResult(
    val title: String,
    val summary: String,
    val transcript: String,
    val tags: List<String>?,
    val confidence: Double?,
    val processingTime: Double?,
    val audioDuration: Double?
)

data class TextProcessingRequest(
    val text: String,
    val templateId: String?
)
```

```kotlin
// models/ProcessingResultPayload.kt

data class ProcessingResultPayload(
    val summary: String,
    val transcript: String,
    val title: String,
    val tags: List<String>? = null,
    val templateId: String? = null,
    val templateName: String? = null,
    val maieTaskId: String? = null,
    val confidence: Double? = null,
    val processingTime: Double? = null,
    val audioDuration: Double? = null,
    val sourceAudioId: String? = null,
    val deviceId: String? = null,
    val deleteAfterDays: Int? = null,
    val pairName: String? = null
)

data class ProcessingResultResponse(
    val success: Boolean,
    val result: UploadedResult
)

data class UploadedResult(
    val id: String,
    val title: String,
    val tags: List<String>,
    val sourceAudioId: String?,
    val createdAt: String
)
```

### Processing Service

```kotlin
// services/ProcessingService.kt

class ProcessingService(
    private val api: ReportServerApi,
    private val taskRepository: TaskRepository,
    private val socketManager: SocketManager
) {

    /**
     * Submit audio for processing
     *
     * @return Internal task ID (not MAIE task ID)
     */
    suspend fun submitAudioForProcessing(
        audioFile: File,
        templateId: String?,
        features: String = "summary"
    ): Result<String> {
        return try {
            val filePart = MultipartBody.Part.createFormData(
                "file",
                audioFile.name,
                audioFile.asRequestBody("audio/wav".toMediaType())
            )

            val templatePart = templateId?.toRequestBody("text/plain".toMediaType())
            val featuresPart = features.toRequestBody("text/plain".toMediaType())

            val response = api.submitProcessing(filePart, templatePart, featuresPart)

            if (response.success) {
                // Store task locally for tracking
                taskRepository.saveTask(
                    TaskEntity(
                        id = response.taskId,
                        status = TaskStatus.PENDING,
                        createdAt = System.currentTimeMillis()
                    )
                )

                Result.success(response.taskId)
            } else {
                Result.failure(Exception("Processing submission failed"))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to submit processing", e)
            Result.failure(e)
        }
    }

    /**
     * Check processing status (manual poll)
     */
    suspend fun checkStatus(taskId: String): Result<ProcessingStatusResponse> {
        return try {
            val response = api.getProcessingStatus(taskId)

            // Update local task status
            taskRepository.updateStatus(taskId, response.status)

            if (response.status == ProcessingStatus.COMPLETE ||
                response.status == ProcessingStatus.FAILED) {
                taskRepository.markCompleted(taskId)
            }

            Result.success(response)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to check status", e)
            Result.failure(e)
        }
    }

    /**
     * Upload processing result to server
     */
    suspend fun uploadResult(
        result: ProcessingResult,
        taskId: String,
        templateId: String?,
        templateName: String?,
        audioId: String? = null
    ): Result<UploadedResult> {
        return try {
            val payload = ProcessingResultPayload(
                summary = result.summary,
                transcript = result.transcript,
                title = result.title,
                tags = result.tags,
                templateId = templateId,
                templateName = templateName,
                maieTaskId = taskId,
                confidence = result.confidence,
                processingTime = result.processingTime,
                audioDuration = result.audioDuration,
                sourceAudioId = audioId,
                deviceId = getDeviceId(),
                pairName = "${result.title} - ${formatDate(Date())}"
            )

            val response = api.uploadProcessingResult(payload)

            if (response.success) {
                Result.success(response.result)
            } else {
                Result.failure(Exception("Upload failed"))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to upload result", e)
            Result.failure(e)
        }
    }

    companion object {
        private const val TAG = "ProcessingService"
    }
}
```

---

## Socket.IO Integration

### Socket Manager

```kotlin
// socket/SocketManager.kt

class SocketManager(
    private val authRepository: AuthRepository
) {
    private var socket: Socket? = null
    private val _taskEvents = MutableSharedFlow<TaskCompleteEvent>()
    val taskEvents: SharedFlow<TaskCompleteEvent> = _taskEvents.asSharedFlow()

    fun connect(serverUrl: String) {
        val options = IO.Options().apply {
            auth = mapOf("token" to authRepository.getAccessToken())
            reconnection = true
            reconnectionAttempts = 10
            reconnectionDelay = 1000
            reconnectionDelayMax = 5000
        }

        socket = IO.socket(serverUrl, options).apply {
            on(Socket.EVENT_CONNECT) {
                Log.d(TAG, "Socket connected")
            }

            on(Socket.EVENT_DISCONNECT) {
                Log.d(TAG, "Socket disconnected")
            }

            on("task:complete") { args ->
                val data = args[0] as JSONObject
                handleTaskComplete(data)
            }

            connect()
        }
    }

    fun disconnect() {
        socket?.disconnect()
        socket = null
    }

    private fun handleTaskComplete(data: JSONObject) {
        val event = TaskCompleteEvent(
            taskId = data.getString("taskId"),
            status = data.getString("status"),
            result = if (data.has("result")) parseResult(data.getJSONObject("result")) else null,
            error = data.optString("error", null),
            errorCode = data.optString("errorCode", null)
        )

        CoroutineScope(Dispatchers.Main).launch {
            _taskEvents.emit(event)
        }
    }

    private fun parseResult(json: JSONObject): ProcessingResult {
        return ProcessingResult(
            title = json.getString("title"),
            summary = json.getString("summary"),
            transcript = json.getString("transcript"),
            tags = json.optJSONArray("tags")?.let { arr ->
                (0 until arr.length()).map { arr.getString(it) }
            },
            confidence = json.optDouble("confidence").takeIf { !it.isNaN() },
            processingTime = json.optDouble("processingTime").takeIf { !it.isNaN() },
            audioDuration = json.optDouble("audioDuration").takeIf { !it.isNaN() }
        )
    }

    companion object {
        private const val TAG = "SocketManager"
    }
}

data class TaskCompleteEvent(
    val taskId: String,
    val status: String,
    val result: ProcessingResult?,
    val error: String?,
    val errorCode: String?
)
```

### Handling Missed Events (Critical!)

```kotlin
// services/TaskSyncService.kt

/**
 * ⚠️ CRITICAL: Handle missed Socket.IO events
 *
 * If the app is backgrounded/killed when task:complete fires,
 * the notification will be missed. This service syncs on resume.
 */
class TaskSyncService(
    private val taskRepository: TaskRepository,
    private val processingService: ProcessingService
) {

    /**
     * Call this on Activity.onResume() or App startup
     *
     * ⚠️ Add random delay to prevent "thundering herd" if many
     * users resume simultaneously (e.g., after push notification)
     */
    suspend fun syncPendingTasks() {
        // Random delay 0-2 seconds to prevent thundering herd
        val delayMs = Random.nextLong(0, 2000)
        delay(delayMs)

        val pendingTasks = taskRepository.getPendingTaskIds()

        Log.d(TAG, "Syncing ${pendingTasks.size} pending tasks")

        for (taskId in pendingTasks) {
            try {
                val status = processingService.checkStatus(taskId).getOrNull()

                if (status != null) {
                    when (status.status) {
                        ProcessingStatus.COMPLETE -> {
                            Log.d(TAG, "Task $taskId completed (missed event)")
                            handleCompletedTask(taskId, status.result!!)
                        }
                        ProcessingStatus.FAILED -> {
                            Log.d(TAG, "Task $taskId failed (missed event)")
                            handleFailedTask(taskId, status.error)
                        }
                        else -> {
                            // Still processing, will get Socket.IO update
                        }
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to sync task $taskId", e)
            }
        }
    }

    private suspend fun handleCompletedTask(taskId: String, result: ProcessingResult) {
        // Update local cache
        taskRepository.updateResult(taskId, result)
        taskRepository.markCompleted(taskId)

        // Show notification
        notificationManager.showTaskComplete(taskId, result.title)
    }

    private fun handleFailedTask(taskId: String, error: String?) {
        taskRepository.markFailed(taskId, error)
        notificationManager.showTaskFailed(taskId, error)
    }

    companion object {
        private const val TAG = "TaskSyncService"
    }
}
```

### Activity Integration

```kotlin
// ui/MainActivity.kt

class MainActivity : AppCompatActivity() {

    @Inject lateinit var socketManager: SocketManager
    @Inject lateinit var taskSyncService: TaskSyncService

    private val processingViewModel: ProcessingViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Connect Socket.IO
        socketManager.connect(ApiConfig.REPORT_SERVER_URL)

        // Observe Socket.IO events
        lifecycleScope.launch {
            socketManager.taskEvents.collect { event ->
                handleTaskEvent(event)
            }
        }
    }

    override fun onResume() {
        super.onResume()

        // ⚠️ CRITICAL: Sync pending tasks on resume
        lifecycleScope.launch {
            taskSyncService.syncPendingTasks()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        socketManager.disconnect()
    }

    private fun handleTaskEvent(event: TaskCompleteEvent) {
        when (event.status) {
            "COMPLETE" -> {
                showSuccessDialog(event.taskId, event.result!!)
            }
            "FAILED" -> {
                showErrorDialog(event.taskId, event.error)
            }
        }
    }
}
```

---

## Reliability Improvements

### WorkManager for Uploads

```kotlin
// workers/UploadResultWorker.kt

/**
 * Background-safe upload using WorkManager
 * Survives process death, handles retries automatically
 */
class UploadResultWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    @Inject lateinit var processingService: ProcessingService

    override suspend fun doWork(): Result {
        val taskId = inputData.getString(KEY_TASK_ID) ?: return Result.failure()
        val resultJson = inputData.getString(KEY_RESULT_JSON) ?: return Result.failure()

        val result = Gson().fromJson(resultJson, ProcessingResult::class.java)
        val templateId = inputData.getString(KEY_TEMPLATE_ID)
        val templateName = inputData.getString(KEY_TEMPLATE_NAME)
        val audioId = inputData.getString(KEY_AUDIO_ID)

        return try {
            val uploadResult = processingService.uploadResult(
                result = result,
                taskId = taskId,
                templateId = templateId,
                templateName = templateName,
                audioId = audioId
            )

            if (uploadResult.isSuccess) {
                Log.d(TAG, "Upload succeeded: ${uploadResult.getOrNull()?.id}")
                Result.success()
            } else {
                Log.e(TAG, "Upload failed, will retry")
                Result.retry()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Upload error", e)

            if (runAttemptCount < MAX_RETRIES) {
                Result.retry()
            } else {
                Result.failure()
            }
        }
    }

    companion object {
        private const val TAG = "UploadResultWorker"
        private const val MAX_RETRIES = 5

        const val KEY_TASK_ID = "task_id"
        const val KEY_RESULT_JSON = "result_json"
        const val KEY_TEMPLATE_ID = "template_id"
        const val KEY_TEMPLATE_NAME = "template_name"
        const val KEY_AUDIO_ID = "audio_id"

        fun enqueue(
            context: Context,
            taskId: String,
            result: ProcessingResult,
            templateId: String?,
            templateName: String?,
            audioId: String?
        ) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val inputData = workDataOf(
                KEY_TASK_ID to taskId,
                KEY_RESULT_JSON to Gson().toJson(result),
                KEY_TEMPLATE_ID to templateId,
                KEY_TEMPLATE_NAME to templateName,
                KEY_AUDIO_ID to audioId
            )

            val request = OneTimeWorkRequestBuilder<UploadResultWorker>()
                .setConstraints(constraints)
                .setInputData(inputData)
                .setBackoffCriteria(
                    BackoffPolicy.EXPONENTIAL,
                    30, TimeUnit.SECONDS
                )
                .build()

            WorkManager.getInstance(context)
                .enqueueUniqueWork(
                    "upload_result_$taskId",
                    ExistingWorkPolicy.REPLACE,
                    request
                )
        }
    }
}
```

### Chunked Audio Upload (Large Files)

```kotlin
// services/ChunkedUploadService.kt

/**
 * Upload large audio files in chunks with resume capability
 */
class ChunkedUploadService(
    private val api: ReportServerApi
) {

    companion object {
        private const val CHUNK_SIZE = 5 * 1024 * 1024 // 5MB chunks
    }

    suspend fun uploadAudioChunked(
        audioFile: File,
        deviceId: String,
        onProgress: (Float) -> Unit
    ): Result<String> {
        val totalSize = audioFile.length()
        val totalChunks = ceil(totalSize.toDouble() / CHUNK_SIZE).toInt()
        var uploadedBytes = 0L

        // Start upload session
        val sessionId = UUID.randomUUID().toString()

        audioFile.inputStream().use { input ->
            val buffer = ByteArray(CHUNK_SIZE)
            var chunkIndex = 0

            while (true) {
                val bytesRead = input.read(buffer)
                if (bytesRead == -1) break

                val chunk = if (bytesRead < CHUNK_SIZE) {
                    buffer.copyOf(bytesRead)
                } else {
                    buffer
                }

                // Upload chunk with retry
                val success = uploadChunkWithRetry(
                    sessionId = sessionId,
                    chunkIndex = chunkIndex,
                    totalChunks = totalChunks,
                    chunk = chunk,
                    filename = audioFile.name,
                    deviceId = deviceId
                )

                if (!success) {
                    return Result.failure(Exception("Chunk upload failed"))
                }

                uploadedBytes += bytesRead
                chunkIndex++
                onProgress(uploadedBytes.toFloat() / totalSize)
            }
        }

        // Finalize upload
        return finalizeUpload(sessionId)
    }

    private suspend fun uploadChunkWithRetry(
        sessionId: String,
        chunkIndex: Int,
        totalChunks: Int,
        chunk: ByteArray,
        filename: String,
        deviceId: String,
        maxRetries: Int = 3
    ): Boolean {
        repeat(maxRetries) { attempt ->
            try {
                api.uploadAudioChunk(
                    sessionId = sessionId,
                    chunkIndex = chunkIndex,
                    totalChunks = totalChunks,
                    chunk = chunk.toRequestBody("application/octet-stream".toMediaType()),
                    filename = filename,
                    deviceId = deviceId
                )
                return true
            } catch (e: Exception) {
                Log.w(TAG, "Chunk $chunkIndex failed, attempt ${attempt + 1}", e)
                if (attempt < maxRetries - 1) {
                    delay(exponentialBackoff(attempt))
                }
            }
        }
        return false
    }

    private fun exponentialBackoff(attempt: Int): Long {
        return (2.0.pow(attempt) * 1000).toLong()
    }

    private suspend fun finalizeUpload(sessionId: String): Result<String> {
        return try {
            val response = api.finalizeAudioUpload(sessionId)
            Result.success(response.fileId)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
```

---

## Code Examples

### Complete Processing Flow

```kotlin
// viewmodels/ProcessingViewModel.kt

class ProcessingViewModel(
    private val processingService: ProcessingService,
    private val socketManager: SocketManager
) : ViewModel() {

    private val _state = MutableStateFlow<ProcessingState>(ProcessingState.Idle)
    val state: StateFlow<ProcessingState> = _state.asStateFlow()

    init {
        // Listen for Socket.IO events
        viewModelScope.launch {
            socketManager.taskEvents.collect { event ->
                handleTaskEvent(event)
            }
        }
    }

    fun submitAudio(audioFile: File, templateId: String?, templateName: String?) {
        viewModelScope.launch {
            _state.value = ProcessingState.Submitting

            val result = processingService.submitAudioForProcessing(
                audioFile = audioFile,
                templateId = templateId
            )

            result.fold(
                onSuccess = { taskId ->
                    _state.value = ProcessingState.Processing(
                        taskId = taskId,
                        templateId = templateId,
                        templateName = templateName,
                        progress = 0
                    )
                },
                onFailure = { error ->
                    _state.value = ProcessingState.Error(error.message ?: "Submission failed")
                }
            )
        }
    }

    private fun handleTaskEvent(event: TaskCompleteEvent) {
        val currentState = _state.value
        if (currentState !is ProcessingState.Processing) return
        if (currentState.taskId != event.taskId) return

        when (event.status) {
            "COMPLETE" -> {
                _state.value = ProcessingState.Complete(
                    taskId = event.taskId,
                    result = event.result!!,
                    templateId = currentState.templateId,
                    templateName = currentState.templateName
                )
            }
            "FAILED" -> {
                _state.value = ProcessingState.Error(
                    event.error ?: "Processing failed"
                )
            }
        }
    }

    fun uploadResult() {
        val currentState = _state.value
        if (currentState !is ProcessingState.Complete) return

        viewModelScope.launch {
            _state.value = ProcessingState.Uploading(currentState.result)

            val result = processingService.uploadResult(
                result = currentState.result,
                taskId = currentState.taskId,
                templateId = currentState.templateId,
                templateName = currentState.templateName
            )

            result.fold(
                onSuccess = { uploaded ->
                    _state.value = ProcessingState.Uploaded(uploaded)
                },
                onFailure = { error ->
                    _state.value = ProcessingState.Error(error.message ?: "Upload failed")
                }
            )
        }
    }
}

sealed class ProcessingState {
    object Idle : ProcessingState()
    object Submitting : ProcessingState()
    data class Processing(
        val taskId: String,
        val templateId: String?,
        val templateName: String?,
        val progress: Int
    ) : ProcessingState()
    data class Complete(
        val taskId: String,
        val result: ProcessingResult,
        val templateId: String?,
        val templateName: String?
    ) : ProcessingState()
    data class Uploading(val result: ProcessingResult) : ProcessingState()
    data class Uploaded(val uploaded: UploadedResult) : ProcessingState()
    data class Error(val message: String) : ProcessingState()
}
```

---

## Testing Checklist

### Security Tests

- [ ] No MAIE API key in APK (use APK decompiler to verify)
- [ ] No MAIE URL hardcoded in APK
- [ ] All requests go through Report Server
- [ ] JWT token used for authentication

### Functional Tests

- [ ] Audio processing submission works
- [ ] Status polling returns correct progress
- [ ] Socket.IO receives task:complete events
- [ ] Result upload includes all metadata
- [ ] Tags are sent correctly

### Reliability Tests

- [ ] App resumes and syncs pending tasks
- [ ] Missed Socket.IO events caught by fallback polling
- [ ] WorkManager retries failed uploads
- [ ] Large file uploads don't crash
- [ ] Network transitions (WiFi → cellular) handled

### Edge Cases

- [ ] Process multiple audios simultaneously
- [ ] Handle server errors gracefully
- [ ] Offline mode shows cached results
- [ ] Background processing continues when app backgrounded

---

## Migration Steps

### Step 1: Remove MAIE Integration (Day 1)

1. Delete `MaieApiService.kt` and related classes
2. Remove MAIE URL and API key constants
3. Update network module to remove MAIE client

### Step 2: Add Report Server Proxy (Day 1-2)

1. Add new API endpoints to `ReportServerApi.kt`
2. Create `ProcessingService.kt`
3. Update data classes

### Step 3: Implement Socket.IO (Day 2)

1. Add `socket.io-client` dependency
2. Create `SocketManager.kt`
3. Handle connection lifecycle

### Step 4: Add Fallback Polling (Day 2)

1. Create `TaskSyncService.kt`
2. Add `syncPendingTasks()` to Activity.onResume()
3. Add random delay for thundering herd prevention

### Step 5: Add WorkManager (Day 3)

1. Create `UploadResultWorker.kt`
2. Add constraints for network connectivity
3. Implement exponential backoff

### Step 6: Testing (Day 4)

1. Run all test scenarios
2. Verify no API key leakage
3. Test reliability scenarios

---

## Dependencies

Add to `build.gradle`:

```groovy
dependencies {
    // Socket.IO
    implementation 'io.socket:socket.io-client:2.1.0'

    // WorkManager
    implementation "androidx.work:work-runtime-ktx:2.9.0"

    // Retrofit (existing)
    implementation 'com.squareup.retrofit2:retrofit:2.9.0'
    implementation 'com.squareup.retrofit2:converter-gson:2.9.0'

    // OkHttp (existing)
    implementation 'com.squareup.okhttp3:okhttp:4.12.0'
    implementation 'com.squareup.okhttp3:logging-interceptor:4.12.0'
}
```

---

**Document Complete.** Follow this guide to implement secure, reliable MAIE integration through Report Server.
