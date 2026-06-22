/** aria-current para link de navegacao ativo (WCAG 2.4.8). */
export function navAriaCurrent(isActive: boolean): "page" | undefined {
  return isActive ? "page" : undefined;
}

export const MAIN_CONTENT_ID = "main-content";

export const APP_SIDEBAR_ID = "app-sidebar";
