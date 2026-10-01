-- P3-B1: justificativa_nao_aplica era obrigatória só em código (checado na
-- UI antes de salvar) — qualquer escrita direta na tabela (SQL manual, script,
-- bug futuro de UI) podia gravar status='nao_se_aplica' sem justificativa
-- nenhuma. Vira constraint de banco, a garantia de verdade.
--
-- Backfill primeiro: se alguma linha já existente violaria a constraint
-- (status='nao_se_aplica' sem justificativa), registra um texto explícito
-- em vez de travar a migration — não existe como "adivinhar" a justificativa
-- original, e perder a marcação de "não se aplica" seria pior.
update public.criterios_entrega_status
set justificativa_nao_aplica = 'Justificativa não registrada no momento da marcação (preenchida retroativamente pela migration 0069).'
where status = 'nao_se_aplica'
  and (justificativa_nao_aplica is null or btrim(justificativa_nao_aplica) = '');

alter table public.criterios_entrega_status drop constraint if exists criterio_nao_aplica_exige_justificativa;
alter table public.criterios_entrega_status
  add constraint criterio_nao_aplica_exige_justificativa
  check (status <> 'nao_se_aplica' or (justificativa_nao_aplica is not null and btrim(justificativa_nao_aplica) <> ''));
