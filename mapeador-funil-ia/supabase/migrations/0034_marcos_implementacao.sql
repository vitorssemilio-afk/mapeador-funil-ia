-- Substitui a lógica de prazo baseada só em "data de início" por marcos
-- explícitos do ciclo de vida do cliente. Cada marco é uma coluna própria em
-- `clientes` (o cliente é a entidade que atravessa mapeamento + implementação
-- — um marco como "Kickoff realizado" pode acontecer antes de existir uma
-- linha em implementacoes_crm).
--
-- Regra principal: o contador oficial dos 40 dias da implementação passa a
-- contar só a partir de kickoff_realizado_em — nunca da contratação, do
-- envio/resposta do formulário ou da criação da conta Kommo.
alter table public.clientes
  add column if not exists contratado_em date,
  add column if not exists formulario_enviado_em timestamptz,
  add column if not exists formulario_respondido_em timestamptz,
  add column if not exists funil_gerado_em timestamptz,
  add column if not exists funil_revisado_em timestamptz,
  add column if not exists kickoff_agendado_para date,
  add column if not exists kickoff_realizado_em timestamptz,
  add column if not exists conta_kommo_solicitada_em timestamptz,
  add column if not exists conta_kommo_criada_em timestamptz,
  add column if not exists treinamento_agendado_para date,
  add column if not exists treinamento_realizado_em timestamptz,
  add column if not exists extensao_14_solicitada_em date,
  add column if not exists extensao_14_aprovada_em date,
  add column if not exists extensao_7_solicitada_em date,
  add column if not exists extensao_7_aprovada_em date,
  add column if not exists implementacao_concluida_em timestamptz;

-- checkpoint_30d_respondido_em não vira coluna nova — já existe como
-- checkpoints_adocao.respondido_em (por implementação), lido diretamente
-- de lá pra não duplicar dado.

-- ============================================================
-- Backfill honesto: só preenche o que dá pra inferir com confiança dos
-- dados que já existem. O que não tem fonte histórica fica null (nunca
-- inventado) — nenhuma data antiga é apagada por essa migration.
-- ============================================================

-- formulario_respondido_em: já rastreado com precisão em mapeamentos.enviado_em.
update public.clientes c
set formulario_respondido_em = m.enviado_em
from public.mapeamentos m
where m.cliente_id = c.id and m.tipo = 'vendas' and m.enviado_em is not null
  and c.formulario_respondido_em is null;

-- funil_gerado_em: não existe histórico por-status de mapeamento (só de
-- implementação) — updated_at do mapeamento de vendas é a melhor aproximação
-- disponível pra quem já passou do estágio "funil gerado".
update public.clientes c
set funil_gerado_em = m.updated_at
from public.mapeamentos m
where m.cliente_id = c.id and m.tipo = 'vendas'
  and m.status in (
    'funil_gerado', 'em_revisao_interna', 'pronto_kickoff', 'kickoff_agendado',
    'ajustes_solicitados', 'funil_validado', 'concluido'
  )
  and c.funil_gerado_em is null;

-- kickoff_realizado_em: toda implementação já criada, no modelo antigo, só
-- existia depois do funil considerado pronto (equivalente a Kickoff
-- realizado) — a criação da implementação é a melhor aproximação disponível.
update public.clientes c
set kickoff_realizado_em = i.created_at
from public.implementacoes_crm i
where i.cliente_id = c.id and c.kickoff_realizado_em is null;

-- conta_kommo_criada_em: sem histórico exato de quando o campo virou true —
-- updated_at da implementação é a aproximação disponível.
update public.clientes c
set conta_kommo_criada_em = i.updated_at
from public.implementacoes_crm i
where i.cliente_id = c.id and i.conta_criada_via_v4 and c.conta_kommo_criada_em is null;

-- treinamento_realizado_em e implementacao_concluida_em: esses SIM têm
-- registro exato no histórico de status da implementação.
update public.clientes c
set treinamento_realizado_em = h.alterado_em
from public.implementacoes_crm i
join public.implementacao_status_historico h
  on h.implementacao_id = i.id and h.status_novo = 'automacoes'
where i.cliente_id = c.id and c.treinamento_realizado_em is null;

update public.clientes c
set implementacao_concluida_em = h.alterado_em
from public.implementacoes_crm i
join public.implementacao_status_historico h
  on h.implementacao_id = i.id and h.status_novo = 'concluida'
where i.cliente_id = c.id and c.implementacao_concluida_em is null;

-- ============================================================
-- Triggers: registram automaticamente os marcos que o produto já consegue
-- detectar sozinho, na primeira vez que acontecem (nunca sobrescreve um
-- marco já preenchido — corrigir manualmente sempre tem prioridade).
-- ============================================================

create or replace function public.registrar_marcos_mapeamento()
returns trigger
language plpgsql
as $$
begin
  if new.cliente_id is null or new.tipo <> 'vendas' then
    return new;
  end if;

  if new.enviado_em is not null and old.enviado_em is null then
    update public.clientes set formulario_respondido_em = new.enviado_em
      where id = new.cliente_id and formulario_respondido_em is null;
  end if;

  if new.status = 'funil_gerado' and old.status is distinct from 'funil_gerado' then
    update public.clientes set funil_gerado_em = now()
      where id = new.cliente_id and funil_gerado_em is null;
  end if;

  if new.status = 'pronto_kickoff' and old.status = 'em_revisao_interna' then
    update public.clientes set funil_revisado_em = now()
      where id = new.cliente_id and funil_revisado_em is null;
  end if;

  if old.status = 'kickoff_agendado' and new.status in ('funil_validado', 'ajustes_solicitados') then
    update public.clientes set kickoff_realizado_em = now()
      where id = new.cliente_id and kickoff_realizado_em is null;
  end if;

  return new;
end;
$$;

drop trigger if exists mapeamentos_registrar_marcos on public.mapeamentos;
create trigger mapeamentos_registrar_marcos
  after update on public.mapeamentos
  for each row execute function public.registrar_marcos_mapeamento();

create or replace function public.registrar_marcos_implementacao()
returns trigger
language plpgsql
as $$
begin
  if new.cliente_id is null then
    return new;
  end if;

  if new.conta_criada_via_v4 and not old.conta_criada_via_v4 then
    update public.clientes set conta_kommo_criada_em = now()
      where id = new.cliente_id and conta_kommo_criada_em is null;
  end if;

  if new.status = 'automacoes' and old.status = 'treinamento_agendado' then
    update public.clientes set treinamento_realizado_em = now()
      where id = new.cliente_id and treinamento_realizado_em is null;
  end if;

  if new.status = 'concluida' and old.status is distinct from 'concluida' then
    update public.clientes set implementacao_concluida_em = now()
      where id = new.cliente_id and implementacao_concluida_em is null;
  end if;

  return new;
end;
$$;

drop trigger if exists implementacoes_crm_registrar_marcos on public.implementacoes_crm;
create trigger implementacoes_crm_registrar_marcos
  after update on public.implementacoes_crm
  for each row execute function public.registrar_marcos_implementacao();
