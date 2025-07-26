# AURA Reference Server Deployment Guide

This guide shows you how to deploy the AURA Protocol reference server to various platforms. The reference server is built with Next.js and demonstrates a complete AURA-enabled website.

## 🎯 Quick Start

The reference server is designed to be deployed easily to any platform that supports Node.js applications.

### Prerequisites

- **Node.js**: Version 18 or later
- **Package Manager**: pnpm (recommended), npm, or yarn
- **Environment**: Any platform supporting Next.js apps

### Basic Setup

```bash
# Clone the repository
git clone https://github.com/your-org/aura.git
cd aura

# Install dependencies  
pnpm install

# Build and start
pnpm --filter aura-reference-server build
pnpm --filter aura-reference-server start
```

## 🌐 Platform-Specific Deployments

### Vercel (Recommended)

Vercel is the fastest way to deploy the reference server:

**Option 1: Deploy Button**
```bash
# Fork the repository, then visit:
https://vercel.com/new/git/external?repository-url=https://github.com/your-username/aura
```

**Option 2: Vercel CLI**
```bash
# Install Vercel CLI
npm i -g vercel

# Navigate to reference server
cd packages/reference-server

# Deploy
vercel

# Follow the prompts to configure your deployment
```

**Configuration:**
- **Root Directory**: `packages/reference-server`
- **Build Command**: `pnpm build`
- **Output Directory**: `.next`
- **Install Command**: `pnpm install`

### Netlify

Deploy to Netlify with these settings:

```bash
# Build settings
Build command: cd packages/reference-server && pnpm build
Publish directory: packages/reference-server/.next

# Environment variables (if needed)
NODE_VERSION=18
```

**netlify.toml:**
```toml
[build]
  base = "packages/reference-server"
  command = "pnpm build"
  publish = ".next"

[[redirects]]
  from = "/.well-known/aura.json"
  to = "/.well-known/aura.json"
  status = 200
  headers = {Content-Type = "application/json"}

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### Railway

Deploy to Railway with one command:

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway link
railway up

# Configure environment
railway variables set NODE_VERSION=18
railway variables set BUILD_PATH=packages/reference-server
```

**railway.json:**
```json
{
  "build": {
    "builder": "nixpacks",
    "buildCommand": "cd packages/reference-server && pnpm build"
  },
  "deploy": {
    "startCommand": "cd packages/reference-server && pnpm start"
  }
}
```

### Docker Deployment

Use the included Dockerfile for containerized deployment:

**Dockerfile (already included):**
```dockerfile
FROM node:18-alpine

# Enable pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/reference-server/package.json ./packages/reference-server/
COPY packages/aura-protocol/package.json ./packages/aura-protocol/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/ ./packages/

# Build the application
RUN pnpm --filter aura-reference-server build

EXPOSE 3000

CMD ["pnpm", "--filter", "aura-reference-server", "start"]
```

**Build and Run:**
```bash
# Build Docker image
docker build -t aura-reference-server .

# Run container
docker run -p 3000:3000 aura-reference-server

# Or use docker-compose
docker-compose up
```

**docker-compose.yml:**
```yaml
version: '3.8'
services:
  aura-server:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    restart: unless-stopped
```

### DigitalOcean App Platform

Deploy using DigitalOcean's App Platform:

```yaml
# .do/app.yaml
name: aura-reference-server
services:
- name: web
  source_dir: packages/reference-server
  github:
    repo: your-username/aura
    branch: main
  run_command: pnpm start
  build_command: cd ../.. && pnpm install && pnpm --filter aura-reference-server build
  environment_slug: node-js
  instance_count: 1
  instance_size_slug: basic-xxs
  routes:
  - path: /
```

### Heroku

Deploy to Heroku with these configurations:

**package.json (add to reference-server):**
```json
{
  "scripts": {
    "heroku-postbuild": "cd ../.. && pnpm install && pnpm --filter aura-reference-server build"
  },
  "engines": {
    "node": "18.x"
  }
}
```

**Deploy Commands:**
```bash
# Install Heroku CLI, then:
cd packages/reference-server
heroku create your-aura-app
git add .
git commit -m "Deploy to Heroku"
git push heroku main
```

## ⚙️ Environment Configuration

### Environment Variables

The reference server supports these environment variables:

```env
# Application
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# AURA Configuration
AURA_MANIFEST_URL=https://yourdomain.com/.well-known/aura.json
AURA_SITE_NAME="Your AURA Site"
AURA_SITE_URL=https://yourdomain.com

# Authentication (for demo purposes)
AUTH_SECRET=your-secret-key-here

# Database (if using external database)
DATABASE_URL=your-database-url

# CORS Configuration
ALLOWED_ORIGINS=https://yourdomain.com,https://example.com
```

### Custom Domain Setup

After deployment, configure your custom domain:

1. **Add Domain**: Configure your domain in your platform's dashboard
2. **SSL Certificate**: Enable HTTPS (usually automatic)
3. **Update Manifest**: Update the `site.url` in your AURA manifest
4. **Test Endpoints**: Verify `/.well-known/aura.json` is accessible

