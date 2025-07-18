import { describe, it, expect } from 'vitest';
import handler from './logout';
import { createMocks } from 'node-mocks-http';

describe('AUTH API - /api/auth/logout', () => {
  it('rejects non-POST methods', async () => {
    const { req, res } = createMocks({ method: 'GET' });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(405);
    const data = JSON.parse(res._getData());
    expect(data.code).toBe('METHOD_NOT_ALLOWED');
  });

  it('handles POST request and clears auth cookie', async () => {
    const { req, res } = createMocks({ method: 'POST' });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(true);
    expect(data.message).toBe('Successfully logged out');
    
    // Check that cookie is cleared
    const setCookieHeader = res._getHeaders()['set-cookie'];
    expect(setCookieHeader).toBeDefined();
    expect(setCookieHeader.toString()).toContain('auth-token=;');
    expect(setCookieHeader.toString()).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  });

  it('accepts logout request with auth token present', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      headers: {
        cookie: 'auth-token=somevalidtoken'
      }
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(true);
  });
}); 