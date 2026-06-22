import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PortalPageHeader } from "../src/components/PortalPageHeader.js";

describe("PortalPageHeader", () => {
  it("renderiza titulo e descricao", () => {
    render(<PortalPageHeader title="Emissoes NFS-e" description="Listagem paginada" />);
    expect(screen.getByRole("heading", { level: 1, name: "Emissoes NFS-e" })).toBeTruthy();
    expect(screen.getByText("Listagem paginada")).toBeTruthy();
  });

  it("renderiza actions quando informadas", () => {
    render(
      <PortalPageHeader title="Dashboard" actions={<button type="button">Acao</button>} />,
    );
    expect(screen.getByRole("button", { name: "Acao" })).toBeTruthy();
  });
});
