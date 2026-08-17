# Multi-stage Dockerfile for Node.js + Express 5 + Socket.io + Mediasoup SFU

# Stage 1: Build stage
FROM node:20-slim AS builder

WORKDIR /usr/src/app

# Install build tools required for compiling native C++ Mediasoup worker
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    make \
    g++ \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency definitions
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code and configuration
COPY . .

# Compile TypeScript code to dist/
RUN npm run build

# Stage 2: Production runner stage
FROM node:20-slim AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production
ENV PORT=5000

# Install runtime dependencies required by Mediasoup
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Copy package definitions, node_modules, and compiled output from builder
COPY package*.json ./
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist

# Expose default HTTP/Socket port
EXPOSE 5000

# Start the application
CMD ["npm", "start"]
