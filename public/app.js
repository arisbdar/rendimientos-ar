// ─── Supabase Auth ───
let supabaseClient = null;
let currentUser = null;
let _portfolioConfig = null; // cached config for portfolio use

async function initSupabase() {
  try {
    const resp = await fetch('/api/auth-config');
    const { url, anonKey } = await resp.json();
    if (!url || !anonKey) return;
    supabaseClient = window.supabase.createClient(url, anonKey, {
      auth: { flowType: 'pkce' }
    });

    // Handle PKCE OAuth callback (code in query params)
    const params = new URLSearchParams(location.search);
    if (params.has('code')) {
      const { data: { session }, error } = await supabaseClient.auth.exchangeCodeForSession(params.get('code'));
      if (session) {
        currentUser = session.user;
        updateAuthUI();
        history.replaceState(null, '', location.pathname + '#portfolio');
        if (window._switchToPortfolio) window._switchToPortfolio();
        // Ensure portfolio loads after OAuth redirect
        setTimeout(() => loadPortfolio(), 100);
        return;
      }
    }

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
      currentUser = session.user;
      updateAuthUI(); // handles portfolio-login-prompt / portfolio-content visibility
      // If user is on portfolio tab, load holdings now that we have the session
      if (location.hash === '#portfolio') loadPortfolio();
    }

    supabaseClient.auth.onAuthStateChange((event, session) => {
      currentUser = session?.user || null;
      updateAuthUI();
    });

    // Track page view (fire and forget, once per session)
    if (!sessionStorage.getItem('pv_tracked')) {
      supabaseClient.from('page_views').insert({
        path: (location.hash || '/').slice(0, 200),
        referrer: (document.referrer || '').slice(0, 500) || null,
      }).catch(() => {});
      sessionStorage.setItem('pv_tracked', '1');
    }
  } catch (e) {
    console.warn('Supabase init skipped:', e.message);
  }
}

async function loginWithGoogle() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + '/#portfolio' }
  });
}

async function logout() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
  currentUser = null;
  updateAuthUI();
  if (location.hash === '#portfolio') location.hash = 'mundo';
}

function updateAuthUI() {
  const userDiv = document.getElementById('auth-user');
  const avatar = document.getElementById('auth-avatar');
  const portfolioLoginPrompt = document.getElementById('portfolio-login-prompt');
  const portfolioContent = document.getElementById('portfolio-content');
  if (currentUser) {
    if (userDiv) userDiv.style.display = 'flex';
    if (avatar) avatar.src = currentUser.user_metadata?.avatar_url || '';
    if (portfolioLoginPrompt) portfolioLoginPrompt.style.display = 'none';
    if (portfolioContent) portfolioContent.style.display = '';
  } else {
    if (userDiv) userDiv.style.display = 'none';
    if (portfolioLoginPrompt) portfolioLoginPrompt.style.display = '';
    if (portfolioContent) portfolioContent.style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  setupThemeToggle();
  setupA11yReadAloud();
  init();
  setupTabs();
  setupKeyboardNav();
  loadMundo();
  loadHotMovers();
  loadEarnings();
  loadCotizaciones();
  loadNewsTicker();
  initSupabase();

  // Auth event listeners
  document.getElementById('auth-logout-btn')?.addEventListener('click', logout);
  document.getElementById('portfolio-google-login')?.addEventListener('click', loginWithGoogle);
  document.getElementById('portfolio-add-btn')?.addEventListener('click', openAddHoldingModal);
});

function setupThemeToggle() {
  const saved = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);

  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  });
}

// ─── Accessibility: Read Aloud Mode ───
let a11yReadAloud = false;

function setupA11yReadAloud() {
  const btn = document.getElementById('a11y-toggle');
  if (!btn || !window.speechSynthesis) return;

  btn.addEventListener('click', () => {
    a11yReadAloud = !a11yReadAloud;
    btn.classList.toggle('active', a11yReadAloud);

    if (a11yReadAloud) {
      readCurrentSection();
    } else {
      speechSynthesis.cancel();
    }
  });
}

function speak(text) {
  if (!a11yReadAloud || !window.speechSynthesis) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'es-AR';
  utterance.rate = 0.95;
  speechSynthesis.speak(utterance);
}

function readCurrentSection() {
  if (!a11yReadAloud) return;

  // Read cotizaciones strip
  const cotiz = document.getElementById('cotizaciones-strip-inner');
  if (cotiz && cotiz.offsetParent) {
    const items = cotiz.querySelectorAll('.cotiz-item');
    let cotizText = 'Cotizaciones: ';
    items.forEach(item => {
      const label = item.querySelector('.cotiz-label')?.textContent?.trim();
      const price = item.querySelector('.cotiz-price')?.textContent?.trim();
      if (label && price) cotizText += `${label} ${price}. `;
    });
    speak(cotizText);
    return;
  }

  // Read visible fund cards
  const visibleCards = document.querySelectorAll('.fund-card');
  if (visibleCards.length > 0) {
    let cardsText = 'Rendimientos: ';
    let count = 0;
    visibleCards.forEach(card => {
      if (card.offsetParent === null || count >= 10) return;
      const name = card.querySelector('.fund-name')?.textContent?.trim();
      const rate = card.querySelector('.rate-value')?.textContent?.trim();
      const label = card.querySelector('.rate-label')?.textContent?.trim();
      if (name && rate) {
        cardsText += `${name}, ${rate} ${label || ''}. `;
        count++;
      }
    });
    if (count > 0) { speak(cardsText); return; }
  }

  // Read mundo cards
  const mundoCards = document.querySelectorAll('.mundo-card');
  if (mundoCards.length > 0) {
    let mundoText = 'Monitor Global: ';
    let count = 0;
    mundoCards.forEach(card => {
      if (card.offsetParent === null || count >= 12) return;
      const name = card.querySelector('.mundo-name')?.textContent?.trim();
      const price = card.querySelector('.mundo-price')?.textContent?.trim();
      const change = card.querySelector('.mundo-change')?.textContent?.trim();
      if (name && price) {
        mundoText += `${name} ${price}, ${change || ''}. `;
        count++;
      }
    });
    if (count > 0) { speak(mundoText); return; }
  }

  // Read hot movers
  const hotCards = document.querySelectorAll('.hot-card');
  if (hotCards.length > 0) {
    let hotText = 'Acciones con mayor movimiento: ';
    hotCards.forEach(card => {
      if (card.offsetParent === null) return;
      const symbol = card.querySelector('.hot-symbol')?.textContent?.trim();
      const price = card.querySelector('.hot-price')?.textContent?.trim();
      const change = card.querySelector('.hot-change')?.textContent?.trim();
      if (symbol) hotText += `${symbol} ${price || ''} ${change || ''}. `;
    });
    speak(hotText);
    return;
  }

  // Read table data
  const tables = document.querySelectorAll('.lecap-table, .soberanos-table');
  for (const table of tables) {
    if (table.offsetParent === null) continue;
    let tableText = 'Tabla de datos: ';
    const rows = table.querySelectorAll('tbody tr');
    let count = 0;
    rows.forEach(row => {
      if (count >= 8) return;
      const cells = row.querySelectorAll('td');
      if (cells.length > 0) {
        const ticker = cells[0]?.textContent?.trim();
        const lastCell = cells[cells.length - 1]?.textContent?.trim();
        tableText += `${ticker}, rendimiento ${lastCell}. `;
        count++;
      }
    });
    if (count > 0) { speak(tableText); return; }
  }

  // Fallback: read hero
  const hero = document.getElementById('hero');
  if (hero && hero.offsetParent) {
    speak(hero.textContent.trim());
  }
}

// Entity name → base64 data URI logo mapping
const ENTITY_LOGOS = {
  // Garantizados / Especiales (matched by item.nombre or item.id)
  "Banco Voii": "/logos/Banco_Voii.png",
  "Naranja X": "data:image/svg+xml;base64,PHN2ZyBpZD0iTGF5ZXJfMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSIwIDAgMTggMTgiIHN0eWxlPSJ3aWR0aDogNDBweDsgaGVpZ2h0OiA0MHB4OyI+PHJlY3Qgd2lkdGg9IjE4IiBoZWlnaHQ9IjE4IiBzdHlsZT0iZmlsbDogcmdiKDI1MCwgMjUwLCAyNTApOyIvPjxnPjxwYXRoIGQ9Ik0zLjAxLDEyLjM1di02LjdzLjA0LS4wOS4wOS0uMDloLjkzcy4wNS4wMS4wNy4wM2wzLjQsNC41M2MuMDUuMDcuMTUuMDMuMTUtLjA1di00LjQzcy4wNC0uMDkuMDktLjA5aDEuMDRzLjA5LjA0LjA5LjA5djYuN3MtLjA0LjA5LS4wOS4wOWgtLjkycy0uMDUtLjAxLS4wNy0uMDNsLTMuNC00LjUzYy0uMDUtLjA3LS4xNS0uMDMtLjE1LjA1djQuNDNzLS4wNC4wOS0uMDkuMDloLTEuMDVzLS4wOS0uMDQtLjA5LS4wOVoiIHN0eWxlPSJmaWxsOiByZ2IoMjU0LCA4MCwgMCk7Ii8+PGc+PHBhdGggZD0iTTEyLjcxLDguODJsLTIuMDQtMy4xNmMtLjA0LS4wNi0uMS0uMDktLjE3LS4wOWgtMS4zNnMtLjA3LjAzLS4wNy4wN2MwLC4wMSwwLC4wMi4wMS4wM2wyLjEyLDMuM3MuMDEuMDUsMCwuMDdsLTIuMTIsMy4yOXMtLjAxLjA3LjAyLjA5Yy4wMSwwLC4wMi4wMS4wNC4wMWgxLjM2Yy4wNywwLC4xMy0uMDMuMTctLjA5bDIuMDQtMy4xNWMuMDctLjExLjA3LS4yNiwwLS4zN2gwWiIgc3R5bGU9ImZpbGw6IHJnYigyNTQsIDgwLCAwKTsiLz48cGF0aCBkPSJNMTMuMTMsOS40NnMtLjA2LS4wNC0uMDktLjAyYzAsMC0uMDEuMDEtLjAyLjAybC0uNTYuODdjLS4xMS4xNy0uMTEuMzksMCwuNTVsLjk1LDEuNDdzLjA5LjA4LjE0LjA4aDEuNDFzLjA1LS4wMi4wNS0uMDVjMCwwLDAtLjAyLDAtLjAzbC0xLjg3LTIuODlaIiBzdHlsZT0iZmlsbDogcmdiKDgwLCAwLCAxMjcpOyIvPjxwYXRoIGQ9Ik0xMy4wMiw4LjUzcy4wNi4wNC4wOS4wMmMwLDAsLjAxLS4wMS4wMi0uMDJsMS44Ny0yLjg5czAtLjA2LS4wMi0uMDdjMCwwLS4wMiwwLS4wMywwaC0xLjQxYy0uMDYsMC0uMTEuMDMtLjE0LjA4bC0uOTUsMS40N2MtLjExLjE3LS4xMS4zOSwwLC41NWwuNTYuODZaIiBzdHlsZT0iZmlsbDogcmdiKDgwLCAwLCAxMjcpOyIvPjwvZz48L2c+PC9zdmc+",
  "Fiwind": "data:image/svg+xml;base64,PHN2ZyBpZD0iTGF5ZXJfMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSIwIDAgMTggMTgiIHN0eWxlPSJ3aWR0aDogNDBweDsgaGVpZ2h0OiA0MHB4OyI+PHJlY3Qgd2lkdGg9IjE4IiBoZWlnaHQ9IjE4IiBzdHlsZT0iZmlsbDogcmdiKDEwLCAxMCwgMTApOyIvPjxnPjxwYXRoIGQ9Ik03LjkyLDkuNThoLTEuNTdjLS4yLDAtLjM2LS4xNi0uMzYtLjM2cy4xNi0uMzYuMzYtLjM2aDEuNTdjLjIsMCwuMzYuMTYuMzYuMzZzLS4xNi4zNi0uMzYuMzZaTTYuMzYsNy45NmMtLjIsMC0uMzYtLjE2LS4zNi0uMzZzLjE2LS4zNi4zNi0uMzZoMi4wNWMuMiwwLC4zNi4xNi4zNi4zNnMtLjE2LjM2LS4zNi4zNmgtMi4wNVpNOC43LDExLjQ4Yy0uMTktLjA2LS4zLS4yNi0uMjQtLjQ1bDEuMS0zLjYxYy4wNi0uMTkuMjYtLjMuNDUtLjI0LjE5LjA2LjMuMjYuMjQuNDVsLTEuMSwzLjYxYy0uMDYuMTktLjI2LjMtLjQ1LjI0Wk0xMS44OSw3LjYzbC0xLjEsMy42MWMtLjA2LjE5LS4yNi4zLS40NS4yNC0uMTktLjA2LS4zLS4yNi0uMjQtLjQ1bDEuMS0zLjYxYy4wNi0uMTkuMjYtLjMuNDUtLjI0LjE5LjA2LjMuMjYuMjQuNDVaIiBzdHlsZT0iZmlsbDogcmdiKDIzOSwgMTgwLCAyOSk7Ii8+PHBhdGggZD0iTTksMTQuMDFjLTIuNzYsMC01LTIuMjUtNS01LjAxczIuMjQtNS4wMSw1LTUuMDEsNSwyLjI1LDUsNS4wMS0yLjI0LDUuMDEtNSw1LjAxWk05LDQuNjJjLTIuNDEsMC00LjM3LDEuOTYtNC4zNyw0LjM3czEuOTYsNC4zNyw0LjM3LDQuMzcsNC4zNy0xLjk2LDQuMzctNC4zNy0xLjk2LTQuMzctNC4zNy00LjM3WiIgc3R5bGU9ImZpbGw6IHJnYigyMzksIDE4MCwgMjkpOyIvPjwvZz48L3N2Zz4=",
  "Ualá": "data:image/svg+xml;base64,PHN2ZyBpZD0iTGF5ZXJfMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSIwIDAgMTggMTgiIHN0eWxlPSJ3aWR0aDogNDBweDsgaGVpZ2h0OiA0MHB4OyI+PHJlY3Qgd2lkdGg9IjE4IiBoZWlnaHQ9IjE4IiBzdHlsZT0iZmlsbDogcmdiKDIsIDQyLCAxNTUpOyIvPjxnIGlkPSJudWV2byI+PHBhdGggZD0iTTYuODEsMTIuMDVjLTEuODcsMC0zLjgtMS41Ny0zLjgtMy43MSwwLS41NS4zOS0xLjIxLDEuMTItMS4yMXMxLjA5LjQzLDEuMTQsMS4yMWMuMDksMS4yNC41OCwyLjE5LjY3LDIuMzgsMCwuMDEuMDEuMDIuMDEuMDMuMjkuNTkuODcuOTYsMS41Ny45Ni40NiwwLC44NS0uMTcsMS4xOS0uNDYtLjU5LjU3LTEuMjIuODEtMS45LjgxWiIgc3R5bGU9ImZpbGw6IHJnYigyNTUsIDI1NSwgMjU1KTsiLz48cGF0aCBkPSJNMTEuMjEsNS45NWMxLjg3LDAsMy44LDEuNTcsMy44LDMuNzEsMCwuNTUtLjM5LDEuMjEtMS4xMiwxLjIxcy0xLjA5LS40My0xLjE0LTEuMjFjLS4xLTEuMzQtLjY2LTIuMzUtLjY5LTIuNC0uMy0uNTctLjg5LS45Ni0xLjU3LS45Ni0uNDYsMC0uODUuMTctMS4xOS40Ni41OS0uNTcsMS4yMi0uODEsMS45LS44MVoiIHN0eWxlPSJmaWxsOiByZ2IoMjU1LCAyNTUsIDI1NSk7Ii8+PHBhdGggZD0iTTEyLjA2LDcuMjZjLS4zLS41Ny0uODktLjk1LTEuNTctLjk1LS40NiwwLS44NS4xNy0xLjE5LjQ2aDBjLTEuMzIsMS4xOS0yLjA3LDMuNDItMy4zNiwzLjk1LDAsLjAxLjAxLjAyLjAxLjAzLjI5LjU5Ljg3Ljk2LDEuNTcuOTYuNDYsMCwuODUtLjE3LDEuMTktLjQ2LDEuMzctMS4yMiwxLjk3LTMuMzUsMy4zNS0zLjk4WiIgc3R5bGU9ImZpbGw6IHJnYigyNTUsIDg4LCAxMTYpOyIvPjwvZz48L3N2Zz4=",
  "COCOS": "data:image/svg+xml;base64,PHN2ZyBpZD0iTGF5ZXJfMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSIwIDAgMTggMTgiIHN0eWxlPSJ3aWR0aDogNDBweDsgaGVpZ2h0OiA0MHB4OyI+PHJlY3Qgd2lkdGg9IjE4IiBoZWlnaHQ9IjE4IiBzdHlsZT0iZmlsbDogcmdiKDAsIDk4LCAyMjUpOyIvPjxnPjxwYXRoIGQ9Ik03LjQ5LDExLjYyYy0xLjM2LjAxLTIuNjEtLjY0LTMuMTgtMS44Mi0uMi0uNDMtLjMxLS45LS4zMS0xLjM3cy4xLS45NC4zMS0xLjM3Yy40MS0uOTEsMS4xMy0xLjY0LDIuMDMtMi4wN2wuNjYtLjMyLjY0LDEuMzMtLjY2LjMyYy0uNTguMjctMS4wNS43NS0xLjMzLDEuMzMtLjIyLjQ3LS4yMywxLjAyLS4wMSwxLjUuNDcuOTcsMS44NSwxLjI4LDMuMDcuNjlsLjY2LS4zMi42NCwxLjMzLS42Ni4zMmMtLjU4LjI4LTEuMjEuNDQtMS44Ni40NCIgc3R5bGU9ImZpbGw6IHJnYigyNTUsIDI1NSwgMjU1KTsiLz48cGF0aCBkPSJNMTEuMDgsMTMuMzRsLS42Ny0xLjMxLjY1LS4zNGMxLjItLjYyLDEuNzgtMS45MSwxLjI4LTIuODdzLTEuODgtMS4yNS0zLjA4LS42M2wtLjY1LjM0LS42Ny0xLjMxLjY1LS4zNGMxLjkzLTEsNC4yLS40Miw1LjA3LDEuMjYuODcsMS42OSwwLDMuODctMS45Miw0Ljg3bC0uNjUuMzRoMFoiIHN0eWxlPSJmaWxsOiByZ2IoMjU1LCAyNTUsIDI1NSk7Ii8+PC9nPjwvc3ZnPg==",
  "Supervielle": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxOCAxOCIgc3R5bGU9IndpZHRoOiA0MHB4OyBoZWlnaHQ6IDQwcHg7Ij48cmVjdCB4PSIwIiB5PSIwIiB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHN0eWxlPSJmaWxsOiByZ2IoMjUwLCAyNTAsIDI1MCk7Ii8+PGc+PHBhdGggZD0iTTMuNDMsMy41N2MuNzksMi4wOSwxLjcsNi4zMi0uNDMsMTAuOTgtLjAyLjA2LjA1LjExLjEzLjA2LDIuNTUtMS43LDQuNzctNC45Niw1LjUtNy42Mi0yLjUzLTEuMzItNC4wNi0yLjY5LTQuOTgtMy41Ni0uMTItLjEyLS4yNy4wMS0uMjIuMTRaIiBzdHlsZT0iZmlsbDogcmdiKDIzNywgMjgsIDM2KTsiLz48cGF0aCBkPSJNMTQuOSw5LjA1Yy0yLjExLS4zNC00LjE2LTEuMDQtNS41LTEuNjktLjc3LDIuMDctMi4yNyw0LjI5LTMuODMsNS44MS0uMDkuMDctLjAyLjIuMTIuMSwzLjM0LTIuMzYsNi44My0zLjQ5LDkuMjItMy45Ni4xMy0uMDMuMTMtLjIzLDAtLjI2WiIgc3R5bGU9ImZpbGw6IHJnYigxMzIsIDAsIDY1KTsiLz48L2c+PC9zdmc+",

  // FCI entities
  "Prex": "data:image/svg+xml;base64,PHN2ZyBpZD0iTGF5ZXJfMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayIgdmlld0JveD0iMCAwIDE4IDE4IiBzdHlsZT0id2lkdGg6IDQwcHg7IGhlaWdodDogNDBweDsiPjxkZWZzPjxtYXNrIGlkPSJtYXNrIiB4PSIzLjAxIiB5PSI1LjYxIiB3aWR0aD0iMTEuODgiIGhlaWdodD0iNi42NSIgbWFza1VuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PGcgaWQ9Im1hc2stMiIgZGF0YS1uYW1lPSJtYXNrIj48cmVjdCB4PSIzLjAxIiB5PSI1LjYxIiB3aWR0aD0iMTEuODgiIGhlaWdodD0iNi42NSIgc3R5bGU9ImZpbGw6IHJnYigyNTUsIDI1NSwgMjU1KTsiLz48cGF0aCBkPSJNMTQuODksNy44NWgtMy4xOGwuMywxLjUtLjMsMS41aDMuMTh2LS4wMmgtLjk0bC0uNTUtLjc2LjQ2LS42MSwxLjAzLDEuMzdNMTEuNzYsNy45MWguOTRsLjU1Ljc3LS40Ni42MS0xLjAzLTEuMzdoMFpNMTIuNjMsMTAuODRoLS44NmwyLjI3LTIuOTNoLjg1cy0yLjI2LDIuOTMtMi4yNiwyLjkzWiIvPjwvZz48L21hc2s+PC9kZWZzPjxyZWN0IHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgc3R5bGU9ImZpbGw6IHJnYig5MCwgODAsIDI0OSk7Ii8+PGc+PHBhdGggZD0iTTQuNjksOS4wM2MuMDksMCwuMTcsMCwuMjUtLjA0cy4xNS0uMDcuMjItLjEzYy4wNi0uMDYuMTEtLjEzLjE1LS4ycy4wNS0uMTYuMDUtLjI0LS4wMi0uMTctLjA1LS4yNGMtLjAzLS4wOC0uMDgtLjE1LS4xNS0uMi0uMDYtLjA2LS4xNC0uMS0uMjItLjEzcy0uMTctLjA0LS4yNS0uMDRoLS44NnYxLjI0aC44NlpNMy4wMSw3LjFoMS42OGMuOTEsMCwxLjUuNTYsMS41LDEuMzJzLS41OSwxLjMtMS41LDEuM2gtLjg2djEuMTJoLS44MXYtMy43NFoiIHN0eWxlPSJmaWxsOiByZ2IoMjU1LCAyNTUsIDI1NSk7Ii8+PHBhdGggZD0iTTYuNTEsOS4yNmMwLTEuNTQsMS40NS0xLjQ5LDEuOTktMS4zNmwtLjA5LjY5Yy0uNjUtLjE5LTEuMTQuMDktMS4xNC42djEuNjVoLS43N3YtMS41OFoiIHN0eWxlPSJmaWxsOiByZ2IoMjU1LCAyNTUsIDI1NSk7Ii8+PHBhdGggZD0iTTEwLjk0LDkuMDdjLS4wNS0uMTctLjE1LS4zMi0uMjktLjQyLS4xNC0uMTEtLjMyLS4xNi0uNS0uMTZzLS4zNS4wNi0uNS4xNmMtLjE0LjExLS4yNC4yNS0uMjkuNDJoMS41N1pNMTAuMTUsNy44NWMxLjAxLDAsMS43Mi44MSwxLjU2LDEuNzhoLTIuMzZjLjA0LjE4LjE1LjM1LjMxLjQ2cy4zNS4xNy41NC4xNmMuMTYsMCwuMzEtLjAzLjQ1LS4xMS4xNC0uMDcuMjUtLjE5LjMzLS4zMmwuNjMuMjdjLS4xNC4yNC0uMzUuNDUtLjYuNTktLjI1LjE0LS41NC4yMS0uODMuMi0uOTIsMC0xLjYyLS42Ni0xLjYyLTEuNTMsMC0uMi4wNC0uNC4xMi0uNTlzLjItLjM2LjM0LS41LjMyLS4yNS41Mi0uMzNjLjE5LS4wNy40LS4xMS42MS0uMTEiIHN0eWxlPSJmaWxsOiByZ2IoMjU1LCAyNTUsIDI1NSk7Ii8+PGcgc3R5bGU9Im1hc2s6IHVybCgmcXVvdDsjbWFzayZxdW90Oyk7Ij48cGF0aCBkPSJNMTIuODcsOS4zOWwtMS4xMS0xLjQ4aC45NGwuNjQuODkuNjUtLjg5aC44OWwtMS4xMSwxLjQ1LDEuMTEsMS40OGgtLjk0bC0uNjQtLjg5LS42NS44OWgtLjg5bDEuMTEtMS40NWgwWiIgc3R5bGU9ImZpbGw6IHJnYigyNTUsIDI1NSwgMjU1KTsiLz48L2c+PC9nPjwvc3ZnPg==",
  "ICBC": "data:image/svg+xml;base64,PHN2ZyBpZD0iTGF5ZXJfMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSIwIDAgMTggMTgiIHN0eWxlPSJ3aWR0aDogNDBweDsgaGVpZ2h0OiA0MHB4OyI+PHJlY3Qgd2lkdGg9IjE4IiBoZWlnaHQ9IjE4IiBzdHlsZT0iZmlsbDogcmdiKDI1MCwgMjUwLCAyNTApOyIvPjxnPjxwYXRoIGlkPSJMYXllciIgZD0iTTMuMDEsOS4wMWMwLTMuMzMsMi42OC02LjAxLDYuMDEtNi4wMXM1Ljk5LDIuNjgsNS45OSw2LjAxLTIuNyw1Ljk5LTUuOTksNS45OS02LjAxLTIuNy02LjAxLTUuOTlaTTMuOSw5LjAxYzAsLjY4LjEyLDEuMzMuMzksMS45Ni4yNy42LjYzLDEuMTgsMS4xMSwxLjY0LjQ4LjQ4LDEuMDQuODcsMS42NywxLjExLjYuMjcsMS4yOC4zOSwxLjk2LjM5LDIuNzgsMCw1LjA1LTIuMjcsNS4wNS01LjA5cy0yLjI3LTUuMTItNS4wNS01LjEyYy0uNjgsMC0xLjM1LjE0LTEuOTYuMzktLjYzLjI3LTEuMTguNjMtMS42NywxLjExcy0uODUsMS4wNC0xLjExLDEuNjdjLS4yNy42LS4zOSwxLjI4LS4zOSwxLjk2aDBaIiBzdHlsZT0iZmlsbDogcmdiKDE4NCwgMzAsIDQ1KTsgZmlsbC1ydWxlOiBldmVub2RkOyIvPjxwYXRoIGlkPSJMYXllci0yIiBkYXRhLW5hbWU9IkxheWVyIiBkPSJNNS44MiwxMi4yaDIuOTJ2LS44NWgtMi4wOHYtMS4wMWgxLjg2di0yLjY2aC0xLjg2di0xLjAxaDIuMDh2LS44NWgtMi45MnYyLjc1aDEuODZ2Ljk0aC0xLjg2djIuNjhaTTEyLjIsOS40OWgtMS45MXYtLjk0aDEuOTF2LTIuNzVoLTIuOTV2Ljg1aDIuMXYxLjAxaC0xLjkxdjIuNjhoMS45MXYxLjAxaC0yLjF2Ljg1aDIuOTV2LTIuN1oiIHN0eWxlPSJmaWxsOiByZ2IoMTg0LCAzMCwgNDUpOyBmaWxsLXJ1bGU6IGV2ZW5vZGQ7Ii8+PC9nPjwvc3ZnPg==",
  "Adcap": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyOCAyOCIgc3R5bGU9IndpZHRoOiA0MHB4OyBoZWlnaHQ6IDQwcHg7Ij48cmVjdCB3aWR0aD0iMjgiIGhlaWdodD0iMjgiLz48Zz48cGF0aCBkPSJNMTMuMzQsMTguNjlsLTEuMDMtMi4wOWgtNS4zMWwtMS4wMywyLjA5aC0xLjQ2bDQuNDEtOC45OWgxLjYxbDQuMzQsOC45OWgtMS41MlpNOC45NywxMi41NmwtMS4zLDIuNzFoNC4wMWwtMS4zNC0yLjczYy0uMTMtLjI0LS4yNC0uNDktLjMzLS43LS4xMy0uMjItLjIyLS40OS0uMzMtLjczLS4xMy4yNy0uMjIuNTEtLjMzLjc2LS4xMy4yMi0uMjQuNDYtLjM3LjdaIiBmaWxsPSIjZmZmIi8+PHBhdGggZD0iTTIyLjQ4LDkuMTl2OS41aC0xLjN2LTEuMTVjLS4xOC4yMi0uNDIuNDItLjc2LjY0LS4zMy4xOC0uNy4zNy0xLjEyLjQ5LS40Mi4xMy0uODUuMTgtMS4zLjE4LS44MiwwLTEuNTItLjE1LTIuMTItLjQ2cy0xLjA2LS43LTEuMzktMS4yNWMtLjMzLS41MS0uNDktMS4xMi0uNDktMS44M3MuMTgtMS4yOC41MS0xLjgzYy4zMy0uNTEuODItLjk0LDEuNDMtMS4yNXMxLjMtLjQ2LDIuMTItLjQ2Yy43LDAsMS4zLjEzLDEuODUuMzMuNTUuMjIuOTcuNDksMS4yNS43OXYtMy43NGgxLjM0bC0uMDIuMDNaTTE4LjI5LDE3LjZjLjU4LDAsMS4xLS4wOSwxLjU1LS4zMS40Mi0uMjIuNzktLjQ5LDEuMDMtLjgycy4zNy0uNzMuMzctMS4xNS0uMTMtLjgyLS4zNy0xLjE1LS41OC0uNjEtMS4wMy0uODJjLS40Mi0uMTgtLjk0LS4zMS0xLjU1LS4zMXMtMS4xLjA5LTEuNTIuMzFjLS40Ni4xOC0uNzkuNDYtMS4wMy44Mi0uMjQuMzMtLjM3LjczLS4zNywxLjE1cy4xMy44Mi4zNywxLjE1Yy4yNC4zMy42MS42MSwxLjAzLjgyLjQyLjIyLjk0LjMxLDEuNTIuMzFaIiBmaWxsPSIjZmZmIi8+PC9nPjwvc3ZnPg==",
  "IEB+": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyOCAyOCIgc3R5bGU9IndpZHRoOiA0MHB4OyBoZWlnaHQ6IDQwcHg7Ij48cmVjdCB3aWR0aD0iMjgiIGhlaWdodD0iMjgiIHN0eWxlPSJmaWxsOiByZ2IoMTAsIDEwLCAxMCk7Ii8+PGc+PHBhdGggZD0iTTIzLjc5LDguNDdoLTUuODZjLS4wNiwwLS4wOS4wMy0uMTMuMDZsLTIuNTYsMi41M2MtLjA2LjA2LS4wNi4xMy0uMDMuMTguMDMuMDYuMDkuMTMuMTUuMTNoNC41NHY3Ljk4YzAsLjA2LjAzLjEzLjEzLjE1aC4wNnMuMDktLjAzLjEzLS4wNmwzLjctMy43cy4wNi0uMDkuMDYtLjEzdi02Ljk3Yy0uMDMtLjEyLS4xMi0uMTgtLjIxLS4xOFpNMjMuNiw4Ljh2Mi4xNmgtMy4zNXYtMi4xNmgzLjM1Wk0xNS44LDExbDIuMTktMi4xNmgxLjg4djIuMTZoLTQuMDZaTTIwLjI3LDE4Ljkydi03LjU4aDMuMzV2NC4yM2wtMy4zNSwzLjM1WiIgc3R5bGU9ImZpbGw6IHJnYigyNTUsIDI1NSwgMjU1KTsiLz48cGF0aCBkPSJNNCwxOS41MXYtNi4zOWgxLjQ1djYuNDFoLTEuNDV2LS4wM1oiIHN0eWxlPSJmaWxsOiByZ2IoMjU1LCAyNTUsIDI1NSk7Ii8+PHBhdGggZD0iTTYuNzQsMTMuMTJoNC44NXYxLjIzaC0zLjM5djEuM2gzLjJ2MS4yM2gtMy4ydjEuNDFoMy4zOXYxLjIzaC00Ljg1di02LjQxWiIgc3R5bGU9ImZpbGw6IHJnYigyNTUsIDI1NSwgMjU1KTsiLz48cGF0aCBkPSJNMTIuNjIsMTkuNTF2LTYuMzloMy4zYzEuMjEsMCwyLjAxLjc1LDIuMDEsMS43OSwwLC41NS0uMjIuOTUtLjU5LDEuMjMuNDkuMjguODQuNzcuODQsMS41MiwwLDEuMTEtLjg0LDEuODgtMi4wNywxLjg4aC0zLjQ4di0uMDNaTTE1Ljg0LDE1LjYxYy40LDAsLjY0LS4yMi42NC0uNjQsMC0uNC0uMjItLjY0LS42NC0uNjRoLTEuNzJ2MS4zaDEuNzJaTTE1Ljk1LDE4LjI3Yy41NSwwLC43NS0uMzEuNzUtLjc1LDAtLjQtLjIyLS43NS0uNzUtLjc1aC0xLjg4djEuNDVoMS44OHYuMDRaIiBzdHlsZT0iZmlsbDogcmdiKDI1NSwgMjU1LCAyNTUpOyIvPjwvZz48L3N2Zz4=",
  "Balanz": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyOCAyOCIgc3R5bGU9IndpZHRoOiA0MHB4OyBoZWlnaHQ6IDQwcHg7Ij48cmVjdCB3aWR0aD0iMjgiIGhlaWdodD0iMjgiIHN0eWxlPSJmaWxsOiByZ2IoMTMsIDMyLCA4NSk7Ii8+PGcgaWQ9IkdydXBvXzU1NiI+PHBhdGggaWQ9IlRyYXphZG9fMTM2NyIgZD0iTTExLjQzLDE4LjY2aDMuMzVjMS4yMywwLDIuMzQtLjM5LDIuMzQtMS45cy0uOTUtMi4wNi0yLjI5LTIuMDZoLTMuNHYzLjk2Wk0xMS40MywxMi42M2gzLjE4YzEuMTIsMCwxLjk1LS41LDEuOTUtMS43MywwLTEuMzQtMS4wNi0xLjYyLTIuMTgtMS42MmgtMi45NnYzLjM1Wk04LjI1LDYuODNoNi43NWMyLjczLDAsNC41Ny44OSw0LjU3LDMuNTcuMDYsMS4yOC0uNzMsMi41MS0xLjk1LDMuMDEsMS42Mi4zOSwyLjczLDEuOTUsMi42MiwzLjYzLDAsMi45LTIuNDUsNC4xMy01LjA0LDQuMTNoLTYuOTJWNi44M1oiIHN0eWxlPSJmaWxsOiByZ2IoMjU1LCAyNTUsIDI1NSk7Ii8+PC9nPjwvc3ZnPg==",
  "Galicia": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxOCAxOCIgc3R5bGU9IndpZHRoOiA0MHB4OyBoZWlnaHQ6IDQwcHg7Ij48ZyBjbGlwLXBhdGg9InVybCgjYSkiPjxwYXRoIGZpbGw9IiNFODZFMkMiIGQ9Ik0wIDBoMTh2MThIMFYwWiIvPjxwYXRoIGZpbGw9IiNmZmYiIGQ9Ik0xMS42ODYgNi40NDhhLjA2MS4wNjEgMCAwIDEtLjAzNi0uMDEyIDIuMTk3IDIuMTk3IDAgMCAwLS40NTctLjE4NGMtLjM1LS4xMDYtLjk2LS4yMzctMS44OTUtLjI2LjA1My45OTkuMjMgMS41NzcuMzMyIDEuODMybC4wMTMuMDMxYy4wNTkuMTM4LjIyNC40NjYuNDgzLjU0MmEuMDYyLjA2MiAwIDAgMSAuMDQyLjA3NGwtMS4xMDMgNy41MDRhLjA2My4wNjMgMCAwIDEtLjA2Mi4wNTQuMDYzLjA2MyAwIDAgMS0uMDYyLS4wNTRsLTEuMTA4LTcuNWEuMDYyLjA2MiAwIDAgMSAuMDQxLS4wNzhjLjI1OC0uMDc1LjQyMy0uNDAyLjQ4MS0uNTM4LjEwNy0uMjYuMjkxLS44NDIuMzQ2LTEuODY4LS45MzUuMDIzLTEuNTQ1LjE1NC0xLjg5NC4yNjFhMi4wMyAyLjAzIDAgMCAwLS40NTcuMTg2LjA2LjA2IDAgMCAxLS4wMjIuMDA5Ljc0NC43NDQgMCAxIDEtLjAxNC0xLjQ4NmMuMDAzIDAgLjAwNyAwIC4wMTEuMDAyYS4wNjMuMDYzIDAgMCAxIC4wMjUuMDA5cy4xNC4wODguNDU2LjE4NWMuMzUxLjEwOC45NjYuMjQgMS45MDguMjYyLS4wMjQtLjkzNi0uMTU1LTEuNTQ0LS4yNjItMS44OTFhMi4xMDQgMi4xMDQgMCAwIDAtLjE4Ni0uNDU0LjA2LjA2IDAgMCAxLS4wMDUtLjA0OS43MzUuNzM1IDAgMCAxIC40NTYtLjY2OC43MzUuNzM1IDAgMCAxIC4yODQtLjA1Ni43Mi43MiAwIDAgMSAuNzQuNzMyLjA2OC4wNjggMCAwIDEtLjAxLjA0NiAyIDIgMCAwIDAtLjE4Mi40NWMtLjEwNy4zNDctLjIzOC45NTUtLjI2MyAxLjg5Ljk0MS0uMDIyIDEuNTU0LS4xNTIgMS45MDUtLjI1OS4yODctLjA4OC40MjgtLjE2OC40NTYtLjE4NWEuMDYyLjA2MiAwIDAgMSAuMDQtLjAxNC43NDUuNzQ1IDAgMCAxIDAgMS40ODdaIi8+PC9nPjxkZWZzPjxjbGlwUGF0aCBpZD0iYSI+PHBhdGggZmlsbD0iI2ZmZiIgZD0iTTAgMGgxOHYxOEgweiIvPjwvY2xpcFBhdGg+PC9kZWZzPjwvc3ZnPg==",
  "Cocos Ahorro": "data:image/svg+xml;base64,PHN2ZyBpZD0iTGF5ZXJfMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSIwIDAgMTggMTgiIHN0eWxlPSJ3aWR0aDogNDBweDsgaGVpZ2h0OiA0MHB4OyI+PHJlY3Qgd2lkdGg9IjE4IiBoZWlnaHQ9IjE4IiBzdHlsZT0iZmlsbDogcmdiKDAsIDk4LCAyMjUpOyIvPjxnPjxwYXRoIGQ9Ik03LjQ5LDExLjYyYy0xLjM2LjAxLTIuNjEtLjY0LTMuMTgtMS44Mi0uMi0uNDMtLjMxLS45LS4zMS0xLjM3cy4xLS45NC4zMS0xLjM3Yy40MS0uOTEsMS4xMy0xLjY0LDIuMDMtMi4wN2wuNjYtLjMyLjY0LDEuMzMtLjY2LjMyYy0uNTguMjctMS4wNS43NS0xLjMzLDEuMzMtLjIyLjQ3LS4yMywxLjAyLS4wMSwxLjUuNDcuOTcsMS44NSwxLjI4LDMuMDcuNjlsLjY2LS4zMi42NCwxLjMzLS42Ni4zMmMtLjU4LjI4LTEuMjEuNDQtMS44Ni40NCIgc3R5bGU9ImZpbGw6IHJnYigyNTUsIDI1NSwgMjU1KTsiLz48cGF0aCBkPSJNMTEuMDgsMTMuMzRsLS42Ny0xLjMxLjY1LS4zNGMxLjItLjYyLDEuNzgtMS45MSwxLjI4LTIuODdzLTEuODgtMS4yNS0zLjA4LS42M2wtLjY1LjM0LS42Ny0xLjMxLjY1LS4zNGMxLjkzLTEsNC4yLS40Miw1LjA3LDEuMjYuODcsMS42OSwwLDMuODctMS45Miw0Ljg3bC0uNjUuMzRoMFoiIHN0eWxlPSJmaWxsOiByZ2IoMjU1LCAyNTUsIDI1NSk7Ii8+PC9nPjwvc3ZnPg==",
  "Cocos": "data:image/svg+xml;base64,PHN2ZyBpZD0iTGF5ZXJfMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSIwIDAgMTggMTgiIHN0eWxlPSJ3aWR0aDogNDBweDsgaGVpZ2h0OiA0MHB4OyI+PHJlY3Qgd2lkdGg9IjE4IiBoZWlnaHQ9IjE4IiBzdHlsZT0iZmlsbDogcmdiKDAsIDk4LCAyMjUpOyIvPjxnPjxwYXRoIGQ9Ik03LjQ5LDExLjYyYy0xLjM2LjAxLTIuNjEtLjY0LTMuMTgtMS44Mi0uMi0uNDMtLjMxLS45LS4zMS0xLjM3cy4xLS45NC4zMS0xLjM3Yy40MS0uOTEsMS4xMy0xLjY0LDIuMDMtMi4wN2wuNjYtLjMyLjY0LDEuMzMtLjY2LjMyYy0uNTguMjctMS4wNS43NS0xLjMzLDEuMzMtLjIyLjQ3LS4yMywxLjAyLS4wMSwxLjUuNDcuOTcsMS44NSwxLjI4LDMuMDcuNjlsLjY2LS4zMi42NCwxLjMzLS42Ni4zMmMtLjU4LjI4LTEuMjEuNDQtMS44Ni40NCIgc3R5bGU9ImZpbGw6IHJnYigyNTUsIDI1NSwgMjU1KTsiLz48cGF0aCBkPSJNMTEuMDgsMTMuMzRsLS42Ny0xLjMxLjY1LS4zNGMxLjItLjYyLDEuNzgtMS45MSwxLjI4LTIuODdzLTEuODgtMS4yNS0zLjA4LS42M2wtLjY1LjM0LS42Ny0xLjMxLjY1LS4zNGMxLjkzLTEsNC4yLS40Miw1LjA3LDEuMjYuODcsMS42OSwwLDMuODctMS45Miw0Ljg3bC0uNjUuMzRoMFoiIHN0eWxlPSJmaWxsOiByZ2IoMjU1LCAyNTUsIDI1NSk7Ii8+PC9nPjwvc3ZnPg==",
  "Claro Pay": "data:image/svg+xml;base64,PHN2ZyBpZD0iTGF5ZXJfMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSIwIDAgMTggMTgiIHN0eWxlPSJ3aWR0aDogNDBweDsgaGVpZ2h0OiA0MHB4OyI+PHJlY3Qgd2lkdGg9IjE4IiBoZWlnaHQ9IjE4IiBzdHlsZT0iZmlsbDogcmdiKDI1MCwgMjUwLCAyNTApOyIvPjxnPjxwYXRoIGQ9Ik0xMS44NCw1LjA5bC0yLjg1LDIuODYuNzUuNzUsMi44NS0yLjg2LS43NS0uNzVaIiBzdHlsZT0iZmlsbDogcmdiKDIzNSwgNTksIDQ3KTsiLz48cGF0aCBkPSJNNy43NCw0LjVoLTEuMDZ2My4wNmgxLjA2di0zLjA2WiIgc3R5bGU9ImZpbGw6IHJnYigyMzUsIDU5LCA0Nyk7Ii8+PHBhdGggZD0iTTcuMDcsOC41MmMtLjY3LDAtMS4yNS4yNC0xLjczLjczLS40OS40OS0uNzMsMS4wOC0uNzMsMS43NnMuMjQsMS4yOC43MywxLjc1Yy40OC40OSwxLjA2Ljc0LDEuNzMuNzRzMS4yNi0uMjUsMS43NS0uNzRjLjQ4LS40OC43Mi0xLjA3LjcyLTEuNzVzLS4yNC0xLjI4LS43Mi0xLjc2Yy0uNDktLjQ5LTEuMDgtLjczLTEuNzUtLjczWk03Ljk5LDExLjkzYy0uMjUuMjYtLjU2LjM4LS45Mi4zOHMtLjY2LS4xMy0uOTEtLjM4Yy0uMjUtLjI2LS4zOS0uNTctLjM5LS45MnMuMTQtLjY4LjM5LS45M2MuMjUtLjI2LjU2LS4zOS45MS0uMzguMzYtLjAxLjY3LjExLjkzLjM4LjI0LjI1LjM3LjU2LjM4LjkzLS4wMi4zNS0uMTQuNjYtLjM5LjkyWiIgc3R5bGU9ImZpbGw6IHJnYigyMzUsIDU5LCA0Nyk7Ii8+PHBhdGggZD0iTTEzLjM5LDEwLjJ2LS4zMWgtMy4xM3YxLjA2aDMuMTN2LS43NFoiIHN0eWxlPSJmaWxsOiByZ2IoMjM1LCA1OSwgNDcpOyIvPjwvZz48L3N2Zz4=",
  "SBS": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB2aWV3Qm94PSIwIDAgMjggMjgiIHN0eWxlPSJ3aWR0aDogNDBweDsgaGVpZ2h0OiA0MHB4OyI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJsaW5lYXItZ3JhZGllbnQiIHgxPSI2LjkzIiB5MT0iOC45MyIgeDI9IjIxLjA3IiB5Mj0iMjMuMDciIGdyYWRpZW50VHJhbnNmb3JtPSJ0cmFuc2xhdGUoMCAzMCkgc2NhbGUoMSAtMSkiIGdyYWRpZW50VW5pdHM9InVzZXJTcGFjZU9uVXNlIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiNhMDZhMjgiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNmZGRlOGEiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iMjgiIGhlaWdodD0iMjgiLz48Zz48Zz48cGF0aCBkPSJNMTEuMDgsMTUuMDNjMC0uMTUtLjA2LS4yOS0uMTgtLjM4cy0uMzItLjE4LS42Mi0uMjZjLS4yOS0uMDktLjUzLS4xOC0uNy0uMjktLjQ3LS4yNi0uNy0uNTktLjctMS4wMywwLS4yMy4wNi0uNDEuMTgtLjU5cy4yOS0uMzIuNTMtLjQxLjUtLjE1Ljc5LS4xNS41Ni4wNi43OS4xNWMuMjMuMTIuNDEuMjYuNTMuNDQuMTIuMjEuMjEuNDEuMjEuNjhoLS44NWMwLS4xOC0uMDYtLjMyLS4xOC0uNDRzLS4yOS0uMTUtLjUtLjE1LS4zOC4wNi0uNS4xNWMtLjEyLjA5LS4xOC4yMS0uMTguMzVzLjA2LjIzLjIxLjM1Yy4xNS4wOS4zMi4xOC41OS4yNi41LjE1Ljg1LjMyLDEuMDYuNTMuMjMuMjEuMzIuNS4zMi43OSwwLC4zNS0uMTUuNjUtLjQxLjg1cy0uNjUuMjktMS4wOS4yOWMtLjMyLDAtLjYyLS4wNi0uODgtLjE4LS4yNi0uMTItLjQ3LS4yNi0uNTktLjQ3cy0uMjEtLjQ0LS4yMS0uN2guODVjMCwuNDcuMjYuNjguODIuNjguMjEsMCwuMzUtLjAzLjQ3LS4xMi4xOC0uMDkuMjMtLjIxLjIzLS4zNVoiIGZpbGw9IiNmZmYiLz48cGF0aCBkPSJNMTIuNTIsMTYuMTF2LTQuMTRoMS40NGMuNSwwLC44OC4wOSwxLjE1LjI5cy4zOC40Ny4zOC44NWMwLC4yMS0uMDYuMzgtLjE1LjUzLS4xMi4xNS0uMjMuMjYtLjQ0LjM1LjIxLjA2LjM4LjE1LjUuMzIuMTIuMTUuMTguMzUuMTguNTksMCwuNDEtLjEyLjctLjM4LjkxLS4yNi4yMS0uNjIuMzItMS4wOS4zMmgtMS41OXYtLjAzWk0xMy4zNywxMy43MWguNjJjLjQ0LDAsLjY1LS4xOC42NS0uNTMsMC0uMTgtLjA2LS4zMi0uMTgtLjQxLS4xMi0uMDktLjI5LS4xMi0uNTMtLjEyaC0uNTl2MS4wNmguMDNaTTEzLjM3LDE0LjI5djEuMTJoLjczYy4yMSwwLC4zNS0uMDYuNDctLjE1LjEyLS4wOS4xOC0uMjMuMTgtLjM4LDAtLjM4LS4yMS0uNTYtLjU5LS41OWgtLjc5WiIgZmlsbD0iI2ZmZiIvPjxwYXRoIGQ9Ik0xOC4zNiwxNS4wM2MwLS4xNS0uMDYtLjI5LS4xOC0uMzgtLjEyLS4wOS0uMzItLjE4LS42Mi0uMjYtLjI5LS4wOS0uNTMtLjE4LS43LS4yOS0uNDctLjI2LS43LS41OS0uNy0xLjAzLDAtLjIzLjA2LS40MS4xOC0uNTkuMTItLjE4LjI5LS4zMi41My0uNDFzLjUtLjE1Ljc5LS4xNS41Ni4wNi43OS4xNWMuMjMuMTIuNDEuMjYuNTMuNDQuMTIuMjEuMjEuNDEuMjEuNjhoLS44NWMwLS4xOC0uMDYtLjMyLS4xOC0uNDQtLjEyLS4xMi0uMjktLjE1LS41LS4xNXMtLjM4LjA2LS41LjE1LS4xOC4yMS0uMTguMzUuMDYuMjMuMjEuMzVjLjE1LjA5LjMyLjE4LjU5LjI2LjUuMTUuODUuMzIsMS4wNi41My4yMy4yMS4zMi41LjMyLjc5LDAsLjM1LS4xNS42NS0uNDEuODVzLS42NS4yOS0xLjA5LjI5Yy0uMzIsMC0uNjItLjA2LS44OC0uMTgtLjI2LS4xMi0uNDctLjI2LS41OS0uNDctLjE1LS4yMS0uMjEtLjQ0LS4yMS0uN2guODVjMCwuNDcuMjYuNjguODIuNjguMjEsMCwuMzUtLjAzLjQ3LS4xMi4xOC0uMDkuMjMtLjIxLjIzLS4zNVoiIGZpbGw9IiNmZmYiLz48L2c+PHBhdGggZD0iTTEzLjk5LDMuOTl2MS43M2MyLjIsMCw0LjI5Ljg1LDUuODQsMi40NHMyLjQ0LDMuNjQsMi40NCw1Ljg0LS44NSw0LjI5LTIuNDQsNS44NC0zLjY0LDIuNDQtNS44NCwyLjQ0LTQuMjktLjg1LTUuODQtMi40NC0yLjQxLTMuNjQtMi40MS01Ljg0Ljg1LTQuMjksMi40NC01Ljg0YzEuNTYtMS41NiwzLjY0LTIuNDQsNS44NC0yLjQ0di0xLjczTTEzLjk5LDMuOTljLTUuNTIsMC05Ljk5LDQuNDktOS45OSwxMC4wMXM0LjQ5LDEwLjAxLDEwLjAxLDEwLjAxLDkuOTktNC40OSw5Ljk5LTEwLjAxUzE5LjUxLDMuOTksMTMuOTksMy45OWgwWiIgZmlsbD0idXJsKCNsaW5lYXItZ3JhZGllbnQpIi8+PC9nPjwvc3ZnPg==",
  "Delta": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyOCAyOCIgc3R5bGU9IndpZHRoOiA0MHB4OyBoZWlnaHQ6IDQwcHg7Ij48cmVjdCB3aWR0aD0iMjgiIGhlaWdodD0iMjgiIGZpbGw9IiMwOTQxYTUiLz48cGF0aCBkPSJNMTcuODcsOS43M2MtMS4yMS4zLTIuNDMuNi0zLjY0LjktMi4zNC41OC00LjY5LDEuMTUtNy4wMiwxLjc2LS41My4xNC0uNzEuMDYtLjctLjUxLjAyLTEuNTkuMDItMy4xOCwwLTQuNzcsMC0uNS4xOC0uNjMuNjUtLjYyLDIuNDkuMDIsNC45OC0uMDIsNy40Ny4wMiwzLjQ0LjA1LDYuMywyLjY2LDYuNzgsNi4xMi4zNiwyLjY0LS4xOSw1LTIuMTIsNi45Mi0xLjI4LDEuMjgtMi44OCwxLjkxLTQuNjcsMS45NC0yLjQuMDQtNC44LjAxLTcuMTksMC0uMTksMC0uMzgtLjEtLjU2LS4xNS4xLS4xOS4xNy0uNDEuMzEtLjU2LDMuNDUtMy40Niw2LjkxLTYuOTIsMTAuMzYtMTAuMzguMTYtLjE2LjMtLjM1LjQ2LS41Mi0uMDMtLjA1LS4wNy0uMS0uMS0uMTZaIiBmaWxsPSIjZmZmIi8+PC9zdmc+",
  "Carrefour Banco": "https://api.argentinadatos.com/static/logos/carrefour-banco.png",
  "Mercado Fondo": "https://api.argentinadatos.com/static/logos/mercado-pago.png",
  "LB Finanzas": "data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyBpZD0iTGF5ZXJfMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSIwIDAgMTggMTgiPgogIDxyZWN0IHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgc3R5bGU9ImZpbGw6ICM1MjIzOTg7Ii8+CiAgPGc+CiAgICA8cGF0aCBkPSJNNi43MSw3Ljc3bC4zOS40OWMuNTIuNjQsMS4xMS45NiwxLjc1Ljk2LDEuMTksMCwyLjI3LTEuMTIsMi4zOS0xLjMxLDAsLjAyLDAsMCwuMDMtLjA1LTEuNDUtLjkyLTIuODktMS44NC00LjMzLTIuNzctLjI0LS4xNS0uNDgtLjIzLS43Mi0uMDUtLjI0LjE5LS4yMi40My0uMTQuNy4yMi42OC40MywxLjM1LjYzLDIuMDNaIiBzdHlsZT0iZmlsbDogI2ZmZjsiLz4KICAgIDxwYXRoIGQ9Ik0xMiw5LjExYzAsLjM2LS4yLjctLjUxLjg4LTEuNDcuOTUtMi45NiwxLjg5LTQuNDMsMi44NC0uMDcuMDUtLjE0LjA5LS4yMi4xNC0uMTguMTQtLjQ0LjE0LS42MiwwLS4xOS0uMTQtLjI2LS4zOS0uMTgtLjYxLjExLS40LjIzLS43OS4zNi0xLjE5LjE4LS41Ny4zOC0xLjEyLjUtMS43LjA3LS4zLjA3LS42MSwwLS45MSwyLjExLDIuNTksNC42OS0uMzYsNC41OS0uNDMuMzQuMjIuNTEuNTMuNTEuOThaIiBzdHlsZT0iZmlsbDogI2ZmZjsiLz4KICA8L2c+Cjwvc3ZnPg==",
  "Pellegrini": "data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyBpZD0iTGF5ZXJfMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSIwIDAgMTggMTgiPgogIDxyZWN0IHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgc3R5bGU9ImZpbGw6ICMwMDVmODY7Ii8+CiAgPGc+CiAgICA8cGF0aCBkPSJNOSw0Yy0yLjc2LDAtNSwyLjI0LTUsNXMyLjI0LDUsNSw1LDUtMi4yNCw1LTUtMi4yNC01LTUtNVpNMTEuODIsMTEuOXMwLC4wMS0uMDEuMDFoLTUuNnMtLjAxLDAtLjAxLS4wMXYtLjU2czAtLjAxLjAxLS4wMWg1LjZzLjAxLDAsLjAxLjAxdi41NmgwWk04LjA0LDEwLjQzdi0yLjg0aC42NHYyLjg0aC42M3YtMi44NGguNjR2Mi44NGguNjR2LTIuODRoLjY0djIuODRoLjI5di41OHMwLC4wMS0uMDEuMDFoLTUuMDJzLS4wMSwwLS4wMS0uMDF2LS41OGguMjh2LTIuODRoLjY0djIuODRoLjY0LDBaTTEyLjAxLDYuOTlsLS4xOC4zMXMtLjAyLjAyLS4wMy4wMmgtNS41OXMtLjAyLDAtLjAzLS4wMmwtLjE4LS4zMXMwLS4wMiwwLS4wM2wyLjk4LTEuNThzLjAzLDAsLjA0LDBsMi45OCwxLjU4cy4wMS4wMiwwLC4wM2gwWiIgc3R5bGU9ImZpbGw6ICNmZmY7Ii8+CiAgICA8cGF0aCBkPSJNMTAuNDQsNi43OGwtMS40LS42OHMtLjAyLS4wMS0uMDMtLjAxYzAsMC0uMDIsMC0uMDMsMGwtMS40Mi42OXMwLDAsMCwwaDIuODhzLjAxLDAsMCwwWiIgc3R5bGU9ImZpbGw6ICNmZmY7Ii8+CiAgPC9nPgo8L3N2Zz4=",
};

