ARG NODE_VERSION=26.13.0
FROM node:${NODE_VERSION}-slim

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --omit=dev --ignore-scripts && \
    npm cache clean --force

COPY . .

RUN mkdir -p /app/logs /app/data && chown -R node:node /app /app/logs /app/data

EXPOSE 3544

USER node

CMD ["node", "src/server.js"]
