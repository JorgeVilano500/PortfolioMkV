import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  turbopack: {
    rules: {
      '*.pdf': {
        loaders: ['file-loader'],
        as: '*.js',
      },
    },
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.pdf$/,
      type: 'asset/resource',
    });
    return config;
  },
  allowedDevOrigins: ["10.0.0.183"]
};

// export default nextConfig;
module.exports = nextConfig;

// module.exports = {
//   webpack(config) {
//     config.module.rules.push({
//       test: /\.pdf$/,
//       type: 'asset/resource',
//     });
//     return config;
//   },
// };