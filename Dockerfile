FROM node:24-alpine

RUN apk add --no-cache tini

WORKDIR /app

COPY package.json package-lock.json ./
COPY core/package.json core/package.json
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY extension/package.json extension/package.json

RUN npm ci --workspace backend --include=dev --ignore-scripts --no-audit --no-fund \
 || npm install --workspace backend --include=dev --ignore-scripts --no-audit --no-fund \
 && npm cache clean --force

COPY core/src core/src
COPY backend/src backend/src

ENV NODE_ENV=production \
    PORT=8080

EXPOSE 8080

USER node

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--import", "tsx", "backend/src/server.ts"]
