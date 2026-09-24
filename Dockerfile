# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS base-build
WORKDIR /app
RUN npm install --global pnpm@11.13.1
RUN pnpm config set store-dir /pnpm/store
COPY . .

FROM base-build AS api-build
RUN --mount=type=cache,id=abonten-pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile --filter @abonten/api...
RUN pnpm --filter @abonten/api build
RUN --mount=type=cache,id=abonten-pnpm-store,target=/pnpm/store pnpm --filter @abonten/api deploy --prod --legacy /release

FROM node:24-bookworm-slim AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=api-build --chown=node:node /release /app
RUN mkdir -p /app/uploads && chown node:node /app/uploads
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]

FROM base-build AS web-build
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_BASE_PATH
ARG NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
ENV NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=$NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
RUN test -n "$NEXT_PUBLIC_API_BASE_URL" && test -n "$NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN"
RUN --mount=type=cache,id=abonten-pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile --filter @abonten/web...
RUN pnpm --filter @abonten/web build

FROM nginx:stable-alpine AS web
ARG NEXT_PUBLIC_BASE_PATH
COPY docker/nginx-web.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/apps/web/out /usr/share/nginx/html${NEXT_PUBLIC_BASE_PATH}
EXPOSE 80
