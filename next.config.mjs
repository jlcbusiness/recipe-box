const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  allowedDevOrigins: ['192.168.1.201', '192.168.1.173'],
  serverExternalPackages: ['unzipper'],
};

export default nextConfig;
