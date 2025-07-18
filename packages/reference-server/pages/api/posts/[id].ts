import type { NextApiRequest, NextApiResponse } from 'next';
import { posts } from '../../../lib/db';
import { authenticateRequest } from '../../../lib/permissions';
import { validateRequest } from '../../../lib/validator';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { isAuthenticated, userId } = authenticateRequest(req);

  switch (req.method) {
    case 'GET':
      // Read post - available to all
      // Validate request against read_post capability schema
      const readValidation = validateRequest(req, 'read_post');
      if (!readValidation.isValid) {
        res.status(400).json(readValidation.error);
        return;
      }

      const { id: readId } = req.query;

      // Find the post
      const readPostIndex = posts.findIndex((p) => p.id === readId);
      const readPost = posts[readPostIndex];

      if (!readPost) {
        res.status(404).json({
          code: 'NOT_FOUND',
          detail: `Post with id ${readId} not found`,
        });
        return;
      }

      res.status(200).json(readPost);
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

      // Validate request against update_post capability schema
      const updateValidation = validateRequest(req, 'update_post');
      if (!updateValidation.isValid) {
        res.status(400).json(updateValidation.error);
        return;
      }

      const { id: updateId } = req.query;

      // Find the post
      const updatePostIndex = posts.findIndex((p) => p.id === updateId);
      const updatePost = posts[updatePostIndex];

      if (!updatePost) {
        res.status(404).json({
          code: 'NOT_FOUND',
          detail: `Post with id ${updateId} not found`,
        });
        return;
      }

      // Update post
      const { title, content, tags, published } = req.body;
      
      const updatedPost = {
        ...updatePost,
        ...(title !== undefined && { title }),
        ...(content !== undefined && { content }),
        ...(tags !== undefined && { tags }),
        ...(published !== undefined && { published }),
        updatedAt: new Date().toISOString(),
      };

      posts[updatePostIndex] = updatedPost;

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

      // Validate request against delete_post capability schema
      const deleteValidation = validateRequest(req, 'delete_post');
      if (!deleteValidation.isValid) {
        res.status(400).json(deleteValidation.error);
        return;
      }

      const { id: deleteId } = req.query;

      // Find the post
      const deletePostIndex = posts.findIndex((p) => p.id === deleteId);

      if (deletePostIndex === -1) {
        res.status(404).json({
          code: 'NOT_FOUND',
          detail: `Post with id ${deleteId} not found`,
        });
        return;
      }

      // Delete post
      posts.splice(deletePostIndex, 1);

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