## 🔧 Production Optimizations

### Performance

**Next.js Optimizations:**
```javascript
// next.config.ts
const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  compress: true,
  images: {
    optimization: true,
  },
  experimental: {
    serverComponentsExternalPackages: ['@aura/protocol'],
  },
};
```

**CDN Configuration:**
- Enable CDN caching for static assets
- Set appropriate cache headers for the AURA manifest
- Configure GZIP compression

### Security

**HTTP Headers:**
```javascript
// middleware.ts
export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  
  // Security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  return response;
}
```

**CORS Configuration:**
```javascript
// Configure CORS for AURA manifest
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'AURA-State'],
};
```

### Monitoring

**Health Check Endpoint:**
```javascript
// pages/api/health.ts
export default function handler(req, res) {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    aura: {
      protocol: 'AURA',
      version: '1.0',
      manifest: '/.well-known/aura.json'
    }
  });
}
```

**Logging:**
```javascript
// Add structured logging
import { logger } from './lib/logger';

export default function handler(req, res) {
  logger.info('AURA capability executed', {
    capability: req.body.capability,
    timestamp: new Date().toISOString(),
    userAgent: req.headers['user-agent']
  });
}
```

## 🧪 Testing Your Deployment

### Verify AURA Compliance

```bash
# Test manifest accessibility
curl https://yourdomain.com/.well-known/aura.json

# Validate manifest
npx @aura/protocol aura-validate --url https://yourdomain.com/.well-known/aura.json

# Test with AURA client
npx @aura/reference-client agent -- https://yourdomain.com "list all posts"
```

### Automated Testing

```yaml
# .github/workflows/deploy-test.yml
name: Test Deployment
on:
  deployment_status:
jobs:
  test:
    if: github.event.deployment_status.state == 'success'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Test AURA compliance
        run: |
          curl -f ${{ github.event.deployment_status.target_url }}/.well-known/aura.json
          npx @aura/protocol aura-validate --url ${{ github.event.deployment_status.target_url }}/.well-known/aura.json
```

## 🚀 Advanced Deployment Patterns

### Multi-Environment Setup

```bash
# Development
AURA_ENV=development pnpm dev

# Staging  
AURA_ENV=staging pnpm build && pnpm start

# Production
AURA_ENV=production pnpm build && pnpm start
```

### Database Integration

For production use, integrate with a real database:

```javascript
// lib/db.ts - Replace mock implementation
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export async function query(text: string, params?: any[]) {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}
```

### Load Balancing

For high-traffic deployments:

```yaml
# kubernetes/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: aura-reference-server
spec:
  replicas: 3
  selector:
    matchLabels:
      app: aura-reference-server
  template:
    metadata:
      labels:
        app: aura-reference-server
    spec:
      containers:
      - name: aura-server
        image: your-registry/aura-reference-server:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
```

## 🛠️ Troubleshooting

### Common Issues

**Manifest Not Found:**
```bash
# Check if manifest is accessible
curl -I https://yourdomain.com/.well-known/aura.json

# Verify routing configuration
# Ensure /.well-known/ directory is served correctly
```

**CORS Errors:**
```javascript
// Add to next.config.ts
const nextConfig = {
  async headers() {
    return [
      {
        source: '/.well-known/aura.json',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET' },
        ],
      },
    ];
  },
};
```

**Build Failures:**
```bash
# Clear cache and rebuild
rm -rf .next node_modules
pnpm install
pnpm build
```

### Performance Issues

**Memory Optimization:**
```dockerfile
# Dockerfile - Add memory limits
FROM node:18-alpine
ENV NODE_OPTIONS="--max-old-space-size=1024"
```

**Bundle Analysis:**
```bash
# Analyze bundle size
ANALYZE=true pnpm build
```

## 📊 Monitoring Production

### Key Metrics

- **AURA Manifest Accessibility**: Monitor `/.well-known/aura.json` uptime
- **Capability Response Times**: Track API endpoint performance
- **Error Rates**: Monitor failed capability executions
- **Agent Interactions**: Track usage patterns and popular capabilities

### Sample Monitoring

```javascript
// lib/metrics.ts
export function trackCapabilityUsage(capabilityId: string, success: boolean) {
  // Send to your analytics platform
  analytics.track('aura_capability_executed', {
    capability: capabilityId,
    success,
    timestamp: Date.now()
  });
}
```

---

## 🎉 Success!

Your AURA Protocol reference server is now deployed and ready to demonstrate machine-readable web interaction. Users can now:

- Access your AURA manifest at `https://yourdomain.com/.well-known/aura.json`
- Use AURA clients to interact with your capabilities
- Explore the protocol through your working implementation

**Next Steps:**
- Customize capabilities for your specific use case
- Integrate with your existing authentication system
- Add monitoring and analytics
- Share your implementation with the AURA community

For questions or support, visit the [AURA Protocol repository](https://github.com/your-org/aura) or join our community discussions. 