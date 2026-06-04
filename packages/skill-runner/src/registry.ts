/// <reference types="node" />

import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import YAML from "yaml";
import {
  type SkillEvaluationCase,
  type SkillManifest,
  skillEvaluationCaseSchema,
  skillManifestSchema
} from "@llm-skills-poc/skill-spec";
import { resolveSkillsDir } from "./paths.js";

export interface LoadedSkill {
  manifest: SkillManifest;
  instructions: string;
  examples: SkillEvaluationCase[];
  directory: string;
}

export interface FileSkillRegistryOptions {
  rootDir?: string;
  skillsDir?: string;
}

export class FileSkillRegistry {
  private readonly skillsDir: string;

  constructor(options: FileSkillRegistryOptions = {}) {
    this.skillsDir = options.skillsDir ? resolve(options.skillsDir) : resolveSkillsDir(options.rootDir);
  }

  async listSkills(): Promise<SkillManifest[]> {
    const entries = await readdir(this.skillsDir, { withFileTypes: true });
    const manifests = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => this.readManifest(join(this.skillsDir, entry.name)))
    );
    return manifests.sort((left, right) => left.id.localeCompare(right.id));
  }

  async getSkill(skillId: string): Promise<LoadedSkill> {
    const directory = join(this.skillsDir, skillId);
    let manifest: SkillManifest;

    try {
      manifest = await this.readManifest(directory);
    } catch (error) {
      if (error instanceof Error && "code" in error && (error as { code?: unknown }).code === "ENOENT") {
        throw new Error(`Skill not found: ${skillId}`);
      }
      throw error;
    }

    if (manifest.id !== skillId) {
      throw new Error(`Skill id mismatch: requested ${skillId}, manifest declares ${manifest.id}`);
    }

    const instructions = await readFile(join(directory, manifest.instructions), "utf8");
    const examples = await Promise.all(
      manifest.examples.map(async (examplePath) => {
        const raw = await readFile(join(directory, examplePath), "utf8");
        return skillEvaluationCaseSchema.parse(JSON.parse(raw));
      })
    );

    return { manifest, instructions, examples, directory };
  }

  private async readManifest(directory: string): Promise<SkillManifest> {
    const raw = await readFile(join(directory, "skill.yaml"), "utf8");
    return skillManifestSchema.parse(YAML.parse(raw));
  }
}
