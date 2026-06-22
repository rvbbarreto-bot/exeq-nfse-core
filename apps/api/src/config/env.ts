import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
config({ path: path.join(rootDir, ".env") });
config({ path: path.join(rootDir, ".env.local"), override: true });
config({ path: path.join(rootDir, ".env.channel"), override: true });

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  MIGRATION_DATABASE_URL: z.string().url().optional(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default("8h"),
  MASTER_KEY: z.string().length(64),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  SEED_ADMIN_EMAIL: z.string().email().default("admin@piloto.local"),
  SEED_ADMIN_PASSWORD: z.string().min(6).default("changeme"),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  /** Agrupa mensagens WhatsApp no Redis antes de processar (0 = desligado). Padrão legado Emissor NF: 8s. */
  CHANNEL_DEBOUNCE_SECONDS: z.coerce
    .number()
    .int()
    .min(0)
    .max(120)
    .default(process.env.NODE_ENV === "test" ? 0 : 8),
  /** LLM fallback quando parser regex não extrai campos (WhatsApp linguagem natural). */
  OPENAI_API_KEY: z.string().min(1).optional(),
  LLM_EXTRACTION_MODEL: z.string().default("gpt-4o-mini"),
  LLM_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.5),
  CHANNEL_LLM_FALLBACK_ENABLED: z
    .enum(["true", "false"])
    .default(process.env.NODE_ENV === "test" ? "false" : "true")
    .transform((v) => v === "true"),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(8000),
  /** Resposta WhatsApp após debounce — host usa EVOLUTION_SERVER_URL (8082). */
  EVOLUTION_SERVER_URL: z.string().url().optional(),
  EVOLUTION_API_URL: z.string().url().optional(),
  EVOLUTION_INSTANCE: z.string().min(1).optional(),
  EVOLUTION_API_KEY: z.string().min(1).optional(),
  FOCUS_BASE_URL: z.string().url().default("https://homologacao.focusnfe.com.br"),
  FOCUS_MOCK: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  NF_SYNC_PROCESSING: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  FOCUS_HOMOLOG_MOCK: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  /** PO 2026-06-19: focus_only = emissão sempre Focus Nacional; Betha congelado */
  NFSE_ROUTING_POLICY: z.enum(["focus_only", "multi_provider"]).default("focus_only"),
  WEBHOOK_SYNC_PROCESSING: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  GATEWAY_BASE_URL: z.string().url().default("https://sandbox.gateway.exeq.local"),
  GATEWAY_MOCK: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  GATEWAY_SYNC_PROCESSING: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  BETHA_MOCK: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  BETHA_ATIBAIA_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  BETHA_WSDL_URL: z.string().url().optional(),
  BETHA_WSDL_CONSULTAR_URL: z.string().url().optional(),
  BETHA_WS_URL: z.string().url().optional(),
  BETHA_INTEGRATION_MODE: z.enum(["rps", "dps"]).optional(),
  BETHA_DPS_TP_AMB: z.coerce.number().int().min(1).max(2).default(1),
  /** Deve coincidir com tpAmb: homolog→2, producao→1 (portal Betha contribuinte) */
  BETHA_PORTAL_AMBIENTE: z.enum(["homolog", "producao"]).optional(),
  BETHA_DEFAULT_NBS: z.string().regex(/^\d{9}$/).default("115013000"),
  BETHA_SUITE_PORTAL_URL: z.string().url().optional(),
  /** Merge DAS — módulo guias DAS/DARF habilitado. */
  FISCAL_DAS_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  /** Gateway Receita: mock in-process (dev/test). */
  RECEITA_DAS_MOCK: z
    .enum(["true", "false"])
    .default(process.env.NODE_ENV === "test" ? "true" : "false")
    .transform((v) => v === "true"),
  /** Gateway Receita: mock | http (homolog/prod). */
  RECEITA_GATEWAY_PROVIDER: z.enum(["mock", "http"]).default("mock"),
  /** Base URL mock/http Receita (ex.: http://127.0.0.1:19443). */
  RECEITA_DAS_CAPTURE_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);

export const migrationDatabaseUrl =
  env.MIGRATION_DATABASE_URL ?? env.DATABASE_URL.replace("exeq_app:", "exeq:").replace("exeq_app_dev", "exeq_dev");
