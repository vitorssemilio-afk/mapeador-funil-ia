-- Linha do tempo de observações livres por cliente (ex: "tentei marcar
-- reunião pro dia X, foi desmarcada") — pra ter o histórico de contato
-- dentro do próprio app, sem depender de anotação solta em outro lugar.
-- Guarda o e-mail de quem escreveu como texto (autor_email), não só o
-- user_id, pra continuar mostrando quem foi o autor mesmo que a conta seja
-- removida depois.

create table if not exists public.cliente_observacoes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  autor_email text,
  texto text not null,
  created_at timestamptz not null default now()
);

create index if not exists cliente_observacoes_cliente_id_idx
  on public.cliente_observacoes(cliente_id);

alter table public.cliente_observacoes enable row level security;

create policy "cliente_observacoes_all_authenticated"
  on public.cliente_observacoes for all
  to authenticated
  using (true)
  with check (true);
