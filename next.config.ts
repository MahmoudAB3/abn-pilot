import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Image autonome (Docker) : serveur Node minimal + dépendances tracées
  output: "standalone",
  // Le compilateur de requêtes Prisma (WASM) n'est pas détecté par le traçage : on l'inclut explicitement
  outputFileTracingIncludes: { "/**/*": ["./node_modules/.prisma/client/**/*"] },
  serverExternalPackages: ["pino", "pino-pretty", "isomorphic-dompurify", "jsdom"],
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
};

export default nextConfig;
