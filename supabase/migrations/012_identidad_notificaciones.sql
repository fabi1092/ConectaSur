-- Entrega 7: identidad verificada de compradores Google/Firebase, consentimiento, dispositivos y avisos
-- (RF-ACC-08, RF-CMP-07, RF-CMP-08, RNF-PRI-02). Las migraciones aplicadas no se editan.
--
-- Problema: un comprador que entra con Google tiene identidad Firebase, no una sesion de Supabase.
-- La instancia no permite cambiar su Auth ni usar service_role, asi que el servidor (PostgreSQL)
-- verifica el ID token de Firebase por si mismo: firma RS256 con las claves publicas de Google
-- (tabla firebase_keys, la sincroniza tools/fcm-worker.mjs), proyecto, emisor, proveedor y correo.
-- Un token vigente solo identifica a la persona dentro de las funciones de esta entrega; nunca
-- otorga permisos de tienda ni de administrador.
begin;

create table app_private.settings (key text primary key, value text not null);
insert into app_private.settings(key,value) values ('firebase_project_id','conectasur-dev');
create table app_private.firebase_keys (
 kid text primary key check (length(kid) between 1 and 200),
 n text not null check (length(n) between 300 and 1400),
 e text not null check (length(e) between 1 and 12),
 fetched_at timestamptz not null default now()
);
revoke all on app_private.settings,app_private.firebase_keys from public,anon,authenticated;

-- Aritmetica RSA con numeric (PostgreSQL no trae verificacion RSA). Solo opera sobre datos publicos.
create function app_private.b64url_decode(p text) returns bytea language sql immutable set search_path='' as $$
 select pg_catalog.decode(pg_catalog.translate(p,'-_','+/')||pg_catalog.repeat('=',(4-pg_catalog.length(p)%4)%4),'base64')
$$;
create function app_private.bytes_to_numeric(b bytea) returns numeric language plpgsql immutable set search_path='' as $$
declare r numeric:=0; i integer;
begin
 for i in 0..pg_catalog.length(b)-1 loop r:=r*256+pg_catalog.get_byte(b,i); end loop;
 return r;
end;
$$;
create function app_private.modpow(b numeric,e numeric,m numeric) returns numeric language plpgsql immutable set search_path='' as $$
declare r numeric:=1; x numeric:=pg_catalog.mod(b,m); k numeric:=e;
begin
 while k>0 loop
  if pg_catalog.mod(k,2)=1 then r:=pg_catalog.mod(r*x,m); end if;
  x:=pg_catalog.mod(x*x,m); k:=pg_catalog.div(k,2);
 end loop;
 return r;
end;
$$;
-- RSASSA-PKCS1-v1_5 con SHA-256 (RS256). Exige el relleno exacto: no acepta firmas con basura.
create function app_private.rsa_sha256_verify(p_data bytea,p_sig bytea,p_n text,p_e text) returns boolean
 language plpgsql immutable set search_path='' as $$
declare n numeric:=app_private.bytes_to_numeric(app_private.b64url_decode(p_n));
 e numeric:=app_private.bytes_to_numeric(app_private.b64url_decode(p_e));
 k integer:=pg_catalog.length(app_private.b64url_decode(p_n));
 info bytea:='\x3031300d060960864801650304020105000420'::bytea||pg_catalog.sha256(p_data);
 expected bytea; s numeric;
begin
 if k<256 or k>512 or e<3 or e>4294967297 or pg_catalog.length(p_sig)<>k then return false; end if;
 s:=app_private.bytes_to_numeric(p_sig);
 if s>=n then return false; end if;
 expected:='\x0001'::bytea||pg_catalog.decode(pg_catalog.repeat('ff',k-3-pg_catalog.length(info)),'hex')||'\x00'::bytea||info;
 return app_private.modpow(s,e,n)=app_private.bytes_to_numeric(expected);
end;
$$;

-- Devuelve las declaraciones del token solo si todo coincide con lo que valida la app (firebase-buyer-session.js).
create function app_private.verify_firebase_token(p_token text) returns jsonb language plpgsql stable set search_path='' as $$
declare parts text[]; header jsonb; claims jsonb; k app_private.firebase_keys; project text;
 now_s bigint:=extract(epoch from pg_catalog.now())::bigint; ok boolean:=false; valid boolean;
