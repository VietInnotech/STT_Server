import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16 // 16 bytes for AES
const AUTH_TAG_LENGTH = 16
const SALT_LENGTH = 32

// Get encryption key from environment
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key) {
    throw new Error('ENCRYPTION_KEY not set in environment variables')
  }

  // Key must be 32 bytes (64 hex characters) for AES-256
  if (key.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)')
  }

  return Buffer.from(key, 'hex')
}

/**
 * Encrypt data using AES-256-GCM
 * @param data Buffer or string to encrypt
 * @returns Object with encryptedData (Buffer) and iv (hex string)
 */
export function encrypt(data: Buffer | string): { encryptedData: Buffer; encryptedIV: string } {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf-8')

  // Generate random IV and salt
  const iv = crypto.randomBytes(IV_LENGTH)
  const salt = crypto.randomBytes(SALT_LENGTH)

  // Derive key from master key + salt using PBKDF2
  const key = crypto.pbkdf2Sync(
    getEncryptionKey(),
    salt,
    100000, // iterations
    32, // key length
    'sha256'
  )

  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  // Encrypt data
  const encrypted = Buffer.concat([
    cipher.update(buffer),
    cipher.final(),
  ])

  // Get auth tag
  const authTag = cipher.getAuthTag()

  // Combine: salt + authTag + encrypted data (for storage)
  const encryptedData = Buffer.concat([salt, authTag, encrypted])

  // Return data and IV separately (IV stored as hex string)
  return {
    encryptedData,
    encryptedIV: iv.toString('hex'),
  }
}

/**
 * Decrypt data encrypted with AES-256-GCM
 * @param encryptedData Buffer containing [salt + authTag + encryptedData]
 * @param encryptedIV IV as hex string
 * @returns Decrypted Buffer
 */
export function decrypt(encryptedData: Buffer, encryptedIV: string): Buffer {
  // Extract components from encryptedData
  const salt = encryptedData.subarray(0, SALT_LENGTH)
  const authTag = encryptedData.subarray(SALT_LENGTH, SALT_LENGTH + AUTH_TAG_LENGTH)
  const encrypted = encryptedData.subarray(SALT_LENGTH + AUTH_TAG_LENGTH)

  // Convert IV from hex string to Buffer
  const iv = Buffer.from(encryptedIV, 'hex')

  // Derive key from master key + salt
  const key = crypto.pbkdf2Sync(
    getEncryptionKey(),
    salt,
    100000,
    32,
    'sha256'
  )

  // Create decipher
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  // Decrypt data
  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ])
}

/**
 * Generate a new random encryption key (for setup purposes)
 * @returns Hex string of 64 characters (32 bytes)
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex')
}
