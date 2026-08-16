/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@rent-a-car/api"],
  experimental: {
    // @react-pdf/renderer's internal reconciler breaks when Next bundles it
    // through the RSC webpack layer (wrong "react" resolution there) -
    // load it as a plain Node require instead.
    serverComponentsExternalPackages: ["@react-pdf/renderer", "@react-pdf/reconciler"],
  },
};

export default nextConfig;
