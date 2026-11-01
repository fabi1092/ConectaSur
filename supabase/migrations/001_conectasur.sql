-- ConectaSur / SurCode. PostgreSQL 15+. Aplicar una vez desde Studio o tools/admin.mjs.
-- No requiere service_role y no modifica la infraestructura del profesor.
begin;
create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'comprador' check (role in ('admin','emprendedora','comprador')),
  active boolean not null default true,
  display_name text not null check (length(trim(display_name)) between 1 and 120),
  shop_id text,
  created_at timestamptz not null default now(),
  check ((role = 'emprendedora' and shop_id is not null) or (role <> 'emprendedora' and shop_id is null))
);
create table public.associations (
  id text primary key check (length(id) between 1 and 120),
  name text not null check (length(trim(name)) between 1 and 120),
  description text not null default '' check (length(description)<=1000),
  sector text not null default '' check (length(sector)<=240),
  contact text not null default '' check (length(contact)<=240),
  logo_url text check (length(logo_url)<=2048),
  active boolean not null default true
);
create table public.shops (
  id text primary key check (length(id) between 1 and 120),
  owner_uid uuid not null unique references auth.users(id),
  name text not null check (length(trim(name)) between 1 and 120),
  description text not null default '' check (length(description)<=1000),
  logo_url text check (length(logo_url)<=2048),
  entrepreneur_type text not null default '' check (length(entrepreneur_type)<=120),
  sector text not null default '' check (length(sector)<=240),
  contact text not null default '' check (length(contact)<=240),
  show_prices boolean not null default true,
  history_enabled boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles add constraint profiles_shop_fk foreign key(shop_id) references public.shops(id) deferrable initially deferred;
create table public.shop_associations (
  shop_id text not null references public.shops(id) on delete cascade,
  association_id text not null references public.associations(id) on delete cascade,
  primary key(shop_id, association_id)
);
create table public.categories (id text primary key, name text not null check(length(trim(name)) between 1 and 120));
create table public.product_types (id text primary key, name text not null check(length(trim(name)) between 1 and 120), fields jsonb not null default '{}'::jsonb check(jsonb_typeof(fields)='object'));
create table public.entrepreneur_types (id text primary key, name text not null check(length(trim(name)) between 1 and 120));
create table public.products (
  id text primary key check (length(id) between 1 and 120),
  shop_id text not null references public.shops(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  description text not null default '' check(length(description)<=1000),
  category text not null default '' check(length(category)<=120),
  product_type text not null default '' check(length(product_type)<=120),
  attributes jsonb not null default '{}'::jsonb check(jsonb_typeof(attributes)='object' and octet_length(attributes::text)<=10000),
  price_clp bigint not null check(price_clp between 0 and 9007199254740991),
  show_price boolean not null default true,
  stock_mode text not null check(stock_mode in ('UNITS','UNIQUE','ON_REQUEST')),
  quantity integer check(quantity>=0),
  visible boolean not null default true,
  photo text not null default '' check(length(photo)<=2048),
  variants jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  check(stock_mode='ON_REQUEST' or quantity is not null),
  check(stock_mode<>'UNIQUE' or quantity between 0 and 1)
);
create index products_shop_idx on public.products(shop_id);
create table public.sales (
  id uuid primary key,
  shop_id text not null references public.shops(id),
  product_id text not null,
  product_name text not null,
  variant_id text,
  quantity integer not null check(quantity>0),
  price_clp bigint not null check(price_clp>=0),
  place text not null default '' check(length(place)<=240),
  date_millis bigint not null default (extract(epoch from clock_timestamp())*1000)::bigint,
  created_at timestamptz not null default now()
);
create index sales_shop_date_idx on public.sales(shop_id,date_millis desc);
create table app_private.sale_requests (
  id uuid primary key,
  owner_uid uuid not null,
  payload_hash text not null,
  created_at timestamptz not null default now()
);
create table public.admin_actions (
  id bigint generated always as identity primary key,
  actor_uid uuid,
  action text not null,
  target_table text not null,
  target_id text,
  created_at timestamptz not null default now()
);

create function app_private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and p.active and p.role='admin');
$$;
create function app_private.is_owner(sid text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join public.shops s on s.id=p.shop_id
 where p.id=auth.uid() and p.active and p.role='emprendedora' and s.id=sid and s.owner_uid=auth.uid() and s.active);
$$;
revoke all on function app_private.is_admin(),app_private.is_owner(text) from public;
grant execute on function app_private.is_admin(),app_private.is_owner(text) to authenticated;

create function app_private.create_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,display_name) values(new.id,coalesce(nullif(left(trim(new.raw_user_meta_data->>'display_name'),120),''),'Comprador'));
 return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function app_private.create_profile();

