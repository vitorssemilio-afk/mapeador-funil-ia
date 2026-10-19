-- Remove a restrição de cadastro a e-mails @v4company.com (pedido do
-- Vitor): qualquer e-mail pode se cadastrar agora, e a validação vira
-- manual pelo administrador — mecanismo que já existe desde a migration
-- 0084 e não depende de domínio nenhum: o admin cria o consultor em
-- Consultores.tsx com o e-mail da pessoa e usa "Vincular conta"
-- (RPC vincular_consultor_a_conta_existente) depois que ela se cadastra.
-- Sem essa vinculação, a conta de login existe mas não enxerga nada (RLS
-- de clientes/implementações/etc. depende de ter um consultor vinculado)
-- — já é, na prática, o "aguardando aprovação".
--
-- A checagem equivalente no frontend (src/pages/Login.tsx) também foi
-- removida no mesmo commit.
drop trigger if exists restringir_dominio_cadastro_trigger on auth.users;
drop function if exists public.restringir_dominio_cadastro();
