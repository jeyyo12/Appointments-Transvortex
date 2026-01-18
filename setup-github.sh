#!/bin/bash
# Quick GitHub Setup Script for Transvortex Facebook Pages Manager
# Run this after creating a GitHub repository

echo "🚀 Transvortex GitHub Setup"
echo "======================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo -e "${RED}❌ Git is not installed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Git found${NC}"

# Check if .gitignore exists
if [ -f ".gitignore" ]; then
    echo -e "${GREEN}✓ .gitignore exists${NC}"
else
    echo -e "${RED}❌ .gitignore not found${NC}"
    exit 1
fi

# Check if .env files are in git (DANGER!)
echo ""
echo "🔍 Scanning for exposed secrets..."

if git ls-files | grep -E "\.env($|\.)" > /dev/null; then
    echo -e "${RED}❌ DANGER: .env files are tracked in git!${NC}"
    echo "   Run: git rm --cached .env* && git commit -m 'Remove .env files'"
    exit 1
else
    echo -e "${GREEN}✓ No .env files in git (safe)${NC}"
fi

# Check if secrets in git history
echo "Scanning git history for secrets..."
if git log --all -p | grep -iE "(password|secret|token|api_key|private_key)" | head -5 > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠ WARNING: Potential secrets found in git history${NC}"
    echo "   Review manually: git log --all -p | grep -i secret"
else
    echo -e "${GREEN}✓ No obvious secrets in history${NC}"
fi

# Initialize git if needed
if [ -d ".git" ]; then
    echo -e "${GREEN}✓ Git repository already initialized${NC}"
else
    echo "Initializing git repository..."
    git init
    git add .
    git commit -m "Initial commit: Frontend + Backend + Security Setup"
fi

# Check remote
echo ""
echo "🔗 Git Remote Configuration"
if git remote get-url origin > /dev/null 2>&1; then
    REMOTE=$(git remote get-url origin)
    echo -e "${GREEN}✓ Remote origin set to: $REMOTE${NC}"
else
    echo -e "${YELLOW}⚠ No remote configured${NC}"
    echo "Add remote: git remote add origin https://github.com/YOUR_USERNAME/facebook-pages-manager.git"
fi

# Show verification summary
echo ""
echo "======================================"
echo "✅ GitHub Setup Verification Complete"
echo "======================================"
echo ""
echo "Next steps:"
echo "1. Create private repository on GitHub"
echo "2. Run: git remote add origin https://github.com/YOUR_USERNAME/facebook-pages-manager.git"
echo "3. Run: git branch -M main"
echo "4. Run: git push -u origin main"
echo "5. Add secrets in GitHub:"
echo "   - Settings > Secrets and variables > Actions"
echo "   - Add RENDER_API_KEY or RAILWAY_API_TOKEN"
echo "6. Setup branch protection:"
echo "   - Settings > Branches > Add rule for 'main'"
echo "   - Enable: Require PR reviews, Require status checks"
echo ""
echo "📚 See DEPLOYMENT.md for complete setup guide"
