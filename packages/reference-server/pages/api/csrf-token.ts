import type { NextApiRequest, NextApiResponse } from 'next';
import { serialize } from 'cookie';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // In a real app, generate and store this token in the user's session
  const csrfToken = `csrf_${Math.random().toString(36).substr(2, 10)}`;

  // Set a double-submit cookie
  res.setHeader('Set-Cookie', serialize('csrf-token', csrfToken, {
    path: '/',
    httpOnly: true, // For security
  }));

  // Return the token in the response body for the agent to use in headers
  res.status(200).json({ token: csrfToken });
} 