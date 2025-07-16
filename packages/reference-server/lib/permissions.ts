import type { NextApiRequest } from 'next';

// All available capabilities in the system
export const ALL_CAPABILITIES = [
  'login',
  'logout', 
  'get_profile',
  'update_profile',
  'list_posts',
  'create_post',
  'read_post',
  'update_post',
  'delete_post'
];

// Define which capabilities require authentication
export const CAPABILITY_PERMISSIONS: Record<string, { authRequired: boolean }> = {
  'login': { authRequired: false },
  'logout': { authRequired: true },
  'get_profile': { authRequired: true },
  'update_profile': { authRequired: true },
  'list_posts': { authRequired: false },
  'create_post': { authRequired: true },
  'read_post': { authRequired: false },
  'update_post': { authRequired: true },
  'delete_post': { authRequired: true }
};

// Authentication utility
export function authenticateRequest(req: NextApiRequest): { isAuthenticated: boolean, userId?: string } {
  const authToken = req.cookies['auth-token'];
  
  if (!authToken) {
    return { isAuthenticated: false };
  }

  try {
    // Decode the auth token (format: base64(userId:timestamp))
    const decoded = Buffer.from(authToken, 'base64').toString('utf-8');
    const [userId, timestamp] = decoded.split(':');
    
    if (!userId || !timestamp) {
      return { isAuthenticated: false };
    }

    // Check if token is not too old (1 week)
    const tokenAge = Date.now() - parseInt(timestamp);
    const maxAge = 60 * 60 * 24 * 7 * 1000; // 1 week in ms
    
    if (tokenAge > maxAge) {
      return { isAuthenticated: false };
    }

    return { isAuthenticated: true, userId };
  } catch (error) {
    return { isAuthenticated: false };
  }
} 