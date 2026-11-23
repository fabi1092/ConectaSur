import { escapeHtml as escape } from './content.js';

const PENDING_FOLLOW_KEY = 'conectasur_pending_follow_v1';
const FOLLOW_FLASH_KEY = 'conectasur_follow_flash_v1';
const SEEN_NOTIFS_KEY = 'conectasur_seen_web_notifs_v1';
const PENDING_TTL_MS = 15 * 60 * 1000;

let memoryPendingFollow = null;
let memoryFlash = '';
const memorySeen = new Set();

function storageGet(key) {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    if (typeof localStorage === 'undefined') return;
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // fallback en memoria cuando el navegador bloquea storage
  }
}

export function savePendingFollow({ targetType, targetId, targetName = '', returnHash = '' }) {
  const entry = {
    targetType,
    targetId,
    targetName: String(targetName || ''),
    returnHash: String(returnHash || ''),
    savedAt: Date.now()
  };
  memoryPendingFollow = entry;
  storageSet(PENDING_FOLLOW_KEY, JSON.stringify(entry));
}

export function clearPendingFollow() {
  memoryPendingFollow = null;
  storageSet(PENDING_FOLLOW_KEY, null);
}

export function peekPendingFollow() {
  let raw = memoryPendingFollow;
  const stored = storageGet(PENDING_FOLLOW_KEY);
  if (stored) {
    try { raw = JSON.parse(stored); } catch { raw = null; }
  }
  if (!raw || !raw.targetType || !raw.targetId) {
    clearPendingFollow();
    return null;
  }
  if (Date.now() - Number(raw.savedAt || 0) > PENDING_TTL_MS) {
    clearPendingFollow();
    return null;
  }
  return raw;
}

export function setFollowFlash(message) {
  memoryFlash = String(message || '');
  storageSet(FOLLOW_FLASH_KEY, memoryFlash || null);
}

export function consumeFollowFlash() {
  const stored = storageGet(FOLLOW_FLASH_KEY);
  const value = stored || memoryFlash || '';
  memoryFlash = '';
  storageSet(FOLLOW_FLASH_KEY, null);
  return value;
}

export function isAuthRequiredError(error) {
  const code = String(error?.code || '');
  const msg = String(error?.message || '');
  return code === '28000' || /inicia sesi[oó]n/i.test(msg);
}

export async function completePendingFollow(db) {
  const pending = peekPendingFollow();
  if (!pending) return null;
  try {
    await db.followTarget(pending.targetType, pending.targetId);
    clearPendingFollow();
    return { ...pending, ok: true };
  } catch (error) {
    clearPendingFollow();
    return { ...pending, ok: false, error };
  }
}

export function followSectionMarkup(targetType) {
  const label = targetType === 'shop' ? 'tienda' : 'asociación';
  return `<section class="public-follow-card form-card" style="max-width:none;margin:16px 0;" aria-labelledby="follow-card-title">
    <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;">
      <div>
        <h2 id="follow-card-title" style="margin:0 0 4px 0;font-size:1.1rem;">Seguir esta ${escape(label)}</h2>
        <p id="follow-status" style="margin:0;">Recibe avisos cuando confirme su participación en próximas ferias.</p>
      </div>
      <button type="button" id="follow-toggle-btn" class="public-primary" style="min-height:44px;min-width:168px;">Seguir ${escape(label)}</button>
    </div>
    <p id="follow-feedback" class="owner-status" role="status" style="margin-top:8px;"></p>
    <div id="follow-notify-prompt" style="margin-top:8px;" hidden>
      <button type="button" id="follow-enable-notify" class="owner-secondary" style="min-height:44px;">Activar avisos en el navegador</button>
    </div>
  </section>`;
}