// Lookup logo for garantizados/especiales by nombre
function getLogoForItem(item) {
  // Direct match by nombre
  if (ENTITY_LOGOS[item.nombre]) return ENTITY_LOGOS[item.nombre];
  // Match Ualá variants
  if (item.nombre && item.nombre.startsWith('Ualá')) return ENTITY_LOGOS['Ualá'];
  // Match COCOS
  if (item.nombre && item.nombre.toUpperCase() === 'COCOS') return ENTITY_LOGOS['COCOS'];
  return null;
}

// Lookup logo for FCI by entidad
function getLogoForEntity(entidad) {
  if (ENTITY_LOGOS[entidad]) return ENTITY_LOGOS[entidad];
  // Try partial matches
  const lower = entidad.toLowerCase();
  if (lower.includes('cocos')) return ENTITY_LOGOS['Cocos'];
  if (lower.includes('fiwind')) return ENTITY_LOGOS['Fiwind'];
  if (lower.includes('mercado')) return ENTITY_LOGOS['Mercado Fondo'];
  if (lower.includes('pellegrini') || lower.includes('nacion') || lower.includes('nación')) return ENTITY_LOGOS['Pellegrini'];
  return null;
}

async function init() {
  const config = await fetch('/api/config').then(r => r.json());

  const mainList = document.getElementById('main-list');
  mainList.innerHTML = `<div class="loading"><div class="loading-spinner"></div><p>Cargando rendimientos...</p></div>`;

  // Fetch FCI data from ArgentinaDatos (via our serverless function)
  const activeFcis = config.fcis.filter(i => i.activo);
  const fciResults = await fetchFCIData(activeFcis);

  // Build garantizados cards data
  const garantizadosCards = config.garantizados.filter(i => i.activo).map(item => ({
    tna: item.tna,
    nombre: item.nombre,
    logoSrc: getLogoForItem(item),
    logo: item.logo,
    logoBg: item.logo_bg,
    card: createCard({
      logo: item.logo, logoBg: item.logo_bg, logoSrc: getLogoForItem(item),
      name: item.nombre,
      tags: [
        { text: 'Billetera', type: 'billetera' },
        ...(item.tipo && item.tipo !== 'Billetera' && item.tipo !== 'Cuenta Remunerada' ? [{ text: item.tipo, type: 'type' }] : []),
        { text: item.limite === 'Sin Límites' ? 'Sin Límites' : `Límite: ${item.limite}`, type: item.limite === 'Sin Límites' ? 'limit no-limit' : 'limit' }
      ],
      rate: `${item.tna.toFixed(2)}%`, rateLabel: 'TNA',
      rateDate: `TNA vigente desde el ${item.vigente_desde}`
    })
  }));

  // Build FCI cards data
  const fciCards = fciResults.map((item, idx) => ({
    tna: item.tna,
    nombre: item.nombre,
    logoSrc: getLogoForEntity(item.entidad),
    logo: item.entidad.substring(0, 2).toUpperCase(),
    logoBg: stringToColor(item.entidad),
    card: createCard({
      logo: item.entidad.substring(0, 2).toUpperCase(),
      logoBg: stringToColor(item.entidad), logoSrc: getLogoForEntity(item.entidad),
      name: item.nombre, entity: item.entidad,
      tags: [
        { text: item.categoria, type: 'category' },
        { text: `Patrimonio: ${formatPatrimonio(item.patrimonio)}`, type: '' }
      ],
      rate: `${item.tna.toFixed(2)}%`, rateLabel: 'TNA',
      rateDate: item.fechaDesde && item.fechaHasta ? `Entre ${item.fechaDesde} y ${item.fechaHasta}` : ''
    })
  }));

  // Merge and sort all by TNA descending
  const all = [...garantizadosCards, ...fciCards].sort((a, b) => b.tna - a.tna);

  mainList.innerHTML = '';
  if (all.length === 0) {
    mainList.innerHTML = '<div class="loading">No se pudieron cargar los datos.</div>';
  } else {
    all.forEach(item => mainList.appendChild(item.card));
  }

  // Render bar chart
  renderRendimientosChart(all);

  // Render especiales at the bottom
  renderEspeciales(config.especiales.filter(i => i.activo));

  initTooltips(mainList);
}

