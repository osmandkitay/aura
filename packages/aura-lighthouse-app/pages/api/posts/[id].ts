import type { NextApiRequest, NextApiResponse } from 'next';

// Import the posts array from the index file (in a real app, this would be a database)
import { posts } from './index';

// Export posts array for other endpoints
export { posts };

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  const authToken = req.cookies['auth-token'];
  const isAuthenticated = !!authToken;

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

      // Validate CSRF token
      const csrfToken = req.headers['x-csrf-token'];
      if (!csrfToken) {
        res.status(403).json({
          code: 'CSRF_REQUIRED',
          detail: 'CSRF token required',
          hint: 'Include X-CSRF-Token header',
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

      // Validate CSRF token
      const deleteCsrfToken = req.headers['x-csrf-token'];
      if (!deleteCsrfToken) {
        res.status(403).json({
          code: 'CSRF_REQUIRED',
          detail: 'CSRF token required',
          hint: 'Include X-CSRF-Token header',
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