export const adminPageHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Shared Skills Admin</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f6f7f9;
        --panel: #ffffff;
        --panel-border: #d7dce2;
        --text: #17202a;
        --muted: #5f6b7a;
        --accent: #1769aa;
        --accent-strong: #0f4f83;
        --danger: #a33b2f;
        --ok: #1f7a4d;
        --control: #eef2f6;
        --control-border: #c8d0da;
        --code: #111827;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-width: 320px;
        background: var(--bg);
        color: var(--text);
        font: 14px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      button,
      input,
      select,
      textarea {
        font: inherit;
      }

      button {
        min-height: 34px;
        border: 1px solid var(--control-border);
        border-radius: 6px;
        background: var(--control);
        color: var(--text);
        cursor: pointer;
        padding: 7px 11px;
      }

      button:hover {
        border-color: #9ba8b7;
      }

      button.primary {
        border-color: var(--accent);
        background: var(--accent);
        color: #ffffff;
      }

      button.primary:hover {
        border-color: var(--accent-strong);
        background: var(--accent-strong);
      }

      button:disabled {
        cursor: not-allowed;
        opacity: 0.6;
      }

      label {
        display: grid;
        gap: 6px;
        color: var(--muted);
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
      }

      input,
      select,
      textarea {
        width: 100%;
        border: 1px solid var(--control-border);
        border-radius: 6px;
        background: #ffffff;
        color: var(--text);
        padding: 8px 10px;
      }

      textarea {
        resize: vertical;
      }

      pre,
      textarea {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        font-size: 12px;
        line-height: 1.5;
      }

      .topbar {
        position: sticky;
        top: 0;
        z-index: 10;
        display: grid;
        grid-template-columns: minmax(180px, 1fr) auto;
        gap: 16px;
        align-items: center;
        min-height: 64px;
        border-bottom: 1px solid var(--panel-border);
        background: #ffffff;
        padding: 12px 18px;
      }

      .product {
        display: flex;
        align-items: baseline;
        gap: 14px;
        min-width: 0;
      }

      .product h1 {
        margin: 0;
        color: var(--text);
        font-size: 18px;
        font-weight: 700;
        letter-spacing: 0;
        white-space: nowrap;
      }

      .topbar-meta {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 8px;
        min-width: 0;
      }

      .pill {
        display: inline-flex;
        align-items: center;
        min-height: 28px;
        max-width: 100%;
        border: 1px solid var(--panel-border);
        border-radius: 999px;
        background: #ffffff;
        color: var(--muted);
        padding: 4px 9px;
        white-space: nowrap;
      }

      .pill strong {
        color: var(--text);
        font-weight: 600;
      }

      .status-ok {
        color: var(--ok);
      }

      .status-error {
        color: var(--danger);
      }

      #admin-app {
        display: grid;
        grid-template-columns: minmax(210px, 0.78fr) minmax(420px, 1.55fr) minmax(320px, 1fr);
        gap: 14px;
        width: 100%;
        max-width: 1600px;
        margin: 0 auto;
        padding: 14px;
      }

      .panel {
        min-width: 0;
        border: 1px solid var(--panel-border);
        border-radius: 8px;
        background: var(--panel);
      }

      .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        min-height: 50px;
        border-bottom: 1px solid var(--panel-border);
        padding: 10px 12px;
      }

      .panel-header h2 {
        margin: 0;
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0;
      }

      .panel-body {
        padding: 12px;
      }

      .skill-list {
        display: grid;
        gap: 6px;
      }

      .skill-button {
        display: grid;
        width: 100%;
        min-height: 44px;
        justify-items: start;
        gap: 2px;
        border-radius: 6px;
        background: #ffffff;
        text-align: left;
      }

      .skill-button.active {
        border-color: var(--accent);
        background: #eef7fd;
      }

      .skill-name {
        max-width: 100%;
        overflow: hidden;
        color: var(--text);
        font-weight: 700;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .skill-id {
        max-width: 100%;
        overflow: hidden;
        color: var(--muted);
        font-size: 12px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        min-height: 36px;
        margin-bottom: 10px;
      }

      .tab-button {
        max-width: 180px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .tab-button.active {
        border-color: var(--accent);
        background: #e7f1fa;
        color: var(--accent-strong);
      }

      #editor-content {
        min-height: 520px;
        max-height: 68vh;
        overflow: auto;
        color: var(--code);
      }

      .editor-actions,
      .run-actions,
      .audit-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 10px;
      }

      .message {
        min-height: 22px;
        margin-top: 8px;
        color: var(--muted);
      }

      .message.error {
        color: var(--danger);
      }

      .message.success {
        color: var(--ok);
      }

      .field-stack {
        display: grid;
        gap: 10px;
      }

      #run-diff {
        min-height: 140px;
        max-height: 34vh;
      }

      .json-panel {
        min-height: 220px;
        max-height: 38vh;
        overflow: auto;
        border: 1px solid var(--control-border);
        border-radius: 6px;
        background: #fbfcfd;
        color: var(--code);
        margin: 0;
        padding: 10px;
        white-space: pre-wrap;
        word-break: break-word;
      }

      .result-stack {
        display: grid;
        gap: 12px;
      }

      .subheading {
        margin: 0 0 6px;
        color: var(--muted);
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
      }

      @media (max-width: 1100px) {
        #admin-app {
          grid-template-columns: minmax(220px, 0.8fr) minmax(420px, 1.2fr);
        }

        .right-rail {
          grid-column: 1 / -1;
        }
      }

      @media (max-width: 760px) {
        .topbar {
          position: static;
          grid-template-columns: 1fr;
        }

        .product,
        .topbar-meta {
          justify-content: flex-start;
        }

        #admin-app {
          grid-template-columns: 1fr;
          padding: 10px;
        }

        #editor-content {
          min-height: 380px;
        }
      }
    </style>
  </head>
  <body>
    <header class="topbar">
      <div class="product">
        <h1>Shared Skills Admin</h1>
      </div>
      <div class="topbar-meta">
        <span class="pill">Health: <strong id="health-status">checking</strong></span>
        <span class="pill">Skill: <strong id="selected-skill">none</strong></span>
        <span class="pill">Last refresh: <strong id="last-refresh">never</strong></span>
        <button id="refresh-page" type="button">Refresh</button>
      </div>
    </header>

    <main id="admin-app">
      <section class="panel">
        <div class="panel-header">
          <h2>Skills</h2>
        </div>
        <div class="panel-body">
          <div id="skill-list" class="skill-list" data-testid="skill-list"></div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <h2>Editor</h2>
        </div>
        <div class="panel-body">
          <div id="editor-tabs" class="tabs"></div>
          <textarea id="editor-content" data-testid="manifest-editor" spellcheck="false"></textarea>
          <div class="editor-actions">
            <button id="save-editor" class="primary" type="button">Save</button>
            <button id="restore-editor" type="button">Restore Latest Backup</button>
          </div>
          <div id="editor-message" class="message" role="status"></div>
        </div>
      </section>

      <aside class="panel right-rail">
        <div class="panel-header">
          <h2>Run</h2>
        </div>
        <div class="panel-body field-stack">
          <label>
            Repo
            <input id="run-repo" type="text" value="checkout-service" />
          </label>
          <label>
            Risk
            <select id="run-risk">
              <option value="low">low</option>
              <option value="medium" selected>medium</option>
              <option value="high">high</option>
            </select>
          </label>
          <label>
            Diff
            <textarea id="run-diff" spellcheck="false">diff --git a/src/payment.ts b/src/payment.ts
