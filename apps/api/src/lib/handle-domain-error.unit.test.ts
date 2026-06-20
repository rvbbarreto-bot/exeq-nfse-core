import { describe, expect, it, vi } from "vitest";
import type { FastifyReply } from "fastify";
import { PublishGatesIncompleteError } from "@exeq/shared";
import { handleDomainError } from "./handle-domain-error.js";
import { CatalogEmptyError, CatalogNotEditableError } from "../modules/fiscal/catalog.service.js";
import { NotFoundError } from "../modules/master-data/master-data.service.js";

function mockReply() {
  const reply = {
    code: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  } as unknown as FastifyReply;
  return reply;
}

describe("handleDomainError", () => {
  it("mapeia NotFoundError para 404", () => {
    const reply = mockReply();
    const handled = handleDomainError(new NotFoundError("CATALOG"), reply);
    expect(handled).toBe(true);
    expect(reply.code).toHaveBeenCalledWith(404);
  });

  it("mapeia CatalogNotEditableError para 409", () => {
    const reply = mockReply();
    handleDomainError(new CatalogNotEditableError(), reply);
    expect(reply.code).toHaveBeenCalledWith(409);
  });

  it("mapeia CatalogEmptyError para 422", () => {
    const reply = mockReply();
    handleDomainError(new CatalogEmptyError(), reply);
    expect(reply.code).toHaveBeenCalledWith(422);
  });

  it("mapeia PublishGatesIncompleteError para 422", () => {
    const reply = mockReply();
    handleDomainError(new PublishGatesIncompleteError(["terms_accepted"]), reply);
    expect(reply.code).toHaveBeenCalledWith(422);
  });

  it("retorna false para erro desconhecido", () => {
    const reply = mockReply();
    expect(handleDomainError(new Error("x"), reply)).toBe(false);
  });
});
