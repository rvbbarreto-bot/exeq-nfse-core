import type { ReactNode } from "react";

type PortalPageProps = {
  children: ReactNode;
  testId?: string;
  variant?: "default" | "dashboard";
};

export function PortalPage({ children, testId, variant = "default" }: PortalPageProps) {
  const surfaceClass = variant === "dashboard" ? "fiscal-dash fiscal-surface" : "fiscal-surface shell-page";
  return (
    <main className="page portal-page" data-testid={testId}>
      <div className={surfaceClass}>{children}</div>
    </main>
  );
}
