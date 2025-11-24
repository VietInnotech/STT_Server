# Two-Factor Authentication (2FA) Implementation Guide

## Overview

This system now supports Two-Factor Authentication (2FA) using Time-based One-Time Passwords (TOTP). Users can enable 2FA to add an extra layer of security to their accounts. Once enabled, users will be asked to verify their identity with a 6-digit code from their authenticator app **once per new device**.

## Features

✅ **TOTP-based 2FA** - Compatible with Google Authenticator, Authy, Microsoft Authenticator, etc.  
✅ **QR Code Setup** - Easy setup with QR code scanning  
✅ **Backup Codes** - 10 one-time backup codes for recovery  
✅ **Device Trust** - Remember trusted devices (verify once per device)  
✅ **Toggle-able** - Users can enable/disable 2FA in Settings  
✅ **Encrypted Storage** - TOTP secrets and backup codes are encrypted with AES-256-GCM  

## User Flow

### Enabling 2FA

1. Navigate to **Settings** → **Security** tab
2. Toggle **"Enable two-factor authentication (2FA)"** to ON
3. A modal will appear with a QR code
4. Scan the QR code with your authenticator app (or manually enter the secret key)
5. Enter the 6-digit code from your authenticator app to verify setup
6. Save the backup codes shown (these are shown only once!)
7. 2FA is now enabled ✅

### Logging in with 2FA

1. Enter your username and password as usual
2. If 2FA is enabled and this is a **new device**, you'll see a 2FA verification modal
3. Open your authenticator app and enter the 6-digit code
4. Alternatively, use a backup code if you don't have access to your authenticator
5. After successful verification, the device is trusted and won't ask for 2FA again
6. Login successful! 🎉

### Disabling 2FA

1. Navigate to **Settings** → **Security** tab
2. Toggle **"Enable two-factor authentication (2FA)"** to OFF
3. Enter your password to confirm
4. 2FA is now disabled

### Regenerating Backup Codes

1. Navigate to **Settings** → **Security** tab (future feature)
2. Click **"Regenerate Backup Codes"**
3. Enter your password to confirm
4. New backup codes will be generated (old ones are invalidated)

## Technical Implementation

### Backend

#### Database Schema (`prisma/schema.prisma`)

```prisma
model User {
  // ... existing fields
  
  // Two-Factor Authentication
  totpEnabled     Boolean   @default(false)
  totpSecret      String?   // Encrypted TOTP secret
  backupCodes     String?   // Encrypted JSON array of backup codes
  trustedDevices  Json?     // JSON array of trusted device fingerprints
}
```

#### API Endpoints

| Endpoint | Method | Auth Required | Description |
|----------|--------|---------------|-------------|
| `/api/auth/2fa/setup` | POST | ✅ | Generate TOTP secret and QR code |
| `/api/auth/2fa/verify-setup` | POST | ✅ | Verify token and enable 2FA |
| `/api/auth/2fa/verify` | POST | ❌ | Verify 2FA token during login |
| `/api/auth/2fa/disable` | POST | ✅ | Disable 2FA (requires password) |
| `/api/auth/2fa/regenerate-backup-codes` | POST | ✅ | Generate new backup codes |
| `/api/auth/2fa/status` | GET | ✅ | Get current 2FA status |

#### Utility Functions (`src/utils/totp.ts`)

- `generateTOTPSecret()` - Generate new TOTP secret
- `generateQRCode(secret, email)` - Generate QR code for authenticator app
- `verifyTOTPToken(token, encryptedSecret)` - Verify 6-digit code
- `generateBackupCodes(count)` - Generate backup codes
- `verifyBackupCode(code, encryptedCodes)` - Verify and consume backup code
- `encryptTOTPSecret(secret)` - Encrypt secret for storage
- `encryptBackupCodes(codes)` - Encrypt backup codes
- `isDeviceTrusted(fingerprint, trustedDevices)` - Check if device is trusted
- `addTrustedDevice(fingerprint, trustedDevices)` - Add device to trusted list

### Frontend

#### Components

**`TwoFactorSetupModal.tsx`**
- 3-step wizard: Introduction → QR Code Scan → Backup Codes
- Handles setup and verification
- Displays backup codes (copy to clipboard)

**`TwoFactorVerifyModal.tsx`**
- Login verification modal
- Supports both TOTP codes and backup codes
- Toggle between code types

#### Pages Modified

**`SettingsPage.tsx`**
- Added 2FA section in Security tab
- Enable/disable toggle
- Shows "Active" badge when enabled
- Confirm with password before disabling

**`LoginPage.tsx`**
- Detects 2FA requirement from login response
- Shows 2FA verification modal when needed
- Completes login after successful verification

## Security Features

### Encryption
- **TOTP Secrets**: Encrypted with AES-256-GCM before storing in database
- **Backup Codes**: Encrypted with AES-256-GCM
- **Encryption Key**: Derived from `ENCRYPTION_KEY` environment variable using PBKDF2 (100,000 iterations)

