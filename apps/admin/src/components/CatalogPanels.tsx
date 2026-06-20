import type { PublishChecklist } from "../lib/catalog-ui.js";
import { GATE_LABELS } from "../lib/catalog-ui.js";

type Props = {
  checklist: PublishChecklist;
  editable: boolean;
  onToggle: (key: keyof PublishChecklist, value: boolean) => void;
};

export function PublishChecklistPanel({ checklist, editable, onToggle }: Props) {
  return (
    <section className="card" data-testid="catalog-publish-checklist">
      <h2>Checklist de publicacao</h2>
      <ul className="checklist">
        {(Object.keys(GATE_LABELS) as (keyof PublishChecklist)[]).map((key) => (
          <li key={key}>
            <label>
              <input
                type="checkbox"
                checked={checklist[key]}
                disabled={!editable}
                data-testid={`catalog-gate-${key}`}
                onChange={(e) => onToggle(key, e.target.checked)}
              />
              {GATE_LABELS[key]}
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

export type CsvImportResult = {
  imported: number;
  skipped: number;
  parse_errors: { line: number; message: string }[];
  map_errors: { line: number; message: string }[];
};

type CsvImportProps = {
  disabled: boolean;
  onImport: (csv: string) => Promise<CsvImportResult>;
};

export function CsvImportPanel({ disabled, onImport }: CsvImportProps) {
  async function onFileChange(file: File | null) {
    if (!file) return;
    const csv = await file.text();
    await onImport(csv);
  }

  return (
    <section className="card" data-testid="catalog-csv-import">
      <h2>Importar regras (CSV)</h2>
      <p className="muted">
        Template H1 ou rascunho validado (ex.: Barueri 3505708 em docs/templates/rascunho/).
      </p>
      <input
        type="file"
        accept=".csv,text/csv"
        disabled={disabled}
        data-testid="catalog-csv-file"
        onChange={(e) => void onFileChange(e.target.files?.[0] ?? null)}
      />
    </section>
  );
}

export function CsvImportFeedback({
  message,
  result,
}: {
  message: string | null;
  result: CsvImportResult | null;
}) {
  if (!message && !result) return null;
  const errors = [
    ...(result?.parse_errors ?? []),
    ...(result?.map_errors ?? []),
  ];
  return (
    <div className="card" data-testid="catalog-import-feedback">
      {message && <p className={message.startsWith("Falha") ? "error" : "ok"}>{message}</p>}
      {errors.length > 0 && (
        <ul className="error-list">
          {errors.slice(0, 8).map((e) => (
            <li key={`${e.line}-${e.message}`}>
              Linha {e.line}: {e.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