create function app_private.validate_product() returns trigger language plpgsql set search_path='' as $$
declare v jsonb; ids text[]:='{}'; total bigint:=0;
begin
 if tg_op='UPDATE' and (new.id<>old.id or new.shop_id<>old.shop_id) then raise exception 'No se puede cambiar la tienda o el identificador' using errcode='23514'; end if;
 if jsonb_typeof(new.variants)<>'array' or jsonb_array_length(new.variants)>100 then raise exception 'Opciones invalidas (maximo 100)' using errcode='23514'; end if;
 for v in select * from jsonb_array_elements(new.variants) loop
   if jsonb_typeof(v)<>'object' or not (v ?& array['id','label','quantity'])
      or (v - array['id','label','quantity','priceClp','photo'])<>'{}'::jsonb then raise exception 'Opcion incompleta' using errcode='23514'; end if;
   if jsonb_typeof(v->'id')<>'string' or length(trim(v->>'id')) not between 1 and 120
      or jsonb_typeof(v->'label')<>'string' or length(trim(v->>'label')) not between 1 and 120
      or jsonb_typeof(v->'quantity')<>'number' or (v->>'quantity') !~ '^[0-9]+$' then raise exception 'Opcion invalida' using errcode='23514'; end if;
   if (v->>'quantity')::numeric>2147483647 then raise exception 'Cantidad excesiva' using errcode='23514'; end if;
   if v->>'id'=any(ids) then raise exception 'Identificador de opcion duplicado' using errcode='23514'; end if;
   if v ? 'priceClp' and v->'priceClp'<>'null'::jsonb and (jsonb_typeof(v->'priceClp')<>'number' or (v->>'priceClp') !~ '^[0-9]+$' or (v->>'priceClp')::numeric>9007199254740991) then raise exception 'Precio de opcion invalido' using errcode='23514'; end if;
   if v ? 'photo' and v->'photo'<>'null'::jsonb and (jsonb_typeof(v->'photo')<>'string' or length(v->>'photo')>2048) then raise exception 'Foto de opcion invalida' using errcode='23514'; end if;
   ids:=array_append(ids,v->>'id'); total:=total+(v->>'quantity')::bigint;
 end loop;
 if total>2147483647 then raise exception 'Stock total excesivo' using errcode='23514'; end if;
 if new.stock_mode='UNIQUE' and cardinality(ids)>0 then raise exception 'Una pieza unica no tiene opciones' using errcode='23514'; end if;
 if cardinality(ids)>0 and new.stock_mode<>'ON_REQUEST' then new.quantity:=total::integer; end if;
 new.updated_at:=now(); return new;
end;
$$;
create trigger products_validate before insert or update on public.products for each row execute function app_private.validate_product();

-- Limita la edicion de una tienda incluso si el cliente altera la peticion.
create function app_private.guard_shop() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null and not app_private.is_admin() and
    (new.id<>old.id or new.owner_uid<>old.owner_uid or new.active<>old.active or new.created_at<>old.created_at)
 then raise exception 'Campos administrativos protegidos' using errcode='42501'; end if;
 new.updated_at:=now(); return new;
end;
$$;
create trigger shops_guard before update on public.shops for each row execute function app_private.guard_shop();

create function app_private.audit_admin() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if app_private.is_admin() then
   insert into public.admin_actions(actor_uid,action,target_table,target_id)
   values(auth.uid(),tg_op,tg_table_name,coalesce(to_jsonb(new)->>'id',to_jsonb(old)->>'id',to_jsonb(new)->>'shop_id',to_jsonb(old)->>'shop_id'));
 end if;
 return coalesce(new,old);
end;
$$;
create trigger profiles_audit after insert or update or delete on public.profiles for each row execute function app_private.audit_admin();
create trigger shops_audit after insert or update or delete on public.shops for each row execute function app_private.audit_admin();
create trigger associations_audit after insert or update or delete on public.associations for each row execute function app_private.audit_admin();
create trigger shop_associations_audit after insert or update or delete on public.shop_associations for each row execute function app_private.audit_admin();

-- Proyecciones publicas deliberadas: nunca exponen stock, ventas ni precios ocultos.
-- Son vistas del propietario con lista explicita de columnas y filtro de visibilidad.
create view public.public_shops with(security_barrier=true) as
 select s.id,s.name,s.description,s.logo_url,s.entrepreneur_type,s.sector,s.contact,s.show_prices
 from public.shops s join public.profiles p on p.id=s.owner_uid where s.active and p.active;
