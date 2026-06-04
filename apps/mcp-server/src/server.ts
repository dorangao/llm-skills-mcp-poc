import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { FileSkillRegistry, SkillRunner } from "@llm-skills-poc/skill-runner";
import { type JsonObject, jsonObjectSchema, skillVersionSchema } from "@llm-skills-poc/skill-spec";
import { z } from "zod";

const registry = new FileSkillRegistry();
const runner = new SkillRunner({ registry });

const skillIdSchema = z.string().min(1);
const clientSchema = z.enum(["openai", "claude", "cursor", "internal", "api", "mcp"]);

const runSkillInputSchema = z.object({
  skill_id: skillIdSchema,
  version: skillVersionSchema.optional(),
  client: clientSchema.optional(),
  inputs: jsonObjectSchema
});

export interface RunSkillPayloadInput {
  skill_id: string;
  version?: string;
  client?: z.infer<typeof clientSchema>;
  inputs: JsonObject;
}

export async function listSkillsPayload() {
  return { skills: await registry.listSkills() };
}

export async function getSkillPayload(skillId: string) {
  const skill = await registry.getSkill(skillId);
  return {
    skill: {
      manifest: skill.manifest,
      instructions: skill.instructions,
      examples: skill.examples
    }
  };
}

export async function runSkillPayload(input: RunSkillPayloadInput) {
  const parsedInput = runSkillInputSchema.parse(input);

  return runner.run(parsedInput.skill_id, {
    version: parsedInput.version,
    client: parsedInput.client ?? "mcp",
    inputs: parsedInput.inputs
  });
}

export async function evaluateSkillPayload(skillId: string) {
  return runner.evaluate(skillId);
}

export function createSkillsMcpServer() {
  const server = new McpServer({ name: "shared-skills", version: "0.1.0" });

  server.registerTool(
    "list_skills",
    {
      title: "List Skills",
      description: "List available shared skills."
    },
    async () => jsonTextResult(await listSkillsPayload())
  );

  server.registerTool(
    "get_skill",
    {
      title: "Get Skill",
      description: "Load a shared skill manifest, instructions, and examples.",
      inputSchema: {
        skill_id: skillIdSchema
      }
    },
    async ({ skill_id }) => jsonTextResult(await getSkillPayload(skill_id))
  );

  server.registerTool(
    "run_skill",
    {
      title: "Run Skill",
      description: "Run a shared skill with validated JSON-object inputs.",
      inputSchema: {
        skill_id: skillIdSchema,
        version: skillVersionSchema.optional(),
        client: clientSchema.optional(),
        inputs: jsonObjectSchema
      }
    },
    async (input) => jsonTextResult(await runSkillPayload(input))
  );

  server.registerTool(
    "evaluate_skill",
    {
      title: "Evaluate Skill",
      description: "Evaluate a shared skill against its packaged examples.",
      inputSchema: {
        skill_id: skillIdSchema
      }
    },
    async ({ skill_id }) => jsonTextResult(await evaluateSkillPayload(skill_id))
  );

  return server;
}

function jsonTextResult(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2)
      }
    ]
  };
}
