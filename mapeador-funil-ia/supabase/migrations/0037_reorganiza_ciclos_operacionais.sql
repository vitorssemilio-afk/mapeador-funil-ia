-- Reorganiza o checklist de implementação pra refletir a operação real, em
-- 4 ciclos de 10 dias corridos contados do Kickoff (não mais "semanas" de
-- 7 dias). Substitui as fases antigas (Preparação do CRM / CRM em
-- configuração / Treinamento agendado / Automações I / Automações II /
-- Entrega) por 4 grupos únicos:
--   Ciclo 1 — Setup e Treinamento         (dias 1–10)
--   Ciclo 2 — Automações I e Check-in 1   (dias 11–20)
--   Ciclo 3 — Automações II e Check-in 2  (dias 21–30)
--   Ciclo 4 — Finalização e Entrega       (dias 31–40)
--
-- Nada do histórico é perdido: os grupos antigos são RENOMEADOS (mesmo id de
-- atividade, mesma linha de atividades_status com o progresso já marcado) —
-- só os itens novos pedidos aqui é que são inseridos do zero. E o registro
-- completo de antes de toda essa reformulação do cronograma (o checklist
-- fixo por semana original) continua arquivado, sem alterações, em
-- checklist_itens_implementacao/implementacao_checklist_marcado (ver
-- migration 0035) — nada é irrecuperável.

-- ============================================================
-- 1) Novo marco: Funil validado (mesma família de contratado_em,
-- funil_gerado_em, funil_revisado_em etc. — ver migration 0034).
-- ============================================================
alter table public.clientes add column if not exists funil_validado_em timestamptz;

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

  -- Novo: registra o instante em que o funil de fato vira 'funil_validado'
  -- (pode acontecer direto de 'kickoff_agendado' ou depois de uma rodada de
  -- 'ajustes_solicitados' — os dois casos contam).
  if new.status = 'funil_validado' and old.status is distinct from 'funil_validado' then
    update public.clientes set funil_validado_em = now()
      where id = new.cliente_id and funil_validado_em is null;
  end if;

  return new;
end;
$$;

-- ============================================================
-- 2) Renomeia os grupos existentes pros 4 ciclos novos — preserva id das
-- atividades e todo o progresso já marcado em atividades_status.
-- ============================================================
update public.atividades_cronograma
set ciclo = 'Ciclo 1 — Setup e Treinamento'
where ciclo in ('Preparação do CRM', 'CRM em configuração', 'Treinamento agendado');

update public.atividades_cronograma
set ciclo = 'Ciclo 2 — Automações I e Check-in 1'
where ciclo = 'Automações I';

update public.atividades_cronograma
set ciclo = 'Ciclo 3 — Automações II e Check-in 2'
where ciclo = 'Automações II';

update public.atividades_cronograma
set ciclo = 'Ciclo 4 — Finalização e Entrega'
where ciclo in ('Entrega', 'Critérios de Sucesso / Qualidade da Entrega');

-- "Conexão de canais" pertence operacionalmente ao Ciclo 2 (só libera depois
-- do treinamento — migration 0036 já ajustou a dependência dela), não ao
-- Ciclo 1 onde ficava fisicamente agrupada. Move o item, mantendo o id (e o
-- progresso já marcado, se houver).
update public.atividades_cronograma
set ciclo = 'Ciclo 2 — Automações I e Check-in 1'
where (nome ilike '%conexão de canais%' or nome ilike '%conexao de canais%')
  and ciclo = 'Ciclo 1 — Setup e Treinamento';

-- ============================================================
-- 3) Itens novos pedidos pra cada ciclo. "Kickoff realizado", "Funil
-- validado", "Conta Kommo solicitada/criada" e "Treinamento
-- agendado/realizado" NÃO viram atividade aqui — já são marcos com data
-- própria em `clientes`, mostrados como linhas virtuais no cronograma (ver
-- src/lib/atividadesCronograma.ts). "E-mail Kommo confirmado" também já
-- existe como atividade (o antigo item de pré-requisito).
--
-- As atividades do Ciclo 2 sujeitas ao gate do treinamento (conexão de
-- canais, WhatsApp, bots, automações) só liberam depois de
-- treinamento_realizado_em — a interface mostra "Bloqueado até realização
-- do treinamento" enquanto isso não acontece.
-- ============================================================
insert into public.atividades_cronograma (nome, ciclo, ordem, depende_de) values
  ('Pipeline criado', 'Ciclo 1 — Setup e Treinamento', 100, 'marco:kickoff_realizado_em'),
  ('Etapas criadas', 'Ciclo 1 — Setup e Treinamento', 101, 'marco:kickoff_realizado_em'),
  ('Motivos de perda criados', 'Ciclo 1 — Setup e Treinamento', 102, 'marco:kickoff_realizado_em'),

  ('WhatsApp conectado', 'Ciclo 2 — Automações I e Check-in 1', 100, 'marco:treinamento_realizado_em'),
  ('Automações prioritárias configuradas', 'Ciclo 2 — Automações I e Check-in 1', 101, 'marco:treinamento_realizado_em'),
  ('Bots configurados', 'Ciclo 2 — Automações I e Check-in 1', 102, 'marco:treinamento_realizado_em'),
  ('Testes realizados', 'Ciclo 2 — Automações I e Check-in 1', 103, 'marco:treinamento_realizado_em'),
  ('Check-in 1 realizado', 'Ciclo 2 — Automações I e Check-in 1', 104, null),

  ('Automações complementares configuradas', 'Ciclo 3 — Automações II e Check-in 2', 100, null),
  ('Ajustes realizados', 'Ciclo 3 — Automações II e Check-in 2', 101, null),
  ('Relatórios configurados', 'Ciclo 3 — Automações II e Check-in 2', 102, null),
  ('Dashboards configurados', 'Ciclo 3 — Automações II e Check-in 2', 103, null),
  ('Check-in 2 realizado', 'Ciclo 3 — Automações II e Check-in 2', 104, null),
  ('Desenvolvimento/configuração do pós-venda (quando aplicável)', 'Ciclo 3 — Automações II e Check-in 2', 105, null),

  ('Ajustes finais realizados', 'Ciclo 4 — Finalização e Entrega', 100, null),
  ('Critérios de entrega conferidos', 'Ciclo 4 — Finalização e Entrega', 101, null),
  ('Playbook entregue', 'Ciclo 4 — Finalização e Entrega', 102, null),
  ('Validação final realizada', 'Ciclo 4 — Finalização e Entrega', 103, null),
  ('Reunião final realizada', 'Ciclo 4 — Finalização e Entrega', 104, null),
  ('Entrega concluída', 'Ciclo 4 — Finalização e Entrega', 105, null);
