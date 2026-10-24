/* =========================================================
   Cloudflare Worker «Протектор»: расписание постов, запись, заявки в Telegram.

   GET  /slots?brand=kia&model=rio&works=to,pads_f   -> свободное время приезда на 14 дней
   POST /  { type: 'booking', ... }                   -> запись (D1) + сообщение приёмщику в Telegram
   POST /  { type: 'callback', ... }                  -> «перезвоните мне» в Telegram

   Секреты (в коде их нет):  npx wrangler secret put BOT_TOKEN
                             npx wrangler secret put CHAT_ID
   База:                     env.DB (см. wrangler.toml, schema.sql)
   Справочник цен и логика расписания — общий файл с сайтом: ../js/catalog.js
   ========================================================= */
import P from '../js/catalog.js';

// Откуда разрешено обращаться к функции (CORS)
const ALLOWED_ORIGINS = [
  'https://p4yla.github.io',
  'http://localhost:8765',
  'http://127.0.0.1:5500' // Live Server в VS Code
];

const SERVICE_PHONE = '+7 (495) 790-43-12';

/* ---------- Форматирование для сообщений ---------- */
const pad = (n) => String(n).padStart(2, '0');
const rub = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽';
const range = (a, b) => (a === b ? rub(a) : rub(a).replace(' ₽', '') + '–' + rub(b));
function fmtDur(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return h ? h + ' ч' + (m ? ' ' + m + ' мин' : '') : m + ' мин';
}
function fmtDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('ru-RU', { timeZone: 'UTC', day: 'numeric', month: 'long', weekday: 'short' });
}
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const clip = (s, n) => String(s ?? '').trim().slice(0, n);

// Госномер: кириллица из 12 «автомобильных» букв, латиница-двойник переводится в кириллицу
const LAT_TO_CYR = { A: 'А', B: 'В', E: 'Е', K: 'К', M: 'М', H: 'Н', O: 'О', P: 'Р', C: 'С', T: 'Т', Y: 'У', X: 'Х' };
function normPlate(s) {
  const v = String(s || '').toUpperCase().replace(/[A-Z]/g, (c) => LAT_TO_CYR[c] || c).replace(/[\s-]/g, '');
  return /^[АВЕКМНОРСТУХ]\d{3}[АВЕКМНОРСТУХ]{2}\d{2,3}$/.test(v) ? v : '';
}

/* ---------- HTTP-утилиты ---------- */
function cors(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };
}
function json(data, status, origin, extra) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(origin), ...(extra || {}) }
  });
}

// Не больше 5 заявок с одного IP за 10 минут (память у каждого экземпляра своя — защита «примерная»)
const hits = new Map();
function tooMany(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  list.push(now);
  hits.set(ip, list);
  return list.length > 5;
}

async function telegram(env, text) {
  const r = await fetch('https://api.telegram.org/bot' + env.BOT_TOKEN + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: env.CHAT_ID, text, parse_mode: 'HTML', disable_web_page_preview: true })
  });
  return r.ok;
}
const phoneLink = (phone) => '<a href="tel:' + phone.replace(/[^\d+]/g, '') + '">' + esc(phone) + '</a>';

/* ---------- Расписание из базы ---------- */
async function loadContext(env, now) {
  const { days, nowMin } = P.nextDays(now);
  const { results } = await env.DB.prepare(
    "SELECT post_id, date, start_min, dur FROM bookings WHERE date BETWEEN ?1 AND ?2 AND status != 'cancelled'"
  ).bind(days[0], days[days.length - 1]).all();
  return { days, nowMin, bookings: results };
}

/* ---------- GET /slots ---------- */
async function handleSlots(url, env, origin, now) {
  const est = P.estimate(url.searchParams.get('brand'), url.searchParams.get('model'), url.searchParams.get('works'), 'our');
  if (!est) return json({ ok: false, error: 'Неизвестная машина' }, 400, origin);
  if (!est.lines.length) return json({ ok: false, error: 'Не выбраны работы' }, 400, origin);
  const ctx = await loadContext(env, now);
  // Без кэша: после чужой записи браузер должен сразу увидеть свежее расписание
  return json({ ok: true, dur: est.dur, days: P.freeSlots(est.dur, ctx) }, 200, origin, { 'Cache-Control': 'no-store' });
}

