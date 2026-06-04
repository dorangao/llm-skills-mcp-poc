import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { FileSkillRegistry } from "../src/registry.js";

async function createSkillRoot() {
  return mkdtemp(join(tmpdir(), "skills-registry-"));
}

async function writeSkillFixture(
  root: string,
  skillId: string,
  overrides: {
    manifest?: string[];
    instructions?: string;
    exampleFile?: string;
    exampleContent?: string;
  } = {}
) {
  const skillDir = join(root, "skills", skillId);
  await mkdir(join(skillDir, "examples"), { recursive: true });

  await writeFile(
    join(skillDir, "skill.yaml"),
    (
      overrides.manifest ?? [
        `id: ${skillId}`,
        "name: Pull Request Review",
        "version: 0.1.0",
        "description: Reviews code diffs.",
        "instructions: instructions.md",
        "inputs:",
        "  - name: repo",
        "    type: string",
        "    required: true",
        "outputs:",
        "  type: object",
        "  schema:",
        "    summary: string",
        "tools: []",
        "guardrails:",
        "  no_secret_exfiltration: true",
        "targets: {}",
        "examples:",
        "  - examples/basic-risk.json"
      ]
    ).join("\n")
  );

  await writeFile(join(skillDir, "instructions.md"), overrides.instructions ?? "Review the diff.");
  await writeFile(
    join(skillDir, "examples", overrides.exampleFile ?? "basic-risk.json"),
    overrides.exampleContent ??
      JSON.stringify({
        name: "basic risk",
        inputs: { repo: "demo", diff: "diff", risk_level: "low" },
        expected: { deployment_risk: "low" }
      })
  );
}

describe("FileSkillRegistry", () => {
  it("lists skill metadata sorted by id", async () => {
    const root = await createSkillRoot();
    await writeSkillFixture(root, "z-review");
    await writeSkillFixture(root, "a-review");
    const registry = new FileSkillRegistry({ rootDir: root });

    const skills = await registry.listSkills();

    expect(skills.map((skill) => skill.id)).toEqual(["a-review", "z-review"]);
  });

  it("lists validated skill metadata", async () => {
    const root = await createSkillRoot();
    await writeSkillFixture(root, "pr-review");
    const registry = new FileSkillRegistry({ rootDir: root });

    const skills = await registry.listSkills();

    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      id: "pr-review",
      name: "Pull Request Review",
      version: "0.1.0"
    });
  });

  it("rejects malformed manifest content when listing skills", async () => {
    const root = await createSkillRoot();
    await writeSkillFixture(root, "good-skill");
    await writeSkillFixture(root, "bad-skill", {
      manifest: [
        "id: bad-skill",
        "version: 0.1.0",
        "description: Reviews code diffs.",
        "instructions: instructions.md",
        "outputs:",
        "  type: object",
        "  schema:",
        "    summary: string",
        "tools: []",
        "guardrails:",
        "  no_secret_exfiltration: true",
        "targets: {}",
        "examples:",
        "  - examples/basic-risk.json"
      ]
    });
    const registry = new FileSkillRegistry({ rootDir: root });

    await expect(registry.listSkills()).rejects.toThrow();
  });

  it("rejects malformed manifest content when getting a skill", async () => {
    const root = await createSkillRoot();
    await writeSkillFixture(root, "bad-skill", {
      manifest: [
        "id: bad-skill",
        "version: 0.1.0",
        "description: Reviews code diffs.",
        "instructions: instructions.md",
        "outputs:",
        "  type: object",
        "  schema:",
        "    summary: string",
        "tools: []",
        "guardrails:",
        "  no_secret_exfiltration: true",
        "targets: {}",
        "examples:",
        "  - examples/basic-risk.json"
      ]
    });
    const registry = new FileSkillRegistry({ rootDir: root });

    await expect(registry.getSkill("bad-skill")).rejects.toThrow();
  });

  it("loads instructions and examples for one skill", async () => {
    const root = await createSkillRoot();
    await writeSkillFixture(root, "pr-review");
    const registry = new FileSkillRegistry({ rootDir: root });

    const skill = await registry.getSkill("pr-review");

    expect(skill.manifest.id).toBe("pr-review");
    expect(skill.instructions).toBe("Review the diff.");
    expect(skill.examples[0].name).toBe("basic risk");
  });

  it("rejects invalid example JSON when getting a skill", async () => {
    const root = await createSkillRoot();
    await writeSkillFixture(root, "pr-review", {
      exampleContent: "{not valid json"
    });
    const registry = new FileSkillRegistry({ rootDir: root });

    await expect(registry.getSkill("pr-review")).rejects.toThrow();
  });

  it("rejects invalid example schema when getting a skill", async () => {
    const root = await createSkillRoot();
    await writeSkillFixture(root, "pr-review", {
      exampleContent: JSON.stringify({
        name: "basic risk",
        inputs: { repo: "demo", diff: "diff", risk_level: "low" }
      })
    });
    const registry = new FileSkillRegistry({ rootDir: root });

    await expect(registry.getSkill("pr-review")).rejects.toThrow();
  });

  it("rejects unknown skills", async () => {
    const root = await createSkillRoot();
    await writeSkillFixture(root, "pr-review");
    const registry = new FileSkillRegistry({ rootDir: root });

    await expect(registry.getSkill("missing")).rejects.toThrow("Skill not found: missing");
  });
});
