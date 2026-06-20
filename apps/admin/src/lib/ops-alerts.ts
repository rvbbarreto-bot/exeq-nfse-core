export type OpsAlerts = {
  issues_failed: number;
  issues_queued: number;
  webhooks_failed: number;
  charges_pending: number;
  charges_registered: number;
};

export type OpsAlertCard = {
  key: string;
  label: string;
  value: number;
  severity: "critical" | "warning" | "ok";
  href: string;
};

export function buildOpsAlertCards(alerts: OpsAlerts): OpsAlertCard[] {
  return [
    {
      key: "issues_failed",
      label: "Emissões com falha",
      value: alerts.issues_failed,
      severity: alerts.issues_failed > 0 ? "critical" : "ok",
      href: "/issues?status=failed",
    },
    {
      key: "issues_queued",
      label: "Emissões na fila",
      value: alerts.issues_queued,
      severity: alerts.issues_queued > 0 ? "warning" : "ok",
      href: "/issues?status=queued",
    },
    {
      key: "webhooks_failed",
      label: "Webhooks com falha",
      value: alerts.webhooks_failed,
      severity: alerts.webhooks_failed > 0 ? "critical" : "ok",
      href: "/webhooks?status=failed",
    },
    {
      key: "charges_pending",
      label: "Cobranças pendentes",
      value: alerts.charges_pending,
      severity: alerts.charges_pending > 0 ? "warning" : "ok",
      href: "/charges?status=pending",
    },
    {
      key: "charges_registered",
      label: "Cobranças registradas (aguardando pagamento)",
      value: alerts.charges_registered,
      severity: alerts.charges_registered > 0 ? "warning" : "ok",
      href: "/charges?status=registered",
    },
  ];
}

export function hasActiveAlerts(alerts: OpsAlerts): boolean {
  return buildOpsAlertCards(alerts).some((c) => c.value > 0);
}

export function hypercareAlertTotal(alerts: OpsAlerts): number {
  return (
    alerts.issues_failed +
    alerts.issues_queued +
    alerts.webhooks_failed +
    alerts.charges_pending +
    alerts.charges_registered
  );
}
