-- =============================================================================
-- calories-tracker · Paso D · Storage de fotos de platillos
-- Pegar TODO este archivo en: Supabase Dashboard → SQL Editor → Run.
-- Correr DESPUÉS de schema.sql y schema-meals-settings.sql. Es idempotente.
--
-- Bucket PRIVADO + RLS por usuario: cada quien solo su carpeta {auth.uid()}/...
-- La ruta del objeto es {user_id}/{uuid}.{ext}; el user_id lo deriva el servidor
-- de la sesión (no del cliente). Sin service_role.
-- =============================================================================

-- Bucket privado para fotos de platillos (límite 8 MB, solo imágenes).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meal-photos', 'meal-photos', false, 8388608,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- RLS en storage.objects: la primera carpeta del path debe ser el uid del usuario.
drop policy if exists meal_photos_select_own on storage.objects;
create policy meal_photos_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists meal_photos_insert_own on storage.objects;
create policy meal_photos_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists meal_photos_delete_own on storage.objects;
create policy meal_photos_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
