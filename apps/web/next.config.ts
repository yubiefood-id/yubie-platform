import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@yubie/domain", "@yubie/ui", "@yubie/validation"],
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
