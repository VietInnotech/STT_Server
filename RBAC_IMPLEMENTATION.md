# Role-Based Access Control (RBAC) Implementation

## Overview
The system implements a 3-tier role-based access control model with proper authorization checks across all routes.

## Roles

### Admin (Full System Access)
- **User Management**: Create, read, update, delete all users
- **System Settings**: View and modify system-wide configuration
- **File Management**: Upload, view, share, delete all files (including others' files)
- **Device Management**: View, update, delete all devices
- **Templates**: Create, modify, delete system templates; manage own user templates
- **Audit Logs**: Full access to audit trail and system logs
- **Statistics**: View all dashboard statistics including audit logs

### User (Own Resources)
- **Own Files**: Upload, view, share, delete own audio and text files
- **Own Devices**: Register, view, update, delete own devices
- **File Sharing**: Share own files with expiration settings
- **Templates**: Create, modify, delete own user templates; view system templates
- **User Settings**: Manage own preferences (delete-after-days, theme, language, timezone)
- **Statistics**: View dashboard statistics (without audit logs)
- **2FA**: Setup, verify, disable two-factor authentication for own account

### Viewer (Read-Only)
- **Shared Files**: View files shared with them (read-only access)
- **Basic Stats**: View limited dashboard statistics
- **No Write Operations**: Cannot upload, delete, or modify any resources
- **No Device Management**: Cannot register or manage devices
- **No User Management**: Cannot create or modify users

## Implementation Details

### Middleware
- **`authenticate`**: Validates JWT token and session, attaches `req.user` with userId, username, email, roleId, roleName
- **`requireRole(...allowedRoles)`**: Middleware factory that checks `req.user.roleName` against allowed list, returns 403 if unauthorized

### Route Protection

#### Files Routes (`/api/files`)
```typescript
POST   /audio              requireRole('admin', 'user')  // Upload audio
POST   /text               requireRole('admin', 'user')  // Upload text
DELETE /audio/:id          requireRole('admin', 'user')  // Delete audio (owner or admin)
DELETE /text/:id           requireRole('admin', 'user')  // Delete text (owner or admin)
POST   /share              requireRole('admin', 'user')  // Share file
DELETE /share              requireRole('admin', 'user')  // Unshare file
GET    /all                authenticate                  // List own files + shared files
GET    /text               authenticate                  // List text files
```

#### Devices Routes (`/api/devices`)
```typescript
GET    /                   requireRole('admin', 'user')  // List devices
GET    /:id                requireRole('admin', 'user')  // Get device details
PUT    /:id/name           requireRole('admin', 'user')  // Update device name
DELETE /:id                requireRole('admin')          // Delete device (admin only)
```

#### Users Routes (`/api/users`)
```typescript
GET    /                   requireRole('admin')          // List all users
GET    /:id                requireRole('admin')          // Get user details
POST   /                   requireRole('admin')          // Create user
PUT    /:id                requireRole('admin')          // Update user
DELETE /:id                requireRole('admin')          // Delete user
```

#### Templates Routes (`/api/templates`)
```typescript
GET    /                   authenticate                  // List templates
POST   /                   requireRole('admin', 'user')  // Create template
PUT    /:id                requireRole('admin', 'user')  // Update template (inline ownership check)
DELETE /:id                requireRole('admin', 'user')  // Delete template (inline ownership check)
PUT    /:id/default        requireRole('admin', 'user')  // Set default template
```

#### Settings Routes (`/api/settings`)
```typescript
GET    /                   authenticate                  // Get own settings
PUT    /                   authenticate                  // Update own settings (userId filter)
DELETE /:key               authenticate                  // Reset own setting (userId filter)
GET    /system             requireRole('admin')          // Get system settings
PUT    /system             requireRole('admin')          // Update system settings
GET    /preferences        authenticate                  // Get own preferences (userId filter)
PUT    /preferences        authenticate                  // Update own preferences (userId filter)
```

#### Stats Routes (`/api/stats`)
```typescript
GET    /dashboard          requireRole('admin', 'user')  // Dashboard stats (admin sees audit logs)
GET    /charts             authenticate                  // Chart data
```

#### Auth Routes (`/api/auth`)
```typescript
POST   /login              (open)                        // Login
POST   /2fa/verify         (open)                        // 2FA verification
POST   /logout             authenticate                  // Logout
GET    /me                 authenticate                  // Get current user
POST   /change-password    authenticate                  // Change password
POST   /logout-all         authenticate                  // Logout all sessions
POST   /2fa/setup          authenticate                  // Setup 2FA
POST   /2fa/verify-setup   authenticate                  // Verify 2FA setup
POST   /2fa/disable        authenticate                  // Disable 2FA
POST   /2fa/regenerate-backup-codes  authenticate        // Regenerate backup codes
GET    /2fa/status         authenticate                  // Get 2FA status
```

## Authorization Patterns

### Route-Level Authorization
Most routes use the `requireRole` middleware for clean, declarative authorization:
```typescript
router.post('/audio', requireRole('admin', 'user'), uploadAudio.single('file'), async (req, res) => {
  // Handler code
})
```

### Inline Authorization (Owner Checks)
Some operations require additional ownership validation:
```typescript
// Admin can delete any file, users can only delete their own
if (!isAdmin && file.userId !== userId) {
  res.status(403).json({ error: 'Not authorized to delete this file' })
  return
}
```

### Conditional Features (Admin-Only Data)
Some endpoints return different data based on role:
```typescript
// Dashboard: admins see audit logs, users see stats only
let activities: any[] = []
if (isAdmin) {
  activities = await prisma.auditLog.findMany({...})
}
```

## Testing RBAC

### Create Test Users
```bash
# Via admin account, create test users with different roles:
curl -X POST http://localhost:3000/api/users \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"test123","email":"user@test.com","fullName":"Test User","roleId":"<user_role_id>"}'
```

### Test Role Boundaries
1. **Viewer restrictions**: Try uploading a file with viewer token (should fail 403)
2. **User ownership**: Try deleting another user's file with user token (should fail 403)
3. **Admin override**: Delete any file with admin token (should succeed)
4. **Device management**: List devices with viewer token (should fail 403)
5. **System settings**: Update system config with user token (should fail 403)
6. **Audit logs**: Call dashboard endpoint with user token (should return stats without audit logs)

### Example Test Commands
```bash
# Get viewer token
VIEWER_TOKEN=$(curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"viewer","password":"viewer123"}' | jq -r '.token')

# Try to upload file (should fail)
curl -X POST http://localhost:3000/api/files/text \
  -H "Authorization: Bearer $VIEWER_TOKEN" \
  -F "file=@test.txt" \
  -F "deleteAfterDays=30"

# Expected: 403 Forbidden
```

## Audit Logging
All protected operations create audit log entries:
```typescript
await prisma.auditLog.create({
  data: {
    userId: req.user.userId,
    action: 'file.upload',
    resource: 'audio_file',
    resourceId: file.id,
    details: { filename, size: file.fileSize },
    ipAddress: req.ip || 'unknown',
    userAgent: req.headers['user-agent'] || 'unknown',
  },
})
```

## Security Best Practices
1. ✅ All routes require authentication (except login and 2FA verify)
2. ✅ Route-level role checks via `requireRole` middleware
3. ✅ Inline ownership validation for resource-specific operations
4. ✅ Audit logging for all write operations and sensitive reads
5. ✅ JWT token validation with session table cross-check
6. ✅ 403 Forbidden responses for unauthorized actions (not 401)
7. ✅ Conditional data exposure based on role (dashboard audit logs)
8. ✅ System settings isolated to admin role only

## Migration Checklist
- [x] Added `requireRole` middleware to files routes (upload, delete, share)
- [x] Added `requireRole` middleware to devices routes (list, get, update)
- [x] Added `requireRole` middleware to stats routes (dashboard with conditional audit logs)
- [x] Added `requireRole` middleware to templates routes (create, update, delete, set default)
- [x] Verified users routes already protected with admin-only access
- [x] Verified settings routes: system settings admin-only, user settings use userId filtering
- [x] Verified auth routes appropriately open or authenticated
- [x] Audit log restriction: dashboard returns audit logs only for admins

## Future Enhancements
- [ ] Implement resource-level permissions (e.g., file-specific share permissions)
- [ ] Add team/group roles for multi-tenant scenarios
- [ ] Implement rate limiting per role (stricter limits for viewers)
- [ ] Add permission inheritance for hierarchical roles
- [ ] WebSocket authorization for real-time features
