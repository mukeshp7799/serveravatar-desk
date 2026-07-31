// Server-side i18n: language detection + t() helper.
//
// Usage:
//   const { langMiddleware, t, translateNotification, getLang } = require('./i18n');
//   app.use(langMiddleware);                            // attaches req.lang
//   res.json({ error: t(req.lang, 'errors.taskNotFound') });
//
// Language resolution priority:
//   1. ?lang= query param (highest — explicit override)
//   2. Accept-Language header (e.g. "hi-IN,hi;q=0.9,en;q=0.8")
//   3. Default to "en"
//
// The frontend api.ts automatically appends ?lang=<i18n.language> to every request.

const { translations, SUPPORTED_LANGS } = require('./translations');

function normalizeLang(raw) {
  if (!raw) return null;
  const code = raw.toLowerCase().split('-')[0].trim();
  return SUPPORTED_LANGS.includes(code) ? code : null;
}

function detectLang(req) {
  // 1. ?lang= query (explicit override)
  const queryLang = normalizeLang(req.query?.lang);
  if (queryLang) return queryLang;
  // 2. Accept-Language header
  const accept = req.headers['accept-language'];
  if (accept) {
    // Parse "hi-IN,hi;q=0.9,en;q=0.8" — try each in order
    const parts = accept.split(',').map(p => p.trim());
    for (const part of parts) {
      const [tag] = part.split(';');
      const code = normalizeLang(tag);
      if (code) return code;
    }
  }
  // 3. Default
  return 'en';
}

function langMiddleware(req, res, next) {
  req.lang = detectLang(req);
  next();
}

function getLang(req) {
  return req.lang || 'en';
}

// t(lang, 'errors.taskNotFound') → translated string
// t(lang, 'notifications.taskAssigned.title', { projectName: 'X' }) → with interpolation
// Falls back to English if the key is missing in the requested language,
// then to the raw key if it's missing in English too (so you spot gaps).
function t(lang, key, params = {}) {
  const langMap = translations[lang] || translations.en;
  const enMap = translations.en;

  // Look up by dot-notation key
  const lookup = (map) => {
    const parts = key.split('.');
    let cur = map;
    for (const p of parts) {
      if (cur && typeof cur === 'object' && p in cur) cur = cur[p];
      else return undefined;
    }
    return typeof cur === 'string' ? cur : undefined;
  };

  let value = lookup(langMap);
  if (value === undefined) value = lookup(enMap);
  if (value === undefined) return key; // last-resort: return the key itself

  // Interpolate {paramName}
  return value.replace(/\{(\w+)\}/g, (_, name) =>
    params[name] !== undefined ? String(params[name]) : `{${name}}`
  );
}

// Translate a notification row from DB into the user's language.
// New rows store `title_key` (e.g. "notifications.taskAssigned.title") and
// `params` (JSON string with template variables). Old rows have plain English
// in `title` — for those we fall back to the stored text as-is (acceptable for
// legacy notifications; the user only sees them in English).
function translateNotification(notif, lang) {
  if (!notif) return notif;
  // New-format row: has title_key
  if (notif.title_key) {
    // params may be a JSON string (from raw query) or already-parsed object (from MySQL JSON column)
    let params = {};
    if (notif.params) {
      if (typeof notif.params === 'string') {
        try { params = JSON.parse(notif.params); } catch { params = {}; }
      } else if (typeof notif.params === 'object') {
        params = notif.params;
      }
    }
    const titleKey = `${notif.title_key}.title`;
    const msgKey = `${notif.title_key}.message`;
    return {
      ...notif,
      title: t(lang, titleKey, params),
      message: t(lang, msgKey, params),
      // Keep originals for debugging
      _titleKey: notif.title_key,
      _params: params,
    };
  }
  // Legacy row: return as-is (stored English text)
  return notif;
}

function translateNotifications(notifs, lang) {
  if (!Array.isArray(notifs)) return notifs;
  return notifs.map(n => translateNotification(n, lang));
}

module.exports = {
  langMiddleware,
  detectLang,
  normalizeLang,
  t,
  translateNotification,
  translateNotifications,
  getLang,
  SUPPORTED_LANGS,
};