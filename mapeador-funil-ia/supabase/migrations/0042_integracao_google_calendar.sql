-- Integração com Google Calendar. Arquitetura escolhida: reaproveitar a
-- mesma conta de serviço (GOOGLE_SERVICE_ACCOUNT_JSON) já usada pra Sheets
-- (ver supabase/functions/_shared/googleSheets.ts), em vez de OAuth por
-- consultor. Cada consultor compartilha o próprio Google Calendar (pessoal
-- ou corporativo) com o e-mail da conta de serviço (permissão "Ver todos os
-- detalhes do evento") e cadastra o ID desse calendário aqui — funciona com
-- qualquer conta Google, não só Workspace, não exige tela de consentimento
-- OAuth nem endpoint de callback público, e não guarda nenhum token de
-- usuário: só a credencial única da conta de serviço, já usada em produção.

alter table public.consultores
  add column if not exists google_calendar_id text,
  add column if not exists google_calendar_sync_token text,
  add column if not exists google_calendar_sincronizado_em timestamptz;

-- Estado do evento no Google (agendado/desmarcado) é sempre distinto do
-- status operacional da reunião em si (nao_agendada/agendada/realizada/...)
-- — evento confirmado no Calendar NUNCA significa reunião realizada, isso
-- continua sendo uma confirmação manual do consultor.
alter table public.reunioes
  add column if not exists google_event_id text,
  add column if not exists google_calendar_id text,
  add column if not exists google_meet_link text,
  add column if not exists origem text not null default 'manual' check (origem in ('manual', 'google_calendar')),
  add column if not exists google_status text check (google_status in ('confirmed', 'cancelled'));

create unique index if not exists reunioes_google_evento_idx
  on public.reunioes (google_calendar_id, google_event_id)
  where google_event_id is not null;

-- Cache dos eventos sincronizados dos calendários dos consultores, com
-- sugestão automática de cliente/tipo (a "regra pra identificar de quem é
-- quem"), à espera de o consultor confirmar o vínculo. Nenhum evento vira
-- reunião sozinho — a tabela `reunioes` só é tocada quando alguém vincula.
create table if not exists public.google_calendar_eventos_pendentes (
  id uuid primary key default gen_random_uuid(),
  consultor_id uuid not null references public.consultores(id) on delete cascade,
  google_calendar_id text not null,
  google_event_id text not null,
  titulo text,
  descricao text,
  data_inicio timestamptz,
  data_fim timestamptz,
  meet_link text,
  attendees jsonb,
  status_google text not null check (status_google in ('confirmed', 'cancelled')),
  reuniao_id uuid references public.reunioes(id) on delete set null,
  sugestao_cliente_id uuid references public.clientes(id) on delete set null,
  sugestao_tipo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists google_calendar_eventos_pendentes_evento_idx
  on public.google_calendar_eventos_pendentes (consultor_id, google_event_id);
create index if not exists google_calendar_eventos_pendentes_reuniao_idx
  on public.google_calendar_eventos_pendentes (reuniao_id);
create index if not exists google_calendar_eventos_pendentes_sugestao_idx
  on public.google_calendar_eventos_pendentes (sugestao_cliente_id);

alter table public.google_calendar_eventos_pendentes enable row level security;

create policy "google_calendar_eventos_pendentes_all_authenticated"
  on public.google_calendar_eventos_pendentes for all
  to authenticated
  using (true) with check (true);

create trigger google_calendar_eventos_pendentes_set_updated_at
  before update on public.google_calendar_eventos_pendentes
  for each row execute function public.set_updated_at();

-- Espelha em SQL a mesma sincronização de mão única que a UI já fazia
-- (reunião → marco do cliente), pra funcionar também quando quem grava a
-- reunião é a sincronização do Google Calendar (job server-side, sem
-- passar pelo front-end). Nunca sobrescreve uma data já realizada, nunca
-- marca como realizada sozinha, nunca mexe em cancelada.
create or replace function public.sincronizar_marco_cliente_from_reuniao()
returns trigger as $$
declare
  campo_realizado text;
  campo_agendado text;
begin
  if new.tipo not in ('kickoff', 'treinamento') then
    return new;
  end if;

  if new.tipo = 'kickoff' then
    campo_realizado := 'kickoff_realizado_em';
    campo_agendado := 'kickoff_agendado_para';
  else
    campo_realizado := 'treinamento_realizado_em';
    campo_agendado := 'treinamento_agendado_para';
  end if;

  if new.status = 'realizada' and new.data_hora is not null then
    execute format(
      'update public.clientes set %I = coalesce(%I, $1) where id = $2',
      campo_realizado, campo_realizado
    ) using new.data_hora, new.cliente_id;
  end if;

  if new.data_hora is not null and new.status <> 'cancelada' then
    execute format('update public.clientes set %I = $1 where id = $2', campo_agendado)
      using new.data_hora, new.cliente_id;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists reunioes_sincroniza_marco_cliente on public.reunioes;
create trigger reunioes_sincroniza_marco_cliente
  after insert or update on public.reunioes
  for each row execute function public.sincronizar_marco_cliente_from_reuniao();
