# syntax=docker/dockerfile:1.10
# Ein Container für API + Web-App (die API liefert die gebaute Web-App aus).
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app
# Leer, damit pnpm die .npmrc ohne Warnung liest; beim Installieren setzt das Build-Secret den echten Token
ENV FONTAWESOME_PACKAGE_TOKEN=""

FROM base AS build
COPY . .
# Font Awesome Pro: Token nur als Build-Secret, landet weder im Image noch in dessen Verlauf
RUN --mount=type=secret,id=fontawesome_token,env=FONTAWESOME_PACKAGE_TOKEN pnpm install --frozen-lockfile
RUN pnpm build

FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    UPLOAD_DIR=/data/uploads
COPY --from=build /app /app
RUN mkdir -p /data/uploads
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["pnpm", "start"]
