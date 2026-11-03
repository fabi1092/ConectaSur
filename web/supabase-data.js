
import { createClient } from '@supabase/supabase-js';
import { OWNER_PRODUCT_COLUMNS, privateProduct, normalizeProduct, sameProduct, STOCK_MODES, SOLD_OUT_MODES } from './product-model.js';
import { fetchWithReadRetry } from './read-retry.js';
import { SALE_COLUMNS, saleCommand } from './sales-model.js';
import { browserAuthStorage, invalidSession } from './auth-session.js';

const unwrap = ({ data, error }) => {
  if (error) throw Object.assign(new Error(error.message), { code: error.code, status: error.status });
  return data;
};

const shop = r => r && ({
  id: r.id,
  ownerUid: r.owner_uid,
  name: r.name,
  description: r.description,
  logoUrl: r.logo_url,
  entrepreneurType: r.entrepreneur_type,
  sector: r.sector,
  contact: r.contact,
  showPrices: r.show_prices,
  historyEnabled: r.history_enabled,
  active: r.active,
  defaultProducts: r.default_products
});

const product = r => ({
  id: r.id,
  shopId: r.shop_id,
  name: r.name,
  description: r.description,
  category: r.category,
  productType: r.product_type,
  attributes: r.attributes,
  priceClp: r.price_clp,
  onRequest: r.on_request,
  soldOut: r.sold_out === true,
  photo: r.photo,
  variants: r.variants,
  updatedAt: r.updated_at
});

const shopFields = {
  name: 'name',
  description: 'description',
  logoUrl: 'logo_url',
  entrepreneurType: 'entrepreneur_type',
  sector: 'sector',
  contact: 'contact',
  showPrices: 'show_prices',
  historyEnabled: 'history_enabled'
};

const listTables = {
  categories: 'categories',
  productTypes: 'product_types',
  entrepreneurTypes: 'entrepreneur_types'
};

