# ordersservice: small Node.js image (see DOCKER_GUIDE.md)
FROM node:22-alpine

# production mode: npm skips dev tools and the app runs faster
ENV NODE_ENV=production

WORKDIR /app

# 1) copy only the dependency files first, so Docker can cache this layer
COPY package*.json ./
RUN npm ci --omit=dev

# 2) then copy the source code (changes often, so it comes after npm ci)
COPY . .

# do not run as root (the node image already has a user called node)
USER node

EXPOSE 8080

CMD ["node", "index.js"]