+export function charge() { return payment.charge(); }</textarea>
          </label>
          <div class="run-actions">
            <button id="run-skill" class="primary" data-testid="run-skill" type="button">Run</button>
            <button id="evaluate-skill" type="button">Evaluate</button>
          </div>
          <div class="result-stack">
            <div>
              <p class="subheading">Result</p>
              <pre id="result-panel" class="json-panel">{}</pre>
            </div>
            <div>
              <div class="audit-actions">
                <p class="subheading">Audit</p>
                <button id="refresh-audit" type="button">Refresh Audit</button>
              </div>
              <pre id="audit-panel" class="json-panel" data-testid="audit-panel">[]</pre>
            </div>
          </div>
        </div>
      </aside>
    </main>

    <script type="module">
      const state = {
        skills: [],
        selectedSkillId: "",
        editor: null,
        tabs: [],
        activeTarget: null
      };

      const elements = {
        healthStatus: document.getElementById("health-status"),
        selectedSkill: document.getElementById("selected-skill"),
        lastRefresh: document.getElementById("last-refresh"),
        refreshPage: document.getElementById("refresh-page"),
        skillList: document.getElementById("skill-list"),
        editorTabs: document.getElementById("editor-tabs"),
        editorContent: document.getElementById("editor-content"),
        saveEditor: document.getElementById("save-editor"),
        restoreEditor: document.getElementById("restore-editor"),
        editorMessage: document.getElementById("editor-message"),
        runRepo: document.getElementById("run-repo"),
        runRisk: document.getElementById("run-risk"),
        runDiff: document.getElementById("run-diff"),
        runSkill: document.getElementById("run-skill"),
        evaluateSkill: document.getElementById("evaluate-skill"),
        resultPanel: document.getElementById("result-panel"),
        auditPanel: document.getElementById("audit-panel"),
        refreshAudit: document.getElementById("refresh-audit")
      };

      function setBusy(isBusy) {
        elements.saveEditor.disabled = isBusy || !state.activeTarget;
        elements.restoreEditor.disabled = isBusy || !state.activeTarget;
        elements.runSkill.disabled = isBusy || !state.selectedSkillId;
        elements.evaluateSkill.disabled = isBusy || !state.selectedSkillId;
        elements.refreshAudit.disabled = isBusy || !state.selectedSkillId;
      }

      function setLastRefresh() {
        elements.lastRefresh.textContent = new Date().toLocaleTimeString();
      }

      function setEditorMessage(message, type) {
        elements.editorMessage.textContent = message || "";
        elements.editorMessage.className = "message" + (type ? " " + type : "");
      }

      function clearEditorState() {
        state.editor = null;
        state.tabs = [];
        state.activeTarget = null;
        elements.editorTabs.textContent = "";
        elements.editorContent.value = "";
      }

      function pretty(value) {
        return JSON.stringify(value, null, 2);
      }

      function skillName(skill) {
        if (skill && skill.name) {
          return skill.name;
        }
        if (skill && skill.manifest && skill.manifest.name) {
          return skill.manifest.name;
        }
        return skill && skill.id ? skill.id : "Unnamed skill";
      }

      function skillId(skill) {
        if (skill && skill.id) {
          return skill.id;
        }
        return skill && skill.manifest && skill.manifest.id ? skill.manifest.id : "";
      }

      async function requestJson(url, options) {
        const response = await fetch(url, options);
        const text = await response.text();
        let body = null;
        if (text) {
          try {
            body = JSON.parse(text);
          } catch (_error) {
            body = { error: text };
          }
        }
        if (!response.ok) {
          const message = body && body.error ? body.error : response.status + " " + response.statusText;
          throw new Error(message);
        }
        return body;
      }

      async function loadHealth() {
        try {
          const health = await requestJson("/healthz");
          elements.healthStatus.textContent = health && health.ok ? "ok" : "unknown";
          elements.healthStatus.className = health && health.ok ? "status-ok" : "status-error";
        } catch (error) {
          elements.healthStatus.textContent = error.message;
          elements.healthStatus.className = "status-error";
        }
      }

      async function loadSkills() {
        const response = await requestJson("/skills");
        state.skills = Array.isArray(response.skills) ? response.skills : [];
        renderSkills();
        const skillIds = state.skills.map((skill) => skillId(skill)).filter(Boolean);
        const nextSkillId = skillIds.includes(state.selectedSkillId) ? state.selectedSkillId : skillIds[0] || "";

        if (nextSkillId) {
          if (nextSkillId !== state.selectedSkillId) {
            state.selectedSkillId = "";
            elements.selectedSkill.textContent = "none";
            clearEditorState();
          }
          await selectSkill(nextSkillId);
        } else {
          state.selectedSkillId = "";
          elements.selectedSkill.textContent = "none";
          clearEditorState();
          elements.auditPanel.textContent = "[]";
          setBusy(false);
        }
      }

      function renderSkills() {
        elements.skillList.textContent = "";
        if (state.skills.length === 0) {
          const empty = document.createElement("div");
          empty.className = "message";
          empty.textContent = "No skills found";
          elements.skillList.appendChild(empty);
          return;
        }

        for (const skill of state.skills) {
          const id = skillId(skill);
          const button = document.createElement("button");
          button.type = "button";
          button.className = "skill-button" + (id === state.selectedSkillId ? " active" : "");
          button.dataset.skillId = id;

          const nameNode = document.createElement("span");
          nameNode.className = "skill-name";
          nameNode.textContent = skillName(skill);
          const idNode = document.createElement("span");
          idNode.className = "skill-id";
          idNode.textContent = id;

          button.append(nameNode, idNode);
          button.addEventListener("click", () => {
            selectSkill(id);
          });
          elements.skillList.appendChild(button);
        }
      }

      async function selectSkill(skillIdValue) {
        if (!skillIdValue) {
          return;
        }
        const previousSelection = state.selectedSkillId;
        const previousEditor = state.editor;
        const previousTabs = state.tabs;
        const previousActiveTarget = state.activeTarget;
        if (previousActiveTarget) {
          previousActiveTarget.content = elements.editorContent.value;
        }
        setBusy(true);
        setEditorMessage("", "");
        clearEditorState();
        elements.selectedSkill.textContent = "loading";
        try {
          const nextEditorState = await fetchEditorState(
            skillIdValue,
            previousActiveTarget && previousActiveTarget.target
          );
          state.selectedSkillId = skillIdValue;
          elements.selectedSkill.textContent = skillIdValue;
          state.editor = nextEditorState.editor;
          state.tabs = nextEditorState.tabs;
          setActiveTab(nextEditorState.activeTab);
          renderSkills();
          renderTabs();
          await refreshAudit();
          setLastRefresh();
        } catch (error) {
          state.selectedSkillId = previousSelection;
          elements.selectedSkill.textContent = previousSelection || "none";
          state.editor = previousEditor;
          state.tabs = previousTabs;
          state.activeTarget = previousActiveTarget;
          elements.editorContent.value = previousActiveTarget ? previousActiveTarget.content : "";
          renderSkills();
          renderTabs();
          setEditorMessage(error.message, "error");
        } finally {
          setBusy(false);
        }
      }

      async function fetchEditorState(skillIdValue, preferredTarget) {
        const editor = await requestJson("/admin/skills/" + encodeURIComponent(skillIdValue) + "/editor");
        const tabs = [
          {
            label: "Manifest",
            target: "manifest",
            endpoint: "/admin/skills/" + encodeURIComponent(skillIdValue) + "/manifest",
            content: editor.manifest && typeof editor.manifest.content === "string" ? editor.manifest.content : ""
          },
          {
            label: "Instructions",
            target: "instructions",
            endpoint: "/admin/skills/" + encodeURIComponent(skillIdValue) + "/instructions",
            content:
              editor.instructions && typeof editor.instructions.content === "string" ? editor.instructions.content : ""
          }
        ];

        const examples = Array.isArray(editor.examples) ? editor.examples : [];
        for (const example of examples) {
          const exampleTarget = example && example.filename ? example.filename : example && example.name;
          if (!exampleTarget) {
            continue;
          }
          tabs.push({
            label: example.name || exampleTarget,
            target: "example:" + exampleTarget,
            endpoint:
              "/admin/skills/" +
              encodeURIComponent(skillIdValue) +
              "/examples/" +
              encodeURIComponent(exampleTarget),
            content: typeof example.content === "string" ? example.content : ""
          });
        }

        const activeTab = tabs.find((tab) => tab.target === preferredTarget) || tabs[0] || null;
        return { editor, tabs, activeTab };
      }

      async function loadEditor(skillIdValue) {
        const nextEditorState = await fetchEditorState(
          skillIdValue,
          state.activeTarget && state.activeTarget.target
        );
        state.editor = nextEditorState.editor;
        state.tabs = nextEditorState.tabs;
        setActiveTab(nextEditorState.activeTab);
        renderTabs();
      }

      function renderTabs() {
        elements.editorTabs.textContent = "";
        for (const tab of state.tabs) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "tab-button" + (state.activeTarget === tab ? " active" : "");
          button.textContent = tab.label;
          button.title = tab.label;
          button.addEventListener("click", () => {
            if (state.activeTarget) {
              state.activeTarget.content = elements.editorContent.value;
            }
            setActiveTab(tab);
            renderTabs();
          });
          elements.editorTabs.appendChild(button);
        }
      }

      function setActiveTab(tab) {
        state.activeTarget = tab;
        elements.editorContent.value = tab ? tab.content : "";
      }

      async function saveEditor() {
        if (!state.activeTarget) {
          return;
        }
        setBusy(true);
        setEditorMessage("Saving...", "");
        const content = elements.editorContent.value;
        try {
          await requestJson(state.activeTarget.endpoint, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content })
          });
          await loadEditor(state.selectedSkillId);
          setEditorMessage("Saved", "success");
          setLastRefresh();
        } catch (error) {
          elements.editorContent.value = content;
          setEditorMessage(error.message, "error");
        } finally {
          setBusy(false);
        }
      }

      async function restoreEditor() {
        if (!state.activeTarget) {
          return;
        }
        setBusy(true);
        setEditorMessage("Restoring...", "");
        try {
          await requestJson("/admin/skills/" + encodeURIComponent(state.selectedSkillId) + "/restore", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ target: state.activeTarget.target })
          });
          await loadEditor(state.selectedSkillId);
          setEditorMessage("Restored latest backup", "success");
          setLastRefresh();
        } catch (error) {
          setEditorMessage(error.message, "error");
        } finally {
          setBusy(false);
        }
      }

      async function runSkill() {
        if (!state.selectedSkillId) {
          return;
        }
        setBusy(true);
        try {
          const result = await requestJson("/skills/" + encodeURIComponent(state.selectedSkillId) + "/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              client: "api",
              inputs: {
                repo: elements.runRepo.value,
                diff: elements.runDiff.value,
                risk_level: elements.runRisk.value
              }
            })
          });
          elements.resultPanel.textContent = pretty(result);
          await refreshAudit();
          setLastRefresh();
        } catch (error) {
          elements.resultPanel.textContent = pretty({ error: error.message });
        } finally {
          setBusy(false);
        }
      }

      async function evaluateSkill() {
        if (!state.selectedSkillId) {
          return;
        }
        setBusy(true);
        try {
          const result = await requestJson("/skills/" + encodeURIComponent(state.selectedSkillId) + "/evaluate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({})
          });
          elements.resultPanel.textContent = pretty(result);
          setLastRefresh();
        } catch (error) {
          elements.resultPanel.textContent = pretty({ error: error.message });
        } finally {
          setBusy(false);
        }
      }

      async function refreshAudit() {
        if (!state.selectedSkillId) {
          elements.auditPanel.textContent = "[]";
          return;
        }
        try {
          const response = await requestJson("/skills/" + encodeURIComponent(state.selectedSkillId) + "/audit");
          const events = Array.isArray(response.events) ? response.events.slice(-10) : [];
          elements.auditPanel.textContent = pretty(events);
          setLastRefresh();
        } catch (error) {
          elements.auditPanel.textContent = pretty({ error: error.message });
        }
      }

      async function refreshAll() {
        setBusy(true);
        setEditorMessage("", "");
        try {
          await loadHealth();
          await loadSkills();
          setLastRefresh();
        } catch (error) {
          setEditorMessage(error.message, "error");
        } finally {
          setBusy(false);
        }
      }

      elements.refreshPage.addEventListener("click", refreshAll);
      elements.saveEditor.addEventListener("click", saveEditor);
      elements.restoreEditor.addEventListener("click", restoreEditor);
      elements.runSkill.addEventListener("click", runSkill);
      elements.evaluateSkill.addEventListener("click", evaluateSkill);
      elements.refreshAudit.addEventListener("click", refreshAudit);

      refreshAll();
    </script>
  </body>
</html>`;