create view public.public_products with(security_barrier=true) as
 select p.id,p.shop_id,p.name,p.description,p.category,p.product_type,p.attributes,
 case when p.show_price and s.show_prices then p.price_clp else null end as price_clp,
 (p.stock_mode='ON_REQUEST') as on_request,p.photo,p.updated_at,
 coalesce((select jsonb_agg(jsonb_build_object('id',v->>'id','label',v->>'label',
   'priceClp',case when p.show_price and s.show_prices then coalesce(v->'priceClp',to_jsonb(p.price_clp)) else 'null'::jsonb end,
   'photo',v->'photo')) from jsonb_array_elements(p.variants) v),'[]'::jsonb) as variants
 from public.products p join public.shops s on s.id=p.shop_id join public.profiles u on u.id=s.owner_uid
 where p.visible and s.active and u.active and (p.stock_mode='ON_REQUEST' or p.quantity>0);

alter table public.profiles enable row level security;
alter table public.shops enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.associations enable row level security;
alter table public.shop_associations enable row level security;
alter table public.categories enable row level security;
alter table public.product_types enable row level security;
alter table public.entrepreneur_types enable row level security;
alter table public.admin_actions enable row level security;
revoke all on public.profiles,public.shops,public.products,public.sales,public.associations,public.shop_associations,
 public.categories,public.product_types,public.entrepreneur_types,public.admin_actions,public.public_shops,public.public_products from anon,authenticated;
grant select on public.public_shops,public.public_products,public.associations,public.shop_associations,public.categories,public.product_types,public.entrepreneur_types to anon,authenticated;
grant select,insert,update,delete on public.profiles,public.shops,public.products,public.associations,public.shop_associations,public.categories,public.product_types,public.entrepreneur_types to authenticated;
grant select on public.sales,public.admin_actions to authenticated;
create policy profiles_read on public.profiles for select to authenticated using(id=auth.uid() or app_private.is_admin());
create policy profiles_admin on public.profiles for all to authenticated using(app_private.is_admin()) with check(app_private.is_admin());
create policy shops_read on public.shops for select to authenticated using(app_private.is_admin() or app_private.is_owner(id));
create policy shops_update on public.shops for update to authenticated using(app_private.is_admin() or app_private.is_owner(id)) with check(app_private.is_admin() or app_private.is_owner(id));
create policy shops_create on public.shops for insert to authenticated with check(app_private.is_admin());
create policy shops_delete on public.shops for delete to authenticated using(app_private.is_admin());
create policy products_owner on public.products for all to authenticated using(app_private.is_owner(shop_id)) with check(app_private.is_owner(shop_id));
create policy sales_owner_read on public.sales for select to authenticated using(app_private.is_owner(shop_id));
create policy audit_admin_read on public.admin_actions for select to authenticated using(app_private.is_admin());
create policy associations_public on public.associations for select to anon,authenticated using(true);
create policy associations_admin on public.associations for all to authenticated using(app_private.is_admin()) with check(app_private.is_admin());
create policy shop_associations_public on public.shop_associations for select to anon,authenticated using(true);
create policy shop_associations_admin on public.shop_associations for all to authenticated using(app_private.is_admin()) with check(app_private.is_admin());
create policy categories_public on public.categories for select to anon,authenticated using(true);
create policy categories_admin on public.categories for all to authenticated using(app_private.is_admin()) with check(app_private.is_admin());
create policy product_types_public on public.product_types for select to anon,authenticated using(true);
create policy product_types_admin on public.product_types for all to authenticated using(app_private.is_admin()) with check(app_private.is_admin());
create policy entrepreneur_types_public on public.entrepreneur_types for select to anon,authenticated using(true);
create policy entrepreneur_types_admin on public.entrepreneur_types for all to authenticated using(app_private.is_admin()) with check(app_private.is_admin());

create function public.provision_entrepreneur(p_uid uuid,p_name text,p_shop_name text) returns text
 language plpgsql security definer set search_path='' as $$
declare sid text:='shop_'||p_uid::text;
begin
 if not app_private.is_admin() then raise exception 'Solo el administrador puede crear tiendas' using errcode='42501'; end if;
 if exists(select 1 from public.profiles where id=p_uid and role<>'comprador') then raise exception 'La cuenta ya tiene un perfil asignado'; end if;
 insert into public.shops(id,owner_uid,name) values(sid,p_uid,p_shop_name);
 update public.profiles set role='emprendedora',shop_id=sid,display_name=p_name where id=p_uid;
 if not found then raise exception 'No existe la cuenta de acceso'; end if;
 return sid;
end;
$$;
create function public.set_entrepreneur_active(p_uid uuid,p_shop_id text,p_active boolean) returns void
 language plpgsql security definer set search_path='' as $$
begin
 if not app_private.is_admin() then raise exception 'Solo administrador' using errcode='42501'; end if;
 if not exists(select 1 from public.profiles where id=p_uid and shop_id=p_shop_id and role='emprendedora') then raise exception 'Perfil y tienda no coinciden'; end if;
 update public.profiles set active=p_active where id=p_uid;
 update public.shops set active=p_active where id=p_shop_id;
