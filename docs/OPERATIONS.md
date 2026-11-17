# Frontend Operations & Deployment Guide
**Version**: 1.0.0 | **Environment**: Production

## Quick Deployment

### One-Click Deploy
```bash
# From Axelr-Frontend directory
chmod +x deploy-frontend.sh
./deploy-frontend.sh
```

### Manual Deploy Steps
1. **Bump version** in [js/00-core.js](file:///c:/Users/alime/Downloads/AXELR%20AI/Axelr-Frontend/js/00-core.js)
2. **Update service worker** version in [sw.js](file:///c:/Users/alime/Downloads/AXELR%20AI/Axelr-Frontend/sw.js)
3. **Run build**: `npm run build`
4. **Run tests**: `npm test`
5. **Commit**: `git commit -m "Deploy vX.Y.Z"`
6. **Push**: `git push origin main`

---

## Production Environment

### Hosting Requirements
- **Static hosting**: Nginx, Cloudflare Pages, Vercel, or Netlify
- **HTTPS**: Required for PWA and WASM features
- **Headers**: COOP/COEP for SharedArrayBuffer support
- **CDN**: Enabled for static asset caching

### Required Headers
```nginx
# Nginx configuration
add_header Cross-Origin-Opener-Policy "same-origin" always;
add_header Cross-Origin-Embedder-Policy "require-corp" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Content-Security-Policy "default-src 'self' https:; script-src 'self' 'unsafe-inline' https://accounts.google.com https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;" always;
```

### Cache Strategy
| Asset Type | Cache TTL | Cache Busting |
|------------|-----------|---------------|
| HTML | 5 minutes | None |
| CSS/JS | 7 days | Filename hash |
| WASM | 30 days | Versioned URL |
| Images | 30 days | Content hash |
| Service Worker | 0 seconds | Version string |

---

## Monitoring & Observability

### Frontend Telemetry
- **Error rate**: Target < 0.1%
- **Page load time**: Target < 2s
- **Speech latency**: Target < 800ms
- **Success rate**: Target > 99.9%

### Key Metrics Dashboard
Access via `?debug=true`:
- Real-time error count
- Speech recognition success rate
- API latency distribution
- Memory usage trends
- Web worker health

---

## Rollback Procedure

If deployment causes issues:
1. **Revert git commit**: `git revert HEAD`
2. **Push revert**: `git push origin main`
3. **Verify**: Check production loads correctly
4. **Investigate**: Review error logs, fix issues locally

### Emergency Rollback (Instant)
```bash
# Revert to previous tagged version
git checkout v4.0.9
git push origin main:production
```

---

## Maintenance Tasks

### Daily
- Check error dashboard
- Verify backend health
- Monitor API latency

### Weekly
- Review test suite results
- Check bundle size growth
- Update dependencies if needed

### Monthly
- Full security audit
- Performance benchmark
- Browser compatibility check

---

## Incident Response

| Severity | Response Time | Examples |
|----------|---------------|----------|
| **P0** | Immediate (5min) | Site down, auth broken |
| **P1** | < 30 minutes | Major feature broken |
| **P2** | < 2 hours | Minor UI issue |
| **P3** | Next business day | Cosmetic bug |

### P0 Incident Steps
1. Trigger instant rollback
2. Notify engineering team
3. Gather error logs
4. Root cause analysis
5. Deploy fixed version

---

*Last updated: 2026-11-17*