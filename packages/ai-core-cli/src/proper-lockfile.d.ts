declare module 'proper-lockfile' {
  export function lock(path: string, options?: { retries?: number }): Promise<() => Promise<void>>;
  export function unlock(path: string): Promise<void>;
} 