function renderRendimientosChart(items, containerId, options = {}) {
  const container = document.getElementById(containerId || 'rendimientos-chart');
  if (!container || items.length === 0) return;

  const vertical = options.vertical || false;

  // Sort descending
  const sorted = [...items].sort((a, b) => b.tna - a.tna);
  const maxTna = Math.max(...sorted.map(i => i.tna));
  const minTna = Math.min(...sorted.map(i => i.tna));

  // Gradient from vibrant green (top) to muted (bottom)
  function getBarColor(tna) {
    const ratio = (tna - minTna) / (maxTna - minTna || 1);
    const h = 160;
    const s = 45 + ratio * 30;
    const l = 55 - ratio * 15;
    return `hsl(${h}, ${s}%, ${l}%)`;
  }

  if (vertical) {
    // Vertical bars: columns side by side, bars grow upward
    // Limit to top items that fit on screen
    const maxItems = options.maxItems || 8;
    const displayed = sorted.slice(0, maxItems);
    const chartMin = Math.floor(minTna * 0.95);
    const cols = displayed.map(item => {
      const pct = Math.max(8, ((item.tna - chartMin) / (maxTna - chartMin)) * 100);
      const color = getBarColor(item.tna);
      const safeChartLogoSrc = item.logoSrc?.replace(/^http:\/\//, 'https://');
      const logoInner = safeChartLogoSrc
        ? `<img src="${safeChartLogoSrc}" alt="${item.nombre}" onerror="this.parentElement.textContent='${item.logo}'">`
        : item.logo;
      const logoBg = safeChartLogoSrc ? 'transparent' : item.logoBg;

      return `
        <div class="vchart-col">
          <span class="vchart-value">${item.tna.toFixed(1)}%</span>
          <div class="vchart-bar-wrap">
            <div class="vchart-bar" style="height:${pct}%;background:${color}"></div>
          </div>
          <div class="chart-logo" style="background:${logoBg}">${logoInner}</div>
          <span class="vchart-name">${item.nombre.replace(/^Banco\s*/i, '')}</span>
        </div>`;
    }).join('');

    container.className = 'chart-wrapper vchart';
    container.innerHTML = cols;
  } else {
    // Horizontal bars (original)
    const rows = sorted.map(item => {
      const chartMin = 10;
      const pct = Math.max(8, ((item.tna - chartMin) / (maxTna - chartMin)) * 100);
      const color = getBarColor(item.tna);
      const safeChartLogoSrc = item.logoSrc?.replace(/^http:\/\//, 'https://');
      const logoInner = safeChartLogoSrc
        ? `<img src="${safeChartLogoSrc}" alt="${item.nombre}" onerror="this.parentElement.textContent='${item.logo}'">`
        : item.logo;
      const logoBg = safeChartLogoSrc ? 'transparent' : item.logoBg;

      return `
        <div class="chart-row">
          <div class="chart-logo" style="background:${logoBg}">${logoInner}</div>
          <div class="chart-bar-wrap">
            <div class="chart-bar" style="width:${pct}%;background:${color}">
              <span class="chart-value">${item.tna.toFixed(2)}%</span>
            </div>
          </div>
        </div>`;
    }).join('');

    container.innerHTML = rows;
  }
}

function createCard({ logo, logoBg, logoSrc, name, entity, description, tags, rate, rateLabel, rateDate, highlighted }) {
  const card = document.createElement('div');
  card.className = 'fund-card' + (highlighted ? ' highlighted' : '');

  const tagsHTML = tags.map(t => {
    let cls = 'tag';
    if (t.type) cls += ' ' + t.type;
    return `<span class="${cls}">${t.text}</span>`;
  }).join('');

  const descHTML = description ? `<div class="fund-description">${description}</div>` : '';
  const entityHTML = entity ? `<div class="fund-entity">${entity}</div>` : '';

  // Use real logo image if available, otherwise fallback to initials
  // Fix mixed content: upgrade http:// to https:// for BCRA logos
  const safeLogoSrc = logoSrc?.replace(/^http:\/\//, 'https://');
  const logoInner = safeLogoSrc
    ? `<img src="${safeLogoSrc}" alt="${name}">`
    : logo;

  card.innerHTML = `
    <div class="fund-logo" style="background:${safeLogoSrc ? 'transparent' : logoBg}">${logoInner}</div>
    <div class="fund-info">
      <div class="fund-name">${name}</div>
      ${entityHTML}
      ${descHTML}
      <div class="fund-tags">${tagsHTML}</div>
    </div>
    <div class="fund-rate">
      <div class="rate-value">${rate}</div>
      <div class="rate-label">${rateLabel}</div>
      <div class="rate-date">${rateDate}</div>
    </div>
  `;

  // Add error handler for logo images
  if (safeLogoSrc) {
    const img = card.querySelector('.fund-logo img');
    if (img) {
      img.onerror = function() {
        const parent = this.parentElement;
        this.remove();
        parent.style.background = logoBg;
        parent.textContent = logo;
      };
    }
  }

  return card;
}

async function fetchFCIData(activeFcis) {
  try {
    const resp = await fetch('/api/fci');
    const { data } = await resp.json();
    if (!data) return [];
    // Match API results to our configured funds by name
    const activeNames = new Set(activeFcis.map(f => f.nombre));
    return data
      .filter(f => activeNames.has(f.nombre))
      .map(f => {
        const cfg = activeFcis.find(c => c.nombre === f.nombre);
        return {
          ...cfg,
          tna: f.tna,
          patrimonio: f.patrimonio,
          fechaDesde: f.fechaDesde,
          fechaHasta: f.fechaHasta,
        };
      });
  } catch (e) {
    console.error('Error fetching FCI data:', e);
    return [];
  }
}

function renderEspeciales(items) {
  const container = document.getElementById('especiales-list');
  container.innerHTML = '';

  items.sort((a, b) => b.tna - a.tna).forEach(item => {
    const logoSrc = getLogoForItem(item);
    const card = createCard({
      logo: item.logo,
      logoBg: item.logo_bg,
      logoSrc,
      name: item.nombre,
      description: item.descripcion,
      tags: [
        { text: item.tipo, type: 'type' },
        { text: `Límite: ${item.limite}`, type: 'limit' }
      ],
      rate: `${item.tna.toFixed(2)}%`,
      rateLabel: 'TNA',
      rateDate: `TNA vigente desde el ${item.vigente_desde}`
    });
    container.appendChild(card);
  });
}

function formatPatrimonio(value) {
  if (!value) return '—';
  const num = parseFloat(value);
  if (num >= 1e12) return `${(num / 1e12).toFixed(1)} B`;
  if (num >= 1e9) return `${Math.round(num / 1e9)} mil M`;
  if (num >= 1e6) return `${Math.round(num / 1e6)} M`;
  if (num >= 1e3) return `${Math.round(num / 1e3)} K`;
  return num.toString();
}

function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 55%, 45%)`;
}

// ─── Tab switching ───
function setupTabs() {
  const tabs = document.querySelectorAll('.subnav-tab[data-tab]');
  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const target = tab.dataset.tab;
      tabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');

      document.getElementById('tab-billeteras').style.display = target === 'billeteras' ? '' : 'none';
      document.getElementById('tab-plazofijo').style.display = target === 'plazofijo' ? '' : 'none';
      document.getElementById('tab-plazofijoperiodico').style.display = target === 'plazofijoperiodico' ? '' : 'none';
      document.getElementById('tab-lecaps').style.display = target === 'lecaps' ? '' : 'none';
      document.getElementById('tab-cer').style.display = target === 'cer' ? '' : 'none';
      document.getElementById('tab-inflacion').style.display = target === 'inflacion' ? '' : 'none';
      document.getElementById('tab-soberanos').style.display = 'none';

      const hero = document.getElementById('hero');
      if (target === 'plazofijo') {
        hero.querySelector('h1').textContent = 'Tasas de Plazo Fijo';
        hero.querySelector('p').textContent = 'Compará tasas de plazo fijo de bancos argentinos. Datos provistos por el BCRA.';
        if (!document.getElementById('plazofijo-list').hasChildNodes()) {
          loadPlazoFijo();
        }
      } else if (target === 'plazofijoperiodico') {
        hero.querySelector('h1').textContent = 'Plazo Fijo Periódico';
        hero.querySelector('p').textContent = 'Compará los tramos de plazo fijo UVA con pago periódico de Banco Nación.';
        if (!document.getElementById('plazofijo-uva-periodico-list').hasChildNodes()) {
          loadPlazoFijoUvaPeriodico();
        }
      } else if (target === 'lecaps') {
        hero.querySelector('h1').textContent = 'LECAPs y BONCAPs';
        hero.querySelector('p').textContent = 'Rendimiento implícito de letras y bonos capitalizables del Tesoro según precio de mercado.';
        if (!document.getElementById('lecaps-list').hasChildNodes()) {
          loadLecaps();
        }
      } else if (target === 'cer') {
        hero.querySelector('h1').textContent = 'Bonos CER';
        hero.querySelector('p').textContent = 'Rendimiento real de bonos ajustados por CER en pesos argentinos.';
        if (!document.getElementById('cer-list').hasChildNodes()) {
          loadCER();
        }
      } else if (target === 'inflacion') {
        hero.querySelector('h1').textContent = 'Comparador';
        hero.querySelector('p').textContent = 'Compará el rendimiento mensual de tus inversiones contra la inflación.';
        if (!document.getElementById('inflacion-chart').hasChildNodes()) {
          loadInflacion();
        }
      } else {
        hero.querySelector('h1').textContent = '';
        hero.querySelector('p').textContent = '';
      }
      // Update hash for sub-tabs
      location.hash = target === 'billeteras' ? 'ars' : target === 'inflacion' ? 'comparador' : target;
    });
  });

  // Header-level switching
  const headerArs = document.getElementById('header-ars');
  const subnav = document.querySelector('.subnav');
  const hero = document.getElementById('hero');

  const headerSoberanos = document.getElementById('header-soberanos');
  const headerONs = document.getElementById('header-ons');
  const headerMundo = document.getElementById('header-mundo');
  const headerHipotecarios = document.getElementById('header-hipotecarios');

  const headerDolar = document.getElementById('header-dolar');
  const headerBcra = document.getElementById('header-bcra');
  const headerMundial = document.getElementById('header-mundial');
  const headerPortfolio = document.getElementById('header-portfolio');

  const headerPix = document.getElementById('header-pix');

  const sectionHome = document.getElementById('section-home');

  function hideAllTabs() {
    document.getElementById('tab-billeteras').style.display = 'none';
    document.getElementById('tab-plazofijo').style.display = 'none';
    document.getElementById('tab-plazofijoperiodico').style.display = 'none';
    document.getElementById('tab-lecaps').style.display = 'none';
    document.getElementById('tab-cer').style.display = 'none';
    document.getElementById('tab-hipotecarios').style.display = 'none';
    document.getElementById('tab-ons').style.display = 'none';
    document.getElementById('tab-soberanos').style.display = 'none';
    document.getElementById('section-mundo').style.display = 'none';
    document.getElementById('tab-portfolio').style.display = 'none';

    document.getElementById('tab-dolar').style.display = 'none';
    document.getElementById('tab-pix').style.display = 'none';
    document.getElementById('tab-bcra').style.display = 'none';
    document.getElementById('tab-mundial').style.display = 'none';
    if (sectionHome) sectionHome.classList.remove('active');
    document.querySelector('.container').style.display = '';
    [headerArs, headerSoberanos, headerONs, headerMundo, headerHipotecarios, headerDolar, headerPix, headerBcra, headerMundial, headerPortfolio].forEach(b => b && b.classList.remove('active'));
    hero.style.display = '';
  }

  function switchToHome() {
    hideAllTabs();
    if (sectionHome) sectionHome.classList.add('active');
    hero.style.display = 'none';
    subnav.style.display = 'none';
    document.querySelector('.container').style.display = 'none';
    updatePageTitle('home');
  }

  function updatePageTitle(section) {
    const base = 'Rendimientos AR';
    const titles = {
      home: 'Asistente de Inversiones',
      mundo: 'Monitor Global',
      ars: 'Billeteras y Fondos',
      bonos: 'Bonos Soberanos USD',
      plazofijo: 'Tasas Plazo Fijo',
      plazofijoperiodico: 'Plazo Fijo Periódico',
      lecaps: 'LECAPs y BONCAPs',
      hipotecarios: 'Hipotecarios UVA',
      bcra: 'Indicadores BCRA',
      dolar: 'Dolar',
      pix: 'PIX Brasil',
      portfolio: 'Mi Portfolio',
      mundial: 'Mundial 2026',
    };
    document.title = titles[section] ? `${titles[section]} — ${base}` : base;
  }

  function switchToPortfolio() {
    hideAllTabs();
    headerPortfolio.classList.add('active');
    subnav.style.display = 'none';
    document.getElementById('tab-portfolio').style.display = 'block';
    hero.querySelector('h1').textContent = '';
    hero.querySelector('p').textContent = '';
    hero.style.display = 'none';
    updatePageTitle('portfolio');
    if (currentUser) {
      document.getElementById('portfolio-login-prompt').style.display = 'none';
      document.getElementById('portfolio-content').style.display = '';
      loadPortfolio();
    } else {
      document.getElementById('portfolio-login-prompt').style.display = '';
      document.getElementById('portfolio-content').style.display = 'none';
    }
  }

  function switchToArs() {
    hideAllTabs();
    headerArs.classList.add('active');
    subnav.style.display = '';
    // Show whichever ARS tab was active
    const activeTab = document.querySelector('.subnav-tab.active');
    if (activeTab) {
      const target = activeTab.dataset.tab;
      document.getElementById('tab-billeteras').style.display = target === 'billeteras' ? '' : 'none';
      document.getElementById('tab-plazofijo').style.display = target === 'plazofijo' ? '' : 'none';
      document.getElementById('tab-plazofijoperiodico').style.display = target === 'plazofijoperiodico' ? '' : 'none';
      document.getElementById('tab-lecaps').style.display = target === 'lecaps' ? '' : 'none';
      document.getElementById('tab-cer').style.display = target === 'cer' ? '' : 'none';
      document.getElementById('tab-inflacion').style.display = target === 'inflacion' ? '' : 'none';
    } else {
      document.getElementById('tab-billeteras').style.display = '';
      document.getElementById('tab-plazofijo').style.display = 'none';
      document.getElementById('tab-plazofijoperiodico').style.display = 'none';
      document.getElementById('tab-lecaps').style.display = 'none';
      document.getElementById('tab-cer').style.display = 'none';
      document.getElementById('tab-inflacion').style.display = 'none';
    }
    // Restore hero
    const activeSubtab = document.querySelector('.subnav-tab.active');
    if (activeSubtab && activeSubtab.dataset.tab === 'plazofijo') {
      hero.querySelector('h1').textContent = 'Tasas de Plazo Fijo';
      hero.querySelector('p').textContent = 'Compará tasas de plazo fijo de bancos argentinos. Datos provistos por el BCRA.';
    } else if (activeSubtab && activeSubtab.dataset.tab === 'plazofijoperiodico') {
      hero.querySelector('h1').textContent = 'Plazo Fijo Periódico';
      hero.querySelector('p').textContent = 'Compará los tramos de plazo fijo UVA con pago periódico de Banco Nación.';
    } else if (activeSubtab && activeSubtab.dataset.tab === 'lecaps') {
      hero.querySelector('h1').textContent = 'LECAPs y BONCAPs';
      hero.querySelector('p').textContent = 'Rendimiento implícito de letras y bonos capitalizables del Tesoro según precio de mercado.';
    } else if (activeSubtab && activeSubtab.dataset.tab === 'cer') {
      hero.querySelector('h1').textContent = 'Bonos CER';
      hero.querySelector('p').textContent = 'Rendimiento real de bonos ajustados por CER en pesos argentinos.';
    } else if (activeSubtab && activeSubtab.dataset.tab === 'inflacion') {
      hero.querySelector('h1').textContent = 'Comparador';
      hero.querySelector('p').textContent = 'Compará el rendimiento mensual de tus inversiones contra la inflación.';
    } else {
      hero.querySelector('h1').textContent = '';
      hero.querySelector('p').textContent = '';
    }
    const sub = document.querySelector('.subnav-tab.active')?.dataset.tab || 'ars';
    updatePageTitle(sub === 'billeteras' ? 'ars' : sub);
    setTimeout(readCurrentSection, 1500);
  }

  function switchToSoberanos() {
    hideAllTabs();
    headerSoberanos.classList.add('active');
    subnav.style.display = 'none';
    document.getElementById('tab-soberanos').style.display = 'block';
    hero.querySelector('h1').textContent = 'Bonos Soberanos';
    hero.querySelector('p').textContent = 'Rendimiento de bonos soberanos argentinos en dólares. Ley local y ley extranjera.';
    updatePageTitle('bonos');
    if (!document.getElementById('soberanos-list').hasChildNodes()) {
      loadSoberanos();
    }
    setTimeout(readCurrentSection, 1500);
  }

  function switchToMundo() {
    hideAllTabs();
    headerMundo.classList.add('active');
    subnav.style.display = 'none';
    document.getElementById('section-mundo').style.display = '';
    hero.querySelector('h1').textContent = 'Monitor Global';
    hero.querySelector('p').textContent = 'Principales indicadores del mercado mundial en tiempo real.';
    updatePageTitle('mundo');
    if (!document.getElementById('mundo-grid').hasChildNodes()) {
      loadMundo();
      loadHotMovers();
    }
    setTimeout(readCurrentSection, 1500);
  }

  function switchToONs() {
    hideAllTabs();
    headerONs.classList.add('active');
    subnav.style.display = 'none';
    document.getElementById('tab-ons').style.display = 'block';
    hero.querySelector('h1').textContent = 'Obligaciones Negociables';
    hero.querySelector('p').textContent = 'Rendimiento de bonos corporativos en USD. Hacé click en cualquier ON para abrir la calculadora.';
    updatePageTitle('ons');
    if (!document.getElementById('ons-list').hasChildNodes()) {
      loadONs();
    }
  }

  function switchToHipotecarios() {
    hideAllTabs();
    headerHipotecarios.classList.add('active');
    subnav.style.display = 'none';
    document.getElementById('tab-hipotecarios').style.display = 'block';
    hero.querySelector('h1').textContent = 'Créditos Hipotecarios UVA';
    hero.querySelector('p').textContent = 'Compará tasas y condiciones de préstamos hipotecarios UVA de bancos argentinos.';
    updatePageTitle('hipotecarios');
    if (!document.getElementById('hipotecarios-list').hasChildNodes()) {
      loadHipotecarios();
    }
  }

  function switchToBcra() {
    hideAllTabs();
    headerBcra.classList.add('active');
    subnav.style.display = 'none';
    document.getElementById('tab-bcra').style.display = 'block';
    hero.querySelector('h1').textContent = 'BCRA';
    hero.querySelector('p').textContent = 'Datos oficiales del Banco Central: tasas, inflación, reservas, tipo de cambio y más.';
    updatePageTitle('bcra');
    if (!document.getElementById('bcra-list').querySelector('.bcra-category')) {
      loadBcra();
    }
  }

  function switchToDolar() {
    hideAllTabs();
    headerDolar.classList.add('active');
    subnav.style.display = 'none';
    document.getElementById('tab-dolar').style.display = 'block';
    hero.querySelector('h1').textContent = 'Dolar';
    hero.querySelector('p').textContent = 'Compara tipos de cambio y encontra el mejor precio para comprar o vender dolares en Argentina.';
    updatePageTitle('dolar');
    if (!document.getElementById('dolar-tipos').hasChildNodes()) {
      loadDolar();
    }
  }

  function switchToPix() {
    hideAllTabs();
    headerPix.classList.add('active');
    subnav.style.display = 'none';
    document.getElementById('tab-pix').style.display = 'block';
    hero.querySelector('h1').textContent = 'PIX';
    hero.querySelector('p').textContent = 'Compara el precio del Real brasileno (BRL) en las principales apps de Argentina.';
    updatePageTitle('pix');
    if (!document.getElementById('pix-exchanges').hasChildNodes()) {
      loadPix();
    }
  }

  function switchToMundial() {
    hideAllTabs();
    headerMundial.classList.add('active');
    subnav.style.display = 'none';
    document.getElementById('tab-mundial').style.display = 'block';
    hero.querySelector('h1').textContent = 'Mundial 2026';
    hero.querySelector('p').textContent = 'FIFA World Cup USA/Mexico/Canada 2026 — Fixture completo, grupos y bracket.';
    updatePageTitle('mundial');
    if (!document.getElementById('mundial-groups').hasChildNodes()) {
      renderMundial();
    }
  }

  // Logo click → home
  const logoEl = document.querySelector('.logo');
  if (logoEl) logoEl.addEventListener('click', (e) => { e.preventDefault(); switchToHome(); location.hash = ''; });

  if (headerArs) headerArs.addEventListener('click', (e) => { e.preventDefault(); switchToArs(); location.hash = 'ars'; });
  if (headerSoberanos) headerSoberanos.addEventListener('click', (e) => { e.preventDefault(); switchToSoberanos(); location.hash = 'bonos'; });
  if (headerONs) headerONs.addEventListener('click', (e) => { e.preventDefault(); switchToONs(); location.hash = 'ons'; });
  if (headerMundo) headerMundo.addEventListener('click', (e) => { e.preventDefault(); switchToMundo(); location.hash = 'mundo'; });
  if (headerHipotecarios) headerHipotecarios.addEventListener('click', (e) => { e.preventDefault(); switchToHipotecarios(); location.hash = 'hipotecarios'; });
  if (headerDolar) headerDolar.addEventListener('click', (e) => { e.preventDefault(); switchToDolar(); location.hash = 'dolar'; });
  if (headerPix) headerPix.addEventListener('click', (e) => { e.preventDefault(); switchToPix(); location.hash = 'pix'; });
  if (headerBcra) headerBcra.addEventListener('click', (e) => { e.preventDefault(); switchToBcra(); location.hash = 'bcra'; });
  if (headerMundial) headerMundial.addEventListener('click', (e) => { e.preventDefault(); switchToMundial(); location.hash = 'mundial'; });
  if (headerPortfolio) headerPortfolio.addEventListener('click', (e) => { e.preventDefault(); switchToPortfolio(); location.hash = 'portfolio'; });

  window._switchToPortfolio = switchToPortfolio;

  // Handle initial hash on page load
  const initialHash = location.hash.replace('#', '');
  if (initialHash === 'mundo') switchToMundo();
  else if (initialHash === 'ars') switchToArs();
  else if (initialHash === 'bonos') switchToSoberanos();
  else if (initialHash === 'plazofijo') { switchToArs(); document.querySelector('.subnav-tab[data-tab="plazofijo"]')?.click(); }
  else if (initialHash === 'plazofijoperiodico') { switchToArs(); document.querySelector('.subnav-tab[data-tab="plazofijoperiodico"]')?.click(); }
  else if (initialHash === 'lecaps') { switchToArs(); document.querySelector('.subnav-tab[data-tab="lecaps"]')?.click(); }
  else if (initialHash === 'cer') { switchToArs(); document.querySelector('.subnav-tab[data-tab="cer"]')?.click(); }
  else if (initialHash === 'comparador' || initialHash === 'inflacion') { switchToArs(); document.querySelector('.subnav-tab[data-tab="inflacion"]')?.click(); }
  else if (initialHash === 'hipotecarios') switchToHipotecarios();
  else if (initialHash === 'dolar') switchToDolar();
  else if (initialHash === 'pix') switchToPix();
  else if (initialHash === 'bcra') switchToBcra();
  else if (initialHash === 'ons') switchToONs();
  else if (initialHash === 'mundial') switchToMundial();
  else if (initialHash === 'portfolio') switchToPortfolio();
  else switchToMundo();

  // Handle back/forward navigation (skip if subnav tab already active)
  let _hashChanging = false;
  window.addEventListener('hashchange', () => {
    if (_hashChanging) return;
    _hashChanging = true;
    const h = location.hash.replace('#', '');
    if (h === 'ars') switchToArs();
    else if (h === 'bonos') switchToSoberanos();
    else if (h === 'plazofijo') { switchToArs(); document.querySelector('.subnav-tab[data-tab="plazofijo"]')?.click(); }
    else if (h === 'plazofijoperiodico') { switchToArs(); document.querySelector('.subnav-tab[data-tab="plazofijoperiodico"]')?.click(); }
    else if (h === 'lecaps') { switchToArs(); document.querySelector('.subnav-tab[data-tab="lecaps"]')?.click(); }
    else if (h === 'cer') { switchToArs(); document.querySelector('.subnav-tab[data-tab="cer"]')?.click(); }
    else if (h === 'comparador' || h === 'inflacion') { switchToArs(); document.querySelector('.subnav-tab[data-tab="inflacion"]')?.click(); }
    else if (h === 'hipotecarios') switchToHipotecarios();
    else if (h === 'dolar') switchToDolar();
    else if (h === 'pix') switchToPix();
    else if (h === 'bcra') switchToBcra();
    else if (h === 'ons') switchToONs();
    else if (h === 'mundial') switchToMundial();
    else if (h === 'portfolio') switchToPortfolio();
    else if (h === 'mundo') switchToMundo();
    else switchToHome();
    _hashChanging = false;
  });
}

// ─── Keyboard navigation for subnav tabs ───
function setupKeyboardNav() {
  const tablist = document.querySelector('.subnav');
  if (!tablist) return;
  tablist.setAttribute('role', 'tablist');

  const tabs = Array.from(tablist.querySelectorAll('.subnav-tab[data-tab]'));
  tabs.forEach((tab, i) => {
    tab.setAttribute('role', 'tab');
    tab.setAttribute('tabindex', tab.classList.contains('active') ? '0' : '-1');
    tab.addEventListener('keydown', (e) => {
      let next = -1;
      if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
      if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
      if (next === -1) return;
      e.preventDefault();
      tabs[next].focus();
      tabs[next].click();
    });
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.setAttribute('tabindex', '-1'));
      tab.setAttribute('tabindex', '0');
    });
  });
}

// ─── Plazo Fijo section ───

const PLAZO_FIJO_LOGOS = {
  'Banco Nación': '/logos/Banco_Nación.png',
  'Banco Santander': '/logos/Banco_Santander.png',
  'Banco Galicia': '/logos/Banco_Galicia.png',
  'Banco Provincia': '/logos/Banco_Provincia.svg',
  'BBVA Argentina': '/logos/BBVA_Argentina.png',
  'Banco Macro': '/logos/Banco_Macro.png',
  'Banco Credicoop': '/logos/Banco_Credicoop.png',
  'ICBC Argentina': '/logos/ICBC_Argentina.png',
  'Banco Ciudad': '/logos/Banco_Ciudad.png',
  'Banco Comafi': '/logos/Banco_Comafi.png',
  'Banco de Corrientes': '/logos/Banco_de_Corrientes.svg',
  'Banco de Córdoba': '/logos/BANCOR.svg',
  'Banco del Chubut': '/logos/Banco_del_Chubut.png',
  'Banco del Sol': '/logos/Banco_del_Sol.svg',
  'Banco Hipotecario': '/logos/Banco_Hipotecario.png',
  'Banco Voii': '/logos/Banco_Voii.png',
  'Bibank': '/logos/Bibank.png',
  'Ualá': '/logos/Uala.svg',
  'Reba': '/logos/Reba_Compañía_Financiera.png',
  'Banco BICA': '/logos/Banco_BICA.svg',
  'Banco Supervielle': '/logos/Banco_Supervielle.svg',
  'Banco Tierra del Fuego': '/logos/Banco_Prov__Tierra_del_Fuego.png',
  'Banco de Formosa': '/logos/Banco_de_Formosa.png',
  'Banco Dino': '/logos/Banco_Dino.png',
  'Banco Julio': '/logos/Banco_Julio.png',
  'Banco Mariva': '/logos/Banco_Mariva.png',
  'Banco Masventas': '/logos/Banco_Masventas.png',
  'Banco Meridian': '/logos/Banco_Meridian.png',
  'Banco CMF': '/logos/Banco_CMF.png',
  'Banco de Comercio': '/logos/Banco_de_Comercio.png',
  'Crédito Regional': '/logos/Crédito_Regional.png',
};

function formatPercentFromDecimal(value, digits = 2) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `${(Number(value) * 100).toFixed(digits)}%`;
}

function formatPlazoRange(minDias, maxDias) {
  if (minDias == null && maxDias == null) return 'Plazo no informado';
  if (minDias != null && maxDias != null && minDias === maxDias) return `${minDias} días`;
  if (minDias != null && maxDias != null) return `${minDias} a ${maxDias} días`;
  if (minDias != null) return `${minDias}+ días`;
  return `Hasta ${maxDias} días`;
}

async function loadPlazoFijoUvaPeriodico() {
  const container = document.getElementById('plazofijo-uva-periodico-list');
  const source = document.getElementById('plazofijo-uva-periodico-source');
  const chart = document.getElementById('plazofijo-uva-periodico-chart');
  if (!container) return;

  container.innerHTML = `<div class="loading"><div class="loading-spinner"></div><p>Cargando UVA periódico...</p></div>`;
  if (chart) chart.innerHTML = `<div class="loading"><div class="loading-spinner"></div><p>Cargando gráfico...</p></div>`;
  if (source) source.textContent = '';

  try {
    const res = await fetch('https://api.argentinadatos.com/v1/finanzas/tasas/plazoFijoUvaPagoPeriodico');
    if (!res.ok) throw new Error(`API error: ${res.status}`);

    const entidades = await res.json();
    const bna = Array.isArray(entidades)
      ? entidades.find(item =>
        item?.id === 'bna' ||
        /naci[oó]n/i.test(item?.entidad || '')
      )
      : null;

    const tasas = Array.isArray(bna?.tasas) ? [...bna.tasas] : [];
    if (!tasas.length) {
      container.innerHTML = '<div class="loading">No se encontraron tramos vigentes para UVA periódico.</div>';
      return;
    }

    const sorted = tasas.sort((a, b) => (a.plazoMinDias || 0) - (b.plazoMinDias || 0));
    container.innerHTML = '';

    sorted.forEach((tramo) => {
      const plazo = formatPlazoRange(tramo.plazoMinDias, tramo.plazoMaxDias);
      const card = createCard({
        logo: 'BN',
        logoBg: stringToColor('Banco Nación UVA'),
        logoSrc: PLAZO_FIJO_LOGOS['Banco Nación'] || bna.logo || null,
        name: `Banco Nación · ${plazo}`,
        description: 'Interés pagado en subperíodos de 30 días',
        tags: [
          { text: 'UVA', type: 'billetera' },
          { text: 'Pago periódico', type: 'fci' }
        ],
        rate: formatPercentFromDecimal(tramo.tna),
        rateLabel: `TNA · TEA ${formatPercentFromDecimal(tramo.tea)}`,
        rateDate: 'Fuente: ArgentinaDatos'
      });

      container.appendChild(card);
    });

    if (chart) {
      const chartItems = sorted.map((tramo) => {
        const shortLabel = tramo.plazoMinDias != null && tramo.plazoMaxDias != null
          ? `${tramo.plazoMinDias}-${tramo.plazoMaxDias}`
          : formatPlazoRange(tramo.plazoMinDias, tramo.plazoMaxDias).replace(/\s*d[ií]as?/gi, '').replace(/\s+/g, '');
        return {
          tna: Number(tramo.tna) * 100,
          nombre: shortLabel,
          logo: shortLabel.split('-')[0].slice(0, 3),
          logoBg: stringToColor(`UVA ${shortLabel}`)
        };
      });
      renderRendimientosChart(chartItems, 'plazofijo-uva-periodico-chart', { vertical: true, maxItems: 8 });
    }

    initTooltips(container);

    if (source) {
      source.innerHTML = 'Fuente: <a href="https://api.argentinadatos.com/v1/finanzas/tasas/plazoFijoUvaPagoPeriodico" target="_blank" rel="noopener noreferrer">ArgentinaDatos API</a>';
    }
  } catch (e) {
    console.error('Error loading plazo fijo UVA pago periódico:', e);
    container.innerHTML = '<div class="loading">Error al cargar datos de UVA periódico.</div>';
    if (chart) chart.innerHTML = '<div class="loading">Error al cargar el gráfico.</div>';
  }
}

async function loadPlazoFijo() {
  const container = document.getElementById('plazofijo-list');
  container.innerHTML = `<div class="loading"><div class="loading-spinner"></div><p>Cargando tasas...</p></div>`;

  try {
    const res = await fetch('https://api.argentinadatos.com/v1/finanzas/tasas/plazoFijo');
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const bancos = await res.json();
    if (!bancos || !bancos.length) {
      container.innerHTML = '<div class="loading">No se pudieron cargar los datos.</div>';
      return;
    }

    // Normalize API data: rates come as decimals (0.23 = 23%)
    const normalized = bancos.map(b => ({
      nombre: b.entidad,
      tna_clientes: b.tnaClientes != null ? Math.round(b.tnaClientes * 100 * 100) / 100 : null,
      tna_no_clientes: b.tnaNoClientes != null ? Math.round(b.tnaNoClientes * 100 * 100) / 100 : null,
      enlace: b.enlace,
      logo: b.logo,
    }));

    // Sort by best available rate, Banco Voii first on ties, then alphabetically
    const PROMOTED = ["BANCO VOII S.A."];
    const sorted = [...normalized].sort((a, b) => {
      const rateA = Math.max(a.tna_no_clientes || 0, a.tna_clientes || 0);
      const rateB = Math.max(b.tna_no_clientes || 0, b.tna_clientes || 0);
      if (rateB !== rateA) return rateB - rateA;
      const promoA = PROMOTED.includes(a.nombre) ? -1 : 0;
      const promoB = PROMOTED.includes(b.nombre) ? -1 : 0;
      if (promoA !== promoB) return promoA - promoB;
      return a.nombre.localeCompare(b.nombre);
    });

    container.innerHTML = '';
    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

    sorted.forEach((banco, idx) => {
      const displayName = formatBankName(banco.nombre);
      const initials = displayName.replace(/^Banco\s*/i, '').substring(0, 2).toUpperCase();
      const bestRate = Math.max(banco.tna_clientes || 0, banco.tna_no_clientes || 0);

      const tags = [];
      if (banco.enlace) {
        tags.push({ text: 'Plazo Fijo Online', type: 'billetera' });
      }

      const card = createCard({
        logo: initials,
        logoBg: stringToColor(banco.nombre),
        logoSrc: PLAZO_FIJO_LOGOS[displayName] || banco.logo || null,
        name: displayName,
        tags,
        rate: `${bestRate.toFixed(1)}%`,
        rateLabel: 'TNA',
        rateDate: `Actualizado: ${dateStr}`
      });

      if (PROMOTED.includes(banco.nombre)) card.classList.add('promoted');

      if (banco.enlace) {
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => window.open(banco.enlace, '_blank', 'noopener,noreferrer'));
      }

      container.appendChild(card);
    });

    // Source note
    const source = document.querySelector('.section-source');
    if (source) source.textContent = '';

    // Render plazo fijo chart
    const chartItems = sorted.map(banco => {
      const displayName = formatBankName(banco.nombre);
      return {
        tna: Math.max(banco.tna_clientes || 0, banco.tna_no_clientes || 0),
        nombre: displayName,
        logoSrc: PLAZO_FIJO_LOGOS[displayName] || banco.logo || null,
        logo: displayName.replace(/^Banco\s*/i, '').substring(0, 2).toUpperCase(),
        logoBg: stringToColor(banco.nombre)
      };
    });
    renderRendimientosChart(chartItems, 'plazofijo-chart');
    initTooltips(container);
  } catch (e) {
    console.error('Error loading plazo fijo:', e);
    container.innerHTML = '<div class="loading">Error al cargar datos de plazos fijos.</div>';
  }
}

// Format API bank names to shorter display names
function formatBankName(name) {
  const MAP = {
    'BANCO DE LA NACION ARGENTINA': 'Banco Nación',
    'BANCO SANTANDER ARGENTINA S.A.': 'Banco Santander',
    'BANCO DE GALICIA Y BUENOS AIRES S.A.': 'Banco Galicia',
    'BANCO DE LA PROVINCIA DE BUENOS AIRES': 'Banco Provincia',
    'BANCO BBVA ARGENTINA S.A.': 'BBVA Argentina',
    'BANCO MACRO S.A.': 'Banco Macro',
    'BANCO CREDICOOP COOPERATIVO LIMITADO': 'Banco Credicoop',
    'INDUSTRIAL AND COMMERCIAL BANK OF CHINA (ARGENTINA) S.A.U.': 'ICBC Argentina',
    'BANCO DE LA CIUDAD DE BUENOS AIRES': 'Banco Ciudad',
    'BANCO BICA S.A.': 'Banco BICA',
    'BANCO CMF S.A.': 'Banco CMF',
    'BANCO COMAFI SOCIEDAD ANONIMA': 'Banco Comafi',
    'BANCO DE COMERCIO S.A.': 'Banco de Comercio',
    'BANCO DE CORRIENTES S.A.': 'Banco de Corrientes',
    'BANCO DE FORMOSA S.A.': 'Banco de Formosa',
    'BANCO DE LA PROVINCIA DE CORDOBA S.A.': 'Banco de Córdoba',
    'BANCO DEL CHUBUT S.A.': 'Banco del Chubut',
    'BANCO DEL SOL S.A.': 'Banco del Sol',
    'BANCO DINO S.A.': 'Banco Dino',
    'BANCO HIPOTECARIO S.A.': 'Banco Hipotecario',
    'BANCO JULIO SOCIEDAD ANONIMA': 'Banco Julio',
    'BANCO MARIVA S.A.': 'Banco Mariva',
    'BANCO MASVENTAS S.A.': 'Banco Masventas',
    'BANCO MERIDIAN S.A.': 'Banco Meridian',
    'BANCO PROVINCIA DE TIERRA DEL FUEGO': 'Banco Tierra del Fuego',
    'BANCO VOII S.A.': 'Banco Voii',
    'BIBANK S.A.': 'Bibank',
    'CRÉDITO REGIONAL COMPAÑÍA FINANCIERA S.A.U.': 'Crédito Regional',
    'REBA COMPAÑIA FINANCIERA S.A.': 'Reba',
    'UALA': 'Ualá',
  };
  return MAP[name] || name;
}

// ─── LECAPs section ───

// Parse YYYY-MM-DD as local date (not UTC)
function parseLocalDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// DAYS360 (US/NASD method) — matches Excel DAYS360(start, end, 0)
function days360(start, end) {
  let d1 = start.getDate(), m1 = start.getMonth() + 1, y1 = start.getFullYear();
  let d2 = end.getDate(), m2 = end.getMonth() + 1, y2 = end.getFullYear();
  if (d1 === 31) d1 = 30;
  if (d2 === 31 && d1 >= 30) d2 = 30;
  return (y2 - y1) * 360 + (m2 - m1) * 30 + (d2 - d1);
}

// Format date as YYYY-MM-DD local
function toLocalISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Get next business day (skip weekends + AR holidays)
function getSettlementDate(from) {
  // Argentine holidays 2026-2027 (fixed + moveable + puentes)
  const holidays = [
    '2026-03-23','2026-03-24','2026-04-02','2026-04-03',
    '2026-05-01','2026-05-25','2026-06-15','2026-06-20',
    '2026-07-09','2026-08-17','2026-10-12','2026-11-23',
    '2026-12-07','2026-12-08','2026-12-25','2027-01-01',
  ];
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let steps = 0;
  while (steps < 1) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;
    const iso = toLocalISO(d);
    if (holidays.includes(iso)) continue;
    steps++;
  }
  return d;
}

// ─── Hipotecarios UVA ───

const HIPOTECARIO_LOGOS = {
  'Hipotecario': '/logos/Banco_Hipotecario.png',
  'Ciudad': '/logos/Banco_Ciudad.png',
  'ICBC': '/logos/ICBC_Argentina.png',
  'BNA': '/logos/Banco_Nación.png',
  'Santander': '/logos/Banco_Santander.png',
  'Macro': '/logos/Banco_Macro.png',
  'BBVA': '/logos/BBVA_Argentina.png',
  'Galicia': '/logos/Banco_Galicia.png',
  'Credicoop': '/logos/Banco_Credicoop.png',
  'Comafi': '/logos/Banco_Comafi.png',
  'Banco de Chubut': '/logos/Banco_del_Chubut.png',
  'Banco de la Provincia': '/logos/Banco_de_la_Prov__de_Buenos_Aires.png',
  'Supervielle': '/logos/Banco_Supervielle.svg',
  'Brubank': '/logos/Brubank.svg',
  'Patagonia': '/logos/Banco_Patagonia.svg',
  'Banco del Sol': '/logos/Banco_del_Sol.svg',
  'BANCOR': '/logos/BANCOR.svg',
  'Banco de Corrientes': '/logos/Banco_de_Corrientes.svg',
  'Grupo Petersen': '/logos/Grupo_Petersen.svg',
};

const HIPOTECARIO_COLORS = {
  'Hipotecario': '#1a3a5c',
  'Ciudad': '#0066b2',
  'Supervielle': '#e4002b',
  'ICBC': '#c8102e',
  'Brubank': '#6c3baa',
  'BNA': '#005baa',
  'Santander': '#ec0000',
  'Macro': '#003366',
  'BBVA': '#004481',
  'Galicia': '#ff6600',
  'Patagonia': '#003399',
  'Credicoop': '#006633',
  'Banco del Sol': '#ffcc00',
  'Comafi': '#1a1a6c',
  'BANCOR': '#0072bc',
  'Banco de Corrientes': '#006341',
  'Grupo Petersen': '#2d2d6e',
  'Banco de Chubut': '#003d6b',
};

// ─── BCRA ───────────────────────────────────────────────────────────────────

let _bcraData = null;
let _bcraChart = null;

async function loadBcra() {
  const container = document.getElementById('bcra-list');
  container.innerHTML = `<div class="loading"><div class="loading-spinner"></div><p>Cargando datos BCRA...</p></div>`;

  try {
    const res = await fetch('/api/bcra');
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const json = await res.json();
    const data = json.data || [];
    _bcraData = data;

    // Group by category
    const categorias = {};
    for (const v of data) {
      if (!categorias[v.categoria]) categorias[v.categoria] = [];
      categorias[v.categoria].push(v);
    }

    const catOrder = ['Tasas', 'Inflación', 'Cambiario', 'Monetario', 'Índices'];
    const catIcons = {
      'Tasas':    '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
      'Inflación':'<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
      'Cambiario':'<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
      'Monetario':'<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
      'Índices':  '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
    };

    function fmtValor(v) {
      if (v.valor == null || typeof v.valor !== 'number') return '—';
      if (v.formato === 'pct') return v.valor.toFixed(2) + '%';
      if (v.unidad === 'MM USD') return '$' + v.valor.toLocaleString('es-AR', { maximumFractionDigits: 0 }) + ' M';
      if (v.unidad === 'MM $') return '$' + (v.valor / 1000).toFixed(1) + ' B';
      return v.valor.toLocaleString('es-AR', { maximumFractionDigits: 4 });
    }

    function fmtDelta(v) {
      if (v.valor == null || v.valorAnterior == null || typeof v.valor !== 'number' || typeof v.valorAnterior !== 'number') return '';
      const delta = v.valor - v.valorAnterior;
      const pct = v.valorAnterior !== 0 ? (delta / Math.abs(v.valorAnterior)) * 100 : 0;
      const sign = delta >= 0 ? '+' : '';
      const color = delta >= 0 ? 'var(--green)' : 'var(--red)';
      const arrow = delta >= 0 ? '▲' : '▼';
      if (v.formato === 'pct') {
        return `<span style="color:${color};font-size:0.75rem">${arrow} ${sign}${delta.toFixed(2)} pp</span>`;
      }
      return `<span style="color:${color};font-size:0.75rem">${arrow} ${sign}${pct.toFixed(1)}%</span>`;
    }

    function fmtFecha(f) {
      if (!f) return '';
      const [y, m, d] = f.split('-');
      return `${d}/${m}/${y}`;
    }

    let html = '';
    const orderedCats = catOrder.filter(c => categorias[c]);
    for (const cat of orderedCats) {
      const icon = catIcons[cat] || '';
      html += `<div class="bcra-category">
        <h3 class="bcra-cat-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>
          ${cat}
        </h3>
        <div class="bcra-cards">`;
      for (const v of categorias[cat]) {
        const isNull = v.valor === null;
        html += `
          <div class="bcra-card" data-id="${v.id}" data-key="${v.key}" title="Ver histórico">
            <div class="bcra-card-nombre">${v.nombre}</div>
            <div class="bcra-card-valor ${isNull ? 'bcra-null' : ''}">${fmtValor(v)}</div>
            <div class="bcra-card-meta">
              ${fmtDelta(v)}
              <span class="bcra-card-fecha">${fmtFecha(v.fecha)}</span>
            </div>
            ${v.unidad ? `<div class="bcra-card-unidad">${v.unidad}</div>` : ''}
          </div>`;
      }
      html += `</div></div>`;
    }

    container.innerHTML = html;

    // Populate chart selector
    const selector = document.getElementById('bcra-chart-selector');
    if (selector) {
      selector.innerHTML = '<option value="">Elegí una variable...</option>';
      for (const v of data) {
        if (v.valor !== null) {
          const opt = document.createElement('option');
          opt.value = v.id;
          opt.textContent = v.nombre;
          selector.appendChild(opt);
        }
      }
      selector.addEventListener('change', () => { if (selector.value) loadBcraChart(parseInt(selector.value)); });
      document.getElementById('bcra-chart-range')?.addEventListener('change', () => {
        if (selector.value) loadBcraChart(parseInt(selector.value));
      });
    }

    // Click on card → select in chart
    container.querySelectorAll('.bcra-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.id;
        if (selector) {
          selector.value = id;
          loadBcraChart(parseInt(id));
          document.getElementById('bcra-chart')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    });

  } catch (err) {
    container.innerHTML = `<p style="color:var(--red);padding:20px">Error cargando datos del BCRA: ${err.message}</p>`;
  }
}

async function loadBcraChart(idVariable) {
  const canvas = document.getElementById('bcra-chart');
  if (!canvas) return;
  const days = parseInt(document.getElementById('bcra-chart-range')?.value || '365', 10);
  const hasta = new Date().toISOString().split('T')[0];

  // days=0 → todo el histórico (sin filtro de fecha)
  let url = `/api/bcra?variable=${idVariable}`;
  if (days > 0) {
    const desdeDate = new Date();
    desdeDate.setDate(desdeDate.getDate() - days);
    url += `&desde=${desdeDate.toISOString().split('T')[0]}&hasta=${hasta}`;
  }

  // Find variable name
  const varDef = _bcraData?.find(v => v.id === idVariable);
  const label = varDef?.nombre || `Variable ${idVariable}`;

  try {
    canvas.style.opacity = '0.4';
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const json = await res.json();
    const detalle = json.results?.[0]?.detalle || [];
    const results = [...detalle].reverse(); // oldest first
    canvas.style.opacity = '1';

    const labels = results.map(r => {
      const [y, m, d] = r.fecha.split('-');
      return `${d}/${m}/${y.slice(2)}`;
    });
    const values = results.map(r => r.valor);

    if (_bcraChart) _bcraChart.destroy();
    const ctx = canvas.getContext('2d');
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#00c853';
    _bcraChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label,
          data: values,
          borderColor: accent,
          backgroundColor: accent + '1a',
          borderWidth: 2,
          pointRadius: results.length > 60 ? 0 : 2,
          pointHoverRadius: 4,
          fill: true,
          tension: 0.3,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(0,0,0,0.75)',
            titleColor: '#fff',
            bodyColor: '#ccc',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            callbacks: {
              label: ctx => {
                const v = ctx.parsed.y;
                if (!varDef) return String(v);
                if (varDef.formato === 'pct') return `${v.toFixed(2)}%`;
                return v.toLocaleString('es-AR', { maximumFractionDigits: 4 }) + (varDef.unidad ? ' ' + varDef.unidad : '');
              }
            }
          }
        },
        scales: {
          x: {
            ticks: { maxTicksLimit: 8, color: '#888', font: { size: 11 } },
            grid: { display: false },
            border: { display: false }
          },
          y: {
            ticks: { color: '#888', font: { size: 11 }, maxTicksLimit: 6 },
            grid: { color: 'rgba(128,128,128,0.12)', drawBorder: false },
            border: { display: false }
          }
        }
      }
    });
  } catch (err) {
    canvas.style.opacity = '1';
    console.error('BCRA chart error:', err);
  }
}

// ─── BCRA Cambiarias ─────────────────────────────────────────────────────────

const NOMBRE_MONEDA = {
  USD: 'Dólar Estadounidense', EUR: 'Euro', BRL: 'Real Brasileño', GBP: 'Libra Esterlina',
  CHF: 'Franco Suizo', JPY: 'Yen Japonés', CNY: 'Yuan Chino', CLP: 'Peso Chileno',
  UYU: 'Peso Uruguayo', PYG: 'Guaraní Paraguayo', BOB: 'Boliviano', MXN: 'Peso Mexicano',
  COP: 'Peso Colombiano', CAD: 'Dólar Canadiense', AUD: 'Dólar Australiano',
  XAU: 'Oro (oz troy)', XAG: 'Plata (oz troy)',
};

const FLAG_MONEDA = {
  USD: '🇺🇸', EUR: '🇪🇺', BRL: '🇧🇷', GBP: '🇬🇧', CHF: '🇨🇭', JPY: '🇯🇵',
  CNY: '🇨🇳', CLP: '🇨🇱', UYU: '🇺🇾', PYG: '🇵🇾', BOB: '🇧🇴', MXN: '🇲🇽',
  COP: '🇨🇴', CAD: '🇨🇦', AUD: '🇦🇺', XAU: '🥇', XAG: '🥈',
};

async function loadBcraCambiarias() {
  const container = document.getElementById('bcra-cambiarias-list');
  container.innerHTML = `<div class="loading"><div class="loading-spinner"></div><p>Cargando cotizaciones BCRA...</p></div>`;

  try {
    const res = await fetch('/api/bcra-cambiarias');
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const json = await res.json();
    _bcraCambiariasLoaded = true;

    const { fecha, destacadas = [], otras = [] } = json;
    const fechaFmt = fecha ? (() => { const [y,m,d] = fecha.split('-'); return `${d}/${m}/${y}`; })() : '';

    function renderMoneda(m) {
      const nombre = NOMBRE_MONEDA[m.codigo] || m.nombre;
      const flag = FLAG_MONEDA[m.codigo] || '';
      const cot = m.cotizacion.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
      return `<div class="bcra-card bcra-camb-card">
        <div class="bcra-card-nombre">${flag ? `<span style="margin-right:5px">${flag}</span>` : ''}<strong>${m.codigo}</strong> · ${nombre}</div>
        <div class="bcra-card-valor">$${cot}</div>
        <div class="bcra-card-meta"><span class="bcra-card-fecha">${fechaFmt}</span></div>
      </div>`;
    }

    let html = '';

    // Destacadas
    html += `<div class="bcra-category">
      <h3 class="bcra-cat-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        Principales
      </h3>
      <div class="bcra-cards">${destacadas.map(renderMoneda).join('')}</div>
    </div>`;

    // Todas las demás
    if (otras.length > 0) {
      html += `<div class="bcra-category">
        <h3 class="bcra-cat-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          Todas las divisas
        </h3>
        <div class="bcra-cards bcra-cards-otras">${otras.map(renderMoneda).join('')}</div>
      </div>`;
    }

    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<p style="color:var(--red);padding:20px">Error cargando cotizaciones: ${err.message}</p>`;
  }
}

// ─── Hipotecarios ────────────────────────────────────────────────────────────

async function loadHipotecarios() {
  const container = document.getElementById('hipotecarios-list');
  container.innerHTML = `<div class="loading"><div class="loading-spinner"></div><p>Cargando hipotecarios UVA...</p></div>`;

  try {
    const res = await fetch('/api/hipotecarios');
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const { data } = await res.json();
    if (!data || !data.length) {
      container.innerHTML = '<div class="loading">No se pudieron cargar los datos.</div>';
      return;
    }

    container.innerHTML = '';
    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

    data.forEach((item, idx) => {
      const initials = item.banco.substring(0, 2).toUpperCase();
      const logoSrc = HIPOTECARIO_LOGOS[item.banco] || null;
      const logoBg = HIPOTECARIO_COLORS[item.banco] || stringToColor(item.banco);

      const tags = [];
      tags.push({ text: `${item.plazo_max_anios} años`, type: 'billetera' });
      tags.push({ text: `Financia ${item.financiamiento}`, type: 'fci' });
      tags.push({ text: `Cuota/Ingreso ${item.relacion_cuota_ingreso}`, type: '' });

      const card = createCard({
        logo: initials,
        logoBg,
        logoSrc,
        name: item.banco,
        tags,
        rate: `${item.tna.toFixed(1)}%`,
        rateLabel: 'TNA',
        rateDate: `Actualizado: ${dateStr}`,
        highlighted: idx === 0,
      });

      container.appendChild(card);
    });

    // Render bar chart (ascending — lower TNA is better for hipotecarios)
    renderHipotecariosChart(data);
    initTooltips(container);
  } catch (err) {
    console.error('Error loading hipotecarios:', err);
    container.innerHTML = '<div class="loading">Error al cargar datos de hipotecarios.</div>';
  }
}

