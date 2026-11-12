# Ayni web: builds the Expo web app and serves it with Caddy, which also sends /api/* to the API and gets the HTTPS certificate.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Expo bakes EXPO_PUBLIC_* into the page at build time, so they come in as build arguments (see docker-compose.yml)
ARG EXPO_PUBLIC_API_URL
ARG EXPO_PUBLIC_BRYNTUM_LICENSE=
ENV EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL \
    EXPO_PUBLIC_BRYNTUM_LICENSE=$EXPO_PUBLIC_BRYNTUM_LICENSE \
    CI=1 \
    EXPO_NO_TELEMETRY=1
RUN test -n "$EXPO_PUBLIC_API_URL" || (echo "EXPO_PUBLIC_API_URL is empty: set DOMAIN in .env" && exit 1)
RUN npm run build:web

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
