import { PrismaPlugin } from "@prisma/nextjs-monorepo-workaround-plugin";

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@rent-a-car/api"],
  experimental: {
    // @react-pdf/renderer's internal reconciler breaks when Next bundles it
    // through the RSC webpack layer (wrong "react" resolution there) -
    // load it as a plain Node require instead.
    serverComponentsExternalPackages: ["@react-pdf/renderer", "@react-pdf/reconciler"],
  },
  webpack: (config, { isServer }) => {
    // Next's file tracing misses the Prisma query engine binary in this
    // pnpm/Turborepo monorepo layout, so it never ships in the Vercel
    // serverless bundle ("could not locate the Query Engine for runtime
    // rhel-openssl-3.0.x") - this plugin explicitly copies it in.
    if (isServer) {
      config.plugins = [...config.plugins, new PrismaPlugin()];
    }
    return config;
  },
};

export default nextConfig;
