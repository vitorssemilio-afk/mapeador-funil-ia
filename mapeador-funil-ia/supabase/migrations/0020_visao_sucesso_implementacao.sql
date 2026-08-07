-- Pergunta nova no formulário de diagnóstico: entender, na visão do
-- próprio cliente, o que ele precisa enxergar ao final da implementação
-- pra considerar que o CRM "deu certo". Isso vira o critério de sucesso
-- real do projeto — evita que "implementação concluída" signifique coisas
-- diferentes pro consultor (checklist técnico batido) e pro cliente
-- (resultado percebido no dia a dia comercial).
--
-- A resposta entra no texto que já é montado pra IA (formatRespostasTexto
-- itera blocos/perguntas de forma genérica), então alimenta a geração do
-- funil sem precisar de mudança em prompt.ts ou ia.ts.

do $$
declare
  bloco_sucesso uuid;
  proxima_ordem_bloco int;
begin
  if exists (select 1 from public.perguntas_formulario where pergunta_id = 'q_visao_sucesso') then
    return;
  end if;

  select coalesce(max(ordem), -1) + 1 into proxima_ordem_bloco from public.blocos_formulario;

  insert into public.blocos_formulario (titulo, ordem)
  values ('Visão de Sucesso da Implementação', proxima_ordem_bloco)
  returning id into bloco_sucesso;

  insert into public.perguntas_formulario
    (bloco_id, pergunta_id, ordem, tipo, label, helper, obrigatoria, condicao_pergunta_id, condicao_valores)
  values
    (bloco_sucesso, 'q_visao_sucesso', 0, 'texto_longo',
      'Lá na frente, quando a implementação estiver concluída, o que você precisa ver acontecendo pra dizer "deu certo, o CRM funcionou"?',
      'Pode ser algo bem concreto (ex: "não perder mais nenhum lead", "saber o motivo de cada venda perdida", "ter um relatório que eu olho toda segunda") ou mais amplo (ex: "minha equipe não depender mais de mim pra vender"). Isso vira o critério real de sucesso do projeto — não só a lista de configurações feitas.',
      true, null, null);
end $$;
