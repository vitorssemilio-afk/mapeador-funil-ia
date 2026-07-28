-- Fase 5: biblioteca de campos padrão editável, histórico de versões do
-- funil e regeneração com instruções extras.

-- ============================================================
-- campos_padrao: libera gestão para qualquer usuário autenticado.
-- É uma biblioteca compartilhada (sem dono por linha), usada como
-- vocabulário de referência pela IA — não faz sentido restringir por
-- usuário, só por estar autenticado (equipe interna).
-- ============================================================
create policy "campos_padrao_insert_authenticated"
  on public.campos_padrao for insert
  to authenticated
  with check (true);

create policy "campos_padrao_update_authenticated"
  on public.campos_padrao for update
  to authenticated
  using (true)
  with check (true);

create policy "campos_padrao_delete_authenticated"
  on public.campos_padrao for delete
  to authenticated
  using (true);

-- ============================================================
-- funis_gerados: histórico de versões. Cada regeneração grava uma
-- nova versão em vez de apagar a anterior; a versão "atual" é sempre
-- o maior número de versão para aquele mapeamento_id.
-- ============================================================
alter table public.funis_gerados
  add column if not exists versao integer not null default 1;

create index if not exists funis_gerados_mapeamento_versao_idx
  on public.funis_gerados(mapeamento_id, versao);
