-- M0.1 — deduplicação inbound WhatsApp por message_id (Evolution retentativas)

CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_message_inbound_dedup
  ON exeq_core.channel_message_log (tenant_id, message_id)
  WHERE direction = 'inbound' AND message_id IS NOT NULL;
