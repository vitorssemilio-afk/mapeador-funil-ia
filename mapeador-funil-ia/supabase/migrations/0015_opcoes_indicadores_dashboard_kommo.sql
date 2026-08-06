-- As opções da pergunta q5_indicadores_dashboard (migration 0014) eram
-- nomes genéricos de indicador. Troca pelos relatórios que existem de
-- verdade no painel de Análises do Kommo, pra a escolha do cliente já
-- mapear direto pra algo configurável no CRM.
update public.perguntas_formulario
set opcoes = '[
  {"value":"funil_vendas","label":"Funil de vendas — conversão por etapa"},
  {"value":"fontes_leads","label":"Fontes de leads — de onde vêm os contatos"},
  {"value":"carga_trabalho","label":"Carga de trabalho da equipe — leads por vendedor"},
  {"value":"metas","label":"Metas — indivíduo e equipe"},
  {"value":"previsao_vendas","label":"Previsão de vendas (forecast)"},
  {"value":"relatorio_eventos","label":"Relatório de eventos-alvo (ex: contrato assinado, pagamento confirmado)"},
  {"value":"tempo_resposta","label":"Tempo de resposta / SLA de atendimento"},
  {"value":"outro","label":"Outro","campoLivre":{"placeholder":"Qual indicador?"}}
]'::jsonb
where pergunta_id = 'q5_indicadores_dashboard';
