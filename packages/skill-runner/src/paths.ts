/// <reference types="node" />

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const thisFile = fileURLToPath(import.meta.url);
const packageRoot = resolve(dirname(thisFile), "..");

export function resolveProjectRoot(explicitRoot?: string): string {
  if (explicitRoot) {
    return resolve(explicitRoot);
  }
  if (process.env.SKILLS_PROJECT_ROOT) {
    return resolve(process.env.SKILLS_PROJECT_ROOT);
  }
  return resolve(packageRoot, "..", "..");
}

export function resolveSkillsDir(rootDir?: string): string {
  return resolve(resolveProjectRoot(rootDir), "skills");
}

export function resolveDataDir(rootDir?: string): string {
  return resolve(resolveProjectRoot(rootDir), ".data");
}
