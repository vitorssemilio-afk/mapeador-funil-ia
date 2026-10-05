-- A migration 0067 renomeou implementacoes_crm.consultor_apoio_id para
-- consultor_adicional_id e assumiu que "políticas de RLS e funções que
-- referenciam a coluna continuam válidas sem alteração" — isso vale pra
-- RLS (armazenada como árvore de expressão, atualizada automaticamente) e
-- views, mas NÃO pra funções `language sql`: o corpo delas fica como texto
-- puro (prosrc) e nunca foi reescrito. tenho_acesso_ao_cliente e
-- tenho_acesso_a_implementacao continuaram referenciando a coluna antiga e
-- toda chamada a elas vinha falhando com "column i.consultor_apoio_id does
-- not exist" — inclusive dentro de vincular_ata_manualmente (integração
-- com o App de Atas) e de várias políticas de RLS mais novas (0055, 0059,
-- 0062, 0077, 0078, 0079, 0080) que dependem dessas duas funções.
create or replace function public.tenho_acesso_ao_cliente(p_cliente_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    public.sou_administrador()
    or exists (
      select 1 from public.clientes c
      where c.id = p_cliente_id
        and c.consultor_responsavel_id = public.meu_consultor_id()
    )
    or exists (
      select 1 from public.implementacoes_crm i
      where i.cliente_id = p_cliente_id
        and (i.consultor_responsavel_id = public.meu_consultor_id()
             or i.consultor_adicional_id = public.meu_consultor_id())
    );
$$;

create or replace function public.tenho_acesso_a_implementacao(p_implementacao_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    public.sou_administrador()
    or exists (
      select 1 from public.implementacoes_crm i
      where i.id = p_implementacao_id
        and (i.consultor_responsavel_id = public.meu_consultor_id()
             or i.consultor_adicional_id = public.meu_consultor_id())
    );
$$;
