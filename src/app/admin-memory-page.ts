export function renderMemoryAdminPage(): string {
  return String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Akasha Memory Admin</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --ink: #17202a;
      --muted: #667085;
      --line: #d7dce2;
      --accent: #0f766e;
      --accent-dark: #115e59;
      --danger: #b42318;
      --danger-bg: #fff1f0;
      --focus: #2563eb;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font: 14px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 16px 24px;
      border-bottom: 1px solid var(--line);
      background: var(--panel);
    }
    h1 {
      margin: 0;
      font-size: 18px;
      font-weight: 650;
      letter-spacing: 0;
    }
    main {
      display: grid;
      grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
      min-height: calc(100vh - 65px);
    }
    aside {
      border-right: 1px solid var(--line);
      background: var(--panel);
      padding: 16px;
      overflow: auto;
    }
    section {
      padding: 18px;
      overflow: auto;
    }
    form {
      display: grid;
      gap: 12px;
    }
    fieldset {
      margin: 0;
      padding: 0;
      border: 0;
      display: grid;
      gap: 10px;
    }
    legend {
      padding: 0 0 2px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }
    label {
      display: grid;
      gap: 5px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 600;
    }
    input, select, textarea {
      width: 100%;
      min-height: 34px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #fff;
      color: var(--ink);
      padding: 7px 9px;
      font: inherit;
    }
    textarea {
      min-height: 108px;
      resize: vertical;
    }
    input:focus, select:focus, textarea:focus, button:focus {
      outline: 2px solid var(--focus);
      outline-offset: 1px;
    }
    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .checkline {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--ink);
      font-size: 13px;
    }
    .checkline input {
      width: 16px;
      min-height: 16px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    button {
      min-height: 34px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #fff;
      color: var(--ink);
      padding: 7px 11px;
      font: inherit;
      font-weight: 650;
      cursor: pointer;
    }
    button.primary {
      border-color: var(--accent);
      background: var(--accent);
      color: white;
    }
    button.primary:hover { background: var(--accent-dark); }
    button.danger {
      border-color: #f3b7b0;
      background: var(--danger-bg);
      color: var(--danger);
    }
    button:disabled {
      cursor: not-allowed;
      opacity: .55;
    }
    .status {
      min-height: 20px;
      color: var(--muted);
      font-size: 13px;
    }
    .status.error { color: var(--danger); }
    .layout {
      display: grid;
      grid-template-columns: minmax(320px, 44%) minmax(0, 1fr);
      gap: 16px;
      align-items: start;
    }
    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 10px;
    }
    .count {
      color: var(--muted);
      font-size: 13px;
    }
    .memory-list {
      display: grid;
      gap: 8px;
    }
    .memory-item {
      width: 100%;
      display: grid;
      gap: 6px;
      text-align: left;
      border: 1px solid var(--line);
      background: var(--panel);
      border-radius: 8px;
      padding: 10px;
    }
    .memory-item[aria-current="true"] {
      border-color: var(--accent);
      box-shadow: inset 3px 0 0 var(--accent);
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      color: var(--muted);
      font-size: 12px;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      min-height: 20px;
      padding: 2px 7px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: #f8fafc;
      color: #344054;
      font-size: 12px;
    }
    .detail {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
    }
    .detail h2 {
      margin: 0 0 12px;
      font-size: 16px;
      letter-spacing: 0;
    }
    .empty {
      border: 1px dashed var(--line);
      border-radius: 8px;
      padding: 24px;
      color: var(--muted);
      background: rgba(255,255,255,.6);
    }
    @media (max-width: 860px) {
      main, .layout { grid-template-columns: 1fr; }
      aside { border-right: 0; border-bottom: 1px solid var(--line); }
    }
  </style>
