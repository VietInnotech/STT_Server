#!/bin/bash

# Quick cURL test - Copy and paste these commands one by one

echo "====== Step 1: Get JWT Token ======"
echo ""
echo "Run this command to login:"
echo ""
echo 'TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \'
echo '  -H "Content-Type: application/json" \'
echo '  -d '"'"'{"username":"admin","password":"admin123"}'"'"' | jq -r '"'"'.token'"'"')'
echo ""
echo "Then verify:"
echo 'echo $TOKEN'
echo ""
echo "====== Step 2: Android Upload (JSON) ======"
echo ""
echo 'curl -s -X POST http://localhost:3000/api/files/text-pair-android \'
echo '  -H "Authorization: Bearer $TOKEN" \'
echo '  -H "Content-Type: application/json" \'
echo '  -d '"'"'{
    "summary": "System Status Report\n\nCPU: 45%\nMemory: 8GB/16GB\nDisk: 250GB/500GB",
    "realtime": "Real-time Data\n\n[10:30] CPU spike: 78%\n[10:35] All nominal",
    "deviceId": "device-123",
    "deleteAfterDays": 30,
    "pairName": "Test Upload"
  }'"'"' | jq .'
echo ""
echo "====== Step 3: Get Pair ID from response above ======"
echo ""
echo 'PAIR_ID="<paste-pair-id-from-response>"'
echo ""
echo "====== Step 4: Retrieve Pair Details ======"
echo ""
echo 'curl -s -X GET http://localhost:3000/api/files/pairs/$PAIR_ID \'
echo '  -H "Authorization: Bearer $TOKEN" | jq .'
echo ""
echo "====== Step 5: Delete Pair ======"
echo ""
echo 'curl -s -X DELETE http://localhost:3000/api/files/pairs/$PAIR_ID \'
echo '  -H "Authorization: Bearer $TOKEN" | jq .'
echo ""
echo "====== Complete Workflow Script ======"
echo ""
echo "Or run all at once:"
echo ""
cat << 'WORKFLOW'
#!/bin/bash
API="http://localhost:3000"

# Login
TOKEN=$(curl -s -X POST $API/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.token')
echo "✅ Token: ${TOKEN:0:50}..."

# Upload
RESPONSE=$(curl -s -X POST $API/api/files/text-pair-android \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "summary": "System Report",
    "realtime": "Real-time Data",
    "deviceId": "device-123",
    "deleteAfterDays": 30,
    "pairName": "Test"
  }')
echo "✅ Upload response:"
echo $RESPONSE | jq .

PAIR_ID=$(echo $RESPONSE | jq -r '.pair.id')
echo "✅ Pair ID: $PAIR_ID"

# Get
echo "✅ Retrieving pair..."
curl -s -X GET $API/api/files/pairs/$PAIR_ID \
  -H "Authorization: Bearer $TOKEN" | jq .

# Delete
echo "✅ Deleting pair..."
curl -s -X DELETE $API/api/files/pairs/$PAIR_ID \
  -H "Authorization: Bearer $TOKEN" | jq .

echo "✅ Done!"
WORKFLOW

