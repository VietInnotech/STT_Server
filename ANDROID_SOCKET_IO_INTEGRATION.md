# Android Socket.IO Integration — Implementation Guide

Mục tiêu: Hướng dẫn rõ ràng cho một AI hoặc developer để hiện thực hoá tích hợp Socket.IO từ app Android vào backend (offline LAN) của dự án.

File này ghi rõ: REST API liên quan, hợp đồng Socket.IO (sự kiện, payload), chiến lược heartbeat, xác thực, hành vi mong đợi ở server, ví dụ Kotlin và kịch bản kiểm thử.

---

## 1. Tóm tắt hành vi mong muốn

- Khi app Android kết nối vào backend, server phải biết thiết bị đó là gì và đánh dấu `isOnline = true`.
- Android gửi thông tin thiết bị (deviceId/deviceFingerprint, androidVersion, appVersion, optional macAddress).
- Android gửi heartbeat định kỳ để cập nhật `lastSeen` trên server.
- Khi Android ngắt kết nối, server đánh dấu `isOnline = false` và ghi uptime history.
- Nếu client Android chỉ gọi REST login/2FA mà chưa kết nối socket, server phải vẫn có thể tạo/cập nhật `Device` khi REST login/2FA kèm `deviceId` hoặc `deviceFingerprint`.

## 2. REST API liên quan (server-side)

Các endpoint chính mà Android có thể gọi:

1) POST /api/auth/login
- Body (application/json):
  - username: string (required)
  - password: string (required)
  - deviceFingerprint?: string (optional) — stable device id (UUID) lưu ở app
  - deviceId?: string (optional) — tương tự deviceFingerprint
  - version?: string (optional) — client app version (required cho Android trên server)
- Hành vi server (tóm tắt):
  - Nếu user.totpEnabled và thiết bị không trusted -> trả requires2FA
  - Nếu login thành công, server tạo session và (nếu Android + có deviceFingerprint/deviceId) upsert Device record (create/update isOnline/lastSeen)
- Response: 200 { user, token } hoặc 200 { requires2FA: true, userId }

2) POST /api/auth/2fa/verify
- Body (application/json):
  - userId: string
  - token: string (TOTP or backup)
  - deviceFingerprint?: string (optional)
  - deviceId?: string (optional)
  - version?: string (optional)
- Hành vi: khi 2FA thành công, server tạo token, thêm deviceFingerprint vào user.trustedDevices, và (nếu Android + deviceFingerprint/deviceId) upsert Device record.
- Response: 200 { user, token }

Lưu ý lỗi có thể gặp khi Android không gửi `version` hoặc version không đúng định dạng — server có thể trả 400 hoặc 426 (Upgrade Required).

## 3. Socket.IO contract (events + payloads)

Kết nối: websocket transport (socket.io). URL backend: ví dụ `http://192.168.x.y:3000`.

Handshake (tùy chọn):
- Có thể truyền `deviceId` trong query param: `?deviceId=<UUID>`; server có thể dùng để map ngay khi connect.
- Hoặc không truyền; sau khi connect, client phải emit `device:info`.

Client -> Server events:

1) `auth:identify`
- Payload: { token?: string }
- Mục đích: gửi JWT để server verify và register socket vào user room (server dùng `verifyToken` + `registerUserSocket`).
- Trả về: không cần response; server chỉ log/ghi mapping.

2) `device:info`
- Payload (object):
  - deviceId?: string (UUID hoặc stable fingerprint) — recommended
  - deviceName?: string (optional friendly name)
  - androidVersion?: string
  - appVersion?: string
  - macAddress?: string|null (optional)
- Mục đích: tạo/cập nhật bản ghi `Device` (deviceId unique), cập nhật `androidVersion`, `appVersion`, `macAddress`, `lastSeen`, `isOnline=true`.

3) `device:heartbeat`
- Payload: none
- Mục đích: server cập nhật `lastSeen` cho `socket.data.deviceDbId` hoặc device matched earlier.
- Tần suất khuyến nghị: 25–60s (ví dụ 30s).

Server -> Client events:

1) `devices:list`
- Payload: Array of device objects (id, deviceName, deviceId, ipAddress, isOnline, lastSeen, ...)
- Mục đích: broadcast danh sách devices hiện đang online (server gọi khi devices thay đổi).