</head>
<body>
  <header>
    <h1>Akasha Memory Admin</h1>
    <div id="status" class="status" role="status"></div>
  </header>
  <main>
    <aside>
      <form id="filters">
        <fieldset>
          <legend>Connection</legend>
          <label>API URL<input id="apiUrl" name="apiUrl" autocomplete="off"></label>
          <label>Bearer token<input id="token" name="token" type="password" autocomplete="off"></label>
          <label>Organization<input id="organizationId" name="organizationId" autocomplete="off"></label>
        </fieldset>
        <fieldset>
          <legend>Scope</legend>
          <div class="row">
            <label>Scope
              <select id="scope" name="scope">
                <option value="project">project</option>
                <option value="user">user</option>
              </select>
            </label>
            <label>Limit<input id="limit" name="limit" type="number" min="1" max="5000" value="50"></label>
          </div>
          <label>Project key<input id="projectKey" name="projectKey" autocomplete="off"></label>
          <label>User scope<input id="userScopeId" name="userScopeId" autocomplete="off"></label>
          <label>Tag<input id="tag" name="tag" autocomplete="off"></label>
          <label class="checkline"><input id="includeArchived" name="includeArchived" type="checkbox">Include archived</label>
        </fieldset>
        <div class="actions">
          <button class="primary" type="submit">Load</button>
          <button id="clear" type="button">Clear</button>
        </div>
      </form>
    </aside>
    <section>
      <div class="toolbar">
        <div class="count" id="count">0 memories</div>
        <div class="actions">
          <button id="reload" type="button">Reload</button>
        </div>
      </div>
      <div class="layout">
        <div id="memoryList" class="memory-list"></div>
        <div id="detail" class="detail empty">No memory selected</div>
      </div>
    </section>
  </main>
  <script>
    const state = { memories: [], selectedId: null };
    const $ = (id) => document.getElementById(id);
    const statusEl = $("status");
    const listEl = $("memoryList");
    const detailEl = $("detail");
    const countEl = $("count");
    $("apiUrl").value = window.location.origin;

    function setStatus(message, isError = false) {
      statusEl.textContent = message;
      statusEl.className = isError ? "status error" : "status";
    }

    function inputValue(id) {
      return $(id).value.trim();
    }

    function baseHeaders() {
      const token = inputValue("token");
      const headers = { "content-type": "application/json" };
      if (token) headers.authorization = "Bearer " + token;
      return headers;
    }

    function endpoint(path) {
      return inputValue("apiUrl").replace(/\/+$/, "") + path;
    }

    function scopePayload() {
      const payload = {
        scope: inputValue("scope"),
        limit: Number(inputValue("limit") || "50")
      };
      const organizationId = inputValue("organizationId");
      const projectKey = inputValue("projectKey");
      const userScopeId = inputValue("userScopeId");
      const tag = inputValue("tag");
      if (organizationId) payload.organizationId = organizationId;
      if (projectKey) payload.projectKey = projectKey;
      if (userScopeId) payload.userScopeId = userScopeId;
      if (tag) payload.tag = tag;
      if ($("includeArchived").checked) payload.includeArchived = true;
      return payload;
    }

    async function post(path, payload) {
      const response = await fetch(endpoint(path), {
        method: "POST",
        headers: baseHeaders(),
        body: JSON.stringify(payload)
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.success === false) {
        throw new Error(body.error?.message || "request failed");
      }
      return body.data;
    }

    function renderList() {
      countEl.textContent = state.memories.length + (state.memories.length === 1 ? " memory" : " memories");
      listEl.replaceChildren();
      if (state.memories.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "No records";
        listEl.append(empty);
        renderDetail(null);
        return;
      }
      for (const memory of state.memories) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "memory-item";
        button.setAttribute("aria-current", String(memory.id === state.selectedId));
        button.addEventListener("click", () => {
          state.selectedId = memory.id;
          renderList();
          renderDetail(memory);
        });
        const title = document.createElement("strong");
        title.textContent = memory.title || memory.summary || memory.content.slice(0, 90);
        const meta = document.createElement("div");
        meta.className = "meta";
        meta.append(pill("#" + memory.id), pill(memory.memoryType), pill(memory.durability || "ephemeral"));
        for (const tag of memory.tags || []) meta.append(pill(tag));
        button.append(title, meta);
        listEl.append(button);
      }
      renderDetail(state.memories.find((memory) => memory.id === state.selectedId) || state.memories[0]);
    }

    function pill(text) {
      const span = document.createElement("span");
      span.className = "pill";
      span.textContent = text;
      return span;
    }

    function renderDetail(memory) {
      if (!memory) {
        detailEl.className = "detail empty";
        detailEl.textContent = "No memory selected";
        return;
      }
      state.selectedId = memory.id;
      detailEl.className = "detail";
      detailEl.innerHTML = "";
      const heading = document.createElement("h2");
      heading.textContent = "Memory #" + memory.id;
      const form = document.createElement("form");
      form.innerHTML = [
        '<div class="row">',
        '<label>Kind',
        '<select name="kind">',
        '<option value="decision">decision</option>',
        '<option value="summary">summary</option>',
        '<option value="fact">fact</option>',
        '</select>',
        '</label>',
        '<label>Durability',
        '<select name="durability">',
        '<option value="ephemeral">ephemeral</option>',
        '<option value="durable">durable</option>',
        '<option value="archived">archived</option>',
        '</select>',
        '</label>',
        '</div>',
        '<label>Title<input name="title"></label>',
        '<label>Summary<textarea name="summary"></textarea></label>',
        '<label>Content<textarea name="content"></textarea></label>',
        '<label>Tags<input name="tags"></label>',
        '<label>Importance<input name="importance" type="number"></label>',
        '<div class="actions">',
        '<button class="primary" type="submit">Save</button>',
        '<button type="button" data-action="tag">Apply tags</button>',
        '<button class="danger" type="button" data-action="archive">Archive</button>',
        '</div>',
      ].join("");
      form.elements.kind.value = memory.memoryType || "fact";
      form.elements.durability.value = memory.durability || "ephemeral";
      form.elements.title.value = memory.title || "";
      form.elements.summary.value = memory.summary || "";
      form.elements.content.value = memory.content || "";
      form.elements.tags.value = (memory.tags || []).join(", ");
      form.elements.importance.value = memory.importance ?? "";
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        await saveMemory(memory.id, form);
      });
      form.querySelector("[data-action='tag']").addEventListener("click", async () => {
        await tagMemory(memory.id, form);
      });
      form.querySelector("[data-action='archive']").addEventListener("click", async () => {
        await archiveMemory(memory.id);
      });
      detailEl.append(heading, form);
    }

    function tagsFrom(value) {
      return value.split(",").map((tag) => tag.trim()).filter(Boolean);
    }

    async function loadMemories() {
      setStatus("Loading...");
      const data = await post("/v1/memory/list", scopePayload());
      state.memories = data.memories || [];
      state.selectedId = state.memories[0]?.id ?? null;
      renderList();
      setStatus("Loaded");
    }

    async function saveMemory(memoryId, form) {
      setStatus("Saving...");
      const payload = {
        organizationId: inputValue("organizationId") || undefined,
        memoryId,
        kind: form.elements.kind.value,
        durability: form.elements.durability.value,
        title: form.elements.title.value || null,
        summary: form.elements.summary.value || null,
        content: form.elements.content.value
      };
      const importance = form.elements.importance.value;
      if (importance) payload.importance = Number(importance);
      await post("/v1/memory/update", payload);
      await loadMemories();
      setStatus("Saved");
    }

    async function tagMemory(memoryId, form) {
      setStatus("Tagging...");
      const payload = {
        organizationId: inputValue("organizationId") || undefined,
        memoryId,
        tags: tagsFrom(form.elements.tags.value)
      };
      await post("/v1/memory/tag", payload);
      await loadMemories();
      setStatus("Tagged");
    }

    async function archiveMemory(memoryId) {
      setStatus("Archiving...");
      const payload = {
        organizationId: inputValue("organizationId") || undefined,
        memoryId
      };
      await post("/v1/memory/delete", payload);
      await loadMemories();
      setStatus("Archived");
    }

    $("filters").addEventListener("submit", async (event) => {
      event.preventDefault();
      try { await loadMemories(); } catch (error) { setStatus(error.message, true); }
    });
    $("reload").addEventListener("click", async () => {
      try { await loadMemories(); } catch (error) { setStatus(error.message, true); }
    });
    $("clear").addEventListener("click", () => {
      state.memories = [];
      state.selectedId = null;
      renderList();
      setStatus("");
    });
    renderList();
  </script>
</body>
</html>`;
}
