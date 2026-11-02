-- Entrega 5. Complementa 001 sin recrear tablas ni perder datos existentes.
begin;
alter table public.products add column sold_out text not null default 'HIDE' check(sold_out in ('HIDE','SHOW','ORDER'));
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.products'::regclass and contype='c' and pg_get_constraintdef(oid) like '%stock_mode%' loop
  execute format('alter table public.products drop constraint %I',c.conname);
 end loop;
end $$;
alter table public.products add constraint product_stock_mode check(stock_mode in ('UNITS','UNIQUE','ON_REQUEST','UNLIMITED'));
alter table public.products add constraint product_stock_required check(stock_mode in ('ON_REQUEST','UNLIMITED') or quantity is not null);
alter table public.products add constraint product_unique_stock check(stock_mode<>'UNIQUE' or quantity between 0 and 1);
alter table public.shops add column default_products jsonb not null default '{"stockMode":"UNITS","soldOut":"HIDE","visible":true,"showPrice":true}'::jsonb
 check(jsonb_typeof(default_products)='object' and (default_products-array['stockMode','soldOut','visible','showPrice'])='{}'::jsonb
 and default_products ?& array['stockMode','soldOut','visible','showPrice']
 and default_products->>'stockMode' in ('UNITS','UNIQUE','ON_REQUEST','UNLIMITED')
 and default_products->>'soldOut' in ('HIDE','SHOW','ORDER')
 and jsonb_typeof(default_products->'visible')='boolean' and jsonb_typeof(default_products->'showPrice')='boolean');
create or replace function app_private.validate_product() returns trigger language plpgsql set search_path='' as $$
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
 if cardinality(ids)>0 and new.stock_mode not in ('ON_REQUEST','UNLIMITED') then new.quantity:=total::integer; end if;
 new.updated_at:=now(); return new;
end;
$$;
create or replace function public.register_sale(p_shop_id text,p_product_id text,p_variant_id text,p_quantity integer,p_place text,p_request_id uuid) returns uuid
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
       if p.stock_mode not in ('ON_REQUEST','UNLIMITED') then
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
   if p.stock_mode not in ('ON_REQUEST','UNLIMITED') then
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

create or replace view public.public_products with(security_barrier=true) as
 select p.id,p.shop_id,p.name,p.description,p.category,p.product_type,p.attributes,
 case when p.show_price and s.show_prices then p.price_clp else null end as price_clp,
 (p.stock_mode='ON_REQUEST' or (p.stock_mode='UNITS' and p.quantity=0 and p.sold_out='ORDER')) as on_request,p.photo,p.updated_at,
 coalesce((select jsonb_agg(jsonb_build_object('id',v->>'id','label',v->>'label',
 'priceClp',case when p.show_price and s.show_prices then coalesce(v->'priceClp',to_jsonb(p.price_clp)) else 'null'::jsonb end,
 'photo',v->'photo','available',p.stock_mode in ('ON_REQUEST','UNLIMITED') or (v->>'quantity')::integer>0))
 from jsonb_array_elements(p.variants) v),'[]'::jsonb) as variants,
 (p.stock_mode='UNITS' and p.quantity=0 and p.sold_out='SHOW') as sold_out
 from public.products p join public.shops s on s.id=p.shop_id join public.profiles u on u.id=s.owner_uid
 where p.visible and s.active and u.active and
 (p.stock_mode in ('ON_REQUEST','UNLIMITED') or p.quantity>0 or (p.stock_mode='UNITS' and p.sold_out in ('SHOW','ORDER')));

-- Selección/categoría/catálogo completo, todo o nada. RLS y control de dueña activos.
create function public.set_product_availability(p_shop_id text,p_ids text[],p_category text,p_settings jsonb) returns integer
 language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 if not app_private.is_owner(p_shop_id) then raise exception 'Solo la dueña puede cambiar su catálogo' using errcode='42501'; end if;
 if jsonb_typeof(p_settings)<>'object' or p_settings='{}'::jsonb
 or (p_settings-array['visible','show_price','sold_out'])<>'{}'::jsonb
 or (p_settings ? 'visible' and jsonb_typeof(p_settings->'visible')<>'boolean')
 or (p_settings ? 'show_price' and jsonb_typeof(p_settings->'show_price')<>'boolean')
 or (p_settings ? 'sold_out' and p_settings->>'sold_out' not in ('HIDE','SHOW','ORDER'))
 then raise exception 'Configuración no válida' using errcode='23514'; end if;
 update public.products set visible=coalesce((p_settings->>'visible')::boolean,visible),
 show_price=coalesce((p_settings->>'show_price')::boolean,show_price),sold_out=coalesce(p_settings->>'sold_out',sold_out)
 where shop_id=p_shop_id and (p_ids is null or id=any(p_ids)) and (p_category is null or category=p_category);
 get diagnostics n=row_count; return n;
end $$;
revoke all on function public.set_product_availability(text,text[],text,jsonb) from public,anon;
grant execute on function public.set_product_availability(text,text[],text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
