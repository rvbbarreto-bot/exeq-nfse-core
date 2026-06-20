import type { FastifyReply } from "fastify";
import {
  CatalogNotEditableError,
  CatalogEmptyError,
} from "../modules/fiscal/catalog.service.js";
import { PublishGatesIncompleteError } from "@exeq/shared";
import {
  DuplicateDocumentError,
  NotFoundError,
} from "../modules/master-data/master-data.service.js";
import { TaxRuleNotFoundError } from "../modules/fiscal/tax-resolve.service.js";

export function handleDomainError(err: unknown, reply: FastifyReply): boolean {
  if (err instanceof NotFoundError) {
    const label =
      err.message === "CHARGE"
        ? "Cobranca nao encontrada"
        : err.message === "NF_ISSUE"
          ? "Emissao NF nao encontrada"
          : err.message === "CHANNEL_SESSION"
            ? "Sessao de canal nao encontrada"
            : "Recurso nao encontrado";
    reply.code(404).send({ error: err.message, message: label });
    return true;
  }
  if (err instanceof DuplicateDocumentError) {
    reply.code(409).send({ error: err.message, message: "Documento ja cadastrado" });
    return true;
  }
  if (err instanceof CatalogNotEditableError) {
    reply.code(409).send({ error: err.message, message: "Catalogo nao editavel (somente draft)" });
    return true;
  }
  if (err instanceof CatalogEmptyError) {
    reply.code(422).send({ error: err.message, message: "Catalogo vazio nao pode ser publicado" });
    return true;
  }
  if (err instanceof PublishGatesIncompleteError) {
    reply.code(422).send({
      error: err.message,
      message: "Checklist de publicacao incompleto",
      missing: err.missing,
    });
    return true;
  }
  if (err instanceof TaxRuleNotFoundError) {
    reply.code(422).send({
      error: "TAX_RULE_NOT_FOUND",
      message: "Nenhuma regra fiscal publicada",
      details: err.details,
    });
    return true;
  }
  if (err instanceof Error && err.message === "INVALID_DOCUMENT") {
    reply.code(400).send({ error: "INVALID_DOCUMENT", message: "CPF/CNPJ invalido" });
    return true;
  }
  return false;
}