### Device Trust
- Each device generates a unique fingerprint based on:
  - User Agent
  - Screen resolution
  - Language/timezone
  - Canvas fingerprinting
- Trusted devices are stored in the `trustedDevices` JSON array
- 2FA is only required once per device

### Backup Codes
- 10 one-time codes generated (format: `XXXX-XXXX`)
- Each code can only be used once
- Automatically removed from the array after use
- Can be regenerated (requires password confirmation)

### Session Management
- After 2FA verification, device is added to trusted list
- Single session per device enforced
- Sessions can be revoked via "Logout All" feature

## Testing the Feature

### Prerequisites
1. Make sure the server is running: `bun run dev`
2. Make sure the client is running: `cd client && bun run dev`
3. Have an authenticator app installed (Google Authenticator, Authy, etc.)

### Test Steps

1. **Enable 2FA**
   ```
   - Login with test user credentials
   - Go to Settings → Security
   - Enable 2FA toggle
   - Scan QR code with authenticator app
   - Enter 6-digit code to verify
   - Save backup codes
   ```

2. **Test Login with 2FA (New Device)**
   ```
   - Clear browser cookies/localStorage (simulate new device)
   - Login with username/password
   - Should see 2FA verification modal
   - Enter code from authenticator app
   - Should login successfully
   ```

3. **Test Trusted Device**
   ```
   - Logout (NOT "Logout All")
   - Login again with same credentials
   - Should NOT ask for 2FA (device is trusted)
   - Should login directly
   ```

4. **Test Backup Code**
   ```
   - Clear cookies (new device)
   - Login with username/password
   - Click "Use backup code instead"
   - Enter one of your backup codes
   - Should login successfully
   ```

5. **Test Disable 2FA**
   ```
   - Go to Settings → Security
   - Disable 2FA toggle
   - Enter password to confirm
   - 2FA should be disabled
   - Login should no longer require 2FA
   ```

## Environment Variables

Make sure you have the encryption key set in `.env`:

```bash
ENCRYPTION_KEY=your-64-character-hex-key-here
```

To generate a secure encryption key:
```bash
openssl rand -hex 32
```

## Audit Logging

All 2FA actions are logged in the `AuditLog` table:
- `auth.2fa_enabled` - When user enables 2FA
- `auth.2fa_disabled` - When user disables 2FA
- `auth.2fa_setup_failed` - When setup verification fails
- `auth.2fa_verified` - When 2FA code is verified during login
- `auth.2fa_failed` - When 2FA verification fails
- `auth.2fa_backup_code_used` - When a backup code is used
- `auth.2fa_backup_codes_regenerated` - When backup codes are regenerated
- `auth.login_2fa_required` - When 2FA is required for login

## Troubleshooting

### "Invalid verification code" during setup
- Make sure your device clock is synchronized
- TOTP codes are time-based and require accurate time
- Try using the manual secret key instead of QR code

### Lost authenticator app
- Use one of your backup codes to login
- After logging in, disable 2FA and re-enable it
- Set up 2FA with a new device

### No backup codes saved
- You can regenerate backup codes from Settings → Security
- Requires password confirmation
- Old codes will be invalidated

### 2FA asking on trusted device
- Device fingerprint may have changed (browser update, different browser, etc.)
- Clear the trusted device and verify again
- Admin can disable 2FA for the user if needed

## Future Enhancements

- [ ] SMS/Email 2FA options
- [ ] WebAuthn/FIDO2 support
- [ ] Show list of trusted devices
- [ ] Ability to remove specific trusted devices
- [ ] 2FA required by admin policy
- [ ] Recovery email option
- [ ] Rate limiting on 2FA attempts

## Dependencies

- `speakeasy` - TOTP generation and verification
- `qrcode` - QR code generation
- Existing `encryption.ts` utilities for AES-256-GCM encryption

## Files Modified/Created

### Backend
- ✅ `prisma/schema.prisma` - Added 2FA fields to User model
- ✅ `src/utils/totp.ts` - TOTP utility functions
- ✅ `src/routes/auth.ts` - 2FA endpoints and login flow
- ✅ `prisma/migrations/*/add_2fa_fields` - Database migration

### Frontend
- ✅ `client/src/components/TwoFactorSetupModal.tsx` - Setup wizard
- ✅ `client/src/components/TwoFactorVerifyModal.tsx` - Login verification
- ✅ `client/src/components/Modal.tsx` - Updated to support children
- ✅ `client/src/pages/SettingsPage.tsx` - 2FA toggle and management
- ✅ `client/src/pages/LoginPage.tsx` - 2FA verification flow
- ✅ `client/src/lib/api.ts` - Updated LoginResponse type

## Conclusion

The 2FA implementation is complete and ready for production use. It provides a robust, secure, and user-friendly way to add an extra layer of protection to user accounts. The device trust feature ensures that users are only prompted once per device, making it convenient while maintaining security.
