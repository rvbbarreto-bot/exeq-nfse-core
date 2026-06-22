import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ResponsiveTable } from "../src/components/ResponsiveTable.js";

describe("ResponsiveTable", () => {
  it("cria regiao acessivel com label", () => {
    render(
      <ResponsiveTable label="Tabela teste">
        <table>
          <tbody>
            <tr>
              <td>ok</td>
            </tr>
          </tbody>
        </table>
      </ResponsiveTable>,
    );

    expect(screen.getByRole("region", { name: "Tabela teste" })).toBeTruthy();
  });
});