function renderHipotecariosChart(data) {
  const container = document.getElementById('hipotecarios-chart');
  if (!container || !data.length) return;

  const sorted = [...data].sort((a, b) => a.tna - b.tna);
  const maxTna = Math.max(...sorted.map(i => i.tna));
  const minTna = Math.min(...sorted.map(i => i.tna));

  function getBarColor(tna) {
    const ratio = 1 - ((tna - minTna) / (maxTna - minTna || 1));
    const h = 160;
    const s = 45 + ratio * 30;
    const l = 55 - ratio * 15;
    return `hsl(${h}, ${s}%, ${l}%)`;
  }

  const rows = sorted.map(item => {
    const pct = Math.max(15, (item.tna / maxTna) * 100);
    const color = getBarColor(item.tna);
    const logoSrc = HIPOTECARIO_LOGOS[item.banco];
    const initials = item.banco.substring(0, 2).toUpperCase();
    const logoBg = logoSrc ? 'transparent' : (HIPOTECARIO_COLORS[item.banco] || stringToColor(item.banco));
    const logoInner = logoSrc
      ? `<img src="${logoSrc}" alt="${item.banco}" onerror="this.parentElement.textContent='${initials}'">`
      : initials;

    return `
      <div class="chart-row">
        <div class="chart-logo" style="background:${logoBg}">${logoInner}</div>
        <div class="chart-bar-wrap">
          <div class="chart-bar" style="width:${pct}%;background:${color}">
            <span class="chart-value">${item.tna.toFixed(1)}%</span>
          </div>
        </div>
      </div>`;
  }).join('');

  container.innerHTML = rows;
}

async function loadLecaps() {
  const container = document.getElementById('lecaps-list');
  container.innerHTML = `<div class="loading"><div class="loading-spinner"></div><p>Cargando LECAPs...</p></div>`;

  try {
    // Fetch config (fallback prices) and live BYMA data in parallel
    const [config, bymaRes] = await Promise.all([
      fetch('/api/config').then(r => r.json()),
      fetch('/api/lecaps').then(r => r.ok ? r.json() : { data: [] }).catch(() => ({ data: [] }))
    ]);

    const lecaps = config.lecaps;
    if (!lecaps || !lecaps.letras || !lecaps.letras.length) {
      container.innerHTML = '<div class="loading">No se pudieron cargar los datos de LECAPs.</div>';
      return;
    }

    // Build live price lookup from BYMA
    const livePrices = {};
    for (const item of (bymaRes.data || [])) {
      livePrices[item.symbol] = item.price;
    }
    const hasLive = Object.keys(livePrices).length > 0;

    // Settlement is T+1 business day
    const today = new Date();
    const settlement = getSettlementDate(today);

    const items = lecaps.letras.filter(l => l.activo).filter(l => {
      const precio = livePrices[l.ticker] || l.precio;
      return precio && precio > 0;
    }).map(l => {
      // Use live price if available, fallback to config
      const precio = livePrices[l.ticker] || l.precio;
      const vto = parseLocalDate(l.fecha_vencimiento);
      const dias = Math.max(1, Math.round((vto - settlement) / (1000 * 60 * 60 * 24)));
      const ganancia = l.pago_final / precio;
      const tna = (ganancia - 1) * (365 / dias) * 100;
      const tir = (Math.pow(ganancia, 365 / dias) - 1) * 100;
      const meses = days360(settlement, vto) / 30;
      const tem = meses > 0 ? (Math.pow(ganancia, 1 / meses) - 1) * 100 : 0;
      return { ...l, precio, dias, meses, tna, tem, tir, live: !!livePrices[l.ticker] };
    });

    // Sort by days to maturity (ascending)
    items.sort((a, b) => a.dias - b.dias);

    // Render table
    const bestTir = Math.max(...items.map(i => i.tir));
    const settlStr = `${String(settlement.getDate()).padStart(2,'0')}/${String(settlement.getMonth()+1).padStart(2,'0')}/${settlement.getFullYear()}`;
    const rows = items.map(l => {
      const isBoncap = l.ticker.startsWith('T');
      const tipo = isBoncap ? 'boncap' : 'lecap';
      const isHighlighted = l.tir === bestTir ? ' highlighted-row' : '';
      const vtoDate = parseLocalDate(l.fecha_vencimiento);
      const vtoStr = `${String(vtoDate.getDate()).padStart(2,'0')}/${String(vtoDate.getMonth()+1).padStart(2,'0')}/${vtoDate.getFullYear()}`;
      return `<tr class="${isHighlighted}">
        <td><span class="lecap-ticker">${l.ticker}</span><span class="lecap-type-badge ${tipo}">${tipo.toUpperCase()}</span></td>
        <td>${l.precio.toFixed(2)}</td>
        <td>${l.pago_final.toFixed(3)}</td>
        <td>${l.dias}</td>
        <td>${vtoStr}</td>
        <td class="lecap-tna">${l.tna.toFixed(2)}%</td>
        <td class="lecap-tem">${l.tem.toFixed(2)}%</td>
        <td class="lecap-tir">${l.tir.toFixed(2)}%</td>
      </tr>`;
    }).join('');

    container.innerHTML = `
      <div class="lecap-table-wrap">
        <table class="lecap-table">
          <thead>
            <tr>
              <th class="col-ticker">Ticker</th>
              <th class="col-precio">Precio</th>
              <th class="col-pago">Pago Final</th>
              <th class="col-dias">Días</th>
              <th class="col-vto">Vencimiento</th>
              <th class="col-tna">TNA</th>
              <th class="col-tem">TEM</th>
              <th class="col-tir">TIR</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="calc-hint"><svg class="icon-hint" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg> <span>Click</span> en cualquier LECAP para abrir la calculadora</p>
      <p style="font-size:0.7rem;color:var(--text-tertiary);margin-top:6px">Liquidación T+1: ${settlStr}. Los días al vencimiento se calculan desde la fecha de liquidación.</p>`;

    // Make table sortable
    const table = container.querySelector('.lecap-table');
    if (table) makeSortable(table);

    // Add click handlers for calculator
    container.querySelectorAll('tbody tr').forEach((row, idx) => {
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => {
        const item = items[idx];
        if (item) openLecapCalculator(item);
      });
    });

    // Source note
    const source = document.getElementById('lecaps-source');
    const liveCount = items.filter(i => i.live).length;
    if (source) {
      if (hasLive) {
        source.textContent = '';
      } else {
        source.textContent = '';
      }
    }

    // Render scatter plot (TIR vs Días)
    renderLecapScatter(items);

    initTooltips(container);
  } catch (e) {
    console.error('Error loading LECAPs:', e);
    container.innerHTML = '<div class="loading">Error al cargar datos de LECAPs.</div>';
  }
}

function renderLecapScatter(items) {
  const canvas = document.getElementById('lecaps-scatter');
  if (!canvas || typeof Chart === 'undefined') return;

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = '#555555';
  const gridColor = '#1a1a1a';

  const lecapData = items.filter(l => !l.ticker.startsWith('T'));
  const boncapData = items.filter(l => l.ticker.startsWith('T'));

  // Polynomial regression (degree 2) for trend curve
  const allPoints = items.map(l => [l.dias, l.tir]).sort((a, b) => a[0] - b[0]);
  const curve = fitPolyCurve(allPoints, 2, 50);

  new Chart(canvas, {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'Curva',
          data: curve,
          type: 'line',
          borderColor: isDark ? 'rgba(160,160,168,0.4)' : 'rgba(0,0,0,0.15)',
          borderWidth: 2,
          borderDash: [6, 3],
          pointRadius: 0,
          pointHoverRadius: 0,
          tension: 0.4,
          fill: false,
          order: 2,
        },
        {
          label: 'LECAP',
          data: lecapData.map(l => ({ x: l.dias, y: l.tir, ticker: l.ticker })),
          backgroundColor: '#00d26a',
          borderColor: '#00d26a',
          pointRadius: 7,
          pointHoverRadius: 10,
          order: 1,
        },
        {
          label: 'BONCAP',
          data: boncapData.map(l => ({ x: l.dias, y: l.tir, ticker: l.ticker })),
          backgroundColor: '#4da6ff',
          borderColor: '#4da6ff',
          pointRadius: 7,
          pointHoverRadius: 10,
          pointStyle: 'rectRounded',
          order: 1,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 10, right: 20, bottom: 5, left: 5 } },
      plugins: {
        legend: {
          labels: {
            color: textColor,
            font: { family: "'Inter', sans-serif", size: 12 },
            filter: (item) => item.text !== 'Curva'
          }
        },
        tooltip: {
          filter: (item) => item.dataset.label !== 'Curva',
          callbacks: {
            label: (ctx) => {
              const p = ctx.raw;
              return `${p.ticker}: TIR ${p.y.toFixed(2)}% — ${p.x} días`;
            }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Días al vencimiento', color: textColor, font: { family: "'Inter', sans-serif", size: 12 } },
          grid: { color: gridColor },
          ticks: { color: textColor, font: { family: "'Inter', sans-serif" } }
        },
        y: {
          title: { display: true, text: 'TIR (%)', color: textColor, font: { family: "'Inter', sans-serif", size: 12 } },
          grid: { color: gridColor },
          ticks: { color: textColor, font: { family: "'Inter', sans-serif" }, callback: v => v.toFixed(1) + '%' }
        }
      }
    }
  });
}

// Fit polynomial of given degree, return n evenly-spaced {x,y} points
function fitPolyCurve(points, degree, n) {
  const xs = points.map(p => p[0]);
  const ys = points.map(p => p[1]);
  const m = degree + 1;

  // Build normal equations (Vandermonde)
  const A = [];
  const B = [];
  for (let i = 0; i < m; i++) {
    A[i] = [];
    for (let j = 0; j < m; j++) {
      A[i][j] = xs.reduce((s, x) => s + Math.pow(x, i + j), 0);
    }
    B[i] = xs.reduce((s, x, k) => s + ys[k] * Math.pow(x, i), 0);
  }

  // Gaussian elimination
  for (let i = 0; i < m; i++) {
    let maxRow = i;
    for (let k = i + 1; k < m; k++) if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) maxRow = k;
    [A[i], A[maxRow]] = [A[maxRow], A[i]];
    [B[i], B[maxRow]] = [B[maxRow], B[i]];
    for (let k = i + 1; k < m; k++) {
      const f = A[k][i] / A[i][i];
      for (let j = i; j < m; j++) A[k][j] -= f * A[i][j];
      B[k] -= f * B[i];
    }
  }
  const coeffs = new Array(m);
  for (let i = m - 1; i >= 0; i--) {
    coeffs[i] = B[i];
    for (let j = i + 1; j < m; j++) coeffs[i] -= A[i][j] * coeffs[j];
    coeffs[i] /= A[i][i];
  }

  // Generate curve points
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const result = [];
  for (let i = 0; i <= n; i++) {
    const x = minX + (maxX - minX) * (i / n);
    let y = 0;
    for (let j = 0; j < m; j++) y += coeffs[j] * Math.pow(x, j);
    result.push({ x: Math.round(x), y });
  }
  return result;
}

// ─── Soberanos USD section ───

async function loadSoberanos() {
  const container = document.getElementById('soberanos-list');
  container.innerHTML = `<div class="loading"><div class="loading-spinner"></div><p>Cargando bonos soberanos...</p></div>`;

  try {
    const [config, apiRes] = await Promise.all([
      fetch('/api/config').then(r => r.json()),
      fetch('/api/soberanos').then(r => r.ok ? r.json() : { data: [] }).catch(() => ({ data: [] }))
    ]);

    const soberanos = config.soberanos || {};
    const bondPrices = apiRes.data || [];

    if (!bondPrices.length) {
      container.innerHTML = '<div class="loading">No se pudieron cargar los datos de bonos soberanos.</div>';
      return;
    }

    const today = new Date();
    const items = [];

    for (const bp of bondPrices) {
      const bondConfig = soberanos[bp.symbol];
      if (!bondConfig || !bondConfig.flujos) continue;

      const priceUsd = bp.price_usd;
      if (priceUsd <= 0) continue;

      // Filter future flows only
      const futureFlows = bondConfig.flujos
        .map(f => ({ fecha: parseLocalDate(f.fecha), monto: f.monto }))
        .filter(f => f.fecha > today);

      if (futureFlows.length === 0) continue;

      // Calculate YTM
      const ytm = calcYTM(priceUsd, futureFlows, today);

      // Calculate modified duration
      const duration = calcDuration(priceUsd, futureFlows, today, ytm);

      // Years to maturity
      const lastFlow = futureFlows[futureFlows.length - 1].fecha;
      const yearsToMaturity = (lastFlow - today) / (365.25 * 24 * 60 * 60 * 1000);

      items.push({
        symbol: bp.symbol,
        ley: bondConfig.ley,
        par: bondConfig.par,
        priceUsd,
        ytm,
        duration,
        yearsToMaturity,
        vencimiento: bondConfig.vencimiento,
        volume: bp.volume,
        flujos: futureFlows,
      });
    }

    // Sort by duration (ascending)
    items.sort((a, b) => a.duration - b.duration);

    renderSoberanosTable(container, items);

    // Render yield curve
    renderYieldCurve(items);

    initTooltips(container);

    const source = document.getElementById('soberanos-source');
    if (source) {
      source.textContent = '';
    }
  } catch (e) {
    console.error('Error loading soberanos:', e);
    container.innerHTML = '<div class="loading">Error al cargar datos de bonos soberanos.</div>';
  }
}

// Newton-Raphson YTM calculation for bonds with multiple cash flows
function calcYTM(price, flows, settlementDate) {
  const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
  let r = 0.10; // initial guess 10%

  for (let iter = 0; iter < 100; iter++) {
    let pv = 0;
    let dpv = 0;
    for (const f of flows) {
      const t = (f.fecha - settlementDate) / MS_PER_YEAR;
      if (t <= 0) continue;
      const disc = Math.pow(1 + r, t);
      pv += f.monto / disc;
      dpv -= t * f.monto / (disc * (1 + r));
    }
    const diff = pv - price;
    if (Math.abs(diff) < 0.0001) break;
    if (Math.abs(dpv) < 1e-12) break;
    r -= diff / dpv;
    if (r < -0.5) r = -0.5;
    if (r > 2) r = 2;
  }
  return r * 100; // return as percentage
}

// Price from target TIR (inverse of calcYTM)
function calcPriceFromYTM(targetYTMpct, flows, settlementDate) {
  const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
  const r = targetYTMpct / 100;
  let pv = 0;
  for (const f of flows) {
    const t = (f.fecha - settlementDate) / MS_PER_YEAR;
    if (t <= 0) continue;
    pv += f.monto / Math.pow(1 + r, t);
  }
  return pv;
}

// Macaulay duration
function calcDuration(price, flows, settlementDate, ytmPct) {
  const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
  const r = ytmPct / 100;
  let weightedTime = 0;
  let totalPV = 0;
  for (const f of flows) {
    const t = (f.fecha - settlementDate) / MS_PER_YEAR;
    if (t <= 0) continue;
    const pv = f.monto / Math.pow(1 + r, t);
    weightedTime += t * pv;
    totalPV += pv;
  }
  return totalPV > 0 ? weightedTime / totalPV : 0;
}

let _soberanosItems = [];
function renderSoberanosTable(container, items) {
  _soberanosItems = items;
  const rows = items.map((item, idx) => {
    const leyClass = item.ley === 'NY' ? 'ley-ny' : 'ley-local';
    const leyLabel = item.ley === 'NY' ? 'NY' : 'Local';
    return `<tr data-sob-idx="${idx}" style="cursor:pointer">
      <td><span class="soberano-ticker">${item.symbol}</span><span class="soberano-ley ${leyClass}">${leyLabel}</span></td>
      <td class="col-ley">${leyLabel}</td>
      <td>US$${item.priceUsd.toFixed(2)}</td>
      <td class="col-duration">${item.duration.toFixed(1)}</td>
      <td class="col-vto">${item.vencimiento}</td>
      <td class="lecap-tir">${item.ytm.toFixed(2)}%</td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="soberanos-table-wrap">
      <table class="soberanos-table">
        <thead>
          <tr>
            <th>Ticker</th>
            <th class="col-ley">Ley</th>
            <th>Precio</th>
            <th class="col-duration">Duration</th>
            <th class="col-vto">Vencimiento</th>
            <th>TIR</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="calc-hint"><svg class="icon-hint" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg> Click en cualquier bono para abrir la calculadora</p>
    <p style="font-size:0.7rem;color:var(--text-tertiary);margin-top:6px">
      TIR (YTM) calculada con flujos de fondos futuros descontados. Duration en años (Macaulay).
    </p>`;

  container.querySelectorAll('tr[data-sob-idx]').forEach(tr => {
    tr.addEventListener('click', () => {
      const item = _soberanosItems[parseInt(tr.dataset.sobIdx)];
      if (item) openSoberanoCalculator(item);
    });
  });

  const table = container.querySelector('.soberanos-table');
  if (table) makeSortable(table);
}

function openSoberanoCalculator(item) {
  document.querySelector('.mundo-modal-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'mundo-modal-overlay';
  const inputStyle = 'display:block;font-size:1.1rem;font-weight:700;width:130px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text)';
  const leyLabel = item.ley === 'NY' ? 'Ley NY' : 'Ley Local';
  overlay.innerHTML = `
    <div class="mundo-modal">
      <div class="mundo-modal-header">
        <div><h3 style="margin:0">${item.symbol} — Calculadora</h3>
        <p style="margin:4px 0 0;color:var(--text-secondary);font-size:0.85rem">${leyLabel} — Vencimiento: ${item.vencimiento}</p></div>
        <button class="mundo-modal-close">&times;</button>
      </div>
      <div class="mundo-modal-body" style="padding:16px">
        <div style="display:flex;gap:20px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
          <div><label style="font-size:0.8rem;color:var(--text-secondary)">Precio USD</label>
            <input type="number" id="sob-calc-price" value="${item.priceUsd.toFixed(2)}" step="0.01" style="${inputStyle}"></div>
          <div><label style="font-size:0.8rem;color:var(--text-secondary)">Monto a invertir (USD)</label>
            <input type="number" id="sob-calc-monto" value="10000" step="100" style="${inputStyle}"></div>
          <div><label style="font-size:0.8rem;color:var(--text-secondary)">TIR</label>
            <div id="sob-calc-tir" style="font-size:1.5rem;font-weight:700;color:${item.ytm >= 0 ? 'var(--green)' : 'var(--red)'}">${item.ytm.toFixed(2)}%</div></div>
          <div><label style="font-size:0.8rem;color:var(--text-secondary)">Duration</label>
            <div id="sob-calc-duration" style="font-size:1.2rem;font-weight:600;color:var(--text)">${item.duration.toFixed(2)} años</div></div>
        </div>
        <div style="display:flex;gap:16px;align-items:center;margin-bottom:16px;flex-wrap:wrap;padding:8px 12px;background:var(--bg-subtle);border-radius:2px">
          <span style="font-size:0.75rem;color:var(--text-secondary);font-weight:600">Costos:</span>
          <div style="display:flex;align-items:center;gap:4px"><label style="font-size:0.75rem;color:var(--text-secondary)">Arancel %</label>
            <input type="number" id="sob-calc-arancel" value="0.45" step="0.01" style="width:70px;padding:4px 6px;font-size:0.85rem;font-weight:600;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text)"></div>
          <div style="display:flex;align-items:center;gap:4px"><label style="font-size:0.75rem;color:var(--text-secondary)">Impuestos %</label>
            <input type="number" id="sob-calc-impuestos" value="0.01" step="0.01" style="width:70px;padding:4px 6px;font-size:0.85rem;font-weight:600;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text)"></div>
        </div>
        <div style="display:flex;gap:16px;align-items:center;margin-bottom:16px;flex-wrap:wrap;padding:10px 12px;background:#0a1628;border:1px solid #1a3050;border-radius:2px">
          <span style="font-size:0.75rem;color:var(--blue);font-weight:700">TIR Objetivo:</span>
          <div style="display:flex;align-items:center;gap:4px"><label style="font-size:0.75rem;color:var(--text-secondary)">TIR %</label>
            <input type="number" id="sob-calc-target-tir" value="" placeholder="${item.ytm.toFixed(1)}" step="0.1" style="width:80px;padding:4px 6px;font-size:0.85rem;font-weight:600;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text)"></div>
          <div id="sob-calc-target-result" style="font-size:0.8rem;color:var(--text-secondary)">Ingresá una TIR para ver el precio implícito</div>
        </div>
        <div id="sob-calc-flows"></div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('.mundo-modal-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  function renderSobFlows() {
    const price = parseFloat(document.getElementById('sob-calc-price').value) || item.priceUsd;
    const arancel = parseFloat(document.getElementById('sob-calc-arancel').value) || 0;
    const impuestos = parseFloat(document.getElementById('sob-calc-impuestos').value) || 0;
    const costosPct = (arancel + impuestos) / 100;
    const effectivePrice = price * (1 + costosPct);
    const monto = parseFloat(document.getElementById('sob-calc-monto').value) || 10000;
    const nominales = monto / (effectivePrice / 100);
    const scale = nominales / 100;
    const flowsHTML = item.flujos.map(f => {
      const scaled = f.monto * scale;
      return `<tr><td>${f.fecha.toLocaleDateString('es-AR')}</td><td style="text-align:right">$${f.monto.toFixed(2)}</td><td style="text-align:right;font-weight:600">$${scaled.toFixed(2)}</td></tr>`;
    }).join('');
    const totalPer100 = item.flujos.reduce((s, f) => s + f.monto, 0);
    const totalScaled = totalPer100 * scale;
    const ganancia = totalScaled - monto;
    document.getElementById('sob-calc-flows').innerHTML = `
      <h4 style="margin:0 0 8px;font-size:0.85rem;color:var(--text-secondary)">Flujos de fondos</h4>
      <table style="width:100%;font-size:0.8rem;border-collapse:collapse">
        <thead><tr><th style="text-align:left;padding:4px 8px;border-bottom:1px solid var(--border)">Fecha</th>
        <th style="text-align:right;padding:4px 8px;border-bottom:1px solid var(--border)">Por 100 VN</th>
        <th style="text-align:right;padding:4px 8px;border-bottom:1px solid var(--border)">Tu inversión</th></tr></thead>
        <tbody>${flowsHTML}</tbody>
        <tfoot>
          <tr style="font-weight:700;border-top:2px solid var(--border)">
            <td style="padding:4px 8px">Total cobros</td><td style="text-align:right;padding:4px 8px">$${totalPer100.toFixed(2)}</td>
            <td style="text-align:right;padding:4px 8px">$${totalScaled.toFixed(2)}</td></tr>
          <tr style="font-weight:700;color:${ganancia >= 0 ? 'var(--green)' : 'var(--red)'}">
            <td style="padding:4px 8px">Ganancia</td><td></td>
            <td style="text-align:right;padding:4px 8px">${ganancia >= 0 ? '+' : ''}$${ganancia.toFixed(2)}</td></tr>
        </tfoot>
      </table>
      <p style="font-size:0.7rem;color:var(--text-tertiary);margin-top:8px">Comprás ${nominales.toFixed(0)} VN a US$${(price/100).toFixed(4)}/VN</p>`;
  }
  renderSobFlows();

  const priceInput = document.getElementById('sob-calc-price');
  const montoInput = document.getElementById('sob-calc-monto');
  const arancelInput = document.getElementById('sob-calc-arancel');
  const impuestosInput = document.getElementById('sob-calc-impuestos');
  const tirDisplay = document.getElementById('sob-calc-tir');
  const durDisplay = document.getElementById('sob-calc-duration');
  function recalcSob() {
    const newPrice = parseFloat(priceInput.value);
    if (!newPrice || newPrice <= 0) return;
    const arancel = parseFloat(arancelInput.value) || 0;
    const impuestos = parseFloat(impuestosInput.value) || 0;
    const costosPct = (arancel + impuestos) / 100;
    const effectivePrice = newPrice * (1 + costosPct);
    const today = new Date();
    const newYtm = calcYTM(effectivePrice, item.flujos, today);
    const newDur = calcDuration(effectivePrice, item.flujos, today, newYtm);
    if (isFinite(newYtm)) { tirDisplay.textContent = newYtm.toFixed(2) + '%'; tirDisplay.style.color = newYtm >= 0 ? 'var(--green)' : 'var(--red)'; }
    if (isFinite(newDur)) { durDisplay.textContent = newDur.toFixed(2) + ' años'; }
    renderSobFlows();
  }
  const targetTirInput = document.getElementById('sob-calc-target-tir');
  const targetResult = document.getElementById('sob-calc-target-result');
  function recalcTargetTir() {
    const targetTir = parseFloat(targetTirInput.value);
    if (!targetTir && targetTir !== 0) { targetResult.innerHTML = 'Ingresá una TIR para ver el precio implícito'; return; }
    const today = new Date();
    const impliedPrice = calcPriceFromYTM(targetTir, item.flujos, today);
    const currentPrice = parseFloat(priceInput.value) || item.priceUsd;
    const upside = ((impliedPrice - currentPrice) / currentPrice * 100);
    const upsideColor = upside >= 0 ? 'var(--green)' : 'var(--red)';
    targetResult.innerHTML = `Precio: <strong style="color:var(--accent)">US$${impliedPrice.toFixed(2)}</strong> &nbsp;|&nbsp; Upside: <strong style="color:${upsideColor}">${upside >= 0 ? '+' : ''}${upside.toFixed(1)}%</strong> vs actual`;
  }
  targetTirInput.addEventListener('input', recalcTargetTir);
  priceInput.addEventListener('input', () => { recalcSob(); recalcTargetTir(); });
  montoInput.addEventListener('input', renderSobFlows);
  arancelInput.addEventListener('input', recalcSob);
  impuestosInput.addEventListener('input', recalcSob);
  recalcSob();
}

let soberanosChart = null;
function renderYieldCurve(items) {
  const canvas = document.getElementById('soberanos-scatter');
  if (!canvas) return;
  if (soberanosChart) soberanosChart.destroy();

  const textColor = '#555555';
  const gridColor = '#1a1a1a';

  const localBonds = items.filter(i => i.ley === 'local');
  const nyBonds = items.filter(i => i.ley === 'NY');

  // Polynomial regression curves (degree 2, 300 points for smoothness)
  const localPoints = localBonds.map(i => [i.duration, i.ytm]);
  const nyPoints = nyBonds.map(i => [i.duration, i.ytm]);
  const localCurve = localPoints.length >= 3 ? fitPolyCurve(localPoints, 2, 300) : [];
  const nyCurve = nyPoints.length >= 3 ? fitPolyCurve(nyPoints, 2, 300) : [];

  // Use labels array for x-axis to make line charts work properly
  // Collect all x values and curve x values, build unified x scale
  const datasets = [];

  if (localCurve.length) {
    datasets.push({
      label: 'Ley Local (curva)',
      data: localCurve,
      borderColor: '#ff9500',
      borderWidth: 1.5,
      borderDash: [6, 3],
      pointRadius: 0,
      pointHitRadius: 0,
      fill: false,
      order: 2,
    });
  }
  if (nyCurve.length) {
    datasets.push({
      label: 'Ley NY (curva)',
      data: nyCurve,
      borderColor: '#4da6ff',
      borderWidth: 1.5,
      borderDash: [6, 3],
      pointRadius: 0,
      pointHitRadius: 0,
      fill: false,
      order: 2,
    });
  }

  datasets.push({
    label: 'Ley Local',
    data: localBonds.map(i => ({ x: i.duration, y: i.ytm, label: i.symbol })),
    backgroundColor: '#ff9500',
    borderColor: '#ff9500',
    borderWidth: 1.5,
    pointRadius: 7,
    pointHoverRadius: 9,
    showLine: false,
    order: 1,
  });

  datasets.push({
    label: 'Ley NY',
    data: nyBonds.map(i => ({ x: i.duration, y: i.ytm, label: i.symbol })),
    backgroundColor: '#4da6ff',
    borderColor: '#4da6ff',
    borderWidth: 1.5,
    pointRadius: 7,
    pointHoverRadius: 9,
    showLine: false,
    order: 1,
  });

  soberanosChart = new Chart(canvas, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: textColor, filter: (item) => !item.text.includes('curva') } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const d = ctx.raw;
              return `${d.label || ''}: TIR ${d.y?.toFixed(2) || ctx.parsed.y.toFixed(2)}%`;
            }
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Duration (años)', color: textColor },
          grid: { color: gridColor },
          ticks: { color: textColor },
        },
        y: {
          type: 'linear',
          title: { display: true, text: 'TIR (%)', color: textColor },
          grid: { color: gridColor },
          ticks: { color: textColor, callback: v => v.toFixed(1) + '%' },
        }
      }
    }
  });
}

// ─── AI Chat Assistant ───
(function initChat() {
  const chatInput = document.getElementById('chat-input');
  const chatSend = document.getElementById('chat-send');
  const chatMessages = document.getElementById('chat-messages');
  const chatSuggestions = document.getElementById('chat-suggestions');
  if (!chatInput) return;

  let history = [];
  let isLoading = false;

  // Suggestion buttons
  chatSuggestions.addEventListener('click', (e) => {
    const btn = e.target.closest('.chat-suggestion');
    if (btn) sendMessage(btn.dataset.q);
  });

  // Send on Enter
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(chatInput.value);
    }
  });

  chatSend.addEventListener('click', () => sendMessage(chatInput.value));

  function addMessage(role, content) {
    chatMessages.classList.add('has-messages');
    const div = document.createElement('div');
    div.className = `chat-msg ${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'chat-msg-bubble';
    // Simple markdown: **bold**, bullet lists, newlines
    let html = content
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/^- (.+)/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
      .replace(/\n/g, '<br>');
    bubble.innerHTML = html;
    div.appendChild(bubble);
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function showTyping() {
    const div = document.createElement('div');
    div.className = 'chat-msg assistant';
    div.id = 'chat-typing';
    div.innerHTML = `<div class="chat-typing"><div class="chat-typing-dot"></div><div class="chat-typing-dot"></div><div class="chat-typing-dot"></div></div>`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function hideTyping() {
    const el = document.getElementById('chat-typing');
    if (el) el.remove();
  }

  async function sendMessage(text) {
    if (!text || !text.trim() || isLoading) return;
    text = text.trim();
    chatInput.value = '';

    // Hide suggestions after first message
    if (chatSuggestions) chatSuggestions.style.display = 'none';

    addMessage('user', text);
    history.push({ role: 'user', content: text });

    isLoading = true;
    chatSend.disabled = true;
    chatInput.disabled = true;
    showTyping();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: history.slice(-6) }),
      });

      hideTyping();

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        addMessage('assistant', err.error || 'Error al consultar el asistente. Intentá de nuevo.');
      } else {
        const data = await res.json();
        addMessage('assistant', data.response);
        history.push({ role: 'assistant', content: data.response });
      }
    } catch (e) {
      hideTyping();
      addMessage('assistant', 'Error de conexión. Intentá de nuevo.');
    }

    isLoading = false;
    chatSend.disabled = false;
    chatInput.disabled = false;
    chatInput.focus();
  }
})();

// ─── Mundo (Global Monitor) ───
function drawSparkline(canvasId, data, isUp) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 2;

  const color = isUp ? getComputedStyle(document.documentElement).getPropertyValue('--green').trim()
                     : getComputedStyle(document.documentElement).getPropertyValue('--red').trim();

  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';

  let lastX, lastY;
  for (let i = 0; i < data.length; i++) {
    const x = (i / (data.length - 1)) * (w - pad * 2) + pad;
    const y = h - pad - ((data[i] - min) / range) * (h - pad * 2);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    lastX = x;
    lastY = y;
  }
  ctx.stroke();

  // Pulsing dot at the end — CSS overlay
  const parent = canvas.parentElement;
  parent.style.position = 'relative';
  const dot = document.createElement('div');
  dot.className = 'spark-dot';
  dot.style.left = (lastX / w * 100) + '%';
  dot.style.top = (lastY / h * 100) + '%';
  dot.style.background = color;
  dot.style.boxShadow = `0 0 6px ${color}`;
  parent.appendChild(dot);
}

async function loadMundo() {
  const grid = document.getElementById('mundo-grid');
  grid.innerHTML = `<div class="loading"><div class="loading-spinner"></div><p>Cargando datos globales...</p></div>`;

  try {
    const res = await fetch('/api/mundo');
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const { data, updated } = await res.json();

    grid.innerHTML = '';

    // Group items by category (preserving API order)
    const groups = [];
    const groupMap = {};
    data.forEach(item => {
      if (item.price === null) return;
      const g = item.group || 'Otros';
      if (!groupMap[g]) { groupMap[g] = []; groups.push(g); }
      groupMap[g].push(item);
    });

    // Split groups into two columns for mobile layout
    const leftGroups = groups.slice(0, Math.ceil(groups.length / 2));
    const rightGroups = groups.slice(Math.ceil(groups.length / 2));

    const colLeft = document.createElement('div');
    colLeft.className = 'mundo-col';
    const colRight = document.createElement('div');
    colRight.className = 'mundo-col';
    grid.appendChild(colLeft);
    grid.appendChild(colRight);

    function renderGroupInto(container, groupName) {
      const header = document.createElement('div');
      header.className = 'mundo-group-header';
      header.textContent = groupName;
      container.appendChild(header);

      groupMap[groupName].forEach(item => {
        const isRate = item.group === 'Tasas';
        const isUp = item.change >= 0;
        const changeColor = isUp ? 'var(--green)' : 'var(--red)';
        const arrow = isUp ? '▲' : '▼';

        const isAgro = item.group === 'Agro';
        let priceStr;
        if (isRate) {
          priceStr = item.price.toFixed(3) + '%';
        } else if (isAgro) {
          priceStr = item.price.toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' /Tn';
        } else if (item.price >= 10000) {
          priceStr = item.price.toLocaleString('es-AR', { maximumFractionDigits: 0 });
        } else if (item.price >= 100) {
          priceStr = item.price.toLocaleString('es-AR', { maximumFractionDigits: 2 });
        } else {
          priceStr = item.price.toLocaleString('es-AR', { maximumFractionDigits: 4 });
        }

        const canvasId = `spark-${item.id}`;
        const card = document.createElement('div');
        card.className = 'mundo-card';
        card.addEventListener('click', () => openMundoDetail(item.id, item.name, item.icon));
        card.innerHTML = `
          <div class="mundo-icon">${item.icon}</div>
          <div class="mundo-info">
            <div class="mundo-name">${item.name}</div>
            <div class="mundo-price">${priceStr}</div>
          </div>
          <div class="mundo-spark"><canvas id="${canvasId}" width="60" height="24"></canvas></div>
          <div class="mundo-change" style="color:${changeColor}">
            <span class="mundo-arrow">${arrow}</span>
            <span>${Math.abs(item.change).toFixed(2)}%</span>
          </div>
        `;
        container.appendChild(card);

        if (item.sparkline && item.sparkline.length > 1) {
          drawSparkline(canvasId, item.sparkline, isUp);
        }
      });
    }

    leftGroups.forEach(g => renderGroupInto(colLeft, g));
    rightGroups.forEach(g => renderGroupInto(colRight, g));

    const src = document.getElementById('mundo-source');
    if (src) src.textContent = '';
  } catch (e) {
    grid.innerHTML = '<div class="loading">Error al cargar datos globales.</div>';
    console.error('Mundo error:', e);
  }
}

// ─── Hot US Movers ───

async function loadHotMovers() {
  const grid = document.getElementById('hot-grid');
  if (!grid) return;
  grid.innerHTML = `<div class="loading"><div class="loading-spinner"></div><p>Cargando movers...</p></div>`;

  try {
    const res = await fetch('/api/hot-movers');
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const { data } = await res.json();

    if (!data || !data.length) {
      grid.innerHTML = '<div class="loading">Sin datos de movers disponibles.</div>';
      return;
    }

    grid.innerHTML = '';
    data.forEach((item, i) => {
      const isUp = item.change >= 0;
      const changeColor = isUp ? 'var(--green)' : 'var(--red)';
      const arrow = isUp ? '▲' : '▼';
      const sign = isUp ? '+' : '';

      const card = document.createElement('div');
      card.className = 'hot-card';
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => openMundoDetail(item.symbol.toLowerCase(), item.name, '', item.symbol));
      const logoUrl = `https://static.svvytrdr.com/logos/${item.symbol}.webp`;
      card.innerHTML = `
        <img class="hot-logo" src="${logoUrl}" alt="${item.symbol}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
        <div class="hot-logo-fallback" style="display:none">${item.symbol.slice(0,2)}</div>
        <div class="hot-info">
          <div class="hot-symbol">${item.symbol}</div>
          <div class="hot-name">${item.name}</div>
        </div>
        <div class="hot-right">
          <div class="hot-price">$${item.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div class="hot-change" style="color:${changeColor}">${sign}${item.change.toFixed(2)}%</div>
        </div>
      `;
      grid.appendChild(card);
    });
  } catch (e) {
    grid.innerHTML = '<div class="loading">Error al cargar movers.</div>';
    console.error('Hot movers error:', e);
  }
}

// ─── Comparador ───

let _inflacionData = null;
let _inflacionSelected = {}; // { productId: bool }

function tnaToMonthly(tna) {
  // TNA with daily compounding: (1 + TNA/365)^30 - 1
  return (Math.pow(1 + tna / 100 / 365, 30) - 1) * 100;
}

function tirToMonthly(tir) {
  return (Math.pow(1 + tir / 100, 30 / 365) - 1) * 100;
}

