import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { AppShell } from "../src/components/AppShell.js";
import { APP_SIDEBAR_ID, MAIN_CONTENT_ID } from "../src/lib/a11y-nav.js";

describe("AppShell a11y", () => {
  afterEach(() => {
    cleanup();
  });
  it("expoe skip link e landmark de conteudo principal", () => {
    render(
      <MemoryRouter>
        <AppShell>
          <p>Conteudo de teste</p>
        </AppShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Ir para conteudo principal" })).toBeTruthy();
    expect(document.getElementById(MAIN_CONTENT_ID)).toBeTruthy();
    expect(document.getElementById(APP_SIDEBAR_ID)).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Menu principal" })).toBeTruthy();
  });

  it("toggle menu referencia sidebar via aria-controls", () => {
    render(
      <MemoryRouter>
        <AppShell>
          <p>Conteudo</p>
        </AppShell>
      </MemoryRouter>,
    );

    const toggle = screen.getByTestId("shell-nav-toggle");
    expect(toggle.getAttribute("aria-controls")).toBe(APP_SIDEBAR_ID);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });
});