/* ---------- POST: запись ---------- */
async function handleBooking(d, env, origin, now) {
  // Цену и длительность считаем сами по кодам машины и работ: сумме из браузера не доверяем
  const est = P.estimate(String(d.brand || ''), String(d.model || ''), d.works, d.parts === 'own' ? 'own' : 'our');
  if (!est) return json({ ok: false, error: 'Неизвестная машина' }, 422, origin);
  if (!est.lines.length) return json({ ok: false, error: 'Не выбраны работы' }, 422, origin);

  const ctx = await loadContext(env, now);
  const date = String(d.date || '');
  const start = P.parseTime(d.time);
  const pl = ctx.days.includes(date) ? P.plan(date, est.dur) : null;
  if (!pl || !pl.starts.includes(start)) return json({ ok: false, error: 'Некорректные дата или время' }, 422, origin);

  const name = clip(d.name, 60), phone = clip(d.phone, 20), comment = clip(d.comment, 500);
  const plate = normPlate(d.plate);
  const works = est.lines.map((l) => l.id).join(',');

  // Пробуем посты по очереди. INSERT ... WHERE NOT EXISTS — одна атомарная операция:
  // если кто-то успел занять этот пост секундой раньше, вставка не произойдёт.
  for (const post of P.POSTS) {
    if (!P.postFree(post.id, date, start, pl.occupy, ctx)) continue;
    const res = await env.DB.prepare(
      `INSERT INTO bookings (post_id, date, start_min, dur, brand, model, car_class, works, parts,
                             est_min, est_max, name, phone, plate, comment)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15
       WHERE NOT EXISTS (
         SELECT 1 FROM bookings
         WHERE post_id = ?1 AND date = ?2 AND status != 'cancelled'
           AND start_min < ?3 + ?4 AND start_min + dur > ?3
       )`
    ).bind(post.id, date, start, pl.occupy, String(d.brand), String(d.model), est.cls, works, est.parts,
      est.totalMin, est.totalMax, name, phone, plate, comment).run();
    if (res.meta.changes !== 1) continue;

    const id = res.meta.last_row_id;
    const lines = [
      '🔧 <b>Новая запись #' + id + '</b>',
      '',
      '<b>' + esc(est.car.title) + '</b> · ' + P.CLASSES[est.cls].short + (plate ? ' · ' + plate : ''),
      ...est.lines.map((l) => '• ' + esc(l.name)),
      'Запчасти: ' + (est.parts === 'own' ? 'привезёт свои' : 'наши'),
      'Оценка: <b>' + range(est.totalMin, est.totalMax) + '</b> (работа ' + range(est.laborMin, est.laborMax) + ')',
      '',
      esc(fmtDay(date)) + ', приезд ' + P.timeStr(start) + ' · ' + post.name,
      pl.long ? 'Работ на ' + fmtDur(est.dur) + ' — машина остаётся до следующего дня' : 'Займёт до ' + fmtDur(est.dur),
      '',
      esc(name) + ', ' + phoneLink(phone)
    ];
    if (comment) lines.push('', '💬 ' + esc(comment));
    // Запись уже в базе. Если Telegram не ответил — не пугаем клиента ошибкой.
    // notified — дошло ли сообщение до Telegram (видно в ответе, удобно для проверки)
    const notified = env.BOT_TOKEN ? await telegram(env, lines.join('\n')).catch(() => false) : false;

    return json({
      ok: true, id, post: post.name, long: pl.long, dur: est.dur, notified,
      estimate: { min: est.totalMin, max: est.totalMax, laborMin: est.laborMin, laborMax: est.laborMax }
    }, 200, origin);
  }
  return json({ ok: false, error: 'taken' }, 409, origin);
}

/* ---------- POST: «перезвоните мне» ---------- */
async function handleCallback(d, env, origin) {
  const text = [
    '📞 <b>Перезвонить</b>',
    '',
    esc(clip(d.name, 60)) + ', ' + phoneLink(clip(d.phone, 20)),
    clip(d.topic, 500) ? '💬 ' + esc(clip(d.topic, 500)) : ''
  ].filter(Boolean).join('\n');
  if (!(await telegram(env, text))) return json({ ok: false, error: 'Telegram error' }, 502, origin);
  return json({ ok: true }, 200, origin);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });

    try {
      if (request.method === 'GET' && url.pathname === '/slots') return await handleSlots(url, env, origin);
      if (request.method !== 'POST') return json({ ok: false, error: 'Not found' }, 404, origin);
      if (!ALLOWED_ORIGINS.includes(origin)) return json({ ok: false, error: 'Forbidden' }, 403, origin);

      let d;
      try { d = await request.json(); } catch { return json({ ok: false, error: 'Bad JSON' }, 400, origin); }

      // Поле-ловушка: человек его не видит, а спам-бот заполнит
      if (d.website) return json({ ok: true }, 200, origin);

      // Та же проверка, что на сайте: сервер не доверяет браузеру
      const digits = String(d.phone || '').replace(/\D/g, '');
      if (clip(d.name, 60).length < 2 || digits.length !== 11 || d.consent !== true) {
        return json({ ok: false, error: 'Проверьте имя, телефон и согласие' }, 422, origin);
      }
      if (tooMany(request.headers.get('CF-Connecting-IP') || 'unknown')) {
        return json({ ok: false, error: 'Слишком много заявок, позвоните: ' + SERVICE_PHONE }, 429, origin);
      }

      if (d.type === 'booking') return await handleBooking(d, env, origin);
      if (d.type === 'callback') return await handleCallback(d, env, origin);
      return json({ ok: false, error: 'Unknown type' }, 400, origin);
    } catch (err) {
      console.error(err);
      return json({ ok: false, error: 'Server error' }, 500, origin);
    }
  }
};
