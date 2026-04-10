/**
 * alerts.js — Price alert system for rendimientos.co
 *
 * Integración:
 *   1. Incluir este archivo en public/index.html antes del cierre </body>
 *   2. Llamar AlertSystem.init() cuando el DOM esté listo
 *   3. Llamar AlertSystem.checkAlerts(assets) cada vez que lleguen nuevos precios
 *
 * Ejemplo de assets:
 *   [
 *     { id: 'btc',   label: 'Bitcoin',    price: 84500,   currency: 'USD' },
 *     { id: 'gold',  label: 'Oro',        price: 3210,    currency: 'USD' },
 *     { id: 'al30',  label: 'AL30',       price: 63.20,   currency: 'USD' },
 *     { id: 'ggal',  label: 'GGAL ADR',   price: 28.45,   currency: 'USD' },
 *   ]
 */

const AlertSystem = (() => {
  const STORAGE_KEY = 'rendimientos_alerts_v1';
  const CHECK_DEBOUNCE_MS = 500;
  let _assets = [];
  let _debounceTimer = null;

  // ─── Storage ──────────────────────────────────────────────────────────────

  function loadAlerts() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  }

  function saveAlerts(alerts) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
  }

  function addAlert({ assetId, assetLabel, direction, targetPrice, currency }) {
    const alerts = loadAlerts();
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    alerts.push({ id, assetId, assetLabel, direction, targetPrice: Number(targetPrice), currency, triggered: false, createdAt: Date.now() });
    saveAlerts(alerts);
    renderAlertList();
    return id;
  }

  function removeAlert(id) {
    const alerts = loadAlerts().filter(a => a.id !== id);
    saveAlerts(alerts);
    renderAlertList();
  }

  function markTriggered(id) {
    const alerts = loadAlerts().map(a => a.id === id ? { ...a, triggered: true, triggeredAt: Date.now() } : a);
    saveAlerts(alerts);
    renderAlertList();
  }

  // ─── Price check ──────────────────────────────────────────────────────────

  function checkAlerts(assets) {
    _assets = assets || _assets;
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(_runChecks, CHECK_DEBOUNCE_MS);
  }

  function _runChecks() {
    const alerts = loadAlerts().filter(a => !a.triggered);
    if (!alerts.length) return;

    const priceMap = {};
    _assets.forEach(a => { priceMap[a.id] = a.price; });

    alerts.forEach(alert => {
      const current = priceMap[alert.assetId];
      if (current == null) return;

      const crossed =
        (alert.direction === 'above' && current >= alert.targetPrice) ||
        (alert.direction === 'below' && current <= alert.targetPrice);

      if (crossed) {
        markTriggered(alert.id);
        _notify(alert, current);
      }
    });
  }

  // ─── Notifications ────────────────────────────────────────────────────────

  function _notify(alert, currentPrice) {
    const dir = alert.direction === 'above' ? '▲ superó' : '▼ cayó por debajo de';
    const fmt = (n, c) => c === 'ARS'
      ? `$${n.toLocaleString('es-AR')}`
      : `USD ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const title = `🔔 Alerta: ${alert.assetLabel}`;
    const body = `${dir} ${fmt(alert.targetPrice, alert.currency)} → precio actual: ${fmt(currentPrice, alert.currency)}`;

    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/icons/icon-192x192.png' });
    }
    _showToast(title, body);
  }

  function _showToast(title, body) {
    let container = document.getElementById('alert-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'alert-toast-container';
      container.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:10px;max-width:340px;';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.style.cssText = 'background:var(--bg-card,#1a1f2e);color:var(--text-primary,#e8eaf0);border:1px solid var(--border,#2e3448);border-left:3px solid #f5a623;border-radius:8px;padding:12px 16px;font-family:inherit;';
    toast.innerHTML = '<strong style="font-size:13px;display:block;margin-bottom:3px;">' + title + '</strong><span style="font-size:12px;opacity:.85;">' + body + '</span>';
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 6000);
  }

  function renderAlertList() {
    const list = document.getElementById('alert-list');
    if (!list) return;
    const alerts = loadAlerts();
    const active = alerts.filter(a => !a.triggered);
    const triggered = alerts.filter(a => a.triggered).slice(-5);
    if (!alerts.length) { list.innerHTML = '<p class="alert-empty">Sin alertas configuradas.</p>'; return; }
    const fmt = (n, c) => c === 'ARS' ? '$' + Number(n).toLocaleString('es-AR') : 'USD ' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 });
    const row = (a, d) => '<div class="alert-item' + (d ? ' alert-item--triggered' : '') + '" data-id="' + a.id + '">'
      + '<span class="alert-item__icon">' + (d ? '✓' : (a.direction === 'above' ? '▲' : '❼')) + '</span>'
      + '<div class="alert-item__body"><div class="alert-item__asset">' + a.assetLabel + '</div>'
      + '<div class="alert-item__detail">' + (a.direction === 'above' ? 'Supera' : 'Cae a') + ' ' + fmt(a.targetPrice, a.currency) + (d ? ' <span class="alert-item__fired">· disparada</span>' : '') + '</div></div>'
      + (!d ? '<button class="alert-item__remove" onclick="AlertSystem.removeAlert(\'' + a.id + '\')">×</button>' : '') + '</div>';
    list.innerHTML = active.map(a => row(a, false)).join('')
      + (triggered.length ? '<div class="alert-triggered-header">Disparadas recientemente</div>' + triggered.map(a => row(a, true)).join('') : '');
  }

  function bindForm() {
    const form = document.getElementById('alert-form');
    if (!form) return;
    const sel = document.getElementById('alert-asset');
    const dir = document.getElementById('alert-direction');
    const inp = document.getElementById('alert-price');
    const btn = document.getElementById('alert-submit');
    if (sel && _assets.length) {
      sel.innerHTML = _assets.map(a => '<option value="' + a.id + '" data-currency="' + (a.currency || 'USD') + '" data-label="' + a.label + '">' + a.label + '</option>').join('');
    }
    form.addEventListener('submit', e => {
      e.preventDefault();
      const opt = sel.options[sel.selectedIndex];
      const price = parseFloat(inp.value);
      if (!price || isNaN(price)) return;
      addAlert({ assetId: opt.value, assetLabel: opt.dataset.label, direction: dir.value, targetPrice: price, currency: opt.dataset.currency || 'USD' });
      inp.value = ''; inp.focus();
    });
    btn.addEventListener('click', () => { if (Notification.permission === 'default') Notification.requestPermission(); }, { once: true });
  }

  function init(assets) {
    if (assets) _assets = assets;
    bindForm();
    renderAlertList();
  }

  return { init, checkAlerts, addAlert, removeAlert, renderAlertList };
})();

if (typeof module !== 'undefined') module.exports = AlertSystem;
