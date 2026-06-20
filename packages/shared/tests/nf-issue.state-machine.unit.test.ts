import { describe, expect, it } from "vitest";
import {
  assertNfIssueTransition,
  canTransitionNfIssue,
  InvalidNfIssueTransitionError,
  isTerminalNfIssueStatus,
} from "../src/nf-issue.js";

describe("NfIssue state machine", () => {
  it("permite draft -> pending_tax -> queued", () => {
    expect(canTransitionNfIssue("draft", "pending_tax")).toBe(true);
    expect(canTransitionNfIssue("pending_tax", "queued")).toBe(true);
  });

  it("bloqueia transicao invalida", () => {
    expect(() => assertNfIssueTransition("draft", "authorized")).toThrow(
      InvalidNfIssueTransitionError,
    );
  });

  it("permite failed -> queued (reprocess)", () => {
    expect(canTransitionNfIssue("failed", "queued")).toBe(true);
  });

  it("identifica status terminal", () => {
    expect(isTerminalNfIssueStatus("authorized")).toBe(true);
    expect(isTerminalNfIssueStatus("polling")).toBe(false);
  });
});
