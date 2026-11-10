# syntax=docker/dockerfile:1.7
# ABNSoft Pilotage — image multi-étapes
#   cible « web »   : serveur Next.js autonome (output: standalone), utilisateur non root
#   cible « tools » : worker, migrations, seed et scripts d'administration (tsx)

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# ── Dépendances ───────────────────────────────────────────────
FROM base AS deps
# URL fictive, utilisée seulement pendant le build (ARG : absente des images finales).
# Sans elle, `prisma generate` retombe sur le téléchargement de moteurs natifs inutiles.
ARG DATABASE_URL=postgresql://build:build@localhost:5432/build
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
# Importé par prisma.config.ts (dotenv + URL directe) : requis par `prisma generate` au postinstall.
COPY server/load-env.ts ./server/load-env.ts
# postinstall exécute `prisma generate` (compilateur de requêtes WASM : aucun binaire natif)
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

# ── Build ─────────────────────────────────────────────────────
FROM deps AS build
ARG DATABASE_URL=postgresql://build:build@localhost:5432/build
COPY . .
# Le build ne lit aucun secret : la configuration est validée au premier accès, à l'exécution.
RUN npm run build

# ── Outils : worker + migrations ──────────────────────────────
FROM base AS tools
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app /app
RUN rm -rf /app/.next/cache && mkdir -p /data/uploads && chown -R node:node /data
USER node
CMD ["npm", "run", "worker"]

# ── Web ───────────────────────────────────────────────────────
FROM base AS web
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    UPLOAD_DIR=/data/uploads
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
