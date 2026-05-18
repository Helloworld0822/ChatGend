FROM node:18-alpine
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --silent

# Copy source
COPY . .

EXPOSE 5173

# Start Vite dev server and listen on all interfaces so nginx can proxy to it
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
