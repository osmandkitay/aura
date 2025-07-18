import type { NextApiRequest, NextApiResponse } from 'next';
import { serialize } from 'cookie';
import * as bcrypt from 'bcryptjs';
import { validateRequest } from '../../../lib/validator';

// Mock user database with hashed passwords
const users = [
  {
    id: '1',
    email: 'demo@aura.dev',
    passwordHash: '$2b$10$4zvfucLaYLNvKLmRPIoeYujmZPl2alhPupBBlLOW4B0sdpfu9IGUm', // password123
    name: 'Demo User',
  },
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    res.status(405).json({
      code: 'METHOD_NOT_ALLOWED',
      detail: `Method ${req.method} not allowed`,
    });
    return;
  }

  // Validate request against login capability schema
  const validation = validateRequest(req, 'login');
  if (!validation.isValid) {
    res.status(400).json(validation.error);
    return;
  }

  const { email, password } = req.body;

  // Find user by email
  const user = users.find(u => u.email === email);

  if (!user) {
    res.status(401).json({
      code: 'INVALID_CREDENTIALS',
      detail: 'Invalid email or password',
    });
    return;
  }

  // Verify password
  const isValidPassword = await bcrypt.compare(password, user.passwordHash);
  if (!isValidPassword) {
    // Log the security event
    console.warn(`[SECURITY_AUDIT] Failed login attempt for email: ${email}`);
    
    res.status(401).json({
      code: 'INVALID_CREDENTIALS',
      detail: 'Invalid email or password',
    });
    return;
  }

  // Create auth token (in production, use JWT or similar)
  const authToken = Buffer.from(`${user.id}:${Date.now()}`).toString('base64');

  // Set cookie
  const cookie = serialize('auth-token', authToken, {
    httpOnly: true,
    secure: false, // Keep false for HTTP in testing
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 1 week
    path: '/',
    domain: undefined, // Let the browser handle domain automatically
  });

  res.setHeader('Set-Cookie', cookie);
  
  res.status(200).json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
  });
} 