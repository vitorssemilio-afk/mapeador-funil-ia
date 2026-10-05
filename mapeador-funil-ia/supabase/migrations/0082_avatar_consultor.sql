-- Avatar do usuário logado (refinamento de layout da sidebar/header —
-- "consultores.avatar_url" já existia desde a migration 0040, só nunca
-- teve um jeito do próprio consultor preencher: hoje a UPDATE de
-- `consultores` é restrita a administrador (migration 0051). Este
-- arquivo abre, especificamente, a troca do PRÓPRIO avatar.
--
-- Bucket público (leitura sem signed URL, igual o campo já funcionava
-- como URL de texto simples renderizada num <img>) — igual ao padrão já
-- usado em "cliente-anexos" (migration 0031), mas aqui com
-- `public = true` porque avatar não é documento sensível e precisa
-- carregar direto no header sem round-trip extra pra assinar URL.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Caminho esperado: {user_id}/profile.<ext> — cada consultor só grava
-- dentro da própria pasta (nome do primeiro segmento = auth.uid()),
-- administrador pode gravar em qualquer uma (ex: apagar avatar de quem
-- saiu do time).
create policy "avatars_select_public"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatars_insert_own_or_admin"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (public.sou_administrador() or (storage.foldername(name))[1] = auth.uid()::text)
  );

create policy "avatars_update_own_or_admin"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (public.sou_administrador() or (storage.foldername(name))[1] = auth.uid()::text)
  );

create policy "avatars_delete_own_or_admin"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (public.sou_administrador() or (storage.foldername(name))[1] = auth.uid()::text)
  );

-- RLS de `consultores`: a policy de UPDATE existente (0051) já cobre
-- administrador; esta soma a permissão de cada um dar UPDATE na própria
-- linha (user_id = auth.uid()). Múltiplas policies permissivas pro mesmo
-- comando se combinam com OR — não substitui a de admin, só adiciona.
create policy "consultores_update_self"
  on public.consultores for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- A policy acima sozinha deixaria o próprio consultor alterar QUALQUER
-- coluna da própria linha (nome, email, papel...), não só o avatar. Este
-- trigger é quem de fato restringe isso — nunca confiar só no frontend
-- pra essa regra (seção 19 do pedido). Administrador passa direto.
create or replace function public.restringir_autoedicao_consultor_a_avatar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.sou_administrador() then
    return new;
  end if;

  if new.nome is distinct from old.nome
     or new.email is distinct from old.email
     or new.telefone is distinct from old.telefone
     or new.cargo is distinct from old.cargo
     or new.ativo is distinct from old.ativo
     or new.user_id is distinct from old.user_id
     or new.role is distinct from old.role then
    raise exception 'Só administradores podem alterar esses campos — um consultor só pode atualizar o próprio avatar.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_restringir_autoedicao_consultor_a_avatar on public.consultores;

create trigger trg_restringir_autoedicao_consultor_a_avatar
  before update on public.consultores
  for each row
  execute function public.restringir_autoedicao_consultor_a_avatar();
