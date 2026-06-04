import { describe, expect, it } from "vitest";
import {
  skillManifestSchema,
  skillEvaluationResultSchema,
  skillRunRequestSchema,
  skillRunResultEnvelopeSchema,
  skillRunResultSchema
} from "../src/index.js";

describe("skill manifest schema", () => {
  it("accepts a valid PR review manifest", () => {
    const parsed = skillManifestSchema.parse({
      id: "pr-review",
      name: "Pull Request Review",
      version: "0.1.0",
      description: "Reviews code diffs for risk, correctness, and tests.",
      instructions: "instructions.md",
      inputs: [
        { name: "repo", type: "string", required: true },
        { name: "diff", type: "string", required: true },
        {
          name: "risk_level",
          type: "enum",
          required: true,
          values: ["low", "medium", "high"]
        }
      ],
      outputs: {
        type: "object",
        schema: {
          summary: "string",
          blocking_issues: "array",
          non_blocking_suggestions: "array",
          test_recommendations: "array",
          deployment_risk: "string"
        }
      },
      tools: [],
      guardrails: {
        require_citations: false,
        no_secret_exfiltration: true,
        confirm_before_write: true
      },
      targets: {
        openai: { expose_as_mcp_tool: true },
        claude: { package_as_skill: true },
        cursor: { expose_as_rule_and_mcp_tool: true }
      },
      examples: ["examples/basic-risk.json"]
    });

    expect(parsed.id).toBe("pr-review");
    expect(parsed.inputs).toHaveLength(3);
    expect(parsed.inputs[0]?.required).toBe(true);
    expect(parsed.tools).toEqual([]);
    expect(parsed.guardrails).toEqual({
      require_citations: false,
      no_secret_exfiltration: true,
      confirm_before_write: true
    });
    expect(parsed.targets).toEqual({
      openai: { expose_as_mcp_tool: true },
      claude: { package_as_skill: true },
      cursor: { expose_as_rule_and_mcp_tool: true }
    });
    expect(parsed.examples).toEqual(["examples/basic-risk.json"]);
  });

  it("rejects enum inputs without values", () => {
    expect(() =>
      skillManifestSchema.parse({
        id: "bad-skill",
        name: "Bad Skill",
        version: "0.1.0",
        description: "Invalid skill.",
        instructions: "instructions.md",
        inputs: [{ name: "risk_level", type: "enum", required: true }],
        outputs: { type: "object", schema: { summary: "string" } }
      })
    ).toThrow();
  });

  it("rejects non-enum inputs with values", () => {
    expect(() =>
      skillManifestSchema.parse({
        id: "bad-skill",
        name: "Bad Skill",
        version: "0.1.0",
        description: "Invalid skill.",
        instructions: "instructions.md",
        inputs: [
          {
            name: "repo",
            type: "string",
            values: ["checkout-service"]
          }
        ],
        outputs: { type: "object", schema: { summary: "string" } }
      })
    ).toThrow();
  });

  it("rejects unknown manifest keys", () => {
    expect(() =>
      skillManifestSchema.parse({
        id: "pr-review",
        name: "Pull Request Review",
        version: "0.1.0",
        description: "Reviews code diffs for risk, correctness, and tests.",
        instructions: "instructions.md",
        inputs: [],
        outputs: { type: "object", schema: { summary: "string" } },
        extra: true
      })
    ).toThrow();
  });

  it("defaults optional manifest fields", () => {
    const parsed = skillManifestSchema.parse({
      id: "minimal-skill",
      name: "Minimal Skill",
      version: "0.1.0",
      description: "Minimal manifest.",
      instructions: "instructions.md",
      inputs: [{ name: "repo", type: "string" }],
      outputs: { type: "object", schema: { summary: "string" } }
    });

    expect(parsed.tools).toEqual([]);
    expect(parsed.guardrails).toEqual({});
    expect(parsed.targets).toEqual({});
    expect(parsed.examples).toEqual([]);
    expect(parsed.inputs[0]?.required).toBe(false);
  });
});