begin
 if p_token is null or pg_catalog.length(p_token)>4096 then raise exception 'Credencial de Google invalida' using errcode='28000'; end if;
 parts:=pg_catalog.string_to_array(p_token,'.');
 if pg_catalog.cardinality(parts)<>3 then raise exception 'Credencial de Google invalida' using errcode='28000'; end if;
 begin
  header:=pg_catalog.convert_from(app_private.b64url_decode(parts[1]),'UTF8')::jsonb;
  claims:=pg_catalog.convert_from(app_private.b64url_decode(parts[2]),'UTF8')::jsonb;
 exception when others then raise exception 'Credencial de Google invalida' using errcode='28000'; end;
 if pg_catalog.jsonb_typeof(header)<>'object' or pg_catalog.jsonb_typeof(claims)<>'object' or header->>'alg'<>'RS256' or header->>'kid' is null then
  raise exception 'Credencial de Google invalida' using errcode='28000'; end if;
 select * into k from app_private.firebase_keys where kid=header->>'kid';
 if not found then raise exception 'Credencial de Google invalida o claves desactualizadas' using errcode='28000'; end if;
 begin
  ok:=app_private.rsa_sha256_verify(pg_catalog.convert_to(parts[1]||'.'||parts[2],'UTF8'),app_private.b64url_decode(parts[3]),k.n,k.e);
 exception when others then ok:=false; end;
 if not ok then raise exception 'Credencial de Google invalida' using errcode='28000'; end if;
 select value into project from app_private.settings where key='firebase_project_id';
 -- Cada condicion es estricta: un dato ausente o de otro tipo cuenta como invalido, nunca como valido.
 valid:=project is not null
  and coalesce(claims->>'aud'=project,false)
  and coalesce(claims->>'iss'='https://securetoken.google.com/'||project,false)
  and case when pg_catalog.jsonb_typeof(claims->'sub')='string' then pg_catalog.length(claims->>'sub') between 1 and 128 else false end
  and case when pg_catalog.jsonb_typeof(claims->'exp')='number' then (claims->>'exp')::numeric>now_s else false end
  and case when pg_catalog.jsonb_typeof(claims->'iat')='number' then (claims->>'iat')::numeric<=now_s+300 else false end
  and case when not (claims ? 'auth_time') then true
           when pg_catalog.jsonb_typeof(claims->'auth_time')='number' then (claims->>'auth_time')::numeric<=now_s+300 else false end
  and coalesce(claims->'email_verified'='true'::jsonb,false)
  and coalesce(claims->'firebase'->>'sign_in_provider'='google.com',false);
 if not valid then raise exception 'Credencial de Google invalida' using errcode='28000'; end if;
 return claims;
end;
$$;

-- Identidad de quien llama: sesion de Supabase (correo) o token de Firebase (Google). Nunca ambas mezcladas.
create function app_private.current_subject(p_token text default null) returns text language plpgsql stable set search_path='' as $$
declare claims jsonb;
begin
 if auth.uid() is not null then
  if not exists(select 1 from public.profiles where id=auth.uid() and active) then
   raise exception 'Cuenta inactiva' using errcode='42501'; end if;
  return auth.uid()::text;
 end if;
 if p_token is null then raise exception 'Inicia sesion para continuar' using errcode='28000'; end if;
 claims:=app_private.verify_firebase_token(p_token);
 return 'firebase:'||(claims->>'sub');
end;
$$;

-- Avisos: una sola tabla sirve de bandeja dentro de la app y de cola de envio push.
create table public.notifications (
 id uuid primary key default gen_random_uuid(),
 subject text not null check (length(subject) between 1 and 160),
 kind text not null check (kind in ('invitation','fair_notice','fair_cancelled','contact','follow_fair_confirmed')),
 title text not null check (length(title) between 1 and 160),
 body text not null default '' check (length(body)<=500),
 data jsonb not null default '{}'::jsonb check (jsonb_typeof(data)='object' and octet_length(data::text)<=2000),
 created_at timestamptz not null default now(),
 read_at timestamptz,
 push_sent_at timestamptz,
 push_attempts integer not null default 0,
 push_claimed_at timestamptz,
 push_error text check (length(push_error)<=300)
);
create index notifications_inbox on public.notifications(subject,created_at desc);
create index notifications_pending on public.notifications(created_at) where push_sent_at is null;
create table public.notification_consents (
 subject text primary key check (length(subject) between 1 and 160),
 granted boolean not null,
 updated_at timestamptz not null default now()
);
create table public.device_tokens (
 id uuid primary key default gen_random_uuid(),
 subject text not null check (length(subject) between 1 and 160),
 token text not null unique check (length(token) between 20 and 4096),
 platform text not null check (platform in ('android','web')),
 created_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now()
);
create index device_tokens_subject on public.device_tokens(subject);
-- Sin permisos para clientes: todo pasa por funciones que verifican la identidad.
alter table public.notifications enable row level security;
alter table public.notification_consents enable row level security;
alter table public.device_tokens enable row level security;
revoke all on public.notifications,public.notification_consents,public.device_tokens from public,anon,authenticated;