async function loadInflacion() {
  const chart = document.getElementById('inflacion-chart');
  const togglesEl = document.getElementById('inflacion-toggles');
  if (!chart) return;
  chart.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Cargando datos...</p></div>';

  try {
    const [inflRes, pfRes, pfPeriodicoRes, fciRes, configRes, lecapsRes] = await Promise.all([
      fetch('https://api.argentinadatos.com/v1/finanzas/indices/inflacion'),
      fetch('https://api.argentinadatos.com/v1/finanzas/tasas/plazoFijo'),
      fetch('https://api.argentinadatos.com/v1/finanzas/tasas/plazoFijoUvaPagoPeriodico').catch(() => null),
      fetch('/api/fci'),
      fetch('/api/config'),
      fetch('/api/lecaps').then(r => r.ok ? r.json() : { data: [] }).catch(() => ({ data: [] })),
    ]);

    const inflData = await inflRes.json();
    const pfData = await pfRes.json();
    const pfPeriodicoData = pfPeriodicoRes ? await pfPeriodicoRes.json() : [];
    const fciData = await fciRes.json();
    const config = await configRes.json();

    const lastInflacion = inflData[inflData.length - 1];
    const inflMensual = lastInflacion.valor;
    const inflFecha = lastInflacion.fecha;

    const products = [];
    const AR_FLAG = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18"><rect width="18" height="6" fill="#74acdf"/><rect y="6" width="18" height="6" fill="#fff"/><rect y="12" width="18" height="6" fill="#74acdf"/><circle cx="9" cy="9" r="2" fill="#f6b40e"/></svg>');

    // Billeteras (sin especiales)
    const billeteras = (config.garantizados || []).filter(g => g.activo);
    for (const b of billeteras) {
      products.push({
        id: 'bil-' + b.id, name: b.nombre, tna: b.tna, monthly: tnaToMonthly(b.tna),
        category: 'billeteras', logo: b.logo, logoBg: b.logo_bg, logoSrc: getLogoForItem(b)
      });
    }

    // Plazo Fijo - all banks
    const pfAll = [...pfData].sort((a, b) => (b.tnaClientes || 0) - (a.tnaClientes || 0));
    for (const pf of pfAll) {
      const tna = (pf.tnaClientes || 0) * 100;
      if (tna <= 0) continue;
      const displayName = formatBankName(pf.entidad);
      const initials = displayName.replace(/^Banco\s*/i, '').substring(0, 2).toUpperCase();
      products.push({
        id: 'pf-' + pf.entidad, name: displayName, tna, monthly: tnaToMonthly(tna),
        category: 'plazofijo', logo: initials, logoBg: stringToColor(pf.entidad),
        logoSrc: PLAZO_FIJO_LOGOS[displayName] || pf.logo || null
      });
    }

    // Plazo Fijo Periódico (UVA)
    const bna = Array.isArray(pfPeriodicoData) ? pfPeriodicoData.find(item => item?.id === 'bna' || /naci[oó]n/i.test(item?.entidad || '')) : null;
    const tasasUva = Array.isArray(bna?.tasas) ? bna.tasas : [];
    for (const tramo of tasasUva) {
      const tna = typeof tramo.tna === 'number' ? tramo.tna * 100 : parseFloat(tramo.tna) || 0;
      if (tna <= 0) continue;
      const plazo = tramo.plazoMinDias ? `${tramo.plazoMinDias}d` : '';
      products.push({
        id: 'pfp-' + (tramo.plazoMinDias || 0), name: `BNA UVA ${plazo}`, tna, monthly: inflMensual + tnaToMonthly(tna),
        category: 'pfperiodico', logo: 'BN', logoBg: stringToColor('Banco Nación UVA'),
        logoSrc: PLAZO_FIJO_LOGOS['Banco Nación'] || null
      });
    }

    // FCIs - all from config with live TNA
    const configFcis = (config.fcis || []).filter(f => f.activo);
    const fciList = (fciData.data || fciData || []);
    const fciMap = {};
    for (const f of fciList) fciMap[f.nombre] = f;
    for (const cf of configFcis) {
      const live = fciMap[cf.nombre];
      if (!live || live.tna <= 0) continue;
      const entidad = live.entidad || cf.entidad || cf.nombre;
      products.push({
        id: 'fci-' + cf.id, name: cf.nombre, tna: live.tna, monthly: tnaToMonthly(live.tna),
        category: 'fcis', logo: entidad.substring(0, 2).toUpperCase(),
        logoBg: stringToColor(entidad), logoSrc: getLogoForEntity(entidad)
      });
    }

    // LECAPs / BONCAPs
    const lecaps = config.lecaps;
    const livePrices = {};
    for (const item of (lecapsRes.data || [])) livePrices[item.symbol] = item.price;
    if (lecaps && lecaps.letras) {
      const today = new Date();
      const settlement = typeof getSettlementDate === 'function' ? getSettlementDate(today) : today;
      for (const l of lecaps.letras.filter(l => l.activo)) {
        const precio = livePrices[l.ticker] || l.precio;
        if (!precio || precio <= 0) continue;
        const vto = parseLocalDate(l.fecha_vencimiento);
        const dias = Math.max(1, Math.round((vto - settlement) / (1000 * 60 * 60 * 24)));
        if (dias <= 0) continue;
        const ganancia = l.pago_final / precio;
        const tir = (Math.pow(ganancia, 365 / dias) - 1) * 100;
        products.push({
          id: 'lecap-' + l.ticker, name: l.ticker + (l.tipo === 'BONCAP' ? ' (BONCAP)' : ''),
          tna: tir, monthly: tirToMonthly(tir),
          category: 'lecaps', logo: l.ticker.slice(0, 2), logoBg: '#1a5276', logoSrc: AR_FLAG
        });
      }
    }

    _inflacionData = { inflMensual, inflFecha, products };

    // Default: all billeteras selected
    _inflacionSelected = {};
    for (const p of products) {
      _inflacionSelected[p.id] = p.category === 'billeteras';
    }

    renderInflacionToggles(togglesEl);
    renderInflacionChart();

    const srcEl = document.getElementById('inflacion-source');
    const mesLabel = new Date(inflFecha + 'T12:00:00').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
    if (srcEl) srcEl.textContent = `Inflación de ${mesLabel}: ${inflMensual}% mensual — Fuente: ArgentinaDatos / INDEC`;
  } catch (e) {
    console.error('Comparador error:', e);
    chart.innerHTML = '<div class="loading">Error al cargar datos.</div>';
  }
}

function renderInflacionToggles(container) {
  if (!container || !_inflacionData) return;
  const { products } = _inflacionData;

  const categories = [
    { key: 'billeteras', label: 'Billeteras y Cuentas' },
    { key: 'plazofijo', label: 'Plazo Fijo' },
    { key: 'pfperiodico', label: 'Plazo Fijo Periódico' },
    { key: 'fcis', label: 'Fondos' },
    { key: 'lecaps', label: 'LECAPs / BONCAPs' },
  ];

  let html = '';
  for (const cat of categories) {
    const catProducts = products.filter(p => p.category === cat.key);
    const anySelected = catProducts.some(p => _inflacionSelected[p.id]);

    html += `<div class="infl-cat">`;
    html += `<button class="infl-cat-header${anySelected ? ' active' : ''}" data-cat="${cat.key}">${cat.label}</button>`;
    html += `<div class="infl-chips">`;
    for (const p of catProducts) {
      const sel = _inflacionSelected[p.id];
      const safeLogoSrc = p.logoSrc?.replace(/^http:\/\//, 'https://');
      const logoInner = safeLogoSrc
        ? `<img src="${safeLogoSrc}" alt="${p.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="infl-chip-fallback" style="display:none;background:${p.logoBg}">${p.logo}</span>`
        : `<span class="infl-chip-fallback" style="background:${p.logoBg}">${p.logo}</span>`;
      html += `<button class="infl-chip${sel ? ' active' : ''}" data-id="${p.id}">
        <span class="infl-chip-logo">${logoInner}</span>
        <span class="infl-chip-name">${p.name.replace(/^Banco\s*/i, '')}</span>
      </button>`;
    }
    html += `</div></div>`;
  }

  container.innerHTML = html;

  // Category header: toggle all in category
  container.querySelectorAll('.infl-cat-header').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.cat;
      const catProducts = products.filter(p => p.category === cat);
      const allOn = catProducts.every(p => _inflacionSelected[p.id]);
      for (const p of catProducts) _inflacionSelected[p.id] = !allOn;
      renderInflacionToggles(container);
      renderInflacionChart();
    });
  });

  // Individual chip toggle
  container.querySelectorAll('.infl-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      _inflacionSelected[id] = !_inflacionSelected[id];
      btn.classList.toggle('active');
      // Update cat header state
      const product = products.find(p => p.id === id);
      if (product) {
        const catProducts = products.filter(p => p.category === product.category);
        const header = container.querySelector(`.infl-cat-header[data-cat="${product.category}"]`);
        if (header) header.classList.toggle('active', catProducts.some(p => _inflacionSelected[p.id]));
      }
      renderInflacionChart();
    });
  });
}

function renderInflacionChart() {
  const container = document.getElementById('inflacion-chart');
  if (!container || !_inflacionData) return;

  const { inflMensual, products } = _inflacionData;
  const visible = products.filter(p => _inflacionSelected[p.id]);

  if (visible.length === 0) {
    container.innerHTML = '<p style="color:var(--text-tertiary);font-size:0.85rem;padding:16px 0">Seleccioná productos para comparar contra la inflación.</p>';
    return;
  }

  const inflItem = { name: 'Inflación (IPC)', monthly: inflMensual, isInflation: true };
  const allItems = [...visible, inflItem].sort((a, b) => b.monthly - a.monthly);
  const maxVal = Math.max(...allItems.map(i => i.monthly));
  const minVal = Math.min(...allItems.map(i => i.monthly));
  // Use a floor so bar differences are more visible
  const chartMin = minVal * 0.85;
  const chartRange = maxVal - chartMin || 1;

  function getBarColor(val) {
    const ratio = (val - minVal) / (maxVal - minVal || 1);
    return `hsl(160, ${45 + ratio * 30}%, ${55 - ratio * 15}%)`;
  }

  const rows = allItems.map(item => {
    const pct = Math.max(8, ((item.monthly - chartMin) / chartRange) * 100);
    const color = item.isInflation ? 'var(--yellow, #f9ab00)' : getBarColor(item.monthly);

    let logoHtml;
    if (item.isInflation) {
      logoHtml = `<div class="chart-logo" style="background:var(--yellow, #f9ab00);font-size:0.6rem">IPC</div>`;
    } else {
      const safeLogoSrc = item.logoSrc?.replace(/^http:\/\//, 'https://');
      const logoInner = safeLogoSrc
        ? `<img src="${safeLogoSrc}" alt="${item.name}" onerror="this.parentElement.textContent='${item.logo}'">`
        : item.logo;
      const logoBg = safeLogoSrc ? 'transparent' : (item.logoBg || '#555');
      logoHtml = `<div class="chart-logo" style="background:${logoBg}">${logoInner}</div>`;
    }

    const label = item.name;
    return `
      <div class="chart-row inflacion-row${item.isInflation ? ' inflacion-baseline' : ''}">
        ${logoHtml}
        <div class="chart-bar-wrap">
          <div class="chart-bar" style="width:${pct}%;background:${color}">
            <span class="chart-bar-label">${label}</span>
            <span class="chart-value">${item.monthly.toFixed(2)}%</span>
          </div>
        </div>
      </div>`;
  }).join('');

  container.innerHTML = rows;
}

// ─── Earnings Calendar ───

function formatMcap(val) {
  if (val >= 1e12) return `$${(val / 1e12).toFixed(1)}T`;
  if (val >= 1e9) return `$${(val / 1e9).toFixed(0)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(0)}M`;
  return `$${val.toLocaleString()}`;
}

function earningsTimeLabel(time) {
  if (!time) return '';
  const h = parseInt(time.split(':')[0], 10);
  if (h < 9) return 'Pre-market';
  if (h >= 16) return 'Post-market';
  return 'During';
}

function earningsLogoHtml(symbol, size, cls, fallbackCls) {
  const url = `https://static.svvytrdr.com/logos/${symbol}.webp`;
  return `<img class="${cls}" src="${url}" alt="${symbol}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="${fallbackCls}" style="display:none">${symbol.slice(0, 2)}</div>`;
}

const _EARN_DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const _EARN_MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function formatEarningsDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return `${_EARN_DAYS[d.getDay()]} ${d.getDate()} ${_EARN_MONTHS[d.getMonth()]}`;
}

async function loadEarnings() {
  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() + 14);
  const fmt = d => d.toISOString().split('T')[0];
  const startStr = fmt(today);
  const endStr = fmt(end);

  const grid = document.getElementById('earnings-timeline');
  if (grid) grid.innerHTML = `<div class="loading"><div class="loading-spinner"></div><p>Cargando earnings...</p></div>`;

  try {
    const res = await fetch(`/api/earnings?start=${startStr}&end=${endStr}`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const data = await res.json();

    const days = Object.keys(data).filter(d => d >= startStr).sort();
    const TOP_PER_DAY = 5;
    const parsed = {};
    for (const day of days) {
      const items = (data[day] || [])
        .filter(e => e.isDateConfirmed && e.marketCap > 0)
        .sort((a, b) => b.marketCap - a.marketCap)
        .slice(0, TOP_PER_DAY);
      if (items.length) parsed[day] = items;
    }
    const activeDays = Object.keys(parsed).sort().slice(0, 7);

    renderEarningsTimeline(activeDays, parsed);
  } catch (e) {
    console.error('Earnings error:', e);
    if (grid) grid.innerHTML = '<div class="loading">Error al cargar earnings.</div>';
  }
}

function renderEarningsTimeline(days, data) {
  const grid = document.getElementById('earnings-timeline');
  if (!grid) return;
  grid.innerHTML = '';

  for (const day of days) {
    const items = data[day];
    const card = document.createElement('div');
    card.className = 'earnings-day-card';
    const itemsHtml = items.map(e => `
      <div class="earnings-day-item">
        ${earningsLogoHtml(e.symbol, 24, 'earnings-day-logo', 'earnings-day-item-fallback')}
        <span class="earnings-day-ticker">${e.symbol}</span>
        <span class="earnings-day-time">${earningsTimeLabel(e.earningsTime)}</span>
      </div>
    `).join('');
    card.innerHTML = `
      <div class="earnings-day-header">${formatEarningsDate(day)}</div>
      <div class="earnings-day-items">${itemsHtml}</div>
    `;
    grid.appendChild(card);
  }
}

// ─── Mundo Detail Modal ───
let mundoDetailChart = null;
let mundoDetailPoints = [];

function formatChartPrice(val) {
  if (val >= 10000) return val.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (val >= 100) return val.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return val.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function updateMundoHeader(points, hoveredIndex) {
  const priceEl = document.getElementById('mundo-modal-price');
  const changeEl = document.getElementById('mundo-modal-change');
  const dateEl = document.getElementById('mundo-modal-date');
  if (!priceEl || !points.length) return;

  const first = points[0].v;
  const current = hoveredIndex != null ? points[hoveredIndex].v : points[points.length - 1].v;
  const diff = current - first;
  const pct = first ? (diff / first) * 100 : 0;
  const isUp = diff >= 0;
  const sign = isUp ? '+' : '';
  const color = isUp ? 'var(--green)' : 'var(--red)';

  priceEl.textContent = formatChartPrice(current);

  changeEl.style.color = color;
  changeEl.textContent = `${sign}${formatChartPrice(diff)} (${sign}${pct.toFixed(2)}%)`;

  if (hoveredIndex != null) {
    const d = new Date(points[hoveredIndex].t);
    dateEl.textContent = d.toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } else {
    dateEl.textContent = '';
  }
}

// Crosshair plugin for Chart.js
const crosshairPlugin = {
  id: 'crosshair',
  afterDraw(chart) {
    if (chart._crosshairX == null) return;
    const { ctx, chartArea: { top, bottom } } = chart;
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(150,150,150,0.6)';
    ctx.moveTo(chart._crosshairX, top);
    ctx.lineTo(chart._crosshairX, bottom);
    ctx.stroke();
    ctx.restore();
  }
};

async function openMundoDetail(id, name, icon, ticker) {
  // Remove existing modal
  const existing = document.getElementById('mundo-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'mundo-modal';
  modal.className = 'mundo-modal-overlay';
  modal.innerHTML = `
    <div class="mundo-modal">
      <div class="mundo-modal-header">
        <div class="mundo-modal-header-left">
          <span class="mundo-modal-title">${icon ? icon + ' ' : ''}${name}</span>
          <div class="mundo-modal-price-row">
            <span class="mundo-modal-price" id="mundo-modal-price">-</span>
            <span class="mundo-modal-change" id="mundo-modal-change"></span>
          </div>
          <span class="mundo-modal-date" id="mundo-modal-date"></span>
        </div>
        <div class="mundo-modal-header-right">
          <div class="mundo-modal-tabs">
            <button class="mundo-range-btn active" data-range="1d">1D</button>
            <button class="mundo-range-btn" data-range="5d">5D</button>
            <button class="mundo-range-btn" data-range="1mo">1M</button>
            <button class="mundo-range-btn" data-range="3mo">3M</button>
          </div>
          <button class="mundo-modal-close">&times;</button>
        </div>
      </div>
      <div class="mundo-modal-body">
        <canvas id="mundo-detail-chart"></canvas>
      </div>
      <div class="mundo-modal-loading" id="mundo-modal-loading">Cargando...</div>
    </div>
  `;
  document.body.appendChild(modal);

  // Close handlers
  modal.querySelector('.mundo-modal-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  // Build fetch URL helper
  const buildUrl = (range) => ticker
    ? `/api/mundo?ticker=${encodeURIComponent(ticker)}&name=${encodeURIComponent(name)}&range=${range}`
    : `/api/mundo?symbol=${id}&range=${range}`;

  // Range buttons
  modal.querySelectorAll('.mundo-range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('.mundo-range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadMundoChart(buildUrl, btn.dataset.range);
    });
  });

  loadMundoChart(buildUrl, '1d');
}

async function loadMundoChart(buildUrl, range) {
  const loading = document.getElementById('mundo-modal-loading');
  if (loading) loading.style.display = 'block';

  try {
    const res = await fetch(buildUrl(range));
    if (!res.ok) throw new Error('API error');
    const data = await res.json();

    if (loading) loading.style.display = 'none';

    const canvas = document.getElementById('mundo-detail-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (mundoDetailChart) mundoDetailChart.destroy();

    const points = data.points || [];
    mundoDetailPoints = points;
    if (!points.length) return;

    // Update header with default (last point)
    updateMundoHeader(points, null);

    const isUp = points[points.length - 1].v >= points[0].v;
    const lineColor = isUp ? '#00d26a' : '#ff3b3b';
    const bgColor = isUp ? 'rgba(0,210,106,0.08)' : 'rgba(255,59,59,0.08)';

    mundoDetailChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: points.map(p => p.t),
        datasets: [{
          data: points.map(p => p.v),
          borderColor: lineColor,
          backgroundColor: bgColor,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: lineColor,
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2,
          fill: true,
          tension: 0.3,
        }]
      },
      plugins: [crosshairPlugin],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        interaction: { intersect: false, mode: 'index' },
        onHover: (event, elements, chart) => {
          if (elements.length > 0) {
            const idx = elements[0].index;
            chart._crosshairX = elements[0].element.x;
            updateMundoHeader(mundoDetailPoints, idx);
          } else {
            chart._crosshairX = null;
            updateMundoHeader(mundoDetailPoints, null);
          }
          chart.draw();
        },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
        },
        scales: {
          x: {
            display: true,
            ticks: {
              color: 'var(--text-tertiary)',
              maxTicksLimit: 6,
              font: { size: 11 },
              callback: function(val, index) {
                const ts = points[index]?.t;
                if (!ts) return '';
                const d = new Date(ts);
                if (range === '1d') return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
                return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
              }
            },
            grid: { color: 'rgba(150,150,150,0.08)' },
          },
          y: {
            display: true,
            ticks: { color: 'var(--text-tertiary)', maxTicksLimit: 5, font: { size: 11 } },
            grid: { color: 'rgba(150,150,150,0.08)' },
          }
        }
      }
    });

    // Reset crosshair on mouse leave
    canvas.addEventListener('mouseleave', () => {
      mundoDetailChart._crosshairX = null;
      updateMundoHeader(mundoDetailPoints, null);
      mundoDetailChart.draw();
    });
  } catch (e) {
    if (loading) loading.textContent = 'Error al cargar datos.';
    console.error('Detail chart error:', e);
  }
}

// ─── Cotizaciones Strip ───
async function loadCotizaciones() {
  try {
    const res = await fetch('/api/cotizaciones');
    if (!res.ok) throw new Error('Cotizaciones API error');
    const data = await res.json();

    const strip = document.getElementById('cotizaciones-strip');
    const inner = document.getElementById('cotizaciones-strip-inner');
    if (!strip || !inner) return;

    const items = [];

    if (data.oficial) {
      items.push({ label: 'Dólar Oficial', price: `$${formatCotizPrice(data.oficial.price)}` });
    }
    if (data.ccl) {
      items.push({ label: 'Contado con Liqui', price: `$${formatCotizPrice(data.ccl.price)}` });
    }
    if (data.mep) {
      items.push({ label: 'Dólar MEP', price: `$${formatCotizPrice(data.mep.price)}` });
    }
    if (data.riesgoPais) {
      items.push({ label: 'Riesgo País', price: data.riesgoPais.value.toLocaleString('es-AR') });
    }

    if (items.length === 0) return;

    inner.innerHTML = items.map(item =>
      `<div class="cotiz-item"><span class="cotiz-label">${item.label}</span><span class="cotiz-price">${item.price}</span></div>`
    ).join('');

    strip.classList.add('loaded');
  } catch (e) {
    console.error('Cotizaciones strip error:', e);
  }
}

function formatCotizPrice(val) {
  if (val == null) return '—';
  return val.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── News Ticker ───
async function loadNewsTicker() {
  try {
    const res = await fetch('/api/news');
    if (!res.ok) throw new Error('News API error');
    const { data } = await res.json();
    if (!data || !data.length) return;

    const track = document.getElementById('news-ticker-track');
    if (!track) return;

    // Build items HTML
    const html = data.map(item =>
      `<a class="news-ticker-item" href="${item.link}" target="_blank" rel="noopener">` +
      (item.source ? `<span class="news-ticker-source">${item.source}</span>` : '') +
      `${item.title}</a>`
    ).join('');

    // Duplicate for seamless loop
    track.innerHTML = html + html;

    const ticker = document.getElementById('news-ticker');
    ticker.style.display = 'flex';

    document.getElementById('news-ticker-close').addEventListener('click', () => {
      ticker.style.display = 'none';
    });
  } catch (e) {
    // Silently fail — ticker is non-essential
    console.error('News ticker error:', e);
  }
}

// ─── Bonos CER section ───

async function loadCER() {
  const container = document.getElementById('cer-list');
  container.innerHTML = `<div class="loading"><div class="loading-spinner"></div><p>Cargando bonos CER...</p></div>`;

  try {
    const [config, cerData, cerUltimo, preciosData] = await Promise.all([
      fetch('/api/config').then(r => r.json()),
      fetch('/api/cer?v=2').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/cer-ultimo').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/cer-precios').then(r => r.ok ? r.json() : { data: [] }).catch(() => ({ data: [] }))
    ]);

    const bonosCER = config.bonos_cer || {};
    const cerActual = cerData?.cer || 0; // CER T-10 para cálculos
    const cerUltimoPublicado = cerUltimo?.cer || 0; // Último CER para mostrar en UI
    const fechaUltimoCER = cerUltimo?.fecha || '';
    const bondPrices = preciosData.data || [];

    if (!cerActual || !bondPrices.length) {
      container.innerHTML = '<div class="loading">No se pudieron cargar los datos de bonos CER.</div>';
      return;
    }

    const today = new Date();
    const items = [];

    for (const bp of bondPrices) {
      const bondConfig = bonosCER[bp.symbol];
      if (!bondConfig || !bondConfig.flujos) continue;

      const precioARS = bp.c || bp.price;
      if (!precioARS || precioARS <= 0) continue;

      const cerEmision = bondConfig.cer_emision || 1;
      let coefCER = cerActual / cerEmision;
      
      // DICP: factor especial 1.27 (intereses capitalizados históricos)
      if (bp.symbol === 'DICP') {
        coefCER = coefCER * 1.27;
      }

      // Calcular VR_antes para cada flujo (igual que Flask)
      // Primero calcular VR para TODOS los flujos, luego filtrar futuros
      let amortAcum = 0;
      const todosLosFlujos = bondConfig.flujos.map(f => {
        const vr_antes = 1 - amortAcum;
        amortAcum += f.amortizacion;
        return { ...f, vr_antes };
      });

      // Ahora filtrar solo flujos futuros y calcular flujos ajustados
      const flujosAjustados = todosLosFlujos
        .map(f => {
          const fecha = parseLocalDate(f.fecha);
          if (fecha <= today) return null;

          // FF = (VR_antes × Tasa × Base + Amort) × Coef_CER
          const interes = f.vr_antes * f.tasa_interes * f.base;
          const flujoNominal = interes + f.amortizacion;
          const flujoAjustado = flujoNominal * coefCER;

          return { fecha, monto: flujoAjustado };
        })
        .filter(f => f !== null);

      if (flujosAjustados.length === 0) continue;

      // Precio se divide por 100 (igual que Flask: bid/100)
      const precioNormalizado = precioARS / 100;

      // Calcular TIR real
      const ytm = calcYTM(precioNormalizado, flujosAjustados, today);

      // Calcular duration
      const duration = calcDuration(precioNormalizado, flujosAjustados, today, ytm);

      items.push({
        symbol: bp.symbol,
        priceArs: precioARS,
        ytm,
        duration,
        vencimiento: bondConfig.vencimiento,
        volume: bp.v || 0,
        flujosAjustados,
      });
    }

    // Sort by duration (ascending)
    items.sort((a, b) => a.duration - b.duration);

    renderCERTable(container, items);

    // Render yield curve
    try {
      renderCERCurve(items);
    } catch (chartError) {
      console.warn('Chart.js not available, skipping curve:', chartError.message);
    }

    initTooltips(container);

    const source = document.getElementById('cer-source');
    if (source) {
      source.textContent = '';
    }
  } catch (e) {
    console.error('Error loading CER bonds:', e);
    container.innerHTML = '<div class="loading">Error al cargar datos de bonos CER.</div>';
  }
}

let _cerItems = [];
function renderCERTable(container, items) {
  _cerItems = items;
  const rows = items.map((item, idx) => {
    return `<tr data-cer-idx="${idx}" style="cursor:pointer">
      <td><span class="soberano-ticker">${item.symbol}</span></td>
      <td>$${item.priceArs.toFixed(2)}</td>
      <td class="col-duration">${item.duration.toFixed(1)}</td>
      <td class="col-vto">${item.vencimiento}</td>
      <td class="lecap-tir">${item.ytm.toFixed(2)}%</td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <p style="font-size:0.78rem;color:var(--text-secondary);margin-bottom:8px"><svg class="icon-hint" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg> Click en un bono para abrir la calculadora</p>
    <div class="soberanos-table-wrap">
      <table class="soberanos-table cer-table">
        <thead>
          <tr>
            <th>TICKER</th>
            <th>PRECIO (AR$)</th>
            <th class="col-duration">DURATION</th>
            <th class="col-vto">VENCIMIENTO</th>
            <th>TIR REAL</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p style="font-size:0.7rem;color:var(--text-tertiary);margin-top:6px">
      TIR Real calculada con flujos ajustados por CER. Duration en años (Macaulay).
    </p>`;
  container.querySelectorAll('tr[data-cer-idx]').forEach(tr => {
    tr.addEventListener('click', () => {
      const item = _cerItems[parseInt(tr.dataset.cerIdx)];
      if (item) openCERCalculator(item);
    });
  });
  const table = container.querySelector('.cer-table');
  if (table) makeSortable(table);
}

function openCERCalculator(item) {
  document.querySelector('.mundo-modal-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'mundo-modal-overlay';
  const inputStyle = 'display:block;font-size:1.1rem;font-weight:700;width:140px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text)';
  overlay.innerHTML = `
    <div class="mundo-modal">
      <div class="mundo-modal-header">
        <div><h3 style="margin:0">${item.symbol} — Calculadora CER</h3>
        <p style="margin:4px 0 0;color:var(--text-secondary);font-size:0.85rem">Vencimiento: ${item.vencimiento}</p></div>
        <button class="mundo-modal-close">&times;</button>
      </div>
      <div class="mundo-modal-body" style="padding:16px">
        <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
          <div><label style="font-size:0.8rem;color:var(--text-secondary)">Precio (AR$)</label>
            <input type="number" id="cer-calc-price" value="${item.priceArs.toFixed(2)}" step="0.01" style="${inputStyle}"></div>
          <div><label style="font-size:0.8rem;color:var(--text-secondary)">Monto a invertir ($)</label>
            <input type="number" id="cer-calc-monto" value="1000000" step="10000" style="${inputStyle}"></div>
          <div><label style="font-size:0.8rem;color:var(--text-secondary)">TIR Real</label>
            <div id="cer-calc-tir" style="font-size:1.5rem;font-weight:700;color:${item.ytm >= 0 ? 'var(--green)' : 'var(--red)'}">${item.ytm.toFixed(2)}%</div></div>
          <div><label style="font-size:0.8rem;color:var(--text-secondary)">Duration</label>
            <div id="cer-calc-duration" style="font-size:1.2rem;font-weight:600;color:var(--text)">${item.duration.toFixed(1)} años</div></div>
        </div>
        <div style="display:flex;gap:16px;align-items:center;margin-bottom:16px;flex-wrap:wrap;padding:8px 12px;background:var(--bg-subtle);border-radius:6px">
          <span style="font-size:0.75rem;color:var(--text-secondary);font-weight:600">Costos:</span>
          <div style="display:flex;align-items:center;gap:4px"><label style="font-size:0.75rem;color:var(--text-secondary)">Arancel %</label>
            <input type="number" id="cer-calc-arancel" value="0.45" step="0.01" style="width:70px;padding:4px 6px;font-size:0.85rem;font-weight:600;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text)"></div>
          <div style="display:flex;align-items:center;gap:4px"><label style="font-size:0.75rem;color:var(--text-secondary)">Impuestos %</label>
            <input type="number" id="cer-calc-impuestos" value="0.01" step="0.01" style="width:70px;padding:4px 6px;font-size:0.85rem;font-weight:600;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text)"></div>
        </div>
        <div style="display:flex;gap:16px;align-items:center;margin-bottom:16px;flex-wrap:wrap;padding:10px 12px;background:#0a1628;border:1px solid #1a3050;border-radius:2px">
          <span style="font-size:0.75rem;color:var(--blue);font-weight:700">TIR Objetivo:</span>
          <div style="display:flex;align-items:center;gap:4px"><label style="font-size:0.75rem;color:var(--text-secondary)">TIR %</label>
            <input type="number" id="cer-calc-target-tir" value="" placeholder="${item.ytm.toFixed(1)}" step="0.1" style="width:80px;padding:4px 6px;font-size:0.85rem;font-weight:600;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text)"></div>
          <div id="cer-calc-target-result" style="font-size:0.8rem;color:var(--text-secondary)">Ingresá una TIR para ver el precio implícito</div>
        </div>
        <div id="cer-calc-resumen"></div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('.mundo-modal-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  function renderCERResumen() {
    const price = parseFloat(document.getElementById('cer-calc-price').value) || item.priceArs;
    const arancel = parseFloat(document.getElementById('cer-calc-arancel').value) || 0;
    const impuestos = parseFloat(document.getElementById('cer-calc-impuestos').value) || 0;
    const costosPct = (arancel + impuestos) / 100;
    const effectivePrice = price * (1 + costosPct);
    const monto = parseFloat(document.getElementById('cer-calc-monto').value) || 1000000;
    const pricePer1VN = effectivePrice / 100; // precio es por 100 VN (con costos)
    const nominales = monto / pricePer1VN; // VN comprados
    // Show adjusted flows if available (flujos are per 1 VN)
    const flujos = item.flujosAjustados || [];
    let flowsHTML = '';
    let totalCobro = 0;
    if (flujos.length > 0) {
      flowsHTML = flujos.map(f => {
        const scaled = f.monto * nominales;
        totalCobro += scaled;
        return `<tr><td>${f.fecha instanceof Date ? f.fecha.toLocaleDateString('es-AR') : f.fecha}</td><td style="text-align:right">$${f.monto.toFixed(4)}</td><td style="text-align:right;font-weight:600">$${scaled.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</td></tr>`;
      }).join('');
    }
    const ganancia = totalCobro - monto;
    document.getElementById('cer-calc-resumen').innerHTML = `
      <div style="background:var(--bg-subtle);border-radius:8px;padding:12px 16px;font-size:0.85rem;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span>Comprás</span><strong>${nominales.toFixed(0)} VN a $${pricePer1VN.toFixed(2)}/VN</strong></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span>Invertís</span><strong>$${monto.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</strong></div>
        ${totalCobro > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:6px"><span>Cobrás (estimado)</span><strong>$${totalCobro.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</strong></div>
        <div style="display:flex;justify-content:space-between;font-size:1rem;margin-top:8px;padding-top:8px;border-top:1px solid var(--border);color:${ganancia >= 0 ? 'var(--green)' : 'var(--red)'}">
          <span>Ganancia estimada</span><strong>${ganancia >= 0 ? '+' : ''}$${ganancia.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</strong></div>` : ''}
      </div>
      ${flowsHTML ? `<h4 style="margin:8px 0;font-size:0.85rem;color:var(--text-secondary)">Flujos ajustados por CER</h4>
      <div>
        <table style="width:100%;font-size:0.8rem;border-collapse:collapse">
          <thead><tr><th style="text-align:left;padding:4px 8px;border-bottom:1px solid var(--border)">Fecha</th>
          <th style="text-align:right;padding:4px 8px;border-bottom:1px solid var(--border)">Por 1 VN</th>
          <th style="text-align:right;padding:4px 8px;border-bottom:1px solid var(--border)">Tu inversión</th></tr></thead>
          <tbody>${flowsHTML}</tbody>
        </table></div>` : '<p style="font-size:0.8rem;color:var(--text-tertiary)">Nota: Los flujos futuros dependen de la evolución del CER (inflación).</p>'}`;
  }
  renderCERResumen();
  const cerTargetInput = document.getElementById('cer-calc-target-tir');
  const cerTargetResult = document.getElementById('cer-calc-target-result');
  function recalcCERTarget() {
    const targetTir = parseFloat(cerTargetInput.value);
    if (!targetTir && targetTir !== 0) { cerTargetResult.innerHTML = 'Ingresá una TIR para ver el precio implícito'; return; }
    const today = new Date();
    const flows = item.flujosAjustados || item.flujos || [];
    const impliedPrice = calcPriceFromYTM(targetTir, flows, today);
    const currentPrice = parseFloat(document.getElementById('cer-calc-price').value) || item.priceArs;
    const upside = ((impliedPrice - currentPrice) / currentPrice * 100);
    const upsideColor = upside >= 0 ? 'var(--green)' : 'var(--red)';
    cerTargetResult.innerHTML = `Precio: <strong style="color:var(--accent)">$${impliedPrice.toFixed(2)}</strong> &nbsp;|&nbsp; Upside: <strong style="color:${upsideColor}">${upside >= 0 ? '+' : ''}${upside.toFixed(1)}%</strong> vs actual`;
  }
  cerTargetInput.addEventListener('input', recalcCERTarget);
  document.getElementById('cer-calc-price').addEventListener('input', () => { renderCERResumen(); recalcCERTarget(); });
  document.getElementById('cer-calc-monto').addEventListener('input', renderCERResumen);
  document.getElementById('cer-calc-arancel').addEventListener('input', renderCERResumen);
  document.getElementById('cer-calc-impuestos').addEventListener('input', renderCERResumen);
}

let cerChart = null;
function renderCERCurve(items) {
  const canvas = document.getElementById('cer-scatter');
  if (!canvas) return;
  if (cerChart) cerChart.destroy();

  const textColor = '#555555';
  const gridColor = '#1a1a1a';

  // Polynomial regression curve (degree 2, 300 points for smoothness)
  const points = items.map(i => [i.duration, i.ytm]);
  const curve = points.length >= 3 ? fitPolyCurve(points, 2, 300) : [];

  const datasets = [];

  if (curve.length) {
    datasets.push({
      label: 'Bonos CER (curva)',
      data: curve,
      borderColor: '#ff9500',
      borderWidth: 1.5,
      borderDash: [6, 3],
      pointRadius: 0,
      pointHitRadius: 0,
      fill: false,
      order: 2,
    });
  }

  datasets.push({
    label: 'Bonos CER',
    data: items.map(i => ({ x: i.duration, y: i.ytm, label: i.symbol })),
    backgroundColor: '#00d26a',
    borderColor: '#00d26a',
    borderWidth: 1.5,
    pointRadius: 7,
    pointHoverRadius: 9,
    showLine: false,
    order: 1,
  });

  cerChart = new Chart(canvas, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: textColor, filter: (item) => !item.text.includes('curva') } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const d = ctx.raw;
              return `${d.label || ''}: TIR Real ${d.y?.toFixed(2) || ctx.parsed.y.toFixed(2)}%`;
            }
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Duration (años)', color: textColor },
          grid: { color: gridColor },
          ticks: { color: textColor },
        },
        y: {
          title: { display: true, text: 'TIR Real (%)', color: textColor },
          grid: { color: gridColor },
          ticks: { color: textColor },
        }
      }
    }
  });
}


// ─── ONs (Obligaciones Negociables) section ───
let onsChart = null;
async function loadONs() {
  const container = document.getElementById('ons-list');
  container.innerHTML = '<p style="text-align:center;color:var(--text-secondary)">Cargando ONs...</p>';
  try {
    const [configRes, pricesRes] = await Promise.all([
      fetch('/api/config').then(r => r.json()),
      fetch('/api/ons').then(r => r.json())
    ]);
    const onsConfig = configRes.ons || {};
    const prices = (pricesRes.data || []);
    const today = new Date();
    const items = [];
    const priceLookup = {};
    for (const p of prices) { priceLookup[p.symbol] = p; }
    for (const [key, bond] of Object.entries(onsConfig)) {
      const d912Ticker = bond.ticker_d912;
      const priceData = priceLookup[d912Ticker];
      if (!priceData || !priceData.c || priceData.c <= 0) continue;
      const priceUSD = priceData.c;
      const futureFlows = bond.flujos
        .map(f => ({ fecha: parseLocalDate(f.fecha), monto: f.monto }))
        .filter(f => f.fecha > today);
      if (futureFlows.length === 0) continue;
      const ytm = calcYTM(priceUSD / 100, futureFlows, today);
      if (isNaN(ytm) || !isFinite(ytm)) continue;
      const duration = calcDuration(priceUSD / 100, futureFlows, today, ytm);
      items.push({ symbol: key, d912Ticker, nombre: bond.nombre || '', priceUSD, ytm, duration, vencimiento: bond.vencimiento, volume: priceData.v || 0, flujos: futureFlows });
    }
    items.sort((a, b) => a.duration - b.duration);
    renderONsTable(container, items);
    renderONsYieldCurve(items);
    initTooltips(container);
    document.getElementById('ons-source').textContent = '';
  } catch(err) {
    container.innerHTML = '<p style="color:var(--red)">Error cargando ONs: ' + err.message + '</p>';
  }
}

