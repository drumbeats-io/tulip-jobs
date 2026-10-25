FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npx tsc -p .
ENV NODE_ENV=production
CMD ["node", "dist/api.js"]
