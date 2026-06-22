import type {
  GuiaFiscalResponse,
  GuiaFiscalStatus,
  TipoGuia,
} from "@exeq/shared";
import { getUserRoles } from "./auth.js";

export const GUIA_STATUS_LABELS: Record<GuiaFiscalStatus, string> = {
  PROCESSANDO: "Processando",
  DISPONIVEL: "Disponivel",
  PAGO: "Pago",
  CANCELADO: "Cancelado",
  RETIFICADO: "Retificado",
  VENCIDO: "Vencido",
  EM_CONTESTACAO: "Em contestacao",
};

export const TIPO_GUIA_LABELS: Record<TipoGuia, string> = {
  DAS: "DAS",
  DARF: "DARF",
};

export const COMPLIANCE_LABELS: Record<GuiaFiscalResponse["compliance_status"], string> = {
  pendente: "Pendente",
  aprovado: "Aprovado",
  bloqueado: "Bloqueado",
  dispensado: "Dispensado",
};

export const FILTER_GUIA_STATUS_OPTIONS: { label: string; value: string }[] = [
  { label: "Todos", value: "" },
  ...(Object.entries(GUIA_STATUS_LABELS) as [GuiaFiscalStatus, string][]).map(([value, label]) => ({
    label,
    value,
  })),
];

export const FILTER_TIPO_GUIA_OPTIONS: { label: string; value: string }[] = [
  { label: "Todos", value: "" },
  ...(Object.entries(TIPO_GUIA_LABELS) as [TipoGuia, string][]).map(([value, label]) => ({
    label,
    value,
  })),
];

export function formatGuiaStatus(status: string): string {
  return GUIA_STATUS_LABELS[status as GuiaFiscalStatus] ?? status;
}

export function formatTipoGuia(tipo: string): string {
  return TIPO_GUIA_LABELS[tipo as TipoGuia] ?? tipo;
}

export function formatComplianceStatus(status: string): string {
  return COMPLIANCE_LABELS[status as GuiaFiscalResponse["compliance_status"]] ?? status;
}

export function guiaStatusClass(status: string): string {
  if (status === "DISPONIVEL" || status === "PAGO") return "ok";
  if (status === "PROCESSANDO") return "warn";
  if (status === "VENCIDO" || status === "CANCELADO" || status === "EM_CONTESTACAO") return "err";
  return "";
}

export function formatCurrencyBrl(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function formatCompetencia(competencia: string): string {
  const [year, month] = competencia.split("-");
  if (!year || !month) return competencia;
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
}

export function formatDateBr(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR");
}

export function buildDasGuiasQuery(input: {
  status?: string;
  tipo_guia?: string;
  provider_id?: string;
  competencia?: string;
  limit?: string;
  cursor?: string;
}): Record<string, string> {
  const q: Record<string, string> = {};
  if (input.status) q.status = input.status;
  if (input.tipo_guia) q.tipo_guia = input.tipo_guia;
  if (input.provider_id?.trim()) q.provider_id = input.provider_id.trim();
  if (input.competencia?.trim()) q.competencia = input.competencia.trim();
  if (input.limit) q.limit = input.limit;
  if (input.cursor) q.cursor = input.cursor;
  return q;
}

export function truncateId(id: string): string {
  return `${id.slice(0, 8)}…`;
}

export function canEmitDasGuia(): boolean {
  const roles = getUserRoles();
  return roles.includes("tenant_admin") || roles.includes("operator");
}

export function defaultCompetenciaMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const prev = month === 0 ? new Date(year - 1, 11, 1) : new Date(year, month - 1, 1);
  const mm = String(prev.getMonth() + 1).padStart(2, "0");
  return `${prev.getFullYear()}-${mm}`;
}
