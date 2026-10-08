-- Corrige datas retroativas das extensões do Trial Kommo: "Solicitar
-- extensão"/"Registrar aprovação" (ImplementacaoDetalhe.tsx) sempre
-- gravavam a data ATUAL (new Date()), mesmo quando o consultor está só
-- registrando hoje algo que aconteceu semanas atrás — exatamente o mesmo
-- problema que a migration 0085 já resolveu para conta_kommo_criada_em/
-- conta_kommo_solicitada_em/contratacao_kommo_solicitada_em, só que faltou
-- estender a essas 4 colunas de extensão quando elas foram criadas depois
-- (migration 0047/0054). Sem isso, um cliente que já estava no meio do
-- Trial quando o sistema entrou em uso nunca consegue ter o dia certo
-- registrado — toda correção vira uma data de hoje, inflando o contador.
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

  -- Extensão +7 dias — primeira a ser concedida na prática (ver
  -- src/lib/trialKommo.ts), mesmo o nome do campo referindo a duração.
  elsif p_marco = 'extensao_7_solicitada_em' then
    v_anterior := v_cliente.extensao_7_solicitada_em;
    if p_nova_data is not null and v_cliente.conta_kommo_criada_em is not null
       and p_nova_data < v_cliente.conta_kommo_criada_em then
      raise exception 'A data de solicitação da extensão não pode ser antes da criação da conta Kommo.';
    end if;
    if p_nova_data is not null and v_cliente.extensao_7_aprovada_em is not null
       and p_nova_data > v_cliente.extensao_7_aprovada_em then
      raise exception 'A data de solicitação não pode ser depois da aprovação da mesma extensão.';
    end if;
    update public.clientes set extensao_7_solicitada_em = p_nova_data where id = p_cliente_id;

  elsif p_marco = 'extensao_7_aprovada_em' then
    v_anterior := v_cliente.extensao_7_aprovada_em;
    if p_nova_data is not null and v_cliente.extensao_7_solicitada_em is not null
       and p_nova_data < v_cliente.extensao_7_solicitada_em then
      raise exception 'A data de aprovação não pode ser antes da solicitação da mesma extensão.';
    end if;
    update public.clientes set extensao_7_aprovada_em = p_nova_data where id = p_cliente_id;

  -- Extensão +14 dias — segunda a ser concedida na prática.
  elsif p_marco = 'extensao_14_solicitada_em' then
    v_anterior := v_cliente.extensao_14_solicitada_em;
    if p_nova_data is not null and v_cliente.extensao_7_aprovada_em is not null
       and p_nova_data < v_cliente.extensao_7_aprovada_em then
      raise exception 'A data de solicitação não pode ser antes da aprovação da 1ª extensão.';
    end if;
    if p_nova_data is not null and v_cliente.extensao_14_aprovada_em is not null
       and p_nova_data > v_cliente.extensao_14_aprovada_em then
      raise exception 'A data de solicitação não pode ser depois da aprovação da mesma extensão.';
    end if;
    update public.clientes set extensao_14_solicitada_em = p_nova_data where id = p_cliente_id;

  elsif p_marco = 'extensao_14_aprovada_em' then
    v_anterior := v_cliente.extensao_14_aprovada_em;
    if p_nova_data is not null and v_cliente.extensao_14_solicitada_em is not null
       and p_nova_data < v_cliente.extensao_14_solicitada_em then
      raise exception 'A data de aprovação não pode ser antes da solicitação da mesma extensão.';
    end if;
    update public.clientes set extensao_14_aprovada_em = p_nova_data where id = p_cliente_id;

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
