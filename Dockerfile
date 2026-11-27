# Classroom server image (Studio + accounts + AI proxy). Build from the cai/ folder so the site is included:
#   node build-site.js
#   docker build -t cai3801-classroom .      (Cloud Run: gcloud run deploy --source .)
FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY platform/backend/package.json platform/backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY platform/backend/llm ./llm
COPY platform/backend/classroom ./classroom
COPY site ./site
ENV SITE_DIR=/app/site PORT=8080 COOKIE_SECURE=on
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 8080
CMD ["node", "classroom/server.js"]