export function createDataLayer(config, { storage, storageKey } = {}) {
  const url = new URL(config.url);

  if (
    url.protocol !== 'https:' &&
    !['localhost', '127.0.0.1'].includes(url.hostname)
  ) {
    throw new Error('Supabase requiere HTTPS');
  }

  if (!config.anonKey) {
    throw new Error('Falta la clave anon de Supabase');
  }

  const authStorageKey = storageKey ?? `sb-${url.hostname.split('.')[0]}-auth-token`;
  const authStorage = storage ?? browserAuthStorage(authStorageKey);

  const sdk = createClient(config.url, config.anonKey, {
    auth: {
      persistSession: !!authStorage,
      storage: authStorage,
      storageKey: authStorageKey,
      autoRefreshToken: true,
      detectSessionInUrl: false
    },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);

        if (typeof window === 'undefined') {
          headers.set('User-Agent', 'ConectaSur-web-tests');
        }

        return fetchWithReadRetry(input, { ...init, headers });
      }
    }
  });

  async function profile() {
    const user = unwrap(await sdk.auth.getUser())?.user;

    if (!user) {
      throw new Error('Inicia sesion para continuar');
    }

    const p = unwrap(
      await sdk.from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
    );

    if (
      !p?.active ||
      !['admin', 'emprendedora', 'comprador'].includes(p.role)
    ) {
      throw Object.assign(new Error('Cuenta desactivada o sin permisos'), { code: 'account_inactive' });
    }

    return {
      uid: user.id,
      email: user.email,
      role: p.role,
      shopId: p.shop_id,
      displayName: p.display_name,
      active: p.active
    };
  }

  async function requireAdmin() {
    if ((await profile()).role !== 'admin') {
      throw new Error(
        'Esta accion requiere una cuenta administradora activa'
      );
    }
  }

  async function uploadShopLogoFile(shopId, file, folder = 'logo') {
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size <= 0 || file.size > 2097152) {
      throw Object.assign(new Error('Usa una imagen JPEG, PNG o WebP de hasta 2 MiB'), { code: 'invalid_logo' });
    }
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type];
    const path = shopId + '/' + folder + '/' + crypto.randomUUID() + '.' + ext;
    unwrap(await sdk.storage.from('shop-images').upload(path, file, { contentType: file.type, upsert: false }));
    return sdk.storage.from('shop-images').getPublicUrl(path).data.publicUrl;
  }

  const layer = {
    client: sdk,

    async registerBuyer({ displayName, email, password }) {
      const name = String(displayName ?? '').trim();
      if (!name || name.length > 120 || typeof email !== 'string' || !email.trim() || typeof password !== 'string' || password.length < 8) {
        throw Object.assign(new Error('Revisa los datos de registro'), { code: 'invalid_registration' });
      }
      if (unwrap(await sdk.auth.getSession())?.session) {
        throw Object.assign(new Error('Cierra tu sesión antes de crear otra cuenta'), { code: 'session_exists' });
      }
      // El trigger del servidor asigna comprador; nunca se acepta un rol desde el formulario.
      const result = unwrap(await sdk.auth.signUp({
        email: email.trim(), password, options: { data: { display_name: name } }
      }));
      if (!result.session) return { user: null, confirmationRequired: true };
      try {
        const user = await profile();
        if (user.role !== 'comprador') throw Object.assign(new Error('Perfil inesperado'), { code: 'invalid_registration' });
        return { user, confirmationRequired: false };
      } catch (error) {
        await sdk.auth.signOut({ scope: 'local' });
        throw error;
      }
    },

    async login(email, password) {
      unwrap(
        await sdk.auth.signInWithPassword({
          email: email.trim(),
          password
        })
      );

      try {
        return await profile();
      } catch (error) {
        await sdk.auth.signOut({ scope: 'local' });
        throw error;
      }
    },

    async currentSession() {
      const session = unwrap(
        await sdk.auth.getSession()
      )?.session;

      if (!session) return null;

      try {
        return await profile();
      } catch (error) {
        // Un corte de red no equivale a una sesión revocada.
        if (invalidSession(error)) await sdk.auth.signOut({ scope: 'local' });
        throw error;
      }
    },

    async entrepreneurHome() {
      const user = await profile();
      if (user.role !== 'emprendedora') {
        throw Object.assign(new Error('Necesitas una cuenta de emprendedora'), { code: 'entrepreneur_required' });
      }
      if (!user.shopId) {
        throw Object.assign(new Error('Tu cuenta no tiene una tienda asignada'), { code: 'shop_not_assigned' });
      }
      const record = unwrap(
        await sdk.from('shops')
          .select('id,name,description,logo_url,entrepreneur_type,sector,contact,show_prices,default_products,history_enabled')
          .eq('id', user.shopId)
          .eq('owner_uid', user.uid)
          .eq('active', true)
          .maybeSingle()
      );
      if (!record) {
        throw Object.assign(new Error('Tu tienda no está disponible'), { code: 'shop_not_assigned' });
      }
      return { user, shop: shop(record) };
    },

    async ownerCatalog(expectedShopId) {
      const current = await layer.entrepreneurHome();
      if (current.shop.id !== expectedShopId) throw Object.assign(new Error('La tienda asignada cambió. Vuelve a entrar.'), { code: 'shop_changed' });
      const rows = unwrap(await sdk.from('products').select(OWNER_PRODUCT_COLUMNS).eq('shop_id', expectedShopId).order('name'));
      return { ...current, products: rows.map(privateProduct) };
    },

    async saveOwnerProduct(expectedShopId, input, { isNew = false, photoFile = null, variantFiles = new Map(), onUpload = () => {} } = {}) {
      const current = await layer.entrepreneurHome();
      if (current.shop.id !== expectedShopId) throw Object.assign(new Error('La tienda asignada cambió. Vuelve a entrar.'), { code: 'shop_changed' });
      normalizeProduct(input, expectedShopId, { pendingPhoto: !!photoFile, pendingVariants: new Set(variantFiles.keys()) });
      if (!isNew && !input.updatedAt) throw Object.assign(new Error('Vuelve a cargar el producto antes de guardar.'), { code: 'product_changed' });
      if ([...variantFiles.keys()].some(id => !input.variants.some(variant => variant.id === id))) throw new Error('Hay una imagen de variante sin asignar.');
      const draft = structuredClone(input);
      const folder = 'products/' + encodeURIComponent(draft.id);
      if (photoFile) { draft.photo = await uploadShopLogoFile(expectedShopId, photoFile, folder); onUpload({ id: null, url: draft.photo }); }
      for (const [id, file] of [...variantFiles]) {
        const url = await uploadShopLogoFile(expectedShopId, file, folder);
        draft.variants.find(variant => variant.id === id).photo = url; onUpload({ id, url });
      }
      const row = normalizeProduct(draft, expectedShopId);
      let result;
      if (isNew) result = await sdk.from('products').insert(row).select(OWNER_PRODUCT_COLUMNS).maybeSingle();
      else result = await sdk.from('products').update(row).eq('id', row.id).eq('shop_id', expectedShopId).eq('updated_at', input.updatedAt).select(OWNER_PRODUCT_COLUMNS).maybeSingle();
      if (!result.error && result.data) return privateProduct(result.data);
      // Una respuesta perdida no debe duplicar el producto ni reponer stock cambiado en otro equipo.
      const latest = await sdk.from('products').select(OWNER_PRODUCT_COLUMNS).eq('id', row.id).eq('shop_id', expectedShopId).maybeSingle();
      if (!latest.error && latest.data && sameProduct(latest.data, row)) return privateProduct(latest.data);
      if (result.error) unwrap(result);
      throw Object.assign(new Error('Este producto cambió o fue eliminado desde otro equipo. Vuelve a cargarlo antes de guardar.'), { code: 'product_changed' });
    },

    async deleteOwnerProduct(expectedShopId, id, updatedAt) {
      const current = await layer.entrepreneurHome();
      if (current.shop.id !== expectedShopId || !updatedAt) throw Object.assign(new Error('Vuelve a cargar tu catálogo antes de eliminar.'), { code: 'product_changed' });
      const rows = unwrap(await sdk.from('products').delete().eq('id', id).eq('shop_id', expectedShopId).eq('updated_at', updatedAt).select('id'));
      if (rows.length) return;
      const latest = unwrap(await sdk.from('products').select('id').eq('id', id).eq('shop_id', expectedShopId).maybeSingle());
      if (latest) throw Object.assign(new Error('El producto cambió desde otro equipo. Actualiza el catálogo antes de eliminar.'), { code: 'product_changed' });
    },

    async setOwnerAvailability(expectedShopId, { ids = null, category = null, settings }) {
      const current = await layer.entrepreneurHome();
      if (current.shop.id !== expectedShopId) throw new Error('Esta tienda no pertenece a tu cuenta.');
      if (ids && !ids.length) throw new Error('Selecciona al menos un producto.');
      return unwrap(await sdk.rpc('set_product_availability', { p_shop_id: expectedShopId, p_ids: ids, p_category: category, p_settings: settings }));
    },

    async saveProductDefaults(expectedShopId, defaults) {
      const current = await layer.entrepreneurHome();
      if (current.shop.id !== expectedShopId || !Object.hasOwn(STOCK_MODES, defaults.stockMode) || !Object.hasOwn(SOLD_OUT_MODES, defaults.soldOut) || typeof defaults.visible !== 'boolean' || typeof defaults.showPrice !== 'boolean' || Object.keys(defaults).length !== 4) throw new Error('Revisa las preferencias de tus productos nuevos.');
      const row = unwrap(await sdk.from('shops').update({ default_products: defaults }).eq('id', expectedShopId).eq('owner_uid', current.user.uid).eq('active', true).select('id').maybeSingle());
      if (!row) throw new Error('No se pudieron guardar tus preferencias.');
    },

    async saveEntrepreneurShop(expectedShopId, changes, { logoFile = null, removeLogo = false } = {}) {
      const current = await layer.entrepreneurHome();
      if (current.shop.id !== expectedShopId) {
        throw Object.assign(new Error('La tienda asignada a tu cuenta cambió. Vuelve a entrar antes de editar.'), { code: 'shop_changed' });
      }
      const limits = { name: 120, description: 1000, entrepreneurType: 120, sector: 240, contact: 240 };
      const values = {};
      for (const [key, value] of Object.entries(changes)) {
        if (key === 'showPrices') {
          if (typeof value !== 'boolean') throw Object.assign(new Error('Revisa la opción de mostrar precios.'), { code: 'invalid_shop' });
          values.show_prices = value;
        } else if (Object.hasOwn(limits, key) && typeof value === 'string' && value.trim().length <= limits[key]) {
          values[shopFields[key]] = value.trim();
        } else {
          throw Object.assign(new Error('Hay un dato de tienda no permitido o demasiado largo.'), { code: 'invalid_shop' });
        }
      }
      if (!values.name) throw Object.assign(new Error('Escribe el nombre de tu tienda.'), { code: 'invalid_shop' });
      if (logoFile && removeLogo) throw Object.assign(new Error('Elige una imagen o quita el logo actual.'), { code: 'invalid_logo' });
      if (logoFile) values.logo_url = await uploadShopLogoFile(current.shop.id, logoFile);
      else if (removeLogo) values.logo_url = null;
      const updated = unwrap(await sdk.from('shops').update(values)
        .eq('id', current.shop.id).eq('owner_uid', current.user.uid).eq('active', true)
        .select('id,name,description,logo_url,entrepreneur_type,sector,contact,show_prices').maybeSingle());
      if (!updated) throw Object.assign(new Error('No tienes permiso para guardar esta tienda.'), { code: 'shop_changed' });
      return { user: current.user, shop: shop(updated) };
    },

    async logout() {
      unwrap(await sdk.auth.signOut({ scope: 'local' }));
    },

    onSession(callback) {
      const { data } = sdk.auth.onAuthStateChange(
        (event, session) => callback(session?.user ?? null, event)
      );

      return () => data.subscription.unsubscribe();
    },

    async createEmprendedora({
      email,
      password,
      displayName,
      shopName
    }) {
      await requireAdmin();

      // Almacenamiento independiente para el registro secundario.
      const isolatedStorage = {
        values: new Map(),

        getItem(key) {
          return this.values.get(key) ?? null;
        },

        setItem(key, value) {
          this.values.set(key, value);
        },

        removeItem(key) {
          this.values.delete(key);
        }
      };

      const secondary = createDataLayer(config, {
        storage: isolatedStorage,
        // El alta de una emprendedora no cambia la sesión del administrador
        // ni transmite su sesión temporal a las otras pestañas.
        storageKey: authStorageKey + '-provision-' + crypto.randomUUID()
      });

      try {
        const result = unwrap(
          await secondary.client.auth.signUp({
            email: email.trim(),
            password,
            options: {
              data: { display_name: displayName }
            }
          })
        );

        if (!result.user?.id) {
          throw new Error('No se pudo crear la cuenta');
        }

        const shopId = unwrap(
          await sdk.rpc('provision_entrepreneur', {
            p_uid: result.user.id,
            p_name: displayName,
            p_shop_name: shopName
          })
        );

        return {
          uid: result.user.id,
          shopId
        };
      } finally {
        try {
          const { data } =
            await secondary.client.auth.getSession();

          if (data?.session) {
            await secondary.client.auth.signOut({
              scope: 'local'
            });
          }
        } catch (error) {
          console.warn(
            'No se pudo cerrar la sesión secundaria:',
            error
          );
        }

        await secondary.dispose();
      }
    },

    async setEmprendedoraActive(uid, shopId, active) {
      await requireAdmin();

      unwrap(
        await sdk.rpc('set_entrepreneur_active', {
          p_uid: uid,
          p_shop_id: shopId,
          p_active: active
        })
      );
    },

    async listShops() {
      await requireAdmin();

      return unwrap(
        await sdk.from('shops')
          .select('*')
          .order('name')
      ).map(shop);
    },

    async getShop(id) {
      return shop(
        unwrap(
          await sdk.from('public_shops')
            .select('*')
            .eq('id', id)
            .maybeSingle()
        )
      );
    },

    async listPublicShops() {
      return unwrap(
        await sdk.from('public_shops')
          .select('id,name,description,logo_url,entrepreneur_type,sector,contact,show_prices')
          .order('name')
      ).map(shop);
    },

    async updateShop(id, changes) {
      const mapped = {};

      for (const [key, value] of Object.entries(changes)) {
        if (!shopFields[key]) {
          throw new Error('Campo de tienda no permitido: ' + key);
        }

        mapped[shopFields[key]] = value;
      }

      const rows = unwrap(
        await sdk.from('shops')
          .update(mapped)
          .eq('id', id)
          .select('id')
      );

      if (!rows.length) {
        throw new Error('No tienes permiso para editar esta tienda');
      }
    },

    async saveAssociation(id, data) {
      await requireAdmin();

      const allowed = [
        'name',
        'description',
        'sector',
        'contact',
        'active'
      ];

      const values = { id, active: true };

      for (const key of allowed) {
        if (key in data) values[key] = data[key];
      }

      if ('logoUrl' in data) {
        values.logo_url = data.logoUrl;
      }

      unwrap(
        await sdk.from('associations').upsert(values)
      );
    },

    async setAssociationActive(id, active) {
      await requireAdmin();

      unwrap(
        await sdk.from('associations')
          .update({ active })
          .eq('id', id)
      );
    },

    async listAssociations() {
      return unwrap(
        await sdk.from('associations')
          .select('*')
          .order('name')
      );
    },

    async addShopToAssociation(shopId, associationId) {
      await requireAdmin();

      unwrap(
        await sdk.from('shop_associations')
          .upsert({
            shop_id: shopId,
            association_id: associationId
          })
      );
    },

    async removeShopFromAssociation(shopId, associationId) {
      await requireAdmin();

      unwrap(
        await sdk.from('shop_associations')
          .delete()
          .eq('shop_id', shopId)
          .eq('association_id', associationId)
      );
    },

    // NUEVA FUNCIÓN: consultar integrantes de una asociación.
    async listAssociationShops(associationId) {
      await requireAdmin();

      return unwrap(
        await sdk.from('shop_associations')
          .select('shop_id')
          .eq('association_id', associationId)
      );
    },

    async saveListItem(collectionName, id, name) {
      await requireAdmin();

      const table = listTables[collectionName];

      if (!table) throw new Error('Lista no permitida');

      unwrap(
        await sdk.from(table).upsert({ id, name })
      );
    },

    async listItems(collectionName) {
      const table = listTables[collectionName];

      if (!table) throw new Error('Lista no permitida');

      return unwrap(
        await sdk.from(table)
          .select('*')
          .order('name')
      );
    },

    async listPublicProducts(shopId = null) {
      let q = sdk.from('public_products')
        .select('*')
        .order('name');

      if (shopId) q = q.eq('shop_id', shopId);

      return unwrap(await q).map(product);
    },

    watchPublicProducts(callback, shopId = null, onError = () => {}) {
      let stopped = false;
      let timer;

      async function tick() {
        try {
          const rows = await layer.listPublicProducts(shopId);

          if (!stopped) callback(rows);
        } catch (error) {
          if (!stopped) onError(error);
        } finally {
          if (!stopped) timer = setTimeout(tick, 15000);
        }
      }

      tick();

      return () => {
        stopped = true;
        clearTimeout(timer);
      };
    },

    async uploadLogo(shopId, file) {
      const publicUrl = await uploadShopLogoFile(shopId, file);
      await layer.updateShop(shopId, { logoUrl: publicUrl });
      return publicUrl;
    },

    async registerSale(
      shopId,
      productId,
      variantId,
      quantity,
      place,
      requestId = crypto.randomUUID()
    ) {
      return unwrap(
        await sdk.rpc('register_sale', {
          p_shop_id: shopId,
          p_product_id: productId,
          p_variant_id: variantId,
          p_quantity: quantity,
          p_place: place,
          p_request_id: requestId
        })
      );
    },

    async recordOwnerSale(expectedShopId, input) {
      const current=await layer.entrepreneurHome();
      if(current.shop.id!==expectedShopId)throw Object.assign(new Error('La tienda asignada cambió. Vuelve a entrar.'),{code:'shop_changed'});
      const command=saleCommand(input);
      // El RPC valida y descuenta dentro de la transacción; el mismo ID permite reintentar sin duplicar.
      return layer.registerSale(expectedShopId,command.productId,command.variantId,command.quantity,command.place,command.requestId);
    },

    async ownerSaleReceipt(expectedShopId, id) {
      const current=await layer.entrepreneurHome();
      if(current.shop.id!==expectedShopId)throw Object.assign(new Error('Esta tienda no pertenece a tu cuenta.'),{code:'shop_changed'});
      return unwrap(await sdk.from('sales').select(SALE_COLUMNS).eq('shop_id',expectedShopId).eq('id',id).maybeSingle());
    },

    async ownerSalesHistory(expectedShopId) {
      const current=await layer.entrepreneurHome();
      if(current.shop.id!==expectedShopId)throw Object.assign(new Error('Esta tienda no pertenece a tu cuenta.'),{code:'shop_changed'});
      const rows=[];let cursor=null;
      // Paginación por fecha e ID: no se pierden registros al superar el límite de 1000 del servidor.
      while(true) {
        let query=sdk.from('sales').select(SALE_COLUMNS).eq('shop_id',expectedShopId).order('date_millis',{ascending:false}).order('id',{ascending:true}).limit(200);
        if(cursor)query=query.or(`date_millis.lt.${cursor.date_millis},and(date_millis.eq.${cursor.date_millis},id.gt.${cursor.id})`);
        const page=unwrap(await query);rows.push(...page);
        if(page.length<200)break;
        const last=page.at(-1);
        if(!Number.isSafeInteger(Number(last.date_millis)) || !/^[\da-f-]{36}$/i.test(last.id))throw new Error('No pudimos continuar la consulta del historial.');
        cursor=last;
      }
      return {...current,sales:rows};
    },

    async setOwnerHistoryEnabled(expectedShopId, enabled) {
      const current=await layer.entrepreneurHome();
      if(current.shop.id!==expectedShopId || typeof enabled!=='boolean')throw new Error('Revisa la preferencia del historial.');
      const row=unwrap(await sdk.from('shops').update({history_enabled:enabled}).eq('id',expectedShopId).eq('owner_uid',current.user.uid).eq('active',true).select('history_enabled').maybeSingle());
      if(!row)throw new Error('No pudimos guardar la preferencia del historial.');
      return row.history_enabled;
    },

    async salesHistory(shopId) {
      return unwrap(
        await sdk.from('sales')
          .select('*')
          .eq('shop_id', shopId)
          .order('date_millis', { ascending: false })
      );
    },

    async listAdminActions() {
      await requireAdmin();

      return unwrap(
        await sdk.from('admin_actions')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200)
      );
    },

    async dispose() {
      sdk.auth.stopAutoRefresh();
      await sdk.removeAllChannels();
    }
  };

  return layer;
}

