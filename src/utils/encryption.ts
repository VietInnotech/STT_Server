import crypto from "crypto";
import { createReadStream, createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { Transform, Readable } from "stream";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // 16 bytes for AES
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;

// Streaming encryption constants
const STREAM_HEADER_LENGTH = SALT_LENGTH + IV_LENGTH; // 48 bytes header: salt + iv
const CHUNK_SIZE = 64 * 1024; // 64KB chunks for streaming

// Get encryption key from environment
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error("ENCRYPTION_KEY not set in environment variables");
  }

  // Key must be 32 bytes (64 hex characters) for AES-256
  if (key.length !== 64) {
    throw new Error("ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
  }

  return Buffer.from(key, "hex");
}

/**
 * Encrypt data using AES-256-GCM
 * @param data Buffer or string to encrypt
 * @returns Object with encryptedData (Buffer) and iv (hex string)
 */
export function encrypt(data: Buffer | string): {
  encryptedData: Buffer;
  encryptedIV: string;
} {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf-8");

  // Generate random IV and salt
  const iv = crypto.randomBytes(IV_LENGTH);
  const salt = crypto.randomBytes(SALT_LENGTH);

  // Derive key from master key + salt using PBKDF2
  const key = crypto.pbkdf2Sync(
    getEncryptionKey(),
    salt,
    100000, // iterations
    32, // key length
    "sha256"
  );

  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  // Encrypt data
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);

  // Get auth tag
  const authTag = cipher.getAuthTag();

  // Combine: salt + authTag + encrypted data (for storage)
  const encryptedData = Buffer.concat([salt, authTag, encrypted]);

  // Return data and IV separately (IV stored as hex string)
  return {
    encryptedData,
    encryptedIV: iv.toString("hex"),
  };
}

/**
 * Decrypt data encrypted with AES-256-GCM
 * @param encryptedData Buffer containing [salt + authTag + encryptedData]
 * @param encryptedIV IV as hex string
 * @returns Decrypted Buffer
 */
export function decrypt(encryptedData: Buffer, encryptedIV: string): Buffer {
  // Extract components from encryptedData
  const salt = encryptedData.subarray(0, SALT_LENGTH);
  const authTag = encryptedData.subarray(
    SALT_LENGTH,
    SALT_LENGTH + AUTH_TAG_LENGTH
  );
  const encrypted = encryptedData.subarray(SALT_LENGTH + AUTH_TAG_LENGTH);

  // Convert IV from hex string to Buffer
  const iv = Buffer.from(encryptedIV, "hex");

  // Derive key from master key + salt
  const key = crypto.pbkdf2Sync(getEncryptionKey(), salt, 100000, 32, "sha256");

  // Create decipher
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  // Decrypt data
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

/**
 * Generate a new random encryption key (for setup purposes)
 * @returns Hex string of 64 characters (32 bytes)
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString("hex");
}

// ============================================
// STREAMING ENCRYPTION FOR FILESYSTEM STORAGE
// ============================================

/**
 * File format for streaming encryption:
 * [SALT (32 bytes)][IV (16 bytes)][AUTH_TAG (16 bytes)][ENCRYPTED_DATA...]
 *
 * We use a single encryption context per file (not paged) because:
 * 1. Simpler implementation
 * 2. Audio files are typically < 50MB
 * 3. GCM auth tag at the start ensures integrity
 *
 * For very large files, consider chunked/paged encryption like @socialgouv/streaming-file-encryption
 */

/**
 * Encrypt a file from inputPath and write to outputPath using streaming.
 * Returns the IV as hex string (also stored in file header).
 *
 * File structure: [SALT:32][IV:16][AUTH_TAG:16][CIPHERTEXT:...]
 *
 * @param inputPath Path to the plaintext input file
 * @param outputPath Path to write the encrypted output file
 * @returns IV as hex string
 */
export async function encryptFileToPath(
  inputPath: string,
  outputPath: string
): Promise<string> {
  // Generate random IV and salt
  const iv = crypto.randomBytes(IV_LENGTH);
  const salt = crypto.randomBytes(SALT_LENGTH);

  // Derive key from master key + salt using PBKDF2
  const key = crypto.pbkdf2Sync(getEncryptionKey(), salt, 100000, 32, "sha256");

  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  // First, read the entire file and encrypt (needed to get auth tag before writing)
  // For files up to ~50MB this is acceptable; for larger files, use chunked approach
  const inputStream = createReadStream(inputPath);
  const chunks: Buffer[] = [];

  for await (const chunk of inputStream) {
    chunks.push(cipher.update(chunk));
  }
  chunks.push(cipher.final());

  const authTag = cipher.getAuthTag();
  const encryptedData = Buffer.concat(chunks);

  // Write header + encrypted data
  const outputStream = createWriteStream(outputPath);

  return new Promise((resolve, reject) => {
    outputStream.on("error", reject);
    outputStream.on("finish", () => resolve(iv.toString("hex")));

    // Write: salt + iv + authTag + encryptedData
    outputStream.write(salt);
    outputStream.write(iv);
    outputStream.write(authTag);
    outputStream.write(encryptedData);
    outputStream.end();
  });
}

/**
 * Decrypt a file and return as a readable stream.
 * Reads header, validates auth tag, then streams decrypted content.
 *
 * @param encryptedPath Path to the encrypted file
 * @returns Readable stream of decrypted data
 */
export async function decryptFileToStream(
  encryptedPath: string
): Promise<Readable> {
  // Read the header first
  const headerBuffer = Buffer.alloc(STREAM_HEADER_LENGTH + AUTH_TAG_LENGTH); // salt + iv + authTag = 64 bytes

  return new Promise((resolve, reject) => {
    const headerStream = createReadStream(encryptedPath, {
      start: 0,
      end: STREAM_HEADER_LENGTH + AUTH_TAG_LENGTH - 1,
    });

    let offset = 0;
    headerStream.on("data", (chunk: Buffer | string) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      buf.copy(headerBuffer, offset);
      offset += buf.length;
    });

    headerStream.on("end", () => {
      try {
        // Extract header components
        const salt = headerBuffer.subarray(0, SALT_LENGTH);
        const iv = headerBuffer.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
        const authTag = headerBuffer.subarray(
          SALT_LENGTH + IV_LENGTH,
          SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH
        );

        // Derive key
        const key = crypto.pbkdf2Sync(
          getEncryptionKey(),
          salt,
          100000,
          32,
          "sha256"
        );

        // Create decipher
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);

        // Create stream that reads encrypted data (after header) and decrypts
        const encryptedStream = createReadStream(encryptedPath, {
          start: STREAM_HEADER_LENGTH + AUTH_TAG_LENGTH,
        });

        // Pipe through decipher
        const decryptedStream = encryptedStream.pipe(decipher);

        resolve(decryptedStream);
      } catch (err) {
        reject(err);
      }
    });

    headerStream.on("error", reject);
  });
}

/**
 * Decrypt a file to a Buffer (for smaller files or when full content is needed).
 *
 * @param encryptedPath Path to the encrypted file
 * @returns Decrypted data as Buffer
 */
export async function decryptFileToBuffer(
  encryptedPath: string
): Promise<Buffer> {
  const stream = await decryptFileToStream(encryptedPath);
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}