2) Other control events (server có thể emit) như kick, notifications.

## 4. Sequence (kịch bản mẫu)

1. App khởi động; load `deviceId` từ SharedPreferences (đã tạo UUID lần đầu nếu chưa có).
2. App mở kết nối Socket.IO.
3. Khi socket connected:
   - emit `auth:identify` với `{ token: <JWT từ login nếu có> }`
   - emit `device:info` với `deviceId`, `androidVersion`, `appVersion`, ...
   - start timer heartbeat gửi `device:heartbeat` mỗi 30s
4. Khi socket disconnect: stop heartbeat. Server sẽ cập nhật `isOnline=false` trên disconnect.

## 5. Acceptance criteria (kiểm nghiệm thành công)

1. Sau khi Android connect + `device:info`, trong DB `devices` xuất hiện một record với `deviceId` = giá trị client gửi.
2. `isOnline` được set true ngay sau connect; server gửi `devices:list` có chứa record đó.
3. Gửi `device:heartbeat` cập nhật `lastSeen` lên DB mới nhất.
4. Khi ngắt kết nối socket, server cập nhật `isOnline=false` và ghi `uptimeHistory` offline event.
5. Nếu Android chỉ gọi REST login/2FA (với `deviceId`/`deviceFingerprint`), server vẫn tạo/cập nhật Device record.

## 6. Error handling & edge cases

- Nếu client không gửi `deviceId` hoặc fingerprint thì server không thể tạo unique device record; trong trường hợp này server có thể fallback match theo IP (như hiện tại) nhưng lưu ý NAT many-to-one.
- Nếu multiple devices cùng IP nhưng không có deviceId -> có thể hợp nhất thành 1 record (không mong muốn). Vì vậy khuyến nghị bắt buộc gửi `deviceId` ổn định.
- Throttling: heartbeat không nên quá nhanh (<10s). Server có rate limiting (middleware rateLimiter) — tránh spam events.
- Nếu token invalid trong `auth:identify`, server sẽ ignore event; client có thể re-login and re-identify.

## 7. Kotlin example (Socket.IO)

```kotlin
// Simplified example (see guide above for full implementation)
val opts = IO.Options()
opts.transports = arrayOf("websocket")
opts.query = "deviceId=${deviceId}" // optional
val socket = IO.socket("http://192.168.1.100:3000", opts)

socket.on(Socket.EVENT_CONNECT) {
  // Identify with JWT
  val obj = JSONObject().put("token", jwtToken)
  socket.emit("auth:identify", obj)

  // Send device info
  val info = JSONObject()
  info.put("deviceId", deviceId)
  info.put("androidVersion", "${Build.VERSION.RELEASE}")
  info.put("appVersion", appVersion)
  socket.emit("device:info", info)

  // Start heartbeat (polling Runnable / Coroutine)
}

socket.on(Socket.EVENT_DISCONNECT) {
  // stop heartbeat
}

socket.connect()
```

## 8. Test plan (manual or automated)

1. Start server dev.
2. From Android emulator or Node script, connect socket, send `auth:identify` and `device:info`.
3. Verify DB `devices` contains the device (via Prisma Studio or sqlite client).
4. Stop socket -> check `isOnline=false` and `uptimeHistory` offline entry.
5. Test REST-only scenario: POST /api/auth/login with deviceFingerprint and valid credentials -> verify Device created.
6. Test 2FA scenario: POST /api/auth/login (requires2FA), then POST /api/auth/2fa/verify with deviceFingerprint -> verify Device created + trustedDevices updated on user.

## 9. Implementation notes for AI agent / developer

- Ensure the Android client persists a stable device identifier (UUID) in SharedPreferences and sends it in both REST login/2FA and Socket.IO `device:info`.
- Use `auth:identify` (with JWT) as authentication for socket events. Server will not accept unsecured control events for sensitive actions.
- Keep heartbeat conservative (30s) and stop it on app pause/stop to conserve battery.
- Prefer to send `deviceId` in handshake query AND `device:info` after connect so server can match immediately.
- If required, update `index.ts` on server to prefer matching devices by `socket.handshake.query.deviceId` (if present) when a new socket connects, rather than only matching by IP.

---

End of guide.
