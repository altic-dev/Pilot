import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      '*.md': {
        loaders: ['raw-loader'],
        as: '*.js',
      },
    },
  },
  webpack: (config, { isServer }) => {
    config.module.rules.push({
      test: /\.md$/,
      type: 'asset/source',
    });

    // Externalize server-only packages (Docker SDK and native dependencies)
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push(
        'dockerode',
        'docker-modem',
        'cpu-features',
        'ssh2',
        'ssh2-streams',
        'tar-stream'
      );
    }

    return config;
  },
};

export default nextConfig;