end;
$$;
create function public.register_sale(p_shop_id text,p_product_id text,p_variant_id text,p_quantity integer,p_place text,p_request_id uuid) returns uuid
 language plpgsql security definer set search_path='' as $$
declare p public.products; v jsonb; updated jsonb:='[]'; found_variant boolean:=false; sell_price bigint;
 fingerprint text:=md5(jsonb_build_array(p_shop_id,p_product_id,p_variant_id,p_quantity,p_place)::text);
 previous app_private.sale_requests;
begin
 if not app_private.is_owner(p_shop_id) then raise exception 'No tienes permiso para vender en esta tienda' using errcode='42501'; end if;
 if p_quantity is null or p_quantity<=0 or p_place is null or length(p_place)>240 or p_request_id is null then raise exception 'Cantidad o lugar invalido' using errcode='23514'; end if;
 insert into app_private.sale_requests(id,owner_uid,payload_hash) values(p_request_id,auth.uid(),fingerprint) on conflict do nothing;
 if not found then
   select * into previous from app_private.sale_requests where id=p_request_id;
   if previous.owner_uid<>auth.uid() or previous.payload_hash<>fingerprint then raise exception 'Solicitud reutilizada con otros datos'; end if;
   return p_request_id;
 end if;
 select * into p from public.products where id=p_product_id and shop_id=p_shop_id for update;
 if not found then raise exception 'El producto no existe'; end if;
 sell_price:=p.price_clp;
 if jsonb_array_length(p.variants)>0 then
   for v in select * from jsonb_array_elements(p.variants) loop
     if v->>'id'=p_variant_id then
       found_variant:=true;
       sell_price:=coalesce(nullif(v->>'priceClp','null')::bigint,p.price_clp);
       if p.stock_mode<>'ON_REQUEST' then
         if (v->>'quantity')::integer<p_quantity then raise exception 'No hay stock suficiente de esa opcion' using errcode='23514'; end if;
         v:=jsonb_set(v,'{quantity}',to_jsonb((v->>'quantity')::integer-p_quantity));
       end if;
     end if;
     updated:=updated||jsonb_build_array(v);
   end loop;
   if not found_variant then raise exception 'Elige una opcion valida' using errcode='23514'; end if;
   update public.products set variants=updated where id=p.id;
 else
   if p_variant_id is not null then raise exception 'Este producto no tiene opciones' using errcode='23514'; end if;
   if p.stock_mode<>'ON_REQUEST' then
     if p.quantity<p_quantity then raise exception 'No hay stock suficiente' using errcode='23514'; end if;
     update public.products set quantity=quantity-p_quantity where id=p.id;
   end if;
 end if;
 if (select history_enabled from public.shops where id=p_shop_id) then
   insert into public.sales(id,shop_id,product_id,product_name,variant_id,quantity,price_clp,place)
   values(p_request_id,p_shop_id,p.id,p.name,p_variant_id,p_quantity,sell_price,p_place);
 end if;
 return p_request_id;
end;
$$;
revoke all on function public.provision_entrepreneur(uuid,text,text),public.set_entrepreneur_active(uuid,text,boolean),public.register_sale(text,text,text,integer,text,uuid) from public,anon;
grant execute on function public.provision_entrepreneur(uuid,text,text),public.set_entrepreneur_active(uuid,text,boolean),public.register_sale(text,text,text,integer,text,uuid) to authenticated;
revoke all on all functions in schema app_private from public,anon;
grant execute on function app_private.is_admin(),app_private.is_owner(text) to authenticated;

-- Bucket publico solo para fotos publicables. Las escrituras estan acotadas a cada tienda.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('shop-images','shop-images',true,2097152,array['image/jpeg','image/png','image/webp']);
create policy shop_images_read on storage.objects for select to anon,authenticated using(bucket_id='shop-images');
create policy shop_images_create on storage.objects for insert to authenticated with check(bucket_id='shop-images' and (app_private.is_owner((storage.foldername(name))[1]) or app_private.is_admin()));
create policy shop_images_update on storage.objects for update to authenticated using(bucket_id='shop-images' and (app_private.is_owner((storage.foldername(name))[1]) or app_private.is_admin())) with check(bucket_id='shop-images' and (app_private.is_owner((storage.foldername(name))[1]) or app_private.is_admin()));
create policy shop_images_delete on storage.objects for delete to authenticated using(bucket_id='shop-images' and (app_private.is_owner((storage.foldername(name))[1]) or app_private.is_admin()));

-- Sincroniza las lecturas API con el nuevo esquema.
notify pgrst,'reload schema';
commit;
