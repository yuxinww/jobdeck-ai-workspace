import type { NextConfig } from "next";

const isGitHubPagesBuild = process.env.GITHUB_ACTIONS === "true";
const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: isGitHubPagesBuild ? "export" : undefined,
  basePath: isGitHubPagesBuild && repositoryName ? `/${repositoryName}` : undefined,
  trailingSlash: isGitHubPagesBuild,
  images: { unoptimized: true },
  experimental: { useTypeScriptCli: false },
};

export default nextConfig;
