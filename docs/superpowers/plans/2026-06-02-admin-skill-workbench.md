# Admin Skill Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local `/admin` workbench that verifies, operates, edits, backs up, and restores file-backed skill definitions through the existing Express API.

**Architecture:** Keep the current TypeScript/Node workspace and serve a framework-free admin UI from `apps/api`. Add a focused admin store for safe file edits, validation, backups, and restore, then expose it through JSON admin endpoints used by the browser workbench. The existing registry, runner, and redacted audit path remain the source of truth for verification and operations.

**Tech Stack:** TypeScript 6, Node 22, Express 5, Zod 4, YAML 2, Vitest 4, Supertest 7, vanilla HTML/CSS/JavaScript.

---

## File Structure

- Create `apps/api/src/admin/store.ts`: safe skill-file read/write, validation, backup, restore.
- Create `apps/api/src/admin/routes.ts`: admin JSON routes plus `/admin` page route.
- Create `apps/api/src/admin/page.ts`: static HTML/CSS/JS workbench shell.
- Create `apps/api/test/admin-store.test.ts`: unit tests for file persistence safety.
- Create `apps/api/test/admin-routes.test.ts`: Supertest coverage for admin routes and page shell.
- Modify `apps/api/src/app.ts`: instantiate and mount admin routes before the fallback 404.
- Modify `apps/api/test/api.test.ts`: only if existing expectations need to account for admin routes.
- Modify `README.md`: document `/admin` and the write/backup behavior.

## Task 1: Admin Skill Store

**Files:**
- Create: `apps/api/src/admin/store.ts`
- Create: `apps/api/test/admin-store.test.ts`

- [ ] **Step 1: Write failing store tests**

Create `apps/api/test/admin-store.test.ts`:

```ts
/// <reference types="node" />

import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AdminSkillStore } from "../src/admin/store.js";

async function createProjectFixture() {
  const root = await mkdtemp(join(tmpdir(), "admin-skill-store-"));
  const skillDir = join(root, "skills", "pr-review");
  await mkdir(join(skillDir, "examples"), { recursive: true });
  await writeFile(
    join(skillDir, "skill.yaml"),
    [
      "id: pr-review",
      "name: Pull Request Review",
      "version: 0.1.0",
      "description: Reviews code changes for correctness, maintainability, tests, and risk.",
      "instructions: instructions.md",
      "inputs:",
      "  - name: repo",
      "    type: string",
      "    required: true",
      "  - name: diff",
      "    type: string",
      "    required: true",
      "  - name: risk_level",
      "    type: enum",
      "    required: true",
      "    values: [low, medium, high]",
      "outputs:",
      "  type: object",
      "  schema:",
      "    summary: string",
      "    blocking_issues: array",
      "    non_blocking_suggestions: array",
      "    test_recommendations: array",
      "    deployment_risk: string",
      "tools: []",
      "guardrails:",
      "  require_citations: false",
      "  no_secret_exfiltration: true",
      "  confirm_before_write: true",
      "targets: {}",
      "examples:",
      "  - examples/basic-risk.json"
    ].join("\n")
  );
  await writeFile(join(skillDir, "instructions.md"), "# Pull Request Review\n\nReview diffs carefully.\n");
  await writeFile(
    join(skillDir, "examples", "basic-risk.json"),
    JSON.stringify({
      name: "basic risk",
      inputs: {
        repo: "checkout-service",
        diff: "diff --git a/src/cart.ts b/src/cart.ts\n+export function cart() { return []; }",
        risk_level: "low"
      },
      expected: {
        deployment_risk: "medium",
        includes_suggestions: ["Validate empty inputs"],
        includes_tests: ["Add tests"]
      }
    })
  );
  return root;
}

describe("AdminSkillStore", () => {
  it("loads editable skill file content", async () => {
    const rootDir = await createProjectFixture();
    const store = new AdminSkillStore({ rootDir });

    const editor = await store.getEditor("pr-review");

    expect(editor.skill_id).toBe("pr-review");
    expect(editor.manifest.content).toContain("id: pr-review");
    expect(editor.instructions.content).toContain("Review diffs carefully");
    expect(editor.examples[0]).toMatchObject({ name: "basic-risk.json" });
    await rm(rootDir, { recursive: true, force: true });
  });

  it("saves a valid manifest and creates a backup", async () => {
    const rootDir = await createProjectFixture();
    const store = new AdminSkillStore({ rootDir });
    const nextManifest = [
      "id: pr-review",
      "name: Pull Request Review Admin",
      "version: 0.1.1",
      "description: Reviews code changes for correctness, maintainability, tests, and risk.",
      "instructions: instructions.md",
      "inputs: []",
      "outputs:",
      "  type: object",
      "  schema:",
      "    summary: string",
      "    blocking_issues: array",
      "    non_blocking_suggestions: array",
      "    test_recommendations: array",
      "    deployment_risk: string",
      "tools: []",
      "guardrails: {}",
      "targets: {}",
      "examples:",
      "  - examples/basic-risk.json"
    ].join("\n");

    const result = await store.saveManifest("pr-review", nextManifest);

    expect(result.manifest.name).toBe("Pull Request Review Admin");
    expect(await readFile(join(rootDir, "skills", "pr-review", "skill.yaml"), "utf8")).toContain("version: 0.1.1");
    const backups = await readdir(join(rootDir, ".data", "backups", "pr-review", "manifest"));
    expect(backups).toHaveLength(1);
    await rm(rootDir, { recursive: true, force: true });
  });

  it("rejects invalid manifests without modifying the current file", async () => {
    const rootDir = await createProjectFixture();
    const store = new AdminSkillStore({ rootDir });
    const original = await readFile(join(rootDir, "skills", "pr-review", "skill.yaml"), "utf8");

    await expect(store.saveManifest("pr-review", "id: wrong-id\nname: Nope")).rejects.toThrow(
      "manifest id must match skill id pr-review"
    );

    await expect(readFile(join(rootDir, "skills", "pr-review", "skill.yaml"), "utf8")).resolves.toBe(original);
    await rm(rootDir, { recursive: true, force: true });
  });

  it("saves instructions and validates non-empty text", async () => {
    const rootDir = await createProjectFixture();
    const store = new AdminSkillStore({ rootDir });

    await expect(store.saveInstructions("pr-review", "   ")).rejects.toThrow("instructions cannot be empty");
    await store.saveInstructions("pr-review", "# Updated\n\nUse concrete findings.\n");

    await expect(readFile(join(rootDir, "skills", "pr-review", "instructions.md"), "utf8")).resolves.toContain(
      "Use concrete findings"
    );
    await rm(rootDir, { recursive: true, force: true });
  });

  it("saves valid examples and rejects unknown or traversal-like names", async () => {
    const rootDir = await createProjectFixture();
    const store = new AdminSkillStore({ rootDir });
    const nextExample = JSON.stringify({
      name: "basic risk edited",
      inputs: { repo: "checkout-service", diff: "diff", risk_level: "low" },
      expected: { deployment_risk: "low", includes_suggestions: [], includes_tests: [] }
    }, null, 2);

    await store.saveExample("pr-review", "basic-risk.json", nextExample);
    await expect(store.saveExample("pr-review", "../skill.yaml", nextExample)).rejects.toThrow("unknown example");
    await expect(store.saveExample("pr-review", "missing.json", nextExample)).rejects.toThrow("unknown example");

    await expect(readFile(join(rootDir, "skills", "pr-review", "examples", "basic-risk.json"), "utf8")).resolves.toContain(
      "basic risk edited"
    );
    await rm(rootDir, { recursive: true, force: true });
  });

  it("restores the newest backup for a target", async () => {
    const rootDir = await createProjectFixture();
    const store = new AdminSkillStore({ rootDir });
    const originalInstructions = await readFile(join(rootDir, "skills", "pr-review", "instructions.md"), "utf8");

    await store.saveInstructions("pr-review", "# Changed\n\nTemporary content.\n");
    await store.restoreLatest("pr-review", "instructions");

    await expect(readFile(join(rootDir, "skills", "pr-review", "instructions.md"), "utf8")).resolves.toBe(
      originalInstructions
    );
    await rm(rootDir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run store tests and verify failure**

Run:

```bash
npm test -- apps/api/test/admin-store.test.ts
```

Expected: FAIL because `apps/api/src/admin/store.ts` does not exist.

- [ ] **Step 3: Implement the admin store**

Create `apps/api/src/admin/store.ts`:

```ts
/// <reference types="node" />

