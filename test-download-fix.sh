#!/bin/bash
# Quick test to verify audio/text download fixes

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Audio/Text Download Testing ===${NC}\n"

# Get a sample audio file ID from the database
AUDIO_ID=$(sqlite3 dev.db "SELECT id FROM AudioFile LIMIT 1;" 2>/dev/null)

if [ -z "$AUDIO_ID" ]; then
    echo -e "${RED}✗ No audio files found in database${NC}"
    echo "  Please upload an audio file first"
    exit 1
fi

echo -e "${GREEN}✓ Found audio file:${NC} $AUDIO_ID"

# Get a sample text file ID from the database
TEXT_ID=$(sqlite3 dev.db "SELECT id FROM TextFile LIMIT 1;" 2>/dev/null)

if [ -z "$TEXT_ID" ]; then
    echo -e "${RED}✗ No text files found in database${NC}"
    echo "  Please upload a text file first"
    exit 1
fi

echo -e "${GREEN}✓ Found text file:${NC} $TEXT_ID"

echo ""
echo -e "${BLUE}Testing audio download endpoint...${NC}"
curl -s -i http://localhost:3000/api/files/audio/$AUDIO_ID | head -20

echo ""
echo -e "${BLUE}Testing text download endpoint...${NC}"
curl -s -i http://localhost:3000/api/files/text/$TEXT_ID | head -20

echo ""
echo -e "${BLUE}=== Testing complete ===${NC}"
echo "If you see '200 OK' and valid Content-Disposition headers, the fix is working!"
