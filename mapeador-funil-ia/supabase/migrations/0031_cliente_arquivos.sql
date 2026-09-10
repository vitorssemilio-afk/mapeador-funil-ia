-- Upload de arquivos (PDF, PNG etc.) por cliente. O arquivo em si vai pro
-- Storage (bucket privado — só quem está autenticado no app consegue ler,
-- via signed URL gerada na hora do download); esta tabela guarda só os
-- metadados (nome, caminho no bucket, quem subiu, quando).

insert into storage.buckets (id, name, public)
values ('cliente-anexos', 'cliente-anexos', false)
on conflict (id) do nothing;

create policy "cliente_anexos_select_authenticated"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'cliente-anexos');

create policy "cliente_anexos_insert_authenticated"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'cliente-anexos');

create policy "cliente_anexos_delete_authenticated"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'cliente-anexos');

create table if not exists public.cliente_arquivos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  nome_arquivo text not null,
  caminho_storage text not null,
  tipo_mime text,
  tamanho_bytes bigint,
  user_id uuid references auth.users(id) on delete set null,
  autor_email text,
  created_at timestamptz not null default now()
);

create index if not exists cliente_arquivos_cliente_id_idx
  on public.cliente_arquivos(cliente_id);

alter table public.cliente_arquivos enable row level security;

create policy "cliente_arquivos_all_authenticated"
  on public.cliente_arquivos for all
  to authenticated
  using (true)
  with check (true);
