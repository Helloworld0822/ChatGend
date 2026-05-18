FROM node:18-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --silent

COPY . .

EXPOSE 3000

# Start the Hono dev server (tsx watch) defined in package.json
CMD ["npm", "run", "dev"]
