-- Novo status pro fluxo em que a IA identifica que faltam informações
-- críticas pra gerar um funil confiável e pede esclarecimento em vez de
-- inventar. As perguntas ficam em mapeamentos.respostas._perguntas_ia.

alter type public.mapeamento_status add value if not exists 'aguardando_esclarecimento';