import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import YAML from "yaml";
import {
  skillEvaluationCaseSchema,
  skillManifestSchema,
  type SkillEvaluationCase,
  type SkillManifest
} from "@llm-skills-poc/skill-spec";
import { FileSkillRegistry, resolveDataDir, resolveSkillsDir } from "@llm-skills-poc/skill-runner";

export type RestoreTarget = "manifest" | "instructions" | `example:${string}`;

export interface AdminSkillStoreOptions {
  rootDir?: string;
}

export interface EditableFile {
  filename: string;
  content: string;
}

export interface EditableExample extends EditableFile {
  name: string;
}

export interface SkillEditorPayload {
  skill_id: string;
  manifest: EditableFile;
  instructions: EditableFile;
  examples: EditableExample[];
}

export class AdminSkillStore {
  private readonly rootDir?: string;
  private readonly skillsDir: string;
  private readonly dataDir: string;

  constructor(options: AdminSkillStoreOptions = {}) {
    this.rootDir = options.rootDir;
    this.skillsDir = resolveSkillsDir(options.rootDir);
    this.dataDir = resolveDataDir(options.rootDir);
  }

  async getEditor(skillId: string): Promise<SkillEditorPayload> {
    const skill = await this.registry().getSkill(skillId);
    const skillDir = this.skillDir(skillId);
    const manifestContent = await readFile(join(skillDir, "skill.yaml"), "utf8");
    const instructionsContent = await readFile(this.safeSkillPath(skillId, skill.manifest.instructions), "utf8");
    const examples = await Promise.all(
      skill.manifest.examples.map(async (examplePath) => ({
        name: basename(examplePath),
        filename: examplePath,
        content: await readFile(this.safeSkillPath(skillId, examplePath), "utf8")
      }))
    );

    return {
      skill_id: skill.manifest.id,
      manifest: { filename: "skill.yaml", content: manifestContent },
      instructions: { filename: skill.manifest.instructions, content: instructionsContent },
      examples
    };
  }

