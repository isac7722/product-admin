FROM node:24-bookworm-slim AS build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY client/ ./
RUN npm run build

FROM nginx:stable-alpine
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html
EXPOSE 80
