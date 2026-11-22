# Multi-stage build for production
FROM node:20-alpine AS builder

WORKDIR /usr/src/backend-app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /usr/src/backend-app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /usr/src/backend-app/dist ./dist

EXPOSE 5000
# Mediasoup SFU media ports (see MEDIASOUP_RTC_MIN_PORT/MAX_PORT)
EXPOSE 40000-40100/udp
EXPOSE 40000-40100/tcp

CMD ["npm", "start"]
