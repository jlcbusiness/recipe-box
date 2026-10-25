const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  allowedDevOrigins: ['192.168.1.201'],
  serverExternalPackages: ['unzipper'],
};

export default nextConfig;
