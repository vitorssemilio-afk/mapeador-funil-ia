-- Segundo formulário/fluxo: mapeamento de PÓS-VENDA, vinculado a um
-- mapeamento de vendas já existente. Reaproveita toda a infraestrutura de
-- `mapeamentos` (status, respostas jsonb, link público, geração de funil
-- por IA, funis_gerados) em vez de duplicar tabelas — só adiciona um
-- discriminador de tipo e o vínculo com o mapeamento de origem.

create type public.mapeamento_tipo as enum ('vendas', 'pos_venda');

alter table public.mapeamentos
  add column if not exists tipo public.mapeamento_tipo not null default 'vendas';

alter table public.mapeamentos
  add column if not exists mapeamento_origem_id uuid references public.mapeamentos(id) on delete cascade;

create index if not exists mapeamentos_mapeamento_origem_id_idx
  on public.mapeamentos(mapeamento_origem_id);

-- blocos_formulario/perguntas_formulario passam a ser compartilhados entre
-- os dois fluxos, discriminados por formulario_tipo no bloco (a pergunta
-- herda o tipo do seu bloco via bloco_id, sem precisar de coluna própria).
alter table public.blocos_formulario
  add column if not exists formulario_tipo text not null default 'vendas'
    check (formulario_tipo in ('vendas', 'pos_venda'));

-- ============================================================
-- As funções públicas do formulário (usadas pelo link /f/:codigo) precisam
-- devolver `tipo` agora, pra o wizard saber qual schema carregar. O tipo de
-- retorno muda (coluna nova), então precisa dropar antes de recriar.
-- ============================================================
drop function if exists public.public_get_mapeamento(uuid);

create function public.public_get_mapeamento(p_id uuid)
returns table (
  id uuid,
  nome_negocio text,
  respostas jsonb,
  enviado_pelo_cliente boolean,
  tipo public.mapeamento_tipo
)
language sql
security definer
set search_path = public
stable
as $$
  select m.id, m.nome_negocio, m.respostas, m.enviado_pelo_cliente, m.tipo
  from public.mapeamentos m
  where m.id = p_id;
$$;

revoke all on function public.public_get_mapeamento(uuid) from public;
grant execute on function public.public_get_mapeamento(uuid) to anon, authenticated;

drop function if exists public.public_get_mapeamento_by_codigo(text);

create function public.public_get_mapeamento_by_codigo(p_codigo text)
returns table (
  id uuid,
  nome_negocio text,
  respostas jsonb,
  enviado_pelo_cliente boolean,
  tipo public.mapeamento_tipo
)
language sql
security definer
set search_path = public
stable
as $$
  select m.id, m.nome_negocio, m.respostas, m.enviado_pelo_cliente, m.tipo
  from public.mapeamentos m
  where m.codigo_curto = p_codigo;
$$;

revoke all on function public.public_get_mapeamento_by_codigo(text) from public;
grant execute on function public.public_get_mapeamento_by_codigo(text) to anon, authenticated;

-- ============================================================
-- Seed: formulário de pós-venda (4 blocos, focado em onboarding,
-- acompanhamento, satisfação e upsell/renovação — o suficiente pra IA
-- montar um funil de pós-venda/retenção com substância real).
-- ============================================================
do $$
declare
  bloco_pv0 uuid;
  bloco_pv1 uuid;
  bloco_pv2 uuid;
  bloco_pv3 uuid;
