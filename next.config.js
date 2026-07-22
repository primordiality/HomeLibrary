/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'covers.openlibrary.org' },
      { protocol: 'https', hostname: 'ydfrhhssnholhbuxaaqg.supabase.co' },
    ],
  },
};

module.exports = nextConfig;
