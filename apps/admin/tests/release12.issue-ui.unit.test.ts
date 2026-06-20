import { describe, expect, it } from "vitest";
import { buildIssuesQuery } from "../src/lib/issue-ui.js";

describe("Release 1.2 — issues query builder", () => {
  it("RC-05b: inclui cursor quando informado", () => {
    const q = buildIssuesQuery({
      status: "authorized",
      ibge_code: "3504107",
      from_date: "",
      to_date: "",
      cursor: "abc123",
    });
    expect(q.status).toBe("authorized");
    expect(q.ibge_code).toBe("3504107");
    expect(q.cursor).toBe("abc123");
    expect(q.limit).toBe("50");
  });

  it("omite cursor quando ausente", () => {
    const q = buildIssuesQuery({
      status: "",
      ibge_code: "",
      from_date: "2026-05-01",
      to_date: "2026-05-31",
    });
    expect(q.cursor).toBeUndefined();
    expect(q.from_date).toBe("2026-05-01");
    expect(q.to_date).toBe("2026-05-31");
  });
});
