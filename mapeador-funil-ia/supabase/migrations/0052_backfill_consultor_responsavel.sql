-- Revisão de segurança (fase 2, etapa 2) — backfill de consultor
-- responsável nas implementações/clientes que já existiam antes da
-- migration 0051 (que só passou a preencher isso automaticamente em
-- registros NOVOS). Usa o texto livre antigo
-- (consultor_responsavel_texto_legado, de antes da tabela `consultores`
-- existir — ver migration 0040) casando por nome contra a tabela
-- `consultores` já estruturada.
--
-- Não cobre 100% dos casos: 3 implementações (Bv Pneus Comercio LTDA,
-- Garbella Design x2) não têm nenhum texto legado pra casar — ficam sem
-- responsável por decisão explícita, até alguém atribuir manualmente pela
-- tela da implementação. Isso é esperado e não bloqueia nada nesta etapa.

update public.implementacoes_crm i
set consultor_responsavel_id = c.id
from public.consultores c
where i.consultor_responsavel_id is null
  and i.consultor_responsavel_texto_legado is not null
  and lower(trim(i.consultor_responsavel_texto_legado)) = lower(trim(c.nome));

-- Propaga pro cliente vinculado, só se o cliente também ainda não tiver
-- responsável (mesma regra de herança já usada na migration 0051).
update public.clientes cl
set consultor_responsavel_id = i.consultor_responsavel_id
from public.implementacoes_crm i
where i.cliente_id = cl.id
  and cl.consultor_responsavel_id is null
  and i.consultor_responsavel_id is not null;
