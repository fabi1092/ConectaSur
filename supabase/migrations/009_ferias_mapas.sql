-- Entrega 6: ferias con ubicación en mapa (RF-FER-01, RF-MAP-01 a 03, RNF-PRI-04).
-- Las migraciones aplicadas no se editan: este archivo se aplica una sola vez.
begin;
create table public.fairs (
 id uuid primary key default gen_random_uuid(),
 name text not null check (length(trim(name)) between 1 and 120),
 description text not null default '' check (length(description)<=2000),
 image_url text check (length(image_url)<=2048),
 place_name text not null check (length(trim(place_name)) between 1 and 240),
 latitude double precision not null check (latitude between -90 and 90),
 longitude double precision not null check (longitude between -180 and 180),
 starts_at timestamptz not null,
 ends_at timestamptz not null,
 organizer text not null default '' check (length(organizer)<=240),
 status text not null default 'draft' check (status in ('draft','published','cancelled')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (ends_at > starts_at)
);
create index fairs_upcoming_idx on public.fairs(status,ends_at);

create function app_private.guard_fair() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.id<>old.id or new.created_at<>old.created_at) then
   raise exception 'Campos protegidos de la feria' using errcode='42501'; end if;
 new.updated_at:=now(); return new;
end;
$$;
create trigger fairs_guard before insert or update on public.fairs for each row execute function app_private.guard_fair();
create trigger fairs_audit after insert or update or delete on public.fairs for each row execute function app_private.audit_admin();
revoke all on function app_private.guard_fair() from public,anon;

alter table public.fairs enable row level security;
revoke all on public.fairs from anon,authenticated;
grant select,insert,update,delete on public.fairs to authenticated;
create policy fairs_admin on public.fairs for all to authenticated
 using(app_private.is_admin()) with check(app_private.is_admin());

-- Proyección pública: borradores nunca visibles; las canceladas se muestran como tales
-- para que un enlace ya compartido no quede roto.
create view public.public_fairs with(security_barrier=true) as
 select f.id,f.name,f.description,f.image_url,f.place_name,f.latitude,f.longitude,
 f.starts_at,f.ends_at,f.organizer,f.status
 from public.fairs f where f.status in ('published','cancelled');
revoke all on public.public_fairs from anon,authenticated;
grant select on public.public_fairs to anon,authenticated;

-- Próximas ferias publicadas. Con ubicación del visitante ordena por distancia (haversine, km);
-- sin ella, por fecha. Función STABLE: no escribe, así que la ubicación NO se guarda (RNF-PRI-04).
create function public.upcoming_fairs(p_lat double precision default null,p_lng double precision default null)
 returns table(id uuid,name text,description text,image_url text,place_name text,latitude double precision,
 longitude double precision,starts_at timestamptz,ends_at timestamptz,organizer text,distance_km double precision)
 language plpgsql stable security definer set search_path='' as $$
begin
 if (p_lat is null)<>(p_lng is null) or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
   raise exception 'Ubicación inválida' using errcode='23514'; end if;
 return query
 select q.id,q.name,q.description,q.image_url,q.place_name,q.latitude,q.longitude,q.starts_at,q.ends_at,q.organizer,q.distance_km
 from (select f.id,f.name,f.description,f.image_url,f.place_name,f.latitude,f.longitude,f.starts_at,f.ends_at,f.organizer,
   case when p_lat is null then null::double precision else
   2*6371*asin(least(1.0,sqrt(power(sin(radians(f.latitude-p_lat)/2),2)+
   cos(radians(p_lat))*cos(radians(f.latitude))*power(sin(radians(f.longitude-p_lng)/2),2)))) end as distance_km
   from public.fairs f where f.status='published' and f.ends_at>=now()) q
 order by q.distance_km asc nulls last,q.starts_at asc,q.id asc;
end;
$$;
revoke all on function public.upcoming_fairs(double precision,double precision) from public;
grant execute on function public.upcoming_fairs(double precision,double precision) to anon,authenticated;
notify pgrst,'reload schema';
commit;
