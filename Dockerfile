FROM node:22-slim AS deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/mcp-server/package.json apps/mcp-server/package.json
COPY packages/skill-spec/package.json packages/skill-spec/package.json
COPY packages/skill-runner/package.json packages/skill-runner/package.json

RUN npm ci

FROM deps AS build

COPY tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY skills ./skills

RUN npm run build

FROM node:22-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV SKILLS_PROJECT_ROOT=/app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/mcp-server/package.json apps/mcp-server/package.json
COPY packages/skill-spec/package.json packages/skill-spec/package.json
COPY packages/skill-runner/package.json packages/skill-runner/package.json

RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/mcp-server/dist apps/mcp-server/dist
COPY --from=build /app/packages/skill-spec/dist packages/skill-spec/dist
COPY --from=build /app/packages/skill-runner/dist packages/skill-runner/dist
COPY --from=build /app/skills skills

RUN mkdir -p .data

EXPOSE 3000

CMD ["node", "apps/api/dist/index.js"]
