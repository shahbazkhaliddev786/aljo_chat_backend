# Using Lightweight docker image for node
FROM node:20-alpine AS base

# Setting Up Working Directory
WORKDIR /usr/src/backend-app

# Copying Package Files
COPY package*.json ./

# Installing Dependencies
RUN npm ci

# Copying Files
COPY . .

# Exposing Port
EXPOSE 5000
# Mediasoup SFU media ports (see MEDIASOUP_RTC_MIN_PORT/MAX_PORT)
EXPOSE 40000-40100/udp
EXPOSE 40000-40100/tcp

# Start Application
CMD ["npm", "run", "dev"]
