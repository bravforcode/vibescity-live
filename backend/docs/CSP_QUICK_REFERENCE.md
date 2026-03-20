# CSP Quick Reference Guide

**Quick reference for Content Security Policy implementation**

---

## 🚀 Quick Start

### Test CSP Configuration
```bash
python backend/scripts/test_csp.py http://localhost:8000
```

### Monitor Violations
```bash
python backend/scripts/csp_monitor.py http://localhost:8000
```

### Check Security Headers
```bash
curl -I http://localhost:8000 | grep -i security
```

---

## 📝 Common Tasks

### Add New Third-Party Domain

**1. Identify the directive needed:**
- Scripts: `script-src`
- Styles: `style-src`
- Images: `img-src`
- API calls: `connect-src`
- Fonts: `font-src`
- Iframes: `frame-src`

**2. Update CSPConfig in `backend/app/middleware/security.py`:**
```python
def get_csp_header(self) -> str:
    directives = [
        # ... existing directives ...
        "script-src 'self' https://new-service.com",
    ]
```

**3. Test and deploy**

### Fix CSP Violation

**1. Check violation report:**
```bash
curl http://localhost:8000/api/v1/security/csp-violations
```

**2. Identify blocked resource:**
- Look at `blocked-uri` field
- Check `violated-directive` field

**3. Update CSP or fix code:**
- Add domain to CSP if legitimate
- Remove inline script if malicious
- Use nonces for inline scripts

### Temporarily Disable CSP (Development Only)

**Option 1: Use Report-Only mode**
```python
# In security.py
response.headers["Content-Security-Policy-Report-Only"] = csp_header
```

**Option 2: Comment out middleware**
```python
# In main.py
# app.add_middleware(SecurityHeadersMiddleware, ...)
```

---

## 🔍 CSP Directives Cheat Sheet

| Directive | Controls | Example |
|-----------|----------|---------|
| `default-src` | Fallback for all directives | `default-src 'self'` |
| `script-src` | JavaScript execution | `script-src 'self' https://cdn.com` |
| `style-src` | CSS styles | `style-src 'self' 'unsafe-inline'` |
| `img-src` | Images | `img-src 'self' data: https:` |
| `font-src` | Fonts | `font-src 'self' https://fonts.com` |
| `connect-src` | XHR, WebSocket, fetch | `connect-src 'self' https://api.com` |
| `frame-src` | Iframes | `frame-src https://trusted.com` |
| `object-src` | Plugins (Flash, etc.) | `object-src 'none'` |
| `base-uri` | `<base>` tag | `base-uri 'self'` |
| `form-action` | Form submissions | `form-action 'self'` |
| `frame-ancestors` | Embedding in iframes | `frame-ancestors 'none'` |

---

## 🎯 CSP Keywords

| Keyword | Meaning | Use Case |
|---------|---------|----------|
| `'self'` | Same origin | Allow resources from same domain |
| `'none'` | Block all | Disable directive completely |
| `'unsafe-inline'` | Allow inline code | Inline scripts/styles (not recommended) |
| `'unsafe-eval'` | Allow eval() | Dynamic code execution (not recommended) |
| `'strict-dynamic'` | Trust script-added scripts | Modern CSP approach |
| `'nonce-{random}'` | Nonce-based | Secure inline scripts |
| `data:` | Data URIs | Base64 encoded resources |
| `https:` | Any HTTPS URL | Allow all HTTPS resources |

---

## 🐛 Debugging CSP Issues

### Browser Console Shows CSP Violation

**1. Read the error message:**
```
Refused to load the script 'https://example.com/script.js' 
because it violates the following Content Security Policy directive: 
"script-src 'self'".
```

**2. Identify the issue:**
- Blocked URI: `https://example.com/script.js`
- Violated directive: `script-src`
- Current policy: Only allows `'self'`

**3. Fix:**
- Add `https://example.com` to `script-src`
- Or remove the script if not needed

### Map/Payment Not Loading

**Check these directives:**
- `script-src`: For JavaScript libraries
- `style-src`: For CSS
- `connect-src`: For API calls
- `frame-src`: For embedded iframes
- `img-src`: For images/tiles

### WebSocket Connection Blocked

**Add to `connect-src`:**
```python
"connect-src 'self' wss://your-websocket-domain.com"
```

---

## 📊 Monitoring Commands

### View Recent Violations
```bash
curl http://localhost:8000/api/v1/security/csp-violations?limit=10
```

### View Statistics
```bash
curl http://localhost:8000/api/v1/security/csp-violations/stats
```

### Clear Violations
```bash
curl -X DELETE http://localhost:8000/api/v1/security/csp-violations
```

### Export to File
```bash
python backend/scripts/csp_monitor.py http://localhost:8000 --export violations.json
```

---

## ✅ Pre-Deployment Checklist

- [ ] Run CSP test script
- [ ] Check for high/medium severity findings
- [ ] Test all critical user flows
- [ ] Monitor violations in staging
- [ ] Review violation statistics
- [ ] Update documentation if CSP changed
- [ ] Alert team about CSP changes

---

## 🚨 Emergency: CSP Breaking Production

**1. Quick rollback:**
```python
# In security.py, temporarily use report-only mode
response.headers["Content-Security-Policy-Report-Only"] = csp_header
# Comment out enforcement
# response.headers["Content-Security-Policy"] = csp_header
```

**2. Deploy hotfix**

**3. Investigate violations:**
```bash
python backend/scripts/csp_monitor.py https://api.vibecity.live
```

**4. Fix and redeploy**

---

## 📚 Additional Resources

- Full documentation: `backend/docs/SECURITY_HEADERS.md`
- CSP Evaluator: https://csp-evaluator.withgoogle.com/
- MDN CSP Guide: https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP
- Test your site: https://securityheaders.com/

---

**Last Updated:** 2026-03-16  
**Task:** 4 (E1) - Content Security Policy
