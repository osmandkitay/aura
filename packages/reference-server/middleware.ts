import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ALL_CAPABILITIES, CAPABILITY_PERMISSIONS } from './lib/permissions'; // Import the new config

export function middleware(request: NextRequest) {
  // Get the response
  const response = NextResponse.next();

  // Get session/auth info (in a real app, this would come from session/JWT)
  // Check for auth-token cookie more reliably
  const authCookie = request.cookies.get('auth-token');
  const isAuthenticated = !!(authCookie && authCookie.value && authCookie.value.length > 0);
  
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