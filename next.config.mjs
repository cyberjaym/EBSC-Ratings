/** @type {import('next').NextConfig} */
const nextConfig = {
  // Local dev only: the dev server is reached via tenant subdomains
  // (tenanta.lvh.me:3000, etc.), which differ from the request's actual
  // origin as far as Next's dev-server cross-origin check is concerned.
  // Harmless in production, where next start doesn't apply this check.
  allowedDevOrigins: ["*.lvh.me"],
};

export default nextConfig;
