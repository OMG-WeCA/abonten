/** @type {import('next').NextConfig} */
const allowedDevOrigins = (process.env.WEB_ALLOWED_DEV_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig = {
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  ...(allowedDevOrigins.length > 0 ? { allowedDevOrigins } : {}),
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
};
export default nextConfig;
