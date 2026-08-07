-- POP de Implementação de CRM revisado (v2): ajusta os itens do
-- checklist global para refletir a nova versão do processo. Os grupos
-- (chaves 'semana_1'..'semana_4' etc.) continuam os mesmos — só o
-- conteúdo e a ordem dos itens mudam — pra não quebrar o código que
-- depende dessas chaves (status, gate de avanço, geração de itens
-- derivados do funil).
--
-- Mudanças do POP v2 refletidas aqui:
-- * Semana 1 passa a ter duas sessões (gestor / time comercial); os
--   itens de ambas entram no mesmo grupo 'semana_1', na ordem em que
--   acontecem.
-- * "Conexão de canais de comunicação" e "Orientação para contratação
--   da plataforma" migram para a Semana 1 (antes estavam em Semana 2 e
--   Semana 4, respectivamente).
-- * Bot "de boas-vindas" renomeado para bot "de qualificação".
-- * "Treinamento de importação/exportação via Excel" e "Revisão geral
--   da configuração" migram de Semana 4 para Semana 3.
-- * Semana 4 ganha itens novos: solicitar Link B, apresentação final
--   ao time completo, e assinatura do Gate de Saída com o stakeholder.
-- * Critério de sucesso do trial passa de 30 para 35 dias (política de
--   trial revisada — seção 10 do POP v2).
--
-- Só atualiza itens do template global (implementacao_id is null) —
-- itens derivados de funil de cada implementação (implementacao_id
-- preenchido, migration 0010) não são tocados aqui.

do $$
declare
  g_pre uuid;
  g_s1 uuid;
  g_s2 uuid;
  g_s3 uuid;
  g_s4 uuid;
