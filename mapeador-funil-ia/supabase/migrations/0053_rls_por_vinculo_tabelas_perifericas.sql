-- Revisão de segurança (fase 2, etapa 3) — primeira leva de troca de RLS
-- de "toda a equipe vê tudo" para "só quem tem vínculo com o cliente (ou é
-- administrador) vê". Esta leva cobre as tabelas PERIFÉRICAS, penduradas
-- em cliente_id/implementacao_id (ou em mapeamento_id, um passo atrás) —
-- todas de risco individual menor que as tabelas centrais
-- (clientes/implementacoes_crm/mapeamentos/funis_gerados), que ficam pra
-- uma migration separada logo em seguida, já testada com o time depois
-- desta aqui.
--
-- Continuam DE FORA desta restrição, de propósito:
--   - blocos_formulario / perguntas_formulario / criterios_entrega: são
--     TEMPLATE, iguais pra todo mundo, não são dado de cliente.
--   - checklist_grupos_implementacao / checklist_itens_implementacao /
--     implementacao_checklist_marcado: legado morto, não lido pelo app.
--   - configuracoes_pipefy: configuração única e global do produto.
--   - consultores: já tratada na etapa 1 (fase 2).
--
-- Usa as funções tenho_acesso_ao_cliente/tenho_acesso_a_implementacao
-- criadas na migration 0051. Adiciona aqui tenho_acesso_ao_mapeamento, que
-- as tabelas penduradas em mapeamento_id (funis_gerados, geracoes_meta,
-- funil_versoes) usam pra não duplicar a mesma subquery em cada uma.

