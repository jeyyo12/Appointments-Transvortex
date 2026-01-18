# Complete Deployment Guide - Transvortex Facebook Pages Manager

## Overview

This guide covers:
1. **Frontend** deployment to Vercel or Netlify
2. **Backend** deployment to Render or Railway
3. **GitHub** repository setup
4. **Database** initialization (PostgreSQL)
5. **Environment variables** configuration
6. **Monitoring & troubleshooting**

---

## Part 1: GitHub Repository Setup

### 1.1 Create Private Repository

```bash
# Create new repo on GitHub (Settings: Private)
# Then clone locally or initialize

mkdir facebook-pages-manager
cd facebook-pages-manager
git init

# Add remote
git remote add origin https://github.com/YOUR_USERNAME/facebook-pages-manager.git

# Create initial commit
git add .
git commit -m "Initial commit: Frontend + Backend + Security Setup"
git branch -M main
git push -u origin main
```

### 1.2 Verify Security Setup

```bash
# Check .gitignore is in place
cat .gitignore | grep -E "\.env|\.env\.|node_modules"

# Ensure .env files NOT tracked
git status | grep -E "\.env" && echo "ERROR: .env files tracked!" || echo "✓ Safe: .env files ignored"

# Verify no secrets in git history
git log --all -p | grep -i "password\|secret\|token\|key" || echo "✓ No secrets in history"
```

### 1.3 Setup Branch Protection

```
GitHub Dashboard > Settings > Branches > Add Rule
  Branch name pattern: main
  ✓ Require pull request reviews (at least 1)
  ✓ Dismiss stale pull request approvals
  ✓ Require status checks to pass (GitHub Actions)
  ✓ Require branches to be up to date
  ✓ Include administrators
```

---

## Part 2: Database Setup (PostgreSQL)

### 2.1 Create PostgreSQL Database

**Option A: Using Render PostgreSQL (Recommended)**

```
Render Dashboard > New > PostgreSQL
  - Name: transvortex-db
  - Region: Frankfurt (or closest to you)
  - PostgreSQL Version: 15
  - Datadog API key: Leave blank for free tier

Copy connection string (looks like):
  postgresql://username:password@hostname:5432/dbname
```

**Option B: Using Railway PostgreSQL**

```
Railway > New Project > PostgreSQL
  - Click "Add" to add PostgreSQL
  - Copy database URL from "Data" tab
```

### 2.2 Initialize Database Schema

```bash
# From backend directory
cd backend

# Install migration tool
npm install knex@latest --save

# Create migrations folder
mkdir -p src/database/migrations

# Initialize database (you'll need to implement this)
# For now, create tables manually or use migration script
```

**SQL to run in database** (via pgAdmin or psql):

```sql
-- Users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Facebook Pages table
CREATE TABLE facebook_pages (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  url VARCHAR(255),
  avatar_url VARCHAR(255),
  posted_today BOOLEAN DEFAULT false,
  last_posted TIMESTAMP,
  next_scheduled_post TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Refresh tokens table (for invalidating sessions)
CREATE TABLE refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_pages_user_id ON facebook_pages(user_id);
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);

-- Enable SSL (recommended)
ALTER SYSTEM SET ssl = on;
```

### 2.3 Verify Database Connection

```bash
# Test connection string
psql "postgresql://username:password@hostname:5432/dbname"

# Should show: dbname=#
# Exit with: \q
```

---

## Part 3: Backend Deployment (Render)

### 3.1 Prepare Backend for Deployment

```bash
cd backend

# Verify package.json has start script
cat package.json | grep -A 2 "scripts"
# Should include: "start": "node src/server.js"

# Install dependencies locally (to verify)
npm install

# Test that backend starts
npm start
# Should show: [timestamp] Server running on port 3000
# Ctrl+C to stop
```

### 3.2 Deploy to Render

```
Render Dashboard > New > Web Service
  - Connect GitHub repository
  - Select repository: facebook-pages-manager
  - Name: transvortex-api (or your choice)
  - Root Directory: backend
  - Runtime: Node
  - Build Command: npm install
  - Start Command: npm start
  - Instance Type: Free (or Starter for production)
```

### 3.3 Set Environment Variables on Render

```
Web Service Settings > Environment
  Add all variables from .env.example:

  NODE_ENV=production
  PORT=3000
  FRONTEND_URL=https://your-frontend-domain.vercel.app
  
  DATABASE_URL=postgresql://username:password@hostname:5432/dbname
  
  JWT_SECRET=your_jwt_secret_32_char_minimum_random_string_here
  JWT_EXPIRE=15m
  REFRESH_TOKEN_SECRET=your_refresh_secret_32_char_minimum_random_string_here
  REFRESH_TOKEN_EXPIRE=7d
  
  LOG_LEVEL=info
  LOG_FORMAT=json
  
  RATE_LIMIT_WINDOW_MS=900000
  RATE_LIMIT_MAX_REQUESTS=100
  
  CORS_ORIGIN=https://your-frontend-domain.vercel.app
```

**How to generate random secrets**:

