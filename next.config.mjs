const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  serverExternalPackages: ['unzipper'],
};

export default nextConfig;
