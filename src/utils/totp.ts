import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { encrypt, decrypt } from './encryption';
import crypto from 'crypto';

/**
 * Generate a new TOTP secret for a user
 */
export function generateTOTPSecret() {
  return speakeasy.generateSecret({
    name: 'UNV AI Report',
    length: 32,
  });
}

/**
 * Generate QR code data URL for authenticator app setup
 * @param secret - The TOTP secret object from generateTOTPSecret
 * @param userEmail - User's email to display in authenticator app
 */
export async function generateQRCode(secret: speakeasy.GeneratedSecret, userEmail: string): Promise<string> {
  const otpauthUrl = speakeasy.otpauthURL({
    secret: secret.base32,
    label: userEmail,
    issuer: 'UNV AI Report',
    encoding: 'base32',
  });

  return await QRCode.toDataURL(otpauthUrl);
}

/**
 * Verify a TOTP token against a secret
 * @param token - 6-digit token from authenticator app
 * @param encryptedSecret - Encrypted TOTP secret object from database (JSON string)
 * @returns true if token is valid
 */
export function verifyTOTPToken(token: string, encryptedSecret: string): boolean {
  try {
    const parsed = JSON.parse(encryptedSecret);
    const encryptedData = Buffer.from(parsed.encryptedData, 'base64');
    const encryptedIV = parsed.encryptedIV;
    
    const decryptedBuffer = decrypt(encryptedData, encryptedIV);
    const decryptedSecret = decryptedBuffer.toString('utf-8');
    
    return speakeasy.totp.verify({
      secret: decryptedSecret,
      encoding: 'base32',
      token: token,
      window: 2, // Allow 2 time steps before/after (60 seconds tolerance)
    });
  } catch (error) {
    console.error('Error verifying TOTP token:', error);
    return false;
  }
}

/**
 * Generate backup codes for 2FA recovery
 * @param count - Number of backup codes to generate (default: 10)
 * @returns Array of backup codes
 */
export function generateBackupCodes(count: number = 10): string[] {
  const codes: string[] = [];
  
  for (let i = 0; i < count; i++) {
    // Generate 8-character alphanumeric code
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    // Format as XXXX-XXXX for readability
    codes.push(`${code.slice(0, 4)}-${code.slice(4, 8)}`);
  }
  
  return codes;
}

/**
 * Verify a backup code against stored codes
 * @param inputCode - Code entered by user
 * @param encryptedCodes - Encrypted JSON array of backup codes from database (JSON string)
 * @returns Object with success flag and remaining codes
 */
export function verifyBackupCode(
  inputCode: string,
  encryptedCodes: string
): { success: boolean; remainingCodes: string[] } {
  try {
    const parsed = JSON.parse(encryptedCodes);
    const encryptedData = Buffer.from(parsed.encryptedData, 'base64');
    const encryptedIV = parsed.encryptedIV;
    
    const decryptedBuffer = decrypt(encryptedData, encryptedIV);
    const codes: string[] = JSON.parse(decryptedBuffer.toString('utf-8'));
    
    // Normalize input (remove spaces, hyphens, make uppercase)
    const normalizedInput = inputCode.replace(/[\s-]/g, '').toUpperCase();
    
    // Find matching code
    const codeIndex = codes.findIndex(code => {
      const normalizedCode = code.replace(/[\s-]/g, '').toUpperCase();
      return normalizedCode === normalizedInput;
    });
    
    if (codeIndex === -1) {
      return { success: false, remainingCodes: codes };
    }
    
    // Remove used code
    const remainingCodes = codes.filter((_, index) => index !== codeIndex);
    
    return { success: true, remainingCodes };
  } catch (error) {
    console.error('Error verifying backup code:', error);
    return { success: false, remainingCodes: [] };
  }
}

/**
 * Encrypt TOTP secret for database storage
 * @returns JSON string with encryptedData (base64) and encryptedIV
 */
export function encryptTOTPSecret(secret: string): string {
  const encrypted = encrypt(secret);
  return JSON.stringify({
    encryptedData: encrypted.encryptedData.toString('base64'),
    encryptedIV: encrypted.encryptedIV,
  });
}

/**
 * Encrypt backup codes for database storage
 * @returns JSON string with encryptedData (base64) and encryptedIV
 */
export function encryptBackupCodes(codes: string[]): string {
  const encrypted = encrypt(JSON.stringify(codes));
  return JSON.stringify({
    encryptedData: encrypted.encryptedData.toString('base64'),
    encryptedIV: encrypted.encryptedIV,
  });
}

/**
 * Check if a device is trusted for 2FA
 * @param deviceFingerprint - Device fingerprint from session
 * @param trustedDevices - JSON array of trusted device fingerprints from user
 */
export function isDeviceTrusted(deviceFingerprint: string | null, trustedDevices: any): boolean {
  if (!deviceFingerprint || !trustedDevices) {
    return false;
  }
  
  try {
    const devices = Array.isArray(trustedDevices) ? trustedDevices : [];
    return devices.includes(deviceFingerprint);
  } catch {
    return false;
  }
}

/**
 * Add a device to trusted devices list
 * @param deviceFingerprint - Device fingerprint to trust
 * @param trustedDevices - Current JSON array of trusted devices
 */
export function addTrustedDevice(deviceFingerprint: string, trustedDevices: any): any {
  try {
    const devices = Array.isArray(trustedDevices) ? trustedDevices : [];
    if (!devices.includes(deviceFingerprint)) {
      devices.push(deviceFingerprint);
    }
    return devices;
  } catch {
    return [deviceFingerprint];
  }
}
