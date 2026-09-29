-- A Agenda operacional precisa mostrar horário de reunião ("10:00 —
-- Kickoff — Cliente"), não só a data. kickoff_agendado_para e
-- treinamento_agendado_para eram `date` (sem hora) — viram `timestamptz`.
-- Valores existentes são preservados (convertidos pra meia-noite UTC,
-- editáveis a partir de agora com hora real).
alter table public.clientes
  alter column kickoff_agendado_para type timestamptz using (kickoff_agendado_para::timestamptz);
alter table public.clientes
  alter column treinamento_agendado_para type timestamptz using (treinamento_agendado_para::timestamptz);

-- O log de remarcações acompanha o mesmo tipo, senão perderia a hora
-- registrada numa remarcação.
alter table public.marco_remarcacoes
  alter column data_anterior type timestamptz using (data_anterior::timestamptz);
alter table public.marco_remarcacoes
  alter column data_nova type timestamptz using (data_nova::timestamptz);
