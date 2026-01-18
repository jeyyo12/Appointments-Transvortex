# Security Policy

## Reporting Security Vulnerabilities

We take security seriously. If you discover a security vulnerability, **do not** open a public GitHub issue. Instead:

### Responsible Disclosure

1. **Email**: Send details to security@transvortex.com with subject "[SECURITY] Vulnerability Report"
2. **Include**:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if you have one)

3. **Timeline**:
   - We acknowledge receipt within 48 hours
   - We provide initial assessment within 1 week
   - We release a patch within 2 weeks for critical vulnerabilities

### Allowed Security Research

- Unauthorized access to non-public data
- Authentication/authorization bypasses
- Privilege escalation
- Data leakage
- Insecure deserialization
- Injection attacks (SQL, NoSQL, Command)
- Denial of Service attacks
- TLS/encryption weaknesses

### Explicitly NOT in Scope

- Social engineering
- Phishing attacks
- DDoS attacks
- Physical security issues
- Configuration vulnerabilities in user-deployed instances
- Third-party service vulnerabilities

## Security Best Practices for Users

### For Deployment

1. **Use HTTPS only** - Never deploy over HTTP in production
2. **Secrets Management**:
   - Never commit `.env` files
   - Use platform-specific secret management (Render, Railway, Vercel Secrets)
   - Rotate secrets every 90 days
   - Use different secrets for dev/staging/production

3. **Rate Limiting**:
   - Keep default limits (`RATE_LIMIT_MAX_REQUESTS=100`, `RATE_LIMIT_WINDOW_MS=900000`)
   - Adjust based on your traffic patterns
   - Monitor rate limit hits in logs

4. **Database Security**:
   - Use strong PostgreSQL passwords (20+ characters)
   - Enable SSL connections
   - Keep regular backups
   - Restrict database IP access

5. **JWT Secret**:
   - Use cryptographically secure random generation
   - Minimum 32 characters
   - Change immediately if compromised
   - Use different secrets for access vs. refresh tokens

6. **Authentication**:
   - Enforce password requirements (8+ chars, uppercase, numbers)
   - Implement account lockout after 5 failed attempts
   - Use HTTPS for all auth endpoints
   - Set secure cookie flags (HttpOnly, Secure, SameSite)

### For Development

```bash
# Install security tools
npm install -g snyk        # Dependency vulnerability scanning
npm install -g trivy       # Container image scanning
npm install -g npm-audit   # NPM package audit

# Regular checks
npm audit                  # Check for vulnerabilities
npm outdated              # Find outdated packages
snyk test                 # Advanced vulnerability scanning
```

## Security Headers

The application automatically includes these security headers (via Helmet):

| Header | Purpose |
|--------|---------|
| X-Content-Type-Options: nosniff | Prevent MIME type sniffing |
| X-Frame-Options: DENY | Prevent clickjacking |
| Strict-Transport-Security | Enforce HTTPS (31,536,000 seconds) |
| Content-Security-Policy | Control resource loading |
| X-XSS-Protection | Legacy XSS protection |
| Referrer-Policy: strict-origin-when-cross-origin | Control referrer data |

## Key Rotation

### When JWT Secret is Compromised

```bash
# 1. Generate new secret (32+ chars, random)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 2. Update environment variable
RENDER/RAILWAY_DASHBOARD -> Settings -> Environment Variables -> JWT_SECRET

# 3. Deploy (causes restart with new secret)
git push origin main

# 4. Existing sessions/tokens invalidated (users re-login)
```

### When Database Password Leaked

```bash
# 1. Generate new password
# 2. Update database password in PostgreSQL
# 3. Update DATABASE_URL environment variable
# 4. Deploy
# 5. Monitor for unauthorized access in logs
```

### When API Keys Compromised

- **Facebook API**: Regenerate in Facebook Business Manager
- **Google OAuth**: Create new credentials in Google Cloud Console
- **SendGrid**: Regenerate API keys in dashboard
- **Stripe**: Rotate API keys immediately

## Dependency Management

### Automated Updates

Dependabot automatically creates PRs for:
- Security updates (automatic merge for minor versions)
- Dependency updates (reviewed manually)
- GitHub Actions updates (reviewed manually)

### Manual Security Audits

```bash
cd backend

# NPM audit (shows vulnerabilities)
npm audit

# Install security audit tools
npm install --save-dev npm-audit-resolver

# Use snyk for advanced scanning
npm install -g snyk
snyk auth
snyk test
```

## Incident Response

### If Compromise Suspected

1. **Immediate Actions** (within 1 hour):
   - Revoke all active tokens
   - Force logout all users
   - Rotate compromised secrets
   - Review recent access logs

2. **Investigation** (within 4 hours):
   - Check auth logs for unauthorized access
   - Monitor database query logs
   - Review git commit history
   - Check deployment logs

3. **Communication** (within 24 hours):
   - Notify affected users if data accessed
   - Post incident report
   - Publish remediation steps

4. **Prevention** (within 1 week):
   - Implement additional monitoring
   - Update security policies
   - Add security tests
   - Conduct security review

## Compliance

This application is designed to support:
- **GDPR**: User data handling with consent
- **CCPA**: Data privacy controls
- **SOC 2 Type II**: Regular security audits
- **OWASP Top 10**: Protection against common vulnerabilities

## Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
- [Node.js Security Checklist](https://nodejs.org/en/docs/guides/nodejs-security/)
- [Express.js Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)

## Support

- **Documentation**: See README.md for setup and usage
- **Issues**: Use GitHub Issues for non-security bugs
- **Security Issues**: security@transvortex.com

---

**Last Updated**: 2024
**Maintained By**: Transvortex LTD Security Team
