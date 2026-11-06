-- Prompt 64, Bloco 4: "Prontidão para Entrega" — reaproveita confirmações
-- já registradas em outro lugar do sistema em vez de pedir pro consultor
-- preencher tudo de novo (seções 23-25). A auditoria encontrou que quase
-- todo critério de entrega já tem uma atividade-gêmea no checklist (Ciclo 4,
-- a maioria já com requer_evidencia=true — exige teste real, não só marcar
-- uma caixinha) ou um marco do cliente — essa coluna liga um ao outro.
--
-- `atividade_chave_fonte`:
--   - 'marco:<campo>' = lido direto de clientes.<campo> (ex: treinamento
--     realizado).
--   - '<chave>' = lido de atividades_status pra atividade de template global
--     com essa chave (data_real preenchida = comprovado; evidencia reaproveitada).
--   - null = critério genuinamente manual, sem fonte automática confiável
--     (ex: "usuários conseguem acessar" é uma validação humana à parte da
--     criação do usuário — configuração executada ≠ funcionamento validado).
alter table public.criterios_entrega
  add column if not exists atividade_chave_fonte text;

comment on column public.criterios_entrega.atividade_chave_fonte is
  'Fonte de comprovação automática: marco:<campo de clientes> ou <chave de atividades_cronograma>. null = validação manual.';

-- Chave nas atividades de template que servem de fonte (nenhuma tinha chave
-- ainda — só as de canal, Blocos 1/3, já tinham). Duas delas (campos
-- personalizados e dashboards) também ganham requer_evidencia=true: sem
-- isso, "concluído" nelas não provaria nada de verdade (seção 24 — nunca
-- considerar automaticamente concluída uma validação técnica que precisa de
-- teste real).
update public.atividades_cronograma set chave = 'usuarios_cadastrados_ativos'
  where id = '46997b1b-4f84-4b9a-a144-42e388f9b5ca' and implementacao_id is null and chave is null;
update public.atividades_cronograma set chave = 'canais_funcionando'
  where id = 'ac3debc8-c28b-4ceb-b0f2-732f60925a2e' and implementacao_id is null and chave is null;
update public.atividades_cronograma set chave = 'funil_processo_real'
  where id = 'c7e89534-4e09-4d43-8955-1a18de1198c0' and implementacao_id is null and chave is null;
update public.atividades_cronograma set chave = 'bot_funcionando'
  where id = '4f34e0ec-056a-441b-9252-e1a2c1413e88' and implementacao_id is null and chave is null;
update public.atividades_cronograma set chave = 'automacoes_funcionando'
  where id = 'eb12459b-7feb-4acf-9009-d22b42cd19f2' and implementacao_id is null and chave is null;
update public.atividades_cronograma set chave = 'motivos_perda_configurados'
  where id = '184c70b6-1154-4a06-a31d-1e2e7de91361' and implementacao_id is null and chave is null;
update public.atividades_cronograma set chave = 'relatorios_configurados'
  where id = 'f1e6b589-5183-4d1f-ab0d-d024eb7fa291' and implementacao_id is null and chave is null;
update public.atividades_cronograma set chave = 'importacao_exportacao_testada'
  where id = 'bb4104eb-848d-40aa-8d74-69b0cc2aa91a' and implementacao_id is null and chave is null;
update public.atividades_cronograma set chave = 'playbook_entregue'
  where id = 'd391b447-33cc-40a9-a696-e63efc2d6a81' and implementacao_id is null and chave is null;
update public.atividades_cronograma set chave = 'campos_configurados', requer_evidencia = true
  where id = '938be6af-b8a5-4584-95df-31fc9e480150' and implementacao_id is null and chave is null;
update public.atividades_cronograma set chave = 'dashboards_configurados', requer_evidencia = true
  where id = '52e5d0fd-16c6-4b3f-a728-7dda5d0c264e' and implementacao_id is null and chave is null;

-- Liga cada critério à sua fonte. usuarios_cadastrados e usuarios_ativos
-- apontam pra mesma atividade (o checklist só tem um item combinado hoje) —
-- a validação de que o usuário de fato CONSEGUE ACESSAR continua manual
-- (não tem chave fonte: é um teste que ninguém registrou em lugar nenhum).
update public.criterios_entrega set atividade_chave_fonte = 'usuarios_cadastrados_ativos' where chave = 'usuarios_cadastrados';
update public.criterios_entrega set atividade_chave_fonte = 'usuarios_cadastrados_ativos' where chave = 'usuarios_ativos';
update public.criterios_entrega set atividade_chave_fonte = 'canais_funcionando' where chave = 'canais_funcionando';
update public.criterios_entrega set atividade_chave_fonte = 'funil_processo_real' where chave = 'funil_processo_real';
update public.criterios_entrega set atividade_chave_fonte = 'campos_configurados' where chave = 'campos_configurados';
update public.criterios_entrega set atividade_chave_fonte = 'motivos_perda_configurados' where chave = 'motivos_perda_configurados';
update public.criterios_entrega set atividade_chave_fonte = 'bot_funcionando' where chave = 'bot_funcionando';
update public.criterios_entrega set atividade_chave_fonte = 'automacoes_funcionando' where chave = 'automacoes_funcionando';
update public.criterios_entrega set atividade_chave_fonte = 'relatorios_configurados' where chave = 'relatorios_configurados';
update public.criterios_entrega set atividade_chave_fonte = 'dashboards_configurados' where chave = 'dashboards_configurados';
update public.criterios_entrega set atividade_chave_fonte = 'importacao_exportacao_testada' where chave = 'importacao_exportacao_testada';
update public.criterios_entrega set atividade_chave_fonte = 'playbook_entregue' where chave = 'playbook_entregue';
update public.criterios_entrega set atividade_chave_fonte = 'marco:treinamento_realizado_em' where chave = 'equipe_treinada';