export function wireFollowSection(root, db, { targetType, targetId, targetName, isCurrent = () => true }) {
  const toggleBtn = root.querySelector('#follow-toggle-btn');
  const statusEl = root.querySelector('#follow-status');
  const feedbackEl = root.querySelector('#follow-feedback');
  const notifyPromptEl = root.querySelector('#follow-notify-prompt');
  const enableNotifyBtn = root.querySelector('#follow-enable-notify');
  if (!toggleBtn || !statusEl || !feedbackEl) return;

  const entityLabel = targetType === 'shop' ? 'tienda' : 'asociación';
  let following = false;
  let busy = false;
  let consented = false;

  const flash = consumeFollowFlash();
  if (flash) {
    feedbackEl.className = 'owner-save-success';
    feedbackEl.textContent = flash;
  }

  function render() {
    toggleBtn.textContent = following ? 'Dejar de seguir' : `Seguir ${entityLabel}`;
    toggleBtn.className = following ? 'owner-secondary' : 'public-primary';
    statusEl.textContent = following
      ? `Sigues a ${targetName}. Recibirás aviso cuando confirme participación en ferias.`
      : 'Recibe avisos cuando confirme su participación en próximas ferias.';
    const browserPermission = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
    const needsBrowserPrompt = following && (!consented || browserPermission === 'default');
    if (notifyPromptEl) notifyPromptEl.hidden = !needsBrowserPrompt;
  }

  async function refreshState() {
    if (typeof db.hasBuyerOrUserSession !== 'function') return;
    try {
      const signedIn = await db.hasBuyerOrUserSession();
      if (!isCurrent() || !toggleBtn.isConnected) return;
      if (!signedIn) {
        following = false;
        consented = false;
        render();
        return;
      }
      const [follows, consent] = await Promise.all([
        db.myFollows().catch(() => []),
        db.getNotificationConsent().catch(() => false)
      ]);
      if (!isCurrent() || !toggleBtn.isConnected) return;
      following = follows.some(f => f.target_type === targetType && f.target_id === targetId);
      consented = Boolean(consent);
      render();
    } catch {
      render();
    }
  }

  toggleBtn.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    toggleBtn.disabled = true;
    feedbackEl.className = 'owner-status';
    feedbackEl.textContent = '';
    try {
      if (following) {
        await db.unfollowTarget(targetType, targetId);
        if (!isCurrent() || !toggleBtn.isConnected) return;
        following = false;
        feedbackEl.className = 'owner-status';
        feedbackEl.textContent = `Dejaste de seguir a ${targetName}.`;
      } else {
        await db.followTarget(targetType, targetId);
        if (!isCurrent() || !toggleBtn.isConnected) return;
        following = true;
        feedbackEl.className = 'owner-save-success';
        feedbackEl.textContent = `Ahora sigues a ${targetName}.`;
        consented = await db.getNotificationConsent().catch(() => false);
      }
      render();
    } catch (error) {
      if (!isCurrent() || !toggleBtn.isConnected) return;
      if (isAuthRequiredError(error)) {
        savePendingFollow({
          targetType,
          targetId,
          targetName,
          returnHash: typeof window !== 'undefined' ? window.location.hash : ''
        });
        if (typeof window !== 'undefined') window.location.hash = '#ingresar';
        return;
      }
      feedbackEl.className = 'owner-status owner-error';
      feedbackEl.textContent = error?.message || 'No pudimos actualizar tu seguimiento.';
    } finally {
      busy = false;
      if (toggleBtn.isConnected) toggleBtn.disabled = false;
    }
  });

  enableNotifyBtn?.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    enableNotifyBtn.disabled = true;
    try {
      const res = await enableWebNotifications(db);
      if (!isCurrent() || !toggleBtn.isConnected) return;
      consented = res.consented;
      feedbackEl.className = 'owner-save-success';
      feedbackEl.textContent = res.permission === 'granted'
        ? 'Avisos en el navegador activados. También puedes verlos en Mi cuenta.'
        : 'Consentimiento guardado. Tus avisos de ferias aparecerán aquí y en Mi cuenta.';
      render();
    } catch (error) {
      if (!isCurrent() || !toggleBtn.isConnected) return;
      feedbackEl.className = 'owner-status owner-error';
      feedbackEl.textContent = error?.message || 'No pudimos activar los avisos.';
    } finally {
      busy = false;
      if (enableNotifyBtn.isConnected) enableNotifyBtn.disabled = false;
    }
  });

  render();
  refreshState();
}

export async function enableWebNotifications(db) {
  await db.setNotificationConsent(true);
  let permission = 'unsupported';
  if (typeof Notification !== 'undefined') {
    permission = Notification.permission === 'default'
      ? await Notification.requestPermission().catch(() => Notification.permission)
      : Notification.permission;
  }
  return { consented: true, permission };
}

