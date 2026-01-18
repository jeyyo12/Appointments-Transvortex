# Transvortex Facebook Pages Manager

[![Security & Tests](https://github.com/YOUR_USERNAME/facebook-pages-manager/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_USERNAME/facebook-pages-manager/actions)
[![Dependabot Status](https://img.shields.io/badge/Dependabot-enabled-success)](https://dependabot.com)
[![License](https://img.shields.io/badge/license-PROPRIETARY-red)](LICENSE)

A professional SaaS dashboard for managing Facebook pages and scheduling posts efficiently. Built with modern web technologies, enterprise-grade security, and responsive design.

## 🎯 Features

### Frontend
- ✅ Modern responsive design (mobile-first approach)
- ✅ Dark-themed premium header with animations
- ✅ Real-time status tracking for Facebook pages
- ✅ Live activity indicators and timestamps
- ✅ Animated statistics with count-up effects
- ✅ Persistent data storage (localStorage)
- ✅ Beautiful UI with rusty orange (#FF8A3D) branding
- ✅ Accessibility support (WCAG AA contrast, motion reduction)
- ✅ Font Awesome icon integration

### Backend
- ✅ Node.js + Express.js REST API
- ✅ JWT authentication (access + refresh tokens)
- ✅ Role-based authorization (RBAC)
- ✅ Rate limiting (global + auth-specific)
- ✅ Security headers via Helmet
- ✅ CORS protection with origin whitelist
- ✅ Input validation with express-validator
- ✅ Password hashing with bcryptjs
- ✅ PostgreSQL database integration
- ✅ Centralized error handling

### Security
- ✅ Never-commit-secrets strategy (.gitignore + .env.example)
- ✅ Environment variable validation (Zod schema)
- ✅ Safe error messages (no stack trace leaks in production)
- ✅ GitHub Actions CI/CD with security checks
- ✅ Dependabot automated dependency updates
- ✅ HTTPS enforced in production
- ✅ SQL injection prevention
- ✅ XSS protection via Helmet CSP

### DevOps
- ✅ One-command deployment to Vercel (frontend) + Render (backend)
- ✅ Automatic GitHub Actions on git push
- ✅ PostgreSQL database setup instructions
- ✅ Environment variable templates
- ✅ Health check endpoints for monitoring
- ✅ Structured JSON logging
- ✅ Database backup strategy

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ ([download](https://nodejs.org))
- PostgreSQL 13+ ([download](https://postgresql.org))
- Git ([download](https://git-scm.com))
- GitHub account (for deployment)

### Local Development (5 minutes)

```bash
# 1. Clone repository
git clone https://github.com/YOUR_USERNAME/facebook-pages-manager.git
cd facebook-pages-manager

# 2. Setup frontend
npm install

# 3. Setup backend
cd backend
npm install
cp .env.example .env
# Edit .env with your PostgreSQL details

# 4. Create database (see DEPLOYMENT.md Part 2)
# Run SQL schema creation script

# 5. Start backend
npm start
# Should show: Server running on port 3000

# 6. In another terminal, start frontend
cd ..
# Open index.html in browser or use:
python -m http.server 8000
# Visit: http://localhost:8000
```

### Production Deployment (30 minutes)

See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete step-by-step instructions including:
- GitHub repository setup
- PostgreSQL database creation
- Backend deployment to Render
- Frontend deployment to Vercel
- Environment configuration
- Security verification

**TL;DR**:
```bash
git push origin main  # Triggers auto-deploy to Vercel + Render
```

### Deploy with GitHub Pages (FREE - Static Site Only)

If you only need the static frontend (HTML/CSS/JS) without a Node backend, use **GitHub Pages**:

**Prerequisites:**
- Public GitHub repository
- Static HTML in repository root (`index.html`)
- All assets use **relative paths** (e.g., `./styles.css`, `./Images/Logo.png`, `./script.js`)

**Step 1: Verify Relative Paths**
```html
<!-- ✅ CORRECT: Relative paths -->
<link rel="stylesheet" href="styles.css">
<img src="Images/Logo.png">
<script src="script.js"></script>

<!-- ❌ WRONG: Absolute paths (won't work on GitHub Pages) -->
<link rel="stylesheet" href="/styles.css">
<img src="/Images/Logo.png">
```

**Step 2: Enable GitHub Pages in Repository Settings**
1. Go to: **Settings** > **Pages**
2. Select: **Deploy from a branch**
3. Choose: **main** (or your default branch)
4. Choose: **/(root)** as the directory
5. Click **Save**

**Step 3: Push Code to GitHub**
```bash
git add .
git commit -m "Enable GitHub Pages deployment"
git push origin main
```

**Step 4: Verify Deployment**
- Go to: **Settings** > **Pages**
- Look for: "Your site is live at `https://yourusername.github.io/Appointments-Transvortex/`"
- Visit the URL (may take 1-2 minutes to deploy)
- Hard refresh: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)

**Troubleshooting:**
- If assets don't load: Check that paths are relative (no `/` at start)
- If 404 appears: Verify `index.html` is in repository root
- Still loading old version: Hard refresh or clear browser cache

**Cost:** ✅ **100% FREE** - No credit card needed

## 📁 Project Structure

```
facebook-pages-manager/
├── index.html                  # Frontend HTML
├── styles.css                  # Frontend styles (800+ lines)
├── script.js                   # Frontend JavaScript (300+ lines)
├── vercel.json                 # Vercel configuration
├── .gitignore                  # Git security (no .env, secrets)
├── .env.example                # Environment variables template
├── DEPLOYMENT.md               # Complete deployment guide
├── SECURITY.md                 # Security policies & procedures
├── LICENSE                     # Proprietary license
├── README.md                   # This file
│
├── backend/                    # Node.js Express API
│   ├── package.json            # Dependencies & scripts
│   ├── .env.example            # Backend env template
│   │
│   └── src/
│       ├── server.js           # Main app entry point
│       │
│       ├── config/
│       │   └── env.js          # Environment validation (Zod)
│       │
│       ├── middleware/
│       │   ├── security.js     # Helmet, CORS, rate limiting
│       │   ├── auth.js         # JWT, RBAC middleware
│       │   └── errorHandler.js # Centralized error handling
│       │
│       ├── routes/
│       │   ├── health.js       # Health check endpoints
│       │   └── auth.js         # Auth routes (register, login, refresh)
│       │
│       └── utils/              # Utility functions (future)
│
└── .github/
    ├── workflows/
    │   └── ci.yml              # GitHub Actions: lint, test, security
    └── dependabot.yml          # Automated dependency updates
```

## 🔐 Security Features

### Secrets Management
- ✅ `.env` files ignored by Git (`.gitignore`)
- ✅ `.env.example` safely committed with placeholders
- ✅ Environment variable validation with Zod schema
- ✅ Minimum 32-character JWT secrets enforced

### Authentication
- ✅ JWT tokens (15-minute access, 7-day refresh)
- ✅ Password hashing with bcryptjs (12 rounds)
- ✅ Secure password requirements (8+ chars, uppercase, numbers)
- ✅ Account lockout after 5 failed attempts

### Network Security
- ✅ HTTPS enforced in production (HSTS)
- ✅ CORS with origin whitelist (whitelist-first approach)
- ✅ Rate limiting (100 requests/900s globally, 5 auth attempts/15min)
- ✅ Request size limits (10MB)
- ✅ Content Security Policy (CSP) headers
- ✅ X-Frame-Options to prevent clickjacking
- ✅ X-Content-Type-Options to prevent MIME sniffing

### Data Protection
- ✅ SQL parameterized queries (via Zod + express-validator)
- ✅ Input validation on all endpoints
- ✅ Safe error messages (detailed logs server-side only)
- ✅ No stack trace leaks in production responses

### Compliance
- ✅ GDPR-ready (user data handling with consent)
- ✅ CCPA-ready (data privacy controls)
- ✅ SOC 2 Type II compatible
- ✅ OWASP Top 10 protections

For detailed security procedures, see [SECURITY.md](./SECURITY.md).

## 🎨 Design System

### Color Palette
- **Primary Orange**: `#FF8A3D` - Main brand color
- **Primary Orange Dark**: `#F47C2C` - Hover states
- **Warm Background**: `#FFF7F1` - Page background
- **Section Surface**: `#FDEEE3` - Card backgrounds
- **Success Mint**: `#2ECC9A` - Posted status
- **Warning Amber**: `#FFA500` - Pending status
- **Danger Red**: `#EF4444` - Delete/inactive status
- **Text Primary**: `#1F1F1F` - Main text
- **Text Secondary**: `#8A7F78` - Subtle text

### Spacing (8px Grid)
```css
--space-1: 8px
--space-2: 16px
--space-3: 24px
--space-4: 32px
--space-5: 40px
--space-6: 48px
```

### Animations
- **Logo Float**: 6-second cycle (smooth vertical movement)
- **Glow Pulse**: 7-second cycle (breathing effect)
- **Count Up**: 0.4-second rapid pulse (stat updates)
- **Heartbeat**: 1.8-second cycle (activity indicators)
- **All animations**: Respect `prefers-reduced-motion` for accessibility

### Typography
- **Font Family**: System fonts (`-apple-system`, `Segoe UI`, `Roboto`)
- **Headings**: Bold (600-700 weight)
- **Body**: Regular (400 weight)
- **Monospace**: `Monaco`, `Courier New` (code)

## 📊 API Endpoints

### Health Checks (Public)
```
GET /api/health              # Server status
GET /api/ready               # Service readiness
```

### Authentication
```
POST /api/auth/register      # Register new user
POST /api/auth/login         # Login with email/password
POST /api/auth/refresh       # Get new access token
POST /api/auth/logout        # Logout & invalidate token
GET  /api/auth/me            # Get current user (protected)
```

### Facebook Pages (Protected)
*Coming soon - requires JWT authentication*
```
GET    /api/pages            # List user's Facebook pages
POST   /api/pages            # Create new page
PUT    /api/pages/:id        # Update page
DELETE /api/pages/:id        # Delete page
PATCH  /api/pages/:id/status # Update post status
```

## 🧪 Testing

### Run Tests Locally
```bash
cd backend
npm test              # Run all tests
npm run lint          # Check code style
npm audit             # Security audit
```

### GitHub Actions (Automatic)
Tests run automatically on:
- Every `git push` to main or develop
- Every pull request
- Scheduled daily security scan

View results: GitHub > Actions > Workflows

## 📈 Monitoring

### Backend Logs
```bash
# Render dashboard
Render > Web Service > Logs  # Real-time server logs

# Log format
[timestamp] [LEVEL] [MODULE] message
```

### Health Endpoints
```bash
# Check if server is alive
curl https://api.example.com/api/health

# Check if services are ready
curl https://api.example.com/api/ready
```

### Security Monitoring
```bash
# Weekly
npm audit              # Check for vulnerabilities

# Monthly
# GitHub > Security > Vulnerability alerts

# Quarterly
# Rotate secrets (see SECURITY.md)
```

## 🔄 Secrets Rotation

Every 90 days, rotate:

```bash
# 1. Generate new secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 2. Update on platform (Render, Vercel, Railway)

# 3. Deploy
git push origin main

# 4. Verify
curl https://api.example.com/api/health
```

See [SECURITY.md](./SECURITY.md#secrets-rotation) for detailed procedures.

## 🐛 Troubleshooting

### Backend won't start
```bash
# Check environment variables
cat backend/.env | grep -E "DATABASE_URL|JWT_SECRET"

# Check port availability
lsof -i :3000

# Check database connection
psql $DATABASE_URL -c "SELECT 1"
```

### Frontend not connecting to backend
```bash
# Check CORS origin in backend
grep CORS_ORIGIN backend/.env

# Should match frontend URL
# For development: http://localhost:8000
# For production: https://your-domain.vercel.app
```

### Database connection timeout
```bash
# Verify PostgreSQL is running
psql -V

# Test connection string
psql "postgresql://user:pass@host:5432/db"

# Check firewall rules (if remote DB)
```

### GitHub Actions tests failing
```bash
# Check workflow file
cat .github/workflows/ci.yml

# Run locally to debug
npm audit          # Security
npm run lint       # Lint errors
npm test           # Test failures
```

## 📞 Support

- **Documentation**: See [DEPLOYMENT.md](./DEPLOYMENT.md) and [SECURITY.md](./SECURITY.md)
- **Issues**: Use GitHub Issues for bugs and feature requests
- **Security Issues**: See [SECURITY.md](./SECURITY.md#reporting-security-vulnerabilities)
- **Questions**: Open GitHub Discussions

## 📄 License

**PROPRIETARY** - All rights reserved by Transvortex LTD.

Do not:
- Distribute without permission
- Use for commercial purposes
- Modify and resell
- Share source code publicly

See [LICENSE](./LICENSE) file for details.

## 🤝 Contributing

This is a proprietary project. External contributions are not accepted.

Internal contributors:
1. Create feature branch: `git checkout -b feature/my-feature`
2. Make changes and commit: `git commit -am 'Add my feature'`
3. Push branch: `git push origin feature/my-feature`
4. Open pull request on GitHub
5. Wait for GitHub Actions checks to pass
6. Request code review from maintainers

## 📅 Changelog

### Version 1.0.0 (2024)
- ✅ Initial release
- ✅ Frontend with responsive design
- ✅ Backend with JWT authentication
- ✅ Security infrastructure
- ✅ Deployment automation
- ✅ GitHub Actions CI/CD

## 🎉 Acknowledgments

Built with:
- [Express.js](https://expressjs.com) - Web framework
- [PostgreSQL](https://www.postgresql.org) - Database
- [Helmet](https://helmetjs.org) - Security headers
- [JWT](https://jwt.io) - Authentication
- [bcryptjs](https://github.com/dcodeIO/bcrypt.js) - Password hashing
- [Zod](https://zod.dev) - Schema validation
- [Font Awesome](https://fontawesome.com) - Icons

## 👨‍💼 About Transvortex LTD

Transvortex LTD specializes in innovative social media management solutions for businesses. This project exemplifies our commitment to security, performance, and user experience.

---

**Version**: 1.0.0  
**Last Updated**: 2024  
**Status**: Production Ready ✅
