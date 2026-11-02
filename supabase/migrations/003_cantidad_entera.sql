-- Evita el redondeo implícito al recibir cantidades decimales por RPC.
begin;
drop function public.register_sale(text,text,text,integer,text,uuid);
create or replace function public.register_sale(p_shop_id text,p_product_id text,p_variant_id text,p_quantity numeric,p_place text,p_request_id uuid) returns uuid
 language plpgsql security definer set search_path='' as $$
declare p public.products; v jsonb; updated jsonb:='[]'; found_variant boolean:=false; sell_price bigint;
 fingerprint text:=md5(jsonb_build_array(p_shop_id,p_product_id,p_variant_id,p_quantity::integer,p_place)::text);
 previous app_private.sale_requests;
begin
 if not app_private.is_owner(p_shop_id) then raise exception 'No tienes permiso para vender en esta tienda' using errcode='42501'; end if;
 if p_quantity is null or p_quantity<=0 or p_quantity<>trunc(p_quantity) or p_quantity>2147483647 or p_place is null or length(p_place)>240 or p_request_id is null then raise exception 'Cantidad o lugar invalido' using errcode='23514'; end if;
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

revoke all on function public.register_sale(text,text,text,numeric,text,uuid) from public,anon;
grant execute on function public.register_sale(text,text,text,numeric,text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
