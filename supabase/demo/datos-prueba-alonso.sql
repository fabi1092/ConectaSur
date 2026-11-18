-- ============================================================================
-- ConectaSur · Entrega 6 · Datos Reales de Prueba (Alonso Núñez - Web)
-- ============================================================================
-- Carga de datos reales para la vitrina web y la aplicación Android:
-- 1. 2+ Tiendas locales en Alerce y Puerto Montt con punto de retiro/venta en mapa.
-- 2. Productos con stock > 1 y variantes de distinta foto y precio.
-- 3. Productos en modalidad Pieza Única (stock = 1) sin variantes.
-- 4. 1+ Asociación comunitaria con integrantes vinculados.
-- 5. 2+ Ferias futuras publicadas en Puerto Montt y Alerce con coordenadas reales.
--
-- Idempotente: se puede ejecutar en Supabase Studio > SQL Editor repetidamente.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Categorías y Tipos de Emprendimiento / Producto
-- ----------------------------------------------------------------------------
insert into public.categories (id, name) values
  ('Artesanías', 'Artesanías'),
  ('Alimentos', 'Alimentos'),
  ('Ropa', 'Ropa y Tejidos'),
  ('Plantas', 'Plantas y Flores')
on conflict (id) do nothing;

insert into public.entrepreneur_types (id, name) values
  ('Artesanías', 'Artesanías'),
  ('Alimentos', 'Alimentos'),
  ('Textil y Lana', 'Textil y Lana'),
  ('Servicios', 'Servicios')
on conflict (id) do nothing;

insert into public.product_types (id, name, fields) values
  ('artesania', 'Artesanía', '{"material":"texto","tecnica":"texto","medidas":"texto"}'),
  ('alimento', 'Alimento', '{"ingredientes":"texto","contenido":"texto","conservacion":"texto"}'),
  ('ropa', 'Ropa y tejidos', '{"material":"texto","cuidados":"texto"}')
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 2. Cuentas de emprendedoras base (asociadas a ana y bea si existen, o perfiles demo)
-- ----------------------------------------------------------------------------
do $$
declare
  v_ana_uid uuid;
  v_bea_uid uuid;
begin
  select id into v_ana_uid from public.profiles where role = 'emprendedora' limit 1;
  if v_ana_uid is null then
    select id into v_ana_uid from auth.users limit 1;
  end if;

  select id into v_bea_uid from public.profiles where role = 'emprendedora' and id <> coalesce(v_ana_uid, '00000000-0000-0000-0000-000000000000'::uuid) limit 1;
  if v_bea_uid is null then
    v_bea_uid := v_ana_uid;
  end if;

  -- --------------------------------------------------------------------------
  -- Tienda 1: Artesanías Melí Alerce (Alerce Histórico)
  -- Con punto de retiro en mapa (-41.388531, -72.906845)
  -- --------------------------------------------------------------------------
  insert into public.shops (
    id, owner_uid, name, description, logo_url,
    entrepreneur_type, sector, contact, show_prices,
    contact_mode, whatsapp_number, pickup_label,
    pickup_lat, pickup_lng, history_enabled, active, default_products
  ) values (
    'shop_artesanias_alerce',
    v_ana_uid,
    'Artesanías Melí Alerce',
    'Taller familiar de artesanía en lana virgen, telar tradicional y madera nativa recuperada de rodados. Creaciones sustentables desde el corazón de Alerce Histórico.',
    'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=400&q=80',
    'Artesanías',
    'Alerce Histórico',
    '+56 9 8456 1234 · contacto@artesaniasmelialerce.cl',
    true,
    'whatsapp',
    '+56984561234',
    'Taller Melí Alerce (Calle Los Canelos 245, Alerce Histórico)',
    -41.388531,
    -72.906845,
    true,
    true,
    '{"stockMode":"UNITS","soldOut":"SHOW","visible":true,"showPrice":true}'::jsonb
  )
  on conflict (id) do update set
    name = excluded.name,
    description = excluded.description,
    logo_url = excluded.logo_url,
    entrepreneur_type = excluded.entrepreneur_type,
    sector = excluded.sector,
    contact = excluded.contact,
    show_prices = excluded.show_prices,
    contact_mode = excluded.contact_mode,
    whatsapp_number = excluded.whatsapp_number,
    pickup_label = excluded.pickup_label,
    pickup_lat = excluded.pickup_lat,
    pickup_lng = excluded.pickup_lng,
    active = true;

  -- --------------------------------------------------------------------------
  -- Tienda 2: Sabores y Conservas del Reloncaví (Puerto Montt)
  -- Con punto de retiro en Angelmó (-41.478832, -72.956754)
  -- --------------------------------------------------------------------------
  insert into public.shops (
    id, owner_uid, name, description, logo_url,
    entrepreneur_type, sector, contact, show_prices,
    contact_mode, whatsapp_number, pickup_label,
    pickup_lat, pickup_lng, history_enabled, active, default_products
  ) values (
    'shop_sabores_sur',
    v_bea_uid,
    'Sabores y Conservas del Reloncaví',
    'Mermeladas campesinas reducidas en azúcar, conservas tradicionales y repostería elaborada con frutos silvestres recolectados en bosques y campos de Puerto Montt y Chamiza.',
    'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=400&q=80',
    'Alimentos',
    'Puerto Montt Centro',
    '+56 9 7654 3210 · sabores@delreloncavi.cl',
    true,
    'form',
    '',
    'Puesto 14, Mercado Angelmó, Puerto Montt',
    -41.478832,
    -72.956754,
    true,
    true,
    '{"stockMode":"UNITS","soldOut":"SHOW","visible":true,"showPrice":true}'::jsonb
  )
  on conflict (id) do update set
    name = excluded.name,
    description = excluded.description,
    logo_url = excluded.logo_url,
    entrepreneur_type = excluded.entrepreneur_type,
    sector = excluded.sector,
    contact = excluded.contact,
    show_prices = excluded.show_prices,
    contact_mode = excluded.contact_mode,
    pickup_label = excluded.pickup_label,
    pickup_lat = excluded.pickup_lat,
    pickup_lng = excluded.pickup_lng,
    active = true;

