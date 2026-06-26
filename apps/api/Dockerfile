FROM node:22-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"
WORKDIR /workspace
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/mcp/package.json apps/mcp/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY apps/mcp apps/mcp
RUN pnpm --filter api prisma:generate
RUN pnpm --filter api build

FROM base AS runtime
ENV NODE_ENV="production"
COPY --from=build /workspace/package.json /workspace/pnpm-lock.yaml /workspace/pnpm-workspace.yaml ./
COPY --from=build /workspace/node_modules node_modules
COPY --from=build /workspace/packages/shared/package.json packages/shared/package.json
COPY --from=build /workspace/packages/shared/node_modules packages/shared/node_modules
COPY --from=build /workspace/packages/shared/dist packages/shared/dist
COPY --from=build /workspace/apps/api/package.json apps/api/package.json
COPY --from=build /workspace/apps/api/node_modules apps/api/node_modules
COPY --from=build /workspace/apps/api/dist apps/api/dist
COPY --from=build /workspace/apps/api/prisma apps/api/prisma
COPY --from=build /workspace/apps/mcp/package.json apps/mcp/package.json
COPY --from=build /workspace/apps/mcp/node_modules apps/mcp/node_modules
COPY --from=build /workspace/apps/mcp/dist apps/mcp/dist
WORKDIR /workspace/apps/api
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node --enable-source-maps dist/main.js"]
