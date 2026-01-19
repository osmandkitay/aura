# AURA Protocol Troubleshooting Guide

This guide helps you diagnose and fix common AURA protocol implementation issues.

## 🎯 Quick Diagnostics

```bash
# 1. Verify manifest accessibility
curl -I https://example.com/.well-known/aura.json

# 2. Validate manifest structure (download first, --url is disabled)
curl -fsSL https://example.com/.well-known/aura.json -o aura.json
npx -y -p aura-protocol aura-validate aura.json

# 3. Test with AURA client (from repo)
pnpm --filter aura-reference-client agent -- https://example.com "list capabilities"

# 4. Check server connectivity (from repo)
pnpm --filter aura-reference-client crawler -- https://example.com
```

## 🔧 Common Issues

### 1. Manifest Not Found (404)
- Check static file routing: Ensure `/.well-known/aura.json` is served
- Verify file location: Place in `public/.well-known/` or configure API route

### 2. CORS Errors
```typescript
// middleware.ts - Add CORS headers
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
```bash
# Validate JSON syntax
cat .well-known/aura.json | jq '.'

# Required fields: $schema, protocol, version, site, resources, capabilities
```

### 4. URI Template Issues
- Missing closing brace: `/api/posts/{id` → `/api/posts/{id}`
- Empty variable: `/api/posts/{}` → `/api/posts/{id}`
- Test with: `parseTemplate(template).expand({ id: '123' })`

### 5. Parameter Mapping Errors
- Ensure mappings match schema properties
- Use JSON Pointer syntax: `/title`, `/user/id`, `/tags/0`
- All pointers must start with `/`

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
import { AuraManifest } from 'aura-protocol';

// ❌ Wrong
import AuraManifest from 'aura-protocol';
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

# Full validation (local file only; --url is disabled)
npx -y -p aura-protocol aura-validate .well-known/aura.json --verbose

# Test connectivity
curl -vI https://example.com/.well-known/aura.json
```

---

Most AURA issues are configuration or deployment-related rather than protocol problems. Start with the quick diagnostics and work through the common issues systematically. 