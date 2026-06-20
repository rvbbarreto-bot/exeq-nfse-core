import type { buildApp } from "../src/app.js";

export async function setupEmissionMasterData(
  app: Awaited<ReturnType<typeof buildApp>>,
  token: string,
) {
  const provider = await app.inject({
    method: "POST",
    url: "/v1/providers",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      document: "11222333000181",
      legal_name: "Prestador Piloto LTDA",
      tax_regime: "simples_nacional",
      municipal_registration: "12345",
    },
  });
  const providerId =
    provider.statusCode === 201
      ? provider.json().id
      : (await listProviders(app, token)).id;

  const customer = await app.inject({
    method: "POST",
    url: "/v1/customers",
    headers: { authorization: `Bearer ${token}` },
    payload: { document: "52998224725", name: "Tomador Homologacao" },
  });
  const customerId =
    customer.statusCode === 201
      ? customer.json().id
      : (await listCustomers(app, token)).id;

  const service = await app.inject({
    method: "POST",
    url: "/v1/services",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      service_code: "1.01",
      description: "Analise e desenvolvimento de sistemas",
      lc116_item: "1.01",
    },
  });
  const serviceId =
    service.statusCode === 201 ? service.json().id : (await listServices(app, token)).id;

  return { providerId, customerId, serviceId };
}

async function listProviders(app: Awaited<ReturnType<typeof buildApp>>, token: string) {
  const res = await app.inject({
    method: "GET",
    url: "/v1/providers",
    headers: { authorization: `Bearer ${token}` },
  });
  return res.json().items[0];
}

async function listCustomers(app: Awaited<ReturnType<typeof buildApp>>, token: string) {
  const res = await app.inject({
    method: "GET",
    url: "/v1/customers",
    headers: { authorization: `Bearer ${token}` },
  });
  return res.json().items[0];
}

async function listServices(app: Awaited<ReturnType<typeof buildApp>>, token: string) {
  const res = await app.inject({
    method: "GET",
    url: "/v1/services",
    headers: { authorization: `Bearer ${token}` },
  });
  return res.json().items.find((s: { service_code: string }) => s.service_code === "1.01") ?? res.json().items[0];
}