```bash
# On your local machine (not in git history!)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Copy output and paste into Render dashboard
```

### 3.4 Deploy Backend

```
Render Dashboard > Web Service > Deployment
  - Click "Deploy latest commit" or auto-deploy on git push
  - Wait for status to turn "Live"
  - Note the URL: https://transvortex-api.onrender.com
```

### 3.5 Test Backend

```bash
# Health check (public endpoint)
curl https://transvortex-api.onrender.com/api/health

# Should return: { "success": true, "message": "...", ... }
```

---

## Part 4: Frontend Deployment (Vercel)

### 4.1 Prepare Frontend

```bash
# Create vercel.json in root directory
cat > vercel.json << 'EOF'
{
  "framework": null,
  "buildCommand": "echo 'No build needed for static site'",
  "outputDirectory": ".",
  "env": {
    "VITE_API_URL": "@api_url"
  }
}
EOF

# Update script.js to use API URL (if backend integration ready)
# For now, it will use localStorage (development mode)
```

### 4.2 Deploy to Vercel

```
Vercel Dashboard > New Project
  - Import Git Repository
  - Select repository: facebook-pages-manager
  - Framework Preset: Other (since it's static HTML)
  - Project Name: transvortex (or your choice)
```

### 4.3 Configure Environment Variables (Vercel)

```
Project Settings > Environment Variables

Add:
  VITE_API_URL = https://transvortex-api.onrender.com/api
  (or your actual backend URL)

Apply to: Production, Preview, Development
```

### 4.4 Deploy Frontend

```
Vercel Dashboard > Deployments
  - Click "Deploy" or auto-deploy on git push to main
  - Wait for status to show "Ready"
  - Note the URL: https://transvortex.vercel.app
```

### 4.5 Update Backend CORS

After frontend deployment, update the backend with correct frontend URL:

```
Render Dashboard > Web Service > Environment
  Update CORS_ORIGIN:
    CORS_ORIGIN=https://transvortex.vercel.app
```

---

## Part 5: GitHub Actions CI/CD Setup

### 5.1 Enable GitHub Actions

```
GitHub > Settings > Actions > General
  ✓ Actions permissions: Allow all actions and reusable workflows
```

### 5.2 Add Secrets for CI/CD

```
GitHub > Settings > Secrets and variables > Actions > New repository secret

Add:
  RENDER_API_KEY = (from Render account settings)
  RAILWAY_API_TOKEN = (from Railway account settings - if using Railway)
  SNYK_TOKEN = (from Snyk.io account - optional for security scanning)
```

### 5.3 Test GitHub Actions

```bash
# Push changes to trigger workflow
git add .
git commit -m "chore: Setup CI/CD pipeline"
git push origin main

# Watch GitHub Actions
GitHub > Actions > Workflows > Security & Tests
  - Should show tests running
  - Green checkmark when complete
```

---

## Part 6: Environment Variable Management

### 6.1 Create Environment Variables Securely

**DO NOT use these values - CREATE YOUR OWN**:

```bash
# Generate secure random secrets (run on local machine)
# Never commit output to git!

# For JWT_SECRET:
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"

# For REFRESH_TOKEN_SECRET:
node -e "console.log('REFRESH_TOKEN_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"

# For PostgreSQL password:
node -e "console.log(require('crypto').randomBytes(16).toString('hex').toUpperCase())"

# Output example (DO NOT USE - generate your own):
# JWT_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
# REFRESH_TOKEN_SECRET=q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
```

### 6.2 Store Variables Safely

```
✓ DO: Use platform secret managers (Render, Vercel, Railway)
✓ DO: Different secrets for dev/staging/production
✓ DO: Rotate secrets every 90 days
✗ DON'T: Commit .env files to git
✗ DON'T: Share secrets in Slack/email
✗ DON'T: Use same secrets across environments
```

### 6.3 Secrets Rotation Schedule

```
Every 90 days (set calendar reminder):

1. Generate new JWT_SECRET
   - Copy old value (keep safe for 24 hours)
   - Generate new random secret
   - Update Render/Vercel/Railway
   - Deploy
   - Users automatically re-login (old tokens invalid)

2. Generate new REFRESH_TOKEN_SECRET
   - Same process as JWT_SECRET

3. Rotate database password
   - Change in PostgreSQL
   - Update DATABASE_URL
   - Deploy
   - Monitor for connection errors
```

---

## Part 7: Monitoring & Troubleshooting

### 7.1 Check Deployment Status

```bash
# Backend health
curl https://transvortex-api.onrender.com/api/health

# Frontend (should return HTML)
curl -I https://transvortex.vercel.app

# Check for both returning 200 OK
```

### 7.2 View Logs

**Render Backend Logs**:
```
Render Dashboard > Web Service > Logs
  - Real-time logs shown here
  - Filter by service, date, level
```

**Vercel Frontend Logs**:
```
Vercel Dashboard > Deployments > [Deployment] > Logs
  - Build logs
  - Function logs
  - Edge logs
```

**GitHub Actions Logs**:
```
GitHub > Actions > [Workflow] > [Run]
  - Test results
  - Lint errors
  - Security scan results
```

