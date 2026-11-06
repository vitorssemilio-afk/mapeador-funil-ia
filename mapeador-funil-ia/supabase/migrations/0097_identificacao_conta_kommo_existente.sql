-- Prompt 64, Bloco 1: identificação da situação da conta Kommo do cliente
-- (nova vs. já existente), pra parar de presumir "trial começando do zero"
-- pra todo cliente — o bug real é que resolverResumoTrialKommo (ver
-- src/lib/trialKommo.ts) hoje calcula trial sempre que conta_kommo_criada_em
-- está preenchido, sem distinguir conta paga de trial.
--
-- Os novos campos ficam em `clientes` (não em `implementacoes_crm`), junto
-- das datas de conta/trial que já moram lá (conta_kommo_solicitada_em,
-- conta_kommo_criada_em, extensao_*) — é uma pergunta sobre o CLIENTE, feita
-- no cadastro, antes de necessariamente existir uma implementação. Os campos
-- equivalentes em implementacoes_crm (email_conta_kommo,
-- status_contratacao_kommo, plano_contratado) continuam como estão: dado
-- histórico real, não duplicado nem migrado automaticamente nesta migration.
--
-- Nunca armazena senha (pedido explícito do usuário).
alter table public.clientes
  add column if not exists kommo_ja_possui text not null default 'nao_confirmado'
    check (kommo_ja_possui in ('sim', 'nao', 'nao_confirmado')),
  add column if not exists kommo_situacao_conta text
    check (kommo_situacao_conta is null or kommo_situacao_conta in ('ativa_contratada', 'trial', 'inativa_suspensa', 'nao_confirmado')),
  add column if not exists kommo_dominio text,
  add column if not exists kommo_email_admin text,
  add column if not exists kommo_plano text,
  add column if not exists kommo_trial_inicio_em timestamptz,
  add column if not exists kommo_trial_vencimento_em timestamptz,
  add column if not exists kommo_observacoes text;

comment on column public.clientes.kommo_ja_possui is
  'O cliente já possui uma conta Kommo CRM antes da V4? sim / nao / nao_confirmado (padrão). Preenchido no cadastro, editável depois.';
comment on column public.clientes.kommo_situacao_conta is
  'Só relevante quando kommo_ja_possui = sim: ativa_contratada / trial / inativa_suspensa / nao_confirmado.';
comment on column public.clientes.kommo_trial_inicio_em is
  'Data real de início do Trial de uma conta PRÉ-EXISTENTE (kommo_ja_possui=sim, situacao=trial) — distinta de conta_kommo_criada_em, que é quando a V4 cria a conta do zero.';

-- Checklist: a migration 0087 renomeou e deu `chave` às atividades de
-- conexão de canal, mas o UPDATE nunca chegou a pegar em produção (ficou
-- registrada como aplicada sem efeito real — mesma classe de problema já
-- visto na migration 0096). Reaplicado via execute_sql direto nesta sessão;
-- repetido aqui, idempotente, pra quem recriar o banco do zero a partir das
-- migrations também sair com o estado correto.
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

-- Dá `chave` às duas atividades de criação de conta do template global, pra
-- poder escondê-las (via src/pages/ImplementacaoDetalhe.tsx, mesmo padrão
-- dos canais acima) quando o cliente já tem conta ativa contratada — não faz
-- sentido pedir "e-mail pra criar conta" de quem já tem uma.
update public.atividades_cronograma
set chave = 'email_confirmado_criacao_conta'
where nome ilike 'e-mail válido confirmado%'
  and ciclo ilike 'Ciclo 1%'
  and implementacao_id is null
  and chave is null;

update public.atividades_cronograma
set chave = 'conta_kommo_criada_via_v4'
where nome ilike 'conta kommo criada via v4%'
  and ciclo ilike 'Ciclo 1%'
  and implementacao_id is null
  and chave is null;

-- Atividade nova, só pra quem já tem conta ativa existente (filtrada no
-- sentido inverso das duas acima) — confirmar acesso substitui criar conta.
insert into public.atividades_cronograma (nome, chave, ciclo, ordem, depende_de, implementacao_id)
select 'Confirmar acesso autorizado à conta Kommo existente', 'confirmar_acesso_conta_kommo_existente',
  'Ciclo 1 — Setup e Treinamento', 4, 'marco:kickoff_realizado_em', null
where not exists (
  select 1 from public.atividades_cronograma
  where chave = 'confirmar_acesso_conta_kommo_existente' and implementacao_id is null
);
