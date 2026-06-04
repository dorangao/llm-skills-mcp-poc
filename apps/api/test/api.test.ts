import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const repoRoot = process.cwd();

describe("Registry API", () => {
  let rootDir: string;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    rootDir = await mkdtemp(join(tmpdir(), "llm-skills-poc-api-"));
    await populatePrReviewSkill(rootDir);
    app = createApp({ rootDir });
  });

  afterAll(async () => {
    if (rootDir) {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it("reports health", async () => {
    const response = await request(app).get("/healthz").expect(200);
    expect(response.body).toEqual({ ok: true });
  });

  it("lists skills", async () => {
    const response = await request(app).get("/skills").expect(200);
    expect(response.body.skills[0]).toMatchObject({
      id: "pr-review",
      version: "0.1.0"
    });
  });

  it("gets one skill without leaking internals", async () => {
    const response = await request(app).get("/skills/pr-review").expect(200);
    expect(response.body.skill.manifest.id).toBe("pr-review");
    expect(response.body.skill.examples).toHaveLength(2);
    expect(response.body.skill.directory).toBeUndefined();
    expect(response.body.skill.instructions).toBeUndefined();
  });

  it("runs one skill", async () => {
    const response = await request(app)
      .post("/skills/pr-review/run")
      .send({
        client: "api",
        version: "0.1.0",
        inputs: {
          repo: "checkout-service",
          diff: "diff --git a/src/payment.ts b/src/payment.ts\n+export function charge() { return payment.charge(); }",
          risk_level: "medium"
        }
      })
      .expect(200);

    expect(response.body.skill_id).toBe("pr-review");
    expect(response.body.result.deployment_risk).toBe("high");
    expect(response.body.trace_id).toMatch(/^trace_/);
  });

  it("evaluates one skill", async () => {
    const response = await request(app).post("/skills/pr-review/evaluate").send({}).expect(200);
    expect(response.body.skill_id).toBe("pr-review");
    expect(response.body.passed).toBe(true);
  });

  it("returns audit events", async () => {
    await mkdir(join(rootDir, ".data", "traces"), { recursive: true });
    await writeFile(
      join(rootDir, ".data", "traces", "pr-review.jsonl"),
      `${JSON.stringify({
        trace_id: "trace_legacy",
        request: {
          version: "0.1.0",
          client: "api",
          inputs: {
            repo: "checkout-service",
            diff: "diff --git a/src/config.ts b/src/config.ts\n+const token = 'legacy-secret';",
            risk_level: "high"
          }
        },
        response: {
          skill_id: "pr-review"
        }
      })}\n`
    );
    await request(app)
      .post("/skills/pr-review/run")
      .send({
        client: "api",
        version: "0.1.0",
        inputs: {
          repo: "checkout-service",
          diff: "diff --git a/src/payment.ts b/src/payment.ts\n+const password = 'super-secret';\n+export function charge() { return payment.charge(); }",
          risk_level: "medium"
        }
      })
      .expect(200);

    const response = await request(app).get("/skills/pr-review/audit").expect(200);
    const serializedBody = JSON.stringify(response.body);

    expect(Array.isArray(response.body.events)).toBe(true);
    expect(response.body.events.length).toBeGreaterThan(0);
    expect(serializedBody).not.toContain("super-secret");
    expect(serializedBody).not.toContain("legacy-secret");
    expect(serializedBody).not.toContain("payment.charge");
    expect(response.body.events[0].request.inputs.diff).toBe("[redacted]");
    expect(response.body.events.at(-1).request.inputs.diff).toBe("[redacted]");
  });

  it("returns 404 for missing skill audit", async () => {
    const response = await request(app).get("/skills/missing/audit").expect(404);
    expect(response.body).toEqual({ error: "Skill not found: missing" });
  });

  it("returns JSON 404 for unknown routes", async () => {
    const response = await request(app).get("/nope").expect(404);
    expect(response.body).toEqual({ error: "Not found" });
  });
});

async function populatePrReviewSkill(rootDir: string): Promise<void> {
  const sourceSkillDir = join(repoRoot, "skills", "pr-review");
  const targetSkillDir = join(rootDir, "skills", "pr-review");
  const targetExamplesDir = join(targetSkillDir, "examples");

  await mkdir(targetExamplesDir, { recursive: true });

  await Promise.all([
    copyTextFile(join(sourceSkillDir, "skill.yaml"), join(targetSkillDir, "skill.yaml")),
    copyTextFile(join(sourceSkillDir, "instructions.md"), join(targetSkillDir, "instructions.md")),
    copyTextFile(join(sourceSkillDir, "examples", "basic-risk.json"), join(targetExamplesDir, "basic-risk.json")),
    copyTextFile(
      join(sourceSkillDir, "examples", "missing-tests.json"),
      join(targetExamplesDir, "missing-tests.json")
    )
  ]);
}

async function copyTextFile(sourcePath: string, targetPath: string): Promise<void> {
  await writeFile(targetPath, await readFile(sourcePath, "utf8"));
}
