# Shared Skills API Phase 1 Design

## Context

This project is a Phase 1 prototype for a Shared Skills API: a small system that lets a team define a reusable AI assistant workflow once, then expose it through both an HTTP API and an MCP server.

The first build will focus on one skill, `pr-review`, and prove that the same skill definition can power two clients:

- HTTP callers through the Registry API.
- MCP-compatible clients through the MCP server.

The prototype will use TypeScript and Node. It will be containerized for local development, but it will avoid production-only concerns such as Postgres, OAuth, multi-version database storage, and full governance workflows until later phases.

## Goals

- Define a neutral skill format using YAML and Markdown.
- Load and validate skills from the local filesystem.
- Expose validated skills through an HTTP Registry API.
- Expose the same skills through an MCP server.
- Implement one useful `pr-review` skill.
- Add a simple deterministic runner so the prototype works without model credentials.
- Add evaluation examples that can be run locally.
- Provide Docker and Docker Compose support for repeatable local execution.

## Non-Goals

- Full admin UI.
- Persistent database-backed registry.
- OAuth/OIDC authentication.
- Multi-version database storage.
- Platform-specific package generation for ChatGPT Apps SDK, Claude Skills, or Cursor plugins.
- Model-backed execution requiring API keys.
- Production audit, approval, or deprecation workflows.

## Architecture

The repo will use a TypeScript workspace with separate apps and shared packages:

```text
shared-skills/
  apps/
    api/
    mcp-server/
  packages/
    skill-spec/
    skill-runner/
  skills/
    pr-review/
  docs/
    superpowers/
      specs/
```

`apps/api` will provide the HTTP Registry API. It will load skills through shared packages and expose endpoints for listing skills, reading a skill, running a skill, and evaluating a skill.

`apps/mcp-server` will expose the same registry-backed capabilities through MCP tools. It should not maintain a separate copy of the skill logic. It will call the same registry and runner modules used by the HTTP API.

`packages/skill-spec` will hold the neutral skill schemas and TypeScript types. It will validate `skill.yaml` files and define the supported input/output schema structure for Phase 1.

`packages/skill-runner` will hold shared runtime behavior: loading instructions, validating inputs, assembling prompt context, running deterministic skill logic, validating outputs, and writing lightweight trace records.

`skills/pr-review` will be the first real skill package. It will contain a YAML manifest, Markdown instructions, example cases, and expected output traits.

## Skill Format

Each skill will be a directory under `skills/`.

```text
skills/pr-review/
  skill.yaml
  instructions.md
  examples/
    basic-risk.json
    missing-tests.json
```

`skill.yaml` will include:

- `id`
- `name`
- `version`
- `description`
- `inputs`
- `outputs`
- `tools`
- `guardrails`
- `targets`
- `instructions`
- `examples`

The current Phase 1 versioning model is intentionally simple. A skill has a single current version in `skill.yaml`. API and MCP calls may include an optional `version`, but the registry will only accept the version present on disk. This keeps the public contract ready for later multi-version storage without adding database complexity now.

## Registry API

The API will expose a small HTTP contract:

```text
GET  /healthz
GET  /skills
GET  /skills/:skillId
POST /skills/:skillId/run
POST /skills/:skillId/evaluate
GET  /skills/:skillId/audit
```

`GET /skills` returns validated skill metadata.

`GET /skills/:skillId` returns one validated skill manifest and available examples.

`POST /skills/:skillId/run` accepts a client name, optional version, and input object. It validates the request, runs the skill, validates the output, writes a trace, and returns the result with a trace id.

`POST /skills/:skillId/evaluate` runs checked examples for the selected skill and returns pass/fail results.

`GET /skills/:skillId/audit` returns recent local trace metadata. Phase 1 audit data will be file-backed under `.data/`.

## MCP Server

The MCP server will use the official TypeScript MCP SDK. It will expose tools backed by the same registry and runner modules as the API:

```text
list_skills
get_skill
run_skill
evaluate_skill
```

The MCP server will be runnable as a local process for MCP-compatible clients. The design should keep the server adapter thin: MCP request handling should translate protocol input into shared runner calls, then return structured content.

The current SDK references used for this design are:

- https://modelcontextprotocol.io/docs/sdk
- https://github.com/modelcontextprotocol/typescript-sdk

## Runner

The first runner will be deterministic and local. It will not call an LLM.

For `pr-review`, the runner will inspect the supplied diff and inputs, then return a structured response with fields such as:

- `summary`
- `blocking_issues`
- `non_blocking_suggestions`
- `test_recommendations`
- `deployment_risk`

This proves the end-to-end registry, API, MCP, schema, evaluation, and trace path without requiring model credentials. A model-backed execution adapter can be added later behind the same runner interface.

## Docker

The project will include local Docker support:

- A root `Dockerfile` that builds the TypeScript workspace.
- `docker-compose.yml` for starting the API service locally.
- A documented way to run the MCP server from the same image.
- Development mounts for `skills/` and `.data/` so skill edits and traces survive container restarts.

No Postgres container is needed in Phase 1. File-backed storage is enough for the prototype and avoids premature migration work.

## Testing

Testing will cover the contract boundaries:

- Unit tests for skill manifest validation.
- Unit tests for registry loading.
- Unit tests for runner output validation.
- Unit tests for the deterministic PR Review logic.
- API integration tests for `GET /skills`, `GET /skills/:skillId`, `POST /skills/:skillId/run`, and `POST /skills/:skillId/evaluate`.
- MCP smoke test proving the same `pr-review` skill is visible and runnable through MCP.
- Docker smoke path documented in `README.md`.

The likely test runner is Vitest, with Supertest or equivalent HTTP request helpers for API integration tests.

## Success Criteria

Phase 1 is successful when:

- `skills/pr-review/skill.yaml` is the single source of truth for the PR Review skill.
- The HTTP API can list and run the PR Review skill.
- The MCP server can list and run the same PR Review skill.
- Evaluation examples can be run locally.
- Tests pass locally.
- Docker Compose can start the API and run a sample request.

## Future Work

- Add model-backed execution adapters.
- Add persistent Postgres-backed registry storage.
- Add authentication and workspace-level permissions.
- Add an admin UI for publishing and versioning skills.
- Add platform exports for OpenAI Apps SDK, Claude Skills, and Cursor rules or plugin manifests.
- Add version approvals, deprecation flow, usage analytics, and regression eval dashboards.
