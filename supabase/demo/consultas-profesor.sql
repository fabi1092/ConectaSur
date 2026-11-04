-- Demo B01-B13: consultas de lectura para Supabase Studio > SQL Editor.
-- Ejecutar con el acceso administrativo del equipo; no modifica datos.
select 'shops' as tabla, count(*) as filas from public.shops
union all select 'profiles', count(*) from public.profiles
union all select 'associations', count(*) from public.associations
union all select 'entrepreneur_types', count(*) from public.entrepreneur_types
union all select 'categories', count(*) from public.categories
union all select 'product_types', count(*) from public.product_types;

select s.id, s.name as tienda, a.name as asociacion
from public.shops s
left join public.shop_associations sa on sa.shop_id = s.id
left join public.associations a on a.id = sa.association_id
order by s.name, a.name;

select role, active, count(*) as perfiles from public.profiles
group by role, active order by role, active;

select tablename, rowsecurity as rls_habilitado from pg_tables
where schemaname = 'public' and tablename in
('profiles', 'shops', 'products', 'sales', 'associations',
 'shop_associations', 'entrepreneur_types', 'categories', 'product_types')
order by tablename;

select tablename, policyname, cmd from pg_policies
where schemaname = 'public' order by tablename, policyname;

select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'shop-images';

-- B09: índices reales de la instancia, no solo el diagrama.
select tablename,indexname,indexdef from pg_indexes
where schemaname='public' order by tablename,indexname;

-- Versiones de esquema aplicadas; no incluye credenciales.
select id,applied_at from app_private.schema_migrations order by id;

-- W06/W07: disponibilidad de la función de edición de cuenta.
select to_regprocedure('public.update_entrepreneur_account(uuid,text,text,text)') is not null
as edicion_cuenta_disponible;
