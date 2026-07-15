/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@abonten/contracts'],
  reactStrictMode: true,
  // Type-checking is handled by the dedicated `pnpm type-check` (turbo type-check) task,
  // which runs `tsc --noEmit` per package. Skip Next's built-in type check during
  // `next build` so the build task stays focused on compilation.
  typescript: { ignoreBuildErrors: true },
};
export default nextConfig;
