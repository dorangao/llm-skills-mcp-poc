# LLM Skills POC

This monorepo packages one shared `pr-review` skill and exposes it through both an HTTP API and an MCP server. The skill manifest, instructions, examples, and audit traces are shared across both entrypoints so API clients and MCP clients run the same contract.

## Stack

- Node.js 22
- TypeScript
- npm workspaces
- Express HTTP API
- Model Context Protocol server over stdio
- Zod and YAML for skill contracts and manifests
- Vitest for tests
- Docker Compose for the API container

## Install, Test, And Build

```sh
npm install
npm test
npm run build
```

## Local API

Start the API in development mode:

```sh
npm run dev:api
```

After `npm run build`, start the built API:

```sh
npm run start:api
```

Health check:

```sh
curl http://localhost:3000/healthz
```

List skills:

```sh
curl http://localhost:3000/skills
```

Run the shared `pr-review` skill:

```sh
curl -X POST http://localhost:3000/skills/pr-review/run \
  -H 'Content-Type: application/json' \
  -d '{
    "client": "api",
    "inputs": {
      "repo": "checkout-service",
      "diff": "diff --git a/src/cart.ts b/src/cart.ts\n+export function formatCart(items) {\n+  return items.map(item => item.name).join(\", \");\n+}",
      "risk_level": "low"
    }
  }'
```

## Admin Workbench

Start the API:

```sh
npm run dev:api
```

Open:

```text
http://localhost:3000/admin
```

The workbench can load skills, edit `skill.yaml`, edit `instructions.md`, edit packaged examples, save validated changes, restore the latest backup, run a skill, evaluate examples, and inspect redacted audit events.

Every write creates a timestamped backup under `.data/backups/<skill-id>/`.

## Local MCP

Run the MCP server in development mode:

```sh
npm run dev:mcp
```

After `npm run build`, MCP clients can run the built stdio server with:

```sh
node apps/mcp-server/dist/index.js
```

Available MCP tools:

- `list_skills`
- `get_skill`
- `run_skill`
- `evaluate_skill`

## Docker

Build and run the API service:

```sh
docker compose up --build
```

The compose service publishes the API on port 3000, mounts `./skills` read-write for admin edits, and mounts `./.data` for traces and backups.

Check the containerized API:

```sh
curl http://localhost:3000/healthz
```

Build the stable API image, then run the MCP server from that image:

```sh
docker compose build
docker run --rm -i llm-skills-poc-api node apps/mcp-server/dist/index.js
```