describe("skill run schemas", () => {
  it("accepts a run request", () => {
    const parsed = skillRunRequestSchema.parse({
      version: "0.1.0",
      client: "cursor",
      inputs: {
        repo: "checkout-service",
        diff: "diff --git a/file.ts b/file.ts",
        risk_level: "medium"
      }
    });

    expect(parsed.client).toBe("cursor");
  });

  it("accepts prerelease and build versions", () => {
    expect(
      skillRunRequestSchema.parse({
        version: "1.2.3-beta.1+build.5",
        client: "cursor",
        inputs: {}
      }).version
    ).toBe("1.2.3-beta.1+build.5");
  });

  it("rejects invalid clients", () => {
    expect(() =>
      skillRunRequestSchema.parse({
        version: "0.1.0",
        client: "not-a-client",
        inputs: {}
      })
    ).toThrow();
  });

  it("rejects unknown run request keys", () => {
    expect(() =>
      skillRunRequestSchema.parse({
        version: "0.1.0",
        client: "cursor",
        inputs: {},
        extra: "nope"
      })
    ).toThrow();
  });

  it("rejects non-serializable request payload values", () => {
    expect(() =>
      skillRunRequestSchema.parse({
        version: "0.1.0",
        client: "cursor",
        inputs: {
          repo: "checkout-service",
          diff: () => "nope"
        }
      })
    ).toThrow();
  });

  it("rejects non-finite request payload numbers", () => {
    expect(() =>
      skillRunRequestSchema.parse({
        version: "0.1.0",
        client: "cursor",
        inputs: {
          score: Number.NaN
        }
      })
    ).toThrow();
  });

  it("accepts a structured PR review result", () => {
    const parsed = skillRunResultSchema.parse({
      skill_id: "pr-review",
      version: "0.1.0",
      result: {
        summary: "Change looks mostly safe.",
        blocking_issues: [],
        non_blocking_suggestions: ["Add focused tests."],
        test_recommendations: ["Run npm test."],
        deployment_risk: "medium"
      },
      trace_id: "trace_123"
    });

    expect(parsed.result.deployment_risk).toBe("medium");
  });

  it("accepts a generic run result envelope", () => {
    const parsed = skillRunResultEnvelopeSchema.parse({
      skill_id: "custom-skill",
      version: "0.1.0",
      result: {
        any: "shape",
        nested: { ok: true }
      },
      trace_id: "trace_456"
    });

    expect(parsed.result).toEqual({
      any: "shape",
      nested: { ok: true }
    });
  });

  it("accepts build metadata in run result versions", () => {
    expect(
      skillRunResultEnvelopeSchema.parse({
        skill_id: "custom-skill",
        version: "1.2.3+build.5",
        result: {},
        trace_id: "trace_456"
      }).version
    ).toBe("1.2.3+build.5");
  });

  it("rejects non-serializable result values", () => {
    expect(() =>
      skillRunResultEnvelopeSchema.parse({
        skill_id: "custom-skill",
        version: "0.1.0",
        result: {
          created_at: new Date()
        },
        trace_id: "trace_456"
      })
    ).toThrow();
  });

  it("rejects non-finite result numbers", () => {
    expect(() =>
      skillRunResultEnvelopeSchema.parse({
        skill_id: "custom-skill",
        version: "0.1.0",
        result: {
          score: Infinity
        },
        trace_id: "trace_456"
      })
    ).toThrow();
  });

  it("rejects malformed result versions", () => {
    expect(() =>
      skillRunResultSchema.parse({
        skill_id: "pr-review",
        version: "0.1",
        result: {
          summary: "Change looks mostly safe.",
          blocking_issues: [],
          non_blocking_suggestions: ["Add focused tests."],
          test_recommendations: ["Run npm test."],
          deployment_risk: "medium"
        },
        trace_id: "trace_123"
      })
    ).toThrow();
  });

  it("rejects malformed evaluation versions", () => {
    expect(() =>
      skillEvaluationResultSchema.parse({
        skill_id: "pr-review",
        version: "0.1",
        passed: true,
        cases: [
          {
            name: "case-a",
            passed: true,
            failures: []
          }
        ]
      })
    ).toThrow();
  });

  it("accepts prerelease evaluation versions", () => {
    expect(
      skillEvaluationResultSchema.parse({
        skill_id: "pr-review",
        version: "1.2.3-rc.1",
        passed: true,
        cases: [
          {
            name: "case-a",
            passed: true,
            failures: []
          }
        ]
      }).version
    ).toBe("1.2.3-rc.1");
  });

  it("rejects unknown run result envelope keys", () => {
    expect(() =>
      skillRunResultEnvelopeSchema.parse({
        skill_id: "custom-skill",
        version: "0.1.0",
        result: {},
        trace_id: "trace_456",
        extra: true
      })
    ).toThrow();
  });
});
