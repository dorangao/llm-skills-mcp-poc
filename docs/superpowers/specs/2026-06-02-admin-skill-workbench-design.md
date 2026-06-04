# Admin Skill Workbench Design

## Goal

Add a local admin UI for verifying and operating the file-backed Shared Skills API through HTTP. The UI should let an operator inspect, edit, validate, run, evaluate, and audit the existing `pr-review` skill without touching files manually.

## Scope

This is a first workbench for the existing file-backed registry, not a general multi-tenant production admin system.

In scope:
- Serve a compact `/admin` workbench from the existing Express API.
- Load available skills through the API.
- Edit and persist `skill.yaml`, `instructions.md`, and packaged example JSON files.
- Validate edited content before writing to disk.
- Create timestamped backups before every write.
- Restore from the latest backup for a skill file.
- Run `pr-review`, evaluate examples, and inspect redacted audit events from the same page.

Out of scope:
- Authentication and authorization.
- Creating or deleting skills.
- Creating or deleting example files.
- Editing arbitrary files outside `skills/<skillId>`.
- Replacing the deterministic runner with an LLM-backed runner.

## Architecture

Use the current Express app as both API and UI host. Add a small admin module under `apps/api/src` with:
- Static HTML/CSS/JS for `/admin`.
- Admin read/write route handlers.
- File helpers for safe path resolution, atomic writes, and backup/restore.

The UI remains framework-free vanilla HTML, CSS, and JavaScript. This avoids adding a frontend build chain to a small TypeScript/Node POC and keeps Docker unchanged aside from copying the new API source during the existing build.

## Admin API

Read endpoints:
- `GET /admin/skills/:skillId/editor` returns editable text for the manifest, instructions, and examples.
- Existing `GET /skills`, `GET /skills/:skillId`, `POST /skills/:skillId/run`, `POST /skills/:skillId/evaluate`, and `GET /skills/:skillId/audit` continue to power verification and operations.

Write endpoints:
- `PUT /admin/skills/:skillId/manifest`
- `PUT /admin/skills/:skillId/instructions`
- `PUT /admin/skills/:skillId/examples/:exampleName`
- `POST /admin/skills/:skillId/restore`

The write payload shape is JSON:

```json
{ "content": "raw file content" }
```

For restore:

```json
{ "target": "manifest" }
```

`target` may be `manifest`, `instructions`, or `example:<exampleName>`.

## Validation

Manifest writes parse YAML and validate with the existing `skillManifestSchema`. The manifest `id` must match the URL `skillId`.

Instruction writes must be non-empty text. They are not markdown-rendered server-side.

Example writes parse JSON and validate with the existing `skillEvaluationCaseSchema`.

After a successful write, the affected skill must still load through `FileSkillRegistry.getSkill(skillId)`. If registry validation fails, the write is rejected and the original file remains in place.

## Persistence And Backups

All writes are scoped to the resolved `skills/<skillId>` directory. The API must reject path traversal and unknown example names.

Before replacing a file, write a timestamped backup under:

```text
.data/backups/<skillId>/<target>/<timestamp>-<filename>
```

Writes should use a temporary file in the same directory followed by rename so partially written files are not observed.

`POST /admin/skills/:skillId/restore` restores the newest backup for the requested target, then revalidates the skill through the registry. If validation fails, the restore is rejected and the current file remains in place.

## UI Design

The `/admin` screen is an operator workbench:
- Header with API health, selected skill, and last refresh time.
- Left sidebar with available skills and quick status.
- Main editor area with tabs for Manifest, Instructions, and Examples.
- Validation panel showing parse/load status and write errors.
- Operations panel with run input fields for `repo`, `diff`, and `risk_level`.
- Buttons for Save, Restore Latest Backup, Run, Evaluate, Refresh Audit.
- Result panel showing the latest run result, evaluation cases, and redacted audit events.

The UI should be dense but readable, closer to an internal tool than a marketing dashboard. Controls should remain visible without scrolling on a laptop-sized viewport when practical.

## Error Handling

API errors return JSON `{ "error": "..." }` with:
- `400` for invalid payloads or validation failures.
- `404` for missing skills or examples.
- `500` only for unexpected filesystem or runtime failures.

The UI shows errors inline in the validation panel and does not clear unsaved editor content when a save fails.

## Testing

Add API tests for:
- Loading editor content for `pr-review`.
- Saving a valid manifest and seeing the updated manifest through `GET /skills/:skillId`.
- Rejecting invalid YAML or mismatched manifest IDs without modifying the file.
- Saving instructions.
- Saving a valid example JSON.
- Rejecting unknown example names and traversal-like names.
- Creating backups before writes.
- Restoring the newest backup.

Add UI smoke coverage through Supertest for:
- `GET /admin` returns HTML.
- The page includes the root admin app element and script.

Run full verification:
- `npm test`
- `npm run build`
- Local API smoke for `/admin`
- Browser verification of the workbench loading and operating against the API
- Docker smoke after the API source changes

## Success Criteria

- An operator can open `/admin`, select `pr-review`, edit skill files, save valid changes, see invalid changes rejected, restore the latest backup, run the skill, evaluate examples, and inspect redacted audit events.
- All edits go through API validation and stay inside the file-backed skill directory.
- Existing HTTP Registry API and MCP behavior continue to pass their tests.
