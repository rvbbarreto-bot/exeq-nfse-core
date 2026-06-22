import { getUserRoles } from "./auth.js";

export type BackfillSnapshotsResult = {
  tenant_id: string;
  tenant_slug?: string;
  days: number;
  candidates: number;
  created: number;
  skipped: number;
  errors: number;
  dry_run: boolean;
};

export function canRunFiscalBackfill(): boolean {
  return getUserRoles().includes("tenant_admin");
}

export function formatBackfillSummary(result: BackfillSnapshotsResult): string {
  const mode = result.dry_run ? "Simulacao (dry-run)" : "Aplicado";
  return `${mode}: ${result.candidates} candidatos, ${result.created} criados, ${result.skipped} ignorados, ${result.errors} erros`;
}
