#!/bin/bash
# GitHub Push Security Verification Script
# Use before pushing to remote: bash verify-github-safe.sh

echo -e "\n📋 GIT SECURITY VERIFICATION\n"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Test 1: Check for .env files in git
echo -e "${YELLOW}1️⃣  Checking for .env files...${NC}"
if git ls-files | grep -E "\.env($|\.)" > /dev/null; then
    echo -e "${RED}❌ DANGER: .env files are tracked in git!${NC}"
    echo -e "${RED}   Run: git rm --cached .env* && git commit -m 'Remove .env files'${NC}"
    exit 1
else
    echo -e "${GREEN}✅ No .env files in git${NC}"
fi

# Test 2: Check for sensitive patterns in staged changes
echo -e "\n${YELLOW}2️⃣  Scanning staged changes for secrets...${NC}"
if git diff --cached | grep -iE "apikey|password|secret|token|bearer|private_key|serviceAccount|adminsdk" > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  WARNING: Found potentially sensitive patterns in staged changes:${NC}"
    git diff --cached | grep -iE "apikey|password|secret|token|bearer|private_key|serviceAccount|adminsdk" | head -5
    echo -e "${YELLOW}   Review these changes before pushing!${NC}"
else
    echo -e "${GREEN}✅ No obvious secrets in staged changes${NC}"
fi

# Test 3: Check for sensitive file patterns
echo -e "\n${YELLOW}3️⃣  Checking for sensitive file patterns...${NC}"
SENSITIVE_PATTERNS=(
    "\.env.*"
    "firebase-adminsdk-.*\.json"
    ".*serviceAccount.*\.json"
    "\.key$"
    "\.pem$"
    "\.p12$"
)

FOUND=0
for pattern in "${SENSITIVE_PATTERNS[@]}"; do
    if git ls-files | grep -E "$pattern" > /dev/null; then
        echo -e "${RED}❌ Found: $pattern${NC}"
        git ls-files | grep -E "$pattern"
        FOUND=1
    fi
done

if [ $FOUND -eq 0 ]; then
    echo -e "${GREEN}✅ No sensitive files tracked${NC}"
fi

# Test 4: Verify .gitignore is in repo
echo -e "\n${YELLOW}4️⃣  Verifying .gitignore is tracked...${NC}"
if git ls-files | grep "^\.gitignore$" > /dev/null; then
    echo -e "${GREEN}✅ .gitignore is tracked in git${NC}"
else
    echo -e "${YELLOW}⚠️  WARNING: .gitignore not tracked (add it!)${NC}"
    echo -e "${YELLOW}   Run: git add .gitignore && git commit -m 'Add .gitignore'${NC}"
fi

# Test 5: Show final status
echo -e "\n${YELLOW}5️⃣  Final git status...${NC}"
git status -s | while read line; do
    if echo "$line" | grep -E "\.env|\.key|\.pem" > /dev/null; then
        echo -e "${RED}❌ $line - SENSITIVE FILE!${NC}"
    else
        echo -e "${GREEN}✅ $line${NC}"
    fi
done

# Summary
echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
if [ $FOUND -eq 1 ]; then
    echo -e "${YELLOW}⚠️  VERIFICATION: WARNINGS FOUND - Review before push!${NC}"
    exit 1
else
    echo -e "${GREEN}✅ VERIFICATION PASSED - Safe to push!${NC}"
    exit 0
fi