create or replace function public.tenho_acesso_ao_mapeamento(p_mapeamento_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    public.sou_administrador()
    or exists (
      select 1 from public.mapeamentos m
      where m.id = p_mapeamento_id
        and m.cliente_id is not null
        and public.tenho_acesso_ao_cliente(m.cliente_id)
    );
$$;

revoke all on function public.tenho_acesso_ao_mapeamento(uuid) from public;
grant execute on function public.tenho_acesso_ao_mapeamento(uuid) to authenticated;

-- ============================================================
-- Cluster mapeamento (mapeamentos, funis_gerados, geracoes_meta,
-- funil_versoes) — cada um preso a mapeamento_id, exceto mapeamentos que
-- já tem cliente_id direto.
-- ============================================================
drop policy if exists "mapeamentos_all_authenticated" on public.mapeamentos;
drop policy if exists "mapeamentos_por_vinculo" on public.mapeamentos;
create policy "mapeamentos_por_vinculo"
  on public.mapeamentos for all
  to authenticated
  using (public.sou_administrador() or (cliente_id is not null and public.tenho_acesso_ao_cliente(cliente_id)))
  with check (public.sou_administrador() or (cliente_id is not null and public.tenho_acesso_ao_cliente(cliente_id)));

drop policy if exists "funis_gerados_all_authenticated" on public.funis_gerados;
drop policy if exists "funis_gerados_por_vinculo" on public.funis_gerados;
create policy "funis_gerados_por_vinculo"
  on public.funis_gerados for all
  to authenticated
  using (public.tenho_acesso_ao_mapeamento(mapeamento_id))
  with check (public.tenho_acesso_ao_mapeamento(mapeamento_id));

drop policy if exists "geracoes_meta_all_authenticated" on public.geracoes_meta;
drop policy if exists "geracoes_meta_por_vinculo" on public.geracoes_meta;
create policy "geracoes_meta_por_vinculo"
  on public.geracoes_meta for all
  to authenticated
  using (public.tenho_acesso_ao_mapeamento(mapeamento_id))
  with check (public.tenho_acesso_ao_mapeamento(mapeamento_id));

drop policy if exists "funil_versoes_all_authenticated" on public.funil_versoes;
drop policy if exists "funil_versoes_por_vinculo" on public.funil_versoes;
create policy "funil_versoes_por_vinculo"
  on public.funil_versoes for all
  to authenticated
  using (public.tenho_acesso_ao_mapeamento(mapeamento_id))
  with check (public.tenho_acesso_ao_mapeamento(mapeamento_id));

-- ============================================================
-- Tabelas presas direto em cliente_id.
-- ============================================================
drop policy if exists "cliente_observacoes_all_authenticated" on public.cliente_observacoes;
drop policy if exists "cliente_observacoes_por_vinculo" on public.cliente_observacoes;
create policy "cliente_observacoes_por_vinculo"
  on public.cliente_observacoes for all
  to authenticated
  using (public.tenho_acesso_ao_cliente(cliente_id))
  with check (public.tenho_acesso_ao_cliente(cliente_id));

drop policy if exists "cliente_arquivos_all_authenticated" on public.cliente_arquivos;
drop policy if exists "cliente_arquivos_por_vinculo" on public.cliente_arquivos;
create policy "cliente_arquivos_por_vinculo"
  on public.cliente_arquivos for all
  to authenticated
  using (public.tenho_acesso_ao_cliente(cliente_id))
  with check (public.tenho_acesso_ao_cliente(cliente_id));

drop policy if exists "cliente_contatos_all_authenticated" on public.cliente_contatos;
drop policy if exists "cliente_contatos_por_vinculo" on public.cliente_contatos;
create policy "cliente_contatos_por_vinculo"
  on public.cliente_contatos for all
  to authenticated
  using (public.tenho_acesso_ao_cliente(cliente_id))
  with check (public.tenho_acesso_ao_cliente(cliente_id));

drop policy if exists "cliente_ocorrencias_all_authenticated" on public.cliente_ocorrencias;
drop policy if exists "cliente_ocorrencias_por_vinculo" on public.cliente_ocorrencias;
create policy "cliente_ocorrencias_por_vinculo"
  on public.cliente_ocorrencias for all
  to authenticated
  using (public.tenho_acesso_ao_cliente(cliente_id))
  with check (public.tenho_acesso_ao_cliente(cliente_id));

drop policy if exists "marco_remarcacoes_all_authenticated" on public.marco_remarcacoes;
drop policy if exists "marco_remarcacoes_por_vinculo" on public.marco_remarcacoes;
create policy "marco_remarcacoes_por_vinculo"
  on public.marco_remarcacoes for all
  to authenticated
  using (public.tenho_acesso_ao_cliente(cliente_id))
  with check (public.tenho_acesso_ao_cliente(cliente_id));

drop policy if exists "reunioes_all_authenticated" on public.reunioes;
drop policy if exists "reunioes_por_vinculo" on public.reunioes;
create policy "reunioes_por_vinculo"
  on public.reunioes for all
  to authenticated
  using (public.tenho_acesso_ao_cliente(cliente_id))
  with check (public.tenho_acesso_ao_cliente(cliente_id));

drop policy if exists "reuniao_remarcacoes_all_authenticated" on public.reuniao_remarcacoes;
drop policy if exists "reuniao_remarcacoes_por_vinculo" on public.reuniao_remarcacoes;
create policy "reuniao_remarcacoes_por_vinculo"
  on public.reuniao_remarcacoes for all
  to authenticated
  using (exists (
    select 1 from public.reunioes r
    where r.id = reuniao_remarcacoes.reuniao_id
      and public.tenho_acesso_ao_cliente(r.cliente_id)
  ))
  with check (exists (
    select 1 from public.reunioes r
    where r.id = reuniao_remarcacoes.reuniao_id
      and public.tenho_acesso_ao_cliente(r.cliente_id)
  ));

-- ============================================================
-- Tabelas presas direto em implementacao_id.
-- ============================================================
drop policy if exists "funis_kommo_criacoes_all_authenticated" on public.funis_kommo_criacoes;
drop policy if exists "funis_kommo_criacoes_por_vinculo" on public.funis_kommo_criacoes;
create policy "funis_kommo_criacoes_por_vinculo"
  on public.funis_kommo_criacoes for all
  to authenticated
  using (public.tenho_acesso_a_implementacao(implementacao_id))
  with check (public.tenho_acesso_a_implementacao(implementacao_id));

drop policy if exists "checkpoints_adocao_all_authenticated" on public.checkpoints_adocao;
drop policy if exists "checkpoints_adocao_por_vinculo" on public.checkpoints_adocao;
create policy "checkpoints_adocao_por_vinculo"
  on public.checkpoints_adocao for all
  to authenticated
  using (public.tenho_acesso_a_implementacao(implementacao_id))
  with check (public.tenho_acesso_a_implementacao(implementacao_id));

drop policy if exists "checkpoint_acompanhamentos_all_authenticated" on public.checkpoint_acompanhamentos;
drop policy if exists "checkpoint_acompanhamentos_por_vinculo" on public.checkpoint_acompanhamentos;
create policy "checkpoint_acompanhamentos_por_vinculo"
  on public.checkpoint_acompanhamentos for all
  to authenticated
  using (public.tenho_acesso_a_implementacao(implementacao_id))
  with check (public.tenho_acesso_a_implementacao(implementacao_id));

drop policy if exists "criterios_entrega_status_all_authenticated" on public.criterios_entrega_status;
drop policy if exists "criterios_entrega_status_por_vinculo" on public.criterios_entrega_status;
create policy "criterios_entrega_status_por_vinculo"
  on public.criterios_entrega_status for all
  to authenticated
  using (public.tenho_acesso_a_implementacao(implementacao_id))
  with check (public.tenho_acesso_a_implementacao(implementacao_id));

drop policy if exists "atividades_status_all_authenticated" on public.atividades_status;
drop policy if exists "atividades_status_por_vinculo" on public.atividades_status;
create policy "atividades_status_por_vinculo"
  on public.atividades_status for all
  to authenticated
  using (public.tenho_acesso_a_implementacao(implementacao_id))
  with check (public.tenho_acesso_a_implementacao(implementacao_id));

drop policy if exists "implementacao_consultor_historico_all_authenticated" on public.implementacao_consultor_historico;
drop policy if exists "implementacao_consultor_historico_por_vinculo" on public.implementacao_consultor_historico;
create policy "implementacao_consultor_historico_por_vinculo"
  on public.implementacao_consultor_historico for all
  to authenticated
  using (public.tenho_acesso_a_implementacao(implementacao_id))
  with check (public.tenho_acesso_a_implementacao(implementacao_id));

-- atividades_cronograma: linhas de TEMPLATE (implementacao_id is null)
-- continuam abertas pra equipe toda (são configuração compartilhada, ver
-- tela /implementacoes/checklist) — só as linhas DERIVADAS de uma
-- implementação específica passam a exigir vínculo.
drop policy if exists "atividades_cronograma_all_authenticated" on public.atividades_cronograma;
drop policy if exists "atividades_cronograma_por_vinculo" on public.atividades_cronograma;
create policy "atividades_cronograma_por_vinculo"
  on public.atividades_cronograma for all
  to authenticated
  using (implementacao_id is null or public.tenho_acesso_a_implementacao(implementacao_id))
  with check (implementacao_id is null or public.tenho_acesso_a_implementacao(implementacao_id));

-- credenciais_crm / credenciais_api_kommo: só tinham policy de DELETE
-- (select/insert/update sempre foram só via RPC SECURITY DEFINER, ver
-- migrations 0006/0012/0050) — essa policy de delete também passa a exigir
-- vínculo.
drop policy if exists "credenciais_crm_delete_authenticated" on public.credenciais_crm;
drop policy if exists "credenciais_crm_delete_por_vinculo" on public.credenciais_crm;
create policy "credenciais_crm_delete_por_vinculo"
  on public.credenciais_crm for delete
  to authenticated
  using (public.tenho_acesso_a_implementacao(implementacao_id));

drop policy if exists "credenciais_api_kommo_delete_authenticated" on public.credenciais_api_kommo;
drop policy if exists "credenciais_api_kommo_delete_por_vinculo" on public.credenciais_api_kommo;
create policy "credenciais_api_kommo_delete_por_vinculo"
  on public.credenciais_api_kommo for delete
  to authenticated
  using (public.tenho_acesso_a_implementacao(implementacao_id));

-- ============================================================
-- Bucket de anexos (storage.objects, bucket 'cliente-anexos') — o caminho
-- de cada arquivo é sempre "<cliente_id>/<timestamp>-<nome>" (ver
-- handleUploadArquivos em src/pages/ClienteDetalhe.tsx), então dá pra
-- checar o vínculo direto pelo primeiro segmento do caminho.
-- ============================================================
drop policy if exists "cliente_anexos_select_authenticated" on storage.objects;
drop policy if exists "cliente_anexos_select_por_vinculo" on storage.objects;
create policy "cliente_anexos_select_por_vinculo"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'cliente-anexos'
    and public.tenho_acesso_ao_cliente(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "cliente_anexos_insert_authenticated" on storage.objects;
drop policy if exists "cliente_anexos_insert_por_vinculo" on storage.objects;
create policy "cliente_anexos_insert_por_vinculo"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'cliente-anexos'
    and public.tenho_acesso_ao_cliente(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "cliente_anexos_delete_authenticated" on storage.objects;
drop policy if exists "cliente_anexos_delete_por_vinculo" on storage.objects;
create policy "cliente_anexos_delete_por_vinculo"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'cliente-anexos'
    and public.tenho_acesso_ao_cliente(((storage.foldername(name))[1])::uuid)
  );
