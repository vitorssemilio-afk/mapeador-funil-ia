-- Onboarding de novo usuário (prompt de "primeiro acesso ao CRM Flow") —
-- progresso guardado por consultor, nunca compartilhado entre usuários.
-- A policy de auto-edição já existente (migration 0082,
-- "consultores_update_self" + trigger restringir_autoedicao_consultor_a_avatar)
-- só BLOQUEIA nome/email/telefone/cargo/ativo/user_id/role quando quem
-- edita não é administrador — colunas novas não listadas ali já ficam
-- liberadas pro próprio consultor, sem precisar tocar no trigger.
alter table public.consultores
  add column if not exists onboarding_iniciado_em timestamptz,
  add column if not exists onboarding_concluido_em timestamptz,
  add column if not exists onboarding_pulado boolean not null default false,
  -- Último passo do tour visto (0-based) — permite retomar de onde parou
  -- em vez de reiniciar sempre do zero (seção 28 do pedido).
  add column if not exists onboarding_etapa int not null default 0,
  -- Chaves dos itens de "Primeiros passos" já marcados (ex:
  -- 'conhecer_home', 'abrir_cliente') — lista simples, não precisa de
  -- tabela própria pra um checklist de ~9 itens por usuário.
  add column if not exists primeiros_passos_concluidos text[] not null default '{}';

-- Usuários que já existem no momento desta migration NÃO podem receber o
-- onboarding automaticamente — ele é pra quem está chegando agora, não
-- pra quem já usa o produto (seção 26 do pedido). Marca como já concluído
-- só pra quem já existe; qualquer consultor novo cadastrado a partir daqui
-- continua com onboarding_concluido_em null e recebe a experiência normal
-- no primeiro login.
update public.consultores
set onboarding_concluido_em = now()
where onboarding_concluido_em is null;