-- Crea el aviso. Los de seguidores exigen consentimiento vigente (RNF-PRI-02); los operativos de una tienda no.
create function app_private.notify(p_subject text,p_kind text,p_title text,p_body text,p_data jsonb,p_requires_consent boolean)
 returns uuid language plpgsql security definer set search_path='' as $$
declare nid uuid;
begin
 if p_requires_consent and not coalesce((select granted from public.notification_consents where subject=p_subject),false) then return null; end if;
 insert into public.notifications(subject,kind,title,body,data)
 values(p_subject,p_kind,left(p_title,160),left(coalesce(p_body,''),500),coalesce(p_data,'{}'::jsonb)) returning id into nid;
 return nid;
end;
$$;

create function public.verify_buyer_identity(p_token text default null) returns jsonb
 language plpgsql stable security definer set search_path='' as $$
declare s text:=app_private.current_subject(p_token);
begin
 return jsonb_build_object('subject',s,'provider',case when s like 'firebase:%' then 'firebase_google' else 'supabase' end);
end;
$$;

create function public.set_notification_consent(p_granted boolean,p_token text default null) returns boolean
 language plpgsql security definer set search_path='' as $$
declare s text:=app_private.current_subject(p_token);
begin
 if p_granted is null then raise exception 'Indica si aceptas recibir avisos' using errcode='23514'; end if;
 insert into public.notification_consents(subject,granted) values(s,p_granted)
  on conflict(subject) do update set granted=excluded.granted,updated_at=now();
 -- Retirar el consentimiento es darse de baja: se borran los dispositivos.
 if not p_granted then delete from public.device_tokens where subject=s; end if;
 return p_granted;
end;
$$;
create function public.get_notification_consent(p_token text default null) returns boolean
 language plpgsql stable security definer set search_path='' as $$
declare s text:=app_private.current_subject(p_token);
begin
 return coalesce((select granted from public.notification_consents where subject=s),false);
end;
$$;
create function public.register_device(p_fcm_token text,p_platform text,p_token text default null) returns void
 language plpgsql security definer set search_path='' as $$
declare s text:=app_private.current_subject(p_token);
begin
 if p_fcm_token is null or length(p_fcm_token) not between 20 and 4096 or p_platform not in ('android','web') then
  raise exception 'Dispositivo invalido' using errcode='23514'; end if;
 if not coalesce((select granted from public.notification_consents where subject=s),false) then
  raise exception 'Primero acepta recibir avisos' using errcode='42501'; end if;
 insert into public.device_tokens(subject,token,platform) values(s,p_fcm_token,p_platform)
  on conflict(token) do update set subject=excluded.subject,platform=excluded.platform,last_seen_at=now();
end;
$$;
create function public.unregister_device(p_fcm_token text,p_token text default null) returns void
 language plpgsql security definer set search_path='' as $$
declare s text:=app_private.current_subject(p_token);
begin
 delete from public.device_tokens where token=p_fcm_token and subject=s;
end;
$$;
create function public.my_notifications(p_limit integer default 50,p_token text default null)
 returns table(id uuid,kind text,title text,body text,data jsonb,created_at timestamptz,read_at timestamptz)
 language plpgsql stable security definer set search_path='' as $$
declare s text:=app_private.current_subject(p_token);
begin
 return query select n.id,n.kind,n.title,n.body,n.data,n.created_at,n.read_at from public.notifications n
  where n.subject=s order by n.created_at desc,n.id limit greatest(1,least(coalesce(p_limit,50),200));
end;
$$;
create function public.mark_notifications_read(p_ids uuid[],p_token text default null) returns integer
 language plpgsql security definer set search_path='' as $$
