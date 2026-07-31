/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: '/api',
  },
  allowedDevOrigins: ['95.217.8.52.nip.io', '95.217.8.52'],
}

module.exports = nextConfig