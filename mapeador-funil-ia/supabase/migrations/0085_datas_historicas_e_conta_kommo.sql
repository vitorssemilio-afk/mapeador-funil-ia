-- Atualização histórica de clientes em andamento (prompt 51): até aqui,
-- concluir uma atividade do checklist ou marcar "Conta Kommo criada via V4"
-- sempre gravava a data/hora ATUAL (new Date()/now()), mesmo quando o
-- consultor está só registrando HOJE algo que aconteceu semanas atrás. Isso
-- cria dois RPCs novos que aceitam a data real como parâmetro, validam
-- (nunca no futuro; solicitação nunca depois da criação da conta Kommo) e
-- registram auditoria de quem mudou o quê — sem duplicar a lógica de acesso
-- por vínculo (reusam tenho_acesso_a_implementacao/tenho_acesso_ao_cliente)
-- nem inventar datas que não foram informadas (ver src/lib/atividadesCronograma.ts
-- resolverMarcoSimples, que passa a tratar "Conta Kommo criada" sem
-- "Conta Kommo solicitada" registrada como concluído-sem-data, não como
-- bloqueado por dependência).

create or replace function public.concluir_atividade_com_data(
  p_atividade_id uuid,
  p_implementacao_id uuid,
  p_data_real timestamptz
)
returns public.atividades_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.atividades_status;
  v_anterior timestamptz;
  v_nome text;
  v_cliente_id uuid;
begin
  if not public.tenho_acesso_a_implementacao(p_implementacao_id) then
    raise exception 'Você não tem acesso a esta implementação.' using errcode = '42501';
  end if;

  if p_data_real is not null and p_data_real > now() then
    raise exception 'A data de conclusão não pode estar no futuro.';
  end if;

  select nome into v_nome from public.atividades_cronograma where id = p_atividade_id;
  select cliente_id into v_cliente_id from public.implementacoes_crm where id = p_implementacao_id;
  select data_real into v_anterior
    from public.atividades_status
    where implementacao_id = p_implementacao_id and atividade_id = p_atividade_id;

  insert into public.atividades_status (implementacao_id, atividade_id, data_real)
  values (p_implementacao_id, p_atividade_id, p_data_real)
  on conflict (implementacao_id, atividade_id)
    do update set data_real = excluded.data_real, updated_at = now()
  returning * into v_row;

  perform public.registrar_auditoria(
    case when p_data_real is null then 'atividade_desmarcada' else 'atividade_data_conclusao_alterada' end,
    'atividades_status',
    v_row.id,
    v_cliente_id,
    p_implementacao_id,
    jsonb_build_object('atividade', coalesce(v_nome, p_atividade_id::text), 'data_anterior', v_anterior, 'data_nova', p_data_real)
  );

  return v_row;
end;
$$;

revoke all on function public.concluir_atividade_com_data(uuid, uuid, timestamptz) from public;
grant execute on function public.concluir_atividade_com_data(uuid, uuid, timestamptz) to authenticated;

-- Marcos do cliente que podem ser corrigidos retroativamente por aqui.
-- Kickoff/Treinamento ficam de fora de propósito: já têm par
-- agendado/realizado + remarcação própria no módulo de Reuniões (ver
-- reuniao_remarcacoes, migration 0041) — essa já É a fonte oficial de data
-- real pra esses dois, então não criamos uma segunda data concorrente aqui.
create or replace function public.atualizar_data_marco_cliente(
  p_cliente_id uuid,
  p_marco text,
  p_nova_data timestamptz
)
returns public.clientes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente public.clientes;
  v_anterior timestamptz;
begin
  if not public.tenho_acesso_ao_cliente(p_cliente_id) then
    raise exception 'Você não tem acesso a este cliente.' using errcode = '42501';
  end if;

  if p_nova_data is not null and p_nova_data > now() then
    raise exception 'A data não pode estar no futuro.';
  end if;

  select * into v_cliente from public.clientes where id = p_cliente_id;
  if not found then
    raise exception 'Cliente não encontrado.';
  end if;

  if p_marco = 'conta_kommo_solicitada_em' then
    v_anterior := v_cliente.conta_kommo_solicitada_em;
    if p_nova_data is not null and v_cliente.conta_kommo_criada_em is not null
       and p_nova_data > v_cliente.conta_kommo_criada_em then
      raise exception 'A data de solicitação não pode ser depois da criação da conta Kommo.';
    end if;
    update public.clientes set conta_kommo_solicitada_em = p_nova_data where id = p_cliente_id;

  elsif p_marco = 'conta_kommo_criada_em' then
    v_anterior := v_cliente.conta_kommo_criada_em;
    if p_nova_data is not null and v_cliente.conta_kommo_solicitada_em is not null
       and p_nova_data < v_cliente.conta_kommo_solicitada_em then
      raise exception 'A data de criação não pode ser antes da solicitação da conta Kommo.';
    end if;
    update public.clientes set conta_kommo_criada_em = p_nova_data where id = p_cliente_id;

  elsif p_marco = 'contratacao_kommo_solicitada_em' then
    v_anterior := v_cliente.contratacao_kommo_solicitada_em;
    update public.clientes set contratacao_kommo_solicitada_em = p_nova_data where id = p_cliente_id;

  elsif p_marco = 'funil_validado_em' then
    v_anterior := v_cliente.funil_validado_em;
    update public.clientes set funil_validado_em = p_nova_data where id = p_cliente_id;

  elsif p_marco = 'implementacao_concluida_em' then
    v_anterior := v_cliente.implementacao_concluida_em;
    update public.clientes set implementacao_concluida_em = p_nova_data where id = p_cliente_id;

  else
    raise exception 'Marco desconhecido: %', p_marco;
  end if;

  select * into v_cliente from public.clientes where id = p_cliente_id;

  perform public.registrar_auditoria(
    'marco_data_alterada',
    'clientes',
    p_cliente_id,
    p_cliente_id,
    null,
    jsonb_build_object('marco', p_marco, 'data_anterior', v_anterior, 'data_nova', p_nova_data)
  );

  return v_cliente;
end;
$$;

revoke all on function public.atualizar_data_marco_cliente(uuid, text, timestamptz) from public;
grant execute on function public.atualizar_data_marco_cliente(uuid, text, timestamptz) to authenticated;
