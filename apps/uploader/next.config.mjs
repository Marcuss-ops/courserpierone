/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  env: {
    TIKTOK_CLIENT_KEY: process.env.TIKTOK_CLIENT_KEY,
    TIKTOK_CLIENT_SECRET: process.env.TIKTOK_CLIENT_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  },
  async rewrites() {
    return [
      {
        source: "/%20/:path*",
        destination: "/:path*",
      },
    ];
  },
};

export default nextConfig;