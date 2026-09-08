import type { NextConfig } from "next";

function backendOrigin(): string {
  const rawValue = process.env.BACKEND_URL ?? "http://127.0.0.1:8010";
  const parsed = new URL(rawValue);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("BACKEND_URL 必须使用 http 或 https 协议");
  }
  return parsed.origin;
}

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${backendOrigin()}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
