FROM node:20-bookworm-slim

WORKDIR /app

# Install deps first (better layer cache)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# App source
COPY . .

ENV NODE_ENV=production
# Railway injects PORT; bot uses long polling by default
EXPOSE 3000

CMD ["npm", "start"]
