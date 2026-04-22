import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  typedRoutes: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
