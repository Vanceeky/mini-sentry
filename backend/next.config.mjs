/** @type {import('next').NextConfig} */
const nextConfig = {
  // This repo already has a hand-authored root CLAUDE.md with project
  // conventions; Next.js's auto-generated AGENTS.md/CLAUDE.md inside this
  // workspace would be confusing noise alongside it.
  agentRules: false,
};

export default nextConfig;
