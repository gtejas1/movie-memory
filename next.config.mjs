/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Google profile photos
    remotePatterns: [{ protocol: "https", hostname: "lh3.googleusercontent.com" }],
  },
};
export default nextConfig;