begin
  if exists (select 1 from public.blocos_formulario where formulario_tipo = 'pos_venda') then
    return;
  end if;

  insert into public.blocos_formulario (titulo, ordem, formulario_tipo)
  values ('Depois que a Venda Acontece', 0, 'pos_venda') returning id into bloco_pv0;
  insert into public.blocos_formulario (titulo, ordem, formulario_tipo)
  values ('Acompanhamento e Relacionamento', 1, 'pos_venda') returning id into bloco_pv1;
  insert into public.blocos_formulario (titulo, ordem, formulario_tipo)
  values ('Satisfação e Feedback', 2, 'pos_venda') returning id into bloco_pv2;
  insert into public.blocos_formulario (titulo, ordem, formulario_tipo)
  values ('Upsell, Renovação e Retenção', 3, 'pos_venda') returning id into bloco_pv3;

  insert into public.perguntas_formulario
    (bloco_id, pergunta_id, ordem, tipo, label, helper, opcoes, obrigatoria)
  values
    (bloco_pv0, 'qpv0_processo_onboarding', 0, 'texto_longo',
      'Depois que o cliente compra, o que acontece com ele nos primeiros dias? Conte o passo a passo.',
      'Ex: Enviamos um e-mail de boas-vindas, agendamos uma call de implantação, mandamos o manual de uso.',
      null, true),
    (bloco_pv0, 'qpv0_responsavel_pos_venda', 1, 'escolha_unica',
      'Quem cuida do cliente depois que a venda é fechada?', null,
      '[
        {"value":"mesma_pessoa_da_venda","label":"A mesma pessoa que vendeu"},
        {"value":"equipe_propria_cs","label":"Uma equipe própria de Sucesso do Cliente/Pós-venda"},
        {"value":"suporte_geral","label":"O suporte geral, sem time dedicado"},
        {"value":"ninguem","label":"Ninguém, o contato praticamente encerra"}
      ]'::jsonb, false),
    (bloco_pv0, 'qpv0_tempo_ativacao', 2, 'escolha_unica',
      'Em quanto tempo, em média, o cliente começa de fato a usar/receber o que comprou?', 'SLA de ativação/entrega.',
      '[
        {"value":"imediato","label":"Imediatamente (no mesmo dia)"},
        {"value":"ate_1_semana","label":"Até 1 semana"},
        {"value":"1_a_4_semanas","label":"1 a 4 semanas"},
        {"value":"mais_1_mes","label":"Mais de 1 mês"}
      ]'::jsonb, false),
    (bloco_pv0, 'qpv0_canais_pos_venda', 3, 'escolha_multipla',
      'Quais canais vocês usam para se comunicar com o cliente depois da venda?', null,
      '[
        {"value":"whatsapp","label":"WhatsApp"},
        {"value":"email","label":"E-mail"},
        {"value":"ligacao","label":"Ligação/telefone"},
        {"value":"sistema_proprio","label":"Sistema/app próprio"},
        {"value":"nenhum","label":"Nenhum canal estruturado"}
      ]'::jsonb, false),

    (bloco_pv1, 'qpv1_frequencia_contato', 0, 'escolha_unica',
      'Com que frequência vocês entram em contato com o cliente depois da venda, por iniciativa própria?', null,
      '[
        {"value":"nunca","label":"Nunca, só se o cliente chamar"},
        {"value":"eventual","label":"De vez em quando, sem regularidade"},
        {"value":"marcos_definidos","label":"Em marcos definidos (ex: 30/60/90 dias)"},
        {"value":"recorrente","label":"Contato recorrente programado (ex: mensal)"}
      ]'::jsonb, false),
    (bloco_pv1, 'qpv1_indicadores_saude_cliente', 1, 'texto_curto',
      'O que faz vocês perceberem que um cliente está satisfeito ou, ao contrário, insatisfeito/em risco de sair?',
      'Ex: Baixo uso do produto, atraso em pagamento, reclamações recorrentes.', null, false),
    (bloco_pv1, 'qpv1_processo_reclamacao', 2, 'texto_longo',
      'Quando um cliente reclama ou tem um problema depois da venda, o que acontece? Quem resolve e em quanto tempo?',
      null, null, false),

    (bloco_pv2, 'qpv2_pede_avaliacao', 0, 'escolha_unica',
      'Vocês pedem avaliação/feedback do cliente depois da venda?', null,
      '[
        {"value":"nao_pede","label":"Não pedimos"},
        {"value":"informal","label":"Às vezes, de forma informal"},
        {"value":"processo_formal","label":"Sim, temos um processo formal (pesquisa, NPS, etc.)"}
      ]'::jsonb, false),
    (bloco_pv2, 'qpv2_uso_do_feedback', 1, 'texto_curto',
      'Quando recebem um feedback (bom ou ruim), o que é feito com essa informação?',
      'Ex: Vai pra um grupo interno, gera uma ação corretiva, só fica arquivado.', null, false),

    (bloco_pv3, 'qpv3_tem_recompra', 0, 'escolha_unica',
      'O que vocês vendem tem recompra, renovação ou upgrade natural?', null,
      '[
        {"value":"recorrente","label":"Sim, é recorrente/assinatura"},
        {"value":"esporadica","label":"Sim, mas de forma esporádica (meses/anos depois)"},
        {"value":"nao","label":"Não, geralmente é uma compra única"}
      ]'::jsonb, false),
    (bloco_pv3, 'qpv3_tenta_upsell', 1, 'escolha_unica',
      'Vocês tentam ativamente vender de novo (upsell/renovação) para quem já é cliente?', null,
      '[
        {"value":"processo_claro","label":"Sim, temos um processo claro pra isso"},
        {"value":"informal","label":"Às vezes, sem processo definido"},
        {"value":"nao","label":"Não, focamos só em clientes novos"}
      ]'::jsonb, false),
    (bloco_pv3, 'qpv3_motivos_perda_cliente', 2, 'escolha_multipla',
      'Quais os principais motivos de um cliente cancelar ou parar de comprar de vocês?', null,
      '[
        {"value":"preco","label":"Preço/custo-benefício"},
        {"value":"mau_atendimento","label":"Atendimento ruim no pós-venda"},
        {"value":"nao_usou","label":"Não usou/não teve o resultado esperado"},
        {"value":"concorrente","label":"Foi para um concorrente"},
        {"value":"nao_sabe","label":"Não sabemos, não medimos isso"},
        {"value":"outro","label":"Outro","campoLivre":{"placeholder":"Qual?"}}
      ]'::jsonb, false),
    (bloco_pv3, 'qpv3_meta_pos_venda', 3, 'texto_curto',
      'Existe alguma meta ou objetivo claro para o pós-venda hoje (ex: taxa de retenção, indicações, LTV)?',
      null, null, false);
end $$;
