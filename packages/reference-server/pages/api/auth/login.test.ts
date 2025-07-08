import { describe, it, expect } from 'vitest';
import handler from './login';
import { createMocks } from 'node-mocks-http';


describe('AUTH API - /api/auth/login', () => {
  it('rejects non-POST methods', async () => {
    const { req, res } = createMocks({ method: 'GET' });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(405);
  });

  it('requires email and password', async () => {
    const { req, res } = createMocks({ method: 'POST', body: {} });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
  });

  it('accepts valid credentials', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: { email: 'demo@aura.dev', password: 'password123' },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(true);
    expect(res._getHeaders()['set-cookie']).toBeDefined();
  });
}); 