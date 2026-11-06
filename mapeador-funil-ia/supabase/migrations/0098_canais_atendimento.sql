-- Prompt 64, Bloco 3: canais de atendimento (WhatsApp/Instagram) com
-- intenção, tipo e dados de contato explícitos, e correção da dependência
-- de conexão pra "após o treinamento" (achado na auditoria do Bloco 2 — as
-- atividades já tinham chave/categoria certas desde o Bloco 1, só a
-- dependência estava errada).
--
-- A intenção (deseja conectar? sim/não/ainda não definido) continua em
-- `canal_whatsapp_business`/`canal_instagram` (boolean, migration 0087) —
-- já é um tri-state de fato (true/false/null) e já está ligado ao filtro do
-- checklist (ver src/pages/ImplementacaoDetalhe.tsx). Esta migration só
-- adiciona os campos de DETALHE que faltavam.
alter table public.clientes
  add column if not exists whatsapp_tipo text
    check (whatsapp_tipo is null or whatsapp_tipo in ('business_app', 'api_oficial', 'nao_definido')),
  add column if not exists whatsapp_numero text,
  add column if not exists whatsapp_responsavel text,
  add column if not exists whatsapp_situacao text,
  add column if not exists whatsapp_observacoes text,
  add column if not exists instagram_perfil text,
  add column if not exists instagram_responsavel text,
  add column if not exists instagram_observacoes text;

comment on column public.clientes.whatsapp_tipo is
  'Só relevante quando canal_whatsapp_business = true: business_app / api_oficial / nao_definido. As duas modalidades não são tecnicamente equivalentes (prompt 64, seção 19).';

-- Conexão dos canais é uma atividade do Ciclo 1 (Treinamento e Conexão de
-- Canais), mas só deve acontecer DEPOIS do treinamento confirmado como
-- realizado (prompt 64, seção 22 / Fase 2 seção 15 Etapa E) — não assim que
-- a conta Kommo é criada, que é cedo demais (nem os usuários foram criados
-- ainda). requer_evidencia=true pra "testar o canal" virar parte do próprio
-- fluxo de concluir a atividade (ConcluirAtividadeModal já pede evidência),
-- em vez de criar um campo/estado novo só pra "testado".
update public.atividades_cronograma
set depende_de = 'marco:treinamento_realizado_em', requer_evidencia = true
where chave in ('conectar_whatsapp_business', 'conectar_instagram')
  and implementacao_id is null;
