# 🚀 QUICK START REFERENCE GUIDE

**Transvortex Facebook Pages Manager**  
Copy-paste ready commands for rapid deployment

---

## 📋 Table of Contents

1. [Local Development (5 min)](#local-development)
2. [GitHub Setup (2 min)](#github-setup)
3. [Database Setup (5 min)](#database-setup)
4. [Backend Deployment (10 min)](#backend-deployment)
5. [Frontend Deployment (5 min)](#frontend-deployment)
6. [Generate Secrets (2 min)](#generate-secrets)
7. [Test Everything (5 min)](#test-everything)
8. [Troubleshooting (as needed)](#troubleshooting)

**Total Time: ~30 minutes**

---

## Local Development

### 1️⃣ Clone & Install (3 min)

```bash
# Clone repository
git clone https://github.com/YOUR_USERNAME/facebook-pages-manager.git
cd facebook-pages-manager

# Install frontend dependencies
npm install

# Install backend dependencies
cd backend
npm install
cd ..

# Copy environment template
cp backend/.env.example backend/.env
```

### 2️⃣ Setup Database (2 min)

```bash
# Create database (macOS/Linux)
createdb transvortex_dev

# Or using psql
psql -U postgres -c "CREATE DATABASE transvortex_dev;"

# Import schema
psql transvortex_dev < backend/src/database/schema.sql

# Verify tables created
psql transvortex_dev -c "\dt"
```

### 3️⃣ Configure Environment (1 min)

```bash
# Edit backend/.env
nano backend/.env
# Or use your editor:
# - Set DATABASE_URL correctly
# - Generate JWT_SECRET and REFRESH_TOKEN_SECRET (see below)
```

### 4️⃣ Start Backend

```bash
cd backend
npm start
# Should show: [timestamp] Server running on port 3000 (development)
```

### 5️⃣ Start Frontend (in new terminal)

```bash
# From project root
python -m http.server 8000
# Then open: http://localhost:8000
```

---

## GitHub Setup

### 1️⃣ Initialize Repository

```bash
# From project root
git init
git add .
git commit -m "Initial commit: Frontend + Backend + Security Setup"
```

### 2️⃣ Create GitHub Repository

```
1. Go to GitHub.com
2. Click "+" > "New repository"
3. Name: facebook-pages-manager
4. Set to PRIVATE
5. Click "Create repository"
```

### 3️⃣ Connect to GitHub

```bash
# Replace YOUR_USERNAME with your GitHub username
git remote add origin https://github.com/YOUR_USERNAME/facebook-pages-manager.git
git branch -M main
git push -u origin main
```

### 4️⃣ Verify Security

```bash
# Check .env files are ignored
git status | grep .env
# Should show: nothing (empty)

# Verify .gitignore has .env
cat .gitignore | grep "\.env"
# Should show: .env, .env.local, etc.
```

---

## Database Setup

### 1️⃣ Generate Database URL

**Option A: Using Render PostgreSQL (Recommended)**

```
1. Go to https://render.com
2. Sign up / Log in
3. Click "New +" > "PostgreSQL"
4. Set name: transvortex-db
5. Copy connection string from "Data" tab
6. Format: postgresql://user:password@host:5432/dbname
```

**Option B: Using Railway PostgreSQL**

```
1. Go to https://railway.app
2. Sign up / Log in
3. Create new project
4. Add PostgreSQL plugin
5. Copy database URL from "Data" tab
```

### 2️⃣ Update Environment

```bash
# Edit backend/.env
nano backend/.env

# Update DATABASE_URL with your connection string
DATABASE_URL=postgresql://user:password@host:5432/dbname
```

### 3️⃣ Initialize Schema

```bash
# Using psql command line
psql "postgresql://user:password@host:5432/dbname" < backend/src/database/schema.sql

# Or copy-paste the SQL from backend/src/database/schema.sql into pgAdmin
```

### 4️⃣ Verify Tables

```bash
# Connect to database
psql "postgresql://user:password@host:5432/dbname"

# List tables
\dt

# Exit
\q
```

---

## Backend Deployment

### 1️⃣ Deploy to Render

```
1. Go to https://render.com
2. Sign up / Log in
3. Click "New +" > "Web Service"
4. Connect GitHub repository
5. Select facebook-pages-manager
6. Configuration:
   - Name: transvortex-api
   - Environment: Node
   - Build Command: npm install
   - Start Command: npm start
   - Root Directory: backend
7. Create Web Service
```

### 2️⃣ Add Environment Variables

```
In Render Dashboard > Web Service > Environment:

Copy-paste each line (one per variable):

NODE_ENV=production
PORT=3000
FRONTEND_URL=https://your-domain.vercel.app
DATABASE_URL=postgresql://user:password@host:5432/dbname

JWT_SECRET=<GENERATE_YOUR_OWN_SEE_BELOW>
JWT_EXPIRE=15m
REFRESH_TOKEN_SECRET=<GENERATE_YOUR_OWN_SEE_BELOW>
REFRESH_TOKEN_EXPIRE=7d

LOG_LEVEL=info
LOG_FORMAT=json

RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

CORS_ORIGIN=https://your-domain.vercel.app
```

### 3️⃣ Deploy

```
Render Dashboard > Web Service > Deploy
- Wait for status to turn "Live" (green)
- Note your URL: https://transvortex-api.onrender.com
```

### 4️⃣ Test Backend

```bash
# Health check
curl https://transvortex-api.onrender.com/api/health

# Should return:
# {"success":true,"message":"...","timestamp":"...","environment":"production"}
```

---

## Frontend Deployment

### 1️⃣ Deploy to Vercel

```
1. Go to https://vercel.com
2. Sign up / Log in
3. Click "Add New..." > "Project"
4. Import your GitHub repository
5. Select facebook-pages-manager
6. Framework: Other (static site)
7. Project Name: transvortex
8. Click "Deploy"
```

### 2️⃣ Add Environment Variables

```
Vercel Dashboard > Project > Settings > Environment Variables:

Add:
VITE_API_URL=https://transvortex-api.onrender.com/api

Applied to: Production, Preview, Development
```

### 3️⃣ Verify Deployment

```
Vercel Dashboard > Deployments
- Wait for status to show "Ready" (checkmark)
- Visit: https://transvortex.vercel.app
- Should load without errors
```

### 4️⃣ Update Backend CORS

```
Render Dashboard > Web Service > Environment

Update CORS_ORIGIN:
CORS_ORIGIN=https://transvortex.vercel.app

Save and redeploy (Render auto-redeploys)
```

---

## Generate Secrets

### 🔐 Create JWT Secret (32+ characters)

```bash
# Run on your local machine (NOT on server)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Output example (USE YOUR OWN):
# a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2

# Copy and paste into Render environment variable: JWT_SECRET
```

### 🔐 Create Refresh Token Secret (32+ characters)

```bash
# Same command, generates different value
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Copy and paste into Render environment variable: REFRESH_TOKEN_SECRET
```

### ✅ Verify Secrets

```bash
# Check in Render dashboard
Render > Web Service > Environment

- JWT_SECRET should NOT be visible (masked as •••••)
- REFRESH_TOKEN_SECRET should NOT be visible
- Secrets should be different from each other
```

---

## Test Everything

### 1️⃣ Test Backend Health

```bash
# Public health check
curl https://transvortex-api.onrender.com/api/health

# Expected response:
# {
#   "success": true,
#   "message": "Server is healthy",
#   "timestamp": "2024-01-01T12:00:00Z",
#   "environment": "production"
# }
```

### 2️⃣ Test User Registration

```bash
curl -X POST https://transvortex-api.onrender.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123!",
    "name": "Test User"
  }'

# Expected: 201 Created with access and refresh tokens
```

### 3️⃣ Test User Login

```bash
curl -X POST https://transvortex-api.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123!"
  }'

# Expected: 200 OK with tokens
```

### 4️⃣ Test Frontend

```
1. Open https://transvortex.vercel.app in browser
2. Verify page loads without errors
3. Check browser console (F12 > Console) for errors
4. Verify all buttons work (no JavaScript errors)
5. Try adding a Facebook page (uses localStorage)
```

### 5️⃣ Test Security Headers

```bash
# Check HTTPS enforcement
curl -I https://transvortex.vercel.app | grep -i "strict-transport"

# Check backend headers
curl -I https://transvortex-api.onrender.com/api/health | grep -i "x-"

# Expected headers:
# - X-Frame-Options
# - X-Content-Type-Options
# - Strict-Transport-Security
```

---

## Troubleshooting

### Backend Won't Start

```bash
# 1. Check logs
Render > Web Service > Logs

# 2. Verify environment variables
Render > Environment > Check all required vars present

# 3. Test database connection
psql "postgresql://user:password@host:5432/dbname" -c "SELECT 1;"

# 4. Check port availability
lsof -i :3000
```

### Frontend Not Loading

```bash
# 1. Check deployment status
Vercel > Deployments > Should show "Ready"

# 2. Check browser console
Open site in browser > F12 > Console tab

# 3. Verify build succeeded
Vercel > Deployments > [Latest] > Logs

# 4. Clear browser cache
CTRL+SHIFT+DELETE (or Cmd+Shift+Delete on Mac)
```

### CORS Errors

```bash
# 1. Check backend CORS_ORIGIN
Render > Environment > CORS_ORIGIN should match frontend URL

# 2. Verify frontend URL
https://transvortex.vercel.app (no trailing slash)

# 3. Redeploy backend after updating CORS
Render auto-redeploys on environment change
```

### Database Connection Issues

```bash
# 1. Test connection string locally
psql "postgresql://user:password@host:5432/dbname"

# 2. Check if database is up
Render > PostgreSQL > Should show "Available"

# 3. Verify schema created
psql "postgresql://user:password@host:5432/dbname" -c "\dt"

# 4. Check Render logs for connection errors
Render > PostgreSQL > Logs
```

### Tests Failing in GitHub Actions

```bash
# 1. Check workflow status
GitHub > Actions > Latest workflow run

# 2. View error logs
Click failing job > Review error output

# 3. Common issues:
   - npm audit vulnerabilities → npm install --save updates
   - Lint errors → npm run lint to see details
   - Tests failing → npm test locally to debug

# 4. Fix locally then push:
git add .
git commit -m "Fix: resolve GitHub Actions issues"
git push origin main
```

---

## 🔐 Secrets Rotation (Every 90 Days)

### 1️⃣ Generate New Secrets

```bash
# New JWT_SECRET
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"

# New REFRESH_TOKEN_SECRET
node -e "console.log('REFRESH_TOKEN_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
```

### 2️⃣ Update Render Environment

```
Render Dashboard > Web Service > Environment
- Update JWT_SECRET with new value
- Update REFRESH_TOKEN_SECRET with new value
- Save changes (auto-redeploys)
```

### 3️⃣ Verify New Secrets Work

```bash
curl https://transvortex-api.onrender.com/api/health
# Should return 200 OK

# Try login with new tokens
curl -X POST https://transvortex-api.onrender.com/api/auth/login ...
```

### 4️⃣ Document Rotation

```bash
# Keep record of rotation
- Old secrets: [saved securely, delete after 24 hours]
- New secrets: [stored in Render]
- Date rotated: [timestamp]
- Next rotation: [date + 90 days]
```

---

## 📞 Quick Links

| Resource | Link |
|----------|------|
| GitHub Repository | https://github.com/YOUR_USERNAME/facebook-pages-manager |
| Render Dashboard | https://dashboard.render.com |
| Vercel Dashboard | https://vercel.com/dashboard |
| PostgreSQL Docs | https://www.postgresql.org/docs |
| Express.js Docs | https://expressjs.com |
| Full Deployment Guide | [DEPLOYMENT.md](./DEPLOYMENT.md) |
| Security Policies | [SECURITY.md](./SECURITY.md) |
| Launch Checklist | [LAUNCH_CHECKLIST.md](./LAUNCH_CHECKLIST.md) |

---

## ⚡ Critical Reminders

- ✅ **HTTPS Only** - Always use https:// in production
- ✅ **Never Commit Secrets** - `.env` files must be in `.gitignore`
- ✅ **32+ Char Secrets** - JWT secrets must be strong and random
- ✅ **Keep Backups** - Enable database backups on Render
- ✅ **Rotate Secrets** - Every 90 days minimum
- ✅ **Monitor Logs** - Check Render logs daily in first week

---

**Need help?** Check [DEPLOYMENT.md](./DEPLOYMENT.md) or [SECURITY.md](./SECURITY.md)

---

**Version**: 1.0  
**Last Updated**: 2024
