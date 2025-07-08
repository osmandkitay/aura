import { describe, it, expect } from 'vitest';
import handler from './[id]';
import { createMocks } from 'node-mocks-http';


describe('POSTS API - /api/posts/[id]', () => {
  it('GET existing returns post', async () => {
    const { req, res } = createMocks({ method: 'GET', query: { id: '1' } });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.id).toBe('1');
  });

  it('GET missing returns 404', async () => {
    const { req, res } = createMocks({ method: 'GET', query: { id: '999' } });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(404);
  });

  it('DELETE without auth returns 401', async () => {
    const { req, res } = createMocks({ method: 'DELETE', query: { id: '1' } });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(401);
  });
}); 