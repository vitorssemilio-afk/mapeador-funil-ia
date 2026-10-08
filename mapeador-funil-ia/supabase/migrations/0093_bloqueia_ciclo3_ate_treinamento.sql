-- Corrige um gap que existia desde a própria seed original do checklist
-- (migration 0037): os itens do Ciclo 2 que dependem do treinamento
-- (WhatsApp conectado, Automações prioritárias, Bots, Testes) já ficam
-- "Bloqueado até realização do treinamento" corretamente — mas os itens do
-- Ciclo 3 (Automações II e Check-in 2) nunca tiveram nenhuma dependência
-- configurada (`depende_de` sempre null), deixando dar "Concluir" nesses
-- itens mesmo com o treinamento do Ciclo 2 ainda pendente. Mesma regra de
-- negócio dos itens do Ciclo 2 (treinamento_realizado_em), reaproveitando
-- o mecanismo de dependência que já existe em
-- src/lib/atividadesCronograma.ts — nenhuma lógica nova, só preenche o
-- `depende_de` que faltou nesses 5 itens.
--
-- "Check-in 2 realizado" fica de fora de propósito, igual "Check-in 1
-- realizado" no Ciclo 2 também não tem dependência — agendar/registrar uma
-- reunião não é bloqueado por este gate.
--
-- `atividades_cronograma` não tem cópia por cliente (implementacao_id null
-- = template único compartilhado, ver ImplementacaoDetalhe.tsx) — este
-- update vale pra todo mundo imediatamente, inclusive quem já está no
-- Ciclo 3 hoje. Itens já concluídos não são afetados (a dependência só é
-- checada pra decidir se dá pra MARCAR como concluído agora, nunca desfaz
-- o que já foi marcado).
update public.atividades_cronograma
set depende_de = 'marco:treinamento_realizado_em'
where implementacao_id is null
  and ciclo = 'Ciclo 3 — Automações II e Check-in 2'
  and nome in (
    'Automações complementares configuradas',
    'Ajustes realizados',
    'Relatórios configurados',
    'Dashboards configurados',
    'Desenvolvimento/configuração do pós-venda (quando aplicável)'
  )
  and depende_de is null;
