import type { ReactNode } from "react";

export type PortalPageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  below?: ReactNode;
};

export function PortalPageHeader(props: PortalPageHeaderProps) {
  return (
    <header className="shell-page__header">
      <div className="shell-page__head-row">
        <h1 className="shell-page__title shell-page__title--inline">{props.title}</h1>
        {props.actions ? <div className="shell-page__actions">{props.actions}</div> : null}
      </div>
      {props.description ? <p className="shell-page__desc">{props.description}</p> : null}
      {props.below ? <div className="shell-page__head-below">{props.below}</div> : null}
    </header>
  );
}
