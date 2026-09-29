-- A v4company restringe compartilhamento externo de agenda e não quer abrir
-- exceção nem via delegação em todo o domínio (Admin Console) — então a
-- sincronização via API do Calendar com conta de serviço (migration 0042)
-- não é viável. Troca de abordagem: cada consultor gera, sozinho e sem
-- precisar de nenhum admin, o "endereço secreto no formato iCal" da própria
-- agenda (Configurações da agenda → Integrar agenda) e cola esse link aqui —
-- é uma URL privada de leitura, não passa por nenhuma política de
-- compartilhamento. A sincronização (edge function google-calendar-sync)
-- passa a baixar e interpretar esse feed ICS diretamente, sem usar mais a
-- conta de serviço (GOOGLE_SERVICE_ACCOUNT_JSON) pra Calendar — ela continua
-- em uso só pra Sheets.
--
-- google_calendar_id/google_calendar_sync_token (migration 0042) ficam sem
-- uso a partir de agora (nenhuma incremental syncToken existe em ICS, é
-- sempre o feed inteiro) — mantidos por segurança/histórico, não removidos.
alter table public.consultores
  add column if not exists google_calendar_ical_url text;
