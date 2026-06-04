/// <reference types="node" />

import { randomUUID } from "node:crypto";
import { lstat, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import YAML from "yaml";
import {
  skillEvaluationCaseSchema,
  skillManifestSchema,
  type SkillManifest
} from "@llm-skills-poc/skill-spec";
import {
  FileSkillRegistry,
  resolveDataDir,
  resolveSkillsDir,
  type LoadedSkill
} from "@llm-skills-poc/skill-runner";

export type RestoreTarget = "manifest" | "instructions" | `example:${string}`;

export interface AdminSkillStoreOptions {
  rootDir?: string;
}

export interface EditableFile {
  filename: string;
  content: string;
}

export interface EditableExample extends EditableFile {
  name: string;
}

export interface SkillEditorPayload {
  skill_id: string;
  manifest: EditableFile;
  instructions: EditableFile;
  examples: EditableExample[];
}

interface ResolvedTarget {
  backupTarget: RestoreTarget;
  filePath: string;
}

const skillIdPattern = /^[a-z0-9][a-z0-9-]*$/;
const mutationLocks = new Map<string, Promise<void>>();

async function withMutationLock<T>(lockKey: string, operation: () => Promise<T>): Promise<T> {
  const previous = mutationLocks.get(lockKey) ?? Promise.resolve();
  let releaseCurrent!: () => void;
  const current = new Promise<void>((resolveCurrent) => {
    releaseCurrent = resolveCurrent;
  });
  const queued = previous.catch(() => undefined).then(() => current);
  mutationLocks.set(lockKey, queued);

  await previous.catch(() => undefined);

  try {
    return await operation();
  } finally {
    releaseCurrent();
    if (mutationLocks.get(lockKey) === queued) {
      mutationLocks.delete(lockKey);
    }
  }
}

export class AdminSkillStore {
  private readonly rootDir?: string;
  private readonly skillsDir: string;
  private readonly dataDir: string;
  private backupSequence = 0;

  constructor(options: AdminSkillStoreOptions = {}) {
    this.rootDir = options.rootDir;
    this.skillsDir = resolveSkillsDir(options.rootDir);
    this.dataDir = resolveDataDir(options.rootDir);
  }

  async getEditor(skillId: string): Promise<SkillEditorPayload> {
    const skill = await this.loadValidatedSkill(skillId);
    const manifestContent = await readFile(await this.safeExistingSkillPath(skillId, "skill.yaml"), "utf8");
    const instructionsContent = await readFile(
      await this.safeExistingSkillPath(skillId, skill.manifest.instructions),
      "utf8"
    );
    const examples = await Promise.all(
      skill.manifest.examples.map(async (examplePath) => ({
        name: basename(examplePath),
        filename: examplePath,
        content: await readFile(await this.safeExistingSkillPath(skillId, examplePath), "utf8")
      }))
    );

    return {
      skill_id: skill.manifest.id,
      manifest: { filename: "skill.yaml", content: manifestContent },
      instructions: { filename: skill.manifest.instructions, content: instructionsContent },
      examples
    };
  }

  async saveManifest(skillId: string, content: string): Promise<{ manifest: SkillManifest }> {
    this.parseManifestContent(skillId, content);
    return this.replaceAndValidate(skillId, "manifest", "skill.yaml", content, (skill) => ({
      manifest: skill.manifest
    }));
  }

  async saveInstructions(skillId: string, content: string): Promise<{ instructions: EditableFile }> {
    if (content.trim().length === 0) {
      throw new Error("instructions cannot be empty");
    }

    return this.withSkillMutationLock(skillId, async () => {
      const skill = await this.loadValidatedSkill(skillId);
      return this.replaceAndValidateLocked(skillId, "instructions", skill.manifest.instructions, content, () => ({
        instructions: { filename: skill.manifest.instructions, content }
      }));
    });
  }

  async saveExample(
    skillId: string,
    exampleTarget: string,
    content: string
  ): Promise<{ example: EditableExample }> {
    return this.withSkillMutationLock(skillId, async () => {
      const examplePath = await this.resolveKnownExamplePath(skillId, exampleTarget);
      skillEvaluationCaseSchema.parse(JSON.parse(content));
      return this.replaceAndValidateLocked(skillId, `example:${examplePath}`, examplePath, content, () => ({
        example: { name: basename(examplePath), filename: examplePath, content }
      }));
    });
  }

  async restoreLatest(skillId: string, target: RestoreTarget): Promise<{ restored: RestoreTarget }> {
    return this.withSkillMutationLock(skillId, async () => {
      const targetInfo = await this.resolveTarget(skillId, target);
      const backupDir = this.backupDir(skillId, targetInfo.backupTarget);
      let backups: string[];

      try {
        backups = (await readdir(backupDir)).sort();
      } catch (error) {
        if (error instanceof Error && "code" in error && (error as { code?: unknown }).code === "ENOENT") {
          throw new Error(`No backups found for ${target}`);
        }
        throw error;
      }

      if (backups.length === 0) {
        throw new Error(`No backups found for ${target}`);
      }

      const latestBackup = join(backupDir, backups[backups.length - 1]);
      const backupContent = await readFile(latestBackup, "utf8");
      this.validateRestoreContent(skillId, targetInfo, backupContent);

      return this.replaceAndValidateLocked(
        skillId,
        targetInfo.backupTarget,
        targetInfo.filePath,
        backupContent,
        () => ({
          restored: target
        })
      );
    });
  }

  private registry(): FileSkillRegistry {
    return new FileSkillRegistry({ rootDir: this.rootDir });
  }

  private async loadValidatedSkill(skillId: string): Promise<LoadedSkill> {
    this.validateSkillId(skillId);
    const manifest = await this.readSafeManifest(skillId);
    await this.validateExistingManifestPaths(skillId, manifest);
    return this.registry().getSkill(skillId);
  }

  private async readSafeManifest(skillId: string): Promise<SkillManifest> {
    try {
      const raw = await readFile(await this.safeExistingSkillPath(skillId, "skill.yaml"), "utf8");
      return this.parseManifestContent(skillId, raw);
    } catch (error) {
      if (error instanceof Error && "code" in error && (error as { code?: unknown }).code === "ENOENT") {
        throw new Error(`Skill not found: ${skillId}`);
      }
      throw error;
    }
  }

  private parseManifestContent(skillId: string, content: string): SkillManifest {
    this.validateSkillId(skillId);
    const manifest = skillManifestSchema.parse(YAML.parse(content));
    if (manifest.id !== skillId) {
      throw new Error(`manifest id must match skill id ${skillId}`);
    }
    this.validateManifestPaths(skillId, manifest);
    return manifest;
  }

  private validateManifestPaths(skillId: string, manifest: SkillManifest): void {
    this.safeSkillPath(skillId, manifest.instructions);
    for (const examplePath of manifest.examples) {
      this.safeSkillPath(skillId, examplePath);
    }
  }

  private async validateExistingManifestPaths(skillId: string, manifest: SkillManifest): Promise<void> {
    await this.safeExistingSkillPath(skillId, manifest.instructions);
    await Promise.all(manifest.examples.map((examplePath) => this.safeExistingSkillPath(skillId, examplePath)));
  }

  private validateRestoreContent(skillId: string, target: ResolvedTarget, content: string): void {
    if (target.backupTarget === "manifest") {
      this.parseManifestContent(skillId, content);
      return;
    }
    if (target.backupTarget === "instructions") {
      if (content.trim().length === 0) {
        throw new Error("instructions cannot be empty");
      }
      return;
    }
    skillEvaluationCaseSchema.parse(JSON.parse(content));
  }

  private async replaceAndValidate<T>(
    skillId: string,
    backupTarget: RestoreTarget,
    filePath: string,
    content: string,
    result: (skill: LoadedSkill) => T
  ): Promise<T> {
    return this.withSkillMutationLock(skillId, () =>
      this.replaceAndValidateLocked(skillId, backupTarget, filePath, content, result)
    );
  }

  private async replaceAndValidateLocked<T>(
    skillId: string,
    backupTarget: RestoreTarget,
    filePath: string,
    content: string,
    result: (skill: LoadedSkill) => T
  ): Promise<T> {
    const absolutePath = await this.safeExistingSkillPath(skillId, filePath);
    const original = await readFile(absolutePath, "utf8");

    await this.writeBackup(skillId, backupTarget, basename(filePath), original);
    await this.writeAtomically(absolutePath, content);

    try {
      const skill = await this.loadValidatedSkill(skillId);
      return result(skill);
    } catch (error) {
      await this.writeAtomically(absolutePath, original);
      throw error;
    }
  }

  private async withSkillMutationLock<T>(skillId: string, operation: () => Promise<T>): Promise<T> {
    this.validateSkillId(skillId);
    return withMutationLock(`skill:${skillId}`, operation);
  }

  private async writeBackup(
    skillId: string,
    target: RestoreTarget,
    filename: string,
    content: string
  ): Promise<void> {
    const dir = this.backupDir(skillId, target);
    await mkdir(dir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const sequence = String(++this.backupSequence).padStart(6, "0");
    await writeFile(join(dir, `${timestamp}-${sequence}-${randomUUID()}-${filename}`), content, "utf8");
  }

  private async writeAtomically(absolutePath: string, content: string): Promise<void> {
    const tempPath = join(dirname(absolutePath), `.${basename(absolutePath)}.${randomUUID()}.tmp`);
    try {
      await writeFile(tempPath, content, "utf8");
      await rename(tempPath, absolutePath);
    } catch (error) {
      await rm(tempPath, { force: true });
      throw error;
    }
  }

  private backupDir(skillId: string, target: RestoreTarget): string {
    this.validateSkillId(skillId);
    return join(this.dataDir, "backups", skillId, this.backupDirectoryName(target));
  }

  private backupDirectoryName(target: RestoreTarget): string {
    if (target.startsWith("example:")) {
      return `example:${encodeURIComponent(target.slice("example:".length))}`;
    }
    return target;
  }

  private async resolveKnownExamplePath(skillId: string, exampleTarget: string): Promise<string> {
    const skill = await this.loadValidatedSkill(skillId);
    const exactExample = skill.manifest.examples.find((examplePath) => examplePath === exampleTarget);
    if (exactExample) {
      this.safeSkillPath(skillId, exactExample);
      return exactExample;
    }

    if (exampleTarget === basename(exampleTarget) && !exampleTarget.includes("/") && !exampleTarget.includes("\\")) {
      const basenameMatches = skill.manifest.examples.filter((examplePath) => basename(examplePath) === exampleTarget);
      if (basenameMatches.length === 1) {
        this.safeSkillPath(skillId, basenameMatches[0]);
        return basenameMatches[0];
      }
      if (basenameMatches.length > 1) {
        throw new Error(`ambiguous example: ${exampleTarget}`);
      }
    }

    throw new Error(`unknown example: ${exampleTarget}`);
  }

  private async resolveTarget(skillId: string, target: RestoreTarget): Promise<ResolvedTarget> {
    this.validateSkillId(skillId);
    if (target === "manifest") {
      return { backupTarget: "manifest", filePath: "skill.yaml" };
    }
    if (target === "instructions") {
      const skill = await this.loadValidatedSkill(skillId);
      return { backupTarget: "instructions", filePath: skill.manifest.instructions };
    }
    if (target.startsWith("example:")) {
      const exampleTarget = target.slice("example:".length);
      const examplePath = await this.resolveKnownExamplePath(skillId, exampleTarget);
      return { backupTarget: `example:${examplePath}`, filePath: examplePath };
    }
    throw new Error(`unsupported restore target: ${target}`);
  }

  private validateSkillId(skillId: string): void {
    if (!skillIdPattern.test(skillId)) {
      throw new Error(`invalid skill id: ${skillId}`);
    }
  }

  private skillDir(skillId: string): string {
    this.validateSkillId(skillId);
    const directory = resolve(this.skillsDir, skillId);
    const pathFromSkillsDir = relative(this.skillsDir, directory);
    if (pathFromSkillsDir === "" || pathFromSkillsDir.startsWith("..") || isAbsolute(pathFromSkillsDir)) {
      throw new Error(`invalid skill id: ${skillId}`);
    }
    return directory;
  }

  private safeSkillPath(skillId: string, filePath: string): string {
    if (isAbsolute(filePath) || filePath.includes("\\")) {
      throw new Error(`unsafe skill path: ${filePath}`);
    }

    const baseDir = this.skillDir(skillId);
    const resolvedPath = resolve(baseDir, filePath);
    const pathFromBase = relative(baseDir, resolvedPath);
    if (pathFromBase === "" || pathFromBase.startsWith("..") || isAbsolute(pathFromBase)) {
      throw new Error(`unsafe skill path: ${filePath}`);
    }
    return resolvedPath;
  }

  private async safeExistingSkillPath(skillId: string, filePath: string): Promise<string> {
    const resolvedPath = this.safeSkillPath(skillId, filePath);
    await this.rejectSymlinkInSkillPath(skillId, resolvedPath, filePath);
    return resolvedPath;
  }

  private async rejectSymlinkInSkillPath(skillId: string, resolvedPath: string, filePath: string): Promise<void> {
    const baseDir = this.skillDir(skillId);
    let currentPath = baseDir;

    if ((await lstat(currentPath)).isSymbolicLink()) {
      throw new Error(`unsafe skill path: ${filePath}`);
    }

    const pathFromBase = relative(baseDir, resolvedPath);
    for (const segment of pathFromBase.split("/").filter(Boolean)) {
      currentPath = join(currentPath, segment);
      if ((await lstat(currentPath)).isSymbolicLink()) {
        throw new Error(`unsafe skill path: ${filePath}`);
      }
    }
  }
}