begin
  select id into g_pre from public.checklist_grupos_implementacao where chave = 'pre_requisito';
  select id into g_s1 from public.checklist_grupos_implementacao where chave = 'semana_1';
  select id into g_s2 from public.checklist_grupos_implementacao where chave = 'semana_2';
  select id into g_s3 from public.checklist_grupos_implementacao where chave = 'semana_3';
  select id into g_s4 from public.checklist_grupos_implementacao where chave = 'semana_4';

  if g_pre is null or g_s1 is null or g_s2 is null or g_s3 is null or g_s4 is null then
    raise exception 'Grupos de checklist do POP não encontrados — rode a migration 0006 antes desta.';
  end if;

  -- ============================================================
  -- Semana 1 — reordena os itens existentes pra intercalar Sessão 1
  -- (gestor) e Sessão 2 (time comercial), e recebe os dois itens
  -- que migraram de Semana 2 e Semana 4.
  -- ============================================================
  update public.checklist_itens_implementacao set ordem = 1
    where grupo_id = g_s1 and implementacao_id is null
      and texto = 'Apresentação completa da plataforma Kommo';
  update public.checklist_itens_implementacao set ordem = 3
    where grupo_id = g_s1 and implementacao_id is null
      and texto = 'Estruturação dos funis de venda';
  update public.checklist_itens_implementacao set ordem = 4
    where grupo_id = g_s1 and implementacao_id is null
      and texto = 'Dicas e gatilhos de entrada e saída em cada etapa do funil';
  update public.checklist_itens_implementacao set ordem = 5
    where grupo_id = g_s1 and implementacao_id is null
      and texto = 'Inserção e configuração de usuários';
  update public.checklist_itens_implementacao set ordem = 6
    where grupo_id = g_s1 and implementacao_id is null
      and texto = 'Gestão de cards e pipeline';
  update public.checklist_itens_implementacao set ordem = 7
    where grupo_id = g_s1 and implementacao_id is null
      and texto = 'Configuração de campos personalizados nos cards';
  update public.checklist_itens_implementacao set ordem = 8
    where grupo_id = g_s1 and implementacao_id is null
      and texto = 'Definição do layout dos cards';
  update public.checklist_itens_implementacao set ordem = 9
    where grupo_id = g_s1 and implementacao_id is null
      and texto = 'Treinamento do time';

  insert into public.checklist_itens_implementacao (grupo_id, texto, ordem) values
    (g_s1, 'Validação das informações do formulário de pré-configuração', 0);

  -- "Orientação para contratação da plataforma" migra de Semana 4 pra
  -- Semana 1 (Sessão 1) — o POP v2 exige que o cliente saia da primeira
  -- sessão já com clareza sobre planos e valores.
  update public.checklist_itens_implementacao
  set grupo_id = g_s1,
      ordem = 2,
      texto = 'Orientação para contratação da plataforma (planos e valores)'
  where grupo_id = g_s4 and implementacao_id is null
    and texto = 'Orientação para contratação da plataforma';

  -- "Conexão de canais de comunicação" migra de Semana 2 pra Semana 1.
  update public.checklist_itens_implementacao
  set grupo_id = g_s1,
      ordem = 10,
      texto = 'Conexão de canais de comunicação (WhatsApp, e-mail, etc.)'
  where grupo_id = g_s2 and implementacao_id is null
    and texto = 'Conexão dos canais de comunicação (WhatsApp, e-mail, etc.)';

  -- ============================================================
  -- Semana 2 — renomeia o bot e fecha a lacuna de ordem deixada pela
  -- conexão de canais, que saiu pra Semana 1.
  -- ============================================================
  update public.checklist_itens_implementacao set texto = 'Criação do bot de qualificação', ordem = 0
    where grupo_id = g_s2 and implementacao_id is null
      and texto = 'Criação do bot de boas-vindas';
  update public.checklist_itens_implementacao set ordem = 1
    where grupo_id = g_s2 and implementacao_id is null
      and texto = 'Configuração de modelos de mensagens';
  update public.checklist_itens_implementacao set ordem = 2
    where grupo_id = g_s2 and implementacao_id is null
      and texto = 'Criação de tarefas e notas automáticas';
  update public.checklist_itens_implementacao set ordem = 3
    where grupo_id = g_s2 and implementacao_id is null
      and texto = 'Automações de movimentação de cards no funil';
  update public.checklist_itens_implementacao set ordem = 4
    where grupo_id = g_s2 and implementacao_id is null
      and texto = 'Inserção de motivos de perda';

  -- ============================================================
  -- Semana 3 — recebe os dois itens que migraram de Semana 4.
  -- ============================================================
  update public.checklist_itens_implementacao
  set texto = 'Configuração dos relatórios de desempenho de vendas — filtros e dashboards'
  where grupo_id = g_s3 and implementacao_id is null
    and texto = 'Configuração dos relatórios de desempenho de vendas';

  update public.checklist_itens_implementacao
  set grupo_id = g_s3,
      ordem = 4,
      texto = 'Treinamento sobre relatórios, importação e exportação de dados via Excel'
  where grupo_id = g_s4 and implementacao_id is null
    and texto = 'Treinamento: importação e exportação de dados via Excel';

  update public.checklist_itens_implementacao
  set grupo_id = g_s3,
      ordem = 5
  where grupo_id = g_s4 and implementacao_id is null
    and texto = 'Revisão geral de toda a configuração do CRM';

  -- ============================================================
  -- Semana 4 — sobra "Ajustes finais" e "Entrega do Playbook";
  -- "Orientação para contratação" migrou pra Semana 1; ganha 3 itens
  -- novos do Gate de Saída revisado.
  -- ============================================================
  update public.checklist_itens_implementacao set ordem = 0
    where grupo_id = g_s4 and implementacao_id is null
      and texto = 'Ajustes finais ou novas configurações, se necessário';
  update public.checklist_itens_implementacao set ordem = 2
    where grupo_id = g_s4 and implementacao_id is null
      and texto = 'Entrega do Playbook de Implementação de CRM';

  insert into public.checklist_itens_implementacao (grupo_id, texto, ordem) values
    (g_s4, 'Solicitar Link B (pagamento) e enviar para o cliente', 1),
    (g_s4, 'Apresentação final da plataforma para o time completo e tira-dúvidas', 3),
    (g_s4, 'Checklist de Gate de Saída preenchido e assinado pelo consultor junto ao stakeholder decisor', 4);

  -- ============================================================
  -- Critérios de Sucesso — bot renomeado, trial de 30 pra 35 dias.
  -- ============================================================
  update public.checklist_itens_implementacao
  set texto = 'Bot de qualificação ativo e testado em uma conversa real'
  where implementacao_id is null
    and texto = 'Bot de boas-vindas ativo e testado em uma conversa real';

  update public.checklist_itens_implementacao
  set texto = 'Cliente decide contratar o plano pago ao fim dos 35 dias — sinal de que percebeu valor, não só usou de graça e abandonou'
  where implementacao_id is null
    and texto like 'Cliente decide contratar o plano pago ao fim dos 30 dias%';

  update public.checklist_itens_implementacao
  set texto = '[Validado via Checkpoint de 30 dias] Não há retorno perceptível à planilha/WhatsApp nas semanas seguintes à entrega'
  where implementacao_id is null
    and texto = 'Não há retorno perceptível à planilha/WhatsApp como ferramenta paralela nas semanas seguintes à entrega';
end $$;
