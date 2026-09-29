-- A integração com Google Calendar (migrations 0042/0043) foi revertida do
-- código (o Workspace da v4company não permite nenhum caminho de leitura
-- externa de agenda sem envolver o admin) — esta migration limpa as
-- tabelas/colunas específicas dessa tentativa, que ficaram órfãs no banco
-- desde então, e prepara o módulo de Reuniões com campos genéricos
-- (independentes de provedor) pra uma futura sincronização, sem precisar
-- refazer nada: external_calendar_id, external_event_id, calendar_provider.
-- Ficam opcionais e sem nenhum uso nesta versão.

drop table if exists public.google_calendar_eventos_pendentes;

alter table public.consultores
  drop column if exists google_calendar_id,
  drop column if exists google_calendar_sync_token,
  drop column if exists google_calendar_sincronizado_em,
  drop column if exists google_calendar_ical_url;

alter table public.reunioes
  drop column if exists google_event_id,
  drop column if exists google_calendar_id,
  drop column if exists google_meet_link,
  drop column if exists origem,
  drop column if exists google_status;

alter table public.reunioes
  add column if not exists external_calendar_id text,
  add column if not exists external_event_id text,
  add column if not exists calendar_provider text;

create unique index if not exists reunioes_external_evento_idx
  on public.reunioes (calendar_provider, external_calendar_id, external_event_id)
  where external_event_id is not null;

-- A sincronização reunião → marco do cliente (kickoff/treinamento) segue
-- útil independente de a reunião ter sido criada manualmente ou (no futuro)
-- importada de um calendário externo — mantém o trigger da migration 0042,
-- que não depende de nada específico do Google.