  async saveManifest(skillId: string, content: string): Promise<{ manifest: SkillManifest }> {
    const parsedManifest = skillManifestSchema.parse(YAML.parse(content));
    if (parsedManifest.id !== skillId) {
      throw new Error(`manifest id must match skill id ${skillId}`);
    }
    return this.replaceAndValidate(skillId, "manifest", "skill.yaml", content, async () => ({
      manifest: (await this.registry().getSkill(skillId)).manifest
    }));
  }

  async saveInstructions(skillId: string, content: string): Promise<{ instructions: EditableFile }> {
    if (content.trim().length === 0) {
      throw new Error("instructions cannot be empty");
    }
    const skill = await this.registry().getSkill(skillId);
    return this.replaceAndValidate(skillId, "instructions", skill.manifest.instructions, content, async () => ({
      instructions: { filename: skill.manifest.instructions, content }
    }));
  }

  async saveExample(skillId: string, exampleName: string, content: string): Promise<{ example: EditableExample }> {
    const examplePath = await this.resolveKnownExamplePath(skillId, exampleName);
    skillEvaluationCaseSchema.parse(JSON.parse(content));
    return this.replaceAndValidate(skillId, `example:${basename(examplePath)}`, examplePath, content, async () => ({
      example: { name: basename(examplePath), filename: examplePath, content }
    }));
  }

  async restoreLatest(skillId: string, target: RestoreTarget): Promise<{ restored: RestoreTarget }> {
    const targetInfo = await this.resolveTarget(skillId, target);
    const backupDir = this.backupDir(skillId, targetInfo.backupTarget);
    const backups = (await readdir(backupDir)).sort();
    if (backups.length === 0) {
      throw new Error(`No backups found for ${target}`);
    }
    const latestBackup = join(backupDir, backups[backups.length - 1]);
    const backupContent = await readFile(latestBackup, "utf8");

    await this.replaceAndValidate(skillId, targetInfo.backupTarget, targetInfo.filePath, backupContent, async () => ({
      restored: target
    }));

    return { restored: target };
  }

  private registry(): FileSkillRegistry {
    return new FileSkillRegistry({ rootDir: this.rootDir });
  }

  private async replaceAndValidate<T>(
    skillId: string,
    backupTarget: RestoreTarget,
    filePath: string,
    content: string,
    result: () => Promise<T>
  ): Promise<T> {
    const absolutePath = this.safeSkillPath(skillId, filePath);
    const original = await readFile(absolutePath, "utf8");
    await this.writeBackup(skillId, backupTarget, basename(filePath), original);

    const tempPath = `${absolutePath}.${Date.now()}.tmp`;
    await writeFile(tempPath, content, "utf8");
    await rename(tempPath, absolutePath);

    try {
      await this.registry().getSkill(skillId);
      return await result();
    } catch (error) {
      const rollbackPath = `${absolutePath}.${Date.now()}.rollback`;
      await writeFile(rollbackPath, original, "utf8");
      await rename(rollbackPath, absolutePath);
      throw error;
    }
  }

