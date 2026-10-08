# ---- build the React client ----
FROM node:20-alpine AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- run the API (serves the built client too) ----
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY server/package*.json server/
RUN npm ci --omit=dev --prefix server
COPY server/ server/
COPY --from=client /app/client/dist client/dist
EXPOSE 4000
CMD ["node", "server/src/index.js"]
