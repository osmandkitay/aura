import { describe, it, expect } from 'vitest';
import handler from './profile';
import { createMocks } from 'node-mocks-http';


describe('USER API - /api/user/profile', () => {
  it('unauthorized without cookie', async () => {
    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(401);
  });
}); 