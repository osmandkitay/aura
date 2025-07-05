import type { NextApiRequest, NextApiResponse } from 'next';
import { posts } from '../../../lib/db';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // Check authentication for protected operations
  const authToken = req.cookies['auth-token'];
  const isAuthenticated = !!authToken;

  switch (req.method) {
    case 'GET':
      // List posts - available to all
      const { limit = 10, offset = 0, tags } = req.query;
      
      let filteredPosts = [...posts];
      
      // Filter by tags if provided
      if (tags) {
        const tagArray = Array.isArray(tags) ? tags : [tags];
        filteredPosts = filteredPosts.filter(post =>
          post.tags.some((tag: string) => tagArray.includes(tag))
        );
      }
      
      // Apply pagination
      const start = parseInt(offset as string);
      const end = start + parseInt(limit as string);
      const paginatedPosts = filteredPosts.slice(start, end);
      
      res.status(200).json({
        posts: paginatedPosts,
        total: filteredPosts.length,
        limit: parseInt(limit as string),
        offset: start,
      });
      break;

    case 'POST':
      // Create post - requires authentication
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

      // Create new post
      const { title, content, tags: newTags = [], published = false } = req.body;
      
      if (!title || !content) {
        res.status(400).json({
          code: 'VALIDATION_ERROR',
          detail: 'Title and content are required',
        });
        return;
      }

      const newPost = {
        id: String(posts.length + 1),
        title,
        content,
        tags: newTags,
        published,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      posts.push(newPost);

      res.status(201).json(newPost);
      break;

    default:
      res.setHeader('Allow', ['GET', 'POST']);
      res.status(405).json({
        code: 'METHOD_NOT_ALLOWED',
        detail: `Method ${req.method} not allowed`,
      });
  }
} 