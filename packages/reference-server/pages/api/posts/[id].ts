import type { NextApiRequest, NextApiResponse } from 'next';
import { posts } from '../../../lib/db';
import { authenticateRequest } from '../../../lib/permissions';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  const { isAuthenticated, userId } = authenticateRequest(req);

  // Find the post
  const postIndex = posts.findIndex((p) => p.id === id);
  const post = posts[postIndex];

  if (!post) {
    res.status(404).json({
      code: 'NOT_FOUND',
      detail: `Post with id ${id} not found`,
    });
    return;
  }

  switch (req.method) {
    case 'GET':
      // Read post - available to all
      res.status(200).json(post);
      break;

    case 'PUT':
      // Update post - requires authentication
      if (!isAuthenticated) {
        res.status(401).json({
          code: 'UNAUTHORIZED',
          detail: 'Authentication required',
          hint: 'Please login first',
        });
        return;
      }



      // Update post
      const { title, content, tags, published } = req.body;
      
      const updatedPost = {
        ...post,
        ...(title !== undefined && { title }),
        ...(content !== undefined && { content }),
        ...(tags !== undefined && { tags }),
        ...(published !== undefined && { published }),
        updatedAt: new Date().toISOString(),
      };

      posts[postIndex] = updatedPost;

      res.status(200).json(updatedPost);
      break;

    case 'DELETE':
      // Delete post - requires authentication
      if (!isAuthenticated) {
        res.status(401).json({
          code: 'UNAUTHORIZED',
          detail: 'Authentication required',
          hint: 'Please login first',
        });
        return;
      }



      // Delete post
      posts.splice(postIndex, 1);

      res.status(204).end();
      break;

    default:
      res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
      res.status(405).json({
        code: 'METHOD_NOT_ALLOWED',
        detail: `Method ${req.method} not allowed`,
      });
  }
} 