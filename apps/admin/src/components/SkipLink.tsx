import { MAIN_CONTENT_ID } from "../lib/a11y-nav.js";

export function SkipLink() {
  return (
    <a href={`#${MAIN_CONTENT_ID}`} className="skip-link">
      Ir para conteudo principal
    </a>
  );
}
