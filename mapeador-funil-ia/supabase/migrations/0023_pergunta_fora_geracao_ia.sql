-- Permite marcar uma pergunta do formulário como "não incluir na geração do
-- funil por IA" — a resposta continua sendo coletada do cliente e aparece
-- normalmente em relatórios/planilha, só não entra no texto passado pro
-- prompt da IA em supabase/functions/gerar-funil.
alter table public.perguntas_formulario
  add column if not exists incluir_na_geracao_ia boolean not null default true;
