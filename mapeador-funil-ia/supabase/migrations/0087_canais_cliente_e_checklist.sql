-- Prompt 54, parte C: o checklist tratava "WhatsApp Corporativo confirmado"
-- e "Acesso às credenciais do Facebook confirmado" como pré-requisitos
-- obrigatórios de todo cliente, dependendo só do Kickoff — mas o processo
-- real conecta esses canais durante o TREINAMENTO (depois da conta Kommo
-- criada), e nem todo cliente usa os dois (o objeto operacional pro
-- consultor é o Instagram, não o "Facebook" — a autenticação passar pelo
-- ecossistema Meta é um detalhe técnico, não o nome da atividade).
--
-- 1) Reposiciona/renomeia as duas atividades do template global (nomes
-- exatos confirmados por print da tela de produção, não um chute):
--   - "WhatsApp Corporativo (conta business) em uso por todos os usuários
--     que vão operar o CRM" -> "Conectar WhatsApp Business ao Kommo",
--     grupo "Treinamento e Conexão de Canais", depende da conta Kommo
--     criada (mesma dependência das outras atividades desse grupo, como
--     "Treinamento do time") em vez do Kickoff.
--   - "Acesso às credenciais do Facebook vinculado ao número do WhatsApp
--     Business" -> "Conectar Instagram ao Kommo", mesmo grupo e
--     dependência.
-- `chave` ganha um valor estável (nunca tinha) — é por ela, não pelo nome
-- em português (que pode mudar de novo), que o frontend decide se esconde
-- a atividade quando o canal não se aplica àquele cliente (ver
-- src/pages/ImplementacaoDetalhe.tsx).
update public.atividades_cronograma
set
  nome = 'Conectar WhatsApp Business ao Kommo',
  chave = 'conectar_whatsapp_business',
  categoria = 'Treinamento e Conexão de Canais',
  depende_de = 'marco:conta_kommo_criada_em'
where nome ilike '%whatsapp corporativo%'
  and ciclo ilike 'Ciclo 1%'
  and implementacao_id is null;

update public.atividades_cronograma
set
  nome = 'Conectar Instagram ao Kommo',
  chave = 'conectar_instagram',
  categoria = 'Treinamento e Conexão de Canais',
  depende_de = 'marco:conta_kommo_criada_em'
where nome ilike '%credenciais do facebook%'
  and ciclo ilike 'Ciclo 1%'
  and implementacao_id is null;

-- 2) Canais previstos por cliente — null preserva o comportamento atual
-- (mostra a atividade) pra quem nunca mexeu nisso; só false some a
-- atividade de conexão daquele canal do checklist (nunca um "não
-- aplicável" automático — é uma decisão explícita registrada na ficha do
-- cliente, seção 28 do pedido).
alter table public.clientes
  add column if not exists canal_whatsapp_business boolean,
  add column if not exists canal_instagram boolean;
