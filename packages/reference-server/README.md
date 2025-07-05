# AURA Protocol: Reference Server

This package contains a reference implementation of an AURA-enabled server, built with [Next.js](https://nextjs.org).

It demonstrates how to:
- Serve a `.well-known/aura.json` manifest file.
- Implement API endpoints that correspond to capabilities defined in the manifest.
- Use the `AURA-State` header to dynamically inform clients about available capabilities.

## Getting Started

All commands should be run from the root of the monorepo.

### 1. Install Dependencies

If you haven't already, install the dependencies for the entire project:

```bash
pnpm install
```

### 2. Run the Development Server

To start the server, run the following command from the project root:

```bash
pnpm --filter aura-reference-server dev
```

The server will be available at [http://localhost:3000](http://localhost:3000).

## Key Files

- **`public/.well-known/aura.json`**: The static manifest file that describes the server's capabilities to AURA clients.
- **`pages/api/`**: Contains the API routes that implement the capabilities defined in the manifest (e.g., `pages/api/posts/index.ts`).
- **`middleware.ts`**: An example of Next.js middleware that injects the `AURA-State` header into responses.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn-pages-router) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/pages/building-your-application/deploying) for more details.
