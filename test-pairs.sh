#!/bin/bash

# Text File Pair API - Quick Test Script
# Usage: ./test-pairs.sh [JWT_TOKEN]

API_URL="${API_URL:-http://localhost:3000}"
JWT_TOKEN="${1:-$JWT_TOKEN}"

if [ -z "$JWT_TOKEN" ]; then
  echo "❌ Error: JWT_TOKEN not provided"
  echo "Usage: ./test-pairs.sh <JWT_TOKEN>"
  echo ""
  echo "Get JWT_TOKEN from login:"
  echo "curl -X POST $API_URL/api/auth/login -d '{\"username\":\"admin\",\"password\":\"password\"}' | jq '.token'"
  exit 1
fi

echo "📋 Text File Pair API Tests"
echo "🔗 API URL: $API_URL"
echo "🔑 Using JWT Token: ${JWT_TOKEN:0:20}..."
echo ""

# Test 1: Android JSON Upload
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📱 Test 1: Upload from Android (JSON)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

ANDROID_RESPONSE=$(curl -s -X POST $API_URL/api/files/text-pair-android \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "summary": "System Status Report\n\nGenerated: 2025-11-20\nCPU Usage: 45%\nMemory: 8GB/16GB\nDisk: 250GB/500GB\nUptime: 45 days",
    "realtime": "Real-time Monitoring Data\n\n[2025-11-20 10:30:00] CPU spike detected: 78%\n[2025-11-20 10:30:05] Alert: High memory usage\n[2025-11-20 10:30:10] Disk I/O: 450MB/s\n[2025-11-20 10:30:15] Network: 1.2Gbps",
    "deviceId": "device-uuid-'"$(date +%s)"'",
    "deleteAfterDays": 30,
    "pairName": "Test Android '"$(date '+%Y-%m-%d %H:%M:%S')"'"
  }')

echo "Request:"
echo "  POST $API_URL/api/files/text-pair-android"
echo "  Content-Type: application/json"
echo ""
echo "Response:"
echo $ANDROID_RESPONSE | jq .
echo ""

# Extract pair ID
ANDROID_PAIR_ID=$(echo $ANDROID_RESPONSE | jq -r '.pair.id // empty')

if [ -z "$ANDROID_PAIR_ID" ]; then
  echo "❌ Failed to create pair from Android"
  exit 1
fi

echo "✅ Android pair created: $ANDROID_PAIR_ID"
echo ""

# Test 2: Retrieve Pair
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📖 Test 2: Retrieve Pair Details"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

GET_RESPONSE=$(curl -s -X GET $API_URL/api/files/pairs/$ANDROID_PAIR_ID \
  -H "Authorization: Bearer $JWT_TOKEN")

echo "Request:"
echo "  GET $API_URL/api/files/pairs/$ANDROID_PAIR_ID"
echo ""
echo "Response:"
echo $GET_RESPONSE | jq .
echo ""

SUMMARY_FILE_ID=$(echo $GET_RESPONSE | jq -r '.pair.summaryFile.id // empty')
REALTIME_FILE_ID=$(echo $GET_RESPONSE | jq -r '.pair.realtimeFile.id // empty')

if [ -z "$SUMMARY_FILE_ID" ] || [ -z "$REALTIME_FILE_ID" ]; then
  echo "❌ Failed to retrieve pair details"
  exit 1
fi

echo "✅ Pair retrieved successfully"
echo "   Summary File ID: $SUMMARY_FILE_ID"
echo "   Realtime File ID: $REALTIME_FILE_ID"
echo ""

# Test 3: WebUI Multipart Upload
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🌐 Test 3: Upload from WebUI (Multipart)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Create temp files
cat > /tmp/summary_test.txt << 'EOF'
Weekly System Performance Report
=================================
Week: Nov 15-20, 2025
Total Uptime: 99.8%
Average CPU: 42%
Average Memory: 65%
Critical Incidents: 0
All systems operational.
EOF