declare s text:=app_private.current_subject(p_token); c integer;
begin
 update public.notifications set read_at=coalesce(read_at,now()) where subject=s and id=any(p_ids);
 get diagnostics c=row_count; return c;
end;
$$;

-- Cola de envio push para tools/fcm-worker.mjs. Lotes con bloqueo, maximo 5 intentos, avisos sin
-- dispositivo vigente se cierran para no llegar tarde a un telefono que se registre despues.
create function app_private.claim_push_batch(p_limit integer default 20) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 update public.notifications n set push_sent_at=now(),push_error='sin dispositivos con consentimiento'
 where n.push_sent_at is null
  and not exists(select 1 from public.device_tokens d join public.notification_consents c on c.subject=d.subject and c.granted
                 where d.subject=n.subject);
 with picked as (
  select n.id from public.notifications n
  where n.push_sent_at is null and n.push_attempts<5 and (n.push_claimed_at is null or n.push_claimed_at<now()-interval '2 minutes')
  order by n.created_at limit greatest(1,least(coalesce(p_limit,20),100)) for update skip locked),
 marked as (
  update public.notifications n set push_attempts=n.push_attempts+1,push_claimed_at=now()
  from picked where n.id=picked.id returning n.*)
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind,'title',m.title,'body',m.body,'data',m.data,
   'tokens',(select coalesce(jsonb_agg(jsonb_build_object('token',d.token,'platform',d.platform)),'[]'::jsonb)
             from public.device_tokens d join public.notification_consents c on c.subject=d.subject and c.granted
             where d.subject=m.subject)) order by m.created_at),'[]'::jsonb) into result from marked m;
 return result;
end;
$$;
create function app_private.finish_push(p_id uuid,p_ok boolean,p_error text default null) returns void
 language sql security definer set search_path='' as $$
 update public.notifications set push_sent_at=case when p_ok then now() else push_sent_at end,
  push_error=case when p_ok then null else left(p_error,300) end where id=p_id;
$$;
create function app_private.drop_device(p_fcm_token text) returns void
 language sql security definer set search_path='' as $$
 delete from public.device_tokens where token=p_fcm_token;
$$;
create function app_private.sync_firebase_keys(p_keys jsonb) returns integer
 language plpgsql security definer set search_path='' as $$
declare k jsonb; c integer:=0;
begin
 if pg_catalog.jsonb_typeof(p_keys)<>'array' or pg_catalog.jsonb_array_length(p_keys)=0 then raise exception 'Sin claves' using errcode='23514'; end if;
 for k in select * from pg_catalog.jsonb_array_elements(p_keys) loop
  if k->>'kty'<>'RSA' then continue; end if;
  insert into app_private.firebase_keys(kid,n,e) values(k->>'kid',k->>'n',k->>'e')
   on conflict(kid) do update set n=excluded.n,e=excluded.e,fetched_at=now();
  c:=c+1;
 end loop;
 -- Google retira claves antiguas: se borran las que ya no aparecen en el JWKS vigente.
 delete from app_private.firebase_keys where kid<>all(array(select x->>'kid' from pg_catalog.jsonb_array_elements(p_keys) x));
 return c;
end;
$$;

revoke all on function app_private.b64url_decode(text),app_private.bytes_to_numeric(bytea),app_private.modpow(numeric,numeric,numeric),
 app_private.rsa_sha256_verify(bytea,bytea,text,text),app_private.verify_firebase_token(text),app_private.current_subject(text),
 app_private.notify(text,text,text,text,jsonb,boolean),app_private.claim_push_batch(integer),app_private.finish_push(uuid,boolean,text),
 app_private.drop_device(text),app_private.sync_firebase_keys(jsonb) from public,anon,authenticated;
revoke all on function public.verify_buyer_identity(text),public.set_notification_consent(boolean,text),public.get_notification_consent(text),
 public.register_device(text,text,text),public.unregister_device(text,text),public.my_notifications(integer,text),
 public.mark_notifications_read(uuid[],text) from public;
grant execute on function public.verify_buyer_identity(text),public.set_notification_consent(boolean,text),public.get_notification_consent(text),
 public.register_device(text,text,text),public.unregister_device(text,text),public.my_notifications(integer,text),
 public.mark_notifications_read(uuid[],text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
