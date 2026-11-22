-- Entrega 7: participantes de ferias, respuesta con un toque, avisos y ficha publica
-- (RF-FER-02 a RF-FER-10, RF-CMP-07, RF-VEN-05, RF-MAP-05). Las migraciones aplicadas no se editan.
begin;

create table public.fair_participants (
 id uuid primary key default gen_random_uuid(),
 fair_id uuid not null references public.fairs(id) on delete cascade,
 shop_id text references public.shops(id) on delete cascade,
 association_id text references public.associations(id) on delete cascade,
 status text not null default 'invited' check (status in ('invited','confirmed','declined','added')),
 attendance text check (attendance in ('attended','absent')),
 invited_at timestamptz not null default now(),
 responded_at timestamptz,
 last_reminded_at timestamptz,
 followers_notified_at timestamptz,
 check ((shop_id is null) <> (association_id is null)),
 check (attendance is null or status in ('confirmed','added'))
);
create unique index fair_participants_shop on public.fair_participants(fair_id,shop_id) where shop_id is not null;
create unique index fair_participants_association on public.fair_participants(fair_id,association_id) where association_id is not null;
create index fair_participants_shop_status on public.fair_participants(shop_id,status);
alter table public.fair_participants enable row level security;
revoke all on public.fair_participants from public,anon,authenticated;
grant select on public.fair_participants to authenticated;
-- Lectura directa: el administrador ve todo; la dueña, solo su fila. Escribir solo mediante las funciones de abajo.
create policy fair_participants_admin_read on public.fair_participants for select to authenticated using(app_private.is_admin());
create policy fair_participants_owner_read on public.fair_participants for select to authenticated using(shop_id is not null and app_private.is_owner(shop_id));
create trigger fair_participants_audit after insert or update or delete on public.fair_participants for each row execute function app_private.audit_admin();

-- Avisa a quienes siguen a la tienda o asociacion cuando su participacion queda confirmada (una sola vez).
create function app_private.notify_followers_of_participation() returns trigger language plpgsql security definer set search_path='' as $$
declare f public.fairs; who text; ttype text; tid text; f_row record;
begin
 if new.status not in ('confirmed','added') or new.followers_notified_at is not null then return new; end if;
 select * into f from public.fairs where id=new.fair_id;
 if f.status<>'published' or f.ends_at<now() then return new; end if;
 if new.shop_id is not null then
  select name into who from public.shops where id=new.shop_id; ttype:='shop'; tid:=new.shop_id;
 else select name into who from public.associations where id=new.association_id; ttype:='association'; tid:=new.association_id; end if;
 for f_row in select subject from public.follows where target_type=ttype and target_id=tid loop
  perform app_private.notify(f_row.subject,'follow_fair_confirmed','Feria confirmada: '||f.name,
   who||' participara en '||f.name||' ('||f.place_name||', '||to_char(f.starts_at at time zone 'America/Santiago','DD/MM')||').',
   jsonb_build_object('fair_id',f.id,'fair_name',f.name,'target_type',ttype,'target_id',tid),true);
 end loop;
 update public.fair_participants set followers_notified_at=now() where id=new.id;
 return new;
end;
$$;
create trigger fair_participants_followers after insert or update of status on public.fair_participants
 for each row execute function app_private.notify_followers_of_participation();

-- Una feria cancelada avisa a quienes ya habian confirmado.
create function app_private.notify_fair_cancelled() returns trigger language plpgsql security definer set search_path='' as $$
declare r record;
begin
 if new.status='cancelled' and old.status<>'cancelled' then
  for r in select s.owner_uid from public.fair_participants p join public.shops s on s.id=p.shop_id
           where p.fair_id=new.id and p.status in ('confirmed','added','invited') loop
   perform app_private.notify(r.owner_uid::text,'fair_cancelled','Feria cancelada: '||new.name,'La feria fue cancelada por el administrador.',
    jsonb_build_object('fair_id',new.id,'fair_name',new.name),false);
  end loop;
 end if;
 return new;
end;
$$;
create trigger fairs_cancelled after update of status on public.fairs for each row execute function app_private.notify_fair_cancelled();

