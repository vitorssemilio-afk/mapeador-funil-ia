-- Playbook Final de Implementação — reaproveita inteiramente a
-- infraestrutura de Relatórios/Entrega (migration 0079): o Playbook é só
-- mais um `tipo` em `relatorios_implementacao`, com a mesma separação já
-- existente entre `conteudo_snapshot` (dados reais, imutável por versão) e
-- `texto_editavel` (o que o consultor escreve/oculta/reordena por cima —
-- nunca altera a fonte oficial). Nenhuma tabela nova.
alter table public.relatorios_implementacao
  drop constraint if exists relatorios_implementacao_tipo_check;
alter table public.relatorios_implementacao
  add constraint relatorios_implementacao_tipo_check
  check (tipo in ('implementacao', 'funil_vendas', 'funil_pos_venda', 'entrega_final', 'adocao', 'playbook'));

-- 'entregue' é o estado final específico do Playbook (seção 51/52 do
-- pedido: Não iniciado/Rascunho/Em revisão/Pronto/Entregue — os 3
-- primeiros já mapeiam pra "não existe linha ainda" / "gerado" / "gerado,
-- em edição", 'final' cobre "Pronto" e 'entregue' fecha o ciclo). Fica
-- disponível pra qualquer tipo de relatório, não só o Playbook, pelo mesmo
-- motivo de reuso de sempre: não criar uma coluna de status paralela.
alter table public.relatorios_implementacao
  drop constraint if exists relatorios_implementacao_status_check;
alter table public.relatorios_implementacao
  add constraint relatorios_implementacao_status_check
  check (status in ('rascunho', 'gerado', 'final', 'arquivado', 'entregue'));

alter table public.relatorios_implementacao
  add column if not exists entregue_em timestamptz,
  add column if not exists entregue_por_email text;
