# Ayni API. Build:  docker compose build api
FROM node:22-slim

# Prisma needs OpenSSL at build and run time
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
# dev dependencies stay on purpose: prisma (db push) and tsx (db:seed) are used inside the container
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 4000
# `db push` only adds tables and columns; if a change would lose data it stops instead of applying it
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/boot.js"]
