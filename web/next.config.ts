import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: { root: process.cwd() },
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node", "pdf-parse"],
};

export default nextConfig;
