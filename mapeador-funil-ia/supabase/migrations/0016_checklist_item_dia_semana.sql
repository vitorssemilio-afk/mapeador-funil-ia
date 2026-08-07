-- Dia (1 a 7) dentro da janela de 7 dias corridos da semana/grupo em que o
-- item deveria ser feito, contado a partir da data em que a implementação
-- entrou naquele status (implementacao_status_historico). Usado pra montar
-- a Agenda diária de tarefas por cliente. Null = sem prazo definido (ex:
-- itens derivados automaticamente do funil), o item não aparece na agenda.
alter table public.checklist_itens_implementacao
  add column if not exists dia_semana smallint check (dia_semana between 1 and 7);
