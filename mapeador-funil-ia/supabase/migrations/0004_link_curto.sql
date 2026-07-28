-- Link curto pro formulário público: em vez de /formulario/<uuid>, o cliente
-- recebe /f/<codigo>, um código de 6 caracteres, mais curto e profissional.
-- A rota antiga /formulario/:id continua funcionando (links já enviados não quebram).

alter table public.mapeamentos add column if not exists codigo_curto text;

create or replace function public.gerar_codigo_curto()
returns text
language plpgsql
as $$
declare
  -- sem 0/O, 1/I/l — evita confusão na hora de digitar o código
  alfabeto text := 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  resultado text := '';
  i int;
begin
  for i in 1..6 loop
    resultado := resultado || substr(alfabeto, floor(random() * length(alfabeto) + 1)::int, 1);
  end loop;
  return resultado;
end;
$$;

create or replace function public.set_codigo_curto()
returns trigger
language plpgsql
as $$
declare
  novo_codigo text;
  tentativas int := 0;
begin
  if new.codigo_curto is not null then
    return new;
  end if;

  loop
    novo_codigo := public.gerar_codigo_curto();
    tentativas := tentativas + 1;
    exit when not exists (select 1 from public.mapeamentos where codigo_curto = novo_codigo);
    if tentativas > 20 then
      raise exception 'Não foi possível gerar um código curto único';
    end if;
  end loop;

  new.codigo_curto := novo_codigo;
  return new;
end;
$$;

drop trigger if exists trg_set_codigo_curto on public.mapeamentos;
create trigger trg_set_codigo_curto
  before insert on public.mapeamentos
  for each row execute function public.set_codigo_curto();

-- Backfill das linhas já existentes (linha a linha, evitando colisão entre elas)
do $$
declare
  r record;
  novo_codigo text;
  tentativas int;
begin
  for r in select id from public.mapeamentos where codigo_curto is null loop
    tentativas := 0;
    loop
      novo_codigo := public.gerar_codigo_curto();
      tentativas := tentativas + 1;
      exit when not exists (select 1 from public.mapeamentos where codigo_curto = novo_codigo);
      if tentativas > 20 then
        raise exception 'Não foi possível gerar um código curto único no backfill';
      end if;
    end loop;
    update public.mapeamentos set codigo_curto = novo_codigo where id = r.id;
  end loop;
end $$;

alter table public.mapeamentos alter column codigo_curto set not null;
alter table public.mapeamentos add constraint mapeamentos_codigo_curto_key unique (codigo_curto);

-- ============================================================
-- Leitura pública por código curto (mesmo padrão de
-- public_get_mapeamento, só que buscando por codigo_curto).
-- ============================================================
create or replace function public.public_get_mapeamento_by_codigo(p_codigo text)
returns table (
  id uuid,
  nome_negocio text,
  respostas jsonb,
  enviado_pelo_cliente boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select m.id, m.nome_negocio, m.respostas, m.enviado_pelo_cliente
  from public.mapeamentos m
  where m.codigo_curto = p_codigo;
$$;

revoke all on function public.public_get_mapeamento_by_codigo(text) from public;
grant execute on function public.public_get_mapeamento_by_codigo(text) to anon, authenticated;
