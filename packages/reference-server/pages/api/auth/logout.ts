import type { NextApiRequest, NextApiResponse } from 'next';
import { serialize } from 'cookie';
import { validateRequest } from '../../../lib/validator';
import { ALL_CAPABILITIES, CAPABILITY_PERMISSIONS } from '../../../lib/permissions';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    res.status(405).json({
      code: 'METHOD_NOT_ALLOWED',
      detail: `Method ${req.method} not allowed`,
    });
    return;
  }

  // Validate request against logout capability schema
  const validation = validateRequest(req, 'logout');
  if (!validation.isValid) {
    res.status(400).json(validation.error);
    return;
  }

  // Clear the auth token cookie
  const cookie = serialize('auth-token', '', {
    httpOnly: true,
    secure: false, // Keep false for HTTP in testing
    sameSite: 'lax',
    expires: new Date(0), // Set expiry to past date to clear cookie
    path: '/',
    domain: undefined, // Let the browser handle domain automatically
  });

  res.setHeader('Set-Cookie', cookie);
  
  // Update AURA-State to reflect logged out state
  // Get only capabilities that don't require authentication
  const unauthenticatedCapabilities = ALL_CAPABILITIES.filter(capId => {
    const permission = CAPABILITY_PERMISSIONS[capId];
    return permission && !permission.authRequired;
  });

  const auraState = {
    isAuthenticated: false,
    context: {
      path: req.url || '/api/auth/logout',
      timestamp: new Date().toISOString(),
    },
    capabilities: unauthenticatedCapabilities,
  };

  // Set the corrected AURA-State header
  const auraStateBase64 = Buffer.from(JSON.stringify(auraState)).toString('base64');
  res.setHeader('AURA-State', auraStateBase64);
  
  res.status(200).json({
    success: true,
    message: 'Successfully logged out',
  });
} 