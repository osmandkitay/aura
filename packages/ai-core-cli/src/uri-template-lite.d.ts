declare module 'uri-template-lite' {
  export namespace URI {
    class Template {
      constructor(template: string);
      expand(data: Record<string, any>): string;
      keys: Array<{ name: string }>;
    }
  }
} 