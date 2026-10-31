FROM oven/bun:1.4-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile
COPY . .
RUN bun run --cwd apps/web build

FROM oven/bun:1.4-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
RUN mkdir -p /data/storage && chown -R bun:bun /data
USER bun
EXPOSE 3000
CMD ["bun", "apps/api/src/main.ts"]
