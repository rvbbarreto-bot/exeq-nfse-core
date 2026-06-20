export const PUBLISH_GATE_IDS = [
  "csv_validated",
  "rules_reviewed",
  "validado_contador",
  "terms_accepted",
] as const;

export type PublishGateId = (typeof PUBLISH_GATE_IDS)[number];

export const PUBLISH_GATE_LABELS: Record<PublishGateId, string> = {
  csv_validated: "CSV validado",
  rules_reviewed: "Regras revisadas pelo contador",
  validado_contador: "VALIDADO_CONTADOR (assinatura fiscal)",
  terms_accepted: "Termos de publicacao aceitos",
};

export type PublishChecklist = Record<PublishGateId, boolean>;

export const DEFAULT_PUBLISH_CHECKLIST: PublishChecklist = {
  csv_validated: false,
  rules_reviewed: false,
  validado_contador: false,
  terms_accepted: false,
};

export class PublishGatesIncompleteError extends Error {
  readonly missing: PublishGateId[];

  constructor(missing: PublishGateId[]) {
    super("PUBLISH_GATES_INCOMPLETE");
    this.name = "PublishGatesIncompleteError";
    this.missing = missing;
  }
}

export function normalizePublishChecklist(
  input: Partial<PublishChecklist> | null | undefined,
): PublishChecklist {
  return {
    csv_validated: input?.csv_validated === true,
    rules_reviewed: input?.rules_reviewed === true,
    validado_contador: input?.validado_contador === true,
    terms_accepted: input?.terms_accepted === true,
  };
}

export function missingPublishGates(checklist: PublishChecklist): PublishGateId[] {
  return PUBLISH_GATE_IDS.filter((id) => !checklist[id]);
}

export function assertPublishGatesComplete(checklist: PublishChecklist): void {
  const missing = missingPublishGates(checklist);
  if (missing.length > 0) throw new PublishGatesIncompleteError(missing);
}
