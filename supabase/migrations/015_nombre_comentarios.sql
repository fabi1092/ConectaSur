-- Entrega 7: nombre publico del comprador en calificaciones sin exponer correo ni UID (RNF-PRI-01).
-- Conserva intactos rate_target y rating_comments (migracion 013) para mantener compatibilidad con pruebas y verificaciones.
begin;

alter table public.ratings
 add column author_name text not null default '' check (length(author_name) <= 60);

-- Sanea un nombre para mostrarlo publicamente; rechaza correos, URLs o textos demasiado cortos.
create function app_private.clean_public_author_name(p_name text) returns text
 language plpgsql immutable set search_path='' as $$
declare
 cleaned text := pg_catalog.left(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_name, '')), '\s+', ' ', 'g'), 60);
begin
 if cleaned = '' or pg_catalog.length(cleaned) < 2 then
  return '';
 end if;
 if cleaned ~* '(@|:|/|^http)' then
  return '';
 end if;
 return cleaned;
end;
$$;

create function public.rate_target_named(
 p_shop_id text,
 p_product_id text,
 p_stars integer,
 p_comment text default '',
 p_author_name text default '',
 p_token text default null
) returns void language plpgsql security definer set search_path='' as $$
declare
 s text := app_private.current_subject(p_token);
 sh public.public_shops;
 owner text;
 clean_author text := app_private.clean_public_author_name(p_author_name);
 fallback_name text;
begin
 select * into sh from public.public_shops where id = p_shop_id;
 if not found then raise exception 'La tienda no existe' using errcode = '23503'; end if;
 if not sh.allow_ratings then raise exception 'Esta tienda no recibe calificaciones' using errcode = '42501'; end if;
 select owner_uid::text into owner from public.shops where id = p_shop_id;
 if owner = s then raise exception 'No puedes calificar tu propia tienda' using errcode = '42501'; end if;
 if p_stars is null or p_stars not between 1 and 5 or length(coalesce(p_comment, '')) > 500 then
  raise exception 'Calificacion invalida' using errcode = '23514';
 end if;
 if p_product_id is not null and not exists(select 1 from public.public_products where id = p_product_id and shop_id = p_shop_id) then
  raise exception 'El producto no existe' using errcode = '23503';
 end if;

 if lower(clean_author) in ('comprador', 'visitante', 'usuario', 'admin', 'administrador', 'comprador verificado') then
  clean_author := '';
 end if;
 if clean_author = '' and s !~ '^firebase:' then
  select app_private.clean_public_author_name(p.display_name) into fallback_name
  from public.profiles p where p.id::text = s;
  clean_author := coalesce(fallback_name, '');
  if lower(clean_author) in ('comprador', 'visitante', 'usuario', 'admin', 'administrador', 'comprador verificado') then
   clean_author := '';
  end if;
 end if;

 insert into public.ratings(subject, shop_id, product_id, stars, comment, author_name)
 values(s, p_shop_id, p_product_id, p_stars, trim(coalesce(p_comment, '')), clean_author)
 on conflict(subject, shop_id, coalesce(product_id, '')) do update set
  stars = excluded.stars,
  comment = excluded.comment,
  author_name = case when excluded.author_name <> '' then excluded.author_name else public.ratings.author_name end,
  updated_at = now();
end;
$$;

create function public.rating_comments_named(
 p_shop_id text,
 p_product_id text default null,
 p_limit integer default 20
) returns table(stars smallint, comment text, author_name text, created_at timestamptz)
 language sql stable security definer set search_path='' as $$
 select r.stars, r.comment,
  coalesce(nullif(app_private.clean_public_author_name(r.author_name), ''), 'Comprador verificado') as author_name,
  r.created_at
 from public.ratings r
 join public.public_shops s on s.id = r.shop_id
 where r.shop_id = p_shop_id
  and r.product_id is not distinct from p_product_id
  and r.comment <> ''
 order by r.created_at desc
 limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

revoke all on function app_private.clean_public_author_name(text) from public, anon, authenticated;
revoke all on function public.rate_target_named(text, text, integer, text, text, text),
 public.rating_comments_named(text, text, integer) from public;
grant execute on function public.rate_target_named(text, text, integer, text, text, text),
 public.rating_comments_named(text, text, integer) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
