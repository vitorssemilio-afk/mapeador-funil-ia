-- P1-C2 da auditoria funcional: remarcar Check-in 1, Check-in 2 ou Reunião
-- final (módulo de Reuniões) atualizava a reunião normalmente, mas a
-- atividade correspondente no cronograma ("Check-in 1 realizado" etc, em
-- atividades_cronograma/atividades_status) continuava com a data antiga —
-- eram duas fontes de data independentes pro mesmo evento (diferente de
-- Kickoff/Treinamento, que já sincronizam corretamente via
-- sincronizarMarcoCliente).
--
-- Correção: adiciona atividades_cronograma.reuniao_tipo, marcando quais
-- atividades REPRESENTAM uma reunião formal. O código (resolverAtividade,
-- src/lib/atividadesCronograma.ts) passa a ler a data direto da reunião
-- vinculada (por cliente_id + tipo) quando esse campo está preenchido —
-- nunca mais do campo duplicado em atividades_status.

alter table public.atividades_cronograma
  add column if not exists reuniao_tipo text
    check (reuniao_tipo in ('kickoff', 'treinamento', 'checkin_1', 'checkin_2', 'tira_duvidas', 'reuniao_final', 'extraordinaria'));

comment on column public.atividades_cronograma.reuniao_tipo is
  'Quando preenchido, esta atividade representa uma reunião do módulo de Reuniões — a data (agendada/realizada) vem sempre da reunião, nunca de atividades_status.';

update public.atividades_cronograma set reuniao_tipo = 'checkin_1' where nome = 'Check-in 1 realizado' and reuniao_tipo is null;
update public.atividades_cronograma set reuniao_tipo = 'checkin_2' where nome = 'Check-in 2 realizado' and reuniao_tipo is null;
update public.atividades_cronograma set reuniao_tipo = 'reuniao_final' where nome = 'Reunião final realizada' and reuniao_tipo is null;
