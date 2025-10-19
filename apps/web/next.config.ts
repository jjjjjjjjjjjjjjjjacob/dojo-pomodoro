import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.convex.dev",
      },
      {
        protocol: "https",
        hostname: "**.convex.cloud",
      },
    ],
  },
  typescript: {
    tsconfigPath: "./tsconfig.build.json",
  },
  experimental: {
    forceSwcTransforms: true,
  },
  webpack: (config, { dev }) => {
    // Exclude test files from webpack bundling
    config.module = config.module || {};
    config.module.rules = config.module.rules || [];

    config.module.rules.push({
      test: /\.(test|spec)\.(ts|tsx|js|jsx)$/,
      use: "ignore-loader",
    });

    if (dev) {
      config.watchOptions = {
        ...(config.watchOptions ?? {}),
        poll: 1000,
        aggregateTimeout: 300,
        ignored: [
          "**/.git/**",
          "**/.hg/**",
          "**/.svn/**",
          "**/.DS_Store",
          "**/.next/**",
          "**/dist/**",
          "**/build/**",
          "**/coverage/**",
          "**/node_modules/**",
          "**/bun.lock",
          "**/package-lock.json",
          "**/yarn.lock",
          "**/pnpm-lock.yaml",
          "**/convex/.deploy/**",
          "**/__tests__/**",
          "**/test-setup.ts",
        ],
      } as any;
    }
    return config;
  },
};

export default nextConfig;