create function app_private.require_admin() returns void language plpgsql stable security definer set search_path='' as $$
begin if not app_private.is_admin() then raise exception 'Solo el administrador' using errcode='42501'; end if; end;
$$;

-- Invita (RF-FER-02). Reinvitar a quien rechazo la deja de nuevo pendiente; repetir la invitacion no duplica.
create function public.admin_invite_participant(p_fair_id uuid,p_shop_id text default null,p_association_id text default null) returns uuid
 language plpgsql security definer set search_path='' as $$
declare f public.fairs; pid uuid; st text;
begin
 perform app_private.require_admin();
 if (p_shop_id is null)=(p_association_id is null) then raise exception 'Indica una tienda o una asociacion' using errcode='23514'; end if;
 select * into f from public.fairs where id=p_fair_id;
 if not found then raise exception 'La feria no existe' using errcode='23503'; end if;
 if f.status='cancelled' then raise exception 'La feria esta cancelada' using errcode='23514'; end if;
 if p_shop_id is not null and not exists(select 1 from public.shops where id=p_shop_id and active) then raise exception 'La tienda no existe o esta inactiva' using errcode='23503'; end if;
 if p_association_id is not null and not exists(select 1 from public.associations where id=p_association_id and active) then raise exception 'La asociacion no existe o esta inactiva' using errcode='23503'; end if;
 select id,status into pid,st from public.fair_participants where fair_id=p_fair_id and shop_id is not distinct from p_shop_id and association_id is not distinct from p_association_id;
 if found then
  if st in ('confirmed','added') then raise exception 'Ya participa en la feria' using errcode='23505'; end if;
  if st='invited' then return pid; end if;
  update public.fair_participants set status='invited',responded_at=null,invited_at=now() where id=pid;
 else
  insert into public.fair_participants(fair_id,shop_id,association_id) values(p_fair_id,p_shop_id,p_association_id) returning id into pid;
 end if;
 if p_shop_id is not null then
  perform app_private.notify((select owner_uid::text from public.shops where id=p_shop_id),'invitation','Te invitaron a una feria: '||f.name,
   f.place_name||', '||to_char(f.starts_at at time zone 'America/Santiago','DD/MM HH24:MI')||'. Responde Participo o No participo.',
   jsonb_build_object('fair_id',f.id,'fair_name',f.name,'participant_id',pid),false);
 end if;
 return pid;
end;
$$;

-- Agrega sin invitacion (RF-FER-03).
create function public.admin_add_participant(p_fair_id uuid,p_shop_id text default null,p_association_id text default null) returns uuid
 language plpgsql security definer set search_path='' as $$
declare f public.fairs; pid uuid; st text;
begin
 perform app_private.require_admin();
 if (p_shop_id is null)=(p_association_id is null) then raise exception 'Indica una tienda o una asociacion' using errcode='23514'; end if;
 select * into f from public.fairs where id=p_fair_id;
 if not found then raise exception 'La feria no existe' using errcode='23503'; end if;
 if f.status='cancelled' then raise exception 'La feria esta cancelada' using errcode='23514'; end if;
 if p_shop_id is not null and not exists(select 1 from public.shops where id=p_shop_id and active) then raise exception 'La tienda no existe o esta inactiva' using errcode='23503'; end if;
 if p_association_id is not null and not exists(select 1 from public.associations where id=p_association_id and active) then raise exception 'La asociacion no existe o esta inactiva' using errcode='23503'; end if;
 select id,status into pid,st from public.fair_participants where fair_id=p_fair_id and shop_id is not distinct from p_shop_id and association_id is not distinct from p_association_id;
 if found then
  if st in ('confirmed','added') then return pid; end if;
  update public.fair_participants set status='added',responded_at=now() where id=pid;
 else
  insert into public.fair_participants(fair_id,shop_id,association_id,status,responded_at) values(p_fair_id,p_shop_id,p_association_id,'added',now()) returning id into pid;
 end if;
 if p_shop_id is not null then
  perform app_private.notify((select owner_uid::text from public.shops where id=p_shop_id),'invitation','Te agregaron a una feria: '||f.name,
   f.place_name||', '||to_char(f.starts_at at time zone 'America/Santiago','DD/MM HH24:MI')||'.',
   jsonb_build_object('fair_id',f.id,'fair_name',f.name,'participant_id',pid),false);
 end if;
 return pid;
