/// <reference types="node" />

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type JsonObject,
  type SkillEvaluationResult,
  type SkillRunRequest,
  type SkillRunResult,
  skillEvaluationResultSchema,
  skillRunRequestSchema,
  skillRunResultSchema
} from "@llm-skills-poc/skill-spec";
import { resolveDataDir } from "./paths.js";
import { parsePrReviewInputs, runPrReview } from "./prReview.js";
import { FileSkillRegistry } from "./registry.js";

export interface SkillRunnerOptions {
  registry?: FileSkillRegistry;
  rootDir?: string;
  dataDir?: string;
}

export class SkillRunner {
  private readonly registry: FileSkillRegistry;
  private readonly dataDir: string;

  constructor(options: SkillRunnerOptions = {}) {
    this.registry = options.registry ?? new FileSkillRegistry({ rootDir: options.rootDir });
    this.dataDir = options.dataDir ?? resolveDataDir(options.rootDir);
  }

  async run(skillId: string, request: SkillRunRequest): Promise<SkillRunResult> {
    const parsedRequest = skillRunRequestSchema.parse(request);
    const skill = await this.registry.getSkill(skillId);

    if (parsedRequest.version && parsedRequest.version !== skill.manifest.version) {
      throw new Error(`Unsupported version ${parsedRequest.version} for ${skillId}`);
    }

    const response = this.executeLoadedSkill(skill.manifest.id, skill.manifest.version, parsedRequest.inputs);

    await this.writeTrace(skill.manifest.id, response.trace_id, {
      request: redactTraceRequest(parsedRequest),
      response,
      created_at: new Date().toISOString()
    });

    return response;
  }

  async evaluate(skillId: string): Promise<SkillEvaluationResult> {
    const skill = await this.registry.getSkill(skillId);
    const cases = [];

    for (const example of skill.examples) {
      const result = this.executeLoadedSkill(skill.manifest.id, skill.manifest.version, example.inputs);
      const failures: string[] = [];

      if (example.expected.deployment_risk && result.result.deployment_risk !== example.expected.deployment_risk) {
        failures.push(
          `Expected deployment_risk ${example.expected.deployment_risk}, got ${result.result.deployment_risk}`
        );
      }

      for (const phrase of example.expected.includes_suggestions) {
        if (!includesNormalizedText(result.result.non_blocking_suggestions, phrase)) {
          failures.push(`Expected suggestion containing: ${phrase}`);
        }
      }

      for (const phrase of example.expected.includes_tests) {
        if (!includesNormalizedText(result.result.test_recommendations, phrase)) {
          failures.push(`Expected test recommendation containing: ${phrase}`);
        }
      }

      cases.push({ name: example.name, passed: failures.length === 0, failures });
    }

    return skillEvaluationResultSchema.parse({
      skill_id: skill.manifest.id,
      version: skill.manifest.version,
      passed: cases.every((testCase) => testCase.passed),
      cases
    });
  }

  async listAudit(skillId: string): Promise<unknown[]> {
    const auditFile = join(this.dataDir, "traces", `${skillId}.jsonl`);

    try {
      const raw = await readFile(auditFile, "utf8");
      return raw
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => redactAuditEvent(JSON.parse(line)));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  private runLoadedSkill(skillId: string, inputs: JsonObject) {
    if (skillId !== "pr-review") {
      throw new Error(`No deterministic runner registered for ${skillId}`);
    }

    return runPrReview(parsePrReviewInputs(inputs));
  }

  private executeLoadedSkill(skillId: string, version: string, inputs: JsonObject): SkillRunResult {
    const result = this.runLoadedSkill(skillId, inputs);
    return skillRunResultSchema.parse({
      skill_id: skillId,
      version,
      result,
      trace_id: `trace_${randomUUID()}`
    });
  }

  private async writeTrace(skillId: string, traceId: string, payload: Record<string, unknown>): Promise<void> {
    const traceDir = join(this.dataDir, "traces");
    await mkdir(traceDir, { recursive: true });
    await writeFile(join(traceDir, `${skillId}.jsonl`), `${JSON.stringify({ trace_id: traceId, ...payload })}\n`, {
      flag: "a"
    });
  }
}

function includesNormalizedText(values: string[], expectedFragment: string): boolean {
  const normalizedExpected = normalizeText(expectedFragment);
  return (
    values.some((value) => normalizeText(value).includes(normalizedExpected)) ||
    normalizeText(values.join(" ")).includes(normalizedExpected)
  );
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function redactTraceRequest(request: SkillRunRequest): SkillRunRequest {
  return {
    ...request,
    inputs: redactJsonObject(request.inputs)
  };
}

function redactAuditEvent(event: unknown): unknown {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    return event;
  }

  const auditEvent = event as Record<string, unknown>;
  const request = auditEvent.request;

  if (!request || typeof request !== "object" || Array.isArray(request)) {
    return event;
  }

  const requestRecord = request as Record<string, unknown>;
  const inputs = requestRecord.inputs;

  if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) {
    return event;
  }

  return {
    ...auditEvent,
    request: {
      ...requestRecord,
      inputs: redactJsonObject(inputs as JsonObject)
    }
  };
}

function redactJsonObject(value: JsonObject): JsonObject {
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, shouldRedactKey(key) ? "[redacted]" : redactJsonValue(entry)])
  );
}

function redactJsonValue(value: JsonObject[string]): JsonObject[string] {
  if (Array.isArray(value)) {
    return value.map((entry) => redactJsonValue(entry)) as JsonObject[string];
  }

  if (value && typeof value === "object") {
    return redactJsonObject(value as JsonObject);
  }

  return value;
}

function shouldRedactKey(key: string): boolean {
  return /diff|secret|password|token|api[_-]?key|credential|authorization/i.test(key);
}
