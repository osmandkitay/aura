import { describe, it, expect } from 'vitest';
import handler from './index';
import { createMocks } from 'node-mocks-http';


describe('POSTS API - /api/posts', () => {
  it('GET returns paginated posts', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      query: { limit: '1', offset: '0' },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.posts).toHaveLength(1);
    expect(data.total).toBeGreaterThanOrEqual(1);
  });

  it('GET filters by tags', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      query: { tags: 'agents' },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    // All returned posts should include the requested tag
    expect(data.posts.every((p: any) => p.tags.includes('agents'))).toBe(true);
  });

  it('POST without auth returns 401', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: { title: 'New', content: 'New content' },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(401);
  });
}); 