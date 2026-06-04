import { describe, expect, it } from "vitest";
import { createSkillsMcpServer, getSkillPayload, listSkillsPayload, runSkillPayload } from "../src/server.js";

describe("MCP server adapter", () => {
  it("creates a server object", () => {
    const server = createSkillsMcpServer();
    expect(server).toBeDefined();
  });

  it("lists skills through shared registry helper", async () => {
    const payload = await listSkillsPayload();
    expect(payload.skills[0]).toMatchObject({ id: "pr-review", version: "0.1.0" });
  });

  it("gets skills without leaking local filesystem internals", async () => {
    const payload = await getSkillPayload("pr-review");

    expect(payload.skill.manifest.id).toBe("pr-review");
    expect(payload.skill.instructions).toContain("Pull Request Review");
    expect(payload.skill.examples).toHaveLength(2);
    expect("directory" in payload.skill).toBe(false);
  });

  it("runs skills through shared runner helper", async () => {
    const payload = await runSkillPayload({
      skill_id: "pr-review",
      version: "0.1.0",
      client: "mcp",
      inputs: {
        repo: "checkout-service",
        diff: "diff --git a/src/payment.ts b/src/payment.ts\n+export function charge() { return payment.charge(); }",
        risk_level: "medium"
      }
    });

    expect(payload.skill_id).toBe("pr-review");
    expect(payload.result.deployment_risk).toBe("high");
  });
});
