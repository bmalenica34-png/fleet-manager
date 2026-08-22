import { PrismaPlugin } from "@prisma/nextjs-monorepo-workaround-plugin";

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@rent-a-car/api"],
  experimental: {
    // @react-pdf/renderer's internal reconciler breaks when Next bundles it
    // through the RSC webpack layer (wrong "react" resolution there) -
    // load it as a plain Node require instead. pdf-parse (via pdfjs-dist,
    // used for insurance policy text extraction) hits the same class of
    // bug for a different reason: "TypeError: Object.defineProperty called
    // on non-object" when pdfjs-dist's ESM build is routed through the RSC
    // bundling layer - confirmed via actual runtime error, not guessed.
    serverComponentsExternalPackages: [
      "@react-pdf/renderer",
      "@react-pdf/reconciler",
      "pdf-parse",
      "pdfjs-dist",
    ],
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
