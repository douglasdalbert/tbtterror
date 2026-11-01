FROM node:22-bookworm-slim AS build
ARG APP=game
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/game/package.json apps/game/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci
COPY packages/contracts packages/contracts
COPY apps/${APP} apps/${APP}
ARG APP_NODE_ENV=development
RUN npm run build -w @terror/contracts && TERROR_NODE_ENV="$APP_NODE_ENV" npm run build -w @terror/${APP} \
    && mkdir /web && cp -r apps/${APP}/dist/. /web/

FROM nginx:1.28-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /web/ /usr/share/nginx/html/
EXPOSE 80
