# frontend: the Angular website served by Nginx
# Multi-stage build: stage 1 builds the website (needs Node), stage 2 only serves the files (Nginx).

# ---------- stage 1: build ----------
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx ng build --configuration production

# ---------- stage 2: serve ----------
# the "unprivileged" Nginx does not need root (it listens on 8080 instead of 80)
FROM nginxinc/nginx-unprivileged:stable-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html

EXPOSE 8080
