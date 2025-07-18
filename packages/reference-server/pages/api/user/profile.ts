import type { NextApiRequest, NextApiResponse } from 'next';
import { authenticateRequest } from '../../../lib/permissions';
import { validateRequest } from '../../../lib/validator';

// Mock user profiles
const userProfiles: Record<string, unknown> = {
  '1': {
    id: '1',
    email: 'demo@aura.dev',
    name: 'Demo User',
    bio: 'A demo user exploring the AURA protocol',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=demo',
  },
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // Check authentication
  const { isAuthenticated, userId } = authenticateRequest(req);
  if (!isAuthenticated || !userId) {
    res.status(401).json({
      code: 'UNAUTHORIZED',
      detail: 'Authentication required',
      hint: 'Please login first',
    });
    return;
  }

  if (!userProfiles[userId]) {
    res.status(401).json({
      code: 'INVALID_TOKEN',
      detail: 'Invalid authentication token',
    });
    return;
  }

  const profile = userProfiles[userId];

  switch (req.method) {
    case 'GET':
      // Get profile
      // Validate request against get_profile capability schema
      const getValidation = validateRequest(req, 'get_profile');
      if (!getValidation.isValid) {
        res.status(400).json(getValidation.error);
        return;
      }

      res.status(200).json(profile);
      break;

    case 'PUT':
      // Update profile
      // Validate request against update_profile capability schema
      const updateValidation = validateRequest(req, 'update_profile');
      if (!updateValidation.isValid) {
        res.status(400).json(updateValidation.error);
        return;
      }

      const { name, bio, avatar } = req.body;
      
      const updatedProfile = {
        ...profile,
        ...(name !== undefined && { name }),
        ...(bio !== undefined && { bio }),
        ...(avatar !== undefined && { avatar }),
      };

      userProfiles[userId] = updatedProfile;

      res.status(200).json(updatedProfile);
      break;

    default:
      res.setHeader('Allow', ['GET', 'PUT']);
      res.status(405).json({
        code: 'METHOD_NOT_ALLOWED',
        detail: `Method ${req.method} not allowed`,
      });
  }
} 