function renderONsTable(container, items) {
  let html = `<div style="overflow-x:auto"><table class="soberanos-table">
    <thead><tr><th>TICKER</th><th>EMISOR</th><th>PRECIO</th><th class="col-duration">DURATION</th><th class="col-vto">VENCIMIENTO</th><th>TIR</th></tr></thead><tbody>`;
  for (const item of items) {
    const tirColor = item.ytm >= 0 ? 'var(--green)' : 'var(--red)';
    html += `<tr class="on-row" data-symbol="${item.symbol}" style="cursor:pointer">
      <td><strong style="color:var(--accent)">${item.d912Ticker}</strong></td>
      <td style="font-size:0.8rem;color:var(--text-secondary)">${item.nombre || ''}</td>
      <td style="font-family:var(--font-mono);text-align:right">$${item.priceUSD.toFixed(2)}</td>
      <td class="col-duration" style="font-family:var(--font-mono);text-align:right">${item.duration.toFixed(2)}</td>
      <td class="col-vto">${item.vencimiento}</td>
      <td class="lecap-tir" style="text-align:right">${item.ytm.toFixed(2)}%</td></tr>`;
  }
  html += '</tbody></table></div><p class="calc-hint"><svg class="icon-hint" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg> <span>Click</span> en cualquier ON para abrir la calculadora</p>';
  container.innerHTML = html;
  // Make sortable
  const table = container.querySelector('.soberanos-table');
  if (table) makeSortable(table);
  container.querySelectorAll('.on-row').forEach(row => {
    row.addEventListener('click', () => {
      const sym = row.dataset.symbol;
      const item = items.find(i => i.symbol === sym);
      if (item) openONCalculator(item);
    });
  });
}

function renderONsYieldCurve(items) {
  const canvas = document.getElementById('ons-scatter');
  if (!canvas) return;
  if (onsChart) onsChart.destroy();
  const textColor = '#555555';
  const gridColor = '#1a1a1a';
  const points = items.map(i => ({ x: i.duration, y: i.ytm, label: i.d912Ticker }));
  const curvePoints = points.length >= 3 ? fitPolyCurve(points.map(p => [p.x, p.y]), 2, 200) : [];
  const datasets = [{
    label: 'ONs', data: points, backgroundColor: '#00d26a', borderColor: '#00d26a',
    pointRadius: 5, pointHoverRadius: 7, showLine: false,
  }];
  if (curvePoints.length > 0) {
    datasets.push({
      label: 'Curva', data: curvePoints, borderColor: '#ff9500', borderWidth: 1.5,
      borderDash: [4, 3], pointRadius: 0, showLine: true, tension: 0, fill: false,
    });
  }
  onsChart = new Chart(canvas, {
    type: 'scatter', data: { datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1a1a1a', titleColor: '#ff9500', bodyColor: '#e0e0e0', borderColor: '#333', borderWidth: 1, callbacks: { label: ctx => { const p = ctx.raw; return p.label ? `${p.label}: ${p.y.toFixed(2)}%` : `${p.y.toFixed(2)}%`; } } } },
      scales: {
        x: { type: 'linear', title: { display: true, text: 'Duration (años)', color: textColor }, grid: { color: gridColor }, ticks: { color: textColor } },
        y: { type: 'linear', title: { display: true, text: 'TIR (%)', color: textColor }, grid: { color: gridColor }, ticks: { color: textColor, callback: v => v.toFixed(1) + '%' } }
      }
    }
  });
}

function openONCalculator(item) {
  document.querySelector('.mundo-modal-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'mundo-modal-overlay';
  const inputStyle = 'display:block;font-size:1.1rem;font-weight:700;width:130px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text)';
  overlay.innerHTML = `
    <div class="mundo-modal">
      <div class="mundo-modal-header">
        <div><h3 style="margin:0">${item.d912Ticker} — Calculadora</h3>
        <p style="margin:4px 0 0;color:var(--text-secondary);font-size:0.85rem">Vencimiento: ${item.vencimiento}</p></div>
        <button class="mundo-modal-close">&times;</button>
      </div>
      <div class="mundo-modal-body" style="padding:16px">
        <div style="display:flex;gap:20px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
          <div><label style="font-size:0.8rem;color:var(--text-secondary)">Precio USD</label>
            <input type="number" id="on-calc-price" value="${item.priceUSD.toFixed(2)}" step="0.01" style="${inputStyle}"></div>
          <div><label style="font-size:0.8rem;color:var(--text-secondary)">Monto a invertir (USD)</label>
            <input type="number" id="on-calc-monto" value="10000" step="100" style="${inputStyle}"></div>
          <div><label style="font-size:0.8rem;color:var(--text-secondary)">TIR</label>
            <div id="on-calc-tir" style="font-size:1.5rem;font-weight:700;color:${item.ytm >= 0 ? 'var(--green)' : 'var(--red)'}">${item.ytm.toFixed(2)}%</div></div>
          <div><label style="font-size:0.8rem;color:var(--text-secondary)">Duration</label>
            <div id="on-calc-duration" style="font-size:1.2rem;font-weight:600;color:var(--text)">${item.duration.toFixed(2)} años</div></div>
        </div>
        <div style="display:flex;gap:16px;align-items:center;margin-bottom:16px;flex-wrap:wrap;padding:8px 12px;background:var(--bg-subtle);border-radius:6px">
          <span style="font-size:0.75rem;color:var(--text-secondary);font-weight:600">Costos:</span>
          <div style="display:flex;align-items:center;gap:4px"><label style="font-size:0.75rem;color:var(--text-secondary)">Arancel %</label>
            <input type="number" id="on-calc-arancel" value="0.45" step="0.01" style="width:70px;padding:4px 6px;font-size:0.85rem;font-weight:600;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text)"></div>
          <div style="display:flex;align-items:center;gap:4px"><label style="font-size:0.75rem;color:var(--text-secondary)">Impuestos %</label>
            <input type="number" id="on-calc-impuestos" value="0.01" step="0.01" style="width:70px;padding:4px 6px;font-size:0.85rem;font-weight:600;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text)"></div>
        </div>
        <div style="display:flex;gap:16px;align-items:center;margin-bottom:16px;flex-wrap:wrap;padding:10px 12px;background:#0a1628;border:1px solid #1a3050;border-radius:2px">
          <span style="font-size:0.75rem;color:var(--blue);font-weight:700">TIR Objetivo:</span>
          <div style="display:flex;align-items:center;gap:4px"><label style="font-size:0.75rem;color:var(--text-secondary)">TIR %</label>
            <input type="number" id="on-calc-target-tir" value="" placeholder="${item.ytm.toFixed(1)}" step="0.1" style="width:80px;padding:4px 6px;font-size:0.85rem;font-weight:600;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text)"></div>
          <div id="on-calc-target-result" style="font-size:0.8rem;color:var(--text-secondary)">Ingresá una TIR para ver el precio implícito</div>
        </div>
        <h4 style="margin:12px 0 8px;font-size:0.85rem;color:var(--text-secondary)">Flujos de fondos</h4>
        <div id="on-calc-flows"></div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('.mundo-modal-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  function renderONFlows() {
    const price = parseFloat(document.getElementById('on-calc-price').value) || item.priceUSD;
    const arancel = parseFloat(document.getElementById('on-calc-arancel').value) || 0;
    const impuestos = parseFloat(document.getElementById('on-calc-impuestos').value) || 0;
    const costosPct = (arancel + impuestos) / 100;
    const effectivePrice = price * (1 + costosPct);
    const monto = parseFloat(document.getElementById('on-calc-monto').value) || 10000;
    const pricePer1VN = effectivePrice / 100; // precio por 1 VN (con costos)
    const nominales = monto / pricePer1VN; // VN comprados
    const scale = nominales; // flujos son por 1 VN, multiplicar por cantidad de VN
    const flowsHTML = item.flujos.map(f => {
      const scaled = f.monto * scale;
      return `<tr><td>${f.fecha.toLocaleDateString('es-AR')}</td><td style="text-align:right">$${f.monto.toFixed(6)}</td><td style="text-align:right;font-weight:600">$${scaled.toFixed(2)}</td></tr>`;
    }).join('');
    const totalPer1VN = item.flujos.reduce((s, f) => s + f.monto, 0);
    const totalScaled = totalPer1VN * scale;
    const ganancia = totalScaled - monto;
    document.getElementById('on-calc-flows').innerHTML = `
      <table style="width:100%;font-size:0.8rem;border-collapse:collapse">
        <thead><tr><th style="text-align:left;padding:4px 8px;border-bottom:1px solid var(--border)">Fecha</th>
        <th style="text-align:right;padding:4px 8px;border-bottom:1px solid var(--border)">Por 1 VN</th>
        <th style="text-align:right;padding:4px 8px;border-bottom:1px solid var(--border)">Tu inversión</th></tr></thead>
        <tbody>${flowsHTML}</tbody>
        <tfoot>
          <tr style="font-weight:700;border-top:2px solid var(--border)">
            <td style="padding:4px 8px">Total cobros</td><td style="text-align:right;padding:4px 8px">$${totalPer1VN.toFixed(6)}</td>
            <td style="text-align:right;padding:4px 8px">$${totalScaled.toFixed(2)}</td></tr>
          <tr style="font-weight:700;color:${ganancia >= 0 ? 'var(--green)' : 'var(--red)'}">
            <td style="padding:4px 8px">Ganancia</td><td></td>
            <td style="text-align:right;padding:4px 8px">${ganancia >= 0 ? '+' : ''}$${ganancia.toFixed(2)}</td></tr>
        </tfoot>
      </table>
      <p style="font-size:0.7rem;color:var(--text-tertiary);margin-top:8px">Comprás ${nominales.toFixed(0)} VN a $${pricePer1VN.toFixed(4)}/VN (precio ${price.toFixed(2)} por 100 VN)</p>`;
  }
  renderONFlows();

  const priceInput = document.getElementById('on-calc-price');
  const montoInput = document.getElementById('on-calc-monto');
  const arancelInput = document.getElementById('on-calc-arancel');
  const impuestosInput = document.getElementById('on-calc-impuestos');
  const tirDisplay = document.getElementById('on-calc-tir');
  const durDisplay = document.getElementById('on-calc-duration');
  function recalc() {
    const newPrice = parseFloat(priceInput.value);
    if (!newPrice || newPrice <= 0) return;
    const arancel = parseFloat(arancelInput.value) || 0;
    const impuestos = parseFloat(impuestosInput.value) || 0;
    const costosPct = (arancel + impuestos) / 100;
    const effectivePrice = (newPrice / 100) * (1 + costosPct);
    const today = new Date();
    const newYtm = calcYTM(effectivePrice, item.flujos, today);
    const newDur = calcDuration(effectivePrice, item.flujos, today, newYtm);
    if (isFinite(newYtm)) { tirDisplay.textContent = newYtm.toFixed(2) + '%'; tirDisplay.style.color = newYtm >= 0 ? 'var(--green)' : 'var(--red)'; }
    if (isFinite(newDur)) { durDisplay.textContent = newDur.toFixed(2) + ' años'; }
    renderONFlows();
  }
  const onTargetInput = document.getElementById('on-calc-target-tir');
  const onTargetResult = document.getElementById('on-calc-target-result');
  function recalcONTarget() {
    const targetTir = parseFloat(onTargetInput.value);
    if (!targetTir && targetTir !== 0) { onTargetResult.innerHTML = 'Ingresá una TIR para ver el precio implícito'; return; }
    const today = new Date();
    const impliedPricePer1 = calcPriceFromYTM(targetTir, item.flujos, today);
    const impliedPrice = impliedPricePer1 * 100; // ONs: price per 100 VN
    const currentPrice = parseFloat(priceInput.value) || item.priceUSD;
    const upside = ((impliedPrice - currentPrice) / currentPrice * 100);
    const upsideColor = upside >= 0 ? 'var(--green)' : 'var(--red)';
    onTargetResult.innerHTML = `Precio: <strong style="color:var(--accent)">US$${impliedPrice.toFixed(2)}</strong> &nbsp;|&nbsp; Upside: <strong style="color:${upsideColor}">${upside >= 0 ? '+' : ''}${upside.toFixed(1)}%</strong> vs actual`;
  }
  onTargetInput.addEventListener('input', recalcONTarget);
  priceInput.addEventListener('input', () => { recalc(); recalcONTarget(); });
  montoInput.addEventListener('input', renderONFlows);
  arancelInput.addEventListener('input', recalc);
  impuestosInput.addEventListener('input', recalc);
  recalc();
}

// ─── Generic sortable table ───
function makeSortable(tableEl) {
  const headers = tableEl.querySelectorAll('th');
  let currentSort = { col: -1, asc: true };
  headers.forEach((th, colIdx) => {
    const arrow = document.createElement('span');
    arrow.className = 'sort-arrow';
    arrow.textContent = '↕';
    th.appendChild(arrow);
    th.addEventListener('click', () => {
      const asc = currentSort.col === colIdx ? !currentSort.asc : false; // default descending
      currentSort = { col: colIdx, asc };
      // Update arrows
      headers.forEach(h => { const a = h.querySelector('.sort-arrow'); if (a) { a.textContent = '↕'; a.classList.remove('active'); } });
      arrow.textContent = asc ? '↑' : '↓';
      arrow.classList.add('active');
      // Sort rows
      const tbody = tableEl.querySelector('tbody');
      const rows = Array.from(tbody.querySelectorAll('tr'));
      rows.sort((a, b) => {
        const aText = a.cells[colIdx]?.textContent.trim().replace(/[%$,]/g, '') || '';
        const bText = b.cells[colIdx]?.textContent.trim().replace(/[%$,]/g, '') || '';
        const aNum = parseFloat(aText);
        const bNum = parseFloat(bText);
        if (!isNaN(aNum) && !isNaN(bNum)) return asc ? aNum - bNum : bNum - aNum;
        return asc ? aText.localeCompare(bText) : bText.localeCompare(aText);
      });
      rows.forEach(r => tbody.appendChild(r));
    });
  });
}

// ─── LECAP Calculator Popup ───
function openLecapCalculator(item) {
  document.querySelector('.mundo-modal-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'mundo-modal-overlay';
  const inputStyle = 'display:block;font-size:1.1rem;font-weight:700;width:130px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text)';
  overlay.innerHTML = `
    <div class="mundo-modal">
      <div class="mundo-modal-header">
        <div><h3 style="margin:0">${item.ticker} — Calculadora</h3>
        <p style="margin:4px 0 0;color:var(--text-secondary);font-size:0.85rem">${item.tipo || 'LECAP'} — Vence: ${item.vencimiento} — Pago final: ${item.pago_final}</p></div>
        <button class="mundo-modal-close">&times;</button>
      </div>
      <div class="mundo-modal-body" style="padding:16px">
        <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
          <div><label style="font-size:0.8rem;color:var(--text-secondary)">Precio</label>
            <input type="number" id="lecap-calc-price" value="${item.precio.toFixed(2)}" step="0.01" style="${inputStyle}"></div>
          <div><label style="font-size:0.8rem;color:var(--text-secondary)">Monto a invertir ($)</label>
            <input type="number" id="lecap-calc-monto" value="1000000" step="10000" style="${inputStyle}"></div>
          <div><label style="font-size:0.8rem;color:var(--text-secondary)">TNA</label>
            <div id="lecap-calc-tna" style="font-size:1.3rem;font-weight:700;color:var(--text)">${item.tna.toFixed(2)}%</div></div>
          <div><label style="font-size:0.8rem;color:var(--text-secondary)">TEM</label>
            <div id="lecap-calc-tem" style="font-size:1.3rem;font-weight:700;color:var(--text)">${item.tem.toFixed(2)}%</div></div>
          <div><label style="font-size:0.8rem;color:var(--text-secondary)">TIR</label>
            <div id="lecap-calc-tir" style="font-size:1.5rem;font-weight:700;color:var(--green)">${item.tir.toFixed(2)}%</div></div>
          <div><label style="font-size:0.8rem;color:var(--text-secondary)">Días</label>
            <div style="font-size:1.2rem;font-weight:600;color:var(--text)">${item.dias}</div></div>
        </div>
        <div style="display:flex;gap:16px;align-items:center;margin-bottom:16px;flex-wrap:wrap;padding:8px 12px;background:var(--bg-subtle);border-radius:6px">
          <span style="font-size:0.75rem;color:var(--text-secondary);font-weight:600">Costos:</span>
          <div style="display:flex;align-items:center;gap:4px"><label style="font-size:0.75rem;color:var(--text-secondary)">Arancel %</label>
            <input type="number" id="lecap-calc-arancel" value="0.10" step="0.01" style="width:70px;padding:4px 6px;font-size:0.85rem;font-weight:600;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text)"></div>
          <div style="display:flex;align-items:center;gap:4px"><label style="font-size:0.75rem;color:var(--text-secondary)">Impuestos %</label>
            <input type="number" id="lecap-calc-impuestos" value="0.01" step="0.01" style="width:70px;padding:4px 6px;font-size:0.85rem;font-weight:600;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text)"></div>
        </div>
        <div style="display:flex;gap:16px;align-items:center;margin-bottom:16px;flex-wrap:wrap;padding:10px 12px;background:#0a1628;border:1px solid #1a3050;border-radius:2px">
          <span style="font-size:0.75rem;color:var(--blue);font-weight:700">TIR Objetivo:</span>
          <div style="display:flex;align-items:center;gap:4px"><label style="font-size:0.75rem;color:var(--text-secondary)">TIR %</label>
            <input type="number" id="lecap-calc-target-tir" value="" placeholder="${item.tir.toFixed(1)}" step="0.1" style="width:80px;padding:4px 6px;font-size:0.85rem;font-weight:600;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text)"></div>
          <div id="lecap-calc-target-result" style="font-size:0.8rem;color:var(--text-secondary)">Ingresá una TIR para ver el precio implícito</div>
        </div>
        <div id="lecap-calc-resumen"></div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('.mundo-modal-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  function renderLecapResumen() {
    const price = parseFloat(document.getElementById('lecap-calc-price').value) || item.precio;
    const arancel = parseFloat(document.getElementById('lecap-calc-arancel').value) || 0;
    const impuestos = parseFloat(document.getElementById('lecap-calc-impuestos').value) || 0;
    const costosPct = (arancel + impuestos) / 100;
    const effectivePrice = price * (1 + costosPct);
    const monto = parseFloat(document.getElementById('lecap-calc-monto').value) || 1000000;
    const nominales = monto / effectivePrice * 100; // VN comprados (precio efectivo con costos)
    const cobro = nominales / 100 * item.pago_final;
    const ganancia = cobro - monto;
    document.getElementById('lecap-calc-resumen').innerHTML = `
      <div style="background:var(--bg-subtle);border-radius:8px;padding:12px 16px;font-size:0.85rem">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span>Comprás</span><strong>${nominales.toFixed(0)} VN a $${price.toFixed(2)}</strong></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span>Invertís</span><strong>$${monto.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</strong></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span>Al vencimiento cobrás</span><strong>$${cobro.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</strong></div>
        <div style="display:flex;justify-content:space-between;font-size:1rem;margin-top:8px;padding-top:8px;border-top:1px solid var(--border);color:${ganancia >= 0 ? 'var(--green)' : 'var(--red)'}">
          <span>Ganancia</span><strong>${ganancia >= 0 ? '+' : ''}$${ganancia.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</strong></div>
      </div>`;
  }
  renderLecapResumen();

  function recalcLecap() {
    const p = parseFloat(document.getElementById('lecap-calc-price').value);
    if (!p || p <= 0) return;
    const arancel = parseFloat(document.getElementById('lecap-calc-arancel').value) || 0;
    const impuestos = parseFloat(document.getElementById('lecap-calc-impuestos').value) || 0;
    const costosPct = (arancel + impuestos) / 100;
    const ep = p * (1 + costosPct); // precio efectivo con costos
    const tna = (item.pago_final / ep - 1) * (365 / item.dias) * 100;
    const tir = (Math.pow(item.pago_final / ep, 365 / item.dias) - 1) * 100;
    const ganancia = item.pago_final / ep;
    const tem = item.meses > 0 ? (Math.pow(ganancia, 1 / item.meses) - 1) * 100 : 0;
    document.getElementById('lecap-calc-tna').textContent = tna.toFixed(2) + '%';
    document.getElementById('lecap-calc-tem').textContent = tem.toFixed(2) + '%';
    const tirEl = document.getElementById('lecap-calc-tir');
    tirEl.textContent = tir.toFixed(2) + '%';
    tirEl.style.color = tir >= 0 ? 'var(--green)' : 'var(--red)';
    renderLecapResumen();
  }
  const lecapTargetInput = document.getElementById('lecap-calc-target-tir');
  const lecapTargetResult = document.getElementById('lecap-calc-target-result');
  function recalcLecapTarget() {
    const targetTir = parseFloat(lecapTargetInput.value);
    if (!targetTir && targetTir !== 0) { lecapTargetResult.innerHTML = 'Ingresá una TIR para ver el precio implícito'; return; }
    const impliedPrice = item.pago_final / Math.pow(1 + targetTir / 100, item.dias / 365);
    const currentPrice = parseFloat(document.getElementById('lecap-calc-price').value) || item.precio;
    const upside = ((impliedPrice - currentPrice) / currentPrice * 100);
    const upsideColor = upside >= 0 ? 'var(--green)' : 'var(--red)';
    lecapTargetResult.innerHTML = `Precio: <strong style="color:var(--accent)">$${impliedPrice.toFixed(2)}</strong> &nbsp;|&nbsp; Upside: <strong style="color:${upsideColor}">${upside >= 0 ? '+' : ''}${upside.toFixed(1)}%</strong> vs actual`;
  }
  lecapTargetInput.addEventListener('input', recalcLecapTarget);
  document.getElementById('lecap-calc-price').addEventListener('input', () => { recalcLecap(); recalcLecapTarget(); });
  document.getElementById('lecap-calc-monto').addEventListener('input', renderLecapResumen);
  document.getElementById('lecap-calc-arancel').addEventListener('input', recalcLecap);
  document.getElementById('lecap-calc-impuestos').addEventListener('input', recalcLecap);
  recalcLecap();
}

// ─── PORTFOLIO MODULE ───

const MONTH_NAMES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

const _icon = (d, size = 16) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ASSET_TYPES = {
  soberano: { label: 'Soberanos', emoji: _icon('<path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M8 10v11M12 10v11M16 10v11M20 10v11"/>'), currency: 'USD', qtyLabel: 'Valor Nominal (VN)' },
  on: { label: 'ONs', emoji: _icon('<rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="9" y1="6" x2="9" y2="6.01"/><line x1="15" y1="6" x2="15" y2="6.01"/><line x1="9" y1="10" x2="9" y2="10.01"/><line x1="15" y1="10" x2="15" y2="10.01"/><line x1="9" y1="14" x2="15" y2="14"/>'), currency: 'USD', qtyLabel: 'Valor Nominal (VN)' },
  cer: { label: 'Bonos CER', emoji: _icon('<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>'), currency: 'ARS', qtyLabel: 'Valor Nominal (VN)' },
  lecap: { label: 'LECAPs', emoji: _icon('<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>'), currency: 'ARS', qtyLabel: 'Valor Nominal (VN)' },
  fci: { label: 'FCIs', emoji: _icon('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>'), currency: 'ARS', qtyLabel: 'Cuotapartes' },
  garantizado: { label: 'Billeteras', emoji: _icon('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 10h20"/><path d="M6 14h.01"/><path d="M10 14h.01"/>'), currency: 'ARS', qtyLabel: 'Monto (ARS)' },
  cash: { label: 'Cash', emoji: _icon('<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>'), currency: 'USD', qtyLabel: 'Monto' },
  custom: { label: 'Otro', emoji: _icon('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'), currency: 'USD', qtyLabel: 'Cantidad' },
};

// ─── PPP & Operations helpers ───
function getOperationsFromHolding(holding) {
  if (Array.isArray(holding.metadata?.operations) && holding.metadata.operations.length > 0) {
    return holding.metadata.operations;
  }
  // Backwards compat: synthesize single buy from existing data
  return [{
    type: 'buy',
    qty: parseFloat(holding.quantity) || 0,
    price: parseFloat(holding.purchase_price) || 0,
    date: holding.purchase_date || new Date().toISOString().slice(0, 10)
  }];
}

function computePosition(operations) {
  let totalBuyQty = 0, totalBuyCost = 0, totalSellQty = 0;
  for (const op of operations) {
    const qty = parseFloat(op.qty) || 0;
    const price = parseFloat(op.price) || 0;
    if (op.type === 'buy') {
      totalBuyQty += qty;
      totalBuyCost += qty * price;
    } else if (op.type === 'sell') {
      totalSellQty += qty;
    }
  }
  const netQty = totalBuyQty - totalSellQty;
  const ppp = totalBuyQty > 0 ? totalBuyCost / totalBuyQty : 0;
  return { ppp, netQty };
}

async function addOperationToHolding(holdingId, operation) {
  const holding = _portfolioHoldings.find(h => h.id === holdingId);
  if (!holding) return { error: 'Holding no encontrado' };

  const ops = getOperationsFromHolding(holding);
  if (operation.type === 'sell') {
    const { netQty } = computePosition(ops);
    if (operation.qty > netQty) return { error: `No podes vender más de ${netQty}` };
  }
  ops.push(operation);
  const { ppp, netQty } = computePosition(ops);

  const newMeta = { ...(holding.metadata || {}), operations: ops };
  const { error } = await supabaseClient.from('holdings').update({
    quantity: netQty,
    purchase_price: ppp,
    metadata: newMeta,
  }).eq('id', holdingId);

  if (error) return { error: error.message };
  return { ok: true };
}

let _portfolioHoldings = [];
let _portfolioPrices = {};
let _portfolioLoading = false;
let _portfolioTC = null; // tipo de cambio implícito (AL30 ARS / AL30D USD)
let _portfolioViewCurrency = 'split'; // 'split' | 'usd' | 'ars'

async function getPortfolioConfig() {
  if (_portfolioConfig) return _portfolioConfig;
  const resp = await fetch('/api/config');
  _portfolioConfig = await resp.json();
  return _portfolioConfig;
}

function getTickersForType(config, type) {
  switch (type) {
    case 'soberano': return Object.keys(config.soberanos || {});
    case 'on': return Object.keys(config.ons || {});
    case 'cer': return Object.keys(config.bonos_cer || {});
    case 'lecap': return (config.lecaps?.letras || []).filter(l => l.activo).map(l => l.ticker);
    case 'fci': return (config.fcis || []).filter(f => f.activo).map(f => f.nombre);
    case 'garantizado': return [...(config.garantizados || []), ...(config.especiales || [])].filter(g => g.activo).map(g => g.nombre);
    case 'cash': return ['USD', 'ARS'];
    case 'custom': return [];
    default: return [];
  }
}

async function loadPortfolio() {
  if (!supabaseClient || !currentUser || _portfolioLoading) return;
  _portfolioLoading = true;

  const holdingsEl = document.getElementById('portfolio-holdings');
  holdingsEl.innerHTML = '<div class="loading"><div class="loading-spinner"></div></div>';

  try {
    const { data, error } = await supabaseClient.from('holdings').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    _portfolioHoldings = data || [];

    const config = await getPortfolioConfig();
    const [prices, tc] = await Promise.all([
      fetchPortfolioPrices(_portfolioHoldings, config),
      fetchTipoCambio(),
    ]);
    _portfolioPrices = prices;
    _portfolioTC = tc;

    renderPortfolioGreeting();
    renderPortfolioTCToggle(config);
    renderPortfolioSummary(config);
    renderPortfolioHoldings(config);
    renderPortfolioCashflows(config);
  } catch (e) {
    holdingsEl.innerHTML = `<p style="color:var(--red);font-size:0.85rem">Error cargando portfolio: ${e.message}</p>`;
  }
  _portfolioLoading = false;
}

async function fetchPortfolioPrices(holdings, config) {
  const needs = new Set(holdings.map(h => h.asset_type));
  const prices = {};
  const fetches = [];

  if (needs.has('soberano')) {
    fetches.push(fetch('/api/soberanos').then(r => r.json()).then(d => {
      for (const b of (d.data || [])) prices['soberano:' + b.symbol] = { price: parseFloat(b.c || b.price_usd || 0), currency: 'USD' };
    }).catch(() => {}));
  }
  if (needs.has('on')) {
    fetches.push(fetch('/api/ons').then(r => r.json()).then(d => {
      for (const b of (d.data || [])) {
        prices['on:' + b.symbol] = { price: parseFloat(b.c || 0), currency: 'USD' };
        // Also store without D suffix so holdings match (MGCRD → MGCR)
        const noD = b.symbol.endsWith('D') ? b.symbol.slice(0, -1) : b.symbol;
        prices['on:' + noD] = { price: parseFloat(b.c || 0), currency: 'USD' };
      }
    }).catch(() => {}));
  }
  if (needs.has('lecap')) {
    fetches.push(fetch('/api/lecaps').then(r => r.json()).then(d => {
      for (const item of (d.data || [])) prices['lecap:' + item.symbol] = { price: parseFloat(item.c || item.price || 0), currency: 'ARS' };
    }).catch(() => {}));
  }
  if (needs.has('cer')) {
    fetches.push(fetch('/api/cer-precios').then(r => r.json()).then(d => {
      for (const b of (d.data || [])) prices['cer:' + b.symbol] = { price: parseFloat(b.c || 0), currency: 'ARS' };
    }).catch(() => {}));
  }
  // FCIs and garantizados: use config TNA (no market price per se)
  if (needs.has('garantizado')) {
    const all = [...(config.garantizados || []), ...(config.especiales || [])];
    for (const g of all) prices['garantizado:' + g.nombre] = { tna: g.tna, currency: 'ARS' };
  }

  await Promise.all(fetches);
  return prices;
}

async function fetchTipoCambio() {
  try {
    // Fetch all bonds from data912 via cer-precios (which hits arg_bonds) - it has both ARS and USD tickers
    const resp = await fetch('https://data912.com/live/arg_bonds');
    const raw = await resp.json();
    const bonds = Array.isArray(raw) ? raw : [];
    const al30ars = bonds.find(b => b.symbol === 'AL30');
    const al30usd = bonds.find(b => b.symbol === 'AL30D');
    if (al30ars && al30usd) {
      const arsPrice = parseFloat(al30ars.c || 0);
      const usdPrice = parseFloat(al30usd.c || 0);
      if (usdPrice > 0 && arsPrice > 0) return arsPrice / usdPrice;
    }
  } catch (e) { /* ignore */ }
  return null;
}

function renderPortfolioGreeting() {
  const el = document.getElementById('portfolio-greeting');
  if (!el || !currentUser) return;
  const name = (currentUser.user_metadata?.full_name || currentUser.email || '').split(' ')[0];
  const hour = new Date().getHours();
  let saludo = 'Buenas noches';
  if (hour >= 6 && hour < 12) saludo = 'Buenos días';
  else if (hour >= 12 && hour < 19) saludo = 'Buenas tardes';
  el.innerHTML = `
    <h2 style="font-size:1.6rem;margin:0">${saludo}, ${name}</h2>
    <p style="color:var(--text-tertiary);font-size:0.82rem;margin-top:4px">Gracias por usar rendimientos.co — hecho con mucho <svg style="display:inline-block;vertical-align:middle" width="12" height="12" viewBox="0 0 24 24" fill="var(--red, #e74c3c)" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> desde Argentina.</p>`;
}

function renderPortfolioTCToggle(config) {
  const el = document.getElementById('portfolio-tc-toggle');
  if (!el) return;
  const tcStr = _portfolioTC ? `TC: $${_portfolioTC.toLocaleString('es-AR', {maximumFractionDigits:0})}` : '';
  el.innerHTML = `
    <button class="portfolio-tc-btn ${_portfolioViewCurrency === 'split' ? 'active' : ''}" data-vc="split">USD + ARS</button>
    <button class="portfolio-tc-btn ${_portfolioViewCurrency === 'usd' ? 'active' : ''}" data-vc="usd">Todo USD</button>
    <button class="portfolio-tc-btn ${_portfolioViewCurrency === 'ars' ? 'active' : ''}" data-vc="ars">Todo ARS</button>
    ${tcStr ? `<span style="font-size:0.65rem;color:var(--text-tertiary);padding:4px 8px">${tcStr}</span>` : ''}`;
  el.querySelectorAll('.portfolio-tc-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _portfolioViewCurrency = btn.dataset.vc;
      renderPortfolioTCToggle(config);
      renderPortfolioSummary(config);
      renderPortfolioHoldings(config);
    });
  });
}

function getHoldingValue(holding, config) {
  const key = holding.asset_type + ':' + holding.ticker;
  const priceData = _portfolioPrices[key];
  const qty = parseFloat(holding.quantity) || 0;
  const purchasePrice = parseFloat(holding.purchase_price) || 0;

  if (holding.asset_type === 'cash') {
    const curr = holding.ticker === 'USD' ? 'USD' : 'ARS';
    return { currentPrice: null, value: qty, pnl: 0, currency: curr };
  }
  if (holding.asset_type === 'custom') {
    const curr = (holding.metadata?.currency) || 'USD';
    const manualPrice = parseFloat(holding.metadata?.current_price) || purchasePrice;
    const value = qty * manualPrice;
    const cost = qty * purchasePrice;
    return { currentPrice: manualPrice, value, cost, pnl: value - cost, currency: curr };
  }
  if (holding.asset_type === 'garantizado') {
    return { currentPrice: null, value: qty, pnl: 0, currency: 'ARS', tna: priceData?.tna };
  }
  if (holding.asset_type === 'fci') {
    // FCIs: qty = cuotapartes, price = NAV per cuotaparte
    // We don't have live NAV per holding easily, just show purchase value
    return { currentPrice: null, value: qty * purchasePrice, pnl: 0, currency: 'ARS' };
  }

  const currentPrice = priceData?.price || 0;
  const currency = priceData?.currency || ASSET_TYPES[holding.asset_type]?.currency || 'USD';

  // No live price available
  if (!currentPrice) {
    const cost = (purchasePrice / 100) * qty;
    return { currentPrice: null, value: cost, cost, pnl: null, currency, noPrice: true };
  }

  // For bonds: qty = VN, price is per 100 VN
  const value = (currentPrice / 100) * qty;
  const cost = (purchasePrice / 100) * qty;

  return { currentPrice, value, cost, pnl: value - cost, currency };
}

function fmtMoney(amount, currency) {
  const sym = currency === 'USD' ? 'US$' : '$';
  if (Math.abs(amount) >= 1e9) return sym + (amount / 1e9).toLocaleString('es-AR', {minimumFractionDigits:1, maximumFractionDigits:1}) + 'B';
  if (Math.abs(amount) >= 1e6) return sym + (amount / 1e6).toLocaleString('es-AR', {minimumFractionDigits:1, maximumFractionDigits:1}) + 'M';
  return sym + amount.toLocaleString('es-AR', {minimumFractionDigits:0, maximumFractionDigits:0});
}

function renderPortfolioSummary(config) {
  const summary = document.getElementById('portfolio-summary');
  if (_portfolioHoldings.length === 0) {
    summary.innerHTML = '';
    return;
  }

  let totalUSD = 0, totalARS = 0, pnlUSD = 0, pnlARS = 0;
  for (const h of _portfolioHoldings) {
    const v = getHoldingValue(h, config);
    if (v.noPrice) continue; // skip holdings without live price
    if (v.currency === 'USD') { totalUSD += v.value; pnlUSD += v.pnl || 0; }
    else { totalARS += v.value; pnlARS += v.pnl || 0; }
  }

  const tc = _portfolioTC || 0;
  const vc = _portfolioViewCurrency;
  let cards = '';

  if (vc === 'split') {
    cards = `
      <div class="portfolio-summary-card"><div class="label">Valor USD</div><div class="value">${fmtMoney(totalUSD, 'USD')}</div></div>
      <div class="portfolio-summary-card"><div class="label">Valor ARS</div><div class="value">${fmtMoney(totalARS, 'ARS')}</div></div>
      <div class="portfolio-summary-card"><div class="label">P&L USD</div><div class="value" style="color:${pnlUSD >= 0 ? 'var(--green)' : 'var(--red)'}">${pnlUSD >= 0 ? '+' : ''}${fmtMoney(pnlUSD, 'USD')}</div></div>
      <div class="portfolio-summary-card"><div class="label">P&L ARS</div><div class="value" style="color:${pnlARS >= 0 ? 'var(--green)' : 'var(--red)'}">${pnlARS >= 0 ? '+' : ''}${fmtMoney(pnlARS, 'ARS')}</div></div>`;
  } else if (vc === 'usd' && tc) {
    const total = totalUSD + totalARS / tc;
    const pnl = pnlUSD + pnlARS / tc;
    cards = `
      <div class="portfolio-summary-card"><div class="label">Valor Total</div><div class="value">${fmtMoney(total, 'USD')}</div></div>
      <div class="portfolio-summary-card"><div class="label">P&L Total</div><div class="value" style="color:${pnl >= 0 ? 'var(--green)' : 'var(--red)'}">${pnl >= 0 ? '+' : ''}${fmtMoney(pnl, 'USD')}</div></div>
      <div class="portfolio-summary-card"><div class="label">USD</div><div class="value">${fmtMoney(totalUSD, 'USD')}</div></div>
      <div class="portfolio-summary-card"><div class="label">ARS → USD</div><div class="value">${fmtMoney(totalARS / tc, 'USD')}</div></div>`;
  } else if (vc === 'ars' && tc) {
    const total = totalARS + totalUSD * tc;
    const pnl = pnlARS + pnlUSD * tc;
    cards = `
      <div class="portfolio-summary-card"><div class="label">Valor Total</div><div class="value">${fmtMoney(total, 'ARS')}</div></div>
      <div class="portfolio-summary-card"><div class="label">P&L Total</div><div class="value" style="color:${pnl >= 0 ? 'var(--green)' : 'var(--red)'}">${pnl >= 0 ? '+' : ''}${fmtMoney(pnl, 'ARS')}</div></div>
      <div class="portfolio-summary-card"><div class="label">ARS</div><div class="value">${fmtMoney(totalARS, 'ARS')}</div></div>
      <div class="portfolio-summary-card"><div class="label">USD → ARS</div><div class="value">${fmtMoney(totalUSD * tc, 'ARS')}</div></div>`;
  } // else: split cards already set above

  // Big total number
  let totalHTML = '';
  if (tc) {
    const totalEnUSD = totalUSD + totalARS / tc;
    const totalEnARS = totalARS + totalUSD * tc;
    const pnlEnUSD = pnlUSD + pnlARS / tc;
    const pnlEnARS = pnlARS + pnlUSD * tc;
    const showARS = vc === 'ars';
    const grandTotal = showARS ? totalEnARS : totalEnUSD;
    const grandPnl = showARS ? pnlEnARS : pnlEnUSD;
    const grandCurr = showARS ? 'ARS' : 'USD';
    const pnlTotalColor = grandPnl >= 0 ? 'var(--green)' : 'var(--red)';
    totalHTML = `
      <div style="margin-bottom:16px">
        <div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-tertiary);font-weight:600">Valor total del portfolio</div>
        <div style="font-size:2.4rem;font-weight:800;color:var(--text);line-height:1.2">${fmtMoney(grandTotal, grandCurr)}</div>
        <div style="font-size:1rem;font-weight:600;color:${pnlTotalColor}">${grandPnl >= 0 ? '+' : ''}${fmtMoney(grandPnl, grandCurr)} P&L</div>
      </div>`;
  }

  summary.innerHTML = `${totalHTML}<div class="portfolio-summary-grid">${cards}</div>`;
}

