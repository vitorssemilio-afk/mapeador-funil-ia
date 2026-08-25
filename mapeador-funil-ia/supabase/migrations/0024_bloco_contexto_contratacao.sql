-- Novo bloco "Contexto da Contratação", logo após "Perfil da Empresa e
-- Volumetria" e antes de "Origem e Ferramentas Atuais". As 3 perguntas são
-- só pra leitura do analista (comercial/CS) — não alimentam a geração do
-- funil pela IA (incluir_na_geracao_ia = false).
do $$
declare
  v_ordem_alvo int;
  v_bloco_id uuid;
begin
  if exists (select 1 from public.blocos_formulario where titulo = 'Contexto da Contratação') then
    return;
  end if;

  select ordem into v_ordem_alvo
  from public.blocos_formulario
  where titulo = 'Origem e Ferramentas Atuais';

  if v_ordem_alvo is null then
    raise exception 'Bloco "Origem e Ferramentas Atuais" não encontrado — abortando pra não inserir na posição errada.';
  end if;

  update public.blocos_formulario
  set ordem = ordem + 1
  where ordem >= v_ordem_alvo;

  insert into public.blocos_formulario (titulo, ordem)
  values ('Contexto da Contratação', v_ordem_alvo)
  returning id into v_bloco_id;

  insert into public.perguntas_formulario
    (bloco_id, pergunta_id, ordem, tipo, label, opcoes, obrigatoria, incluir_na_geracao_ia)
  values
    (
      v_bloco_id,
      'q_contexto_expectativa_contratacao',
      0,
      'texto_longo',
      'Quando vocês decidiram contratar o CRM, o que te explicaram que ele ia resolver pra vocês?',
      null,
      true,
      false
    ),
    (
      v_bloco_id,
      'q_contexto_valor_informado',
      1,
      'escolha_unica',
      'Qual valor foi informado pra vocês para a assinatura do CRM, depois do período de teste gratuito?',
      '[
        {"value":"nao_me_informaram_nenhum_valor","label":"Não me informaram nenhum valor"},
        {"value":"me_informaram_um_valor_mas_acho_que_era_abaixo_do_real","label":"Me informaram um valor, mas acho que era abaixo do real"},
        {"value":"me_informaram_o_valor_correto","label":"Me informaram o valor correto"},
        {"value":"nao_me_lembro","label":"Não me lembro"}
      ]'::jsonb,
      true,
      false
    ),
    (
      v_bloco_id,
      'q_contexto_decisor_contratacao',
      2,
      'escolha_unica',
      'Quem decide se o plano pago vai ser contratado depois do teste?',
      '[
        {"value":"eu_mesmo","label":"Eu mesmo"},
        {"value":"outra_pessoa_socio_diretor_financeiro","label":"Outra pessoa (sócio, diretor, financeiro)"},
        {"value":"ainda_nao_decidimos","label":"Ainda não decidimos"}
      ]'::jsonb,
      false,
      false
    );
end $$;
