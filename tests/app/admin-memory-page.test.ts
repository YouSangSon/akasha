import { describe, expect, it } from "vitest";

import { renderMemoryAdminPage } from "../../src/app/admin-memory-page.js";

describe("memory admin page", () => {
  const html = renderMemoryAdminPage();

  it("reports no-op and pending governance outcomes truthfully", () => {
    expect(html).toContain("result.updated !== true");
    expect(html).toContain(
      "Not saved: memory was not found in this organization.",
    );
    expect(html).toContain(
      "Not tagged: memory was not found in this organization.",
    );
    expect(html).toContain("result.archived !== true");
    expect(html).toContain(
      "Not archived: memory was not found or is already archived.",
    );
    expect(html).toContain("result.qdrantPointsPending");
    expect(html).toContain("result.indexCleanupPending === true");
    expect(html).toContain("Archived; search index cleanup pending retry");
    expect(html).toContain("pending cleanup");
  });

  it("uses native archive confirmation and restores focus after rerenders", () => {
    expect(html).toContain(
      'window.confirm("Archive memory #" + memoryId + "?")',
    );
    expect(html).toContain('data-action="save"');
    expect(html).toContain("function focusAfterRefresh(memoryId, action)");
    expect(html).toContain("actionButton && !actionButton.disabled");
    expect(html).toContain(
      "listEl.querySelector('[data-memory-id=\"' + memoryId + '\"]')",
    );
    expect(html).toContain("button.dataset.memoryId = String(memory.id)");
    expect(html).not.toContain("renderList();\n          renderDetail(memory);");
  });

  it("announces count changes and lets narrow status text wrap", () => {
    expect(html).toContain(
      'id="status" class="status" role="status" aria-live="polite" aria-atomic="true"',
    );
    expect(html).toContain(
      'id="count" role="status" aria-live="polite" aria-atomic="true"',
    );
    expect(html).toContain("overflow-wrap: anywhere");
    expect(html).toContain("flex-wrap: wrap");
  });
});
