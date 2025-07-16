import type { NextConfig } from "next";
// Define global security headers to mitigate common web vulnerabilities
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    // Restrict sources to self and allow inline styles / eval only where absolutely necessary for reference app
    value: "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-eval'; img-src 'self' data:;",
  },
  {
    key: 'Strict-Transport-Security',
    // Enforce HTTPS for two years including sub-domains and allow preload list inclusion
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'X-Frame-Options',
    // Prevent clickjacking by disallowing the site from being framed
    value: 'SAMEORIGIN',
  },
  {
    key: 'Referrer-Policy',
    // Limit the amount of referrer information leaked during navigation
    value: 'origin-when-cross-origin',
  },
];

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        source: '/.well-known/aura.json',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600, s-maxage=3600',
          },
          {
            key: 'Content-Type',
            value: 'application/json',
          },
        ],
      },
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version',
          },
          {
            key: 'Access-Control-Expose-Headers',
            value: 'AURA-State, Location, Set-Cookie',
          },
          {
            key: 'Vary',
            value: 'Origin',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
