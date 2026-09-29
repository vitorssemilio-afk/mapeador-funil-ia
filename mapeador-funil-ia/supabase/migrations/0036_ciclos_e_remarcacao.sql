-- Divide os 40 dias da implementação em 4 ciclos fixos de 10 dias, contados
-- do Kickoff realizado (janela puramente estrutural, sem mexer no prazo
-- geral de 40 dias — esse continua ancorado só em kickoff_realizado_em, ver
-- cronograma.ts). Também formaliza a "remarcação" de Kickoff/Treinamento
-- como uma ação distinta de simplesmente editar a data: guarda a data
-- anterior, exige motivo e responsável pelo impacto, pra nunca perder o
-- histórico de quando e por que uma reunião foi adiada.

-- 'Automações' vira 'Automações I' — abre espaço pra uma 'Automações II'
-- (ciclo 3, dias 20-30) que fica sem atividades até alguém adicionar
-- conteúdo de verdade pela tela de admin (/implementacoes/checklist) —
-- nenhuma atividade placeholder é criada aqui.
update public.atividades_cronograma set ciclo = 'Automações I' where ciclo = 'Automações';

-- "CRM em configuração" passa a depender do marco mais preciso (conta Kommo
-- criada) em vez de depender do ciclo anterior ter só "acabado" — é o
-- gatilho real que libera essas atividades.
update public.atividades_cronograma
set depende_de = 'marco:conta_kommo_criada_em'
where ciclo = 'CRM em configuração' and depende_de = 'ciclo:preparacao_crm';

-- "Automações I" passa a depender do Treinamento realizado (não mais do
-- ciclo anterior como um todo) — é o marco que efetivamente libera essas
-- atividades, e o que precisa recalcular automaticamente quando o
-- Treinamento é remarcado.
update public.atividades_cronograma
set depende_de = 'marco:treinamento_realizado_em'
where ciclo = 'Automações I' and depende_de = 'ciclo:treinamento_agendado';

-- Item específico de "conexão de canais de comunicação": mesmo racional —
-- depende do Treinamento realizado, não do ciclo genérico. Match por texto é
-- best-effort (ilike, com e sem acento); se não bater com o texto exato
-- cadastrado hoje, é um no-op seguro — nesse caso, peça ao usuário a redação
-- exata do item pra corrigir manualmente.
update public.atividades_cronograma
set depende_de = 'marco:treinamento_realizado_em'
where nome ilike '%conexão de canais%' or nome ilike '%conexao de canais%';

-- ============================================================
-- Log de remarcações: toda vez que kickoff_agendado_para ou
-- treinamento_agendado_para é alterado via a ação dedicada de "Remarcar"
-- (distinta de uma edição livre no formulário de marcos), fica registrado
-- aqui — data anterior, data nova, motivo e de quem foi o impacto. Nunca é
-- apagado nem sobrescrito; é auditoria pura.
-- ============================================================
create table if not exists public.marco_remarcacoes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  campo_marco text not null check (campo_marco in ('kickoff_agendado_para', 'treinamento_agendado_para')),
  data_anterior date,
  data_nova date not null,
  motivo text not null,
  responsavel_impacto text not null check (responsavel_impacto in ('cliente', 'consultor', 'v4', 'problema_tecnico', 'outro')),
  created_at timestamptz not null default now()
);

create index if not exists marco_remarcacoes_cliente_id_idx on public.marco_remarcacoes(cliente_id);

alter table public.marco_remarcacoes enable row level security;

create policy "marco_remarcacoes_all_authenticated"
  on public.marco_remarcacoes for all
  to authenticated
  using (true) with check (true);
