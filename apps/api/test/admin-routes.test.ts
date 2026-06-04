/// <reference types="node" />

import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

async function createProjectFixture(): Promise<string> {
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
    expect(response.text).toContain('data-testid="skill-list"');
    expect(response.text).toContain('data-testid="manifest-editor"');
    expect(response.text).toContain('data-testid="run-skill"');
    expect(response.text).toContain('data-testid="audit-panel"');
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
    const wrongIdManifest = [
      "id: wrong-id",
      "name: Broken",
      "version: 0.1.0",
      "description: Wrong skill id.",
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

    const response = await request(app)
      .put("/admin/skills/pr-review/manifest")
      .send({ content: wrongIdManifest })
      .expect(400);

    expect(response.body.error).toContain("manifest id must match skill id pr-review");
  });

  it("saves instructions and examples", async () => {
    await request(app)
      .put("/admin/skills/pr-review/instructions")
      .send({ content: "# Updated Instructions\n\nUse citations when required.\n" })
      .expect(200);
    await request(app)
      .put(`/admin/skills/pr-review/examples/${encodeURIComponent("examples/basic-risk.json")}`)
      .send({
        content: JSON.stringify(
          {
            name: "basic risk edited",
            inputs: { repo: "checkout-service", diff: "diff", risk_level: "low" },
            expected: { deployment_risk: "low", includes_suggestions: [], includes_tests: [] }
          },
          null,
          2
        )
      })
      .expect(200);

    await expect(readFile(join(rootDir, "skills", "pr-review", "instructions.md"), "utf8")).resolves.toContain(
      "Updated Instructions"
    );
    await expect(
      readFile(join(rootDir, "skills", "pr-review", "examples", "basic-risk.json"), "utf8")
    ).resolves.toContain("basic risk edited");
  });

  it("rejects unknown or traversal-like examples", async () => {
    const unknownResponse = await request(app)
      .put("/admin/skills/pr-review/examples/missing.json")
      .send({ content: "{}" })
      .expect(404);
    const traversalResponse = await request(app)
      .put("/admin/skills/pr-review/examples/..%2Fskill.yaml")
      .send({ content: "{}" })
      .expect(404);

    expect(unknownResponse.body.error).toContain("unknown example");
    expect(traversalResponse.body.error).toContain("unknown example");
    await expect(readFile(join(rootDir, "skills", "pr-review", "skill.yaml"), "utf8")).resolves.toContain(
      "id: pr-review"
    );
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

  it("rejects invalid payloads", async () => {
    const contentResponse = await request(app)
      .put("/admin/skills/pr-review/instructions")
      .send({ content: 123 })
      .expect(400);
    const targetResponse = await request(app)
      .post("/admin/skills/pr-review/restore")
      .send({ target: "other" })
      .expect(400);

    expect(contentResponse.body.error).toContain("Request body must include string content");
    expect(targetResponse.body.error).toContain("Unsupported restore target");
  });

  it("returns generic 500 JSON for unexpected admin storage errors", async () => {
    const instructionsPath = join(rootDir, "skills", "pr-review", "instructions.md");
    await rm(instructionsPath);
    await mkdir(instructionsPath);

    const response = await request(app)
      .put("/admin/skills/pr-review/instructions")
      .send({ content: "# Cannot Save\n" })
      .expect(500);

    expect(response.body).toEqual({ error: "Internal server error" });
    expect(JSON.stringify(response.body)).not.toContain("EISDIR");
  });
});
