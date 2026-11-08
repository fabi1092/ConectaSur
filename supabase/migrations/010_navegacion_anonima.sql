-- Entrega 6: navegación anónima configurable por el administrador (RF-ACC-06, RF-ADM-02).
-- allow = permitir; invite = invitar a iniciar sesión con opción de omitir; require = obligar el ingreso.
begin;
create table public.platform_settings (
 id boolean primary key default true check (id),
 anonymous_navigation text not null default 'allow' check (anonymous_navigation in ('allow','invite','require')),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id) on delete set null
);
insert into public.platform_settings(id) values(true);
alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from anon,authenticated;
grant select on public.platform_settings to anon,authenticated;
create policy platform_settings_read on public.platform_settings for select to anon,authenticated using(true);
create trigger platform_settings_audit after update on public.platform_settings for each row execute function app_private.audit_admin();

-- Único camino de escritura: el cliente no tiene permisos de UPDATE sobre la tabla.
create function public.set_anonymous_navigation(p_mode text) returns text
 language plpgsql security definer set search_path='' as $$
begin
 if not app_private.is_admin() then raise exception 'Solo administrador' using errcode='42501'; end if;
 if p_mode is null or p_mode not in ('allow','invite','require') then
   raise exception 'Opción de navegación inválida' using errcode='23514'; end if;
 update public.platform_settings set anonymous_navigation=p_mode,updated_at=now(),updated_by=auth.uid() where id;
 return p_mode;
end;
$$;
revoke all on function public.set_anonymous_navigation(text) from public,anon;
grant execute on function public.set_anonymous_navigation(text) to authenticated;
notify pgrst,'reload schema';
commit;
