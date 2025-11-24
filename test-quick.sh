#!/bin/bash

# Quick test script - requires no JWT token pre-setup
# This script will login first, then run tests

set -e

API_URL="${API_URL:-http://localhost:3000}"
USERNAME="${USERNAME:-admin}"
PASSWORD="${PASSWORD:-admin123}"

echo "🔐 Logging in as $USERNAME..."

# Login to get JWT token
LOGIN_RESPONSE=$(curl -s -X POST $API_URL/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}")

JWT_TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.token // empty')

if [ -z "$JWT_TOKEN" ]; then
  echo "❌ Login failed!"
  echo "Response: $LOGIN_RESPONSE"
  echo ""
  echo "Make sure:"
  echo "  1. Backend is running: npm run dev"
  echo "  2. Database is initialized"
  echo "  3. Admin user exists with credentials: admin/admin"
  exit 1
fi

echo "✅ Got JWT token: ${JWT_TOKEN:0:20}..."
echo ""

# Now run the test
bash test-pairs.sh "$JWT_TOKEN"