end;
$$;

-- Respuesta de la emprendedora con un toque (RF-FER-08). Puede cambiar de opinion mientras la feria no termine.
create function public.respond_fair_invitation(p_fair_id uuid,p_participate boolean) returns text
 language plpgsql security definer set search_path='' as $$
declare sid text; f public.fairs; pid uuid; st text; target text:=case when p_participate then 'confirmed' else 'declined' end;
begin
 if p_participate is null then raise exception 'Indica si participas' using errcode='23514'; end if;
 select p.shop_id into sid from public.profiles p where p.id=auth.uid() and p.active and p.role='emprendedora';
 if sid is null or not app_private.is_owner(sid) then raise exception 'Solo la dueña de una tienda activa responde' using errcode='42501'; end if;
 select * into f from public.fairs where id=p_fair_id;
 if not found or f.status='draft' then raise exception 'La feria no existe' using errcode='23503'; end if;
 if f.status='cancelled' or f.ends_at<now() then raise exception 'La feria ya no admite respuestas' using errcode='23514'; end if;
 select id,status into pid,st from public.fair_participants where fair_id=p_fair_id and shop_id=sid for update;
 if not found then raise exception 'No estas invitada a esta feria' using errcode='42501'; end if;
 if st=target or (target='confirmed' and st='added') then return st; end if;
 update public.fair_participants set status=target,responded_at=now(),attendance=case when target='declined' then null else attendance end where id=pid;
 return target;
end;
$$;

-- Confirmar o rechazar en nombre de una asociacion (no tiene cuenta propia).
create function public.admin_set_participant_status(p_participant_id uuid,p_status text) returns void
 language plpgsql security definer set search_path='' as $$
declare r public.fair_participants;
begin
 perform app_private.require_admin();
 if p_status not in ('invited','confirmed','declined') then raise exception 'Estado invalido' using errcode='23514'; end if;
 select * into r from public.fair_participants where id=p_participant_id for update;
 if not found then raise exception 'El participante no existe' using errcode='23503'; end if;
 if r.association_id is null then raise exception 'Las tiendas responden desde la app o se agregan directamente' using errcode='42501'; end if;
 update public.fair_participants set status=p_status,responded_at=case when p_status='invited' then null else now() end,
  attendance=case when p_status in ('invited','declined') then null else attendance end where id=p_participant_id;
end;
$$;
create function public.admin_remove_participant(p_participant_id uuid) returns void
 language plpgsql security definer set search_path='' as $$
begin
 perform app_private.require_admin();
 delete from public.fair_participants where id=p_participant_id;
 if not found then raise exception 'El participante no existe' using errcode='23503'; end if;
end;
$$;
create function public.admin_set_attendance(p_participant_id uuid,p_attendance text) returns void
 language plpgsql security definer set search_path='' as $$
declare r public.fair_participants;
begin
 perform app_private.require_admin();
 if p_attendance is not null and p_attendance not in ('attended','absent') then raise exception 'Asistencia invalida' using errcode='23514'; end if;
 select * into r from public.fair_participants where id=p_participant_id for update;
 if not found then raise exception 'El participante no existe' using errcode='23503'; end if;
 if r.status not in ('confirmed','added') then raise exception 'Solo se registra asistencia de quienes participan' using errcode='23514'; end if;
 update public.fair_participants set attendance=p_attendance where id=p_participant_id;
end;
$$;

-- Checklist del administrador (RF-FER-04/05): estado, tipo de emprendimiento y asociaciones para filtrar.
create function public.admin_fair_checklist(p_fair_id uuid)
 returns table(participant_id uuid,kind text,shop_id text,association_id text,name text,entrepreneur_type text,
  association_ids text[],association_names text[],status text,attendance text,invited_at timestamptz,responded_at timestamptz,last_reminded_at timestamptz)
 language plpgsql stable security definer set search_path='' as $$