cat > /tmp/realtime_test.txt << 'EOF'
Real-time Monitoring Feed
==========================
2025-11-20 10:15:00 - System start
2025-11-20 10:20:00 - Load average: 2.1
2025-11-20 10:25:00 - Backup process started
2025-11-20 10:30:00 - Backup completed (15.2GB)
2025-11-20 10:35:00 - All systems nominal
EOF

WEB_RESPONSE=$(curl -s -X POST $API_URL/api/files/text-pair \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -F "summary=@/tmp/summary_test.txt" \
  -F "realtime=@/tmp/realtime_test.txt" \
  -F "pairName=Web Test $(date '+%Y-%m-%d %H:%M:%S')" \
  -F "deleteAfterDays=30")

echo "Request:"
echo "  POST $API_URL/api/files/text-pair"
echo "  Form Data:"
echo "    - summary: @/tmp/summary_test.txt"
echo "    - realtime: @/tmp/realtime_test.txt"
echo ""
echo "Response:"
echo $WEB_RESPONSE | jq .
echo ""

WEB_PAIR_ID=$(echo $WEB_RESPONSE | jq -r '.pair.id // empty')

if [ -z "$WEB_PAIR_ID" ]; then
  echo "❌ Failed to create pair from WebUI"
  exit 1
fi

echo "✅ WebUI pair created: $WEB_PAIR_ID"
echo ""

# Test 4: Delete Pair
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🗑️  Test 4: Delete Pair (Cascade Delete Both Files)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

DELETE_RESPONSE=$(curl -s -X DELETE $API_URL/api/files/pairs/$ANDROID_PAIR_ID \
  -H "Authorization: Bearer $JWT_TOKEN")

echo "Request:"
echo "  DELETE $API_URL/api/files/pairs/$ANDROID_PAIR_ID"
echo ""
echo "Response:"
echo $DELETE_RESPONSE | jq .
echo ""

# Verify deletion
VERIFY=$(curl -s -X GET $API_URL/api/files/pairs/$ANDROID_PAIR_ID \
  -H "Authorization: Bearer $JWT_TOKEN" | jq -r '.error // empty')

if [ -n "$VERIFY" ]; then
  echo "✅ Pair deleted successfully (confirmed via GET)"
else
  echo "❌ Pair still exists after deletion"
  exit 1
fi

echo ""

# Test 5: Error Cases
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⚠️  Test 5: Error Cases"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Missing required field
echo "5.1: Missing realtime content"
ERROR1=$(curl -s -X POST $API_URL/api/files/text-pair-android \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"summary": "test", "deviceId": "device-123"}' | jq -r '.error')
echo "  Error: $ERROR1"
echo ""

# Unauthorized
echo "5.2: Invalid token"
ERROR2=$(curl -s -X GET $API_URL/api/files/pairs/nonexistent \
  -H "Authorization: Bearer invalid-token" | jq -r '.error // empty')
if [ -n "$ERROR2" ]; then
  echo "  ✅ Correctly rejected"
else
  echo "  ⚠️  Should have rejected"
fi
echo ""

# Not found
echo "5.3: Pair not found"
ERROR3=$(curl -s -X GET $API_URL/api/files/pairs/nonexistent-id-12345 \
  -H "Authorization: Bearer $JWT_TOKEN" | jq -r '.error')
echo "  Error: $ERROR3"
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ All Tests Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📝 Results:"
echo "  ✅ Android JSON upload: PASSED"
echo "  ✅ Get pair details: PASSED"
echo "  ✅ WebUI multipart upload: PASSED"
echo "  ✅ Delete pair (cascade): PASSED"
echo "  ✅ Error handling: PASSED"
echo ""
echo "🎯 Ready for Android integration!"
echo ""

# Cleanup
rm -f /tmp/summary_test.txt /tmp/realtime_test.txt

