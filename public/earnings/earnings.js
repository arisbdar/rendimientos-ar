const state = {
  view: 'week',
  today: startOfDay(new Date()),
  endDate: null,
  allEvents: {},
  weekStarts: [],
  monthStarts: [],
  weekIndex: 0,
  monthIndex: 0,
};

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

document.addEventListener('DOMContentLoaded', () => {
  setupThemeToggle();
  setupViewToggle();
  setupNavigation();
  loadEarningsCalendar();
});

function setupThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  });
}

function setupViewToggle() {
  document.querySelectorAll('.earnings-view-icon').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextView = btn.dataset.view === 'month' ? 'month' : 'week';
      state.view = nextView;
      document.querySelectorAll('.earnings-view-icon').forEach((b) => {
        const active = b.dataset.view === nextView;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      renderCurrentView();
    });
  });
}

function setupNavigation() {
  const prev = document.getElementById('earnings-prev');
  const next = document.getElementById('earnings-next');
  if (prev) prev.addEventListener('click', () => shiftPeriod(-1));
  if (next) next.addEventListener('click', () => shiftPeriod(1));
}

async function loadEarningsCalendar() {
  const loading = document.getElementById('earnings-loading');
  const errorBox = document.getElementById('earnings-error');
  const calendar = document.getElementById('earnings-calendar');
  const source = document.getElementById('earnings-source');

  try {
    const today = startOfDay(new Date());
    // Para la vista mensual completa, pedimos desde el primer día del mes actual
    const startOfCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = addMonths(startOfCurrentMonth, 3);
    state.today = today;
    state.startDate = startOfCurrentMonth;
    state.endDate = end;

    const res = await fetch(`/api/earnings?start=${toIsoDate(startOfCurrentMonth)}&end=${toIsoDate(end)}`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const data = await res.json();

    state.allEvents = normalizeEarnings(data, startOfCurrentMonth, end);
    state.weekStarts = buildWeekStarts(today, end);
    state.monthStarts = buildMonthStarts(startOfCurrentMonth, end);
    state.weekIndex = 0;
    state.monthIndex = 0;

    if (loading) loading.hidden = true;
    if (errorBox) errorBox.hidden = true;
    if (calendar) calendar.hidden = false;
    if (source) {
      source.textContent = `Rango: ${formatDateLong(startOfCurrentMonth)} - ${formatDateLong(end)} | Actualizado ${new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
    }
    renderCurrentView();
  } catch (err) {
    console.error('Earnings calendar error:', err);
    if (loading) loading.hidden = true;
    if (errorBox) {
      errorBox.hidden = false;
      errorBox.textContent = 'No se pudo cargar el earnings calendar en este momento.';
    }
  }
}

function normalizeEarnings(payload, start, end) {
  const parsed = {};
  const startKey = toIsoDate(start);
  const endKey = toIsoDate(end);
  const days = Object.keys(payload || {}).sort();
  for (const day of days) {
    if (day < startKey || day > endKey) continue;
    const items = (payload[day] || [])
      .filter((e) => e && e.isDateConfirmed && Number(e.marketCap) > 0 && e.symbol)
      .sort((a, b) => Number(b.marketCap || 0) - Number(a.marketCap || 0))
      .slice(0, 12);
    if (items.length) parsed[day] = items;
  }
  return parsed;
}

function buildWeekStarts(start, end) {
  const starts = [];
  const first = startOfWeek(start, 1);
  let cursor = first;
  while (cursor <= end) {
    starts.push(cursor);
    cursor = addDays(cursor, 7);
  }
  return starts;
}

function buildMonthStarts(start, end) {
  const starts = [];
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= end) {
    starts.push(cursor);
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return starts;
}

function shiftPeriod(step) {
  if (state.view === 'week') {
    const next = clamp(state.weekIndex + step, 0, state.weekStarts.length - 1);
    state.weekIndex = next;
  } else {
    const next = clamp(state.monthIndex + step, 0, state.monthStarts.length - 1);
    state.monthIndex = next;
  }
  renderCurrentView();
}

function renderCurrentView() {
  if (state.view === 'week') {
    renderWeekView();
  } else {
    renderMonthView();
  }
  syncNavState();
}

function renderWeekView() {
  const root = document.getElementById('earnings-calendar');
  if (!root) return;
  const weekStart = state.weekStarts[state.weekIndex];
  const weekEnd = addDays(weekStart, 4); // Viernes (Lun + 4 días)
  const days = [];
  for (let i = 0; i < 5; i++) { // Solo 5 días hábiles (Lun-Vie)
    const current = addDays(weekStart, i);
    if (current < state.today || current > state.endDate) continue;
    const key = toIsoDate(current);
    days.push({
      date: current,
      key,
      items: state.allEvents[key] || [],
    });
  }

  const dayCards = days.map((day) => {
    const beforeOpen = day.items.filter(item => isBeforeOpen(item.earningsTime));
    const afterClose = day.items.filter(item => isAfterClose(item.earningsTime));
    const during = day.items.filter(item => !isBeforeOpen(item.earningsTime) && !isAfterClose(item.earningsTime));
    const hasIpo = hasIPO(day.items);
    
    // All items are shown in grids - Before, After, and During
    const hasContent = beforeOpen.length > 0 || afterClose.length > 0 || during.length > 0;
    
    return `
    <article class="earnings-day-card">
      <div class="earnings-day-header">
        <div class="earnings-day-title">
          <span>${DAY_NAMES[day.date.getDay()]}</span>
          <strong>${day.date.getDate()} ${MONTH_NAMES[day.date.getMonth()].slice(0, 3)}</strong>
        </div>
        ${hasIpo ? '<span class="ipo-badge">IPO</span>' : ''}
      </div>
      ${hasContent ? `
        <div class="earnings-day-content">
          ${beforeOpen.length ? renderEarningsSection(beforeOpen, 'before') : ''}
          ${afterClose.length ? renderEarningsSection(afterClose, 'after') : ''}
          ${during.length ? renderLogoGrid(during, 40) : ''}
        </div>
      ` : '<p class="earnings-empty-day">Sin reportes confirmados</p>'}
    </article>
  `;
  }).join('');

  root.innerHTML = `
    <div class="earnings-week-grid">
      ${dayCards}
    </div>
  `;

  setPeriodLabel(`${formatDateShort(weekStart)} - ${formatDateShort(weekEnd)}`);
}

function renderMonthView() {
  const root = document.getElementById('earnings-calendar');
  if (!root) return;
  const monthStart = state.monthStarts[state.monthIndex];
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
  const gridStart = startOfWeek(monthStart, 1);
  const gridEnd = addDays(startOfWeek(monthEnd, 1), 6);
  const cells = [];
  let cursor = gridStart;

  while (cursor <= gridEnd) {
    const dayOfWeek = cursor.getDay();
    // Saltear sábados (6) y domingos (0)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      const key = toIsoDate(cursor);
      const inMonth = cursor.getMonth() === monthStart.getMonth();
      const inRange = cursor >= state.startDate && cursor <= state.endDate;
      const events = inRange ? (state.allEvents[key] || []) : [];
      const beforeOpen = events.filter(item => isBeforeOpen(item.earningsTime));
      const afterClose = events.filter(item => isAfterClose(item.earningsTime));
      const during = events.filter(item => !isBeforeOpen(item.earningsTime) && !isAfterClose(item.earningsTime));
      const hasIpo = hasIPO(events);
      const hasEvents = events.length > 0;

      const renderMonthSection = (items, type) => {
        if (!items.length) return '';
        const icon = type === 'before'
          ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
          : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
        return `
          <div class="month-section ${type}">
            <div class="month-section-header">${icon}</div>
            ${renderLogoGrid(items, 24)}
          </div>
        `;
      };

      cells.push(`
        <article class="month-day-cell${inMonth ? '' : ' muted'}${inRange ? '' : ' out-of-range'}">
          <header>
            <span>${cursor.getDate()}</span>
            ${hasIpo ? '<span class="ipo-badge ipo-badge-small">IPO</span>' : ''}
          </header>
          ${hasEvents ? `
            <div class="month-day-events">
              ${renderMonthSection(beforeOpen, 'before')}
              ${renderMonthSection(afterClose, 'after')}
              ${during.length ? renderLogoGrid(during, 24) : ''}
            </div>
          ` : ''}
        </article>
      `);
    }

    cursor = addDays(cursor, 1);
  }

  root.innerHTML = `
    <div class="month-weekday-row">
      ${['Lun', 'Mar', 'Mié', 'Jue', 'Vie'].map((d) => `<span>${d}</span>`).join('')}
    </div>
    <div class="earnings-month-grid">
      ${cells.join('')}
    </div>
  `;

  setPeriodLabel(`${MONTH_NAMES[monthStart.getMonth()]} ${monthStart.getFullYear()}`);
}

function syncNavState() {
  const prev = document.getElementById('earnings-prev');
  const next = document.getElementById('earnings-next');
  if (!prev || !next) return;

  if (state.view === 'week') {
    prev.disabled = state.weekIndex <= 0;
    next.disabled = state.weekIndex >= state.weekStarts.length - 1;
  } else {
    prev.disabled = state.monthIndex <= 0;
    next.disabled = state.monthIndex >= state.monthStarts.length - 1;
  }
}

function setPeriodLabel(text) {
  const label = document.getElementById('earnings-period-label');
  if (label) label.textContent = text;
}

function formatMarketCap(value) {
  if (!value) return '';
  const num = Number(value);
  if (num >= 1e12) return '$' + (num / 1e12).toFixed(2) + 'T';
  if (num >= 1e9) return '$' + (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return '$' + (num / 1e6).toFixed(2) + 'M';
  return '$' + num.toLocaleString();
}

function logoHtml(symbol, size = 24) {
  const safeSymbol = encodeURIComponent(symbol);
  const style = size !== 24 ? ` style="width:${size}px;height:${size}px;border-radius:${size > 30 ? 8 : 6}px;"` : '';
  
  return `
    <span class="earnings-logo-wrap"${style}>
      <img class="earnings-logo" src="https://static.svvytrdr.com/logos/${safeSymbol}.webp" alt="${escapeHtml(symbol)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
      <span class="earnings-logo-fallback" style="display:none">${escapeHtml(symbol)}</span>
    </span>
  `;
}

function earningsTimeLabel(time) {
  if (!time) return '';
  const hour = parseInt(String(time).split(':')[0], 10);
  if (hour < 9) return 'Before Open';
  if (hour >= 16) return 'After Close';
  return 'During';
}

function isBeforeOpen(time) {
  if (!time) return false;
  const hour = parseInt(String(time).split(':')[0], 10);
  return hour < 9;
}

function isAfterClose(time) {
  if (!time) return false;
  const hour = parseInt(String(time).split(':')[0], 10);
  return hour >= 16;
}

function hasIPO(items) {
  return items.some(item => item.ipo === true || item.isIPO === true);
}

function renderLogoGrid(items, size = 40) {
  if (!items || items.length === 0) return '';
  return `
    <div class="earnings-logo-grid" style="--logo-size: ${size}px;">
      ${items.map(item => {
        const tooltipParts = [item.symbol];
        const companyName = item.name || item.companyName;
        if (companyName) tooltipParts.push(companyName);
        if (item.marketCap) tooltipParts.push(formatMarketCap(item.marketCap));
        const tooltip = tooltipParts.join(' | ');
        return `
          <div class="earnings-logo-item" title="${escapeHtml(tooltip)}" data-tooltip="${escapeHtml(tooltip)}" aria-label="${escapeHtml(tooltip)}">
            ${logoHtml(item.symbol, size)}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderEarningsSection(items, sectionType) {
  if (!items || items.length === 0) return '';
  
  const icon = sectionType === 'before'
    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
    : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  
  const label = sectionType === 'before' ? 'Before Open' : 'After Close';
  
  return `
    <div class="earnings-section ${sectionType}">
      <div class="earnings-section-header">
        ${icon}
        <span>${label}</span>
      </div>
      ${renderLogoGrid(items, 40)}
    </div>
  `;
}

function addDays(date, days) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date, weekStartsOn) {
  const copy = startOfDay(date);
  const day = copy.getDay();
  const diff = (day - weekStartsOn + 7) % 7;
  return addDays(copy, -diff);
}

function toIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateShort(date) {
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()].slice(0, 3)}`;
}

function formatDateLong(date) {
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
