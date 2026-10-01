-- P3-B6: "Consultor de apoio" é usado pra dois conceitos sem relação
-- funcional entre si — o cargo (consultores.papel = 'consultor_apoio') e o
-- vínculo opcional de apoio numa implementação específica
-- (implementacoes_crm.consultor_apoio_id). O cargo fica como está (é um
-- valor de enum já em uso); o vínculo por implementação é renomeado pra
-- "consultor adicional", que não colide com nenhum outro termo do produto.
-- RENAME COLUMN atualiza automaticamente as políticas de RLS e funções que
-- referenciam a coluna (armazenam a árvore já resolvida, não o texto do
-- nome), então as migrations 0051 e 0054 continuam válidas sem alteração.

alter table public.implementacoes_crm
  rename column consultor_apoio_id to consultor_adicional_id;
