/// <reference types="node" />

import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import type { LoadedSkill } from "@llm-skills-poc/skill-runner";
import { AdminSkillStore } from "../src/admin/store.js";

const testRoots: string[] = [];

function manifestContent(
  overrides: {
    id?: string;
    name?: string;
    version?: string;
    instructions?: string;
    examples?: string[];
  } = {}
): string {
  const examples = overrides.examples ?? ["examples/basic-risk.json"];
  return [
    `id: ${overrides.id ?? "pr-review"}`,
    `name: ${overrides.name ?? "Pull Request Review"}`,
    `version: ${overrides.version ?? "0.1.0"}`,
    "description: Reviews code changes for correctness, maintainability, tests, and risk.",
    `instructions: ${overrides.instructions ?? "instructions.md"}`,
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
    examples.length === 0 ? "examples: []" : "examples:",
    ...examples.map((example) => `  - ${example}`)
  ].join("\n");
}

function exampleContent(name: string, deploymentRisk: "low" | "medium" | "high" = "medium"): string {
  return JSON.stringify(
    {
      name,
      inputs: {
        repo: "checkout-service",
        diff: "diff --git a/src/cart.ts b/src/cart.ts\n+export function cart() { return []; }",
        risk_level: "low"
      },
      expected: {
        deployment_risk: deploymentRisk,
        includes_suggestions: ["Validate empty inputs"],
        includes_tests: ["Add tests"]
      }
    },
    null,
    2
  );
}

async function createProjectFixture(): Promise<string> {
  const rootDir = await mkdtemp(join(tmpdir(), "admin-skill-store-"));
  testRoots.push(rootDir);

  const skillDir = join(rootDir, "skills", "pr-review");
  await mkdir(join(skillDir, "examples"), { recursive: true });
  await writeFile(join(skillDir, "skill.yaml"), manifestContent(), "utf8");
  await writeFile(join(skillDir, "instructions.md"), "# Pull Request Review\n\nReview diffs carefully.\n", "utf8");
  await writeFile(join(skillDir, "examples", "basic-risk.json"), exampleContent("basic risk"), "utf8");

  return rootDir;
}

async function readSkillFile(rootDir: string, filePath: string): Promise<string> {
  return readFile(join(rootDir, "skills", "pr-review", filePath), "utf8");
}

async function backupFiles(rootDir: string, target: string): Promise<string[]> {
  return readdir(join(rootDir, ".data", "backups", "pr-review", target));
}

