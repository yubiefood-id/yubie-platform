import type { NextConfig } from "next";

// Static-export hosts (e.g. Vercel static deploy) need prerendered HTML;
// the default build stays on the Cloudflare worker artifact.
const staticExport = process.env.YUBIE_STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  ...(staticExport ? { output: "export" as const } : {}),
  transpilePackages: ["@yubie/domain", "@yubie/ui", "@yubie/validation"],
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