begin
 perform app_private.require_admin();
 return query
 select p.id,case when p.shop_id is not null then 'shop' else 'association' end,p.shop_id,p.association_id,
  coalesce(s.name,a.name),coalesce(s.entrepreneur_type,''),
  coalesce((select array_agg(sa.association_id order by sa.association_id) from public.shop_associations sa where sa.shop_id=p.shop_id),'{}'::text[]),
  coalesce((select array_agg(x.name order by x.name) from public.shop_associations sa join public.associations x on x.id=sa.association_id where sa.shop_id=p.shop_id),'{}'::text[]),
  p.status,p.attendance,p.invited_at,p.responded_at,p.last_reminded_at
 from public.fair_participants p left join public.shops s on s.id=p.shop_id left join public.associations a on a.id=p.association_id
 where p.fair_id=p_fair_id order by coalesce(s.name,a.name),p.id;
end;
$$;

-- Recordatorio a quienes no respondieron ('pending') o aviso a quienes participan ('confirmed'). Devuelve cuantas dueñas recibieron el aviso.
create function public.admin_send_fair_notice(p_fair_id uuid,p_audience text,p_message text default null) returns integer
 language plpgsql security definer set search_path='' as $$
declare f public.fairs; r record; c integer:=0; msg text;
begin
 perform app_private.require_admin();
 if p_audience not in ('pending','confirmed') then raise exception 'Destinatarias invalidas' using errcode='23514'; end if;
 if p_message is not null and length(trim(p_message))>500 then raise exception 'Mensaje demasiado largo' using errcode='23514'; end if;
 select * into f from public.fairs where id=p_fair_id;
 if not found then raise exception 'La feria no existe' using errcode='23503'; end if;
 if f.status='cancelled' then raise exception 'La feria esta cancelada' using errcode='23514'; end if;
 for r in select p.id,s.owner_uid from public.fair_participants p join public.shops s on s.id=p.shop_id and s.active
          where p.fair_id=p_fair_id and ((p_audience='pending' and p.status='invited') or (p_audience='confirmed' and p.status in ('confirmed','added'))) loop
  msg:=coalesce(nullif(trim(p_message),''),case when p_audience='pending' then 'Aun no respondes tu participacion. Entra a la app y elige Participo o No participo.'
                                                else 'Recordatorio de la feria en '||f.place_name||'.' end);
  perform app_private.notify(r.owner_uid::text,'fair_notice',case when p_audience='pending' then 'Recordatorio: ' else 'Aviso: ' end||f.name,msg,
   jsonb_build_object('fair_id',f.id,'fair_name',f.name,'participant_id',r.id,'audience',p_audience),false);
  if p_audience='pending' then update public.fair_participants set last_reminded_at=now() where id=r.id; end if;
  c:=c+1;
 end loop;
 return c;
end;
$$;

-- Calendario de la emprendedora: ferias a las que esta invitada, confirmada, agregada o que rechazo (la app filtra).
create function public.my_fair_invitations()
 returns table(fair_id uuid,name text,description text,image_url text,place_name text,latitude double precision,longitude double precision,
  starts_at timestamptz,ends_at timestamptz,fair_status text,my_status text,responded_at timestamptz)
 language plpgsql stable security definer set search_path='' as $$
declare sid text;
begin
 select p.shop_id into sid from public.profiles p where p.id=auth.uid() and p.active and p.role='emprendedora';
 if sid is null or not app_private.is_owner(sid) then raise exception 'Solo la dueña de una tienda activa' using errcode='42501'; end if;
 return query select f.id,f.name,f.description,f.image_url,f.place_name,f.latitude,f.longitude,f.starts_at,f.ends_at,f.status,p.status,p.responded_at
  from public.fair_participants p join public.fairs f on f.id=p.fair_id
  where p.shop_id=sid and f.status in ('published','cancelled') order by f.starts_at,f.id;
end;
$$;

-- Sugerencia de feria al vender (RF-VEN-05, RF-MAP-05). Solo ferias donde la tienda participa y que ocurren hoy;
-- con ubicacion (opcional) añade la distancia. La funcion no escribe: la ubicacion no se guarda.
create function public.suggest_fairs_for_sale(p_shop_id text,p_lat double precision default null,p_lng double precision default null)
 returns table(fair_id uuid,name text,place_name text,starts_at timestamptz,ends_at timestamptz,in_progress boolean,distance_km double precision)
 language plpgsql stable security definer set search_path='' as $$
