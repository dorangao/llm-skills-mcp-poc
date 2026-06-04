/// <reference types="node" />

import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { SkillRunner } from "../src/runner.js";

async function createSkillRoot() {
  return mkdtemp(join(tmpdir(), "skills-runner-"));
}

async function writePrReviewFixture(root: string) {
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
      "targets:",
      "  openai:",
      "    expose_as_mcp_tool: true",
      "examples:",
      "  - examples/missing-tests.json"
    ].join("\n")
  );

  await writeFile(
    join(skillDir, "instructions.md"),
    [
      "# Pull Request Review",
      "",
      "Review code changes as a senior engineer.",
      "",
      "Focus on correctness, edge cases, tests, deployment risk, and maintainability."
    ].join("\n")
  );

  await writeFile(
    join(skillDir, "examples", "missing-tests.json"),
    JSON.stringify({
      name: "missing tests",
      inputs: {
        repo: "checkout-service",
        diff: "diff --git a/src/payment.ts b/src/payment.ts\n+export async function authorizePayment(card: Card) {\n+  return paymentGateway.charge(card);\n+}",
        risk_level: "medium"
      },
      expected: {
        deployment_risk: "high",
        includes_suggestions: ["payment or authorization logic changed"],
        includes_tests: ["add tests"]
      }
    })
  );
}

describe("SkillRunner", () => {
  it("runs pr-review deterministically", async () => {
    const root = await createSkillRoot();
    await writePrReviewFixture(root);
    const runner = new SkillRunner({ rootDir: root });

    const result = await runner.run("pr-review", {
      version: "0.1.0",
      client: "api",
      inputs: {
        repo: "checkout-service",
        diff: "diff --git a/src/cart.ts b/src/cart.ts\n+export function formatCart(items: Item[]) {\n+  return items.map(item => item.name).join(', ');\n+}",
        risk_level: "low"
      }
    });

    expect(result.skill_id).toBe("pr-review");
    expect(result.version).toBe("0.1.0");
    expect(result.trace_id).toMatch(/^trace_/);
    expect(result.result.deployment_risk).toBe("medium");
    expect(result.result.test_recommendations.join(" ")).toContain("Add tests");
  });

  it("rejects unsupported versions", async () => {
    const root = await createSkillRoot();
    await writePrReviewFixture(root);
    const runner = new SkillRunner({ rootDir: root });

    await expect(
      runner.run("pr-review", {
        version: "9.9.9",
        client: "api",
        inputs: {
          repo: "checkout-service",
          diff: "diff --git a/src/cart.ts b/src/cart.ts\n+export function formatCart(items: Item[]) { return []; }",
          risk_level: "low"
        }
      })
    ).rejects.toThrow("Unsupported version 9.9.9 for pr-review");
  });

  it("returns an empty audit list when no audit file exists", async () => {
    const root = await createSkillRoot();
    await writePrReviewFixture(root);
    const runner = new SkillRunner({ rootDir: root });

    await expect(runner.listAudit("pr-review")).resolves.toEqual([]);
  });

  it("appends run traces that can be read back from the audit log", async () => {
    const root = await createSkillRoot();
    await writePrReviewFixture(root);
    const runner = new SkillRunner({ rootDir: root });

    const result = await runner.run("pr-review", {
      version: "0.1.0",
      client: "api",
      inputs: {
        repo: "checkout-service",
        diff: "diff --git a/src/cart.ts b/src/cart.ts\n+export function formatCart(items: Item[]) {\n+  return items.map(item => item.name).join(', ');\n+}",
        risk_level: "low"
      }
    });

    const auditEntries = await runner.listAudit("pr-review");

    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0]).toMatchObject({
      trace_id: result.trace_id,
      request: {
        version: "0.1.0",
        client: "api",
        inputs: {
          repo: "checkout-service",
          diff: "[redacted]",
          risk_level: "low"
        }
      },
      response: {
        skill_id: "pr-review",
        trace_id: result.trace_id
      }
    });
    expect(JSON.stringify(auditEntries)).not.toContain("formatCart");
  });

  it("redacts secret-like input fields from audit traces", async () => {
    const root = await createSkillRoot();
    await writePrReviewFixture(root);
    const runner = new SkillRunner({ rootDir: root });

    await runner.run("pr-review", {
      version: "0.1.0",
      client: "api",
      inputs: {
        repo: "checkout-service",
        diff: "diff --git a/src/config.ts b/src/config.ts\n+const password = 'super-secret';",
        risk_level: "high",
        api_key: "abc123"
      }
    });

    const auditEntries = await runner.listAudit("pr-review");
    const serializedAudit = JSON.stringify(auditEntries);

    expect(serializedAudit).not.toContain("super-secret");
    expect(serializedAudit).not.toContain("abc123");
    expect(auditEntries[0]).toMatchObject({
      request: {
        inputs: {
          diff: "[redacted]",
          api_key: "[redacted]"
        }
      }
    });
  });

  it("redacts legacy audit entries when reading traces", async () => {
    const root = await createSkillRoot();
    await writePrReviewFixture(root);
    await mkdir(join(root, ".data", "traces"), { recursive: true });
    await writeFile(
      join(root, ".data", "traces", "pr-review.jsonl"),
      `${JSON.stringify({
        trace_id: "trace_legacy",
        request: {
          version: "0.1.0",
          client: "api",
          inputs: {
            repo: "checkout-service",
            diff: "diff --git a/src/config.ts b/src/config.ts\n+const token = 'legacy-secret';",
            risk_level: "high",
            nested: {
              password: "legacy-password"
            }
          }
        },
        response: {
          skill_id: "pr-review"
        }
      })}\n`
    );
    const runner = new SkillRunner({ rootDir: root });

    const auditEntries = await runner.listAudit("pr-review");
    const serializedAudit = JSON.stringify(auditEntries);

    expect(serializedAudit).not.toContain("legacy-secret");
    expect(serializedAudit).not.toContain("legacy-password");
    expect(auditEntries[0]).toMatchObject({
      request: {
        inputs: {
          diff: "[redacted]",
          nested: {
            password: "[redacted]"
          }
        }
      }
    });
  });

  it("evaluates example cases", async () => {
    const root = await createSkillRoot();
    await writePrReviewFixture(root);
    const runner = new SkillRunner({ rootDir: root });

    const evaluation = await runner.evaluate("pr-review");

    expect(evaluation.passed).toBe(true);
    expect(evaluation.cases[0]).toEqual({
      name: "missing tests",
      passed: true,
      failures: []
    });
  });

  it("does not create audit entries during evaluation", async () => {
    const root = await createSkillRoot();
    await writePrReviewFixture(root);
    const runner = new SkillRunner({ rootDir: root });

    await runner.evaluate("pr-review");

    await expect(runner.listAudit("pr-review")).resolves.toEqual([]);
  });
});
