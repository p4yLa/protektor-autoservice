/* =========================================================
   Автосервис «Протектор» — справочник цен и расписания.

   ОДИН файл для сайта и для сервера:
   - на сайте подключается обычным <script> и создаёт window.PROTEKTOR;
   - Cloudflare Worker импортирует его (import P from '../js/catalog.js')
     и пересчитывает цену и свободное время сам, не доверяя браузеру.

   Как править цены — см. README, раздел «Справочник цен».
   ========================================================= */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PROTEKTOR = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- 1. Классы машин и стоимость нормочаса ----------
     Чем больше и сложнее машина, тем дороже час работы мастера
     и тем больше нормочасов уходит на ту же операцию. */
  var CLASSES = {
    A: { name: 'Малый и бюджетный класс', short: 'Класс A', rate: 1900 },
    B: { name: 'Средний класс и кроссоверы', short: 'Класс B', rate: 2300 },
    C: { name: 'Бизнес-класс и большие SUV', short: 'Класс C', rate: 2800 }
  };

  /* ---------- 2. Марки и модели ----------
     Модель → класс. Если машины нет в списке, посетитель выбирает «Другая марка»
     и класс вручную. */
  var BRANDS = [
    { id: 'lada', name: 'Lada', models: [
      ['granta', 'Granta', 'A'], ['vesta', 'Vesta', 'A'], ['largus', 'Largus', 'A'],
      ['xray', 'XRAY', 'A'], ['niva-travel', 'Niva Travel', 'A']
    ] },
    { id: 'kia', name: 'Kia', models: [
      ['rio', 'Rio', 'A'], ['ceed', 'Ceed', 'B'], ['seltos', 'Seltos', 'B'],
      ['sportage', 'Sportage', 'B'], ['k5', 'K5', 'C'], ['sorento', 'Sorento', 'C']
    ] },
    { id: 'hyundai', name: 'Hyundai', models: [
      ['solaris', 'Solaris', 'A'], ['creta', 'Creta', 'B'], ['elantra', 'Elantra', 'B'],
      ['tucson', 'Tucson', 'B'], ['santa-fe', 'Santa Fe', 'C']
    ] },
    { id: 'skoda', name: 'Skoda', models: [
      ['rapid', 'Rapid', 'A'], ['octavia', 'Octavia', 'B'], ['karoq', 'Karoq', 'B'], ['kodiaq', 'Kodiaq', 'C']
    ] },
    { id: 'vw', name: 'Volkswagen', models: [
      ['polo', 'Polo', 'A'], ['jetta', 'Jetta', 'B'], ['tiguan', 'Tiguan', 'B'], ['touareg', 'Touareg', 'C']
    ] },
    { id: 'toyota', name: 'Toyota', models: [
      ['corolla', 'Corolla', 'B'], ['rav4', 'RAV4', 'B'], ['camry', 'Camry', 'C'], ['prado', 'Land Cruiser Prado', 'C']
    ] },
    { id: 'renault', name: 'Renault', models: [
      ['logan', 'Logan', 'A'], ['sandero', 'Sandero', 'A'], ['duster', 'Duster', 'B'],
      ['kaptur', 'Kaptur', 'B'], ['arkana', 'Arkana', 'B']
    ] },
    { id: 'haval', name: 'Haval', models: [
      ['jolion', 'Jolion', 'B'], ['f7', 'F7', 'B'], ['dargo', 'Dargo', 'C'], ['h9', 'H9', 'C']
    ] },
    { id: 'chery', name: 'Chery', models: [
      ['tiggo4', 'Tiggo 4 Pro', 'B'], ['tiggo7', 'Tiggo 7 Pro', 'B'], ['tiggo8', 'Tiggo 8 Pro', 'C']
    ] },
    { id: 'geely', name: 'Geely', models: [
      ['coolray', 'Coolray', 'B'], ['atlas', 'Atlas Pro', 'B'], ['monjaro', 'Monjaro', 'C'], ['tugella', 'Tugella', 'C']
    ] }
  ];
  var OTHER_BRAND = 'other'; // «Другая марка»: модель = код класса (A, B, C)

  /* ---------- 3. Работы ----------
     h — нормочасы [от, до] для классов A, B, C;
     p — запчасти и расходники «наши», ₽ [от, до] для A, B, C (null — запчасти не нужны).
     Вилка «от–до» честная: точнее мастер скажет после осмотра. */
  var GROUPS = [
    { id: 'service', name: 'Обслуживание' },
    { id: 'brakes', name: 'Тормоза' },
    { id: 'chassis', name: 'Подвеска и шины' },
    { id: 'engine', name: 'Двигатель и диагностика' }
  ];
  var WORKS = [
    { id: 'to', group: 'service', name: 'ТО: масло и три фильтра', note: 'масляный, воздушный, салонный',
      h: [[0.8, 1.0], [1.0, 1.2], [1.2, 1.5]], p: [[3500, 6000], [4500, 8000], [6500, 12000]] },
    { id: 'oil', group: 'service', name: 'Замена масла в двигателе', note: 'с масляным фильтром',
      h: [[0.5, 0.6], [0.5, 0.7], [0.6, 0.8]], p: [[2500, 4500], [3500, 6000], [5000, 9000]] },
    { id: 'spark', group: 'service', name: 'Замена свечей зажигания', note: 'комплект',
      h: [[0.3, 0.6], [0.5, 1.0], [0.8, 1.5]], p: [[800, 2400], [1600, 4800], [2400, 7200]] },
    { id: 'ac', group: 'service', name: 'Заправка кондиционера', note: 'с проверкой на утечку',
      h: [[0.7, 0.8], [0.7, 0.8], [0.7, 0.8]], p: [[1200, 1800], [1400, 2200], [1800, 2800]] },

    { id: 'pads_f', group: 'brakes', name: 'Передние тормозные колодки', note: 'замена, ось',
      h: [[0.6, 0.8], [0.7, 0.9], [0.8, 1.0]], p: [[1500, 3500], [2200, 5000], [3500, 8000]] },
    { id: 'pads_r', group: 'brakes', name: 'Задние колодки', note: 'диск или барабан',
      h: [[0.8, 1.2], [0.8, 1.0], [0.9, 1.2]], p: [[1300, 3000], [2000, 4500], [3000, 7000]] },
    { id: 'discs_f', group: 'brakes', name: 'Передние диски с колодками', note: 'замена, ось',
      h: [[1.2, 1.5], [1.4, 1.7], [1.6, 2.0]], p: [[5000, 9000], [7000, 13000], [11000, 22000]] },
    { id: 'fluid', group: 'brakes', name: 'Замена тормозной жидкости', note: 'прокачка системы',
      h: [[0.6, 0.8], [0.6, 0.8], [0.7, 0.9]], p: [[500, 900], [600, 1100], [800, 1500]] },

    { id: 'susp_diag', group: 'chassis', name: 'Диагностика подвески', note: 'на подъёмнике, с отчётом',
      h: [[0.5, 0.5], [0.5, 0.5], [0.5, 0.5]], p: null },
    { id: 'shocks_f', group: 'chassis', name: 'Передние амортизаторы', note: 'пара, с опорами',
      h: [[1.6, 2.2], [1.8, 2.6], [2.2, 3.2]], p: [[5000, 11000], [8000, 16000], [12000, 26000]] },
    { id: 'align', group: 'chassis', name: 'Развал-схождение', note: '3D-стенд',
      h: [[1.0, 1.0], [1.0, 1.2], [1.2, 1.4]], p: null },
    { id: 'tyres', group: 'chassis', name: 'Шиномонтаж 4 колёс', note: 'с балансировкой и грузиками',
      h: [[0.8, 1.0], [1.0, 1.2], [1.2, 1.5]], p: null },

    { id: 'diag', group: 'engine', name: 'Компьютерная диагностика', note: 'чтение ошибок, живые данные',
      h: [[0.5, 0.7], [0.5, 0.7], [0.5, 0.7]], p: null },
    { id: 'timing', group: 'engine', name: 'Ремень или цепь ГРМ', note: 'комплект с роликами',
      h: [[2.5, 4.5], [3.0, 5.5], [3.5, 6.5]], p: [[5000, 14000], [7000, 20000], [10000, 30000]] },
    { id: 'clutch', group: 'engine', name: 'Сцепление', note: 'механическая коробка, комплект',
      h: [[3.5, 5.0], [4.0, 6.0], [5.0, 7.0]], p: [[8000, 15000], [11000, 20000], [15000, 28000]] }
  ];
  var WORK_BY_ID = {};
  WORKS.forEach(function (w) { WORK_BY_ID[w.id] = w; });
  var CLASS_INDEX = { A: 0, B: 1, C: 2 };

  /* ---------- 4. Расчёт стоимости ---------- */
  var down50 = function (n) { return Math.floor(n / 50 + 1e-9) * 50; };
  var up50 = function (n) { return Math.ceil(n / 50 - 1e-9) * 50; };

  // Найти машину. Возвращает { brand, model, cls, title } или null.
  function findCar(brandId, modelId) {
    if (brandId === OTHER_BRAND) {
      return CLASSES[modelId] ? { brand: 'Другая марка', model: CLASSES[modelId].short, cls: modelId, title: 'Другая марка, ' + CLASSES[modelId].short } : null;
    }
    for (var i = 0; i < BRANDS.length; i++) {
      if (BRANDS[i].id !== brandId) continue;
      for (var j = 0; j < BRANDS[i].models.length; j++) {
        var m = BRANDS[i].models[j];
        if (m[0] === modelId) return { brand: BRANDS[i].name, model: m[1], cls: m[2], title: BRANDS[i].name + ' ' + m[1] };
      }
    }
    return null;
  }

  // Только известные работы, без повторов, в порядке справочника
  function cleanWorks(ids) {
    var list = Array.isArray(ids) ? ids : String(ids || '').split(',');
    var set = {};
    list.forEach(function (id) { set[String(id).trim()] = true; });
    return WORKS.filter(function (w) { return set[w.id]; }).map(function (w) { return w.id; });
  }

  /* Главная функция: цена и время.
     parts: 'our' — запчасти наши (в вилку входят), 'own' — привезёте свои (в вилку не входят).
     Возвращает null, если машина неизвестна. */
  function estimate(brandId, modelId, workIds, parts) {
    var car = findCar(brandId, modelId);
    if (!car) return null;
    var k = CLASS_INDEX[car.cls];
    var rate = CLASSES[car.cls].rate;
    var own = parts === 'own';
    var res = {
      car: car, cls: car.cls, rate: rate, parts: own ? 'own' : 'our', lines: [],
      laborMin: 0, laborMax: 0, partsMin: 0, partsMax: 0, totalMin: 0, totalMax: 0, hoursMax: 0, dur: 0
    };
    cleanWorks(workIds).forEach(function (id) {
      var w = WORK_BY_ID[id];
      var h = w.h[k];
      var line = {
        id: id, name: w.name,
        laborMin: down50(h[0] * rate), laborMax: up50(h[1] * rate),
        partsMin: !own && w.p ? w.p[k][0] : 0, partsMax: !own && w.p ? w.p[k][1] : 0,
        hasParts: !!w.p, hours: h
      };
      res.lines.push(line);
      res.laborMin += line.laborMin; res.laborMax += line.laborMax;
      res.partsMin += line.partsMin; res.partsMax += line.partsMax;
      res.hoursMax += h[1];
    });
    res.totalMin = res.laborMin + res.partsMin;
    res.totalMax = res.laborMax + res.partsMax;
    res.dur = durationFor(res.hoursMax);
    return res;
  }

  // Сколько занять подъёмник: верхняя граница нормочасов, вверх до 30 минут, минимум 30 минут
  function durationFor(hours) {
    if (!hours) return 0;
    return Math.max(30, Math.ceil(Math.round(hours * 60) / 30) * 30);
  }

  /* ---------- 5. Расписание ----------
     Три подъёмника (поста). Клиент выбирает время приезда, сервер сам ставит машину
     на свободный пост. Работа должна закончиться до закрытия. Если работ больше,
     чем на один рабочий день, машину принимаем утром, а отдаём на следующий день. */
  var POSTS = [
    { id: 1, name: 'Пост 1' },
    { id: 2, name: 'Пост 2' },
    { id: 3, name: 'Пост 3' }
  ];
  // Часы работы по дням недели (0 — воскресенье), в минутах от полуночи
  var HOURS = [
    { open: 10 * 60, close: 18 * 60 }, // вс
    { open: 9 * 60, close: 21 * 60 },  // пн
    { open: 9 * 60, close: 21 * 60 },
    { open: 9 * 60, close: 21 * 60 },
    { open: 9 * 60, close: 21 * 60 },
    { open: 9 * 60, close: 21 * 60 },
    { open: 9 * 60, close: 21 * 60 }   // сб
  ];
  var STEP = 30;          // шаг времени приезда, минут
  var DAYS_AHEAD = 14;    // на сколько дней вперёд открыта запись
  var MIN_LEAD = 60;      // сегодня — не раньше чем через час

  /* Демо-занятость: в новой базе записей нет, и пустое расписание выглядит неправдоподобно.
     Часть часов на каждом посту «занята» по формуле. Реальные записи ложатся поверх.
     Для настоящего сервиса поставьте DEMO_BUSY = false (и на сайте, и в воркере — файл общий). */
  var DEMO_BUSY = true;
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  /* Занятость поста по формуле: [{ start, dur }].
     Похоже на живой сервис: машины по 1–3 часа с перерывами, суббота плотнее,
     а иногда пост свободен весь день — туда можно поставить большую работу. */
  function demoBlocks(dayKey, postId, isToday) {
    if (!DEMO_BUSY) return [];
    var wd = weekday(dayKey), hrs = HOURS[wd], out = [];
    var key = dayKey + '|' + postId;
    var freeDay = wd === 6 ? 5 : 15;                   // % дней, когда пост пустой
    if (!isToday && hash(key + '|free') % 100 < freeDay) return out;
    var t = hrs.open + (hash(key + '|first') % 3) * 60; // первая машина — с открытия или чуть позже
    for (var i = 0; t < hrs.close; i++) {
      var h = hash(key + '|' + i);
      var dur = (1 + h % 3) * 60;                     // работа 1–3 часа
      out.push({ start: t, dur: Math.min(dur, hrs.close - t) });
      var gap = (h >>> 8) % (wd === 6 ? 3 : 4);       // перерыв 0–2 (сб) или 0–3 часа
      t += dur + gap * 60;
    }
    return out;
  }

  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  function weekday(dayKey) {
    var p = dayKey.split('-').map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
  }
  function timeStr(min) { return pad(Math.floor(min / 60)) + ':' + pad(min % 60); }
  function parseTime(s) {
    var m = /^(\d{2}):(\d{2})$/.exec(String(s || ''));
    return m ? +m[1] * 60 + +m[2] : -1;
  }

  // Текущие дата и минуты в Москве — не зависят от часового пояса посетителя или сервера
  function moscowNow(date) {
    var p = {};
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(date || new Date()).forEach(function (x) { p[x.type] = x.value; });
    return { y: +p.year, m: +p.month - 1, d: +p.day, min: (+p.hour % 24) * 60 + +p.minute };
  }
  function nextDays(date) {
    var now = moscowNow(date), days = [];
    for (var i = 0; i < DAYS_AHEAD; i++) {
      var dt = new Date(Date.UTC(now.y, now.m, now.d + i));
      days.push(dt.getUTCFullYear() + '-' + pad(dt.getUTCMonth() + 1) + '-' + pad(dt.getUTCDate()));
    }
    return { days: days, nowMin: now.min };
  }

  // Сколько реально занять пост в этот день и с какого времени можно начинать
  function plan(dayKey, dur) {
    var hrs = HOURS[weekday(dayKey)];
    var len = hrs.close - hrs.open;
    if (dur > len) return { long: true, occupy: len, starts: [hrs.open] }; // «машина на день»
    var starts = [];
    for (var t = hrs.open; t + dur <= hrs.close; t += STEP) starts.push(t);
    return { long: false, occupy: dur, starts: starts };
  }

  var overlaps = function (a1, a2, b1, b2) { return a1 < b2 && b1 < a2; };

  /* Свободен ли пост postId на [start, start + occupy).
     ctx = { days, nowMin, bookings: [{ post_id, date, start_min, dur }] } */
  function postFree(postId, dayKey, start, occupy, ctx) {
    var end = start + occupy;
    var isToday = dayKey === ctx.days[0];
    if (isToday && start < ctx.nowMin + MIN_LEAD) return false;
    var demo = demoBlocks(dayKey, postId, isToday);
    for (var i = 0; i < demo.length; i++) if (overlaps(start, end, demo[i].start, demo[i].start + demo[i].dur)) return false;
    for (var j = 0; j < ctx.bookings.length; j++) {
      var b = ctx.bookings[j];
      if (+b.post_id === postId && b.date === dayKey && overlaps(start, end, b.start_min, b.start_min + b.dur)) return false;
    }
    return true;
  }

  // Первый свободный пост для начала start (или null)
  function freePost(dayKey, start, dur, ctx) {
    var pl = plan(dayKey, dur);
    if (pl.starts.indexOf(start) < 0) return null;
    for (var i = 0; i < POSTS.length; i++) if (postFree(POSTS[i].id, dayKey, start, pl.occupy, ctx)) return POSTS[i];
    return null;
  }

  // Свободное время на все дни: [{ date, long, free: ['09:00', ...] }]
  function freeSlots(dur, ctx) {
    return ctx.days.map(function (day) {
      var pl = plan(day, dur);
      return {
        date: day, long: pl.long,
        free: pl.starts.filter(function (t) { return freePost(day, t, dur, ctx); }).map(timeStr)
      };
    });
  }

  return {
    CLASSES: CLASSES, BRANDS: BRANDS, OTHER_BRAND: OTHER_BRAND, GROUPS: GROUPS, WORKS: WORKS,
    POSTS: POSTS, HOURS: HOURS, STEP: STEP, DAYS_AHEAD: DAYS_AHEAD, MIN_LEAD: MIN_LEAD,
    findCar: findCar, cleanWorks: cleanWorks, estimate: estimate, durationFor: durationFor,
    moscowNow: moscowNow, nextDays: nextDays, weekday: weekday, plan: plan,
    postFree: postFree, freePost: freePost, freeSlots: freeSlots,
    timeStr: timeStr, parseTime: parseTime, hash: hash
  };
});
