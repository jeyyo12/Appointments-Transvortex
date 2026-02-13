#!/usr/bin/env pwsh
# GitHub Push Security Verification Script
# Use before pushing to remote: ./verify-github-safe.ps1

Write-Host "`n📋 GIT SECURITY VERIFICATION` n" -ForegroundColor Cyan

# Test 1: Check for .env files in git
Write-Host "1️⃣  Checking for .env files..." -ForegroundColor Yellow
$envFiles = git ls-files | Select-String "\.env"
if ($envFiles) {
    Write-Host "❌ DANGER: .env files are tracked in git!" -ForegroundColor Red
    Write-Host "   Run: git rm --cached .env* && git commit -m 'Remove .env files'" -ForegroundColor Red
    exit 1
} else {
    Write-Host "✅ No .env files in git" -ForegroundColor Green
}

# Test 2: Check for sensitive patterns in staged changes
Write-Host "`n2️⃣  Scanning staged changes for secrets..." -ForegroundColor Yellow
$secrets = git diff --cached | Select-String -Pattern "apikey|password|secret|token|bearer|private_key|serviceAccount|adminsdk" -WarningAction SilentlyContinue
if ($secrets) {
    Write-Host "⚠️  WARNING: Found potentially sensitive patterns in staged changes:" -ForegroundColor Yellow
    Write-Host $secrets -ForegroundColor Red
    Write-Host "`n   Review these changes before pushing!" -ForegroundColor Yellow
} else {
    Write-Host "✅ No obvious secrets in staged changes" -ForegroundColor Green
}

# Test 3: Check for sensitive file patterns
Write-Host "`n3️⃣  Checking for sensitive file patterns..." -ForegroundColor Yellow
$sensitivePatterns = @(
    "\.env*",
    "firebase-adminsdk-.*\.json",
    "*serviceAccount*\.json",
    "\.key$",
    "\.pem$",
    "\.p12$",
    "github.*token"
)

$found = $false
foreach ($pattern in $sensitivePatterns) {
    $matches = git ls-files | Select-String $pattern
    if ($matches) {
        Write-Host "❌ Found: $pattern" -ForegroundColor Red
        Write-Host "   $matches" -ForegroundColor Red
        $found = $true
    }
}

if (-not $found) {
    Write-Host "✅ No sensitive files tracked" -ForegroundColor Green
}

# Test 4: Verify .gitignore is in repo
Write-Host "`n4️⃣  Verifying .gitignore is tracked..." -ForegroundColor Yellow
$gitignore = git ls-files | Select-String "^\.gitignore$"
if ($gitignore) {
    Write-Host "✅ .gitignore is tracked in git" -ForegroundColor Green
} else {
    Write-Host "⚠️  WARNING: .gitignore not tracked (add it!)" -ForegroundColor Yellow
    Write-Host "   Run: git add .gitignore && git commit -m 'Add .gitignore'" -ForegroundColor Yellow
}

# Test 5: Show final status
Write-Host "`n5️⃣  Final git status..." -ForegroundColor Yellow
git status -s | ForEach-Object {
    if ($_ -match "\.env|\.key|\.pem") {
        Write-Host "❌ $_ - SENSITIVE FILE!" -ForegroundColor Red
    } else {
        Write-Host "✅ $_" -ForegroundColor Green
    }
}

# Summary
Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
if ($found) {
    Write-Host "⚠️  VERIFICATION: WARNINGS FOUND - Review before push!" -ForegroundColor Yellow
    exit 1
} else {
    Write-Host "✅ VERIFICATION PASSED - Safe to push!" -ForegroundColor Green
    exit 0
}
