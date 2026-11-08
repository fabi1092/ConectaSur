-- Entrega 6: punto de venta o retiro opcional de la emprendedora (RF-MAP-04, Importante; RNF-PRI-03).
-- Es público solo si ella lo marca: por defecto no hay coordenadas.
begin;
alter table public.shops
 add column pickup_label text not null default '' check (length(pickup_label)<=240),
 add column pickup_lat double precision check (pickup_lat between -90 and 90),
 add column pickup_lng double precision check (pickup_lng between -180 and 180),
 add constraint shops_pickup_pair check ((pickup_lat is null)=(pickup_lng is null));

-- Las columnas nuevas van al final para conservar el contrato de la vista existente (migración 008).
create or replace view public.public_shops with(security_barrier=true) as
 select s.id,s.name,s.description,s.logo_url,s.entrepreneur_type,s.sector,s.contact,s.show_prices,
 s.contact_mode,s.whatsapp_number,s.pickup_label,s.pickup_lat,s.pickup_lng
 from public.shops s join public.profiles p on p.id=s.owner_uid where s.active and p.active;
notify pgrst,'reload schema';
commit;
