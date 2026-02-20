import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    // Tree-shake les barrel exports de ces packages pour réduire le bundle
    optimizePackageImports: ['lucide-react', 'react-markdown', 'remark-gfm'],
  },
};

export default nextConfig;
