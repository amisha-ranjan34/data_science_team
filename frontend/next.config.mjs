/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone", // small self-contained server for Docker
  eslint: { ignoreDuringBuilds: true },
};
export default nextConfig;
