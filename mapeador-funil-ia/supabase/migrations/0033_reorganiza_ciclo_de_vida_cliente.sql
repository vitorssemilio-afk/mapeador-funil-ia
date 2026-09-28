-- Reorganização do ciclo de vida do cliente (parte 2): backfill dos dados
-- existentes pro novo vocabulário de status, e expansão do status de
-- implementação de CRM pras novas fases (Preparação do CRM, CRM em
-- configuração, Treinamento agendado, Automações, Entrega, Adoção,
-- Concluído). Migração segura: nenhum registro existente perde
-- informação, só passa a usar o nome de status que reflete o que
-- realmente já tinha acontecido.

-- ============================================================
-- 1) Mapeamentos (vendas/pós-venda): 'concluido' virava um estado
-- ambíguo ("a IA terminou de gerar" ou "está tudo pronto?"). Registros
-- que já estavam em 'concluido' já passaram, na prática, pelo processo
-- inteiro sob a regra antiga — o equivalente delas no novo vocabulário é
-- 'funil_validado' (o funil já era considerado pronto pra virar
-- implementação). Daqui pra frente nenhum código novo escreve
-- 'concluido' — ele só existiria em registros que escaparem deste
-- backfill.
update public.mapeamentos
set status = 'funil_validado'
where status = 'concluido';

-- ============================================================
-- 2) Implementação de CRM: troca o texto do status (check constraint,
-- não é enum) preservando 1:1 a fase em que cada implementação já está.
-- ============================================================
alter table public.implementacoes_crm drop constraint if exists implementacoes_crm_status_check;

update public.implementacoes_crm set status = 'preparacao_crm' where status = 'pre_requisito';
update public.implementacoes_crm set status = 'crm_em_configuracao' where status = 'semana_1';
update public.implementacoes_crm set status = 'treinamento_agendado' where status = 'semana_2';
update public.implementacoes_crm set status = 'automacoes' where status = 'semana_3';
update public.implementacoes_crm set status = 'entrega' where status = 'semana_4';
-- 'concluida' e 'cancelada' mantêm o mesmo nome.

alter table public.implementacoes_crm add constraint implementacoes_crm_status_check check (status in (
  'preparacao_crm', 'crm_em_configuracao', 'treinamento_agendado', 'automacoes', 'entrega', 'adocao',
  'concluida', 'cancelada'
));

alter table public.implementacao_status_historico drop constraint if exists implementacao_status_historico_status_anterior_check;
alter table public.implementacao_status_historico drop constraint if exists implementacao_status_historico_status_novo_check;

update public.implementacao_status_historico set status_anterior = 'preparacao_crm' where status_anterior = 'pre_requisito';
update public.implementacao_status_historico set status_anterior = 'crm_em_configuracao' where status_anterior = 'semana_1';
update public.implementacao_status_historico set status_anterior = 'treinamento_agendado' where status_anterior = 'semana_2';
update public.implementacao_status_historico set status_anterior = 'automacoes' where status_anterior = 'semana_3';
update public.implementacao_status_historico set status_anterior = 'entrega' where status_anterior = 'semana_4';

update public.implementacao_status_historico set status_novo = 'preparacao_crm' where status_novo = 'pre_requisito';
update public.implementacao_status_historico set status_novo = 'crm_em_configuracao' where status_novo = 'semana_1';
update public.implementacao_status_historico set status_novo = 'treinamento_agendado' where status_novo = 'semana_2';
update public.implementacao_status_historico set status_novo = 'automacoes' where status_novo = 'semana_3';
update public.implementacao_status_historico set status_novo = 'entrega' where status_novo = 'semana_4';

-- ============================================================
-- 3) Checklist: renomeia as chaves/títulos dos grupos do POP pra bater
-- com os novos nomes de fase. O CONTEÚDO dos itens não muda aqui — só o
-- rótulo da fase em que cada grupo aparece.
-- ============================================================
update public.checklist_grupos_implementacao set chave = 'preparacao_crm', titulo = 'Preparação do CRM — Formulário de Pré-Configuração' where chave = 'pre_requisito';
update public.checklist_grupos_implementacao set chave = 'crm_em_configuracao_sessao1', titulo = 'CRM em configuração — Sessão 1 (Gestor)' where chave = 'semana_1_sessao1';
update public.checklist_grupos_implementacao set chave = 'crm_em_configuracao_sessao2', titulo = 'CRM em configuração — Sessão 2 (Time comercial)' where chave = 'semana_1_sessao2';
update public.checklist_grupos_implementacao set chave = 'treinamento_agendado', titulo = 'Treinamento agendado' where chave = 'semana_2';
update public.checklist_grupos_implementacao set chave = 'automacoes', titulo = 'Automações' where chave = 'semana_3';
update public.checklist_grupos_implementacao set chave = 'entrega', titulo = 'Entrega' where chave = 'semana_4';
