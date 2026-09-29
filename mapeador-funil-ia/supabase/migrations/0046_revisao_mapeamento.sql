-- "Responsável pela revisão" mostrado no topo da nova tela de revisão do
-- funil (Mapeamento.tsx) — independente do fluxo de status
-- (em_revisao_interna/pronto_kickoff/...), é só um registro de quem
-- confirmou ter revisado a versão atual e quando, via o botão "Marcar como
-- revisado".
alter table public.mapeamentos
  add column if not exists revisado_por_email text,
  add column if not exists revisado_em timestamptz;
