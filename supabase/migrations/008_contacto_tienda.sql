begin;
alter table public.shops add column contact_mode text not null default 'form'
 check (contact_mode in ('whatsapp','form','both'));
alter table public.shops add column whatsapp_number text not null default '';
alter table public.shops add constraint shops_whatsapp_valid check
 ((contact_mode='form' and whatsapp_number='') or
 (contact_mode in ('whatsapp','both') and whatsapp_number ~ '^[1-9][0-9]{7,14}$'));

-- Añadir columnas al final mantiene el contrato de la vista existente.
create or replace view public.public_shops with(security_barrier=true) as
 select s.id,s.name,s.description,s.logo_url,s.entrepreneur_type,s.sector,s.contact,s.show_prices,
 s.contact_mode,s.whatsapp_number
 from public.shops s join public.profiles p on p.id=s.owner_uid where s.active and p.active;

create table public.shop_messages (
 id uuid primary key,
 shop_id text not null references public.shops(id) on delete cascade,
 sender_name text not null check(length(trim(sender_name)) between 1 and 100),
 sender_contact text not null check(length(trim(sender_contact)) between 3 and 240),
 body text not null check(length(trim(body)) between 1 and 2000),
 created_at timestamptz not null default now(),
 read_at timestamptz
);
create index shop_messages_inbox on public.shop_messages(shop_id,created_at desc,id);
create index shop_messages_throttle on public.shop_messages(shop_id,lower(sender_contact),created_at desc);
alter table public.shop_messages enable row level security;
revoke all on public.shop_messages from public,anon,authenticated;
grant select on public.shop_messages to authenticated;
create policy messages_owner_read on public.shop_messages for select to authenticated
 using(app_private.is_owner(shop_id));

-- Visitantes solo pueden enviar mediante este RPC; nunca leen la bandeja.
create function public.send_shop_message(p_id uuid,p_shop_id text,p_name text,p_contact text,p_body text)
 returns uuid language plpgsql security definer set search_path='' as $$
declare existing public.shop_messages;
begin
 if p_id is null or p_shop_id is null or p_name is null or p_contact is null or p_body is null or
 length(trim(p_name)) not between 1 and 100 or length(trim(p_contact)) not between 3 and 240 or
 length(trim(p_body)) not between 1 and 2000 then
 raise exception 'Revisa tu nombre, contacto y mensaje.' using errcode='23514'; end if;
 if not exists(select 1 from public.shops s join public.profiles u on u.id=s.owner_uid
 where s.id=p_shop_id and s.active and u.active and s.contact_mode in ('form','both')) then
 raise exception 'Esta tienda no recibe mensajes por formulario.' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_shop_id||':'||lower(trim(p_contact)),0));
 -- El mismo envío se puede reintentar si se perdió la respuesta, sin duplicarlo.
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
 return p_id;
end;
$$;

create function public.read_shop_message(p_id uuid) returns void
 language plpgsql security definer set search_path='' as $$
begin
 update public.shop_messages set read_at=coalesce(read_at,now())
 where id=p_id and app_private.is_owner(shop_id);
 if not found then raise exception 'No tienes acceso a este mensaje.' using errcode='42501'; end if;
end;
$$;
revoke all on function public.send_shop_message(uuid,text,text,text,text) from public;
grant execute on function public.send_shop_message(uuid,text,text,text,text) to anon,authenticated;
revoke all on function public.read_shop_message(uuid) from public,anon;
grant execute on function public.read_shop_message(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
