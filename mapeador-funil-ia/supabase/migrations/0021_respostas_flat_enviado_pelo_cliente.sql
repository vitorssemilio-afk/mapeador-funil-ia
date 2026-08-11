-- O Relatório de Respostas (dashboard de padrões de resposta entre clientes)
-- precisa distinguir mapeamentos que o cliente realmente enviou de
-- rascunhos ainda em preenchimento — senão um formulário pela metade
-- distorce a contagem de frequência das opções. A view já achatava as
-- respostas, só faltava expor essa coluna.
--
-- A coluna nova entra no FINAL da lista de select — um `create or replace
-- view` no Postgres só aceita adicionar colunas no final; inserir no meio
-- desloca a posição das colunas seguintes e ele recusa com "cannot change
-- name of view column" (aconteceu numa tentativa anterior desta migration).

create or replace view public.mapeamentos_respostas_flat
with (security_invoker = true) as
select
  m.id as mapeamento_id,
  m.nome_negocio,
  m.status as mapeamento_status,
  m.created_at as mapeamento_criado_em,
  b.titulo as bloco_titulo,
  p.pergunta_id,
  p.label as pergunta_label,
  p.tipo as pergunta_tipo,
  r.valor as resposta_bruta,
  case
    when jsonb_typeof(r.valor) = 'array' then
      array_to_string(array(select jsonb_array_elements_text(r.valor)), ', ')
    when jsonb_typeof(r.valor) = 'string' then r.valor #>> '{}'
    else r.valor::text
  end as resposta_texto,
  m.enviado_pelo_cliente
from public.mapeamentos m
cross join lateral jsonb_each(m.respostas) as r(chave, valor)
join public.perguntas_formulario p on p.pergunta_id = r.chave
join public.blocos_formulario b on b.id = p.bloco_id
where r.chave not like '\_%' escape '\';

comment on view public.mapeamentos_respostas_flat is
  'Respostas de mapeamentos.respostas (jsonb) achatadas em uma linha por pergunta, para leitura/filtro/export no Table Editor e para o Relatório de Respostas.';

grant select on public.mapeamentos_respostas_flat to authenticated;