interface StoreInternals {
  loadValidatedSkill(skillId: string): Promise<LoadedSkill>;
  replaceAndValidate<T>(
    skillId: string,
    backupTarget: "manifest" | "instructions" | `example:${string}`,
    filePath: string,
    content: string,
    result: (skill: LoadedSkill) => T
  ): Promise<T>;
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

afterEach(async () => {
  await Promise.all(testRoots.splice(0).map((rootDir) => rm(rootDir, { recursive: true, force: true })));
});

describe("AdminSkillStore", () => {
  it("loads editable manifest, instruction, and example content for a skill", async () => {
    const rootDir = await createProjectFixture();
    const store = new AdminSkillStore({ rootDir });

    const editor = await store.getEditor("pr-review");

    expect(editor.skill_id).toBe("pr-review");
    expect(editor.manifest).toMatchObject({ filename: "skill.yaml" });
    expect(editor.manifest.content).toContain("id: pr-review");
    expect(editor.instructions).toMatchObject({ filename: "instructions.md" });
    expect(editor.instructions.content).toContain("Review diffs carefully");
    expect(editor.examples).toHaveLength(1);
    expect(editor.examples[0]).toMatchObject({
      name: "basic-risk.json",
      filename: "examples/basic-risk.json"
    });
    expect(editor.examples[0].content).toContain("basic risk");
  });

  it("saves a valid manifest, backs up the previous file, and leaves no temp file behind", async () => {
    const rootDir = await createProjectFixture();
    const store = new AdminSkillStore({ rootDir });
    const original = await readSkillFile(rootDir, "skill.yaml");
    const nextManifest = manifestContent({
      name: "Pull Request Review Admin",
      version: "0.1.1"
    });

    const result = await store.saveManifest("pr-review", nextManifest);

    expect(result.manifest.name).toBe("Pull Request Review Admin");
    await expect(readSkillFile(rootDir, "skill.yaml")).resolves.toContain("version: 0.1.1");
    const backups = await backupFiles(rootDir, "manifest");
    expect(backups).toHaveLength(1);
    await expect(readFile(join(rootDir, ".data", "backups", "pr-review", "manifest", backups[0]), "utf8")).resolves.toBe(
      original
    );
    const skillDirEntries = await readdir(join(rootDir, "skills", "pr-review"));
    expect(skillDirEntries.filter((entry) => entry.includes(".tmp"))).toEqual([]);
  });

  it("rejects a schema-valid manifest with a mismatched id without modifying the current file", async () => {
    const rootDir = await createProjectFixture();
    const store = new AdminSkillStore({ rootDir });
    const original = await readSkillFile(rootDir, "skill.yaml");

    await expect(store.saveManifest("pr-review", manifestContent({ id: "other-review" }))).rejects.toThrow(
      "manifest id must match skill id pr-review"
    );

    await expect(readSkillFile(rootDir, "skill.yaml")).resolves.toBe(original);
  });

  it("rolls back the manifest if registry validation fails after a write", async () => {
    const rootDir = await createProjectFixture();
    const store = new AdminSkillStore({ rootDir });
    const original = await readSkillFile(rootDir, "skill.yaml");
    const registryInvalidManifest = manifestContent({ examples: ["examples/missing.json"] });

    await expect(store.saveManifest("pr-review", registryInvalidManifest)).rejects.toThrow();

    await expect(readSkillFile(rootDir, "skill.yaml")).resolves.toBe(original);
    await expect(backupFiles(rootDir, "manifest")).resolves.toHaveLength(1);
  });

  it("serializes mutations for the same file so a failed rollback cannot clobber an accepted write", async () => {
    const rootDir = await createProjectFixture();
    const failingStore = new AdminSkillStore({ rootDir }) as unknown as StoreInternals;
    const succeedingStore = new AdminSkillStore({ rootDir }) as unknown as StoreInternals;
    const originalSuccessfulLoad = succeedingStore.loadValidatedSkill.bind(succeedingStore);
    const failedValidationEntered = deferred();
    const releaseFailedValidation = deferred();
    const acceptedManifest = manifestContent({ name: "Accepted Manifest", version: "0.1.1" });
    const rejectedManifest = manifestContent({ name: "Rejected Manifest", version: "0.1.2" });

    failingStore.loadValidatedSkill = async () => {
      failedValidationEntered.resolve();
      await releaseFailedValidation.promise;
      throw new Error("forced validation failure");
    };
    succeedingStore.loadValidatedSkill = (skillId: string) => originalSuccessfulLoad(skillId);

    const failingWrite = failingStore.replaceAndValidate(
      "pr-review",
      "manifest",
      "skill.yaml",
      rejectedManifest,
      (skill) => ({ manifest: skill.manifest })
    );
    await failedValidationEntered.promise;

    let successfulWriteSettled = false;
    const successfulWrite = succeedingStore
      .replaceAndValidate("pr-review", "manifest", "skill.yaml", acceptedManifest, (skill) => ({
        manifest: skill.manifest
      }))
      .finally(() => {
        successfulWriteSettled = true;
      });
    await setTimeout(20);
    expect(successfulWriteSettled).toBe(false);

    releaseFailedValidation.resolve();
    await expect(failingWrite).rejects.toThrow("forced validation failure");
    await successfulWrite;

    await expect(readSkillFile(rootDir, "skill.yaml")).resolves.toBe(acceptedManifest);
  });

  it("serializes skill mutations so content saves use the latest manifest paths", async () => {
    const rootDir = await createProjectFixture();
    await writeFile(
      join(rootDir, "skills", "pr-review", "next-instructions.md"),
      "# Next Instructions\n\nExisting next file.\n",
      "utf8"
    );
    const manifestStore = new AdminSkillStore({ rootDir }) as unknown as StoreInternals & AdminSkillStore;
    const instructionsStore = new AdminSkillStore({ rootDir });
    const originalLoad = manifestStore.loadValidatedSkill.bind(manifestStore);
    const manifestValidationEntered = deferred();
    const releaseManifestValidation = deferred();
    const nextManifest = manifestContent({ instructions: "next-instructions.md" });
    const originalInstructions = await readSkillFile(rootDir, "instructions.md");

    manifestStore.loadValidatedSkill = async (skillId: string) => {
      manifestValidationEntered.resolve();
      await releaseManifestValidation.promise;
      return originalLoad(skillId);
    };

    const manifestSave = manifestStore.saveManifest("pr-review", nextManifest);
    await manifestValidationEntered.promise;

    let instructionsSaveSettled = false;
    const instructionsSave = instructionsStore
      .saveInstructions("pr-review", "# Updated Next Instructions\n\nUse the new manifest path.\n")
      .finally(() => {
        instructionsSaveSettled = true;
      });
    await setTimeout(20);
    expect(instructionsSaveSettled).toBe(false);

    releaseManifestValidation.resolve();
    await manifestSave;
    await instructionsSave;

    await expect(readSkillFile(rootDir, "instructions.md")).resolves.toBe(originalInstructions);
    await expect(readSkillFile(rootDir, "next-instructions.md")).resolves.toContain("Use the new manifest path");
  });

  it("rejects unsafe manifest file paths and keeps the current manifest", async () => {
    const rootDir = await createProjectFixture();
    await writeFile(join(rootDir, "skills", "outside.md"), "outside instructions", "utf8");
    const store = new AdminSkillStore({ rootDir });
    const original = await readSkillFile(rootDir, "skill.yaml");

    await expect(
      store.saveManifest("pr-review", manifestContent({ instructions: "../outside.md", examples: [] }))
    ).rejects.toThrow("unsafe skill path");

    await expect(readSkillFile(rootDir, "skill.yaml")).resolves.toBe(original);
  });

  it("saves non-empty instructions and backs up the previous instructions", async () => {
    const rootDir = await createProjectFixture();
    const store = new AdminSkillStore({ rootDir });
    const original = await readSkillFile(rootDir, "instructions.md");

    await expect(store.saveInstructions("pr-review", "   ")).rejects.toThrow("instructions cannot be empty");
    await store.saveInstructions("pr-review", "# Updated\n\nUse concrete findings.\n");

    await expect(readSkillFile(rootDir, "instructions.md")).resolves.toContain("Use concrete findings");
    const backups = await backupFiles(rootDir, "instructions");
    expect(backups).toHaveLength(1);
    await expect(
      readFile(join(rootDir, ".data", "backups", "pr-review", "instructions", backups[0]), "utf8")
    ).resolves.toBe(original);
  });

  it("saves valid known examples and rejects unknown, traversal-like, or schema-invalid examples", async () => {
    const rootDir = await createProjectFixture();
    const store = new AdminSkillStore({ rootDir });
    const original = await readSkillFile(rootDir, "examples/basic-risk.json");
    const nextExample = exampleContent("basic risk edited", "low");

    await store.saveExample("pr-review", "basic-risk.json", nextExample);
    await expect(store.saveExample("pr-review", "../skill.yaml", nextExample)).rejects.toThrow("unknown example");
    await expect(store.saveExample("pr-review", "missing.json", nextExample)).rejects.toThrow("unknown example");
    await expect(
      store.saveExample("pr-review", "basic-risk.json", JSON.stringify({ name: "missing expected", inputs: {} }))
    ).rejects.toThrow();

    await expect(readSkillFile(rootDir, "examples/basic-risk.json")).resolves.toContain("basic risk edited");
    const backupTarget = `example:${encodeURIComponent("examples/basic-risk.json")}`;
    const backups = await backupFiles(rootDir, backupTarget);
    expect(backups).toHaveLength(1);
    await expect(
      readFile(join(rootDir, ".data", "backups", "pr-review", backupTarget, backups[0]), "utf8")
    ).resolves.toBe(original);
  });

  it("addresses duplicate example basenames by exact manifest path", async () => {
    const rootDir = await createProjectFixture();
    await mkdir(join(rootDir, "skills", "pr-review", "examples", "a"), { recursive: true });
    await mkdir(join(rootDir, "skills", "pr-review", "examples", "b"), { recursive: true });
    await writeFile(
      join(rootDir, "skills", "pr-review", "examples", "a", "duplicate.json"),
      exampleContent("duplicate a", "low"),
      "utf8"
    );
    await writeFile(
      join(rootDir, "skills", "pr-review", "examples", "b", "duplicate.json"),
      exampleContent("duplicate b", "medium"),
      "utf8"
    );
    await writeFile(
      join(rootDir, "skills", "pr-review", "skill.yaml"),
      manifestContent({
        examples: ["examples/a/duplicate.json", "examples/b/duplicate.json"]
      }),
      "utf8"
    );
    const store = new AdminSkillStore({ rootDir });
    const nextExample = exampleContent("duplicate b edited", "high");

    const editor = await store.getEditor("pr-review");
    expect(editor.examples.map((example) => example.name)).toEqual(["duplicate.json", "duplicate.json"]);
    expect(editor.examples.map((example) => example.filename)).toEqual([
      "examples/a/duplicate.json",
      "examples/b/duplicate.json"
    ]);

    await expect(store.saveExample("pr-review", "duplicate.json", nextExample)).rejects.toThrow(
      "ambiguous example: duplicate.json"
    );
    await store.saveExample("pr-review", "examples/b/duplicate.json", nextExample);

    await expect(readSkillFile(rootDir, "examples/a/duplicate.json")).resolves.toContain("duplicate a");
    await expect(readSkillFile(rootDir, "examples/b/duplicate.json")).resolves.toContain("duplicate b edited");
  });

  it("restores the newest backup for manifests, instructions, and examples", async () => {
    const rootDir = await createProjectFixture();
    const store = new AdminSkillStore({ rootDir });
    const manifestA = manifestContent({ name: "Manifest A", version: "0.1.1" });
    const manifestB = manifestContent({ name: "Manifest B", version: "0.1.2" });
    const instructionsA = "# Instructions A\n\nIntermediate content.\n";
    const instructionsB = "# Instructions B\n\nNewest content.\n";
    const exampleA = exampleContent("example a", "low");
    const exampleB = exampleContent("example b", "high");

    await store.saveManifest("pr-review", manifestA);
    await store.saveManifest("pr-review", manifestB);
    await store.restoreLatest("pr-review", "manifest");
    await store.saveInstructions("pr-review", instructionsA);
    await store.saveInstructions("pr-review", instructionsB);
    await store.restoreLatest("pr-review", "instructions");
    await store.saveExample("pr-review", "examples/basic-risk.json", exampleA);
    await store.saveExample("pr-review", "examples/basic-risk.json", exampleB);
    await store.restoreLatest("pr-review", "example:examples/basic-risk.json");

    await expect(readSkillFile(rootDir, "skill.yaml")).resolves.toBe(manifestA);
    await expect(readSkillFile(rootDir, "instructions.md")).resolves.toBe(instructionsA);
    await expect(readSkillFile(rootDir, "examples/basic-risk.json")).resolves.toBe(exampleA);
  });

  it("rolls back the current file when restoring a backup that fails revalidation", async () => {
    const rootDir = await createProjectFixture();
    const store = new AdminSkillStore({ rootDir });
    const current = manifestContent({ name: "Current Manifest", version: "0.1.1" });

    await store.saveManifest("pr-review", current);
    await writeFile(
      join(rootDir, ".data", "backups", "pr-review", "manifest", "9999-12-31T00-00-00-000Z-skill.yaml"),
      manifestContent({ examples: ["examples/missing.json"] }),
      "utf8"
    );

    await expect(store.restoreLatest("pr-review", "manifest")).rejects.toThrow();

    await expect(readSkillFile(rootDir, "skill.yaml")).resolves.toBe(current);
  });

  it("rejects traversal-like skill ids before resolving skill files", async () => {
    const rootDir = await createProjectFixture();
    const store = new AdminSkillStore({ rootDir });

    await expect(store.getEditor("../pr-review")).rejects.toThrow("invalid skill id");
  });

  it("rejects symlinked files inside the skill directory before reading editable content", async () => {
    const rootDir = await createProjectFixture();
    await writeFile(join(rootDir, "outside-instructions.md"), "outside instructions", "utf8");
    await rm(join(rootDir, "skills", "pr-review", "instructions.md"));
    await symlink(join(rootDir, "outside-instructions.md"), join(rootDir, "skills", "pr-review", "instructions.md"));
    const store = new AdminSkillStore({ rootDir });

    await expect(store.getEditor("pr-review")).rejects.toThrow("unsafe skill path");
  });
});