  private async writeBackup(skillId: string, target: RestoreTarget, filename: string, content: string): Promise<void> {
    const dir = this.backupDir(skillId, target);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${filename}`), content, "utf8");
  }

  private backupDir(skillId: string, target: RestoreTarget): string {
    return join(this.dataDir, "backups", skillId, target.replace(/[:/\\]/g, "_"));
  }

  private async resolveKnownExamplePath(skillId: string, exampleName: string): Promise<string> {
    const skill = await this.registry().getSkill(skillId);
    const knownExample = skill.manifest.examples.find((examplePath) => basename(examplePath) === exampleName);
    if (!knownExample) {
      throw new Error(`unknown example: ${exampleName}`);
    }
    this.safeSkillPath(skillId, knownExample);
    return knownExample;
  }

  private async resolveTarget(
    skillId: string,
    target: RestoreTarget
  ): Promise<{ backupTarget: RestoreTarget; filePath: string }> {
    if (target === "manifest") {
      return { backupTarget: "manifest", filePath: "skill.yaml" };
    }
    const skill = await this.registry().getSkill(skillId);
    if (target === "instructions") {
      return { backupTarget: "instructions", filePath: skill.manifest.instructions };
    }
    if (target.startsWith("example:")) {
      const examplePath = await this.resolveKnownExamplePath(skillId, target.slice("example:".length));
      return { backupTarget: `example:${basename(examplePath)}`, filePath: examplePath };
    }
    throw new Error(`Unsupported restore target: ${target}`);
  }

  private skillDir(skillId: string): string {
    return resolve(this.skillsDir, skillId);
  }

  private safeSkillPath(skillId: string, filePath: string): string {
    const baseDir = this.skillDir(skillId);
    const resolvedPath = resolve(baseDir, filePath);
    const pathFromBase = relative(baseDir, resolvedPath);
    if (pathFromBase.startsWith("..") || pathFromBase === "" || resolve(pathFromBase) === pathFromBase) {
      throw new Error(`Unsafe skill path: ${filePath}`);
    }
    return resolvedPath;
  }
}
```

- [ ] **Step 4: Run store tests and verify pass**

Run:

```bash
npm test -- apps/api/test/admin-store.test.ts
```

Expected: PASS.

- [ ] **Step 5: Build API workspace**

Run:

```bash
npm run build --workspace @llm-skills-poc/api
```

Expected: PASS.

- [ ] **Step 6: Commit admin store**

Run:

```bash
git add apps/api/src/admin/store.ts apps/api/test/admin-store.test.ts
git commit -m "feat: add admin skill store"
```

Expected: commit succeeds.

## Task 2: Admin API Routes

**Files:**
- Create: `apps/api/src/admin/routes.ts`
- Modify: `apps/api/src/app.ts`
- Create: `apps/api/test/admin-routes.test.ts`

- [ ] **Step 1: Write failing admin route tests**

Create `apps/api/test/admin-routes.test.ts`:

```ts
/// <reference types="node" />

import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

async function createProjectFixture() {
  const root = await mkdtemp(join(tmpdir(), "admin-routes-"));
  const skillDir = join(root, "skills", "pr-review");
  await mkdir(join(skillDir, "examples"), { recursive: true });
  await writeFile(
    join(skillDir, "skill.yaml"),
    [
      "id: pr-review",
      "name: Pull Request Review",
      "version: 0.1.0",
      "description: Reviews code changes for correctness, maintainability, tests, and risk.",
      "instructions: instructions.md",
      "inputs: []",
      "outputs:",
      "  type: object",
      "  schema:",
      "    summary: string",
      "    blocking_issues: array",
      "    non_blocking_suggestions: array",
      "    test_recommendations: array",
      "    deployment_risk: string",
      "tools: []",
      "guardrails: {}",
      "targets: {}",
      "examples:",
      "  - examples/basic-risk.json"
    ].join("\n")
  );
  await writeFile(join(skillDir, "instructions.md"), "# Pull Request Review\n");
  await writeFile(
    join(skillDir, "examples", "basic-risk.json"),
    JSON.stringify({
      name: "basic risk",
      inputs: { repo: "checkout-service", diff: "diff", risk_level: "low" },
      expected: { deployment_risk: "medium", includes_suggestions: [], includes_tests: [] }
    })
  );
  return root;
}

describe("admin routes", () => {
  let rootDir: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    rootDir = await createProjectFixture();
    app = createApp({ rootDir });
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it("serves the admin workbench shell", async () => {
    const response = await request(app).get("/admin").expect(200);

    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.text).toContain('id="admin-app"');
    expect(response.text).toContain("Shared Skills Admin");
  });

  it("loads editable content", async () => {
    const response = await request(app).get("/admin/skills/pr-review/editor").expect(200);

    expect(response.body.skill_id).toBe("pr-review");
    expect(response.body.manifest.content).toContain("id: pr-review");
    expect(response.body.instructions.content).toContain("Pull Request Review");
    expect(response.body.examples[0].name).toBe("basic-risk.json");
  });

  it("saves valid manifest content", async () => {
    const nextManifest = [
      "id: pr-review",
      "name: Pull Request Review Edited",
      "version: 0.1.0",
      "description: Reviews code changes for correctness, maintainability, tests, and risk.",
      "instructions: instructions.md",
      "inputs: []",
      "outputs:",
      "  type: object",
      "  schema:",
      "    summary: string",
      "    blocking_issues: array",
      "    non_blocking_suggestions: array",
      "    test_recommendations: array",
      "    deployment_risk: string",
      "tools: []",
      "guardrails: {}",
      "targets: {}",
      "examples:",
      "  - examples/basic-risk.json"
    ].join("\n");

    await request(app).put("/admin/skills/pr-review/manifest").send({ content: nextManifest }).expect(200);

    const skillResponse = await request(app).get("/skills/pr-review").expect(200);
    expect(skillResponse.body.skill.manifest.name).toBe("Pull Request Review Edited");
  });

  it("rejects invalid manifest content with JSON errors", async () => {
    const response = await request(app)
      .put("/admin/skills/pr-review/manifest")
      .send({ content: "id: wrong-id\nname: Broken" })
      .expect(400);

    expect(response.body.error).toContain("manifest id must match skill id pr-review");
  });

  it("saves instructions and examples", async () => {
    await request(app)
      .put("/admin/skills/pr-review/instructions")
      .send({ content: "# Updated Instructions\n\nUse citations when required.\n" })
      .expect(200);
    await request(app)
      .put("/admin/skills/pr-review/examples/basic-risk.json")
      .send({
        content: JSON.stringify({
          name: "basic risk edited",
          inputs: { repo: "checkout-service", diff: "diff", risk_level: "low" },
          expected: { deployment_risk: "low", includes_suggestions: [], includes_tests: [] }
        }, null, 2)
      })
      .expect(200);

    await expect(readFile(join(rootDir, "skills", "pr-review", "instructions.md"), "utf8")).resolves.toContain(
      "Updated Instructions"
    );
    await expect(readFile(join(rootDir, "skills", "pr-review", "examples", "basic-risk.json"), "utf8")).resolves.toContain(
      "basic risk edited"
    );
  });

  it("rejects unknown examples", async () => {
    const response = await request(app)
      .put("/admin/skills/pr-review/examples/..%2Fskill.yaml")
      .send({ content: "{}" })
      .expect(404);

    expect(response.body.error).toContain("unknown example");
  });

  it("restores the latest backup", async () => {
    const original = await readFile(join(rootDir, "skills", "pr-review", "instructions.md"), "utf8");
    await request(app)
      .put("/admin/skills/pr-review/instructions")
      .send({ content: "# Temporary Instructions\n" })
      .expect(200);

    await request(app).post("/admin/skills/pr-review/restore").send({ target: "instructions" }).expect(200);

    await expect(readFile(join(rootDir, "skills", "pr-review", "instructions.md"), "utf8")).resolves.toBe(original);
  });
});
```

- [ ] **Step 2: Run route tests and verify failure**

Run:

```bash
npm test -- apps/api/test/admin-routes.test.ts
```

Expected: FAIL because admin routes are not mounted.

- [ ] **Step 3: Implement admin routes**

Create `apps/api/src/admin/routes.ts`:

```ts
import { Router } from "express";
import { AdminSkillStore, type RestoreTarget } from "./store.js";
import { adminPageHtml } from "./page.js";

export interface CreateAdminRouterOptions {
  rootDir?: string;
}

export function createAdminRouter(options: CreateAdminRouterOptions = {}) {
  const router = Router();
  const store = new AdminSkillStore({ rootDir: options.rootDir });

  router.get("/", (_req, res) => {
    res.type("html").send(adminPageHtml);
  });

  router.get("/skills/:skillId/editor", async (req, res, next) => {
    try {
      res.json(await store.getEditor(req.params.skillId));
    } catch (error) {
      next(error);
    }
  });

  router.put("/skills/:skillId/manifest", async (req, res, next) => {
    try {
      res.json(await store.saveManifest(req.params.skillId, parseContent(req.body)));
    } catch (error) {
      next(error);
    }
  });

  router.put("/skills/:skillId/instructions", async (req, res, next) => {
    try {
      res.json(await store.saveInstructions(req.params.skillId, parseContent(req.body)));
    } catch (error) {
      next(error);
    }
  });

  router.put("/skills/:skillId/examples/:exampleName", async (req, res, next) => {
    try {
      res.json(await store.saveExample(req.params.skillId, req.params.exampleName, parseContent(req.body)));
    } catch (error) {
      next(error);
    }
  });

  router.post("/skills/:skillId/restore", async (req, res, next) => {
    try {
      res.json(await store.restoreLatest(req.params.skillId, parseTarget(req.body)));
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function parseContent(body: unknown): string {
  if (!body || typeof body !== "object" || typeof (body as { content?: unknown }).content !== "string") {
    throw new Error("Request body must include string content");
  }
  return (body as { content: string }).content;
}

function parseTarget(body: unknown): RestoreTarget {
  if (!body || typeof body !== "object" || typeof (body as { target?: unknown }).target !== "string") {
    throw new Error("Request body must include string target");
  }
  const target = (body as { target: string }).target;
  if (target === "manifest" || target === "instructions" || target.startsWith("example:")) {
    return target as RestoreTarget;
  }
  throw new Error(`Unsupported restore target: ${target}`);
}
```

- [ ] **Step 4: Add temporary admin page export for route tests**

Create `apps/api/src/admin/page.ts`:

```ts
export const adminPageHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Shared Skills Admin</title>
  </head>
  <body>
    <main id="admin-app">Shared Skills Admin</main>
    <script type="module">window.__sharedSkillsAdminLoaded = true;</script>
  </body>
</html>`;
```

The richer page replaces this shell in Task 3.

- [ ] **Step 5: Mount admin routes in the app**

Modify `apps/api/src/app.ts`:

```ts
import express, { type ErrorRequestHandler } from "express";
import { FileSkillRegistry, SkillRunner } from "@llm-skills-poc/skill-runner";
import { createAdminRouter } from "./admin/routes.js";

export interface CreateAppOptions {
  rootDir?: string;
}

export function createApp(options: CreateAppOptions = {}) {
  const app = express();
  const registry = new FileSkillRegistry({ rootDir: options.rootDir });
  const runner = new SkillRunner({ registry, rootDir: options.rootDir });

  app.use(express.json({ limit: "1mb" }));
  app.use("/admin", createAdminRouter({ rootDir: options.rootDir }));

  // Keep existing routes below this line unchanged.
}
```

Retain all existing route handlers and the existing error handler after mounting `/admin`.

- [ ] **Step 6: Improve error status mapping**

Modify the `errorHandler` in `apps/api/src/app.ts` so expected admin errors map cleanly:

```ts
const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  const status =
    message.includes("not found") || message.includes("not found:") || message.includes("unknown example")
      ? 404
      : 400;
  res.status(status).json({ error: message });
};
```

- [ ] **Step 7: Run route tests and verify pass**

Run:

```bash
npm test -- apps/api/test/admin-routes.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run existing API tests**

Run:

```bash
npm test -- apps/api/test/api.test.ts
```

Expected: PASS.

- [ ] **Step 9: Build API workspace**

Run:

```bash
npm run build --workspace @llm-skills-poc/api
```

Expected: PASS.

- [ ] **Step 10: Commit admin routes**

Run:

```bash
git add apps/api/src/app.ts apps/api/src/admin/routes.ts apps/api/src/admin/page.ts apps/api/test/admin-routes.test.ts
git commit -m "feat: add admin skill routes"
```

Expected: commit succeeds.

## Task 3: Workbench UI

**Files:**
- Modify: `apps/api/src/admin/page.ts`
- Modify: `apps/api/test/admin-routes.test.ts`

- [ ] **Step 1: Add route test assertions for the real page shell**

Modify the `serves the admin workbench shell` test in `apps/api/test/admin-routes.test.ts`:

```ts
it("serves the admin workbench shell", async () => {
  const response = await request(app).get("/admin").expect(200);

  expect(response.headers["content-type"]).toContain("text/html");
  expect(response.text).toContain('id="admin-app"');
  expect(response.text).toContain('data-testid="skill-list"');
  expect(response.text).toContain('data-testid="manifest-editor"');
  expect(response.text).toContain('data-testid="run-skill"');
  expect(response.text).toContain('data-testid="audit-panel"');
  expect(response.text).toContain("Shared Skills Admin");
});
```

- [ ] **Step 2: Run route tests and verify failure**

Run:

```bash
npm test -- apps/api/test/admin-routes.test.ts
```

Expected: FAIL because the page shell does not yet include the real workbench test ids.

- [ ] **Step 3: Replace the shell page with the full workbench**

Modify `apps/api/src/admin/page.ts` so `adminPageHtml` is a complete document with:

```ts
export const adminPageHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Shared Skills Admin</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f6f7f9;
        --surface: #ffffff;
        --surface-2: #eef2f6;
        --text: #141923;
        --muted: #657083;
        --border: #d8dee8;
        --accent: #2563eb;
        --danger: #b42318;
        --success: #13795b;
        --warning: #a15c07;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--text);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 14px;
        line-height: 1.4;
      }
      button, input, select, textarea {
        font: inherit;
      }
      button {
        border: 1px solid var(--border);
        background: var(--surface);
        color: var(--text);
        border-radius: 6px;
        padding: 7px 10px;
        cursor: pointer;
      }
      button.primary {
        border-color: var(--accent);
        background: var(--accent);
        color: #fff;
      }
      button:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
      #admin-app {
        min-height: 100vh;
        display: grid;
        grid-template-rows: auto 1fr;
      }
      .topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 14px 20px;
        border-bottom: 1px solid var(--border);
        background: var(--surface);
      }
      .brand {
        font-weight: 700;
        font-size: 16px;
      }
      .status-strip {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        color: var(--muted);
        font-size: 12px;
      }
      .pill {
        border: 1px solid var(--border);
        border-radius: 999px;
        padding: 3px 8px;
        background: var(--surface-2);
      }
      .layout {
        display: grid;
        grid-template-columns: 260px minmax(520px, 1fr) 360px;
        gap: 14px;
        padding: 14px;
      }
      .panel {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 8px;
        min-width: 0;
      }
      .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid var(--border);
        padding: 10px 12px;
        font-weight: 650;
      }
      .panel-body {
        padding: 12px;
      }
      .skill-list {
        display: grid;
        gap: 8px;
      }
      .skill-row {
        text-align: left;
        width: 100%;
      }
      .tabs {
        display: flex;
        gap: 6px;
        border-bottom: 1px solid var(--border);
        padding: 8px 8px 0;
      }
      .tab {
        border-bottom-left-radius: 0;
        border-bottom-right-radius: 0;
      }
      .tab.active {
        background: var(--surface-2);
        border-color: var(--accent);
      }
      textarea {
        width: 100%;
        min-height: 420px;
        resize: vertical;
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 10px;
        font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
        font-size: 12px;
        line-height: 1.5;
      }
      .actions {
        display: flex;
        gap: 8px;
        margin-top: 10px;
      }
      .field {
        display: grid;
        gap: 5px;
        margin-bottom: 10px;
      }
      .field label {
        color: var(--muted);
        font-size: 12px;
        font-weight: 650;
      }
      input, select {
        width: 100%;
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 8px;
        background: var(--surface);
      }
      .message {
        white-space: pre-wrap;
        border-radius: 6px;
        padding: 9px;
        background: var(--surface-2);
        color: var(--muted);
        min-height: 38px;
      }
      .message.error { color: var(--danger); }
      .message.success { color: var(--success); }
      pre {
        overflow: auto;
        max-height: 260px;
        margin: 0;
        padding: 10px;
        border-radius: 6px;
        background: #111827;
        color: #d1d5db;
        font-size: 12px;
      }
      .stack {
        display: grid;
        gap: 12px;
      }
      @media (max-width: 1100px) {
        .layout {
          grid-template-columns: 220px 1fr;
        }
        .right-rail {
          grid-column: 1 / -1;
        }
      }
      @media (max-width: 760px) {
        .layout {
          grid-template-columns: 1fr;
        }
        .topbar {
          align-items: flex-start;
          flex-direction: column;
        }
      }
    </style>
  </head>
  <body>
    <main id="admin-app">
      <header class="topbar">
        <div>
          <div class="brand">Shared Skills Admin</div>
          <div class="status-strip">
            <span class="pill" id="health-status">Health: checking</span>
            <span class="pill" id="selected-skill">Skill: none</span>
            <span class="pill" id="last-refresh">Last refresh: never</span>
          </div>
        </div>
        <button id="refresh-all" type="button">Refresh</button>
      </header>
      <section class="layout">
        <aside class="panel">
          <div class="panel-header">Skills</div>
          <div class="panel-body">
            <div class="skill-list" data-testid="skill-list" id="skill-list"></div>
          </div>
        </aside>
        <section class="panel">
          <div class="panel-header">
            <span>Editor</span>
            <span id="editor-target"></span>
          </div>
          <div class="tabs" id="editor-tabs"></div>
          <div class="panel-body">
            <textarea id="editor-content" data-testid="manifest-editor" spellcheck="false"></textarea>
            <div class="actions">
              <button class="primary" id="save-editor" type="button">Save</button>
              <button id="restore-editor" type="button">Restore Latest Backup</button>
            </div>
            <div id="validation-message" class="message" style="margin-top:10px">Select a skill to load editor content.</div>
          </div>
        </section>
        <aside class="right-rail stack">
          <section class="panel">
            <div class="panel-header">Run</div>
            <div class="panel-body">
              <div class="field"><label for="run-repo">Repo</label><input id="run-repo" value="checkout-service" /></div>
              <div class="field"><label for="run-risk">Risk</label><select id="run-risk"><option>low</option><option selected>medium</option><option>high</option></select></div>
              <div class="field"><label for="run-diff">Diff</label><textarea id="run-diff" style="min-height:120px">diff --git a/src/payment.ts b/src/payment.ts\\n+export function charge() { return payment.charge(); }</textarea></div>
              <div class="actions">
                <button class="primary" id="run-skill" data-testid="run-skill" type="button">Run</button>
                <button id="evaluate-skill" type="button">Evaluate</button>
              </div>
            </div>
          </section>
          <section class="panel">
            <div class="panel-header">
              <span>Result</span>
              <button id="refresh-audit" type="button">Refresh Audit</button>
            </div>
            <div class="panel-body stack">
              <pre id="result-panel">{}</pre>
              <pre id="audit-panel" data-testid="audit-panel">[]</pre>
            </div>
          </section>
        </aside>
      </section>
    </main>
    <script type="module">
      const state = { skills: [], selectedSkill: null, editor: null, activeTarget: "manifest" };
      const el = (id) => document.getElementById(id);
      const setMessage = (text, kind = "") => {
        const node = el("validation-message");
        node.className = "message" + (kind ? " " + kind : "");
        node.textContent = text;
      };
      async function api(path, options = {}) {
        const response = await fetch(path, {
          headers: { "content-type": "application/json", ...(options.headers || {}) },
          ...options
        });
        const contentType = response.headers.get("content-type") || "";
        const payload = contentType.includes("application/json") ? await response.json() : await response.text();
        if (!response.ok) {
          throw new Error(typeof payload === "string" ? payload : payload.error || "Request failed");
        }
        return payload;
      }
      function activeExampleName() {
        return state.activeTarget.startsWith("example:") ? state.activeTarget.slice("example:".length) : null;
      }
      function activeEditorContent() {
        if (!state.editor) return "";
        if (state.activeTarget === "manifest") return state.editor.manifest.content;
        if (state.activeTarget === "instructions") return state.editor.instructions.content;
        const example = state.editor.examples.find((entry) => entry.name === activeExampleName());
        return example ? example.content : "";
      }
      function renderSkills() {
        el("skill-list").innerHTML = state.skills.map((skill) => '<button class="skill-row" type="button" data-skill="' + skill.id + '">' + skill.name + '<br><span style="color:var(--muted)">v' + skill.version + '</span></button>').join("");
        for (const button of el("skill-list").querySelectorAll("button")) {
          button.addEventListener("click", () => selectSkill(button.dataset.skill));
        }
      }
      function renderTabs() {
        if (!state.editor) {
          el("editor-tabs").innerHTML = "";
          el("editor-content").value = "";
          return;
        }
        const tabs = [
          { target: "manifest", label: "Manifest" },
          { target: "instructions", label: "Instructions" },
          ...state.editor.examples.map((example) => ({ target: "example:" + example.name, label: example.name }))
        ];
        el("editor-tabs").innerHTML = tabs.map((tab) => '<button type="button" class="tab ' + (tab.target === state.activeTarget ? "active" : "") + '" data-target="' + tab.target + '">' + tab.label + '</button>').join("");
        for (const button of el("editor-tabs").querySelectorAll("button")) {
          button.addEventListener("click", () => {
            state.activeTarget = button.dataset.target;
            renderTabs();
            renderEditor();
          });
        }
      }
      function renderEditor() {
        el("selected-skill").textContent = "Skill: " + (state.selectedSkill || "none");
        el("editor-target").textContent = state.activeTarget;
        el("editor-content").value = activeEditorContent();
      }
      async function refreshAll() {
        const [health, skills] = await Promise.all([api("/healthz"), api("/skills")]);
        el("health-status").textContent = "Health: " + (health.ok ? "ok" : "unknown");
        state.skills = skills.skills;
        renderSkills();
        if (!state.selectedSkill && state.skills[0]) {
          await selectSkill(state.skills[0].id);
        }
        el("last-refresh").textContent = "Last refresh: " + new Date().toLocaleTimeString();
      }
      async function selectSkill(skillId) {
        state.selectedSkill = skillId;
        state.editor = await api("/admin/skills/" + skillId + "/editor");
        state.activeTarget = "manifest";
        renderTabs();
        renderEditor();
        await refreshAudit();
        setMessage("Loaded " + skillId, "success");
      }
      async function saveActive() {
        if (!state.selectedSkill) return;
        const content = el("editor-content").value;
        const target = state.activeTarget;
        const path = target === "manifest"
          ? "/admin/skills/" + state.selectedSkill + "/manifest"
          : target === "instructions"
            ? "/admin/skills/" + state.selectedSkill + "/instructions"
            : "/admin/skills/" + state.selectedSkill + "/examples/" + encodeURIComponent(activeExampleName());
        await api(path, { method: "PUT", body: JSON.stringify({ content }) });
        state.editor = await api("/admin/skills/" + state.selectedSkill + "/editor");
        renderTabs();
        renderEditor();
        setMessage("Saved " + target, "success");
      }
      async function restoreActive() {
        if (!state.selectedSkill) return;
        await api("/admin/skills/" + state.selectedSkill + "/restore", {
          method: "POST",
          body: JSON.stringify({ target: state.activeTarget })
        });
        state.editor = await api("/admin/skills/" + state.selectedSkill + "/editor");
        renderTabs();
        renderEditor();
        setMessage("Restored " + state.activeTarget, "success");
      }
      async function runSkill() {
        const payload = await api("/skills/" + state.selectedSkill + "/run", {
          method: "POST",
          body: JSON.stringify({
            client: "api",
            inputs: {
              repo: el("run-repo").value,
              diff: el("run-diff").value,
              risk_level: el("run-risk").value
            }
          })
        });
        el("result-panel").textContent = JSON.stringify(payload, null, 2);
        await refreshAudit();
      }
      async function evaluateSkill() {
        const payload = await api("/skills/" + state.selectedSkill + "/evaluate", { method: "POST", body: "{}" });
        el("result-panel").textContent = JSON.stringify(payload, null, 2);
      }
      async function refreshAudit() {
        if (!state.selectedSkill) return;
        const payload = await api("/skills/" + state.selectedSkill + "/audit");
        el("audit-panel").textContent = JSON.stringify(payload.events.slice(-10), null, 2);
      }
      for (const [id, handler] of [
        ["refresh-all", refreshAll],
        ["save-editor", saveActive],
        ["restore-editor", restoreActive],
        ["run-skill", runSkill],
        ["evaluate-skill", evaluateSkill],
        ["refresh-audit", refreshAudit]
      ]) {
        el(id).addEventListener("click", () => handler().catch((error) => setMessage(error.message, "error")));
      }
      refreshAll().catch((error) => setMessage(error.message, "error"));
    </script>
  </body>
</html>`;
```

- [ ] **Step 4: Run route tests and verify pass**

Run:

```bash
npm test -- apps/api/test/admin-routes.test.ts
```

Expected: PASS.

- [ ] **Step 5: Build API workspace**

Run:

```bash
npm run build --workspace @llm-skills-poc/api
```

Expected: PASS.

- [ ] **Step 6: Commit workbench UI**

Run:

```bash
git add apps/api/src/admin/page.ts apps/api/test/admin-routes.test.ts
git commit -m "feat: add admin workbench UI"
```

Expected: commit succeeds.

## Task 4: README And Final Verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document admin workbench usage**

Add this section to `README.md` after the local API section:

````md
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
````

- [ ] **Step 2: Run full test suite**

Run:

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Run full workspace build**

Run:

```bash
npm run build
```

Expected: all workspace packages build.

- [ ] **Step 4: Run local API admin smoke**

Run:

```bash
npm run dev:api
```

Then, in another shell:

```bash
curl -sS http://localhost:3000/admin | rg "Shared Skills Admin|admin-app"
curl -sS http://localhost:3000/admin/skills/pr-review/editor | rg "skill_id|pr-review"
```

Expected: both commands print matching output. Stop the API process cleanly.

- [ ] **Step 5: Verify workbench in the in-app browser**

Open `http://localhost:3000/admin` in the in-app browser and verify:
- Skill list renders.
- Manifest editor loads.
- Run button produces a JSON result.
- Evaluate button produces evaluation JSON.
- Audit panel shows redacted entries.
- Saving invalid manifest content shows an inline error and does not clear the editor.
- Saving valid instructions content succeeds, and Restore Latest Backup reverts it.

- [ ] **Step 6: Run Docker smoke**

Run:

```bash
docker compose up --build -d
curl -sS http://localhost:3000/admin | rg "Shared Skills Admin|admin-app"
curl -sS http://localhost:3000/healthz
docker compose down
```

Expected: admin HTML matches, health returns `{"ok":true}`, and compose stops cleanly.

- [ ] **Step 7: Commit README update**

Run:

```bash
git add README.md
git commit -m "docs: document admin workbench"
```

Expected: commit succeeds.

- [ ] **Step 8: Inspect git status**

Run:

```bash
git status --short --branch
```

Expected: clean working tree on `main`, ahead of `origin/main`.

- [ ] **Step 9: Push implementation**

Run:

```bash
git push
```

Expected: `origin/main` updates successfully.

## Plan Self-Review

- Spec coverage: The plan includes `/admin`, read/write routes, validation, path safety, backups, restore, run/evaluate/audit operations, UI smoke, browser verification, Docker verification, and README documentation.
- Placeholder scan: No task uses open-ended implementation language without concrete paths, commands, or code.
- Type consistency: `AdminSkillStore`, `RestoreTarget`, `SkillEditorPayload`, route paths, and test expectations use the same names throughout the plan.
