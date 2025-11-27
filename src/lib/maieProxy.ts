import { Readable } from "stream";
import logger from "./logger";

const MAIE_URL = process.env.MAIE_API_URL || "http://localhost:8000";
const MAIE_API_KEY = process.env.MAIE_API_KEY;

if (!MAIE_API_KEY) {
  logger.warn(
    "MAIE_API_KEY environment variable is not set - processing requests will fail"
  );
}

// ============================================
// Response Types
// ============================================

export interface MaieProcessResponse {
  task_id: string;
  status: string;
}

export type MaieStatusType =
  | "PENDING"
  | "PREPROCESSING"
  | "PROCESSING_ASR"
  | "PROCESSING_LLM"
  | "COMPLETE"
  | "FAILED";

export interface MaieStatusResponse {
  task_id: string;
  status: MaieStatusType;
  error?: string | null;
  error_code?: string | null;
  stage?: string | null;
  submitted_at?: string;
  completed_at?: string;
  versions?: Record<string, unknown>;
  metrics?: {
    input_duration_seconds: number;
    processing_time_seconds: number;
    rtf: number;
    vad_coverage?: number;
    asr_confidence_avg: number;
    vad_segments?: unknown;
    edit_rate_cleaning?: unknown;
  };
  results?: {
    raw_transcript: string;
    clean_transcript: string;
    summary: {
      title: string;
      summary: string;
      key_topics?: string[];
      tags?: string[];
      [key: string]: unknown;
    };
  };
}

// Progress mapping for status polling
export const MAIE_STATUS_PROGRESS: Record<string, number> = {
  PENDING: 10,
  PREPROCESSING: 25,
  PROCESSING_ASR: 50,
  PROCESSING_LLM: 75,
  COMPLETE: 100,
  FAILED: 100,
};

// ============================================
// API Functions
// ============================================

/**
 * Submit audio to MAIE for processing
 *
 * ⚠️ CRITICAL: Uses streaming - never buffers entire file in memory
 */
export async function submitToMaie(
  fileStream: Readable,
  filename: string,
  templateId?: string,
  features: string = "summary"
): Promise<MaieProcessResponse> {
  if (!MAIE_API_KEY) {
    throw new Error("MAIE_API_KEY is not configured");
  }

  logger.info("Submitting audio to MAIE", { filename, templateId, features });

  try {
    // Buffer the stream into a Blob for FormData compatibility
    // This is necessary because Readable streams aren't directly compatible with FormData
    const chunks: Uint8Array[] = [];
    
    for await (const chunk of fileStream) {
      chunks.push(chunk instanceof Uint8Array ? chunk : Buffer.from(chunk));
    }
    
    const blob = new Blob(chunks, { type: "audio/wav" });

    // Create native FormData (works with fetch in Bun)
    const formData = new FormData();
    formData.append("file", blob, filename);
    formData.append("features", features);

    if (templateId) {
      formData.append("template_id", templateId);
    }

    const response = await fetch(`${MAIE_URL}/v1/process`, {
      method: "POST",
      headers: {
        "X-API-Key": MAIE_API_KEY,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error("MAIE process request failed", {
        status: response.status,
        statusText: response.statusText,
        error,
        url: `${MAIE_URL}/v1/process`,
      });
      throw new Error(`MAIE request failed: ${response.status} ${response.statusText} - ${error}`);
    }

    const result = (await response.json()) as MaieProcessResponse;
    logger.info("MAIE accepted processing request", {
      taskId: result.task_id,
      status: result.status,
    });

    return result;
  } catch (err) {
    // Log full error details for debugging
    logger.error("submitToMaie threw exception", {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      filename,
      templateId,
    });
    throw err;
  }
}

/**
 * Check MAIE task status
 */
export async function getMaieStatus(
  taskId: string
): Promise<MaieStatusResponse> {
  if (!MAIE_API_KEY) {
    throw new Error("MAIE_API_KEY is not configured");
  }

  const response = await fetch(`${MAIE_URL}/v1/status/${taskId}`, {
    headers: {
      "X-API-Key": MAIE_API_KEY,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error("MAIE status request failed", {
      taskId,
      status: response.status,
      error,
    });
    throw new Error(`MAIE status request failed: ${response.status}`);
  }

  return response.json() as Promise<MaieStatusResponse>;
}

/**
 * Submit text to MAIE for summarization (no audio transcription)
 */
export async function submitTextToMaie(
  text: string,
  templateId?: string
): Promise<MaieProcessResponse> {
  if (!MAIE_API_KEY) {
    throw new Error("MAIE_API_KEY is not configured");
  }

  logger.info("Submitting text to MAIE", {
    textLength: text.length,
    templateId,
  });

  const response = await fetch(`${MAIE_URL}/v1/process_text`, {
    method: "POST",
    headers: {
      "X-API-Key": MAIE_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      template_id: templateId,
      features: "summary",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error("MAIE text request failed", {
      status: response.status,
      error,
    });
    throw new Error(`MAIE text request failed: ${response.status} - ${error}`);
  }

  const result = (await response.json()) as MaieProcessResponse;
  logger.info("MAIE accepted text processing request", {
    taskId: result.task_id,
    status: result.status,
  });

  return result;
}

/**
 * Health check for MAIE service
 */
export async function checkMaieHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${MAIE_URL}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
