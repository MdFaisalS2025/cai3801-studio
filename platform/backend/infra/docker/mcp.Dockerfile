# MCP server image (Streamable HTTP). Build from platform/backend:
#   docker build -f infra/docker/mcp.Dockerfile -t cai3801-mcp .
FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY shared ./shared
COPY llm ./llm
COPY api ./api
COPY mcp ./mcp
USER node
ENV PORT=8080 HOST=0.0.0.0
EXPOSE 8080
CMD ["node", "mcp/http.js"]
