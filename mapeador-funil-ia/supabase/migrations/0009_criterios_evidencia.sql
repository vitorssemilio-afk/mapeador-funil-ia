-- Fase 2 do roadmap V4: os Critérios de Sucesso do POP pedem verificação
-- ("canais recebendo mensagens de fato", "relatórios exibindo dados
-- corretos"), não só configuração — um checkbox binário vira só um
-- lembrete e perde a força de controle de qualidade que o POP quer ter.

alter table public.checklist_itens_implementacao
  add column if not exists requer_evidencia boolean not null default false;

alter table public.implementacao_checklist_marcado
  add column if not exists evidencia text;

-- Marca os itens já existentes do grupo "Critérios de Sucesso" como
-- exigindo evidência (rodar mesmo que a implementação já tenha itens
-- marcados antes dessa mudança).
update public.checklist_itens_implementacao
set requer_evidencia = true
where grupo_id in (
  select id from public.checklist_grupos_implementacao where chave = 'criterios_sucesso'
);
