# TRUSTLINE — always-on deploy (railway or any docker host)
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/db ./db
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/next.config.ts ./

# persistent volume mounts here; DB_FILE env points into it
RUN mkdir -p /data
ENV DB_FILE=/data/trustline.db

EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
