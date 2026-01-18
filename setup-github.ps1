# Quick GitHub Setup Script for Transvortex (Windows PowerShell)
# Run in PowerShell as Administrator

Write-Host "🚀 Transvortex GitHub Setup (Windows)" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""

# Check if git is installed
try {
    $gitVersion = git --version
    Write-Host "✓ Git found: $gitVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Git is not installed. Download from https://git-scm.com" -ForegroundColor Red
    exit 1
}

# Check if .gitignore exists
if (Test-Path ".gitignore") {
    Write-Host "✓ .gitignore exists" -ForegroundColor Green
} else {
    Write-Host "❌ .gitignore not found" -ForegroundColor Red
    exit 1
}

# Check if .env files are tracked
Write-Host ""
Write-Host "🔍 Scanning for exposed secrets..." -ForegroundColor Yellow

$envFiles = git ls-files | Select-String "\.env"
if ($envFiles) {
    Write-Host "❌ DANGER: .env files are tracked in git!" -ForegroundColor Red
    Write-Host "   Run: git rm --cached .env* && git commit -m 'Remove .env files'" -ForegroundColor Red
    exit 1
} else {
    Write-Host "✓ No .env files in git (safe)" -ForegroundColor Green
}

# Check if git repo exists
if (Test-Path ".git") {
    Write-Host "✓ Git repository already initialized" -ForegroundColor Green
} else {
    Write-Host "Initializing git repository..." -ForegroundColor Yellow
    git init
    git add .
    git commit -m "Initial commit: Frontend + Backend + Security Setup"
}

# Check remote
Write-Host ""
Write-Host "🔗 Git Remote Configuration" -ForegroundColor Yellow

try {
    $remote = git remote get-url origin
    Write-Host "✓ Remote origin set to: $remote" -ForegroundColor Green
} catch {
    Write-Host "⚠ No remote configured" -ForegroundColor Yellow
    Write-Host "Add remote: git remote add origin https://github.com/YOUR_USERNAME/facebook-pages-manager.git" -ForegroundColor Cyan
}

# Show verification summary
Write-Host ""
Write-Host "======================================" -ForegroundColor Green
Write-Host "✅ GitHub Setup Verification Complete" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Create private repository on GitHub" -ForegroundColor White
Write-Host "2. Run: git remote add origin https://github.com/YOUR_USERNAME/facebook-pages-manager.git" -ForegroundColor White
Write-Host "3. Run: git branch -M main" -ForegroundColor White
Write-Host "4. Run: git push -u origin main" -ForegroundColor White
Write-Host "5. Add secrets in GitHub:" -ForegroundColor White
Write-Host "   - Settings > Secrets and variables > Actions" -ForegroundColor White
Write-Host "   - Add RENDER_API_KEY or RAILWAY_API_TOKEN" -ForegroundColor White
Write-Host "6. Setup branch protection:" -ForegroundColor White
Write-Host "   - Settings > Branches > Add rule for 'main'" -ForegroundColor White
Write-Host "   - Enable: Require PR reviews, Require status checks" -ForegroundColor White
Write-Host ""
Write-Host "📚 See DEPLOYMENT.md for complete setup guide" -ForegroundColor Cyan
