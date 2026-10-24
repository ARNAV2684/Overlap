# web.Dockerfile — The web app as a Container App
#
# Purpose: the public site: Next.js production build served on port 3000
# Inputs:  build context = web/; build arg NEXT_PUBLIC_DEFAULT_MATCH_ID (inlined at build time, must be in the archive);
#          Azure settings from the container's environment (infra/modules/container-apps.bicep)
# Outputs: image <registry>/web
# Spec:    infra/specs/resources.md §3; web/specs/realtime.md §6

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG NEXT_PUBLIC_DEFAULT_MATCH_ID=SYN-2501
ENV NEXT_PUBLIC_DEFAULT_MATCH_ID=$NEXT_PUBLIC_DEFAULT_MATCH_ID NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/data ./data
COPY --from=build /app/next.config.ts ./
USER node
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
