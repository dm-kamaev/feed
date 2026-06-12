# Base Stage
FROM node:24-alpine AS base
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install

# Development Stage
FROM base AS development
COPY . .
CMD ["npm", "run", "start:dev"]

# Build Stage
FROM base AS build
COPY . .
RUN npm run build

# Production Stage
FROM node:24-alpine AS production
WORKDIR /usr/src/app
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist
COPY .env .env
CMD ["node", "dist/main"]