begin
 if not app_private.is_owner(p_shop_id) then raise exception 'No tienes permiso en esta tienda' using errcode='42501'; end if;
 if (p_lat is null)<>(p_lng is null) or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'Ubicacion invalida' using errcode='23514'; end if;
 return query
 select f.id,f.name,f.place_name,f.starts_at,f.ends_at,(now()>=f.starts_at and now()<=f.ends_at),
  case when p_lat is null then null::double precision else
  2*6371*asin(least(1.0,sqrt(power(sin(radians(f.latitude-p_lat)/2),2)+cos(radians(p_lat))*cos(radians(f.latitude))*power(sin(radians(f.longitude-p_lng)/2),2)))) end
 from public.fair_participants p join public.fairs f on f.id=p.fair_id
 where p.shop_id=p_shop_id and p.status in ('confirmed','added') and f.status='published'
  and (now() at time zone 'America/Santiago')::date between (f.starts_at at time zone 'America/Santiago')::date and (f.ends_at at time zone 'America/Santiago')::date
 order by 6 desc,f.starts_at,f.id;
end;
$$;

-- Ficha publica (RF-FER-10): datos de la feria, confirmadas (nunca quien rechazo ni quien no respondio) y muestra del catalogo publico.
create function public.fair_public_detail(p_fair_id uuid) returns jsonb
 language plpgsql stable security definer set search_path='' as $$
declare fair jsonb; shops jsonb; assocs jsonb;
begin
 select to_jsonb(x) into fair from (select id,name,description,image_url,place_name,latitude,longitude,starts_at,ends_at,organizer,status
  from public.public_fairs where id=p_fair_id) x;
 if fair is null then return null; end if;
 select coalesce(jsonb_agg(jsonb_build_object('kind','shop','id',s.id,'name',s.name,'logo_url',s.logo_url,'entrepreneur_type',s.entrepreneur_type,
   'sample',(select coalesce(jsonb_agg(jsonb_build_object('id',pp.id,'name',pp.name,'price_clp',pp.price_clp,'photo',pp.photo) order by pp.name),'[]'::jsonb)
             from (select * from public.public_products where shop_id=s.id order by name limit 3) pp)) order by s.name),'[]'::jsonb) into shops
  from public.fair_participants p join public.public_shops s on s.id=p.shop_id where p.fair_id=p_fair_id and p.status in ('confirmed','added');
 select coalesce(jsonb_agg(jsonb_build_object('kind','association','id',a.id,'name',a.name,'logo_url',a.logo_url,'sector',a.sector) order by a.name),'[]'::jsonb) into assocs
  from public.fair_participants p join public.associations a on a.id=p.association_id and a.active where p.fair_id=p_fair_id and p.status in ('confirmed','added');
 return jsonb_build_object('fair',fair,'participants',shops||assocs);
end;
$$;

revoke all on function app_private.notify_followers_of_participation(),app_private.notify_fair_cancelled(),app_private.require_admin() from public,anon,authenticated;
revoke all on function public.admin_invite_participant(uuid,text,text),public.admin_add_participant(uuid,text,text),public.respond_fair_invitation(uuid,boolean),
 public.admin_set_participant_status(uuid,text),public.admin_remove_participant(uuid),public.admin_set_attendance(uuid,text),public.admin_fair_checklist(uuid),
 public.admin_send_fair_notice(uuid,text,text),public.my_fair_invitations(),public.suggest_fairs_for_sale(text,double precision,double precision),
 public.fair_public_detail(uuid) from public,anon;
grant execute on function public.admin_invite_participant(uuid,text,text),public.admin_add_participant(uuid,text,text),public.respond_fair_invitation(uuid,boolean),
 public.admin_set_participant_status(uuid,text),public.admin_remove_participant(uuid),public.admin_set_attendance(uuid,text),public.admin_fair_checklist(uuid),
 public.admin_send_fair_notice(uuid,text,text),public.my_fair_invitations(),public.suggest_fairs_for_sale(text,double precision,double precision) to authenticated;
grant execute on function public.fair_public_detail(uuid) to anon,authenticated;
notify pgrst,'reload schema';
commit;
