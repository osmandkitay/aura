import type { NextApiRequest, NextApiResponse } from 'next';
import { serialize } from 'cookie';

// Mock user database
const users = [
  {
    id: '1',
    email: 'demo@aura.dev',
    password: 'password123', // In production, this would be hashed
    name: 'Demo User',
  },
];

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    res.status(405).json({
      code: 'METHOD_NOT_ALLOWED',
      detail: `Method ${req.method} not allowed`,
    });
    return;
  }

  const { email, password } = req.body;

  // Validate input
  if (!email || !password) {
    res.status(400).json({
      code: 'VALIDATION_ERROR',
      detail: 'Email and password are required',
    });
    return;
  }

  // Find user
  const user = users.find(u => u.email === email && u.password === password);

  if (!user) {
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
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 1 week
    path: '/',
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