begin;

-- Las altas y los cambios de perfil pasan por funciones con permisos acotados.
-- SELECT conserva RLS. Los RPC de emprendedoras existentes siguen funcionando.
revoke insert, update, delete on public.profiles from authenticated;

create table app_private.admin_creation_requests (
 id uuid primary key,
 actor_uid uuid not null references auth.users(id) on delete cascade,
 target_uid uuid not null references auth.users(id) on delete cascade,
 display_name text not null,
 created_at timestamptz not null default now()
);
revoke all on app_private.admin_creation_requests from public, anon, authenticated;

create function public.list_platform_admins()
returns table(uid uuid, display_name text, email text, active boolean, created_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
 if not app_private.is_admin() then raise exception 'Necesitas una cuenta administradora activa' using errcode='42501'; end if;
 return query select p.id,p.display_name,u.email::text,p.active,p.created_at
 from public.profiles p join auth.users u on u.id=p.id where p.role='admin'
 order by p.active desc,lower(p.display_name),p.id;
end;
$$;

create function public.provision_platform_admin(p_uid uuid,p_name text,p_request_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare previous app_private.admin_creation_requests; target public.profiles;
begin
 -- El mismo bloqueo serializa altas y bajas. Se revisa el actor DESPUES de esperar.
 perform pg_catalog.pg_advisory_xact_lock(2026,63023);
 if not app_private.is_admin() then raise exception 'Necesitas una cuenta administradora activa' using errcode='42501'; end if;
 if p_uid is null or p_request_id is null or p_name is null or length(btrim(p_name)) not between 1 and 120 then
   raise exception 'Escribe un nombre de hasta 120 caracteres' using errcode='23514';
 end if;
 select * into previous from app_private.admin_creation_requests where id=p_request_id;
 if found then
   if previous.actor_uid<>auth.uid() or previous.target_uid<>p_uid or previous.display_name<>btrim(p_name) then
     raise exception 'La solicitud pertenece a otra creación' using errcode='CS006';
   end if;
   return p_uid; -- Reintentar no reactiva ni sobrescribe una cuenta editada después.
 end if;
 select * into target from public.profiles where id=p_uid for update;
 if not found or target.role<>'comprador' or not target.active or target.shop_id is not null then
   raise exception 'La cuenta ya tiene otro perfil o está desactivada' using errcode='CS005';
 end if;
 -- El alta debe corresponder a esta operación; nunca se toma una cuenta por su correo.
 if not exists(select 1 from auth.users u where u.id=p_uid
   and u.raw_user_meta_data->>'admin_creation_request'=p_request_id::text) then
   raise exception 'La cuenta no corresponde a esta creación' using errcode='CS005';
 end if;
 insert into app_private.admin_creation_requests(id,actor_uid,target_uid,display_name)
 values(p_request_id,auth.uid(),p_uid,btrim(p_name));
 update public.profiles set role='admin',display_name=btrim(p_name) where id=p_uid;
 return p_uid;
end;
$$;

create function public.update_platform_admin(p_uid uuid,p_name text,p_active boolean,p_expected_name text,p_expected_active boolean)
returns void language plpgsql security definer set search_path='' as $$
declare target public.profiles;
begin
 perform pg_catalog.pg_advisory_xact_lock(2026,63023);
 if not app_private.is_admin() then raise exception 'Necesitas una cuenta administradora activa' using errcode='42501'; end if;
 if p_name is null or length(btrim(p_name)) not between 1 and 120 or p_active is null then
   raise exception 'Revisa el nombre y el estado de la cuenta' using errcode='23514';
 end if;
 select * into target from public.profiles where id=p_uid for update;
 if not found or target.role<>'admin' then raise exception 'No existe esa cuenta administradora' using errcode='CS005'; end if;
 if p_uid=auth.uid() and not p_active then raise exception 'No puedes desactivar tu propia cuenta' using errcode='CS002'; end if;
 if target.active and not p_active and (select count(*) from public.profiles where role='admin' and active)<=1 then
   raise exception 'Debe quedar al menos un administrador activo' using errcode='CS003';
 end if;
 if target.display_name=btrim(p_name) and target.active=p_active then return; end if;
 if target.display_name is distinct from p_expected_name or target.active is distinct from p_expected_active then
   raise exception 'La cuenta cambió en otra sesión. Vuelve a la lista para revisar los datos actuales' using errcode='CS004';
 end if;
 update public.profiles set display_name=btrim(p_name),active=p_active where id=p_uid;
end;
$$;

revoke all on function public.list_platform_admins(),public.provision_platform_admin(uuid,text,uuid),public.update_platform_admin(uuid,text,boolean,text,boolean) from public,anon;
grant execute on function public.list_platform_admins(),public.provision_platform_admin(uuid,text,uuid),public.update_platform_admin(uuid,text,boolean,text,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
