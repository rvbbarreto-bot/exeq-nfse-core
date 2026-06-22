import type { ReactNode } from "react";

type ResponsiveTableProps = {
  children: ReactNode;
  caption?: string;
  label?: string;
};

/** Wrapper com scroll horizontal para tabelas em viewports estreitas. */
export function ResponsiveTable({ children, caption, label }: ResponsiveTableProps) {
  return (
    <div
      className="table-scroll"
      tabIndex={0}
      role="region"
      aria-label={label ?? caption ?? "Tabela de dados"}
    >
      {caption ? <span className="sr-only">{caption}</span> : null}
      {children}
    </div>
  );
}
