import { vi, describe, it, expect } from 'vitest';
// Mock OpenAI to avoid runtime initialization in tests
vi.mock('openai', () => {
  return {
    default: class {
      // minimal mock
      constructor() {}
    }
  };
});

// Ensure the OpenAI client can initialize in the agent module during tests
process.env.NODE_ENV = 'test';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'sk-test-key';
import { expandUriTemplate } from './agent';


describe('expandUriTemplate', () => {
  it('replaces path parameters', () => {
    const template = '/api/posts/{id}';
    const args = { id: '123' };

    const result = expandUriTemplate(template, args);

    expect(result.url).toBe('/api/posts/123');
    expect(result.queryParams).toEqual({});
  });

  it('handles query parameters', () => {
    const template = '/api/posts{?limit,offset}';
    const args = { limit: 10, offset: 5 };

    const result = expandUriTemplate(template, args);

    expect(result.url).toBe('/api/posts');
    expect(result.queryParams).toEqual({ limit: 10, offset: 5 });
  });

  it('handles exploded array query parameters', () => {
    const template = '/api/posts{?tags*}';
    const args = { tags: ['news', 'aura'] };

    const result = expandUriTemplate(template, args);

    expect(result.url).toBe('/api/posts');
    expect(result.queryParams).toEqual({ tags: ['news', 'aura'] });
  });

  it('ignores parameters not in template', () => {
    const template = '/api/posts{?limit}';
    const args = { limit: 10, extra: 'ignore-me' };

    const result = expandUriTemplate(template, args);

    expect(result.url).toBe('/api/posts');
    expect(result.queryParams).toEqual({ limit: 10 });
  });
}); 