let configured;

export function configureSupabase(config) {
  if (configured) {
    throw new Error('Supabase ya esta configurado');
  }

  configured = createDataLayer(config);
  return configured;
}

const current = () => {
  if (!configured) {
    throw new Error(
      'Llama configureSupabase(config) al iniciar la web'
    );
  }

  return configured;
};

export const login = (...a) => current().login(...a);
export const logout = (...a) => current().logout(...a);
export const onSession = (...a) => current().onSession(...a);

export const createEmprendedora = (...a) =>
  current().createEmprendedora(...a);

export const setEmprendedoraActive = (...a) =>
  current().setEmprendedoraActive(...a);

export const listShops = (...a) => current().listShops(...a);
export const getShop = (...a) => current().getShop(...a);
export const updateShop = (...a) => current().updateShop(...a);

export const saveAssociation = (...a) =>
  current().saveAssociation(...a);

export const setAssociationActive = (...a) =>
  current().setAssociationActive(...a);

export const listAssociations = (...a) =>
  current().listAssociations(...a);

export const addShopToAssociation = (...a) =>
  current().addShopToAssociation(...a);

export const removeShopFromAssociation = (...a) =>
  current().removeShopFromAssociation(...a);

export const listAssociationShops = (...a) =>
  current().listAssociationShops(...a);

export const saveListItem = (...a) =>
  current().saveListItem(...a);

export const listItems = (...a) => current().listItems(...a);

export const watchPublicProducts = (...a) =>
  current().watchPublicProducts(...a);
