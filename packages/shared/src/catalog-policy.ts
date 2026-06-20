import type { CatalogStatus } from "./fiscal-catalog.js";

export class CatalogNotEditableError extends Error {
  constructor(message = "CATALOG_NOT_EDITABLE") {
    super(message);
    this.name = "CatalogNotEditableError";
  }
}

export function assertCatalogEditable(status: CatalogStatus): void {
  if (status !== "draft") {
    throw new CatalogNotEditableError();
  }
}

export function nextCatalogVersion(currentMax: number): number {
  return currentMax + 1;
}

export function isDateWithinRule(
  competenceDate: string,
  validFrom: string,
  validTo: string | null,
): boolean {
  if (competenceDate < validFrom) return false;
  if (validTo != null && competenceDate > validTo) return false;
  return true;
}
