-- Fase 3 do roadmap V4: itens de checklist derivados automaticamente do
-- funil gerado por IA pra cada implementação (Semana 1 = funis/cards/
-- campos/gatilhos, Semana 2 = automações/mensagens/motivos de perda),
-- eliminando a duplicação de montar esse checklist na mão pra cada
-- cliente. implementacao_id null = item do template global do POP
-- (compartilhado entre todo mundo); preenchido = item específico daquela
-- implementação, gerado a partir do funil dela.

alter table public.checklist_itens_implementacao
  add column if not exists implementacao_id uuid references public.implementacoes_crm(id) on delete cascade;

create index if not exists checklist_itens_implementacao_implementacao_id_idx
  on public.checklist_itens_implementacao(implementacao_id);
