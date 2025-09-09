// Lightweight i18n loader and DOM applier
(function () {
  const CACHE = new Map();
  let current = 'en';
  let dict = {};
  const fallback = 'en';

  async function loadLocale(locale) {
    if (CACHE.has(locale)) return CACHE.get(locale);
    try {
      const res = await fetch(`./i18n/${locale}.json`, {cache: 'no-cache'});
      if (!res.ok) throw new Error(`Failed to load locale ${locale}`);
      const data = await res.json();
      CACHE.set(locale, data);
      return data;
    } catch (e) {
      if (locale !== fallback) {
        return loadLocale(fallback);
      }
      return {};
    }
  }

  function t(key) {
    // nested key path support: a.b.c
    const val = key.split('.').reduce((acc, k) => (acc && acc[k] != null ? acc[k] : undefined), dict);
    if (val != null) return val;
    if (current !== fallback) {
      const fb = CACHE.get(fallback);
      if (fb) {
        const fbVal = key.split('.').reduce((acc, k) => (acc && acc[k] != null ? acc[k] : undefined), fb);
        if (fbVal != null) return fbVal;
      }
    }
    return key; // show key as last resort
  }

  function applyTranslations(root = document) {
    root.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
    });
    root.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria-label')));
    });
    root.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
    });
    const titleEl = document.querySelector('title[data-i18n]');
    if (titleEl) titleEl.textContent = t(titleEl.getAttribute('data-i18n'));
  }

  async function setLocale(locale) {
    current = locale;
    dict = await loadLocale(locale);
    document.documentElement.lang = locale;
    applyTranslations(document);
    try { localStorage.setItem('app.locale', locale); } catch {}
    const live = document.getElementById('ariaStatus');
    if (live) live.textContent = t('status.languageChanged');
  }

  async function init() {
    let locale = 'en';
    try {
      locale = localStorage.getItem('app.locale') || '';
    } catch {}
    if (!locale) {
      const nav = navigator.language || navigator.userLanguage || 'en';
      const short = nav.split('-')[0].toLowerCase();
      if (['en','es','it'].includes(short)) locale = short; else locale = 'en';
    }
    await setLocale(locale);
    const sel = document.getElementById('langSelect');
    if (sel) {
      sel.value = locale;
      sel.addEventListener('change', () => setLocale(sel.value));
    }
  }

  // Expose a manual apply helper so dynamic UIs can request re-translation
  window.I18n = { init, setLocale, t, apply: (root) => applyTranslations(root || document) };
})();