export async function disableWebNotifications(db) {
  await db.setNotificationConsent(false);
}

function readSeenNotifIds() {
  const raw = storageGet(SEEN_NOTIFS_KEY);
  if (raw) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) arr.forEach(id => memorySeen.add(id));
    } catch {
      // ignorar entrada corrupta
    }
  }
  return memorySeen;
}

function markSeenNotifIds(ids) {
  const seen = readSeenNotifIds();
  ids.forEach(id => seen.add(id));
  storageSet(SEEN_NOTIFS_KEY, JSON.stringify([...seen].slice(-100)));
}

function showInPageNotificationBanner(notif, db) {
  if (typeof document === 'undefined') return;
  let host = document.getElementById('conectasur-web-toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'conectasur-web-toast-host';
    host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:9999;max-width:360px;display:flex;flex-direction:column;gap:8px;';
    document.body.appendChild(host);
  }
  const existing = host.querySelector(`[data-notif-id="${CSS.escape(String(notif.id))}"]`);
  if (existing) return;
  const fairId = notif?.data?.fair_id;
  const banner = document.createElement('div');
  banner.setAttribute('role', 'status');
  banner.dataset.notifId = String(notif.id);
  banner.style.cssText = 'background:#183a34;color:#ffffff;padding:14px 16px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.22);display:flex;flex-direction:column;gap:8px;';
  banner.innerHTML = `
    <strong style="font-size:1rem;">${escape(notif.title || 'Aviso de ConectaSur')}</strong>
    <span style="font-size:0.92rem;line-height:1.35;">${escape(notif.body || '')}</span>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      ${fairId ? `<a href="#feria/${encodeURIComponent(fairId)}" style="background:#eef6f4;color:#183a34;padding:8px 12px;border-radius:8px;text-decoration:none;font-weight:700;min-height:44px;display:inline-flex;align-items:center;">Ver feria</a>` : ''}
      <button type="button" data-dismiss-notif style="background:transparent;color:#ffffff;border:1px solid rgba(255,255,255,.5);padding:8px 12px;border-radius:8px;cursor:pointer;min-height:44px;">Cerrar</button>
    </div>
  `;
  const dismiss = async () => {
    banner.remove();
    try { await db.markNotificationsRead([notif.id]); } catch { /* noop */ }
  };
  banner.querySelector('[data-dismiss-notif]')?.addEventListener('click', dismiss);
  banner.querySelector('a')?.addEventListener('click', () => {
    banner.remove();
    db.markNotificationsRead([notif.id]).catch(() => {});
  });
  host.appendChild(banner);
}

export function startWebNotificationPoller(db, intervalMs = 15000) {
  if (typeof window === 'undefined') return () => {};
  let stopped = false;
  let running = false;

  async function check() {
    if (stopped || running || document.visibilityState === 'hidden') return;
    if (typeof db.hasBuyerOrUserSession !== 'function') return;
    running = true;
    try {
      const signedIn = await db.hasBuyerOrUserSession();
      if (!signedIn || stopped) return;
      const consent = await db.getNotificationConsent().catch(() => false);
      if (!consent || stopped) return;
      const items = await db.myNotifications(20).catch(() => []);
      if (!Array.isArray(items) || stopped) return;
      const seen = readSeenNotifIds();
      const fresh = items.filter(n => n && n.id && !n.read_at && !seen.has(n.id));
      if (!fresh.length) return;
      markSeenNotifIds(fresh.map(n => n.id));
      for (const notif of fresh) {
        showInPageNotificationBanner(notif, db);
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          try {
            const sysNotif = new Notification(notif.title || 'ConectaSur', { body: notif.body || '' });
            const fairId = notif?.data?.fair_id;
            if (fairId) {
              sysNotif.onclick = () => {
                window.focus?.();
                window.location.hash = '#feria/' + encodeURIComponent(fairId);
                sysNotif.close?.();
              };
            }
          } catch {
            // El banner en pantalla ya notificó al usuario
          }
        }
      }
    } finally {
      running = false;
    }
  }

  const timer = setInterval(check, intervalMs);
  const onVisible = () => { if (document.visibilityState === 'visible') check(); };
  document.addEventListener('visibilitychange', onVisible);
  setTimeout(check, 800);

  return () => {
    stopped = true;
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