function renderPortfolioHoldings(config) {
  const container = document.getElementById('portfolio-holdings');
  if (_portfolioHoldings.length === 0) {
    container.innerHTML = `
      <div class="portfolio-empty">
        <div class="emoji"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8V21H3V8"/><path d="M23 3H1v5h22V3z"/><path d="M10 12h4"/></svg></div>
        <p>No tenés activos en tu portfolio.</p>
        <p style="margin-top:8px;font-size:0.8rem">Hacé click en <strong>+ Agregar activo</strong> para empezar.</p>
      </div>`;
    return;
  }

  const rows = _portfolioHoldings.map(h => {
    const typeInfo = ASSET_TYPES[h.asset_type] || {};
    const v = getHoldingValue(h, config);
    const pnlColor = v.pnl != null && v.pnl >= 0 ? 'var(--green)' : v.pnl != null ? 'var(--red)' : 'var(--text-tertiary)';
    const currSymbol = v.currency === 'USD' ? 'US$' : '$';
    const priceStr = v.currentPrice != null ? `${currSymbol}${v.currentPrice.toFixed(2)}` : '<span style="color:var(--text-tertiary)">Sin precio</span>';
    const valueStr = v.noPrice ? '—' : fmtMoney(v.value, v.currency);
    const pnlStr = v.pnl != null ? `${v.pnl >= 0 ? '+' : ''}${fmtMoney(v.pnl, v.currency)}` : '—';
    const qty = parseFloat(h.quantity);
    const qtyStr = h.asset_type === 'garantizado' ? `$${qty.toLocaleString('es-AR')}` : qty.toLocaleString('es-AR');
    const ops = getOperationsFromHolding(h);
    const opsCount = ops.length;
    const opsBadge = opsCount > 1 ? `<span class="ops-badge">${opsCount} ops</span>` : '';

    return `<tr>
      <td><strong>${h.ticker}</strong>${opsBadge}<br><span style="font-size:0.7rem;color:var(--text-tertiary)">${typeInfo.label || h.asset_type}</span></td>
      <td>${qtyStr}</td>
      <td>${currSymbol}${parseFloat(h.purchase_price).toFixed(2)}</td>
      <td>${priceStr}</td>
      <td style="color:${pnlColor};font-weight:600">${pnlStr}</td>
      <td style="font-weight:700">${valueStr}</td>
      <td class="col-actions">
        <button onclick="openOperationsModal('${h.id}')" title="Operaciones"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
        <button onclick="deleteHolding('${h.id}')" title="Eliminar"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
      </td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <table class="portfolio-table">
      <thead><tr>
        <th>Activo</th><th>Cantidad</th><th>PPP</th><th>P.Actual</th><th>P&L</th><th>Valor</th><th></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  makeSortable(container.querySelector('.portfolio-table'));
}

// ─── Add/Edit Holding Modal ───

function openAddHoldingModal(editId) {
  const isEdit = typeof editId === 'string' && editId.length > 10;
  const existing = isEdit ? _portfolioHoldings.find(h => h.id === editId) : null;

  document.querySelector('.mundo-modal-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'mundo-modal-overlay';
  overlay.innerHTML = `
    <div class="mundo-modal" style="max-width:420px">
      <div class="mundo-modal-header">
        <h3 style="margin:0">${isEdit ? 'Editar' : 'Agregar'} activo</h3>
        <button class="mundo-modal-close">&times;</button>
      </div>
      <div class="mundo-modal-body" style="padding:16px">
        <div id="modal-step1">
          <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:12px">Tipo de activo</p>
          <div class="portfolio-type-grid">
            ${Object.entries(ASSET_TYPES).map(([key, t]) => `
              <button class="portfolio-type-btn ${existing?.asset_type === key ? 'selected' : ''}" data-type="${key}">
                <span class="emoji">${t.emoji}</span>${t.label}
              </button>`).join('')}
          </div>
        </div>
        <div id="modal-step2" style="display:none">
          <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:8px">Elegí el activo</p>
          <select id="modal-ticker" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:0.85rem;font-family:var(--font);background:var(--card-bg);color:var(--text)"></select>
          <div style="margin-top:16px;display:flex;flex-direction:column;gap:12px">
            <div>
              <label style="font-size:0.8rem;color:var(--text-secondary)" id="modal-qty-label">Cantidad</label>
              <input type="number" id="modal-qty" value="${existing ? existing.quantity : ''}" step="any" style="display:block;width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:0.95rem;font-weight:600;font-family:var(--font);background:var(--bg);color:var(--text)">
            </div>
            <div>
              <label style="font-size:0.8rem;color:var(--text-secondary)">Precio de compra <span id="modal-price-hint" style="color:var(--text-tertiary)">(por 100 VN)</span></label>
              <input type="number" id="modal-price" value="${existing ? existing.purchase_price : ''}" step="any" placeholder="Ej: 62.50" style="display:block;width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:0.95rem;font-weight:600;font-family:var(--font);background:var(--bg);color:var(--text)">
              <p id="modal-price-example" style="font-size:0.7rem;color:var(--text-tertiary);margin-top:4px">Precio en la moneda del activo, por cada 100 VN. Ej: AL30 a US$62.50</p>
            </div>
            <div>
              <label style="font-size:0.8rem;color:var(--text-secondary)">Fecha de compra</label>
              <input type="date" id="modal-date" value="${existing ? existing.purchase_date : new Date().toISOString().slice(0,10)}" style="display:block;width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:0.85rem;font-family:var(--font);background:var(--bg);color:var(--text)">
            </div>
          </div>
          <button id="modal-save" style="margin-top:16px;width:100%;padding:10px;background:var(--accent);color:#fff;border:none;border-radius:6px;font-size:0.9rem;font-weight:600;cursor:pointer;font-family:var(--font)">
            ${isEdit ? 'Guardar cambios' : 'Agregar al portfolio'}
          </button>
          <p id="modal-error" style="color:var(--red);font-size:0.8rem;margin-top:8px;display:none"></p>
        </div>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.querySelector('.mundo-modal-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  let selectedType = existing?.asset_type || null;

  async function showStep2(type) {
    selectedType = type;
    overlay.querySelectorAll('.portfolio-type-btn').forEach(b => b.classList.toggle('selected', b.dataset.type === type));
    const config = await getPortfolioConfig();
    const tickers = getTickersForType(config, type);
    const select = overlay.querySelector('#modal-ticker');
    const step2 = overlay.querySelector('#modal-step2');

    // Remove custom fields if they exist
    overlay.querySelector('#modal-custom-fields')?.remove();

    if (type === 'cash') {
      select.innerHTML = '<option value="USD">Dólares (USD)</option><option value="ARS">Pesos (ARS)</option>';
      if (existing) select.value = existing.ticker;
      overlay.querySelector('#modal-qty-label').textContent = 'Monto';
      overlay.querySelector('#modal-price-hint').textContent = '(no aplica)';
      overlay.querySelector('#modal-price-example').textContent = 'Para cash poné 1 como precio';
      overlay.querySelector('#modal-price').placeholder = '1';
      overlay.querySelector('#modal-price').value = existing ? existing.purchase_price : '1';
    } else if (type === 'custom') {
      select.innerHTML = '<option value="">Escribí el nombre abajo</option>';
      // Add custom fields: name, currency, current price
      const customHTML = `<div id="modal-custom-fields" style="margin-top:12px;display:flex;flex-direction:column;gap:12px">
        <div><label style="font-size:0.8rem;color:var(--text-secondary)">Nombre del activo</label>
          <input type="text" id="modal-custom-name" value="${existing?.ticker || ''}" placeholder="Ej: Bitcoin, AAPL, Ethereum" style="display:block;width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:0.95rem;font-weight:600;font-family:var(--font);background:var(--bg);color:var(--text)"></div>
        <div><label style="font-size:0.8rem;color:var(--text-secondary)">Moneda</label>
          <select id="modal-custom-currency" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:0.85rem;font-family:var(--font);background:var(--card-bg);color:var(--text)">
            <option value="USD" ${existing?.metadata?.currency === 'USD' || !existing ? 'selected' : ''}>USD</option>
            <option value="ARS" ${existing?.metadata?.currency === 'ARS' ? 'selected' : ''}>ARS</option>
          </select></div>
        <div><label style="font-size:0.8rem;color:var(--text-secondary)">Precio actual (opcional, para calcular P&L)</label>
          <input type="number" id="modal-custom-current-price" value="${existing?.metadata?.current_price || ''}" placeholder="Ej: 70000" step="any" style="display:block;width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:0.95rem;font-weight:600;font-family:var(--font);background:var(--bg);color:var(--text)"></div>
      </div>`;
      select.style.display = 'none';
      select.insertAdjacentHTML('afterend', customHTML);
      overlay.querySelector('#modal-qty-label').textContent = 'Cantidad';
      overlay.querySelector('#modal-price-hint').textContent = '(precio de compra por unidad)';
      overlay.querySelector('#modal-price-example').textContent = 'Precio al que compraste cada unidad';
      overlay.querySelector('#modal-price').placeholder = 'Ej: 65000';
    } else {
      select.style.display = '';
      select.innerHTML = tickers.map(t => `<option value="${t}" ${existing?.ticker === t ? 'selected' : ''}>${t}</option>`).join('');
      overlay.querySelector('#modal-qty-label').textContent = ASSET_TYPES[type]?.qtyLabel || 'Cantidad';
      const priceHints = {
        soberano: { hint: '(USD por 100 VN)', example: 'Precio en USD por cada 100 VN. Ej: AL30 a US$62.50', placeholder: 'Ej: 62.50' },
        on: { hint: '(USD por 100 VN)', example: 'Precio en USD por cada 100 VN. Ej: BACG a US$102.50', placeholder: 'Ej: 102.50' },
        cer: { hint: '(ARS por 100 VN)', example: 'Precio en ARS por cada 100 VN. Ej: TX26 a $110.25', placeholder: 'Ej: 110.25' },
        lecap: { hint: '(ARS por 100 VN)', example: 'Precio en ARS por cada 100 VN. Ej: S17A6 a $108.40', placeholder: 'Ej: 108.40' },
        fci: { hint: '(por cuotaparte)', example: 'Valor de la cuotaparte al momento de compra', placeholder: 'Ej: 5250.00' },
        garantizado: { hint: '(no aplica)', example: 'Para billeteras no se usa precio de compra, poné 1', placeholder: '1' },
      };
      const ph = priceHints[type] || {};
      overlay.querySelector('#modal-price-hint').textContent = ph.hint || '';
      overlay.querySelector('#modal-price-example').textContent = ph.example || '';
      overlay.querySelector('#modal-price').placeholder = ph.placeholder || '';
    }
    step2.style.display = '';
  }

  overlay.querySelectorAll('.portfolio-type-btn').forEach(btn => {
    btn.addEventListener('click', () => showStep2(btn.dataset.type));
  });

  if (existing) showStep2(existing.asset_type);

  overlay.querySelector('#modal-save').addEventListener('click', async () => {
    let ticker = overlay.querySelector('#modal-ticker').value;
    const qty = parseFloat(overlay.querySelector('#modal-qty').value);
    const price = parseFloat(overlay.querySelector('#modal-price').value);
    const date = overlay.querySelector('#modal-date').value;
    const errorEl = overlay.querySelector('#modal-error');

    let metadata = {};
    if (selectedType === 'custom') {
      ticker = overlay.querySelector('#modal-custom-name')?.value?.trim() || '';
      const curr = overlay.querySelector('#modal-custom-currency')?.value || 'USD';
      const curPrice = parseFloat(overlay.querySelector('#modal-custom-current-price')?.value) || 0;
      metadata = { currency: curr, current_price: curPrice || null };
    }

    if (!selectedType || !ticker || !qty || !date) {
      errorEl.textContent = 'Completá todos los campos';
      errorEl.style.display = '';
      return;
    }
    if (selectedType !== 'cash' && !price) {
      errorEl.textContent = 'Completá el precio de compra';
      errorEl.style.display = '';
      return;
    }

    // ─── Input validation (defense in depth) ───
    const VALID_TYPES = ['soberano', 'on', 'cer', 'lecap', 'fci', 'garantizado', 'cash', 'custom'];
    if (!VALID_TYPES.includes(selectedType)) {
      errorEl.textContent = 'Tipo de activo inválido';
      errorEl.style.display = '';
      return;
    }
    if (ticker.length > 50) {
      errorEl.textContent = 'Ticker demasiado largo';
      errorEl.style.display = '';
      return;
    }
    if (qty <= 0 || qty > 1e12) {
      errorEl.textContent = 'Cantidad inválida';
      errorEl.style.display = '';
      return;
    }
    if (price < 0 || price > 1e12) {
      errorEl.textContent = 'Precio inválido';
      errorEl.style.display = '';
      return;
    }
    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime()) || dateObj < new Date('2000-01-01') || dateObj > new Date('2100-01-01')) {
      errorEl.textContent = 'Fecha inválida';
      errorEl.style.display = '';
      return;
    }
    if (JSON.stringify(metadata).length > 5000) {
      errorEl.textContent = 'Metadata demasiado grande';
      errorEl.style.display = '';
      return;
    }

    // Store initial buy operation in metadata for PPP tracking
    const initialOp = { type: 'buy', qty, price: price || 1, date };
    metadata.operations = [initialOp];

    const record = {
      user_id: currentUser.id,
      asset_type: selectedType,
      ticker,
      quantity: qty,
      purchase_price: price || 1,
      purchase_date: date,
      metadata,
    };

    try {
      if (isEdit) {
        const { error } = await supabaseClient.from('holdings').update(record).eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await supabaseClient.from('holdings').insert(record);
        if (error) throw error;
      }
      overlay.remove();
      loadPortfolio();
    } catch (e) {
      errorEl.textContent = 'Error: ' + e.message;
      errorEl.style.display = '';
    }
  });
}

function editHolding(id) {
  openOperationsModal(id);
}

function openOperationsModal(holdingId) {
  const holding = _portfolioHoldings.find(h => h.id === holdingId);
  if (!holding) return;

  const ops = getOperationsFromHolding(holding);
  const { ppp, netQty } = computePosition(ops);
  const typeInfo = ASSET_TYPES[holding.asset_type] || {};
  const curr = typeInfo.currency === 'USD' ? 'US$' : '$';
  const isBond = ['soberano', 'on', 'cer', 'lecap'].includes(holding.asset_type);
  const priceLabel = isBond ? 'por 100 VN' : 'por unidad';

  const opsRows = ops.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(op => {
    const isBuy = op.type === 'buy';
    const typeClass = isBuy ? 'ops-buy' : 'ops-sell';
    const typeText = isBuy ? 'Compra' : 'Venta';
    return `<tr class="${typeClass}">
      <td>${op.date || '—'}</td>
      <td>${typeText}</td>
      <td>${parseFloat(op.qty).toLocaleString('es-AR')}</td>
      <td>${curr}${parseFloat(op.price).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
    </tr>`;
  }).join('');

  const overlay = document.createElement('div');
  overlay.className = 'mundo-modal-overlay';
  overlay.innerHTML = `
    <div class="mundo-modal ops-modal">
      <button class="mundo-modal-close" id="ops-close">&times;</button>
      <h3 style="margin:0 0 12px;font-size:1.1rem;font-weight:700;color:var(--text)">${holding.ticker} <span style="font-weight:400;color:var(--text-secondary);font-size:0.85rem">${typeInfo.label || ''}</span></h3>

      <div class="ops-summary">
        <div class="ops-summary-item"><span class="ops-label">Posición</span><span class="ops-value">${netQty.toLocaleString('es-AR')} ${isBond ? 'VN' : typeInfo.qtyLabel || ''}</span></div>
        <div class="ops-summary-item"><span class="ops-label">PPP</span><span class="ops-value">${curr}${ppp.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
        <div class="ops-summary-item"><span class="ops-label">Operaciones</span><span class="ops-value">${ops.length}</span></div>
      </div>

      ${ops.length > 0 ? `
      <table class="ops-table">
        <thead><tr><th>Fecha</th><th>Tipo</th><th>Cantidad</th><th>Precio</th></tr></thead>
        <tbody>${opsRows}</tbody>
      </table>` : ''}

      <div class="ops-add-section">
        <div style="font-size:0.85rem;font-weight:600;color:var(--text);margin-bottom:8px">Agregar operación</div>
        <div class="ops-type-toggle">
          <button class="ops-type-btn ops-type-buy active" data-type="buy">Compra</button>
          <button class="ops-type-btn ops-type-sell" data-type="sell">Venta</button>
        </div>
        <div class="ops-form-row">
          <div class="ops-field">
            <label>Cantidad</label>
            <input type="number" id="ops-qty" step="any" min="0" placeholder="${isBond ? 'VN' : 'Cant.'}">
          </div>
          <div class="ops-field">
            <label>Precio <span style="color:var(--text-tertiary);font-size:0.75rem">${priceLabel}</span></label>
            <input type="number" id="ops-price" step="any" min="0" placeholder="${curr}0.00">
          </div>
          <div class="ops-field">
            <label>Fecha</label>
            <input type="date" id="ops-date" value="${new Date().toISOString().slice(0, 10)}">
          </div>
        </div>
        <div id="ops-error" style="color:var(--red);font-size:0.8rem;margin-top:4px;display:none"></div>
        <button id="ops-save" class="portfolio-add-btn" style="width:100%;margin-top:10px;padding:10px">Agregar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('active'));

  // Type toggle
  let selectedOpType = 'buy';
  overlay.querySelectorAll('.ops-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      overlay.querySelectorAll('.ops-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedOpType = btn.dataset.type;
    });
  });

  // Save operation
  overlay.querySelector('#ops-save').addEventListener('click', async () => {
    const errorEl = overlay.querySelector('#ops-error');
    errorEl.style.display = 'none';
    const qty = parseFloat(overlay.querySelector('#ops-qty').value);
    const price = parseFloat(overlay.querySelector('#ops-price').value);
    const date = overlay.querySelector('#ops-date').value;

    if (!qty || qty <= 0) { errorEl.textContent = 'Cantidad debe ser mayor a 0'; errorEl.style.display = ''; return; }
    if (isNaN(price) || price < 0) { errorEl.textContent = 'Precio inválido'; errorEl.style.display = ''; return; }
    if (!date) { errorEl.textContent = 'Fecha requerida'; errorEl.style.display = ''; return; }

    const result = await addOperationToHolding(holdingId, { type: selectedOpType, qty, price, date });
    if (result.error) {
      errorEl.textContent = result.error;
      errorEl.style.display = '';
      return;
    }
    overlay.classList.remove('active');
    setTimeout(() => overlay.remove(), 200);
    loadPortfolio();
  });

  // Close
  const close = () => { overlay.classList.remove('active'); setTimeout(() => overlay.remove(), 200); };
  overlay.querySelector('#ops-close').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
}

async function deleteHolding(id) {
  if (!confirm('¿Eliminar este activo del portfolio?')) return;
  try {
    await supabaseClient.from('holdings').delete().eq('id', id);
    loadPortfolio();
  } catch (e) {
    alert('Error eliminando: ' + e.message);
  }
}

// ─── Cash Flow Calendar ───

async function renderPortfolioCashflows(config) {
  const container = document.getElementById('portfolio-cashflows');
  const chartWrapper = document.getElementById('portfolio-cashflow-chart-wrapper');
  const bondHoldings = _portfolioHoldings.filter(h => ['soberano', 'on', 'cer', 'lecap'].includes(h.asset_type));

  if (bondHoldings.length === 0) {
    container.innerHTML = '<p style="color:var(--text-tertiary);font-size:0.85rem;padding:16px 0">Agregá bonos a tu portfolio para ver el calendario de cobros.</p>';
    if (chartWrapper) chartWrapper.style.display = 'none';
    return;
  }

  // Fetch CER coefficient if needed
  let cerActual = 0;
  const hasCER = bondHoldings.some(h => h.asset_type === 'cer');
  if (hasCER) {
    try {
      const cerResp = await fetch('/api/cer?v=2').then(r => r.json());
      cerActual = cerResp?.cer || cerResp?.data || 0;
    } catch (e) { /* ignore */ }
  }

  const flows = [];
  const today = new Date();

  for (const holding of bondHoldings) {
    const qty = parseFloat(holding.quantity) || 0;

    if (holding.asset_type === 'soberano') {
      const bond = config.soberanos?.[holding.ticker];
      if (!bond?.flujos) continue;
      for (const f of bond.flujos) {
        const fecha = typeof f.fecha === 'string' ? parseLocalDate(f.fecha) : f.fecha;
        if (fecha <= today) continue;
        flows.push({ date: fecha, amount: f.monto * (qty / 100), currency: 'USD', ticker: holding.ticker, type: 'soberano' });
      }
    }

    if (holding.asset_type === 'on') {
      const bond = config.ons?.[holding.ticker];
      if (!bond?.flujos) continue;
      for (const f of bond.flujos) {
        const fecha = typeof f.fecha === 'string' ? parseLocalDate(f.fecha) : f.fecha;
        if (fecha <= today) continue;
        flows.push({ date: fecha, amount: f.monto * qty, currency: 'USD', ticker: holding.ticker, type: 'on' });
      }
    }

    if (holding.asset_type === 'cer' && cerActual) {
      const bond = config.bonos_cer?.[holding.ticker];
      if (!bond?.flujos) continue;
      const coefCER = cerActual / (bond.cer_emision || 1);
      let amortAcum = 0;
      for (const f of bond.flujos) {
        const vrAntes = 1 - amortAcum;
        amortAcum += (f.amortizacion || 0);
        const fecha = typeof f.fecha === 'string' ? parseLocalDate(f.fecha) : f.fecha;
        if (fecha <= today) continue;
        const flujo = (vrAntes * (f.tasa_interes || 0) * (f.base || 0.5) + (f.amortizacion || 0)) * coefCER;
        const multiplier = holding.ticker === 'DICP' ? 1.27 : 1;
        flows.push({ date: fecha, amount: flujo * qty * multiplier, currency: 'ARS', ticker: holding.ticker, type: 'cer' });
      }
    }

    if (holding.asset_type === 'lecap') {
      const lecap = (config.lecaps?.letras || []).find(l => l.ticker === holding.ticker);
      if (!lecap) continue;
      const fecha = parseLocalDate(lecap.fecha_vencimiento);
      if (fecha <= today) continue;
      flows.push({ date: fecha, amount: lecap.pago_final * (qty / 100), currency: 'ARS', ticker: holding.ticker, type: 'lecap' });
    }
  }

  flows.sort((a, b) => a.date - b.date);

  if (flows.length === 0) {
    container.innerHTML = '<p style="color:var(--text-tertiary);font-size:0.85rem;padding:16px 0">No hay flujos futuros para tus bonos actuales.</p>';
    if (chartWrapper) chartWrapper.style.display = 'none';
    return;
  }

  // Group by month
  const months = {};
  for (const f of flows) {
    const key = f.date.getFullYear() + '-' + String(f.date.getMonth() + 1).padStart(2, '0');
    if (!months[key]) months[key] = { usd: 0, ars: 0, details: [] };
    if (f.currency === 'USD') months[key].usd += f.amount;
    else months[key].ars += f.amount;
    months[key].details.push(f);
  }

  const monthNames = MONTH_NAMES;
  let tableHTML = '';
  for (const [key, m] of Object.entries(months)) {
    const [year, mon] = key.split('-');
    const monthLabel = `${monthNames[parseInt(mon)-1]} ${year}`;
    const totalUsdStr = m.usd > 0 ? 'US$' + m.usd.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2}) : '';
    const totalArsStr = m.ars > 0 ? '$' + m.ars.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2}) : '';
    const totalStr = [totalUsdStr, totalArsStr].filter(Boolean).join(' + ');
    tableHTML += `<tr class="cashflow-month-header"><td colspan="4">${monthLabel} <span style="font-weight:400;font-size:0.75rem;color:var(--text-secondary);margin-left:8px">${totalStr}</span></td></tr>`;
    // Individual flows sorted by date
    const sorted = m.details.sort((a, b) => a.date - b.date);
    for (const d of sorted) {
      const sym = d.currency === 'USD' ? 'US$' : '$';
      const dateStr = d.date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
      tableHTML += `<tr>
        <td style="color:var(--text-secondary)">${dateStr}</td>
        <td style="text-align:right;font-weight:600">${d.currency === 'USD' ? sym + d.amount.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2}) : '—'}</td>
        <td style="text-align:right;font-weight:600">${d.currency === 'ARS' ? sym + d.amount.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2}) : '—'}</td>
        <td style="font-size:0.75rem;color:var(--text-tertiary)">${d.ticker} <span style="opacity:0.6">${d.type}</span></td>
      </tr>`;
    }
  }

  container.innerHTML = `
    <table class="cashflow-table">
      <thead><tr><th>Fecha</th><th style="text-align:right">USD</th><th style="text-align:right">ARS</th><th>Activo</th></tr></thead>
      <tbody>${tableHTML}</tbody>
    </table>`;

  // Render chart
  if (chartWrapper) {
    chartWrapper.style.display = '';
    renderCashflowChart(months);
  }
}

let _cashflowChart = null;
function renderCashflowChart(months) {
  const canvas = document.getElementById('portfolio-cashflow-chart');
  if (!canvas) return;
  if (_cashflowChart) _cashflowChart.destroy();

  const textColor = '#555555';
  const gridColor = '#1a1a1a';
  const monthNames = MONTH_NAMES;
  const labels = Object.keys(months).map(k => { const [y,m] = k.split('-'); return `${monthNames[parseInt(m)-1]} ${y}`; });
  const usdData = Object.values(months).map(m => m.usd);
  const arsData = Object.values(months).map(m => m.ars);

  _cashflowChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'USD', data: usdData, backgroundColor: '#4da6ff', yAxisID: 'yUSD', borderRadius: 2 },
        { label: 'ARS', data: arsData, backgroundColor: '#00d26a', yAxisID: 'yARS', borderRadius: 2 },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: textColor } } },
      scales: {
        x: { ticks: { color: textColor }, grid: { color: gridColor } },
        yUSD: { position: 'left', title: { display: true, text: 'USD', color: textColor }, ticks: { color: textColor }, grid: { color: gridColor } },
        yARS: { position: 'right', title: { display: true, text: 'ARS', color: textColor }, ticks: { color: textColor }, grid: { display: false } },
      }
    }
  });
}

// ─── Dolar ───
// Exchange logos — local SVGs + API logoUrl (comparadolar.ar) + ENTITY_LOGOS + initials fallback
const DOLAR_LOGO_FILE = {
  belo: '/logos/exchanges/belo.svg',
  buenbit: '/logos/exchanges/buenbit.svg',
  cocos: '/logos/exchanges/cocos.svg',
  cocoscapital: '/logos/exchanges/cocos.svg',
  cocoscrypto: '/logos/exchanges/cocoscrypto.svg',
  dolarapp: '/logos/exchanges/dolarapp.svg',
  fiwind: '/logos/exchanges/fiwind.svg',
  lemon: '/logos/exchanges/lemon.svg',
  lemoncash: '/logos/exchanges/lemon.svg',
  letsbit: '/logos/exchanges/letsbit.svg',
  pluscrypto: '/logos/exchanges/pluscrypto.svg',
  ripio: '/logos/exchanges/ripio.svg',
  ripioexchange: '/logos/exchanges/ripio.svg',
  satoshitango: '/logos/exchanges/satoshitango.svg',
  wallbit: '/logos/exchanges/wallbit.svg',
  bitsoalpha: '/logos/exchanges/bitso.svg',
  bybit: '/logos/exchanges/bybit.svg',
  decrypto: '/logos/exchanges/decrypto.svg',
  cryptomkt: '/logos/exchanges/cryptomkt.svg',
  p2pme: '/logos/exchanges/p2pme.svg',
};
const DOLAR_LOGO_ENTITY = {
  lbfinanzas: 'LB Finanzas',
};
const DOLAR_LOGO_INITIALS = {
  tiendacrypto: { t: 'TC', bg: '#2563eb' },
  vibrant: { t: 'VB', bg: '#6366f1' },
  saldo: { t: 'SA', bg: '#10b981' },
};
function getDolarExchangeLogo(id, name, logoUrl) {
  const file = DOLAR_LOGO_FILE[id];
  if (file) return `<img src="${file}" alt="${name}" style="width:24px;height:24px;border-radius:6px;object-fit:contain;">`;
  const entityKey = DOLAR_LOGO_ENTITY[id];
  if (entityKey && ENTITY_LOGOS[entityKey]) return `<img src="${ENTITY_LOGOS[entityKey]}" alt="${name}" style="width:24px;height:24px;border-radius:6px;object-fit:contain;">`;
  if (logoUrl) return `<img src="${logoUrl}" alt="${name}" style="width:24px;height:24px;border-radius:6px;object-fit:contain;">`;
  const ini = DOLAR_LOGO_INITIALS[id];
  if (ini) return `<div class="dolar-tipo-icon" style="background:${ini.bg};${ini.c ? 'color:' + ini.c : ''}">${ini.t}</div>`;
  return `<div class="dolar-tipo-icon" style="background:#6b7280">${(name || '').slice(0, 2).toUpperCase()}</div>`;
}

async function loadDolar() {
  const bestEl = document.getElementById('dolar-best');
  const tiposEl = document.getElementById('dolar-tipos');
  const exchangesEl = document.getElementById('dolar-exchanges');
  const sourceEl = document.getElementById('dolar-source');

  exchangesEl.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Cargando cotizaciones...</p></div>';
  tiposEl.innerHTML = '';

  try {
    const res = await fetch('/api/dolar');
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const { exchanges, updated } = await res.json();

    // ── Detect if market is closed (Mon-Fri 11:00-17:00 ART) ──
    function isMarketOpen() {
      const now = new Date();
      // ART is UTC-3
      const artNow = new Date(now.getTime() + (now.getTimezoneOffset() - 180) * 60000);
      const day = artNow.getDay();
      const hour = artNow.getHours();
      if (day === 0 || day === 6) return false; // weekend
      return hour >= 10 && hour < 17;
    }
    const marketOpen = isMarketOpen();
    let only24x7 = !marketOpen; // default ON when market is closed

    function getUsdList() {
      const all = (exchanges.usd || []).filter(e => e.ask > 0 && e.bid > 0);
      return only24x7 ? all.filter(e => e.is24x7) : all;
    }

    // ── Best buy / best sell hero — USD billete only ──
    function renderBest() {
      const usdProviders = getUsdList();
      if (usdProviders.length === 0) { bestEl.innerHTML = ''; return; }
      const bestBuy = usdProviders.reduce((a, b) => a.ask < b.ask ? a : b);
      const bestSell = usdProviders.reduce((a, b) => a.bid > b.bid ? a : b);
      const bestSpread = usdProviders.reduce((a, b) => a.spread < b.spread ? a : b);

      bestEl.innerHTML = `
        <div class="dolar-best-card best-sell">
          <div class="dolar-best-label">Mejor para vender</div>
          <div class="dolar-best-exchange">${getDolarExchangeLogo(bestSell.id, bestSell.name, bestSell.logoUrl)} ${bestSell.name}</div>
          <div class="dolar-best-price">$${bestSell.bid.toLocaleString('es-AR', {minimumFractionDigits: 2})}</div>
        </div>
        <div class="dolar-best-card best-buy">
          <div class="dolar-best-label">Mejor para comprar</div>
          <div class="dolar-best-exchange">${getDolarExchangeLogo(bestBuy.id, bestBuy.name, bestBuy.logoUrl)} ${bestBuy.name}</div>
          <div class="dolar-best-price">$${bestBuy.ask.toLocaleString('es-AR', {minimumFractionDigits: 2})}</div>
        </div>
        <div class="dolar-best-card dolar-spread-card">
          <div class="dolar-best-label" style="color:var(--yellow)">Menor spread</div>
          <div class="dolar-best-exchange">${getDolarExchangeLogo(bestSpread.id, bestSpread.name, bestSpread.logoUrl)} ${bestSpread.name}</div>
          <div class="dolar-best-price">${bestSpread.spread}%</div>
        </div>`;
    }
    renderBest();

    // ── Exchange table (proveedores) ──
    let currentCoin = 'usd';
    let currentSort = 'buy';

    function renderExchangeTable() {
      const list = currentCoin === 'usd' ? getUsdList() : (exchanges[currentCoin] || []);
      const sorted = [...list].sort((a, b) => {
        if (currentSort === 'buy') return a.ask - b.ask;
        return b.bid - a.bid;
      });

      const rows = sorted.map((ex, i) => {
        const rank = i + 1;
        const rankClass = rank <= 3 ? `rank-${rank}` : 'rank-other';
        const isBestBuy = currentSort === 'buy' && rank === 1;
        const isBestSell = currentSort === 'sell' && rank === 1;
        const logo = getDolarExchangeLogo(ex.id, ex.name, ex.logoUrl);
        const bidStr = ex.bid ? '$' + ex.bid.toLocaleString('es-AR', {minimumFractionDigits: 2}) : '-';
        const askStr = ex.ask ? '$' + ex.ask.toLocaleString('es-AR', {minimumFractionDigits: 2}) : '-';
        const bankBadge = ex.isBank ? '<span class="dolar-bank-badge">Banco</span>' : '';
        const closedBadge = (currentCoin === 'usd' && ex.is24x7 === false) ? '<span class="dolar-bank-badge dolar-closed-badge" title="No opera 24/7">Cerrado</span>' : '';
        const varHtml = ex.pctVariation != null ? `<span class="dolar-variation ${ex.pctVariation >= 0 ? 'up' : 'down'}">${ex.pctVariation >= 0 ? '+' : ''}${ex.pctVariation.toFixed(2)}%</span>` : '';
        return `<tr>
          <td><span class="dolar-exchange-name"><span class="dolar-rank ${rankClass}">${rank}</span> ${logo} ${ex.name}${bankBadge}${closedBadge}</span></td>
          <td class="col-right">${isBestSell ? '<span class="dolar-best-tag">MEJOR</span> ' : ''}${bidStr}</td>
          <td class="col-right">${isBestBuy ? '<span class="dolar-best-tag">MEJOR</span> ' : ''}${askStr}${varHtml}</td>
          <td class="col-right">${ex.spread}%</td>
        </tr>`;
      }).join('');

      const tableEl = document.getElementById('dolar-exchange-table-body');
      if (tableEl) tableEl.innerHTML = rows;
    }

    exchangesEl.innerHTML = `
      <div class="dolar-exchange-section">
        <div class="dolar-exchange-header">
          <span class="dolar-exchange-title">Proveedores</span>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <div class="dolar-coin-toggle">
              <button class="dolar-coin-btn active" data-coin="usd">USD</button>
              <button class="dolar-coin-btn" data-coin="usdt">USDT</button>
              <button class="dolar-coin-btn" data-coin="usdc">USDC</button>
            </div>
            <div class="dolar-sort-toggle">
              <button class="dolar-sort-btn active" data-sort="buy">Mejor compra</button>
              <button class="dolar-sort-btn" data-sort="sell">Mejor venta</button>
            </div>
            <label class="dolar-24x7-toggle" id="dolar-24x7-wrap" title="${marketOpen ? 'Mercado abierto' : 'Mercado cerrado — los bancos pueden tener cotizaciones desactualizadas'}">
              <input type="checkbox" id="dolar-24x7-checkbox" ${only24x7 ? 'checked' : ''}>
              <span>Solo 24/7</span>
            </label>
          </div>
        </div>
        <table class="dolar-exchange-table">
          <thead>
            <tr>
              <th>Proveedor</th>
              <th class="col-right">Vendés a</th>
              <th class="col-right">Comprás a</th>
              <th class="col-right">Spread</th>
            </tr>
          </thead>
          <tbody id="dolar-exchange-table-body"></tbody>
        </table>
      </div>`;

    renderExchangeTable();

    // Show/hide 24/7 toggle based on coin
    function update24x7Visibility() {
      const wrap = document.getElementById('dolar-24x7-wrap');
      if (wrap) wrap.style.display = currentCoin === 'usd' ? '' : 'none';
    }
    update24x7Visibility();

    // Coin toggle
    exchangesEl.querySelectorAll('.dolar-coin-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        exchangesEl.querySelectorAll('.dolar-coin-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentCoin = btn.dataset.coin;
        update24x7Visibility();
        renderExchangeTable();
      });
    });

    // Sort toggle
    exchangesEl.querySelectorAll('.dolar-sort-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        exchangesEl.querySelectorAll('.dolar-sort-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentSort = btn.dataset.sort;
        renderExchangeTable();
      });
    });

    // 24/7 toggle
    const checkbox24x7 = document.getElementById('dolar-24x7-checkbox');
    if (checkbox24x7) {
      checkbox24x7.addEventListener('change', () => {
        only24x7 = checkbox24x7.checked;
        renderBest();
        if (currentCoin === 'usd') renderExchangeTable();
      });
    }

    // Source
    const updTime = new Date(updated);
    const timeStr = updTime.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    sourceEl.innerHTML = `Fuente: <a href="https://comparadolar.ar" target="_blank" rel="noopener">comparadolar.ar</a> — Actualizado ${timeStr}`;

  } catch (err) {
    console.error('Dolar load error:', err);
    tiposEl.innerHTML = '<div class="loading">No se pudieron cargar las cotizaciones del dolar.</div>';
  }
}

// ─── PIX (comparapix.ar) ───
const PIX_API = '/api/pix';
const PIX_CACHE_KEY = 'pix-quotes-cache';
const PIX_CACHE_TTL = 5 * 60 * 1000;

function formatPixName(key) {
  return key.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

async function loadPix() {
  const bestEl = document.getElementById('pix-best');
  const exchangesEl = document.getElementById('pix-exchanges');
  const sourceEl = document.getElementById('pix-source');

  exchangesEl.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Cargando cotizaciones PIX...</p></div>';

  try {
    // Check cache
    let data;
    try {
      const raw = localStorage.getItem(PIX_CACHE_KEY);
      if (raw) {
        const { d, ts } = JSON.parse(raw);
        if (Date.now() - ts < PIX_CACHE_TTL) data = d;
      }
    } catch {}

    if (!data) {
      const res = await fetch(PIX_API);
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      data = await res.json();
      localStorage.setItem(PIX_CACHE_KEY, JSON.stringify({ d: data, ts: Date.now() }));
    }

    // Parse providers
    const providers = [];
    for (const [key, info] of Object.entries(data)) {
      if (!info.isPix) continue;
      const brlArs = info.quotes.find(q => q.symbol === 'BRLARS');
      if (!brlArs || !brlArs.buy) continue;
      providers.push({
        id: key,
        name: formatPixName(key),
        price: brlArs.buy,
        sell: brlArs.sell || null,
        spread: brlArs.spread_pct || null,
        logo: info.logo,
        url: info.url,
        hasFees: info.hasFees || false,
      });
    }
    providers.sort((a, b) => a.price - b.price);

    if (!providers.length) {
      exchangesEl.innerHTML = '<div class="loading">No se encontraron cotizaciones PIX.</div>';
      return;
    }

    const best = providers[0];
    const worst = providers[providers.length - 1];
    // Best cards
    bestEl.innerHTML = `
      <div class="dolar-best-card best-buy">
        <div class="dolar-best-label">Mejor precio</div>
        <div class="dolar-best-exchange"><img src="${best.logo}" alt="${best.name}" style="width:20px;height:20px;border-radius:4px;vertical-align:middle;margin-right:4px"> ${best.name}</div>
        <div class="dolar-best-price">$${best.price.toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
      </div>
      <div class="dolar-best-card best-sell">
        <div class="dolar-best-label">Peor precio</div>
        <div class="dolar-best-exchange"><img src="${worst.logo}" alt="${worst.name}" style="width:20px;height:20px;border-radius:4px;vertical-align:middle;margin-right:4px"> ${worst.name}</div>
        <div class="dolar-best-price">$${worst.price.toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
      </div>`;

    // Exchange table
    const rows = providers.map((p, i) => {
      const rank = i + 1;
      const rankClass = rank <= 3 ? `rank-${rank}` : 'rank-other';
      const diff = p.price - best.price;
      const diffStr = diff > 0 ? `<span style="color:var(--red);font-size:0.75rem">+$${diff.toFixed(2)}</span>` : '';
      const spreadStr = p.spread ? `${p.spread.toFixed(1)}%` : '-';
      const feeBadge = p.hasFees ? ' <span style="font-size:0.65rem;color:var(--red);background:var(--red-bg,rgba(239,68,68,0.1));padding:1px 5px;border-radius:4px;font-weight:600">+FEES</span>' : '';
      return `<tr>
        <td><span class="dolar-exchange-name"><span class="dolar-rank ${rankClass}">${rank}</span> <img src="${p.logo}" alt="${p.name}" style="width:24px;height:24px;border-radius:6px;object-fit:contain;vertical-align:middle"> ${p.name}${feeBadge}</span></td>
        <td class="col-right">$${p.price.toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2})} ${diffStr}</td>
        <td class="col-right">${spreadStr}</td>
        <td class="col-right pix-link-cell"><a href="${p.url}" target="_blank" rel="noopener" class="pix-provider-link">Ir</a></td>
      </tr>`;
    }).join('');

    exchangesEl.innerHTML = `
      <div class="dolar-exchange-section">
        <div class="dolar-exchange-header">
          <span class="dolar-exchange-title">Proveedores PIX — BRL/ARS</span>
          <span style="font-size:0.8rem;color:var(--text-muted)">${providers.length} proveedores</span>
        </div>
        <table class="dolar-exchange-table">
          <thead>
            <tr>
              <th>Proveedor</th>
              <th class="col-right">Precio ARS/BRL</th>
              <th class="col-right">Spread</th>
              <th class="col-right"></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    const timeStr = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    sourceEl.innerHTML = `Fuente: <a href="https://comparapix.ar" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:underline">comparapix.ar</a> — Actualizado ${timeStr}`;

  } catch (err) {
    console.error('PIX load error:', err);
    exchangesEl.innerHTML = '<div class="loading">No se pudieron cargar las cotizaciones PIX.</div>';
  }
}

