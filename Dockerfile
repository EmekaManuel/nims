# One container: builds the web app, then the Node server serves both the game's pages and its API.
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
COPY web/package*.json web/
RUN npm ci && npm ci --prefix web
COPY . .
RUN npm run build --prefix web
ENV PORT=8080 DATA_DIR=/data
EXPOSE 8080
CMD ["npx", "tsx", "server/main.ts"]
