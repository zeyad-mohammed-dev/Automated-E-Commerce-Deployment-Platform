# currencyservice: converts prices between currencies (Node.js, gRPC)
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
# --ignore-scripts: skips building "pprof" (a Google Cloud profiler tool that needs a C++ compiler).
# We run with DISABLE_PROFILER=1, so we do not need it.
RUN npm ci --omit=dev --ignore-scripts

# the code, the .proto files and the rates file (data/currency_conversion.json)
COPY . .

USER node

EXPOSE 7000

CMD ["node", "server.js"]
