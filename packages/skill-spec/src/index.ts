import { z } from "zod";

const semverPattern =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export const skillVersionSchema = z.string().regex(semverPattern);

export type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

export const jsonObjectSchema: z.ZodType<JsonObject> = z
  .record(z.string(), z.lazy(() => jsonValueSchema))
  .superRefine((value, ctx) => {
    if (!isPlainObject(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "value must be a plain JSON object"
      });
    }
  });

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    jsonObjectSchema
  ])
);

export const skillInputTypeSchema = z.enum(["string", "number", "boolean", "enum"]);

export const skillInputSchema = z
  .object({
    name: z.string().min(1),
    type: skillInputTypeSchema,
    required: z.boolean().default(false),
    values: z.array(z.string().min(1)).optional()
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.type !== "enum" && input.values !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "values are only allowed for enum inputs",
        path: ["values"]
      });
    }
    if (input.type === "enum" && (!input.values || input.values.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "enum inputs must define at least one value",
        path: ["values"]
      });
    }
  });

export const outputPrimitiveSchema = z.enum(["string", "number", "boolean", "array", "object"]);

export const skillOutputSchema = z.object({
  type: z.literal("object"),
  schema: z.record(z.string(), outputPrimitiveSchema)
}).strict();

export const guardrailsSchema = z
  .object({
    require_citations: z.boolean().optional(),
    no_secret_exfiltration: z.boolean().optional(),
    confirm_before_write: z.boolean().optional()
  })
  .strict()
  .default({});

export const targetConfigSchema = z.record(
  z.string(),
  z.record(z.string(), z.union([z.string(), z.boolean(), z.number()]))
);

export const skillManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1),
  version: skillVersionSchema,
  description: z.string().min(1),
  instructions: z.string().min(1),
  inputs: z.array(skillInputSchema).default([]),
  outputs: skillOutputSchema,
  tools: z.array(z.string()).default([]),
  guardrails: guardrailsSchema,
  targets: targetConfigSchema.default({}),
  examples: z.array(z.string()).default([])
}).strict();

export const skillRunRequestSchema = z.object({
  version: skillVersionSchema.optional(),
  client: z.enum(["openai", "claude", "cursor", "internal", "api", "mcp"]),
  inputs: jsonObjectSchema
}).strict();

export const prReviewResultSchema = z.object({
  summary: z.string(),
  blocking_issues: z.array(z.string()),
  non_blocking_suggestions: z.array(z.string()),
  test_recommendations: z.array(z.string()),
  deployment_risk: z.enum(["low", "medium", "high"])
}).strict();

export const skillRunResultEnvelopeSchema = z
  .object({
    skill_id: z.string(),
    version: skillVersionSchema,
    result: jsonObjectSchema,
    trace_id: z.string()
  })
  .strict();

export const prReviewRunResultSchema = skillRunResultEnvelopeSchema.extend({
  result: prReviewResultSchema
});

export const skillRunResultSchema = prReviewRunResultSchema;

export const skillEvaluationCaseExpectedSchema = z
  .object({
    deployment_risk: z.enum(["low", "medium", "high"]).optional(),
    includes_suggestions: z.array(z.string()).default([]),
    includes_tests: z.array(z.string()).default([])
  })
  .strict();

export const skillEvaluationCaseSchema = z
  .object({
    name: z.string().min(1),
    inputs: jsonObjectSchema,
    expected: skillEvaluationCaseExpectedSchema
  })
  .strict();

export const skillEvaluationCaseResultSchema = z
  .object({
    name: z.string(),
    passed: z.boolean(),
    failures: z.array(z.string())
  })
  .strict();

export const skillEvaluationResultSchema = z
  .object({
    skill_id: z.string(),
    version: skillVersionSchema,
    passed: z.boolean(),
    cases: z.array(skillEvaluationCaseResultSchema)
  })
  .strict();

export type SkillVersion = z.infer<typeof skillVersionSchema>;
export type JsonRecord = JsonObject;
export type SkillManifest = z.infer<typeof skillManifestSchema>;
export type SkillRunRequest = z.infer<typeof skillRunRequestSchema>;
export type PrReviewResult = z.infer<typeof prReviewResultSchema>;
export type SkillRunResultEnvelope = z.infer<typeof skillRunResultEnvelopeSchema>;
export type PrReviewRunResult = z.infer<typeof prReviewRunResultSchema>;
export type SkillRunResult = z.infer<typeof skillRunResultSchema>;
export type SkillEvaluationCaseExpected = z.infer<typeof skillEvaluationCaseExpectedSchema>;
export type SkillEvaluationCase = z.infer<typeof skillEvaluationCaseSchema>;
export type SkillEvaluationCaseResult = z.infer<typeof skillEvaluationCaseResultSchema>;
export type SkillEvaluationResult = z.infer<typeof skillEvaluationResultSchema>;