// ─── Mundial 2026 ───
function renderMundial() {
  const MUNDIAL_GROUPS = [
    { letter: 'A', venue: 'Mexico', teams: [
      { name: 'Mexico', flag: '\uD83C\uDDF2\uD83C\uDDFD', tag: 'host' },
      { name: 'Corea del Sur', flag: '\uD83C\uDDF0\uD83C\uDDF7' },
      { name: 'Sudafrica', flag: '\uD83C\uDDFF\uD83C\uDDE6' },
      { name: 'Playoff UEFA D', flag: '\uD83C\uDDEA\uD83C\uDDFA', tag: 'playoff' },
    ], matches: [
      { date: '11 Jun', t1: 'Mexico', t2: 'Sudafrica', city: 'Mexico City' },
      { date: '12 Jun', t1: 'Corea del Sur', t2: 'Playoff UEFA D', city: 'Guadalajara' },
      { date: '16 Jun', t1: 'Mexico', t2: 'Corea del Sur', city: 'Mexico City' },
      { date: '16 Jun', t1: 'Sudafrica', t2: 'Playoff UEFA D', city: 'Guadalajara' },
      { date: '20 Jun', t1: 'Sudafrica', t2: 'Corea del Sur', city: 'Monterrey' },
      { date: '20 Jun', t1: 'Playoff UEFA D', t2: 'Mexico', city: 'Mexico City' },
    ]},
    { letter: 'B', venue: 'Canada', teams: [
      { name: 'Canada', flag: '\uD83C\uDDE8\uD83C\uDDE6', tag: 'host' },
      { name: 'Suiza', flag: '\uD83C\uDDE8\uD83C\uDDED' },
      { name: 'Qatar', flag: '\uD83C\uDDF6\uD83C\uDDE6' },
      { name: 'Playoff UEFA A', flag: '\uD83C\uDDEA\uD83C\uDDFA', tag: 'playoff' },
    ], matches: [
      { date: '12 Jun', t1: 'Canada', t2: 'Qatar', city: 'Vancouver' },
      { date: '12 Jun', t1: 'Suiza', t2: 'Playoff UEFA A', city: 'Toronto' },
      { date: '17 Jun', t1: 'Canada', t2: 'Suiza', city: 'Vancouver' },
      { date: '17 Jun', t1: 'Qatar', t2: 'Playoff UEFA A', city: 'Toronto' },
      { date: '21 Jun', t1: 'Qatar', t2: 'Suiza', city: 'Toronto' },
      { date: '21 Jun', t1: 'Playoff UEFA A', t2: 'Canada', city: 'Vancouver' },
    ]},
    { letter: 'C', venue: 'USA West', teams: [
      { name: 'Brasil', flag: '\uD83C\uDDE7\uD83C\uDDF7' },
      { name: 'Marruecos', flag: '\uD83C\uDDF2\uD83C\uDDE6' },
      { name: 'Escocia', flag: '\uD83C\uDFF4\uDB40\uDC67\uDB40\uDC62\uDB40\uDC73\uDB40\uDC63\uDB40\uDC74\uDB40\uDC7F' },
      { name: 'Haiti', flag: '\uD83C\uDDED\uD83C\uDDF9' },
    ], matches: [
      { date: '13 Jun', t1: 'Brasil', t2: 'Marruecos', city: 'Los Angeles' },
      { date: '13 Jun', t1: 'Haiti', t2: 'Escocia', city: 'San Francisco' },
      { date: '17 Jun', t1: 'Brasil', t2: 'Haiti', city: 'Los Angeles' },
      { date: '18 Jun', t1: 'Marruecos', t2: 'Escocia', city: 'San Francisco' },
      { date: '22 Jun', t1: 'Escocia', t2: 'Brasil', city: 'Los Angeles' },
      { date: '22 Jun', t1: 'Marruecos', t2: 'Haiti', city: 'San Francisco' },
    ]},
    { letter: 'D', venue: 'USA East', teams: [
      { name: 'Estados Unidos', flag: '\uD83C\uDDFA\uD83C\uDDF8', tag: 'host' },
      { name: 'Paraguay', flag: '\uD83C\uDDF5\uD83C\uDDFE' },
      { name: 'Australia', flag: '\uD83C\uDDE6\uD83C\uDDFA' },
      { name: 'Playoff UEFA C', flag: '\uD83C\uDDEA\uD83C\uDDFA', tag: 'playoff' },
    ], matches: [
      { date: '12 Jun', t1: 'Estados Unidos', t2: 'Australia', city: 'Philadelphia' },
      { date: '13 Jun', t1: 'Paraguay', t2: 'Playoff UEFA C', city: 'Houston' },
      { date: '17 Jun', t1: 'Estados Unidos', t2: 'Paraguay', city: 'New York/NJ' },
      { date: '17 Jun', t1: 'Australia', t2: 'Playoff UEFA C', city: 'Houston' },
      { date: '21 Jun', t1: 'Australia', t2: 'Paraguay', city: 'Houston' },
      { date: '21 Jun', t1: 'Playoff UEFA C', t2: 'Estados Unidos', city: 'Philadelphia' },
    ]},
    { letter: 'E', venue: 'USA South', teams: [
      { name: 'Alemania', flag: '\uD83C\uDDE9\uD83C\uDDEA' },
      { name: 'Costa de Marfil', flag: '\uD83C\uDDE8\uD83C\uDDEE' },
      { name: 'Ecuador', flag: '\uD83C\uDDEA\uD83C\uDDE8' },
      { name: 'Curazao', flag: '\uD83C\uDDE8\uD83C\uDDFC' },
    ], matches: [
      { date: '13 Jun', t1: 'Alemania', t2: 'Costa de Marfil', city: 'Atlanta' },
      { date: '14 Jun', t1: 'Ecuador', t2: 'Curazao', city: 'Miami' },
      { date: '18 Jun', t1: 'Alemania', t2: 'Ecuador', city: 'Atlanta' },
      { date: '18 Jun', t1: 'Costa de Marfil', t2: 'Curazao', city: 'Miami' },
      { date: '22 Jun', t1: 'Curazao', t2: 'Alemania', city: 'Atlanta' },
      { date: '22 Jun', t1: 'Costa de Marfil', t2: 'Ecuador', city: 'Miami' },
    ]},
    { letter: 'F', venue: 'USA', teams: [
      { name: 'Paises Bajos', flag: '\uD83C\uDDF3\uD83C\uDDF1' },
      { name: 'Japon', flag: '\uD83C\uDDEF\uD83C\uDDF5' },
      { name: 'Tunez', flag: '\uD83C\uDDF9\uD83C\uDDF3' },
      { name: 'Playoff UEFA B', flag: '\uD83C\uDDEA\uD83C\uDDFA', tag: 'playoff' },
    ], matches: [
      { date: '14 Jun', t1: 'Paises Bajos', t2: 'Playoff UEFA B', city: 'Boston' },
      { date: '14 Jun', t1: 'Tunez', t2: 'Japon', city: 'Kansas City' },
      { date: '18 Jun', t1: 'Paises Bajos', t2: 'Tunez', city: 'Boston' },
      { date: '19 Jun', t1: 'Japon', t2: 'Playoff UEFA B', city: 'Kansas City' },
      { date: '23 Jun', t1: 'Japon', t2: 'Paises Bajos', city: 'Kansas City' },
      { date: '23 Jun', t1: 'Playoff UEFA B', t2: 'Tunez', city: 'Boston' },
    ]},
    { letter: 'G', venue: 'USA', teams: [
      { name: 'Belgica', flag: '\uD83C\uDDE7\uD83C\uDDEA' },
      { name: 'Egipto', flag: '\uD83C\uDDEA\uD83C\uDDEC' },
      { name: 'Iran', flag: '\uD83C\uDDEE\uD83C\uDDF7' },
      { name: 'Nueva Zelanda', flag: '\uD83C\uDDF3\uD83C\uDDFF' },
    ], matches: [
      { date: '14 Jun', t1: 'Belgica', t2: 'Egipto', city: 'Dallas' },
      { date: '15 Jun', t1: 'Iran', t2: 'Nueva Zelanda', city: 'Seattle' },
      { date: '19 Jun', t1: 'Belgica', t2: 'Iran', city: 'Dallas' },
      { date: '19 Jun', t1: 'Egipto', t2: 'Nueva Zelanda', city: 'Seattle' },
      { date: '23 Jun', t1: 'Nueva Zelanda', t2: 'Belgica', city: 'Dallas' },
      { date: '23 Jun', t1: 'Egipto', t2: 'Iran', city: 'Seattle' },
    ]},
    { letter: 'H', venue: 'USA East', teams: [
      { name: 'Espana', flag: '\uD83C\uDDEA\uD83C\uDDF8' },
      { name: 'Uruguay', flag: '\uD83C\uDDFA\uD83C\uDDFE' },
      { name: 'Arabia Saudita', flag: '\uD83C\uDDF8\uD83C\uDDE6' },
      { name: 'Cabo Verde', flag: '\uD83C\uDDE8\uD83C\uDDFB' },
    ], matches: [
      { date: '15 Jun', t1: 'Espana', t2: 'Cabo Verde', city: 'New York/NJ' },
      { date: '15 Jun', t1: 'Arabia Saudita', t2: 'Uruguay', city: 'Philadelphia' },
      { date: '19 Jun', t1: 'Espana', t2: 'Arabia Saudita', city: 'New York/NJ' },
      { date: '20 Jun', t1: 'Uruguay', t2: 'Cabo Verde', city: 'Philadelphia' },
      { date: '24 Jun', t1: 'Uruguay', t2: 'Espana', city: 'New York/NJ' },
      { date: '24 Jun', t1: 'Cabo Verde', t2: 'Arabia Saudita', city: 'Philadelphia' },
    ]},
    { letter: 'I', venue: 'USA/Mexico', teams: [
      { name: 'Francia', flag: '\uD83C\uDDEB\uD83C\uDDF7' },
      { name: 'Senegal', flag: '\uD83C\uDDF8\uD83C\uDDF3' },
      { name: 'Noruega', flag: '\uD83C\uDDF3\uD83C\uDDF4' },
      { name: 'Interconf. Playoff 2', flag: '\uD83C\uDDFA\uD83C\uDDF3', tag: 'playoff' },
    ], matches: [
      { date: '15 Jun', t1: 'Francia', t2: 'Noruega', city: 'Los Angeles' },
      { date: '16 Jun', t1: 'Senegal', t2: 'Interconf. Playoff 2', city: 'Monterrey' },
      { date: '20 Jun', t1: 'Francia', t2: 'Senegal', city: 'Los Angeles' },
      { date: '20 Jun', t1: 'Noruega', t2: 'Interconf. Playoff 2', city: 'Monterrey' },
      { date: '24 Jun', t1: 'Interconf. Playoff 2', t2: 'Francia', city: 'Los Angeles' },
      { date: '24 Jun', t1: 'Noruega', t2: 'Senegal', city: 'Monterrey' },
    ]},
    { letter: 'J', venue: 'USA South', teams: [
      { name: 'Argentina', flag: '\uD83C\uDDE6\uD83C\uDDF7' },
      { name: 'Argelia', flag: '\uD83C\uDDE9\uD83C\uDDFF' },
      { name: 'Austria', flag: '\uD83C\uDDE6\uD83C\uDDF9' },
      { name: 'Jordania', flag: '\uD83C\uDDEF\uD83C\uDDF4' },
    ], matches: [
      { date: '16 Jun', t1: 'Argentina', t2: 'Austria', city: 'Miami' },
      { date: '16 Jun', t1: 'Jordania', t2: 'Argelia', city: 'Atlanta' },
      { date: '21 Jun', t1: 'Argentina', t2: 'Jordania', city: 'Miami' },
      { date: '21 Jun', t1: 'Austria', t2: 'Argelia', city: 'Atlanta' },
      { date: '25 Jun', t1: 'Argelia', t2: 'Argentina', city: 'Miami' },
      { date: '25 Jun', t1: 'Austria', t2: 'Jordania', city: 'Atlanta' },
    ]},
    { letter: 'K', venue: 'USA', teams: [
      { name: 'Portugal', flag: '\uD83C\uDDF5\uD83C\uDDF9' },
      { name: 'Colombia', flag: '\uD83C\uDDE8\uD83C\uDDF4' },
      { name: 'Uzbekistan', flag: '\uD83C\uDDFA\uD83C\uDDFF' },
      { name: 'Interconf. Playoff 1', flag: '\uD83C\uDDFA\uD83C\uDDF3', tag: 'playoff' },
    ], matches: [
      { date: '14 Jun', t1: 'Portugal', t2: 'Colombia', city: 'Houston' },
      { date: '15 Jun', t1: 'Uzbekistan', t2: 'Interconf. Playoff 1', city: 'Dallas' },
      { date: '19 Jun', t1: 'Portugal', t2: 'Uzbekistan', city: 'Houston' },
      { date: '19 Jun', t1: 'Colombia', t2: 'Interconf. Playoff 1', city: 'Dallas' },
      { date: '23 Jun', t1: 'Interconf. Playoff 1', t2: 'Portugal', city: 'Houston' },
      { date: '23 Jun', t1: 'Colombia', t2: 'Uzbekistan', city: 'Dallas' },
    ]},
    { letter: 'L', venue: 'USA', teams: [
      { name: 'Inglaterra', flag: '\uD83C\uDFF4\uDB40\uDC67\uDB40\uDC62\uDB40\uDC65\uDB40\uDC6E\uDB40\uDC67\uDB40\uDC7F' },
      { name: 'Croacia', flag: '\uD83C\uDDED\uD83C\uDDF7' },
      { name: 'Ghana', flag: '\uD83C\uDDEC\uD83C\uDDED' },
      { name: 'Panama', flag: '\uD83C\uDDF5\uD83C\uDDE6' },
    ], matches: [
      { date: '15 Jun', t1: 'Inglaterra', t2: 'Croacia', city: 'Boston' },
      { date: '16 Jun', t1: 'Ghana', t2: 'Panama', city: 'Seattle' },
      { date: '20 Jun', t1: 'Inglaterra', t2: 'Ghana', city: 'Boston' },
      { date: '20 Jun', t1: 'Croacia', t2: 'Panama', city: 'Seattle' },
      { date: '24 Jun', t1: 'Panama', t2: 'Inglaterra', city: 'Boston' },
      { date: '24 Jun', t1: 'Croacia', t2: 'Ghana', city: 'Seattle' },
    ]},
  ];

  const KNOCKOUT_ROUNDS = [
    { name: 'Octavos de Final', dates: '28 Jun - 2 Jul', matches: 16 },
    { name: 'Cuartos de Final', dates: '4 - 5 Jul', matches: 8 },
    { name: 'Semifinales', dates: '8 - 9 Jul', matches: 4 },
    { name: 'Tercer Puesto', dates: '18 Jul', matches: 1 },
    { name: 'Final', dates: '19 Jul', venue: 'MetLife Stadium, New York/NJ', matches: 1 },
  ];

  const groupsEl = document.getElementById('mundial-groups');
  const bracketEl = document.getElementById('mundial-bracket');

  // Render groups
  let groupsHTML = '<div class="mundial-groups-grid">';
  for (const group of MUNDIAL_GROUPS) {
    groupsHTML += `<div class="mundial-group-card">
      <div class="mundial-group-header">
        <span class="mundial-group-letter">${group.letter}</span>
        Grupo ${group.letter}
        <span class="mundial-group-venue">${group.venue}</span>
      </div>
      <div class="mundial-stats-header">
        <span class="mundial-team-pos"></span>
        <span class="mundial-team-flag"></span>
        <span class="mundial-team-name">Equipo</span>
        <span class="mundial-team-stats">
          <span class="mundial-team-stat">PJ</span>
          <span class="mundial-team-stat">G</span>
          <span class="mundial-team-stat">E</span>
          <span class="mundial-team-stat">P</span>
          <span class="mundial-team-stat">Pts</span>
        </span>
      </div>`;
    group.teams.forEach((team, i) => {
      const tagHTML = team.tag === 'host'
        ? '<span class="mundial-team-tag host">Sede</span>'
        : team.tag === 'playoff'
        ? '<span class="mundial-team-tag playoff">Playoff</span>'
        : '';
      groupsHTML += `<div class="mundial-team-row">
        <span class="mundial-team-pos">${i + 1}</span>
        <span class="mundial-team-flag">${team.flag}</span>
        <span class="mundial-team-name">${team.name}</span>
        ${tagHTML}
        <span class="mundial-team-stats">
          <span class="mundial-team-stat">0</span>
          <span class="mundial-team-stat">0</span>
          <span class="mundial-team-stat">0</span>
          <span class="mundial-team-stat">0</span>
          <span class="mundial-team-stat">0</span>
        </span>
      </div>`;
    });
    // Matches
    groupsHTML += '<div class="mundial-group-matches">';
    groupsHTML += '<div class="mundial-group-matches-title">Partidos</div>';
    for (const m of group.matches) {
      groupsHTML += `<div class="mundial-group-match">
        <span class="mundial-group-match-date">${m.date}</span>
        <span>${m.t1}</span>
        <span class="mundial-group-match-vs">vs</span>
        <span>${m.t2}</span>
        <span class="mundial-group-venue">${m.city}</span>
      </div>`;
    }
    groupsHTML += '</div></div>';
  }
  groupsHTML += '</div>';
  groupsEl.innerHTML = groupsHTML;

  // Render bracket placeholder
  let bracketHTML = '<div class="mundial-bracket-container">';
  for (const round of KNOCKOUT_ROUNDS) {
    bracketHTML += `<div class="mundial-bracket-round">
      <div class="mundial-bracket-round-title">${round.name} <span style="font-weight:400;color:var(--text-tertiary);font-size:0.75rem;margin-left:8px">${round.dates}${round.venue ? ' — ' + round.venue : ''}</span></div>
      <div class="mundial-bracket-matches">`;
    for (let i = 0; i < round.matches; i++) {
      const label = round.name === 'Octavos de Final'
        ? `Partido ${i + 1}`
        : round.name === 'Cuartos de Final'
        ? `QF${i + 1}`
        : round.name === 'Semifinales'
        ? `SF${i + 1}`
        : round.name;
      bracketHTML += `<div class="mundial-match-card">
        <div class="mundial-match-header">
          <span>${label}</span>
          <span>${round.dates}</span>
        </div>
        <div class="mundial-match-teams">
          <div class="mundial-match-team">
            <span style="color:var(--text-tertiary);font-size:0.8rem">Por definir</span>
            <span class="mundial-match-score">-</span>
          </div>
          <div class="mundial-match-team">
            <span style="color:var(--text-tertiary);font-size:0.8rem">Por definir</span>
            <span class="mundial-match-score">-</span>
          </div>
        </div>
      </div>`;
    }
    bracketHTML += '</div></div>';
  }
  bracketHTML += '</div>';
  bracketEl.innerHTML = bracketHTML;

  // Phase toggle
  const toggleBtns = document.querySelectorAll('.mundial-phase-btn');
  toggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      toggleBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const phase = btn.dataset.phase;
      document.getElementById('mundial-groups').style.display = phase === 'groups' ? '' : 'none';
      document.getElementById('mundial-bracket').style.display = phase === 'bracket' ? '' : 'none';
    });
  });

  // Fetch live data from football-data.org via serverless function
  fetchMundialLiveData(MUNDIAL_GROUPS);
}

async function fetchMundialLiveData(groups) {
  try {
    const resp = await fetch('/api/mundial');
    if (!resp.ok) return;
    const data = await resp.json();

    // Map team names from API to our local names
    const NAME_MAP = {
      'Mexico': 'Mexico', 'Korea Republic': 'Corea del Sur', 'South Africa': 'Sudafrica',
      'Canada': 'Canada', 'Switzerland': 'Suiza', 'Qatar': 'Qatar',
      'Brazil': 'Brasil', 'Morocco': 'Marruecos', 'Scotland': 'Escocia', 'Haiti': 'Haiti',
      'United States': 'Estados Unidos', 'Paraguay': 'Paraguay', 'Australia': 'Australia',
      'Germany': 'Alemania', 'Ivory Coast': 'Costa de Marfil', "Côte d'Ivoire": 'Costa de Marfil',
      'Ecuador': 'Ecuador', 'Curaçao': 'Curazao', 'Curacao': 'Curazao',
      'Netherlands': 'Paises Bajos', 'Japan': 'Japon', 'Tunisia': 'Tunez',
      'Belgium': 'Belgica', 'Egypt': 'Egipto', 'Iran': 'Iran', 'New Zealand': 'Nueva Zelanda',
      'Spain': 'Espana', 'Uruguay': 'Uruguay', 'Saudi Arabia': 'Arabia Saudita', 'Cape Verde': 'Cabo Verde',
      'France': 'Francia', 'Senegal': 'Senegal', 'Norway': 'Noruega',
      'Argentina': 'Argentina', 'Algeria': 'Argelia', 'Austria': 'Austria', 'Jordan': 'Jordania',
      'Portugal': 'Portugal', 'Colombia': 'Colombia', 'Uzbekistan': 'Uzbekistan',
      'England': 'Inglaterra', 'Croatia': 'Croacia', 'Ghana': 'Ghana', 'Panama': 'Panama',
    };

    // Update standings if available
    if (data.standings?.standings) {
      updateMundialStandings(data.standings.standings, NAME_MAP, groups);
    }

    // Update match results if available
    if (data.matches?.matches) {
      updateMundialMatches(data.matches.matches, NAME_MAP, groups);
    }
  } catch (e) {
    console.log('Mundial live data not available:', e.message);
  }
}

function updateMundialStandings(apiStandings, nameMap, groups) {
  // apiStandings is an array of group standings
  for (const groupStanding of apiStandings) {
    const stage = groupStanding.stage;
    const groupName = groupStanding.group; // e.g. "GROUP_A"
    if (!groupName) continue;
    const letter = groupName.replace('GROUP_', '');
    const table = groupStanding.table;
    if (!table || !table.length) continue;

    // Find the group card by letter
    const groupCards = document.querySelectorAll('.mundial-group-card');
    for (const card of groupCards) {
      const headerLetter = card.querySelector('.mundial-group-letter');
      if (!headerLetter || headerLetter.textContent !== letter) continue;

      const rows = card.querySelectorAll('.mundial-team-row');
      // Sort teams by API table order and update
      for (let i = 0; i < table.length && i < rows.length; i++) {
        const apiTeam = table[i];
        const row = rows[i];
        const localName = nameMap[apiTeam.team?.name] || apiTeam.team?.shortName || apiTeam.team?.name;
        const nameEl = row.querySelector('.mundial-team-name');
        const stats = row.querySelectorAll('.mundial-team-stat');
        const posEl = row.querySelector('.mundial-team-pos');

        if (nameEl && localName) nameEl.textContent = localName;
        if (posEl) posEl.textContent = i + 1;
        if (stats.length >= 5) {
          stats[0].textContent = apiTeam.playedGames ?? 0;
          stats[1].textContent = apiTeam.won ?? 0;
          stats[2].textContent = apiTeam.draw ?? 0;
          stats[3].textContent = apiTeam.lost ?? 0;
          stats[4].textContent = apiTeam.points ?? 0;
        }

        // Highlight qualified teams (top 2 advance)
        if (i < 2 && apiTeam.playedGames > 0) {
          row.classList.add('mundial-qualified');
        } else {
          row.classList.remove('mundial-qualified');
        }
      }
      break;
    }
  }
}

function updateMundialMatches(apiMatches, nameMap, groups) {
  // Update group stage match scores
  const groupMatches = apiMatches.filter(m => m.stage === 'GROUP_STAGE');
  const knockoutMatches = apiMatches.filter(m => m.stage !== 'GROUP_STAGE');

  // Update group match scores in the match list
  for (const match of groupMatches) {
    if (match.status === 'SCHEDULED' || match.status === 'TIMED') continue;
    const homeTeam = nameMap[match.homeTeam?.name] || match.homeTeam?.shortName || '';
    const awayTeam = nameMap[match.awayTeam?.name] || match.awayTeam?.shortName || '';
    const homeScore = match.score?.fullTime?.home;
    const awayScore = match.score?.fullTime?.away;
    if (homeScore == null || awayScore == null) continue;

    // Find the match row in the DOM
    const matchRows = document.querySelectorAll('.mundial-group-match');
    for (const row of matchRows) {
      const spans = row.querySelectorAll('span');
      const t1 = spans[1]?.textContent?.trim();
      const t2 = spans[3]?.textContent?.trim();
      if ((t1 === homeTeam && t2 === awayTeam) || (t1 === awayTeam && t2 === homeTeam)) {
        const vsEl = row.querySelector('.mundial-group-match-vs');
        if (vsEl) {
          if (t1 === homeTeam) {
            vsEl.textContent = `${homeScore} - ${awayScore}`;
          } else {
            vsEl.textContent = `${awayScore} - ${homeScore}`;
          }
          vsEl.style.fontWeight = '600';
          vsEl.style.fontFamily = 'var(--font-mono)';
          vsEl.style.color = 'var(--text)';
        }
        break;
      }
    }
  }

  // Update knockout bracket
  if (knockoutMatches.length > 0) {
    updateMundialBracket(knockoutMatches, nameMap);
  }
}

function updateMundialBracket(matches, nameMap) {
  const ROUND_MAP = {
    'LAST_32': 'Octavos de Final',
    'ROUND_OF_16': 'Octavos de Final',
    'LAST_16': 'Octavos de Final',
    'QUARTER_FINALS': 'Cuartos de Final',
    'SEMI_FINALS': 'Semifinales',
    'THIRD_PLACE': 'Tercer Puesto',
    'FINAL': 'Final',
  };

  const bracketEl = document.getElementById('mundial-bracket');
  const roundDivs = bracketEl.querySelectorAll('.mundial-bracket-round');

  for (const match of matches) {
    const roundName = ROUND_MAP[match.stage] || ROUND_MAP[match.group];
    if (!roundName) continue;
    const homeTeam = nameMap[match.homeTeam?.name] || match.homeTeam?.shortName || match.homeTeam?.name;
    const awayTeam = nameMap[match.awayTeam?.name] || match.awayTeam?.shortName || match.awayTeam?.name;
    const homeScore = match.score?.fullTime?.home;
    const awayScore = match.score?.fullTime?.away;

    // Find the right round
    for (const roundDiv of roundDivs) {
      const titleEl = roundDiv.querySelector('.mundial-bracket-round-title');
      if (!titleEl || !titleEl.textContent.includes(roundName)) continue;

      // Find an empty match card or matching card
      const cards = roundDiv.querySelectorAll('.mundial-match-card');
      for (const card of cards) {
        const teamEls = card.querySelectorAll('.mundial-match-team');
        if (teamEls.length < 2) continue;
        const t1Text = teamEls[0].querySelector('span')?.textContent;
        const t2Text = teamEls[1].querySelector('span')?.textContent;

        // Fill empty slots
        if (t1Text === 'Por definir' || t1Text === homeTeam) {
          if (homeTeam && homeTeam !== 'null') {
            teamEls[0].innerHTML = `<span>${homeTeam}</span><span class="mundial-match-score">${homeScore != null ? homeScore : '-'}</span>`;
          }
          if (awayTeam && awayTeam !== 'null') {
            teamEls[1].innerHTML = `<span>${awayTeam}</span><span class="mundial-match-score">${awayScore != null ? awayScore : '-'}</span>`;
          }
          // Highlight winner
          if (homeScore != null && awayScore != null) {
            if (homeScore > awayScore) {
              teamEls[0].classList.add('winner');
              teamEls[1].classList.add('loser');
            } else if (awayScore > homeScore) {
              teamEls[1].classList.add('winner');
              teamEls[0].classList.add('loser');
            }
          }
          break;
        }
      }
      break;
    }
  }
}

// ─── Financial Term Tooltips ───
const FINANCIAL_GLOSSARY = {
  'TNA': 'Tasa Nominal Anual — el porcentaje que te pagan en un año, sin contar interés compuesto',
  'TEA': 'Tasa Efectiva Anual — lo que realmente ganás en un año si reinvertís los intereses',
  'TIR': 'Tasa Interna de Retorno — el rendimiento total si mantenés el bono hasta el vencimiento',
  'TIR REAL': 'Tasa Interna de Retorno Real — rendimiento descontando inflación, si mantenés el bono hasta el vencimiento',
  'VN': 'Valor Nominal — el valor de referencia del bono (generalmente 100). Los precios se expresan por cada 100 VN',
  'CER': 'Coeficiente de Estabilización de Referencia — índice que ajusta por inflación. Si la inflación sube, tu bono paga más',
  'CCL': 'Contado Con Liquidación — tipo de cambio que se obtiene comprando un activo en pesos y vendiéndolo en dólares en el exterior',
  'MEP': 'Dólar MEP — tipo de cambio comprando y vendiendo bonos en pesos y dólares dentro de Argentina',
  'Duration': 'Duración — mide cuánto cambia el precio de un bono si las tasas suben o bajan. Mayor duración = más sensibilidad',
  'DURATION': 'Duración — mide cuánto cambia el precio de un bono si las tasas suben o bajan. Mayor duración = más sensibilidad',
  'LECAP': 'Letra Capitalizable — instrumento del Tesoro que paga todo al vencimiento (capital + intereses juntos)',
  'FCI': 'Fondo Común de Inversión — junta plata de muchos inversores y la invierte en distintos activos',
  'ON': 'Obligación Negociable — bono emitido por una empresa privada, no el gobierno',
  'BADLAR': 'Tasa de plazos fijos mayores a $1M en bancos privados. Se usa como referencia para muchos productos',
};

const TOOLTIP_SELECTORS = 'th, .rate-label, .calc-hint, p';

// Shared floating tooltip element
let _tooltipEl = null;
let _tooltipHideTimer = null;
let _activeTooltipTerm = null;
const _isTouch = 'ontouchstart' in window;

function getTooltipEl() {
  if (!_tooltipEl) {
    _tooltipEl = document.createElement('div');
    _tooltipEl.className = 'fin-tooltip';
    _tooltipEl.innerHTML = '<span class="fin-tooltip-arrow"></span><span class="fin-tooltip-text"></span>';
    document.body.appendChild(_tooltipEl);
  }
  return _tooltipEl;
}

function positionTooltip(termEl) {
  const tip = getTooltipEl();
  const rect = termEl.getBoundingClientRect();
  const arrow = tip.querySelector('.fin-tooltip-arrow');

  // Measure from top-left to get dimensions
  tip.style.left = '0';
  tip.style.top = '0';
  const tipRect = tip.getBoundingClientRect();

  // Default: above the term
  let top = rect.top - tipRect.height - 8;
  let arrowClass = 'arrow-down';

  // Flip below if not enough space above
  if (top < 4) {
    top = rect.bottom + 8;
    arrowClass = 'arrow-up';
  }

  let left = rect.left + rect.width / 2 - tipRect.width / 2;
  // Clamp to viewport edges
  left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));

  tip.style.top = top + 'px';
  tip.style.left = left + 'px';
  arrow.className = 'fin-tooltip-arrow ' + arrowClass;

  // Point arrow at the term center
  const arrowLeft = rect.left + rect.width / 2 - left;
  arrow.style.left = Math.max(10, Math.min(arrowLeft, tipRect.width - 10)) + 'px';
  arrow.style.transform = '';
}

function showTooltip(termEl) {
  clearTimeout(_tooltipHideTimer);
  const tip = getTooltipEl();
  const text = termEl.getAttribute('data-tooltip');
  if (!text) return;
  tip.querySelector('.fin-tooltip-text').textContent = text;
  tip.classList.add('visible');
  _activeTooltipTerm = termEl;
  positionTooltip(termEl);
}

function hideTooltip() {
  clearTimeout(_tooltipHideTimer);
  if (_tooltipEl) _tooltipEl.classList.remove('visible');
  _activeTooltipTerm = null;
}

function initTooltips(root) {
  const container = root || document.body;
  const elements = container.querySelectorAll(TOOLTIP_SELECTORS);

  elements.forEach(el => {
    if (el.querySelector('.fin-term')) return;

    const terms = Object.keys(FINANCIAL_GLOSSARY).sort((a, b) => b.length - a.length);
    const pattern = new RegExp('\\b(' + terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b', 'g');

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement.closest('.fin-term')) continue;
      if (pattern.test(node.textContent)) {
        textNodes.push(node);
      }
      pattern.lastIndex = 0;
    }

    textNodes.forEach(textNode => {
      const text = textNode.textContent;
      pattern.lastIndex = 0;
      const parts = [];
      let lastIdx = 0;
      let match;

      while ((match = pattern.exec(text)) !== null) {
        if (match.index > lastIdx) {
          parts.push(document.createTextNode(text.slice(lastIdx, match.index)));
        }
        const term = match[0];
        const span = document.createElement('span');
        span.className = 'fin-term';
        span.setAttribute('data-tooltip', FINANCIAL_GLOSSARY[term] || FINANCIAL_GLOSSARY[term.toUpperCase()] || '');
        span.textContent = term;
        parts.push(span);
        lastIdx = pattern.lastIndex;
      }

      if (parts.length > 0) {
        if (lastIdx < text.length) {
          parts.push(document.createTextNode(text.slice(lastIdx)));
        }
        const frag = document.createDocumentFragment();
        parts.forEach(p => frag.appendChild(p));
        textNode.parentNode.replaceChild(frag, textNode);
      }
    });
  });

  container.querySelectorAll('.fin-term').forEach(term => {
    if (term._tooltipBound) return;
    term._tooltipBound = true;

    if (_isTouch) {
      // Mobile: tap to toggle, tap again or elsewhere to dismiss
      term.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (_activeTooltipTerm === term) {
          hideTooltip();
        } else {
          showTooltip(term);
        }
      });
    } else {
      // Desktop: hover to show/hide
      term.addEventListener('mouseenter', () => showTooltip(term));
      term.addEventListener('mouseleave', () => hideTooltip());
    }
  });
}

// Dismiss tooltip when tapping/clicking elsewhere
document.addEventListener('click', () => {
  if (_activeTooltipTerm) hideTooltip();
});
