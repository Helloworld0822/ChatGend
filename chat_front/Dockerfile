FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup && \
    npm i -g serve@14

COPY --from=build /app/dist ./dist

USER appuser
EXPOSE 5000

CMD ["serve", "-s", "dist", "-l", "5000"]
