/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // Server-side proxy so the browser sees a single origin: requests to
  // /api/* are forwarded to the api container. Lets us keep the API URL
  // relative in the client bundle, so the same build works behind any
  // hostname (localhost, LAN IP, Cloudflare tunnel, real domain).
  async rewrites() {
    const target = process.env.API_PROXY_TARGET || "http://api:8000";
    return [{ source: "/api/:path*", destination: `${target}/:path*` }];
  },
};

export default nextConfig;
