-- Achado ao confirmar se clientes antigos continuam funcionando normalmente
-- depois do Prompt 64: a migração 0087 ficou registrada como aplicada em
-- produção, mas a parte 2 (alter table clientes add column
-- canal_whatsapp_business/canal_instagram) nunca rodou de fato — mesmo
-- padrão de falha já visto nas migrações 0087 (parte 1, corrigida na 0097)
-- e 0096. A parte 1 desta migração (rename/categoria/depende_de das
-- atividades do checklist) está correta em produção; só as colunas
-- faltavam. Sem elas, toda a UI de canais do Bloco 3 (ClienteDetalhe.tsx)
-- falhava ao salvar (coluna inexistente) — já corrigido direto em produção
-- via execute_sql; esta migração só garante que um rebuild do banco a
-- partir do zero também fique correto.
alter table public.clientes
  add column if not exists canal_whatsapp_business boolean,
  add column if not exists canal_instagram boolean;
