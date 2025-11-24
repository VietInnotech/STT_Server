# Android Kotlin App Integration Guide
## UNV AI Report - Local Offline System

**Project:** UNV AI Report Backend Integration  
**Platform:** Android (Kotlin)  
**Backend:** Node.js + Express + Socket.IO  
**Date:** October 8, 2025  
**API Version:** 1.0.0

---

## 📋 Table of Contents

1. [System Overview](#system-overview)
2. [Prerequisites & Dependencies](#prerequisites--dependencies)
3. [Architecture Requirements](#architecture-requirements)
4. [Network Configuration](#network-configuration)
5. [Authentication System](#authentication-system)
6. [API Endpoints Reference](#api-endpoints-reference)
7. [Socket.IO Real-Time Communication](#socketio-real-time-communication)
8. [File Upload/Download Implementation](#file-uploaddownload-implementation)
9. [Device Registration & Tracking](#device-registration--tracking)
10. [2FA/TOTP Implementation](#2fatotp-implementation)
11. [Data Models](#data-models)
12. [Error Handling](#error-handling)
13. [Security Best Practices](#security-best-practices)
14. [Code Examples](#code-examples)

---

## 🎯 System Overview

### Backend Capabilities
- **Authentication:** JWT-based with optional 2FA/TOTP
- **Real-time Communication:** Socket.IO for device status, live updates
- **File Management:** Encrypted audio/text file upload and download
- **Device Tracking:** Online/offline status, uptime history
- **Audit Logging:** All actions tracked with IP and user agent
- **Role-Based Access Control (RBAC):** Admin, User, Viewer roles

### Key Features for Android Integration
✅ **Device Registration** - Auto-register Android devices via IP  
✅ **File Encryption** - AES-256-GCM encryption (handled server-side)  
✅ **Real-time Uptime Tracking** - Socket.IO heartbeat mechanism  
✅ **JWT Authentication** - Token-based auth with refresh capability  
✅ **2FA Support** - TOTP with backup codes and device trust  
✅ **Auto-delete Scheduling** - User-configurable file expiration  
✅ **Offline-first Design** - Works on local network without internet

---

## 📦 Prerequisites & Dependencies

### Required Android Libraries

```kotlin
// build.gradle.kts (Module: app)

dependencies {
    // Core Android
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.7.0")
    
    // Networking
    implementation("com.squareup.retrofit2:retrofit:2.9.0")
    implementation("com.squareup.retrofit2:converter-gson:2.9.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    
    // Socket.IO for real-time communication
    implementation("io.socket:socket.io-client:2.1.0")
    
    // Coroutines for async operations
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
    
    // Secure storage for tokens
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    
    // Image loading (for QR codes in 2FA)
    implementation("io.coil-kt:coil:2.5.0")
    
    // JSON parsing
    implementation("com.google.code.gson:gson:2.10.1")
    
    // Optional: TOTP for 2FA (if client-side validation needed)
    implementation("com.google.android.gms:play-services-auth:20.7.0")
    
    // Optional: Biometric authentication
    implementation("androidx.biometric:biometric:1.2.0-alpha05")
    
    // File picker (if needed)
    implementation("androidx.activity:activity-ktx:1.8.2")
}
```

### Permissions Required

```xml
<!-- AndroidManifest.xml -->

<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    
    <!-- Network access (required) -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    
    <!-- Device info for fingerprinting -->
    <uses-permission android:name="android.permission.READ_PHONE_STATE" />
    
    <!-- File access -->
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
    
    <!-- Audio recording (if recording feature needed) -->
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    
    <!-- Foreground service for background uploads -->
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    
    <!-- Optional: Keep WiFi alive for Socket.IO -->
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
    
</manifest>
```

---

## 🏗️ Architecture Requirements

### Recommended App Structure

```
app/
├── data/
│   ├── api/
│   │   ├── ApiService.kt              # Retrofit API interface
│   │   ├── AuthInterceptor.kt         # JWT token injection
│   │   ├── RetrofitClient.kt          # Retrofit setup
│   │   └── SocketManager.kt           # Socket.IO manager
│   ├── models/
│   │   ├── User.kt
│   │   ├── Device.kt
│   │   ├── AudioFile.kt
│   │   ├── TextFile.kt
│   │   ├── AuthResponse.kt
│   │   └── ApiResponse.kt
│   ├── repository/
│   │   ├── AuthRepository.kt
│   │   ├── FileRepository.kt
│   │   └── DeviceRepository.kt
│   └── local/
│       ├── SecurePreferences.kt       # EncryptedSharedPreferences
│       └── DeviceInfoProvider.kt      # Device fingerprint generation
├── ui/
│   ├── login/
│   ├── dashboard/
│   ├── upload/
│   └── settings/
├── utils/
│   ├── NetworkHelper.kt
│   ├── FileUtils.kt
│   └── Constants.kt
└── di/
    └── NetworkModule.kt               # Dependency injection (optional)
```

### Key Components

1. **ApiService**: Retrofit interface for all HTTP endpoints
2. **SocketManager**: Socket.IO connection handler
3. **AuthRepository**: Authentication logic, token management
4. **FileRepository**: File upload/download handling
5. **SecurePreferences**: Encrypted storage for JWT tokens
6. **DeviceInfoProvider**: Generate unique device fingerprint

---

## 🌐 Network Configuration

### Base URL Configuration

```kotlin
// utils/Constants.kt

object Constants {
    // Local network server (update with your server IP)
    const val BASE_URL = "http://192.168.1.69:3000"
    
    // API endpoints
    const val API_BASE_URL = "$BASE_URL/api"
    
    // Socket.IO URL
    const val SOCKET_URL = BASE_URL
    
    // Timeouts
    const val CONNECT_TIMEOUT = 30L // seconds
    const val READ_TIMEOUT = 30L
    const val WRITE_TIMEOUT = 60L // longer for file uploads
    
    // Preferences keys
    const val PREF_AUTH_TOKEN = "auth_token"
    const val PREF_USER_ID = "user_id"
    const val PREF_USERNAME = "username"
    const val PREF_DEVICE_FINGERPRINT = "device_fingerprint"
    const val PREF_2FA_ENABLED = "2fa_enabled"
}
```

### Server Discovery (Optional)

For automatic server discovery on LAN:

```kotlin
// utils/NetworkHelper.kt

import java.net.InetAddress

object NetworkHelper {
    
    // Ping server to check availability
    suspend fun isServerReachable(host: String, timeout: Int = 2000): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                val address = InetAddress.getByName(host)
                address.isReachable(timeout)
            } catch (e: Exception) {
                false
            }
        }
    }
    
    // Get device IP address
    fun getDeviceIP(): String? {
        try {
            val networkInterfaces = NetworkInterface.getNetworkInterfaces()
            while (networkInterfaces.hasMoreElements()) {
                val ni = networkInterfaces.nextElement()
                val addresses = ni.inetAddresses
                while (addresses.hasMoreElements()) {
                    val addr = addresses.nextElement()
                    if (!addr.isLoopbackAddress && addr is Inet4Address) {
                        return addr.hostAddress
                    }
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return null
    }
}
```

---

## 🔐 Authentication System

### 1. Login Flow

**Endpoint:** `POST /api/auth/login`

**Request:**
```json
{
  "username": "admin",
  "password": "admin123",
  "deviceFingerprint": "android-unique-id-12345"
}
```

**Response (No 2FA):**
```json
{
  "user": {
    "id": "uuid",
    "username": "admin",
    "email": "admin@example.com",
    "fullName": "Admin User",
    "role": "admin",
    "isActive": true,
    "lastLogin": "2025-10-08T10:00:00Z"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (2FA Required):**
```json
{
  "requires2FA": true,
  "userId": "user-uuid",
  "message": "2FA verification required"
}
```

### 2. Kotlin Implementation

```kotlin
// data/models/AuthResponse.kt

data class LoginRequest(
    val username: String,
    val password: String,
    val deviceFingerprint: String
)

data class User(
    val id: String,
    val username: String,
    val email: String,
    val fullName: String?,
    val role: String,
    val isActive: Boolean,
    val lastLogin: String?
)

data class LoginResponse(
    val user: User? = null,
    val token: String? = null,
    val requires2FA: Boolean? = null,
    val userId: String? = null,
    val message: String? = null
)

// data/api/ApiService.kt

import retrofit2.Response
import retrofit2.http.*

interface ApiService {
    
    @POST("auth/login")
    suspend fun login(@Body request: LoginRequest): Response<LoginResponse>
    
    @POST("auth/logout")
    suspend fun logout(): Response<ApiResponse>
    
    @POST("auth/logout-all")
    suspend fun logoutAll(): Response<ApiResponse>
    
    @GET("auth/me")
    suspend fun getCurrentUser(): Response<User>
    
    @POST("auth/refresh")
    suspend fun refreshToken(): Response<LoginResponse>
}

// data/repository/AuthRepository.kt

class AuthRepository(
    private val apiService: ApiService,
    private val securePreferences: SecurePreferences,
    private val deviceInfoProvider: DeviceInfoProvider
) {
    
    suspend fun login(username: String, password: String): Result<LoginResponse> {
        return try {
            val deviceFingerprint = deviceInfoProvider.getDeviceFingerprint()
            val request = LoginRequest(username, password, deviceFingerprint)
            
            val response = apiService.login(request)
            
            if (response.isSuccessful) {
                val body = response.body()
                
                // If 2FA not required, save token
                if (body?.token != null) {
                    securePreferences.saveAuthToken(body.token)
                    securePreferences.saveUserId(body.user?.id ?: "")
                    securePreferences.saveUsername(body.user?.username ?: "")
                }
                
                Result.success(body!!)
            } else {
                val errorBody = response.errorBody()?.string()
                Result.failure(Exception(errorBody ?: "Login failed"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
    
    fun isLoggedIn(): Boolean {
        return securePreferences.getAuthToken() != null
    }
    
    suspend fun logout() {
        try {
            apiService.logout()
        } catch (e: Exception) {
            // Log error but continue with local logout
        }
        
        securePreferences.clearAll()
    }
}
```

### 3. Secure Token Storage

```kotlin
// data/local/SecurePreferences.kt

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class SecurePreferences(context: Context) {
    
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()
    
    private val sharedPreferences = EncryptedSharedPreferences.create(
        context,
        "secure_prefs",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )
    
    fun saveAuthToken(token: String) {
        sharedPreferences.edit().putString(Constants.PREF_AUTH_TOKEN, token).apply()
    }
    
    fun getAuthToken(): String? {
        return sharedPreferences.getString(Constants.PREF_AUTH_TOKEN, null)
    }
    
    fun saveUserId(userId: String) {
        sharedPreferences.edit().putString(Constants.PREF_USER_ID, userId).apply()
    }
    
    fun getUserId(): String? {
        return sharedPreferences.getString(Constants.PREF_USER_ID, null)
    }
    
    fun saveUsername(username: String) {
        sharedPreferences.edit().putString(Constants.PREF_USERNAME, username).apply()
    }
    
    fun getUsername(): String? {
        return sharedPreferences.getString(Constants.PREF_USERNAME, null)
    }
    
    fun saveDeviceFingerprint(fingerprint: String) {
        sharedPreferences.edit().putString(Constants.PREF_DEVICE_FINGERPRINT, fingerprint).apply()
    }
    
    fun getDeviceFingerprint(): String? {
        return sharedPreferences.getString(Constants.PREF_DEVICE_FINGERPRINT, null)
    }
    
    fun clearAll() {
        sharedPreferences.edit().clear().apply()
    }
}
```

### 4. Device Fingerprint Generation

```kotlin
// data/local/DeviceInfoProvider.kt

import android.annotation.SuppressLint
import android.content.Context
import android.os.Build
import android.provider.Settings
import java.security.MessageDigest
import java.util.UUID

class DeviceInfoProvider(private val context: Context) {
    
    @SuppressLint("HardwareIds")
    fun getDeviceFingerprint(): String {
        val securePrefs = SecurePreferences(context)
        
        // Check if already generated
        securePrefs.getDeviceFingerprint()?.let {
            return it
        }
        
        // Generate new fingerprint
        val androidId = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ANDROID_ID
        ) ?: "unknown"
        
        val deviceModel = Build.MODEL
        val deviceManufacturer = Build.MANUFACTURER
        
        // Create unique identifier
        val uniqueString = "$androidId-$deviceManufacturer-$deviceModel"
        val fingerprint = "android-${uniqueString.hashCode().toString(16)}"
        
        // Save for future use
        securePrefs.saveDeviceFingerprint(fingerprint)
        
        return fingerprint
    }
    
    fun getDeviceInfo(): DeviceInfo {
        return DeviceInfo(
            deviceName = "${Build.MANUFACTURER} ${Build.MODEL}",
            androidVersion = Build.VERSION.RELEASE,
            appVersion = getAppVersion(),
            deviceId = getDeviceFingerprint()
        )
    }
    
    private fun getAppVersion(): String {
        return try {
            val pInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            pInfo.versionName ?: "1.0.0"
        } catch (e: Exception) {
            "1.0.0"
        }
    }
}

data class DeviceInfo(
    val deviceName: String,
    val androidVersion: String,
    val appVersion: String,
    val deviceId: String
)
```

---

## 📡 API Endpoints Reference

### Authentication Endpoints

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/api/auth/login` | ❌ | User login (username/password) |
| POST | `/api/auth/logout` | ✅ | Logout current session |
| POST | `/api/auth/logout-all` | ✅ | Logout all sessions for user |
| GET | `/api/auth/me` | ✅ | Get current user info |
| POST | `/api/auth/refresh` | ✅ | Refresh JWT token |
| POST | `/api/auth/2fa/verify` | ❌ | Verify 2FA code after login |
| GET | `/api/auth/2fa/status` | ✅ | Check if 2FA is enabled |
| POST | `/api/auth/2fa/setup` | ✅ | Initialize 2FA setup |
| POST | `/api/auth/2fa/enable` | ✅ | Enable 2FA with verified code |
| POST | `/api/auth/2fa/disable` | ✅ | Disable 2FA (requires password) |

### Device Endpoints

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| GET | `/api/devices` | ✅ | List all devices |
| GET | `/api/devices/:id` | ✅ | Get device details |
| PUT | `/api/devices/:id` | ✅ | Update device info |
| DELETE | `/api/devices/:id` | ✅ (Admin) | Delete device |

### File Endpoints

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/api/files/audio` | ✅ | Upload audio file |
| POST | `/api/files/text` | ✅ | Upload text file |
| GET | `/api/files` | ✅ | List all files |
| GET | `/api/files/audio/:id` | ✅ | Download audio file |
| GET | `/api/files/text/:id` | ✅ | Download text file |
| DELETE | `/api/files/audio/:id` | ✅ | Delete audio file |
| DELETE | `/api/files/text/:id` | ✅ | Delete text file |

### Statistics Endpoints

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| GET | `/api/stats/dashboard` | ✅ | Get dashboard statistics |
| GET | `/api/stats/activity` | ✅ | Get recent activity logs |

### Settings Endpoints

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| GET | `/api/settings` | ✅ | Get user settings |
| PUT | `/api/settings` | ✅ | Update user settings |
| GET | `/api/settings/preferences` | ✅ | Get user file preferences |
| PUT | `/api/settings/preferences` | ✅ | Update file preferences |

### Health Check

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| GET | `/api/health` | ❌ | Server health check |

---

## 🔌 Socket.IO Real-Time Communication

### Connection Setup

```kotlin
// data/api/SocketManager.kt

import io.socket.client.IO
import io.socket.client.Socket
import io.socket.emitter.Emitter
import org.json.JSONObject
import java.net.URISyntaxException

class SocketManager(
    private val securePreferences: SecurePreferences,
    private val deviceInfoProvider: DeviceInfoProvider
) {
    
    private var socket: Socket? = null
    private val listeners = mutableListOf<SocketListener>()
    
    fun connect() {
        try {
            val opts = IO.Options().apply {
                transports = arrayOf("websocket")
                reconnection = true
                reconnectionAttempts = Int.MAX_VALUE
                reconnectionDelay = 1000
                reconnectionDelayMax = 5000
            }
            
            socket = IO.socket(Constants.SOCKET_URL, opts)
            
            setupListeners()
            socket?.connect()
            
        } catch (e: URISyntaxException) {
            e.printStackTrace()
        }
    }
    
    private fun setupListeners() {
        socket?.on(Socket.EVENT_CONNECT) {
            Log.d("Socket", "Connected")
            
            // Send device info
            sendDeviceInfo()
            
            // Identify with auth token if available
            securePreferences.getAuthToken()?.let { token ->
                identifyUser(token)
            }
            
            notifyListeners { it.onConnected() }
        }
        
        socket?.on(Socket.EVENT_DISCONNECT) {
            Log.d("Socket", "Disconnected")
            notifyListeners { it.onDisconnected() }
        }
        
        socket?.on(Socket.EVENT_CONNECT_ERROR) { args ->
            Log.e("Socket", "Connection error: ${args.firstOrNull()}")
            notifyListeners { it.onError(args.firstOrNull() as? Throwable) }
        }
        
        // Device list updates
        socket?.on("devices:list") { args ->
            val data = args.firstOrNull() as? JSONObject
            notifyListeners { it.onDeviceListUpdate(data) }
        }
        
        // Device status changes
        socket?.on("device:status") { args ->
            val data = args.firstOrNull() as? JSONObject
            notifyListeners { it.onDeviceStatusChange(data) }
        }
        
        // Session kicked (logout all)
        socket?.on("session:kicked") { args ->
            notifyListeners { it.onSessionKicked() }
        }
    }
    
    fun sendDeviceInfo() {
        val deviceInfo = deviceInfoProvider.getDeviceInfo()
        val data = JSONObject().apply {
            put("androidVersion", deviceInfo.androidVersion)
            put("appVersion", deviceInfo.appVersion)
            put("deviceName", deviceInfo.deviceName)
        }
        socket?.emit("device:info", data)
    }
    
    fun identifyUser(token: String) {
        val data = JSONObject().apply {
            put("token", token)
        }
        socket?.emit("auth:identify", data)
    }
    
    fun sendHeartbeat() {
        socket?.emit("device:heartbeat")
    }
    
    fun disconnect() {
        socket?.disconnect()
        socket?.off()
    }
    
    fun addListener(listener: SocketListener) {
        listeners.add(listener)
    }
    
    fun removeListener(listener: SocketListener) {
        listeners.remove(listener)
    }
    
    private fun notifyListeners(action: (SocketListener) -> Unit) {
        listeners.forEach { action(it) }
    }
    
    interface SocketListener {
        fun onConnected()
        fun onDisconnected()
        fun onError(error: Throwable?)
        fun onDeviceListUpdate(data: JSONObject?)
        fun onDeviceStatusChange(data: JSONObject?)
        fun onSessionKicked()
    }
}
```

### Heartbeat Service

```kotlin
// services/HeartbeatService.kt

import android.app.Service
import android.content.Intent
import android.os.IBinder
import kotlinx.coroutines.*

class HeartbeatService : Service() {
    
    private val serviceScope = CoroutineScope(Dispatchers.Default + Job())
    private lateinit var socketManager: SocketManager
    
    override fun onCreate() {
        super.onCreate()
        socketManager = SocketManager(
            SecurePreferences(this),
            DeviceInfoProvider(this)
        )
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        socketManager.connect()
        
        // Send heartbeat every 30 seconds
        serviceScope.launch {
            while (isActive) {
                socketManager.sendHeartbeat()
                delay(30_000) // 30 seconds
            }
        }
        
        return START_STICKY
    }
    
    override fun onDestroy() {
        super.onDestroy()
        socketManager.disconnect()
        serviceScope.cancel()
    }
    
    override fun onBind(intent: Intent?): IBinder? = null
}
```

### Socket.IO Events

#### Client → Server Events

| Event | Data | Description |
|-------|------|-------------|
| `device:info` | `{ androidVersion, appVersion, deviceName }` | Send device info on connect |
| `device:heartbeat` | (none) | Keep-alive ping |
| `auth:identify` | `{ token }` | Identify user after login |

#### Server → Client Events

| Event | Data | Description |
|-------|------|-------------|
| `devices:list` | `Device[]` | Updated list of online devices |
| `device:status` | `{ deviceId, isOnline, lastSeen }` | Device status changed |
| `session:kicked` | (none) | User was logged out (logout-all) |

---

## 📤 File Upload/Download Implementation

### 1. Audio File Upload

**Endpoint:** `POST /api/files/audio`  
**Content-Type:** `multipart/form-data`

```kotlin
// data/api/ApiService.kt

import okhttp3.MultipartBody
import okhttp3.RequestBody

interface ApiService {
    
    @Multipart
    @POST("files/audio")
    suspend fun uploadAudio(
        @Part file: MultipartBody.Part,
        @Part("deviceId") deviceId: RequestBody? = null,
        @Part("deleteAfterDays") deleteAfterDays: RequestBody? = null
    ): Response<FileUploadResponse>
    
    @Multipart
    @POST("files/text")
    suspend fun uploadText(
        @Part file: MultipartBody.Part,
        @Part("deviceId") deviceId: RequestBody? = null,
        @Part("deleteAfterDays") deleteAfterDays: RequestBody? = null
    ): Response<FileUploadResponse>
    
    @GET("files/audio/{id}")
    @Streaming
    suspend fun downloadAudio(@Path("id") fileId: String): Response<ResponseBody>
    
    @GET("files/text/{id}")
    @Streaming
    suspend fun downloadText(@Path("id") fileId: String): Response<ResponseBody>
}

// data/models/FileModels.kt

data class FileUploadResponse(
    val success: Boolean,
    val file: FileMetadata
)

data class FileMetadata(
    val id: String,
    val filename: String,
    val originalName: String,
    val fileSize: Int,
    val mimeType: String,
    val deviceId: String?,
    val uploadedById: String,
    val uploadedAt: String,
    val deleteAfterDays: Int?,
    val scheduledDeleteAt: String?
)

// data/repository/FileRepository.kt

class FileRepository(
    private val apiService: ApiService,
    private val deviceInfoProvider: DeviceInfoProvider
) {
    
    suspend fun uploadAudioFile(
        file: File,
        deleteAfterDays: Int? = null
    ): Result<FileUploadResponse> {
        return try {
            val requestFile = file.asRequestBody("audio/*".toMediaTypeOrNull())
            val filePart = MultipartBody.Part.createFormData(
                "file",
                file.name,
                requestFile
            )
            
            val deviceId = deviceInfoProvider.getDeviceFingerprint()
            val deviceIdBody = deviceId.toRequestBody("text/plain".toMediaTypeOrNull())
            
            val deleteBody = deleteAfterDays?.let {
                it.toString().toRequestBody("text/plain".toMediaTypeOrNull())
            }
            
            val response = apiService.uploadAudio(filePart, deviceIdBody, deleteBody)
            
            if (response.isSuccessful) {
                Result.success(response.body()!!)
            } else {
                Result.failure(Exception(response.errorBody()?.string() ?: "Upload failed"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
    
    suspend fun downloadAudioFile(fileId: String, outputFile: File): Result<File> {
        return withContext(Dispatchers.IO) {
            try {
                val response = apiService.downloadAudio(fileId)
                
                if (response.isSuccessful) {
                    response.body()?.let { body ->
                        val inputStream = body.byteStream()
                        val outputStream = FileOutputStream(outputFile)
                        
                        inputStream.use { input ->
                            outputStream.use { output ->
                                input.copyTo(output)
                            }
                        }
                        
                        Result.success(outputFile)
                    } ?: Result.failure(Exception("Empty response body"))
                } else {
                    Result.failure(Exception("Download failed: ${response.code()}"))
                }
            } catch (e: Exception) {
                Result.failure(e)
            }
        }
    }
}
```

### 2. File Upload with Progress

```kotlin
// utils/FileUtils.kt

import okhttp3.MediaType
import okhttp3.RequestBody
import okio.BufferedSink
import java.io.File
import java.io.FileInputStream

class ProgressRequestBody(
    private val file: File,
    private val contentType: MediaType?,
    private val listener: UploadProgressListener
) : RequestBody() {
    
    override fun contentType() = contentType
    
    override fun contentLength() = file.length()
    
    override fun writeTo(sink: BufferedSink) {
        val fileLength = file.length()
        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
        val inputStream = FileInputStream(file)
        var uploaded = 0L
        
        inputStream.use { input ->
            var read: Int
            while (input.read(buffer).also { read = it } != -1) {
                uploaded += read
                sink.write(buffer, 0, read)
                
                val progress = (100 * uploaded / fileLength).toInt()
                listener.onProgress(progress)
            }
        }
    }
    
    interface UploadProgressListener {
        fun onProgress(progress: Int)
    }
    
    companion object {
        private const val DEFAULT_BUFFER_SIZE = 2048
    }
}
```

### 3. Supported File Types

**Audio Files:**
- `.wav` - audio/wav, audio/x-wav
- `.mp3` - audio/mpeg, audio/mp3
- `.ogg` - audio/ogg
- `.webm` - audio/webm
- `.m4a` - audio/x-m4a
- `.aac` - audio/aac
- `.flac` - audio/flac

**Text Files:**
- `.txt` - text/plain
- `.log` - text/plain
- `.json` - application/json
- `.csv` - text/csv
- `.xml` - application/xml, text/xml

**File Size Limit:** 50 MB

---

## 🔐 2FA/TOTP Implementation

### 2FA Setup Flow

1. **Check if 2FA is enabled** - `GET /api/auth/2fa/status`
2. **Initialize setup** - `POST /api/auth/2fa/setup` → Returns QR code URL
3. **Display QR code** - User scans with authenticator app
4. **Verify code** - `POST /api/auth/2fa/enable` with verification code
5. **Save backup codes** - Display 10 backup codes for user to save

### Kotlin Implementation

```kotlin
// data/models/TwoFactorModels.kt

data class TwoFactorStatus(
    val totpEnabled: Boolean
)

data class TwoFactorSetupResponse(
    val secret: String,
    val qrCodeUrl: String,
    val backupCodes: List<String>
)

data class TwoFactorVerifyRequest(
    val code: String,
    val deviceFingerprint: String? = null
)

data class TwoFactorEnableRequest(
    val code: String
)

// data/api/ApiService.kt (add these)

interface ApiService {
    
    @GET("auth/2fa/status")
    suspend fun get2FAStatus(): Response<TwoFactorStatus>
    
    @POST("auth/2fa/setup")
    suspend fun setup2FA(): Response<TwoFactorSetupResponse>
    
    @POST("auth/2fa/enable")
    suspend fun enable2FA(@Body request: TwoFactorEnableRequest): Response<ApiResponse>
    
    @POST("auth/2fa/disable")
    suspend fun disable2FA(@Body request: Map<String, String>): Response<ApiResponse>
    
    @POST("auth/2fa/verify")
    suspend fun verify2FA(@Body request: TwoFactorVerifyRequest): Response<LoginResponse>
    
    @POST("auth/2fa/regenerate-backup-codes")
    suspend fun regenerateBackupCodes(@Body request: Map<String, String>): Response<TwoFactorSetupResponse>
}

// ui/TwoFactorSetupActivity.kt

class TwoFactorSetupViewModel(
    private val authRepository: AuthRepository
) : ViewModel() {
    
    private val _setupState = MutableLiveData<SetupState>()
    val setupState: LiveData<SetupState> = _setupState
    
    fun initiate2FASetup() {
        viewModelScope.launch {
            _setupState.value = SetupState.Loading
            
            val result = authRepository.setup2FA()
            
            _setupState.value = when {
                result.isSuccess -> {
                    val response = result.getOrNull()!!
                    SetupState.Success(response.qrCodeUrl, response.backupCodes)
                }
                else -> SetupState.Error(result.exceptionOrNull()?.message ?: "Setup failed")
            }
        }
    }
    
    fun verifyAndEnable(code: String) {
        viewModelScope.launch {
            _setupState.value = SetupState.Verifying
            
            val result = authRepository.enable2FA(code)
            
            _setupState.value = when {
                result.isSuccess -> SetupState.Enabled
                else -> SetupState.Error(result.exceptionOrNull()?.message ?: "Verification failed")
            }
        }
    }
    
    sealed class SetupState {
        object Loading : SetupState()
        data class Success(val qrCodeUrl: String, val backupCodes: List<String>) : SetupState()
        object Verifying : SetupState()
        object Enabled : SetupState()
        data class Error(val message: String) : SetupState()
    }
}
```

### Display QR Code

```kotlin
// Use Coil library to load QR code image

@Composable
fun QRCodeDisplay(qrCodeUrl: String) {
    AsyncImage(
        model = qrCodeUrl,
        contentDescription = "2FA QR Code",
        modifier = Modifier.size(256.dp)
    )
}
```

### Login with 2FA

```kotlin
// ui/LoginActivity.kt

class LoginViewModel(
    private val authRepository: AuthRepository
) : ViewModel() {
    
    fun login(username: String, password: String) {
        viewModelScope.launch {
            val result = authRepository.login(username, password)
            
            when {
                result.isSuccess -> {
                    val response = result.getOrNull()!!
                    
                    if (response.requires2FA == true) {
                        // Navigate to 2FA verification screen
                        _loginState.value = LoginState.Requires2FA(response.userId!!)
                    } else {
                        // Login successful
                        _loginState.value = LoginState.Success(response.user!!)
                    }
                }
                else -> {
                    _loginState.value = LoginState.Error(
                        result.exceptionOrNull()?.message ?: "Login failed"
                    )
                }
            }
        }
    }
    
    fun verify2FA(userId: String, code: String, useBackupCode: Boolean = false) {
        viewModelScope.launch {
            val deviceFingerprint = deviceInfoProvider.getDeviceFingerprint()
            val result = authRepository.verify2FA(userId, code, deviceFingerprint)
            
            when {
                result.isSuccess -> {
                    val response = result.getOrNull()!!
                    // Save token and user info
                    _loginState.value = LoginState.Success(response.user!!)
                }
                else -> {
                    _loginState.value = LoginState.Error("Invalid verification code")
                }
            }
        }
    }
}
```

---

## 📊 Data Models

### Complete Data Classes

```kotlin
// data/models/Models.kt

// User
data class User(
    val id: String,
    val username: String,
    val email: String,
    val fullName: String?,
    val role: String, // "admin", "user", "viewer"
    val roleId: String,
    val isActive: Boolean,
    val lastLogin: String?,
    val createdAt: String,
    val updatedAt: String,
    val totpEnabled: Boolean = false
)

// Device
data class Device(
    val id: String,
    val deviceName: String,
    val deviceId: String,
    val ipAddress: String?,
    val macAddress: String?,
    val androidVersion: String?,
    val appVersion: String?,
    val isOnline: Boolean,
    val lastSeen: String,
    val registeredAt: String,
    val updatedAt: String
)

// Audio File
data class AudioFile(
    val id: String,
    val filename: String,
    val originalName: String,
    val fileSize: Int,
    val mimeType: String,
    val duration: Float?,
    val sampleRate: Int?,
    val channels: Int?,
    val bitrate: Int?,
    val deviceId: String?,
    val uploadedById: String,
    val deleteAfterDays: Int?,
    val scheduledDeleteAt: String?,
    val uploadedAt: String,
    val updatedAt: String
)

// Text File
data class TextFile(
    val id: String,
    val filename: String,
    val originalName: String,
    val fileSize: Int,
    val mimeType: String,
    val encoding: String,
    val lineCount: Int?,
    val wordCount: Int?,
    val deviceId: String?,
    val uploadedById: String,
    val deleteAfterDays: Int?,
    val scheduledDeleteAt: String?,
    val uploadedAt: String,
    val updatedAt: String
)

// Dashboard Statistics
data class DashboardStats(
    val devices: DeviceStats,
    val files: FileStats,
    val storage: StorageStats,
    val users: UserStats,
    val recentActivity: List<ActivityLog>
)

data class DeviceStats(
    val total: Int,
    val online: Int,
    val offline: Int
)

data class FileStats(
    val audio: Int,
    val text: Int,
    val total: Int,
    val uploadedToday: Int
)

data class StorageStats(
    val total: Long,
    val audio: Long,
    val text: Long,
    val formatted: String
)

data class UserStats(
    val total: Int
)

data class ActivityLog(
    val id: String,
    val action: String,
    val resource: String,
    val user: String,
    val userFullName: String?,
    val timestamp: String,
    val success: Boolean,
    val details: Map<String, Any>?
)

// Generic API Response
data class ApiResponse(
    val success: Boolean? = null,
    val message: String? = null,
    val error: String? = null
)

// User Settings
data class UserSettings(
    val defaultDeleteAfterDays: Int?,
    val theme: String,
    val language: String,
    val timezone: String?,
    val autoDeleteDays: Int,
    val maxFileSize: Int,
    val allowedAudioFormats: List<String>,
    val allowedTextFormats: List<String>
)
```

---

## ⚠️ Error Handling

### HTTP Status Codes

| Code | Meaning | Action |
|------|---------|--------|
| 200 | Success | Process response |
| 201 | Created | File uploaded successfully |
| 400 | Bad Request | Check request parameters |
| 401 | Unauthorized | Token expired/invalid - redirect to login |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 429 | Too Many Requests | Rate limit exceeded - retry after delay |
| 500 | Server Error | Show error to user, retry |

### Error Response Format

```json
{
  "error": "Error message here"
}
```

### Error Handling Implementation

```kotlin
// data/api/ErrorHandler.kt

sealed class ApiError : Exception() {
    data class NetworkError(override val message: String) : ApiError()
    data class UnauthorizedError(override val message: String) : ApiError()
    data class ServerError(override val message: String) : ApiError()
    data class ValidationError(override val message: String) : ApiError()
    data class RateLimitError(override val message: String) : ApiError()
    data class UnknownError(override val message: String) : ApiError()
}

object ErrorHandler {
    
    fun handleError(response: Response<*>): ApiError {
        return when (response.code()) {
            400 -> ApiError.ValidationError(parseErrorMessage(response))
            401 -> ApiError.UnauthorizedError("Session expired. Please login again.")
            403 -> ApiError.UnauthorizedError("You don't have permission for this action.")
            404 -> ApiError.ValidationError("Resource not found.")
            429 -> ApiError.RateLimitError("Too many requests. Please try again later.")
            in 500..599 -> ApiError.ServerError("Server error. Please try again.")
            else -> ApiError.UnknownError("An unexpected error occurred.")
        }
    }
    
    private fun parseErrorMessage(response: Response<*>): String {
        return try {
            val errorBody = response.errorBody()?.string()
            val json = JSONObject(errorBody ?: "{}")
            json.optString("error", "An error occurred")
        } catch (e: Exception) {
            "An error occurred"
        }
    }
}

// Usage in Repository

suspend fun <T> safeApiCall(apiCall: suspend () -> Response<T>): Result<T> {
    return try {
        val response = apiCall()
        
        if (response.isSuccessful) {
            Result.success(response.body()!!)
        } else {
            Result.failure(ErrorHandler.handleError(response))
        }
    } catch (e: IOException) {
        Result.failure(ApiError.NetworkError("Network error. Check your connection."))
    } catch (e: Exception) {
        Result.failure(ApiError.UnknownError(e.message ?: "Unknown error"))
    }
}
```

---

## 🔒 Security Best Practices

### 1. Token Management

```kotlin
// Always add Authorization header for authenticated requests

class AuthInterceptor(
    private val securePreferences: SecurePreferences
) : Interceptor {
    
    override fun intercept(chain: Interceptor.Chain): okhttp3.Response {
        val originalRequest = chain.request()
        
        val token = securePreferences.getAuthToken()
        
        val newRequest = if (token != null) {
            originalRequest.newBuilder()
                .addHeader("Authorization", "Bearer $token")
                .build()
        } else {
            originalRequest
        }
        
        val response = chain.proceed(newRequest)
        
        // Handle 401 Unauthorized
        if (response.code == 401) {
            // Clear token and redirect to login
            securePreferences.clearAll()
            // Trigger logout event
        }
        
        return response
    }
}
```

### 2. Certificate Pinning (Optional for Production)

```kotlin
// For HTTPS connections with self-signed certificates

val certificatePinner = CertificatePinner.Builder()
    .add("192.168.1.100", "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
    .build()

val okHttpClient = OkHttpClient.Builder()
    .certificatePinner(certificatePinner)
    .build()
```

### 3. Secure File Storage

```kotlin
// Save downloaded files in app-private directory

fun getSecureFileDirectory(context: Context): File {
    val dir = File(context.filesDir, "secure_files")
    if (!dir.exists()) {
        dir.mkdirs()
    }
    return dir
}
```

### 4. Input Validation

```kotlin
// Validate before sending to server

fun validateLogin(username: String, password: String): ValidationResult {
    return when {
        username.isBlank() -> ValidationResult.Error("Username is required")
        password.isBlank() -> ValidationResult.Error("Password is required")
        password.length < 6 -> ValidationResult.Error("Password must be at least 6 characters")
        else -> ValidationResult.Success
    }
}

sealed class ValidationResult {
    object Success : ValidationResult()
    data class Error(val message: String) : ValidationResult()
}
```

---

## 💻 Code Examples

### Complete Retrofit Setup

```kotlin
// data/api/RetrofitClient.kt

object RetrofitClient {
    
    private fun createOkHttpClient(
        securePreferences: SecurePreferences
    ): OkHttpClient {
        val loggingInterceptor = HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG) {
                HttpLoggingInterceptor.Level.BODY
            } else {
                HttpLoggingInterceptor.Level.NONE
            }
        }
        
        return OkHttpClient.Builder()
            .addInterceptor(AuthInterceptor(securePreferences))
            .addInterceptor(loggingInterceptor)
            .connectTimeout(Constants.CONNECT_TIMEOUT, TimeUnit.SECONDS)
            .readTimeout(Constants.READ_TIMEOUT, TimeUnit.SECONDS)
            .writeTimeout(Constants.WRITE_TIMEOUT, TimeUnit.SECONDS)
            .build()
    }
    
    fun createApiService(securePreferences: SecurePreferences): ApiService {
        val okHttpClient = createOkHttpClient(securePreferences)
        
        val retrofit = Retrofit.Builder()
            .baseUrl(Constants.API_BASE_URL)
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
        
        return retrofit.create(ApiService::class.java)
    }
}
```

### Complete Login Activity Example

```kotlin
// ui/LoginActivity.kt

class LoginActivity : AppCompatActivity() {
    
    private lateinit var viewModel: LoginViewModel
    private lateinit var binding: ActivityLoginBinding
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)
        
        setupViewModel()
        setupObservers()
        setupListeners()
    }
    
    private fun setupViewModel() {
        val securePreferences = SecurePreferences(this)
        val deviceInfoProvider = DeviceInfoProvider(this)
        val apiService = RetrofitClient.createApiService(securePreferences)
        val authRepository = AuthRepository(apiService, securePreferences, deviceInfoProvider)
        
        viewModel = ViewModelProvider(
            this,
            LoginViewModelFactory(authRepository, deviceInfoProvider)
        )[LoginViewModel::class.java]
    }
    
    private fun setupObservers() {
        viewModel.loginState.observe(this) { state ->
            when (state) {
                is LoginState.Loading -> showLoading()
                is LoginState.Success -> navigateToDashboard(state.user)
                is LoginState.Requires2FA -> navigateTo2FAVerification(state.userId)
                is LoginState.Error -> showError(state.message)
            }
        }
    }
    
    private fun setupListeners() {
        binding.btnLogin.setOnClickListener {
            val username = binding.etUsername.text.toString()
            val password = binding.etPassword.text.toString()
            
            val validation = validateLogin(username, password)
            if (validation is ValidationResult.Success) {
                viewModel.login(username, password)
            } else {
                showError((validation as ValidationResult.Error).message)
            }
        }
    }
    
    private fun navigateToDashboard(user: User) {
        startActivity(Intent(this, DashboardActivity::class.java))
        finish()
    }
    
    private fun navigateTo2FAVerification(userId: String) {
        val intent = Intent(this, TwoFactorVerifyActivity::class.java)
        intent.putExtra("USER_ID", userId)
        startActivity(intent)
    }
}
```

### File Upload with Progress Example

```kotlin
// ui/UploadActivity.kt

class UploadViewModel(
    private val fileRepository: FileRepository
) : ViewModel() {
    
    private val _uploadState = MutableLiveData<UploadState>()
    val uploadState: LiveData<UploadState> = _uploadState
    
    fun uploadAudioFile(file: File, deleteAfterDays: Int? = null) {
        viewModelScope.launch {
            _uploadState.value = UploadState.Uploading(0)
            
            // Create progress callback
            val progressListener = object : ProgressRequestBody.UploadProgressListener {
                override fun onProgress(progress: Int) {
                    _uploadState.postValue(UploadState.Uploading(progress))
                }
            }
            
            val result = fileRepository.uploadAudioFileWithProgress(
                file,
                deleteAfterDays,
                progressListener
            )
            
            _uploadState.value = when {
                result.isSuccess -> UploadState.Success(result.getOrNull()!!)
                else -> UploadState.Error(result.exceptionOrNull()?.message ?: "Upload failed")
            }
        }
    }
    
    sealed class UploadState {
        data class Uploading(val progress: Int) : UploadState()
        data class Success(val response: FileUploadResponse) : UploadState()
        data class Error(val message: String) : UploadState()
    }
}
```

---

## 📝 Implementation Checklist

### Phase 1: Basic Setup
- [ ] Add required dependencies to `build.gradle`
- [ ] Add permissions to `AndroidManifest.xml`
- [ ] Create project structure (data, ui, utils packages)
- [ ] Set up Retrofit with base URL
- [ ] Implement `SecurePreferences` for token storage
- [ ] Implement `DeviceInfoProvider` for fingerprint generation

### Phase 2: Authentication
- [ ] Create login screen UI
- [ ] Implement login API call
- [ ] Handle JWT token storage
- [ ] Implement AuthInterceptor for token injection
- [ ] Handle 401 unauthorized errors
- [ ] Implement logout functionality

### Phase 3: Socket.IO Connection
- [ ] Set up Socket.IO client
- [ ] Implement connection manager
- [ ] Handle connect/disconnect events
- [ ] Send device info on connect
- [ ] Implement heartbeat mechanism
- [ ] Create foreground service for persistent connection

### Phase 4: File Operations
- [ ] Implement file picker
- [ ] Create file upload API call
- [ ] Add upload progress tracking
- [ ] Implement file download
- [ ] Handle file encryption (server-side)
- [ ] Display uploaded files list

### Phase 5: 2FA Implementation
- [ ] Check 2FA status on login
- [ ] Implement 2FA setup flow
- [ ] Display QR code for authenticator app
- [ ] Verify TOTP code
- [ ] Display and save backup codes
- [ ] Implement 2FA verification on login
- [ ] Handle trusted device mechanism

### Phase 6: Dashboard & Monitoring
- [ ] Create dashboard screen
- [ ] Fetch and display statistics
- [ ] Show device online/offline status
- [ ] Display recent activity logs
- [ ] Handle real-time updates via Socket.IO

### Phase 7: Settings & Preferences
- [ ] Implement user settings screen
- [ ] Configure default auto-delete days
- [ ] Display user profile information
- [ ] Toggle 2FA enable/disable
- [ ] Update user preferences via API

### Phase 8: Testing & Polish
- [ ] Test all API endpoints
- [ ] Test Socket.IO connection stability
- [ ] Test file upload/download with various sizes
- [ ] Test 2FA flow end-to-end
- [ ] Handle edge cases and errors gracefully
- [ ] Add loading states and error messages
- [ ] Test on different Android versions
- [ ] Optimize battery usage for background service

---

## 🌟 Advanced Features (Optional)

### Background File Sync

```kotlin
// Use WorkManager for reliable background uploads

class FileUploadWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {
    
    override suspend fun doWork(): Result {
        val filePath = inputData.getString("FILE_PATH") ?: return Result.failure()
        val file = File(filePath)
        
        if (!file.exists()) return Result.failure()
        
        val repository = FileRepository(...)
        val result = repository.uploadAudioFile(file)
        
        return if (result.isSuccess) {
            Result.success()
        } else {
            Result.retry()
        }
    }
}

// Schedule upload
val uploadWorkRequest = OneTimeWorkRequestBuilder<FileUploadWorker>()
    .setInputData(workDataOf("FILE_PATH" to file.absolutePath))
    .setConstraints(
        Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()
    )
    .build()

WorkManager.getInstance(context).enqueue(uploadWorkRequest)
```

### Offline Mode Support

```kotlin
// Cache API responses using Room database

@Entity(tableName = "cached_files")
data class CachedFile(
    @PrimaryKey val id: String,
    val filename: String,
    val localPath: String?,
    val synced: Boolean,
    val uploadedAt: Long
)

@Dao
interface CachedFileDao {
    @Query("SELECT * FROM cached_files WHERE synced = 0")
    suspend fun getUnsyncedFiles(): List<CachedFile>
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertFile(file: CachedFile)
    
    @Query("UPDATE cached_files SET synced = 1 WHERE id = :fileId")
    suspend fun markAsSynced(fileId: String)
}
```

### Push Notifications

```kotlin
// Handle session kicked event

class SocketManager {
    // ... existing code ...
    
    socket?.on("session:kicked") {
        // Show notification
        showLogoutNotification()
        
        // Clear session
        securePreferences.clearAll()
        
        // Navigate to login
        sendBroadcast(Intent(ACTION_SESSION_KICKED))
    }
    
    private fun showLogoutNotification() {
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Session Ended")
            .setContentText("You have been logged out from all devices")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()
        
        notificationManager.notify(LOGOUT_NOTIFICATION_ID, notification)
    }
}
```

---

## 📚 Additional Resources

### API Documentation
- **Swagger UI:** `http://192.168.1.69:3000/api-docs` (Replace with your server IP)
- View complete API documentation with request/response schemas
- Test endpoints directly in the browser

### Server Configuration
- **Default Port:** 3000
- **WebSocket Protocol:** Socket.IO (polling/websocket transport)
- **Max File Size:** 50 MB
- **Supported Audio Formats:** WAV, MP3, OGG, WebM, M4A, AAC, FLAC
- **Supported Text Formats:** TXT, LOG, JSON, CSV, XML

### Rate Limits
- **General API:** 100 requests per 15 minutes per IP
- **Authentication:** 5 attempts per 15 minutes per IP
- **File Upload:** 20 uploads per hour per IP

### Backend Features
- **Encryption:** AES-256-GCM (server-side)
- **Password Hashing:** bcrypt
- **JWT Expiration:** Configurable (default: 7 days)
- **Auto-delete:** Daily scheduler at 02:00 local time

---

## 🐛 Troubleshooting

### Connection Issues

**Problem:** Cannot connect to server  
**Solutions:**
1. Verify server is running: `curl http://192.168.1.69:3000/api/health`
2. Check if device is on same network as server
3. Ensure server IP is correct in `Constants.BASE_URL`
4. Check firewall rules on server

**Problem:** Socket.IO connection fails  
**Solutions:**
1. Check Socket.IO server is running
2. Verify WebSocket transport is enabled
3. Check network proxy settings
4. Enable logging to see connection errors

### Authentication Issues

**Problem:** Token expired or invalid  
**Solutions:**
1. Clear app data and login again
2. Check token is being sent in Authorization header
3. Verify token format: `Bearer <token>`
4. Check server logs for authentication errors

**Problem:** 2FA code not working  
**Solutions:**
1. Ensure device time is synchronized (TOTP requires accurate time)
2. Try using a backup code instead
3. Disable and re-enable 2FA if codes consistently fail
4. Check authenticator app is using correct secret

### File Upload Issues

**Problem:** Upload fails with 400 error  
**Solutions:**
1. Check file size (max 50 MB)
2. Verify file type is supported
3. Ensure multipart/form-data content type
4. Check device ID is valid

**Problem:** Upload progress not updating  
**Solutions:**
1. Ensure progress callback is implemented correctly
2. Check for UI thread blocking
3. Use coroutines or background thread for upload

---

## 📞 Support & Contact

For backend API issues or questions:
- Check server logs: `logs/combined-YYYY-MM-DD.log`
- Review audit logs: `logs/access-YYYY-MM-DD.log`
- Check error logs: `logs/error-YYYY-MM-DD.log`

---

**End of Android Kotlin Integration Guide**

This document provides everything needed to build a fully functional Android app that integrates with the UNV AI Report backend system. Follow the implementation checklist and refer to code examples for best practices.

**Version:** 1.0.0  
**Last Updated:** October 8, 2025  
**Compatible with Backend:** v0.1.0
