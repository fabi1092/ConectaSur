begin;

-- W06/W07: editar la persona, sin cambiar tienda, acceso, rol ni activación.
create function public.update_entrepreneur_account(
 p_uid uuid, p_shop_id text, p_name text, p_expected_name text
) returns void language plpgsql security definer set search_path='' as $$
declare target public.profiles; clean_name text;
begin
 -- Compartido con las altas/bajas de administradores: comprobar permisos después de esperar.
 perform pg_catalog.pg_advisory_xact_lock(2026,63023);
 if not app_private.is_admin() then
   raise exception 'Necesitas una cuenta administradora activa' using errcode='42501';
 end if;
 clean_name := pg_catalog.btrim(p_name);
 if p_uid is null or p_shop_id is null or pg_catalog.length(p_shop_id) not between 1 and 120
   or clean_name is null or pg_catalog.length(clean_name) not between 1 and 120
   or p_expected_name is null or pg_catalog.length(pg_catalog.btrim(p_expected_name)) not between 1 and 120 then
   raise exception 'Revisa la cuenta y escribe un nombre de hasta 120 caracteres' using errcode='23514';
 end if;
 select * into target from public.profiles where id=p_uid for update;
 if not found or target.role<>'emprendedora' or target.shop_id is distinct from p_shop_id
   or not exists(select 1 from public.shops s where s.id=p_shop_id and s.owner_uid=p_uid) then
   raise exception 'La cuenta, su rol o su tienda ya no coinciden' using errcode='CS005';
 end if;
 if not app_private.is_admin() then
   raise exception 'Necesitas una cuenta administradora activa' using errcode='42501';
 end if;
 -- Una respuesta perdida puede reintentarse sin sobrescribir una edición posterior.
 if target.display_name=clean_name then return; end if;
 if target.display_name is distinct from p_expected_name then
   raise exception 'La cuenta cambió en otra sesión. Revisa el nombre actual' using errcode='CS004';
 end if;
 update public.profiles set display_name=clean_name where id=p_uid;
end;
$$;

revoke all on function public.update_entrepreneur_account(uuid,text,text,text) from public,anon;
grant execute on function public.update_entrepreneur_account(uuid,text,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
