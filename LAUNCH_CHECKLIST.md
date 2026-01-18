# Pre-Launch Security & Deployment Checklist

## 📋 Pre-Deployment Checklist (Use This!)

Use this checklist to verify everything before deploying to production.

---

## Phase 1: Local Development Setup ✓

- [ ] **Clone & Install**
  - [ ] Clone repository: `git clone https://github.com/YOUR_USERNAME/facebook-pages-manager.git`
  - [ ] Install frontend deps: `npm install`
  - [ ] Install backend deps: `cd backend && npm install`
  - [ ] Copy .env.example: `cp backend/.env.example backend/.env`

- [ ] **Database Setup**
  - [ ] PostgreSQL installed locally
  - [ ] Database created: `createdb transvortex_dev`
  - [ ] Schema imported: `psql transvortex_dev < backend/src/database/schema.sql`
  - [ ] Test connection: `psql postgresql://user:password@localhost:5432/transvortex_dev`

- [ ] **Environment Variables**
  - [ ] `backend/.env` created from `.env.example`
  - [ ] DATABASE_URL set correctly
  - [ ] JWT_SECRET generated (32+ chars): `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
  - [ ] REFRESH_TOKEN_SECRET generated (32+ chars)
  - [ ] No real secrets hardcoded in `.env`
  - [ ] `.env` file added to `.gitignore` (verify: `cat .gitignore | grep .env`)

- [ ] **Local Testing**
  - [ ] Backend starts: `cd backend && npm start` → Shows "Server running on port 3000"
  - [ ] Frontend loads: Open `index.html` in browser
  - [ ] Health check works: `curl http://localhost:3000/api/health` → Returns JSON with `"success": true`
  - [ ] No errors in console (Chrome DevTools)

---

## Phase 2: Git Repository Setup ✓

- [ ] **GitHub Repository**
  - [ ] Repository created on GitHub (PRIVATE)
  - [ ] Repository cloned locally
  - [ ] README.md reviewed and updated (company name, contact info)
  - [ ] LICENSE.md updated (proprietary, Transvortex LTD copyright)

- [ ] **Security Verification**
  - [ ] `.gitignore` exists and contains `.env`, `.env.*`, `node_modules/`, etc.
  - [ ] No `.env` files tracked: `git status | grep .env` → empty
  - [ ] No secrets in history: `git log --all -p | grep -i "password\|secret\|token"` → empty
  - [ ] Run setup script: `./setup-github.sh` (or `.ps1` on Windows)

- [ ] **Git Configuration**
  - [ ] Remote configured: `git remote -v` → Shows origin
  - [ ] Main branch: `git branch | grep main`
  - [ ] Initial commit pushed: `git push -u origin main`
  - [ ] `.env.example` (NOT `.env`) is tracked and pushed

---

## Phase 3: Backend Deployment (Render) ✓

- [ ] **Render Setup**
  - [ ] Render account created (render.com)
  - [ ] PostgreSQL database created on Render
    - [ ] Database name: `transvortex`
    - [ ] Region: Frankfurt (or closest to users)
    - [ ] Backup enabled
  - [ ] Database connection string copied (keep secret!)
  - [ ] Schema imported: `psql <DATABASE_URL> < backend/src/database/schema.sql`

- [ ] **Render Web Service**
  - [ ] New Web Service created
  - [ ] GitHub repository connected
  - [ ] Root directory: `backend`
  - [ ] Build command: `npm install`
  - [ ] Start command: `npm start`
  - [ ] Instance type: Starter or higher (not free tier for production)

- [ ] **Environment Variables (Render)**
  - [ ] NODE_ENV: `production`
  - [ ] PORT: `3000`
  - [ ] FRONTEND_URL: `https://your-domain.vercel.app` (will update after frontend deployed)
  - [ ] DATABASE_URL: `postgresql://...` (from Render PostgreSQL)
  - [ ] JWT_SECRET: 32+ char random string (generated, NOT default)
  - [ ] JWT_EXPIRE: `15m`
  - [ ] REFRESH_TOKEN_SECRET: 32+ char random string (different from JWT_SECRET)
  - [ ] REFRESH_TOKEN_EXPIRE: `7d`
  - [ ] CORS_ORIGIN: `https://your-domain.vercel.app` (will update)
  - [ ] LOG_LEVEL: `info`
  - [ ] LOG_FORMAT: `json`
  - [ ] RATE_LIMIT_WINDOW_MS: `900000`
  - [ ] RATE_LIMIT_MAX_REQUESTS: `100`

