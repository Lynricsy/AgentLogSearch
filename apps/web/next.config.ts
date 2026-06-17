import type { NextConfig } from "next"

const apiProxyTarget = process.env.API_PROXY_TARGET ?? "http://localhost:3001"

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiProxyTarget}/api/:path*`,
      },
    ]
  },
  reactStrictMode: true,
}

export default nextConfig
