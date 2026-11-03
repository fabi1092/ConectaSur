-- Logos públicos de asociaciones; las escrituras requieren administrador activo.
-- Bucket independiente para no mezclar sus permisos con los de las tiendas.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('association-images','association-images',true,2097152,array['image/jpeg','image/png','image/webp']);
create policy association_images_admin_read on storage.objects for select to authenticated
using(bucket_id='association-images' and app_private.is_admin());
create policy association_images_admin_create on storage.objects for insert to authenticated
with check(bucket_id='association-images' and app_private.is_admin());
create policy association_images_admin_update on storage.objects for update to authenticated
using(bucket_id='association-images' and app_private.is_admin())
with check(bucket_id='association-images' and app_private.is_admin());
create policy association_images_admin_delete on storage.objects for delete to authenticated
using(bucket_id='association-images' and app_private.is_admin());
notify pgrst,'reload schema';
commit;
