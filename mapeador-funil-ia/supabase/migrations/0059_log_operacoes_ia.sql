-- Tratamento de erros e falhas de IA — fundação: log central de operações
-- de IA (gerar_funil, regenerar_etapa, criar_funil_kommo), usado tanto
-- pra observabilidade (tela de admin) quanto pra guardar corretamente
-- estado/tentativa/erro de cada geração, sem sobrecarregar
-- mapeamentos.status nem a coluna respostas (onde hoje só gerar-funil
-- grava um _erro_ia solto).
--
-- Os 3 fluxos que realmente chamam IA: gerar-funil (funil de vendas e de
-- pós-venda), regenerar-etapa-funil (uma etapa isolada) e criar-funil-kommo
-- não chama IA — usa a API do Kommo pra criar o pipeline já gerado — mas
-- entra aqui do mesmo jeito porque também é uma operação assíncrona
-- externa sujeita a falha, e hoje não tinha log nenhum.
--
-- "Ata" não existe como funcionalidade no produto (confirmado antes de
-- escrever esta migration) — fica de fora até essa funcionalidade existir.
-- "Geração de relatório" (RelatorioFunil.tsx) é templating client-side
-- (pptxgenjs/xlsx), não chama IA nenhuma — fora de escopo aqui também.

create table if not exists public.ia_operacoes (
  id uuid primary key default gen_random_uuid(),
  tipo_operacao text not null check (tipo_operacao in ('gerar_funil', 'regenerar_etapa', 'criar_funil_kommo')),
  cliente_id uuid references public.clientes(id) on delete set null,
  mapeamento_id uuid references public.mapeamentos(id) on delete set null,
  funil_id uuid references public.funis_gerados(id) on delete set null,
  implementacao_id uuid references public.implementacoes_crm(id) on delete set null,
  etapa_index int,
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  status text not null default 'processando' check (status in (
    'aguardando', 'processando', 'concluido', 'falhou', 'resposta_invalida', 'cancelado', 'tentando_novamente'
  )),
  tentativa int not null default 1,
  modelo text,
  duracao_ms int,
  erro_codigo text,
  erro_mensagem_tecnica text,
  erro_mensagem_amigavel text,
  created_at timestamptz not null default now(),
  finalizado_em timestamptz
);

create index if not exists ia_operacoes_cliente_id_idx on public.ia_operacoes(cliente_id);
create index if not exists ia_operacoes_created_at_idx on public.ia_operacoes(created_at desc);
create index if not exists ia_operacoes_status_idx on public.ia_operacoes(status);
-- Usado pela checagem de "já tem uma geração em andamento pra isso".
create index if not exists ia_operacoes_em_andamento_idx
  on public.ia_operacoes(tipo_operacao, mapeamento_id, funil_id, etapa_index)
  where status in ('processando', 'tentando_novamente');

alter table public.ia_operacoes enable row level security;

-- Mesma regra de vínculo do resto do produto — quem tem acesso ao cliente
-- vê o histórico de operações de IA dele; sem cliente_id (não deveria
-- acontecer na prática, sempre tem mapeamento/implementação por trás), só
-- administrador. Escrita só pelas funções SECURITY DEFINER abaixo.
drop policy if exists "ia_operacoes_select_por_vinculo" on public.ia_operacoes;
create policy "ia_operacoes_select_por_vinculo"
  on public.ia_operacoes for select
  to authenticated
  using (
    (cliente_id is null and public.sou_administrador())
    or (cliente_id is not null and public.tenho_acesso_ao_cliente(cliente_id))
  );

create or replace function public.registrar_inicio_ia_operacao(
  p_tipo_operacao text,
  p_cliente_id uuid,
  p_mapeamento_id uuid,
  p_funil_id uuid,
  p_implementacao_id uuid,
  p_etapa_index int,
  p_tentativa int,
  p_modelo text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.ia_operacoes
    (tipo_operacao, cliente_id, mapeamento_id, funil_id, implementacao_id, etapa_index,
     user_id, user_email, status, tentativa, modelo)
  values
    (p_tipo_operacao, p_cliente_id, p_mapeamento_id, p_funil_id, p_implementacao_id, p_etapa_index,
     auth.uid(), auth.jwt() ->> 'email', 'processando', coalesce(p_tentativa, 1), p_modelo)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.registrar_fim_ia_operacao(
  p_id uuid,
  p_status text,
  p_duracao_ms int,
  p_erro_codigo text default null,
  p_erro_mensagem_tecnica text default null,
  p_erro_mensagem_amigavel text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ia_operacoes
  set status = p_status,
      duracao_ms = p_duracao_ms,
      erro_codigo = p_erro_codigo,
      erro_mensagem_tecnica = p_erro_mensagem_tecnica,
      erro_mensagem_amigavel = p_erro_mensagem_amigavel,
      finalizado_em = now()
  where id = p_id;
end;
$$;

revoke all on function public.registrar_inicio_ia_operacao(text, uuid, uuid, uuid, uuid, int, int, text) from public;
revoke all on function public.registrar_fim_ia_operacao(uuid, text, int, text, text, text) from public;
grant execute on function public.registrar_inicio_ia_operacao(text, uuid, uuid, uuid, uuid, int, int, text) to authenticated;
grant execute on function public.registrar_fim_ia_operacao(uuid, text, int, text, text, text) to authenticated;

-- Notificação de falha pra regenerar_etapa e criar_funil_kommo — os dois
-- fluxos que hoje NUNCA geram notificação nenhuma quando falham (gerar_funil
-- já é coberto pelo trigger em mapeamentos.status = 'erro', migration 0055
-- — não duplica aqui pra não notificar a mesma falha duas vezes).
create or replace function public.notificar_falha_ia_operacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome_cliente text;
  v_titulo text;
begin
  if new.tipo_operacao = 'gerar_funil' then
    return new;
  end if;

  if new.status not in ('falhou', 'resposta_invalida') then
    return new;
  end if;
  if old is not null and old.status = new.status then
    return new;
  end if;

  select nome_empresa into v_nome_cliente from public.clientes where id = new.cliente_id;

  v_titulo := case new.tipo_operacao
    when 'regenerar_etapa' then 'Falha ao regenerar etapa'
    when 'criar_funil_kommo' then 'Falha ao criar funil no Kommo'
    else 'Falha em operação de IA'
  end;

  perform public.criar_notificacao(
    'sistema',
    'falha_' || new.tipo_operacao,
    v_titulo || coalesce(' — ' || v_nome_cliente, ''),
    coalesce(new.erro_mensagem_amigavel, 'Verifique e tente novamente.'),
    new.cliente_id, new.implementacao_id, 'critica',
    case
      when new.tipo_operacao = 'regenerar_etapa' and new.funil_id is not null then '/mapeamento/' || (select mapeamento_id from public.funis_gerados where id = new.funil_id)
      when new.tipo_operacao = 'criar_funil_kommo' and new.implementacao_id is not null then '/implementacoes/' || new.implementacao_id
      else null
    end,
    'ia_operacao', new.id,
    'falha_ia:' || new.id
  );

  return new;
end;
$$;

drop trigger if exists ia_operacoes_notificar_falha on public.ia_operacoes;
create trigger ia_operacoes_notificar_falha
  after insert or update on public.ia_operacoes
  for each row execute function public.notificar_falha_ia_operacao();
