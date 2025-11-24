#!/bin/bash

# Get JWT token first
JWT=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.token')

# Android POST command
curl -X POST http://localhost:3000/api/files/text-pair-android \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "summary": "System Status Report\n\nCPU: 45%\nMemory: 8GB/16GB\nDisk: 250GB/500GB",
    "realtime": "Real-time Monitoring\n\n[10:30] CPU spike: 78%\n[10:35] All nominal",
    "deviceId": "device-123",
    "deleteAfterDays": 30,
    "pairName": "Test Upload"
  }' | jq .
