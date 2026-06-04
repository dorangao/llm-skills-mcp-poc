import express, { type ErrorRequestHandler } from "express";
import { FileSkillRegistry, SkillRunner } from "@llm-skills-poc/skill-runner";
import { createAdminRouter } from "./admin/routes.js";

export interface CreateAppOptions {
  rootDir?: string;
}

export function createApp(options: CreateAppOptions = {}) {
  const app = express();
  const registry = new FileSkillRegistry({ rootDir: options.rootDir });
  const runner = new SkillRunner({ registry, rootDir: options.rootDir });

  app.use(express.json({ limit: "1mb" }));
  app.use("/admin", createAdminRouter({ rootDir: options.rootDir }));

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/skills", async (_req, res, next) => {
    try {
      const skills = await registry.listSkills();
      res.json({ skills });
    } catch (error) {
      next(error);
    }
  });

  app.get("/skills/:skillId", async (req, res, next) => {
    try {
      const skill = await registry.getSkill(req.params.skillId);
      res.json({
        skill: {
          manifest: skill.manifest,
          examples: skill.examples
        }
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/skills/:skillId/run", async (req, res, next) => {
    try {
      const result = await runner.run(req.params.skillId, req.body);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post("/skills/:skillId/evaluate", async (req, res, next) => {
    try {
      const result = await runner.evaluate(req.params.skillId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get("/skills/:skillId/audit", async (req, res, next) => {
    try {
      await registry.getSkill(req.params.skillId);
      const events = await runner.listAudit(req.params.skillId);
      res.json({ events });
    } catch (error) {
      next(error);
    }
  });

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = classifyErrorStatus(error, message);
    res.status(status).json({ error: status === 500 ? "Internal server error" : message });
  };
  app.use(errorHandler);

  return app;
}

function classifyErrorStatus(error: unknown, message: string): number {
  const explicitStatus = errorStatus(error);
  if (explicitStatus) {
    return explicitStatus;
  }
  const normalizedMessage = message.toLowerCase();
  if (
    normalizedMessage.includes("not found") ||
    normalizedMessage.includes("unknown example") ||
    normalizedMessage.includes("no backups found")
  ) {
    return 404;
  }
  if (isKnownClientError(error, normalizedMessage)) {
    return 400;
  }
  return 500;
}

function errorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const statusError = error as { status?: unknown; statusCode?: unknown };
  const candidate = statusError.status ?? statusError.statusCode;
  if (typeof candidate === "number" && candidate >= 400 && candidate <= 599) {
    return candidate;
  }
  return undefined;
}

function isKnownClientError(error: unknown, normalizedMessage: string): boolean {
  if (error instanceof SyntaxError || errorName(error) === "ZodError" || errorName(error) === "YAMLParseError") {
    return true;
  }

  return [
    "invalid skill id:",
    "manifest id must match skill id",
    "instructions cannot be empty",
    "ambiguous example:",
    "unsafe skill path:",
    "unsupported restore target:"
  ].some((knownMessage) => normalizedMessage.includes(knownMessage));
}

function errorName(error: unknown): string | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }
  const name = (error as { name?: unknown }).name;
  return typeof name === "string" ? name : undefined;
}
