-- Entrega 7: seguidores, calificaciones y configuracion de avisos de la tienda
-- (RF-CMP-06, RF-CMP-09, RF-CFG-04, RF-CFG-05, RNF-PRI-02). Las migraciones aplicadas no se editan.
-- La identidad de quien sigue o califica la entrega app_private.current_subject (migracion 012):
-- sesion de Supabase o ID token de Google/Firebase verificado en el servidor.
begin;

alter table public.shops
 add column allow_ratings boolean not null default true,
 add column contact_notifications boolean not null default true,
 add column notify_from time not null default '08:00',
 add column notify_until time not null default '21:00';

-- Las columnas nuevas van al final para conservar el contrato de la vista (migraciones 008 y 011).
create or replace view public.public_shops with(security_barrier=true) as
 select s.id,s.name,s.description,s.logo_url,s.entrepreneur_type,s.sector,s.contact,s.show_prices,
 s.contact_mode,s.whatsapp_number,s.pickup_label,s.pickup_lat,s.pickup_lng,s.allow_ratings
 from public.shops s join public.profiles p on p.id=s.owner_uid where s.active and p.active;

-- Horario de avisos de contacto. Si desde = hasta, el horario cubre todo el dia; si desde > hasta, cruza la medianoche.
create function app_private.in_notify_window(p_from time,p_until time) returns boolean language plpgsql stable set search_path='' as $$
declare t time:=(pg_catalog.now() at time zone 'America/Santiago')::time;
begin
 if p_from=p_until then return true; end if;
 if p_from<p_until then return t>=p_from and t<p_until; end if;
 return t>=p_from or t<p_until;
end;
$$;

create table public.follows (
 subject text not null check (length(subject) between 1 and 160),
 target_type text not null check (target_type in ('shop','association')),
 target_id text not null check (length(target_id) between 1 and 120),
 created_at timestamptz not null default now(),
 primary key (subject,target_type,target_id)
);
create index follows_target on public.follows(target_type,target_id);
alter table public.follows enable row level security;
revoke all on public.follows from public,anon,authenticated;

create function public.follow_target(p_target_type text,p_target_id text,p_token text default null) returns void
 language plpgsql security definer set search_path='' as $$
declare s text:=app_private.current_subject(p_token);
begin
 if p_target_type='shop' then
  if not exists(select 1 from public.public_shops where id=p_target_id) then raise exception 'La tienda no existe' using errcode='23503'; end if;
  if exists(select 1 from public.shops where id=p_target_id and owner_uid::text=s) then raise exception 'No puedes seguir tu propia tienda' using errcode='42501'; end if;
 elsif p_target_type='association' then
  if not exists(select 1 from public.associations where id=p_target_id and active) then raise exception 'La asociacion no existe' using errcode='23503'; end if;
 else raise exception 'Tipo invalido' using errcode='23514'; end if;
 insert into public.follows(subject,target_type,target_id) values(s,p_target_type,p_target_id) on conflict do nothing;
end;
$$;
create function public.unfollow_target(p_target_type text,p_target_id text,p_token text default null) returns void
 language plpgsql security definer set search_path='' as $$
declare s text:=app_private.current_subject(p_token);
begin
 delete from public.follows where subject=s and target_type=p_target_type and target_id=p_target_id;
end;
$$;
create function public.my_follows(p_token text default null)
 returns table(target_type text,target_id text,name text,logo_url text,created_at timestamptz)
 language plpgsql stable security definer set search_path='' as $$
declare s text:=app_private.current_subject(p_token);
begin
 return query
 select f.target_type,f.target_id,sh.name,sh.logo_url,f.created_at from public.follows f join public.public_shops sh on sh.id=f.target_id
  where f.subject=s and f.target_type='shop'
 union all
 select f.target_type,f.target_id,a.name,a.logo_url,f.created_at from public.follows f join public.associations a on a.id=f.target_id and a.active
  where f.subject=s and f.target_type='association'
 order by 5 desc,2;
end;
$$;

