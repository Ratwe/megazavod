FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY src/story/domain.ts ./src/story/domain.ts
ENV NODE_ENV=production PORT=8787 DATABASE_PATH=/data/zavod.db
VOLUME ["/data"]
EXPOSE 8787
CMD ["node", "server/index.mjs"]
