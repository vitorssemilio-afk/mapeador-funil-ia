-- Corrige o upload de avatar ("Alterar foto" no menu do usuário, PROMPT 55)
-- reaplicando de forma idempotente o que a migration 0082 já deveria ter
-- deixado pronto: bucket, limites e policies de storage.objects. Isso
-- elimina qualquer drift entre o que está nos arquivos de migration e o
-- que de fato está aplicado no projeto Supabase como causa do erro
-- genérico "Não foi possível enviar a foto" — sem precisar adivinhar qual
-- das duas é a causa real, porque reforça as duas.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Mesmo padrão já usado pro bucket 'cliente-anexos' (migration 0050):
-- limite de tamanho e tipos aceitos reforçados também no lado do Storage,
-- não só no frontend — um upload que passe da validação do navegador por
-- qualquer motivo (devtools, outra aba antiga em cache) ainda é bloqueado
-- aqui. 5 MB == TAMANHO_MAXIMO_BYTES em UserMenu.tsx.
update storage.buckets
set file_size_limit = 5242880, -- 5 MB
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'avatars';

drop policy if exists "avatars_select_public" on storage.objects;
create policy "avatars_select_public"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars_insert_own_or_admin" on storage.objects;
create policy "avatars_insert_own_or_admin"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (public.sou_administrador() or (storage.foldername(name))[1] = auth.uid()::text)
  );

drop policy if exists "avatars_update_own_or_admin" on storage.objects;
create policy "avatars_update_own_or_admin"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (public.sou_administrador() or (storage.foldername(name))[1] = auth.uid()::text)
  );

drop policy if exists "avatars_delete_own_or_admin" on storage.objects;
create policy "avatars_delete_own_or_admin"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (public.sou_administrador() or (storage.foldername(name))[1] = auth.uid()::text)
  );