-- Calificaciones: una por persona y destino (tienda o producto), editable. Solo si la tienda las activa.
create table public.ratings (
 id uuid primary key default gen_random_uuid(),
 subject text not null check (length(subject) between 1 and 160),
 shop_id text not null references public.shops(id) on delete cascade,
 product_id text references public.products(id) on delete cascade,
 stars smallint not null check (stars between 1 and 5),
 comment text not null default '' check (length(comment)<=500),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index ratings_one_per_target on public.ratings(subject,shop_id,coalesce(product_id,''));
create index ratings_shop on public.ratings(shop_id,product_id);
alter table public.ratings enable row level security;
revoke all on public.ratings from public,anon,authenticated;

create function public.rate_target(p_shop_id text,p_product_id text,p_stars integer,p_comment text default '',p_token text default null)
 returns void language plpgsql security definer set search_path='' as $$
declare s text:=app_private.current_subject(p_token); sh public.public_shops; owner text;
begin
 select * into sh from public.public_shops where id=p_shop_id;
 if not found then raise exception 'La tienda no existe' using errcode='23503'; end if;
 if not sh.allow_ratings then raise exception 'Esta tienda no recibe calificaciones' using errcode='42501'; end if;
 select owner_uid::text into owner from public.shops where id=p_shop_id;
 if owner=s then raise exception 'No puedes calificar tu propia tienda' using errcode='42501'; end if;
 if p_stars is null or p_stars not between 1 and 5 or length(coalesce(p_comment,''))>500 then raise exception 'Calificacion invalida' using errcode='23514'; end if;
 if p_product_id is not null and not exists(select 1 from public.public_products where id=p_product_id and shop_id=p_shop_id) then
  raise exception 'El producto no existe' using errcode='23503'; end if;
 insert into public.ratings(subject,shop_id,product_id,stars,comment)
 values(s,p_shop_id,p_product_id,p_stars,trim(coalesce(p_comment,'')))
 on conflict(subject,shop_id,coalesce(product_id,'')) do update set stars=excluded.stars,comment=excluded.comment,updated_at=now();
end;
$$;
create function public.my_ratings(p_shop_id text,p_token text default null)
 returns table(product_id text,stars smallint,comment text)
 language plpgsql stable security definer set search_path='' as $$
declare s text:=app_private.current_subject(p_token);
begin
 return query select r.product_id,r.stars,r.comment from public.ratings r where r.subject=s and r.shop_id=p_shop_id;
end;
$$;
-- Promedios publicos: nunca revelan quien califico.
create view public.public_ratings with(security_barrier=true) as
 select r.shop_id,r.product_id,round(avg(r.stars)::numeric,2) as average,count(*)::integer as total
 from public.ratings r join public.public_shops s on s.id=r.shop_id group by r.shop_id,r.product_id;
revoke all on public.public_ratings from public,anon,authenticated;
grant select on public.public_ratings to anon,authenticated;
create function public.rating_comments(p_shop_id text,p_product_id text default null,p_limit integer default 20)
 returns table(stars smallint,comment text,created_at timestamptz)
 language sql stable security definer set search_path='' as $$
 select r.stars,r.comment,r.created_at from public.ratings r join public.public_shops s on s.id=r.shop_id
 where r.shop_id=p_shop_id and r.product_id is not distinct from p_product_id and r.comment<>''
 order by r.created_at desc limit greatest(1,least(coalesce(p_limit,20),100));
$$;

-- Contacto: se guarda siempre; solo avisa a la dueña si lo activo y dentro de su horario (RF-CFG-04).
-- Mismo contrato que la migracion 008; se agrega el aviso al final.
create or replace function public.send_shop_message(p_id uuid,p_shop_id text,p_name text,p_contact text,p_body text)
 returns uuid language plpgsql security definer set search_path='' as $$
declare existing public.shop_messages; sh public.shops;
begin
 if p_id is null or p_shop_id is null or p_name is null or p_contact is null or p_body is null or
 length(trim(p_name)) not between 1 and 100 or length(trim(p_contact)) not between 3 and 240 or
 length(trim(p_body)) not between 1 and 2000 then
 raise exception 'Revisa tu nombre, contacto y mensaje.' using errcode='23514'; end if;
 if not exists(select 1 from public.shops s join public.profiles u on u.id=s.owner_uid
 where s.id=p_shop_id and s.active and u.active and s.contact_mode in ('form','both')) then
 raise exception 'Esta tienda no recibe mensajes por formulario.' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_shop_id||':'||lower(trim(p_contact)),0));
 select * into existing from public.shop_messages where id=p_id;
 if found then
 if existing.shop_id=p_shop_id and existing.sender_name=trim(p_name) and
 existing.sender_contact=trim(p_contact) and existing.body=trim(p_body) then return p_id; end if;
 raise exception 'El identificador corresponde a otro envío.' using errcode='CS004'; end if;
 if (select count(*) from public.shop_messages where shop_id=p_shop_id and
 lower(sender_contact)=lower(trim(p_contact)) and created_at>now()-interval '10 minutes')>=3 then
 raise exception 'Espera unos minutos antes de volver a escribir a esta tienda.' using errcode='P0001'; end if;
 insert into public.shop_messages(id,shop_id,sender_name,sender_contact,body)
 values(p_id,p_shop_id,trim(p_name),trim(p_contact),trim(p_body));
 select * into sh from public.shops where id=p_shop_id;
 if sh.contact_notifications and app_private.in_notify_window(sh.notify_from,sh.notify_until) then
  perform app_private.notify(sh.owner_uid::text,'contact','Nuevo mensaje de contacto',
   left(trim(p_name),60)||': '||left(trim(p_body),120),jsonb_build_object('message_id',p_id,'shop_id',p_shop_id),false);
 end if;
 return p_id;
end;
$$;

revoke all on function app_private.in_notify_window(time,time) from public,anon,authenticated;
revoke all on function public.follow_target(text,text,text),public.unfollow_target(text,text,text),public.my_follows(text),
 public.rate_target(text,text,integer,text,text),public.my_ratings(text,text),public.rating_comments(text,text,integer) from public;
grant execute on function public.follow_target(text,text,text),public.unfollow_target(text,text,text),public.my_follows(text),
 public.rate_target(text,text,integer,text,text),public.my_ratings(text,text) to anon,authenticated;
grant execute on function public.rating_comments(text,text,integer) to anon,authenticated;
notify pgrst,'reload schema';
commit;
