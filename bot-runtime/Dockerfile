FROM node:22-bookworm AS build
WORKDIR /srv/rim-bot-runtime
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=8787
WORKDIR /srv/rim-bot-runtime
COPY --from=build /srv/rim-bot-runtime/node_modules ./node_modules
COPY package.json server.mjs ./
USER node
EXPOSE 8787
CMD ["node","server.mjs"]
