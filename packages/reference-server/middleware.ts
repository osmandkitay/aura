import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ALL_CAPABILITIES, CAPABILITY_PERMISSIONS } from './lib/permissions'; // Import the new config

// Rate limiting configuration
const ipRequestCounts = new Map<string, number>();
const RATE_LIMIT = 100; // 100 requests
const WINDOW_MS = 60 * 1000; // per minute

export function middleware(request: NextRequest) {
  // Rate limiting check
  const ip = request.headers.get('x-forwarded-for') ?? 
             request.headers.get('x-real-ip') ?? 
             '127.0.0.1';
  const count = ipRequestCounts.get(ip) || 0;

  if (count >= RATE_LIMIT) {
    return new NextResponse('Too many requests', { status: 429 });
  }

  ipRequestCounts.set(ip, count + 1);
  setTimeout(() => ipRequestCounts.delete(ip), WINDOW_MS);
  // Get the response
  const response = NextResponse.next();

  // Get session/auth info using the same logic as API routes
  const authCookie = request.cookies.get('auth-token');
  let isAuthenticated = false;
  
  if (authCookie && authCookie.value) {
    try {
      // Decode the auth token (format: base64(userId:timestamp))
      const decoded = Buffer.from(authCookie.value, 'base64').toString('utf-8');
      const [userId, timestamp] = decoded.split(':');
      
      if (userId && timestamp) {
        // Check if token is not too old (1 week)
        const tokenAge = Date.now() - parseInt(timestamp);
        const maxAge = 60 * 60 * 24 * 7 * 1000; // 1 week in ms
        
        if (tokenAge <= maxAge) {
          isAuthenticated = true;
        }
      }
    } catch (error) {
      // Invalid token format
      isAuthenticated = false;
    }
  }
  
  // Determine available capabilities dynamically based on the permission map
  const capabilities = ALL_CAPABILITIES.filter(capId => {
    const permission = CAPABILITY_PERMISSIONS[capId];
    if (!permission) return false; // Default to secure if not defined
    return isAuthenticated ? true : !permission.authRequired;
  });

  // Create AURA-State object
  const auraState = {
    isAuthenticated,
    context: {
      path: request.nextUrl.pathname,
      timestamp: new Date().toISOString(),
    },
    capabilities,
  };

  // Encode as Base64 and add to response headers
  const auraStateBase64 = Buffer.from(JSON.stringify(auraState)).toString('base64');
  response.headers.set('AURA-State', auraStateBase64);

  return response;
}

// Configure which paths the middleware runs on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}; 