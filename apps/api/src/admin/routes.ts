import { Router } from "express";
import { adminPageHtml } from "./page.js";
import { AdminSkillStore, type RestoreTarget } from "./store.js";

export interface CreateAdminRouterOptions {
  rootDir?: string;
}

export function createAdminRouter(options: CreateAdminRouterOptions = {}) {
  const router = Router();
  const store = new AdminSkillStore({ rootDir: options.rootDir });

  router.get("/", (_req, res) => {
    res.type("html").send(adminPageHtml);
  });

  router.get("/skills/:skillId/editor", async (req, res, next) => {
    try {
      res.json(await store.getEditor(req.params.skillId));
    } catch (error) {
      next(error);
    }
  });

  router.put("/skills/:skillId/manifest", async (req, res, next) => {
    try {
      res.json(await store.saveManifest(req.params.skillId, parseContent(req.body)));
    } catch (error) {
      next(error);
    }
  });

  router.put("/skills/:skillId/instructions", async (req, res, next) => {
    try {
      res.json(await store.saveInstructions(req.params.skillId, parseContent(req.body)));
    } catch (error) {
      next(error);
    }
  });

  router.put("/skills/:skillId/examples/:exampleName", async (req, res, next) => {
    try {
      res.json(await store.saveExample(req.params.skillId, req.params.exampleName, parseContent(req.body)));
    } catch (error) {
      next(error);
    }
  });

  router.post("/skills/:skillId/restore", async (req, res, next) => {
    try {
      res.json(await store.restoreLatest(req.params.skillId, parseTarget(req.body)));
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function parseContent(body: unknown): string {
  if (!body || typeof body !== "object" || typeof (body as { content?: unknown }).content !== "string") {
    throw new AdminHttpError(400, "Request body must include string content");
  }
  return (body as { content: string }).content;
}

function parseTarget(body: unknown): RestoreTarget {
  if (!body || typeof body !== "object" || typeof (body as { target?: unknown }).target !== "string") {
    throw new AdminHttpError(400, "Request body must include string target");
  }

  const target = (body as { target: string }).target;
  if (target === "manifest" || target === "instructions") {
    return target;
  }
  if (target.startsWith("example:") && target.length > "example:".length) {
    return target as RestoreTarget;
  }
  throw new AdminHttpError(400, `Unsupported restore target: ${target}`);
}

class AdminHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AdminHttpError";
    this.status = status;
  }
}