### 7.3 Common Issues & Fixes

| Issue | Solution |
|-------|----------|
| Backend returns 503 | Check .env variables, verify DB connection, check Render logs |
| CORS errors in frontend | Update `CORS_ORIGIN` in backend .env to match frontend URL |
| Database connection timeout | Verify DATABASE_URL format, check PostgreSQL status, test with psql |
| 401 Unauthorized errors | Verify JWT_SECRET matches on backend and in tokens |
| Rate limiting blocking requests | Increase `RATE_LIMIT_MAX_REQUESTS` if legitimate traffic |
| Deployment fails in GitHub Actions | Check `npm audit`, review lint errors, ensure Node v18+ |

### 7.4 Security Monitoring

```bash
# Weekly security checks

# 1. Check for exposed secrets
git log --all -p | grep -i "password\|secret\|key" | head -20

# 2. Review dependencies
npm audit

# 3. Check GitHub Security tab
# Settings > Security > Vulnerability alerts

# 4. Monitor Dependabot PRs
# Pull Requests > Filter by "Dependabot"
```

---

## Part 8: Post-Deployment Verification

### 8.1 Security Checklist

```bash
# Run these checks after deployment

# 1. Verify HTTPS only
curl -I https://transvortex.vercel.app | grep -i "strict-transport-security"
# Should show: strict-transport-security: max-age=31536000

# 2. Check security headers
curl -I https://transvortex-api.onrender.com/api/health | grep -i "x-"
# Should show: X-Content-Type-Options, X-Frame-Options, etc.

# 3. Test rate limiting
for i in {1..101}; do curl https://transvortex-api.onrender.com/api/health; done 2>&1 | grep -i "429"
# After 100 requests in 15 min, should see 429 Too Many Requests

# 4. Verify environment isolation
curl -s https://transvortex-api.onrender.com/api/health | grep -i "production"
# NODE_ENV should be "production"
```

### 8.2 Functional Testing

```bash
# 1. Register user
curl -X POST https://transvortex-api.onrender.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass123!",
    "name": "Test User"
  }'

# 2. Login
curl -X POST https://transvortex-api.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass123!"
  }'

# 3. Frontend should work at
# https://transvortex.vercel.app
```

---

## Part 9: Disaster Recovery

### 9.1 Database Backup

```bash
# Render: Automatic backups enabled (7-day retention)
# Access at: Render > PostgreSQL > Backups

# Manual backup (production database)
pg_dump postgresql://username:password@hostname:5432/dbname > backup.sql

# Restore from backup
psql postgresql://username:password@hostname:5432/dbname < backup.sql
```

### 9.2 Secrets Recovery

If secrets are compromised:

```bash
# 1. Generate new secrets immediately (don't re-use old ones)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 2. Update on all platforms
#    - Render environment
#    - Vercel environment
#    - GitHub Actions secrets

# 3. Deploy to apply new secrets
git push origin main

# 4. Notify users to reset passwords (due to potential breach)
```

### 9.3 Rollback to Previous Version

```bash
# Find previous commit
git log --oneline | head -5

# Revert to previous commit
git revert <commit-hash>
git push origin main

# Or force rollback
git reset --hard <commit-hash>
git push -f origin main
```

---

## Part 10: Cost Optimization

### Recommended Setup (FREE/CHEAP):

```
Frontend:    Vercel (Free tier)      - 100GB bandwidth/month
Backend:     Render (Free tier)      - 0.5 CPU, limited RAM, sleeps after 15 min inactivity
Database:    Render PostgreSQL (Free) - 256MB storage, 1 month retention
Monitoring:  GitHub Actions (Free)   - 2000 minutes/month
```

### Production Setup (PAID):

```
Frontend:    Vercel Pro ($20/month)  - 1TB bandwidth/month
Backend:     Render Starter ($7/month) - 0.5 CPU, always on
Database:    Render PostgreSQL ($15/month) - 1GB storage, auto backups
Monitoring:  Snyk ($99/month)        - Advanced dependency scanning
Total:       ~$41/month for production
```

---

## Summary

**Deployment Order**:
1. ✅ GitHub repository setup
2. ✅ PostgreSQL database creation
3. ✅ Backend deployment (Render)
4. ✅ Frontend deployment (Vercel)
5. ✅ Environment variables configuration
6. ✅ GitHub Actions CI/CD setup
7. ✅ Security verification
8. ✅ Functional testing
9. ✅ Monitoring setup
10. ✅ Disaster recovery plan

**Time Estimate**: 30-45 minutes for complete setup

**Maintenance**:
- Weekly: Review logs and security alerts
- Monthly: Update dependencies via Dependabot
- Quarterly: Rotate secrets
- As needed: Fix bugs via GitHub PRs

---

For questions or issues, refer to:
- [Node.js/Express Docs](https://expressjs.com)
- [PostgreSQL Docs](https://www.postgresql.org/docs)
- [Render Docs](https://render.com/docs)
- [Vercel Docs](https://vercel.com/docs)
- [SECURITY.md](./SECURITY.md) for security procedures
