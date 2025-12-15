# STAGE 1: Build Stage
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

# Copy dependency definitions
COPY package*.json ./

# Install dependencies including dev dependencies for build
# python3 and build-base might be needed for some native modules if added later
RUN apk add --no-cache python3 build-base

RUN npm ci

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build application
RUN npm run build

# STAGE 2: Production Stage
FROM node:22-alpine

# Install runtime dependencies
RUN apk add --no-cache openssl

WORKDIR /usr/src/app

COPY package*.json ./

# Install only production dependencies
RUN npm install --only=production

# Copy built artifacts and prisma client
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/prisma ./prisma
COPY --from=builder /usr/src/app/node_modules/.prisma ./node_modules/.prisma

# Create upload directory
RUN mkdir -p uploads/inspection-photos

# Expose port (default 3010 as per main.ts)
EXPOSE 3010

# Start application
CMD ["node", "dist/main"]
