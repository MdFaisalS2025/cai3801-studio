# API image. Build from platform/backend:
#   docker build -f infra/docker/api.Dockerfile -t cai3801-api .
FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY shared ./shared
COPY llm ./llm
COPY api ./api
USER node
ENV PORT=8080
EXPOSE 8080
CMD ["node", "api/server.js"]
