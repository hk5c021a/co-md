# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.0.x   | :white_check_mark: |

## Reporting a Vulnerability

**Do not open a public issue.** Instead, report vulnerabilities via [GitHub private vulnerability reporting](https://github.com/hk5c021a/co-md/security/advisories/new) or email `security@example.com` (⚠️ replace this placeholder with your real security contact before deploying to production).

Expect an acknowledgement within 48 hours and a timeline for resolution within 5 business days. This project does not operate a bug bounty program.

## Security Practices

- Passwords: client-side PBKDF2(appSalt+password) pre-hash → server-side Argon2id（单次上下文，零信任）
- Refresh Token storage: Web Worker thread isolation + IndexedDB AES-256-GCM encryption（key derived from device fingerprint）
- JWT access tokens expire in 15 minutes; refresh tokens use SHA-256 hashed values with token family rotation for replay detection
- Device fingerprint binding: 6 fields (platform/cores/screen/timezone/language/deviceId) bound to session
- All HTTP endpoints use HTTPS (mkcert certificates in development, Caddy + Let's Encrypt in production)
- CSP nonce injection per request, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy headers
- Input validation via Zod schemas on all API boundaries
- Rate limiting on authentication and search endpoints（Redis-backed, X-RateLimit-\* headers）
- WebSocket permission enforcement: connection-time Redis cache + backend fallback, read-only users discard sync messages, revoke disconnects
- Internal API endpoints protected by shared secret (`INTERNAL_API_SECRET`)
- CORS restricted to known origins
- Database access uses parameterized queries (Drizzle ORM)
- Redis access requires password authentication
- OWASP Top Ten reviewed during development
