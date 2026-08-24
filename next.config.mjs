/** @type {import('next').NextConfig} */
const nextConfig = {
  // Don't auto-generate AGENTS.md/CLAUDE.md on dev/build.
  agentRules: false,
};

export default nextConfig;
