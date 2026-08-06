-- Pergunta nova no formulário: quais indicadores o cliente quer acompanhar
-- num painel dentro do CRM. A resposta alimenta a IA na hora de gerar o
-- funil, que devolve sugestões concretas de indicadores/relatórios pro
-- Kommo em geracoes_meta.indicadores_dashboard.

alter table public.geracoes_meta
  add column if not exists indicadores_dashboard jsonb not null default '[]'::jsonb;

do $$
declare
  bloco_metas uuid;
  proxima_ordem int;
begin
  select id into bloco_metas from public.blocos_formulario where titulo = 'Sua Equipe e Suas Metas';

  if bloco_metas is null then
    raise exception 'Bloco "Sua Equipe e Suas Metas" não encontrado — as migrations anteriores (0011) precisam ter rodado antes desta.';
  end if;

  if exists (select 1 from public.perguntas_formulario where pergunta_id = 'q5_indicadores_dashboard') then
    return;
  end if;

  select coalesce(max(ordem), -1) + 1 into proxima_ordem
  from public.perguntas_formulario
  where bloco_id = bloco_metas;

  insert into public.perguntas_formulario
    (bloco_id, pergunta_id, ordem, tipo, label, helper, opcoes, obrigatoria, condicao_pergunta_id, condicao_valores)
  values
    (bloco_metas, 'q5_indicadores_dashboard', proxima_ordem, 'escolha_multipla',
      'Quais indicadores você gostaria de acompanhar num painel dentro do CRM?',
      'Isso ajuda a gente a já deixar configurados os relatórios certos pra você acompanhar o comercial de perto.',
      '[
        {"value":"conversao_por_etapa","label":"Taxa de conversão por etapa do funil"},
        {"value":"ticket_medio","label":"Ticket médio"},
        {"value":"tempo_resposta","label":"Tempo médio de primeira resposta"},
        {"value":"motivos_perda","label":"Motivos de perda mais comuns"},
        {"value":"desempenho_vendedor","label":"Desempenho por vendedor/consultor"},
        {"value":"faturamento_periodo","label":"Faturamento por período"},
        {"value":"origem_canal","label":"Vendas por canal de origem"},
        {"value":"outro","label":"Outro","campoLivre":{"placeholder":"Qual indicador?"}}
      ]'::jsonb, false, null, null);
end $$;
