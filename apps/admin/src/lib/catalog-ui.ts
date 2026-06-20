import {
  type PublishChecklist,
  PUBLISH_GATE_LABELS,
  normalizePublishChecklist,
} from "@exeq/shared";

export type { PublishChecklist };

export const GATE_LABELS = PUBLISH_GATE_LABELS;

export const DEFAULT_PUBLISH_CHECKLIST: PublishChecklist = normalizePublishChecklist({});

export function canPublishCatalog(
  checklist: PublishChecklist,
  ruleCount: number,
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (ruleCount === 0) reasons.push("Catalogo sem regras");
  for (const [key, label] of Object.entries(GATE_LABELS)) {
    if (!checklist[key as keyof PublishChecklist]) reasons.push(label);
  }
  return { ok: reasons.length === 0, reasons };
}

export function formatCatalogStatus(status: string): string {
  const map: Record<string, string> = {
    draft: "Rascunho",
    published: "Publicado",
    superseded: "Substituido",
  };
  return map[status] ?? status;
}
