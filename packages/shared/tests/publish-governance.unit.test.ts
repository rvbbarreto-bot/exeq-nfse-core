import { describe, expect, it } from "vitest";
import {
  assertPublishGatesComplete,
  missingPublishGates,
  normalizePublishChecklist,
  PublishGatesIncompleteError,
} from "../src/publish-governance.js";

describe("publish-governance", () => {
  it("normaliza checklist parcial", () => {
    expect(normalizePublishChecklist({ csv_validated: true })).toEqual({
      csv_validated: true,
      rules_reviewed: false,
      validado_contador: false,
      terms_accepted: false,
    });
  });

  it("lista gates pendentes", () => {
    const missing = missingPublishGates({
      csv_validated: true,
      rules_reviewed: false,
      validado_contador: false,
      terms_accepted: false,
    });
    expect(missing).toEqual(["rules_reviewed", "validado_contador", "terms_accepted"]);
  });

  it("bloqueia publicacao sem gates completos", () => {
    expect(() =>
      assertPublishGatesComplete({
        csv_validated: true,
        rules_reviewed: true,
        validado_contador: true,
        terms_accepted: false,
      }),
    ).toThrow(PublishGatesIncompleteError);
  });

  it("permite publicacao com todos os gates", () => {
    expect(() =>
      assertPublishGatesComplete({
        csv_validated: true,
        rules_reviewed: true,
        validado_contador: true,
        terms_accepted: true,
      }),
    ).not.toThrow();
  });
});