end $$;

-- ----------------------------------------------------------------------------
-- 3. Asociación de Emprendedoras e Integrantes Vinculadas
-- ----------------------------------------------------------------------------
insert into public.associations (
  id, name, description, sector, contact, logo_url, active
) values (
  'asoc_artesanas_alerce',
  'Asociación Gremial de Emprendedoras y Artesanas de Alerce',
  'Organización que reúne a más de 20 artesanas, hilanderas y productoras de Alerce Histórico y Alerce Norte para fortalecer el comercio local, ferias de barrio y oficios tradicionales del sur.',
  'Alerce y Puerto Montt',
  'agrupacion.alerce@conectasur.cl · Sede Comunitaria Alerce Histórico',
  'https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?auto=format&fit=crop&w=400&q=80',
  true
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  sector = excluded.sector,
  contact = excluded.contact,
  logo_url = excluded.logo_url,
  active = true;

-- Vinculación de las 2 tiendas como integrantes activas
insert into public.shop_associations (shop_id, association_id) values
  ('shop_artesanias_alerce', 'asoc_artesanas_alerce'),
  ('shop_sabores_sur', 'asoc_artesanas_alerce')
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- 4. Productos Reales con Variantes (distinta foto y precio, stock > 1) y Pieza Única
-- ----------------------------------------------------------------------------

-- 4.1 Tienda 1: Producto con variantes (Stock > 1, distinto precio y distinta foto)
insert into public.products (
  id, shop_id, name, description, category, product_type, attributes,
  price_clp, show_price, stock_mode, sold_out, quantity, visible, photo, variants, updated_at
) values (
  'prod_manta_chilota',
  'shop_artesanias_alerce',
  'Manta artesanal en telar chilote',
  'Manta tejida a mano con lana virgen de oveja chilota hilada en huso. Cálida, resistente y con terminaciones en flecos tradicionales.',
  'Artesanías',
  'artesania',
  '{"material": "Lana virgen de oveja chilota", "tecnica": "Telar tradicional", "medidas": "180 x 140 cm"}'::jsonb,
  38000,
  true,
  'UNITS',
  'SHOW',
  5,
  true,
  'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=800&q=80',
  '[
    {
      "id": "var_manta_crudo",
      "label": "Color Crudo Natural (180x140 cm)",
      "quantity": 3,
      "priceClp": 38000,
      "photo": "https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=800&q=80"
    },
    {
      "id": "var_manta_canelo",
      "label": "Teñido Canelo y Barro (200x150 cm)",
      "quantity": 2,
      "priceClp": 45000,
      "photo": "https://images.unsplash.com/photo-1579656381226-5fc0f0100c3b?auto=format&fit=crop&w=800&q=80"
    }
  ]'::jsonb,
  now()
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  price_clp = excluded.price_clp,
  variants = excluded.variants,
  quantity = excluded.quantity,
  photo = excluded.photo,
  visible = true,
  updated_at = now();

-- 4.2 Tienda 1: Pieza única (Stock = 1, modalidad UNIQUE, sin variantes)
insert into public.products (
  id, shop_id, name, description, category, product_type, attributes,
  price_clp, show_price, stock_mode, sold_out, quantity, visible, photo, variants, updated_at
) values (
  'prod_reloj_alerce',
  'shop_artesanias_alerce',
  'Reloj mural en madera de alerce muerto y resina',
  'Pieza única e irrepetible confeccionada con raíz de alerce recuperada de rodados y detalles en resina verde bosque. Maquinaria de cuarzo silenciosa y acabado en aceite vegetal.',
  'Artesanías',
  'artesania',
  '{"material": "Madera de alerce recuperada y resina", "tecnica": "Tallado a mano y pulido fino", "medidas": "42 cm diámetro"}'::jsonb,
  52000,
  true,
  'UNIQUE',
  'HIDE',
  1,
  true,
  'https://images.unsplash.com/photo-1563861826100-9cb868fdbe1c?auto=format&fit=crop&w=800&q=80',
  '[]'::jsonb,
  now()
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  price_clp = excluded.price_clp,
  stock_mode = 'UNIQUE',
  quantity = 1,
  photo = excluded.photo,
  visible = true,
  updated_at = now();

-- 4.3 Tienda 2: Producto con variantes (Stock > 1, distinto precio y distinta foto)
insert into public.products (
  id, shop_id, name, description, category, product_type, attributes,
  price_clp, show_price, stock_mode, sold_out, quantity, visible, photo, variants, updated_at
) values (
  'prod_pack_mermeladas',
  'shop_sabores_sur',
  'Pack de Mermeladas Silvestres del Reloncaví',
  'Frascos de mermelada casera reducida en azúcar, con fruta 100% silvestre cosechada a mano en la cordillera de la costa y bosques de la zona.',
  'Alimentos',
  'alimento',
  '{"ingredientes": "Murta silvestre, maqui, grosella, azúcar rubia y limón", "contenido": "Frasco de vidrio hexagonal con tapa sellada", "conservacion": "Lugar fresco y seco. Refrigerar una vez abierto."}'::jsonb,
  4500,
  true,
  'UNITS',
  'SHOW',
  8,
  true,
  'https://images.unsplash.com/photo-1589733955941-5eeaf752f6dd?auto=format&fit=crop&w=800&q=80',
  '[
    {
      "id": "var_murta_250g",
      "label": "Murta del Bosque (250g)",
      "quantity": 5,
      "priceClp": 4500,
      "photo": "https://images.unsplash.com/photo-1589733955941-5eeaf752f6dd?auto=format&fit=crop&w=800&q=80"
    },
    {
      "id": "var_maqui_500g",
      "label": "Maqui y Grosella Familiar (500g)",
      "quantity": 3,
      "priceClp": 7500,
      "photo": "https://images.unsplash.com/photo-1563729784474-d77dbb933a9e?auto=format&fit=crop&w=800&q=80"
    }
  ]'::jsonb,
  now()
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  price_clp = excluded.price_clp,
  variants = excluded.variants,
  quantity = excluded.quantity,
  photo = excluded.photo,
  visible = true,
  updated_at = now();

-- 4.4 Tienda 2: Pieza única (Stock = 1, modalidad UNIQUE, sin variantes)
insert into public.products (
  id, shop_id, name, description, category, product_type, attributes,
  price_clp, show_price, stock_mode, sold_out, quantity, visible, photo, variants, updated_at
) values (
  'prod_canasta_patagonia',
  'shop_sabores_sur',
  'Canasta Rústica Gourmet Edición Especial',
  'Canastillo exclusivo de mimbre trenzado con 4 variedades de dulces sureños, licor de oro tradicional de Chiloé y cuchara tallada en madera nativa. Pieza única para regalo o degustación.',
  'Alimentos',
  'alimento',
  '{"ingredientes": "Mermeladas surtidas, licor tradicional y artesanía", "contenido": "Canasta rústica sellada", "conservacion": "Temperatura ambiente"}'::jsonb,
  29000,
  true,
  'UNIQUE',
  'HIDE',
  1,
  true,
  'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=800&q=80',
  '[]'::jsonb,
  now()
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  price_clp = excluded.price_clp,
  stock_mode = 'UNIQUE',
  quantity = 1,
  photo = excluded.photo,
  visible = true,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- 5. Ferias Futuras en Puerto Montt y Alerce con Coordenadas Reales
-- ----------------------------------------------------------------------------

-- Feria 1: Parque Urbano Alerce
insert into public.fairs (
  id, name, description, place_name, latitude, longitude,
  starts_at, ends_at, organizer, status, image_url
) values (
  'a1111111-1111-4111-8111-111111111111',
  'Feria Navideña y Costumbrista Parque Urbano Alerce',
  'Gran encuentro de emprendimientos familiares, artesanía en lana, repostería casera, plantas ornamentales y música folclórica en vivo. Ven a apoyar el comercio local de Alerce.',
  'Parque Urbano Alerce, Av. Transversal 1 s/n, Alerce Norte',
  -41.397022,
  -72.908011,
  '2026-12-05 10:00:00-03',
  '2026-12-07 20:00:00-03',
  'Municipalidad de Puerto Montt y Agrupación de Emprendedoras de Alerce',
  'published',
  'https://images.unsplash.com/photo-1513151233558-d860c5398176?auto=format&fit=crop&w=1200&q=80'
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  place_name = excluded.place_name,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  organizer = excluded.organizer,
  status = 'published',
  image_url = excluded.image_url;

-- Feria 2: Plaza de Armas de Puerto Montt
insert into public.fairs (
  id, name, description, place_name, latitude, longitude,
  starts_at, ends_at, organizer, status, image_url
) values (
  'b2222222-2222-4222-8222-222222222222',
  'Feria de Artesanía y Tradiciones Plaza de Armas',
  'Feria comunitaria en el centro de Puerto Montt con más de 30 expositores de textilería chilota, alerce tallado, cestería, repostería típica y orfebrería.',
  'Plaza de Armas de Puerto Montt (Calle San Martín con Urmeneta)',
  -41.471714,
  -72.942912,
  '2026-12-12 09:30:00-03',
  '2026-12-14 21:00:00-03',
  'Corporación Cultural de Puerto Montt y Red ConectaSur',
  'published',
  'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?auto=format&fit=crop&w=1200&q=80'
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  place_name = excluded.place_name,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  organizer = excluded.organizer,
  status = 'published',
  image_url = excluded.image_url;

-- Feria 3: Alerce Histórico (Plaza Los Navegantes)
insert into public.fairs (
  id, name, description, place_name, latitude, longitude,
  starts_at, ends_at, organizer, status, image_url
) values (
  'c3333333-3333-4333-8333-333333333333',
  'Muestra Tradicional Alerce Histórico',
  'Encuentro al aire libre en el barrio patrimonial de Alerce Histórico. Muestra de oficios tradicionales en madera, telar y comida casera sureña.',
  'Plaza Los Navegantes, Alerce Histórico, Puerto Montt',
  -41.388531,
  -72.906845,
  '2026-12-19 10:00:00-03',
  '2026-12-20 19:00:00-03',
  'Junta de Vecinos Alerce Histórico y Artesanas Melí',
  'published',
  'https://images.unsplash.com/photo-1533900298318-6b8da08a523e?auto=format&fit=crop&w=1200&q=80'
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  place_name = excluded.place_name,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  organizer = excluded.organizer,
  status = 'published',
  image_url = excluded.image_url;

commit;

-- Verificación rápida de la carga
select 'shops_con_pickup' as metrica, count(*) as cantidad from public.shops where pickup_lat is not null
union all
select 'productos_con_variantes', count(*) from public.products where jsonb_array_length(variants) > 0
union all
select 'productos_pieza_unica', count(*) from public.products where stock_mode = 'UNIQUE'
union all
select 'asociaciones_activas', count(*) from public.associations where active = true
union all
select 'ferias_futuras_publicadas', count(*) from public.fairs where status = 'published' and ends_at >= now();
