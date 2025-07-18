import type { NextApiRequest, NextApiResponse } from 'next';
import { posts } from '../../../lib/db';
import { authenticateRequest } from '../../../lib/permissions';
import { validateRequest } from '../../../lib/validator';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // Check authentication for protected operations
  const { isAuthenticated, userId } = authenticateRequest(req);

  switch (req.method) {
    case 'GET':
      // List posts - available to all
      // Validate request against list_posts capability schema
      const listValidation = validateRequest(req, 'list_posts');
      if (!listValidation.isValid) {
        res.status(400).json(listValidation.error);
        return;
      }

      const { limit = 100, offset = 0, tags } = req.query;
      
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
      const limitNum = parseInt(limit as string);
      const paginatedPosts = limitNum ? filteredPosts.slice(start, start + limitNum) : filteredPosts;
      
      res.status(200).json({
        posts: paginatedPosts,
        total: filteredPosts.length,
        limit: limitNum,
        offset: start,
      });
      break;

    case 'POST':
      // Create post - requires authentication (check first for security)
      if (!isAuthenticated) {
        res.status(401).json({
          code: 'UNAUTHORIZED',
          detail: 'Authentication required',
          hint: 'Please login first',
        });
        return;
      }

      // Validate request against create_post capability schema
      const createValidation = validateRequest(req, 'create_post');
      if (!createValidation.isValid) {
        res.status(400).json(createValidation.error);
        return;
      }

      // Extract validated data from request body
      const { title, content, tags: newTags = [], published = false } = req.body;

      // Create new post
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