- [ ] **Backend Deployment**
  - [ ] Service deployed (shows "Live" status)
  - [ ] Service URL noted: `https://transvortex-api.onrender.com` (or similar)
  - [ ] Health check passes: `curl https://transvortex-api.onrender.com/api/health` → 200 OK
  - [ ] Logs reviewed for errors: Render Dashboard > Logs
  - [ ] No "secret leaked" warnings in logs

---

## Phase 4: Frontend Deployment (Vercel) ✓

- [ ] **Vercel Setup**
  - [ ] Vercel account created (vercel.com)
  - [ ] GitHub repository imported
  - [ ] Framework: "Other" (since it's static HTML)
  - [ ] Project name: `transvortex` or similar

- [ ] **Frontend Environment Variables**
  - [ ] VITE_API_URL: Backend URL from Phase 3 (e.g., `https://transvortex-api.onrender.com/api`)
  - [ ] Applied to: Production, Preview, Development

- [ ] **Frontend Deployment**
  - [ ] Deployment successful (shows "Ready")
  - [ ] Frontend URL noted: `https://transvortex.vercel.app`
  - [ ] Website loads: Open `https://transvortex.vercel.app` in browser
  - [ ] No 404 errors
  - [ ] Styles load correctly
  - [ ] Icons load correctly (Font Awesome)

- [ ] **CORS Update**
  - [ ] Render environment updated with final Vercel URL
  - [ ] Backend redeployed: `git push origin main` (auto-redeploy) or manual redeploy
  - [ ] CORS error test: Try registering from frontend

---

## Phase 5: Database & Migrations ✓

- [ ] **Database Schema**
  - [ ] All tables created: users, facebook_pages, refresh_tokens, posts (optional), activity_logs (optional)
  - [ ] Indexes created for performance
  - [ ] Constraints in place (unique emails, foreign keys, CHECK constraints)
  - [ ] Verify: `psql <DATABASE_URL> -c "\dt"`

- [ ] **Test Data (Optional)**
  - [ ] Sample user created (for testing)
  - [ ] Sample Facebook page created
  - [ ] Test registration: `curl -X POST https://transvortex-api.onrender.com/api/auth/register ...`
  - [ ] Test login: `curl -X POST https://transvortex-api.onrender.com/api/auth/login ...`

---

## Phase 6: Security Hardening ✓

- [ ] **HTTPS & Headers**
  - [ ] Frontend served over HTTPS: `curl -I https://transvortex.vercel.app | grep -i "strict-transport"`
  - [ ] Backend headers present: `curl -I https://transvortex-api.onrender.com/api/health | grep -i "x-content"`
  - [ ] Security headers visible: X-Frame-Options, X-Content-Type-Options, Content-Security-Policy

- [ ] **Rate Limiting**
  - [ ] Global limiter working: Make 101 requests in 15 min → 429 Too Many Requests
  - [ ] Auth limiter stricter: Make 6 login attempts → 429 Too Many Requests
  - [ ] Health checks excluded from limiter (can hit often)

- [ ] **Authentication**
  - [ ] Password hashing working: User passwords not stored as plaintext
  - [ ] JWT tokens generate: Login returns `accessToken` and `refreshToken`
  - [ ] Token expiration: Access tokens expire in 15 minutes
  - [ ] Refresh tokens work: Refresh endpoint issues new access token
  - [ ] Invalid tokens rejected: Bearer token validation working

- [ ] **Data Validation**
  - [ ] Email validation: Invalid emails rejected
  - [ ] Password requirements enforced: 8+ chars, uppercase, numbers
  - [ ] Input sanitization: XSS attempts prevented
  - [ ] SQL injection protected: parameterized queries used

- [ ] **Error Handling**
  - [ ] Production errors safe: No stack traces in responses
  - [ ] No database details leaked: Generic error messages
  - [ ] No file paths exposed: Error messages don't reveal structure
  - [ ] Validation errors helpful: Specific field errors returned

- [ ] **Secrets Management**
  - [ ] No secrets in code: `grep -r "password=\|secret=\|token=" backend/src --exclude-dir=node_modules`
  - [ ] Environment variables validated: Zod schema enforces required fields
  - [ ] JWT secrets >= 32 chars: Verified in .env
  - [ ] Different secrets for each service: JWT vs Refresh tokens

---

## Phase 7: GitHub & CI/CD ✓

- [ ] **Branch Protection**
  - [ ] Main branch protected: Settings > Branches > Add rule
  - [ ] Require PR reviews: At least 1 reviewer
  - [ ] Require status checks: GitHub Actions must pass
  - [ ] Require branches up-to-date: No stale PRs merged

- [ ] **GitHub Actions**
  - [ ] CI workflow runs: `.github/workflows/ci.yml`
  - [ ] Tests pass: Lint, tests, security scan all green
  - [ ] Security audit passing: No high/critical vulnerabilities
  - [ ] Workflow triggers on push and PR

- [ ] **GitHub Secrets**
  - [ ] RENDER_API_KEY configured (if auto-deploying)
  - [ ] Other platform secrets added as needed
  - [ ] No real credentials in repo secrets

- [ ] **Dependabot**
  - [ ] Dependabot enabled: `.github/dependabot.yml` exists
  - [ ] PRs auto-created for updates (watch GitHub PRs)
  - [ ] Security updates prioritized

---

## Phase 8: Monitoring & Alerts ✓

- [ ] **Render Monitoring**
  - [ ] Error rate tracked: Render Dashboard > Metrics
  - [ ] CPU/Memory monitored: Should be stable
  - [ ] Database connection pool healthy
  - [ ] Logs reviewed for warnings

- [ ] **Vercel Monitoring**
  - [ ] Page load times tracked
  - [ ] No 5xx errors: Vercel Dashboard > Deployments
  - [ ] Build times reasonable: < 5 minutes

- [ ] **GitHub Security**
  - [ ] Vulnerability alerts enabled: Settings > Security
  - [ ] Dependabot configured: Automated PRs for updates
  - [ ] Code scanning enabled (Advanced Security): Detect vulnerabilities

---

## Phase 9: Documentation ✓

- [ ] **README.md**
  - [ ] Project description clear
  - [ ] Quick start instructions accurate
  - [ ] Prerequisites listed (Node.js, PostgreSQL, Git)
  - [ ] Deployment instructions link to DEPLOYMENT.md
  - [ ] License clearly stated (PROPRIETARY)

- [ ] **DEPLOYMENT.md**
  - [ ] Step-by-step instructions tested
  - [ ] Copy-paste commands work
  - [ ] All environment variables documented
  - [ ] Troubleshooting section helpful
  - [ ] Updated with actual URLs and credentials (placeholder values)

- [ ] **SECURITY.md**
  - [ ] Vulnerability reporting process clear
  - [ ] Security headers documented
  - [ ] Secrets rotation instructions clear
  - [ ] Incident response plan defined
  - [ ] Compliance checklist (GDPR, CCPA, SOC 2)

- [ ] **Code Comments**
  - [ ] Complex logic explained
  - [ ] TODO items documented
  - [ ] Database schema commented
  - [ ] Environment variable purposes clear

---

## Phase 10: Final Testing ✓

- [ ] **User Flow Testing**
  - [ ] Registration works end-to-end
  - [ ] Login works with correct credentials
  - [ ] Login fails with wrong password (rate limited after 5 attempts)
  - [ ] Token refresh works
  - [ ] Logout invalidates session
  - [ ] Protected routes require authentication

- [ ] **Data Integrity**
  - [ ] User data persisted in database
  - [ ] Facebook pages stored correctly
  - [ ] Data relationships correct (user → pages)
  - [ ] No data loss on restart

- [ ] **Cross-Browser Testing**
  - [ ] Chrome: Latest version
  - [ ] Firefox: Latest version
  - [ ] Safari: Latest version (Mac)
  - [ ] Edge: Latest version (Windows)
  - [ ] Mobile: iOS Safari, Android Chrome

- [ ] **Mobile Responsiveness**
  - [ ] Layouts work on 320px (mobile)
  - [ ] Layouts work on 768px (tablet)
  - [ ] Layouts work on 1024px+ (desktop)
  - [ ] Touch-friendly buttons (48px minimum)
  - [ ] No horizontal scroll

- [ ] **Performance**
  - [ ] Frontend: Lighthouse score 90+
  - [ ] Backend response time: < 200ms (healthy endpoints)
  - [ ] Database queries: < 100ms
  - [ ] No memory leaks (check DevTools)

---

## Phase 11: Secrets Rotation Setup ✓

- [ ] **Create Rotation Schedule**
  - [ ] Calendar reminder set: Every 90 days
  - [ ] Rotation procedure documented
  - [ ] Team notified of schedule

- [ ] **Test Rotation Process**
  - [ ] Generate new JWT_SECRET
  - [ ] Update on Render/Vercel
  - [ ] Deploy and verify working
  - [ ] Old secret saved (for 24 hours if needed)
  - [ ] Document rotation timestamp

---

## Phase 12: Go-Live ✓

- [ ] **Final Verification**
  - [ ] All checklist items completed
  - [ ] No blocking issues remaining
  - [ ] Team sign-off obtained
  - [ ] Backup plan documented (rollback procedure)

- [ ] **Communication**
  - [ ] Team notified: Deployment in progress
  - [ ] Users notified: Service availability
  - [ ] Support team trained: Know common issues
  - [ ] Incident response team on standby: First 24 hours

- [ ] **Post-Launch (First 24 Hours)**
  - [ ] Monitor error rates: Render & Vercel dashboards
  - [ ] Check GitHub Actions: All deployments successful
  - [ ] User feedback collected: Reach out to test users
  - [ ] Security scan results reviewed: No new vulnerabilities
  - [ ] Database performance: Slow query log reviewed

- [ ] **Post-Launch (First Week)**
  - [ ] Scale if needed: Increase backend resources if needed
  - [ ] Optimize slow endpoints: Monitor performance metrics
  - [ ] Security incidents (if any): Follow SECURITY.md procedures
  - [ ] User adoption: Training sessions if needed
  - [ ] Weekly team sync: Discuss learnings & improvements

---

## 🚨 CRITICAL - Do NOT Launch Without These:

- [ ] No `.env` file in git history
- [ ] No secrets in code or documentation
- [ ] JWT_SECRET >= 32 characters (random, not default)
- [ ] HTTPS working on both frontend and backend
- [ ] Database backups configured
- [ ] Error handling doesn't leak stack traces
- [ ] Rate limiting tested and working
- [ ] CORS properly configured with origin whitelist
- [ ] All dependencies are secure (npm audit pass)
- [ ] GitHub branch protection enabled
- [ ] Documentation complete and tested

---

## 📞 Support Contacts

**If Something Goes Wrong:**
1. Check logs: Render Dashboard > Logs, Vercel Dashboard > Logs
2. Review [DEPLOYMENT.md](./DEPLOYMENT.md#73-common-issues--fixes)
3. Review [SECURITY.md](./SECURITY.md)
4. Contact: security@transvortex.com (for security issues)

---

**Status**: ✅ Ready for Production
**Completed By**: [Your Name]
**Date**: [Date]
**Notes**: 

---

## Signature

- [ ] Frontend Lead Approved: _______________ Date: _____
- [ ] Backend Lead Approved: _______________ Date: _____
- [ ] Security Lead Approved: ______________ Date: _____
- [ ] DevOps Lead Approved: _______________ Date: _____

✅ **All signatures collected? Ready to launch!**
