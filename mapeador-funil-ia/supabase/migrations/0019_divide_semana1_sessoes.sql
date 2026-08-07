-- POP v2: Semana 1 é formalmente dividida em duas sessões com públicos e
-- durações diferentes (Sessão 1 — só o gestor, 30-45min; Sessão 2 — time
-- comercial completo, 45-60min). Até aqui isso só existia na ordem dos
-- itens dentro de um único grupo "semana_1" — agora vira dois grupos de
-- checklist visualmente separados.
--
-- O grupo "semana_1" existente é RENOMEADO (mesmo id) pra virar a Sessão
-- 1 — assim os itens derivados do funil de cada implementação
-- (checklist_itens_implementacao.implementacao_id preenchido, que hoje
-- apontam pra esse grupo) continuam válidos sem precisar mexer neles.
-- Um grupo novo é criado pra Sessão 2, e os itens de template que
-- pertencem a ela migram pra lá.

do $$
declare
  g_s1_sessao1 uuid;
  g_s1_sessao2 uuid;
  g_s2 uuid;
  g_s3 uuid;
  g_s4 uuid;
  g_crit uuid;
begin
  select id into g_s1_sessao1 from public.checklist_grupos_implementacao where chave = 'semana_1';
  select id into g_s2 from public.checklist_grupos_implementacao where chave = 'semana_2';
  select id into g_s3 from public.checklist_grupos_implementacao where chave = 'semana_3';
  select id into g_s4 from public.checklist_grupos_implementacao where chave = 'semana_4';
  select id into g_crit from public.checklist_grupos_implementacao where chave = 'criterios_sucesso';

  if g_s1_sessao1 is null or g_s2 is null or g_s3 is null or g_s4 is null or g_crit is null then
    raise exception 'Grupos de checklist do POP não encontrados — rode as migrations anteriores primeiro.';
  end if;

  -- Abre espaço na ordem pro grupo novo da Sessão 2 (ordem 2), empurrando
  -- os grupos seguintes uma posição pra frente.
  update public.checklist_grupos_implementacao set ordem = 3 where id = g_s2;
  update public.checklist_grupos_implementacao set ordem = 4 where id = g_s3;
  update public.checklist_grupos_implementacao set ordem = 5 where id = g_s4;
  update public.checklist_grupos_implementacao set ordem = 6 where id = g_crit;

  update public.checklist_grupos_implementacao
  set chave = 'semana_1_sessao1',
      titulo = 'Semana 1 — Sessão 1 (Gestor)',
      ordem = 1
  where id = g_s1_sessao1;

  insert into public.checklist_grupos_implementacao (chave, titulo, ordem)
  values ('semana_1_sessao2', 'Semana 1 — Sessão 2 (Time comercial)', 2)
  returning id into g_s1_sessao2;

  -- Itens de template (implementacao_id null) que são da Sessão 2 migram
  -- pro grupo novo — o restante (Sessão 1) fica no grupo renomeado.
  update public.checklist_itens_implementacao
  set grupo_id = g_s1_sessao2
  where grupo_id = g_s1_sessao1
    and implementacao_id is null
    and texto in (
      'Inserção e configuração de usuários',
      'Gestão de cards e pipeline',
      'Configuração de campos personalizados nos cards',
      'Definição do layout dos cards',
      'Treinamento do time',
      'Conexão de canais de comunicação (WhatsApp, e-mail, etc.)'
    );
end $$;
