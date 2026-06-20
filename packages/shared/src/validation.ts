/** Remove non-digits from CPF/CNPJ strings. */
export function stripDocument(value: string): string {
  return value.replace(/\D/g, "");
}

/** Validates CPF check digits (11 digits, no trivial sequences). */
export function isValidCpf(value: string): boolean {
  const cpf = stripDocument(value);
  if (!/^\d{11}$/.test(cpf)) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const calc = (base: string, factor: number): number => {
    let sum = 0;
    for (let i = 0; i < base.length; i++) {
      sum += Number(base[i]) * (factor - i);
    }
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };

  const d1 = calc(cpf.slice(0, 9), 10);
  const d2 = calc(cpf.slice(0, 10), 11);
  return d1 === Number(cpf[9]) && d2 === Number(cpf[10]);
}

/** Validates CNPJ check digits (14 digits). */
export function isValidCnpj(value: string): boolean {
  const cnpj = stripDocument(value);
  if (!/^\d{14}$/.test(cnpj)) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const calc = (base: string, weights: number[]): number => {
    let sum = 0;
    for (let i = 0; i < weights.length; i++) {
      sum += Number(base[i]) * weights[i]!;
    }
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = calc(cnpj.slice(0, 12), w1);
  const d2 = calc(cnpj.slice(0, 12) + d1, w2);
  return d1 === Number(cnpj[12]) && d2 === Number(cnpj[13]);
}

export function inferDocumentType(document: string): "cpf" | "cnpj" {
  const digits = stripDocument(document);
  if (digits.length === 11) return "cpf";
  if (digits.length === 14) return "cnpj";
  throw new Error("INVALID_DOCUMENT_LENGTH");
}

export function assertValidDocument(document: string): "cpf" | "cnpj" {
  const type = inferDocumentType(document);
  const digits = stripDocument(document);
  const valid = type === "cpf" ? isValidCpf(digits) : isValidCnpj(digits);
  if (!valid) throw new Error("INVALID_DOCUMENT");
  return type;
}
