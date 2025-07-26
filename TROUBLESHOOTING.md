# AURA Protocol Troubleshooting Guide

This guide helps you diagnose and fix common AURA protocol implementation issues.

## 🎯 Quick Diagnostics

```bash
# 1. Verify manifest accessibility
curl -I https://example.com/.well-known/aura.json

# 2. Validate manifest structure
npx @aura/protocol aura-validate --url https://example.com/.well-known/aura.json

# 3. Test with AURA client
npx @aura/reference-client agent -- https://example.com "list capabilities"

# 4. Check server connectivity
npx @aura/reference-client crawler -- https://example.com
```

## 🔧 Common Issues

### 1. Manifest Not Found (404)

**Check Static File Routing:**

Next.js:
```javascript
// next.config.ts
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/.well-known/aura.json',
        destination: '/api/manifest',
      },
    ];
  },
};
```

Vercel:
```json
// vercel.json
{
  "routes": [
    {
      "src": "/.well-known/aura.json",
      "dest": "/public/.well-known/aura.json"
    }
  ]
}
```

### 2. CORS Errors

**Add CORS Headers:**

```typescript
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

### 3. JSON Validation Errors

**Fix Common Issues:**

```bash
# Validate JSON syntax
cat .well-known/aura.json | jq '.'

# Use prettier to format
npx prettier --parser json .well-known/aura.json
```

**Required Fields Checklist:**
```json
{
  "$schema": "https://aura.dev/schemas/v1.0.json",
  "protocol": "AURA",
  "version": "1.0",
  "site": {
    "name": "Your Site",
    "url": "https://example.com"
  },
  "resources": {},
  "capabilities": {}
}
```

### 4. URI Template Issues

**Common Problems:**
```javascript
// ❌ Invalid
"/api/posts/{id"           // Missing closing brace
"/api/posts/{}"            // Empty variable name

// ✅ Valid
"/api/posts/{id}"
"/api/posts/{id}{?limit,offset}"
```

**Test Templates:**
```typescript
import { parseTemplate } from 'url-template';

function testTemplate(template: string) {
  try {
    const parsed = parseTemplate(template);
    const result = parsed.expand({ id: '123', limit: 10 });
    console.log(`✅ ${template} → ${result}`);
  } catch (error) {
    console.error(`❌ ${template}: ${error.message}`);
  }
}
```

### 5. Parameter Mapping Errors

**Align Mappings with Schema:**
```json
{
  "parameters": {
    "type": "object",
    "properties": {
      "title": { "type": "string" },
      "content": { "type": "string" }
    }
  },
  "action": {
    "parameterMapping": {
      "title": "/title",     // ✅ Matches schema
      "content": "/content"  // ✅ Matches schema
    }
  }
}
```

**JSON Pointer Syntax:**
```json
{
  "parameterMapping": {
    "userId": "/user/id",      // ✅ Nested property
    "firstTag": "/tags/0",     // ✅ Array index
    "title": "/title",         // ✅ Simple property
    "invalid": "title"         // ❌ Missing leading /
  }
}
```

### 6. Build Issues

**Clean Rebuild:**
```bash
rm -rf node_modules .next dist
pnpm install
pnpm build
```

**Check Imports:**
```typescript
// ✅ Correct
import { AuraManifest } from '@aura/protocol';

// ❌ Wrong
import AuraManifest from '@aura/protocol';
```

## 🛠️ Debug Tools

### Manifest Analyzer

```typescript
function analyzeManifest(manifest: AuraManifest) {
  console.log(`Resources: ${Object.keys(manifest.resources).length}`);
  console.log(`Capabilities: ${Object.keys(manifest.capabilities).length}`);
  
  // Check capability references
  const referencedCaps = new Set<string>();
  Object.values(manifest.resources).forEach(resource => {
    Object.values(resource.operations).forEach(op => {
      referencedCaps.add(op.capabilityId);
    });
  });
  
  const definedCaps = new Set(Object.keys(manifest.capabilities));
  const missingCaps = [...referencedCaps].filter(id => !definedCaps.has(id));
  
  if (missingCaps.length > 0) {
    console.error(`Missing capabilities: ${missingCaps.join(', ')}`);
  }
}
```

### Connection Tester

```bash
#!/bin/bash
DOMAIN=$1

echo "Testing AURA connectivity for $DOMAIN"

# Test manifest accessibility
if curl -f -s "$DOMAIN/.well-known/aura.json" > /dev/null; then
  echo "✅ Manifest accessible"
else
  echo "❌ Manifest not accessible"
fi

# Test CORS
CORS=$(curl -s -I "$DOMAIN/.well-known/aura.json" | grep -i "access-control-allow-origin")
if [ -n "$CORS" ]; then
  echo "✅ CORS headers present"
else
  echo "⚠️ No CORS headers"
fi

# Test JSON validity
if curl -s "$DOMAIN/.well-known/aura.json" | jq '.' > /dev/null 2>&1; then
  echo "✅ Valid JSON"
else
  echo "❌ Invalid JSON"
fi
```

## 📋 Validation Checklist

- [ ] Manifest accessible at `/.well-known/aura.json`
- [ ] CORS headers configured for cross-origin access
- [ ] JSON syntax is valid
- [ ] All required fields present
- [ ] URI templates are valid RFC 6570
- [ ] Parameter mappings use valid JSON Pointer syntax
- [ ] All capability references exist
- [ ] Authentication flow works correctly

## 🆘 Getting Help

**Include in bug reports:**
1. Environment details (Node.js, package versions)
2. Full error messages with stack traces
3. Your manifest content (remove sensitive data)
4. Steps to reproduce the issue

**Community Resources:**
- GitHub Issues: Report bugs and questions
- GitHub Discussions: Community help
- Documentation: Complete protocol guide

**Quick Fix Commands:**
```bash
# Emergency reset
rm -rf node_modules .next dist
pnpm install && pnpm build

# Full validation
npx @aura/protocol aura-validate .well-known/aura.json --verbose

# Test connectivity
curl -vI https://example.com/.well-known/aura.json
```

---

Most AURA issues are configuration or deployment-related rather than protocol problems. Start with the quick diagnostics and work through the common issues systematically. 