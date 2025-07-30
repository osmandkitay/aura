# AURA Reference Server Deployment Guide

Deploy the AURA Protocol reference server to demonstrate machine-readable web interaction.

## 🎯 Quick Start

```bash
# Clone and build
git clone https://github.com/osmandkitay/aura.git
cd aura
pnpm install
pnpm --filter aura-reference-server build
pnpm --filter aura-reference-server start
```

## 🌐 Platform Deployments

### Vercel (Recommended)
```bash
npm i -g vercel
cd packages/reference-server
vercel
```
**Settings**: Root Directory: `packages/reference-server`, Build Command: `pnpm build`

### Netlify
```toml
# netlify.toml
[build]
  base = "packages/reference-server"
  command = "pnpm build"
  publish = ".next"

[[redirects]]
  from = "/.well-known/aura.json"
  to = "/.well-known/aura.json"
  status = 200
```

### Docker
```dockerfile
FROM node:18-alpine
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/reference-server/package.json ./packages/reference-server/
COPY packages/aura-protocol/package.json ./packages/aura-protocol/

RUN pnpm install --frozen-lockfile
COPY packages/ ./packages/
RUN pnpm --filter aura-reference-server build

EXPOSE 3000
CMD ["pnpm", "--filter", "aura-reference-server", "start"]
```

## ⚙️ Environment Variables

```env
NODE_ENV=production
PORT=3000
AURA_SITE_NAME="Your AURA Site"
AURA_SITE_URL=https://yourdomain.com
AUTH_SECRET=your-secret-key
```

## 🔧 Production Setup

### CORS Configuration
```javascript
// middleware.ts
export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  
  if (request.nextUrl.pathname === '/.well-known/aura.json') {
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  }
  
  return response;
}
```

### Custom Domain
1. Configure domain in platform dashboard
2. Enable HTTPS (usually automatic)
3. Update `site.url` in AURA manifest
4. Test `/.well-known/aura.json` accessibility

## 🧪 Testing Deployment

```bash
# Verify manifest
curl https://yourdomain.com/.well-known/aura.json

# Validate compliance
npx @aura/protocol aura-validate --url https://yourdomain.com/.well-known/aura.json

# Test with client
npx @aura/reference-client agent -- https://yourdomain.com "list posts"
```

## 🛠️ Troubleshooting

**Manifest Not Found (404)**
- Check static file routing configuration
- Verify `/.well-known/` directory is served

**CORS Errors**
- Add CORS headers to manifest endpoint
- Configure `Access-Control-Allow-Origin: *`

**Build Failures**
```bash
rm -rf .next node_modules
pnpm install && pnpm build
```

---

Your AURA server is now deployed! Users can access your manifest at `https://yourdomain.com/.well-known/aura.json` and interact with your capabilities using AURA clients. 