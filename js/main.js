/* =========================================================
   Автосервис «Протектор» — скрипты
   Без фреймворков. Каждый блок — отдельная функция init*().
   Цены и расписание считает общий справочник js/catalog.js (window.PROTEKTOR).
   ========================================================= */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var P = window.PROTEKTOR;

  // Адрес Cloudflare Worker (см. worker/). Пустая строка — демо-режим:
  // цена и свободное время считаются в браузере, заявки никуда не уходят.
  var LEAD_ENDPOINT = 'https://protektor-booking.p4yla.workers.dev';
  // Ссылки на мессенджеры сервиса. Пусто — в демо по клику показываем подсказку.
  var LINKS = { Telegram: '', WhatsApp: '', 'ВКонтакте': '', MAX: '' };
  var PHONE = '+7 (495) 790-43-12';
  var ADDRESS = 'ул. Перерва, 74, стр. 2';

  // Отправка заявки. Кнопка блокируется, пока идёт запрос; при ошибке — текст в errorEl.
  function sendLead(form, data, button, errorEl) {
    var trap = form.querySelector('[name="website"]');
    data.website = trap ? trap.value : '';
    if (!LEAD_ENDPOINT) return Promise.resolve(null);
    var label = button.innerHTML;
    button.disabled = true;
    button.textContent = 'Отправляем…';
    errorEl.textContent = '';
    return fetch(LEAD_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (json) {
        if (!r.ok) { var e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
        return json;
      });
    }).catch(function (err) {
      // 409 — время заняли, это обрабатывает сама форма записи
      if (err.status !== 409) errorEl.textContent = 'Не получилось отправить заявку. Проверьте интернет или позвоните: ' + PHONE + '.';
      throw err;
    }).finally(function () {
      button.disabled = false;
      button.innerHTML = label;
    });
  }

  /* ---------- Утилиты форматирования ---------- */

  // 12950 -> «12 950 ₽» (неразрывный пробел, чтобы цена не разрывалась на две строки)
  function num(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function rub(n) { return num(n) + ' ₽'; }
  function range(a, b) { return a === b ? rub(a) : num(a) + '–' + rub(b); }
  // 150 -> «2 ч 30 мин»
  function duration(min) {
    var h = Math.floor(min / 60), m = min % 60;
    if (!h) return m + ' мин';
    return h + ' ч' + (m ? ' ' + m + ' мин' : '');
  }
  // [0.8, 1] -> «0,8–1 н·ч»
  function hoursText(h) {
    var f = function (x) { return String(x).replace('.', ','); };
    return (h[0] === h[1] ? f(h[0]) : f(h[0]) + '–' + f(h[1])) + ' н·ч';
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ---------- Тост: короткое сообщение внизу экрана ---------- */
  var toastTimer;
  function toast(text) {
    var el = $('#toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 3500);
  }

  /* ---------- Шапка и меню ---------- */
  function initHeader() {
    var header = $('#header');
    var burger = $('.burger');
    var menu = $('#mobile-menu');

    function onScroll() { header.classList.toggle('is-scrolled', window.scrollY > 10); }
    requestAnimationFrame(onScroll); // не читаем вёрстку синхронно при загрузке
    window.addEventListener('scroll', onScroll, { passive: true });

    function setMenu(open) {
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
      menu.hidden = !open;
      document.body.classList.toggle('menu-open', open);
    }
    burger.addEventListener('click', function () {
      setMenu(burger.getAttribute('aria-expanded') !== 'true');
    });
    menu.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !menu.hidden) { setMenu(false); burger.focus(); }
    });
    window.matchMedia('(min-width: 1180px)').addEventListener('change', function () { setMenu(false); });

    // Подсветка пункта меню текущей секции
    if (!('IntersectionObserver' in window)) return;
    var links = $$('.nav a');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        links.forEach(function (a) { a.classList.toggle('is-active', a.getAttribute('href') === '#' + en.target.id); });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    links.forEach(function (a) { var s = $(a.getAttribute('href')); if (s) io.observe(s); });
  }

  /* ---------- Появление блоков при прокрутке ---------- */
  function initReveal() {
    var items = $$('.reveal');
    if (!('IntersectionObserver' in window) || reduceMotion) {
      items.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach(function (el) { io.observe(el); });
  }

  /* ---------- Пример расчёта на первом экране (из справочника) ---------- */
  function initExample() {
    var e = P.estimate('kia', 'rio', ['to', 'pads_f'], 'our');
    $('#ex-lines').innerHTML = e.lines.map(function (l) {
      return '<li><span>' + l.name + '</span><b>' + range(l.laborMin + l.partsMin, l.laborMax + l.partsMax) + '</b></li>';
    }).join('');
    $('#ex-total').textContent = range(e.totalMin, e.totalMax);
    $('#ex-time').textContent = duration(e.dur);
  }

  /* ---------- Прайс: переключатель класса (на телефоне видна одна колонка) ---------- */
  function initPrices() {
    var table = $('#price-table');
    var buttons = $$('.class-switch button');
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
        table.dataset.show = btn.dataset.cls;
      });
    });
  }

  /* ---------- Маска телефона и проверка полей ---------- */
  function phoneDigits(v) {
    var d = v.replace(/\D/g, '');
    if (d[0] === '8' || d[0] === '7') d = d.slice(1);
    return d.slice(0, 10);
  }
  function formatPhone(d) {
    var out = '+7';
    if (d.length) out += ' (' + d.slice(0, 3);
    if (d.length >= 3) out += ')';
    if (d.length > 3) out += ' ' + d.slice(3, 6);
    if (d.length > 6) out += '-' + d.slice(6, 8);
    if (d.length > 8) out += '-' + d.slice(8, 10);
    return out;
  }
  function initPhoneMask(input) {
    var prev = '';
    input.addEventListener('focus', function () { if (!input.value) input.value = '+7 ('; });
    input.addEventListener('blur', function () { if (phoneDigits(input.value).length === 0) input.value = ''; });
    input.addEventListener('input', function (e) {
      var d = phoneDigits(input.value);
      // Набрали «8» или «7» первой цифрой по привычке — это код страны, он уже стоит
      if (!phoneDigits(prev) && (d === '8' || d === '7')) d = '';
      // Стёрли скобку или дефис — стираем и цифру перед ними
      if (e.inputType === 'deleteContentBackward' && d === phoneDigits(prev)) d = d.slice(0, -1);
      input.value = d.length ? formatPhone(d) : (document.activeElement === input ? '+7 (' : '');
      prev = input.value;
    });
    input.addEventListener('paste', function () { setTimeout(function () { input.dispatchEvent(new Event('input')); }, 0); });
  }

  // Госномер: латиница-двойник сразу превращается в кириллицу (A→А, B→В…)
  var LAT_TO_CYR = { A: 'А', B: 'В', E: 'Е', K: 'К', M: 'М', H: 'Н', O: 'О', P: 'Р', C: 'С', T: 'Т', Y: 'У', X: 'Х' };
  function normPlate(v) {
    return v.toUpperCase().replace(/[A-Z]/g, function (c) { return LAT_TO_CYR[c] || c; });
  }
  function initPlate(input) {
    input.addEventListener('input', function () {
      var pos = input.selectionStart;
      input.value = normPlate(input.value);
      try { input.setSelectionRange(pos, pos); } catch (e) { /* не все поля это умеют */ }
    });
  }

  var validators = {
    name: function (v) {
      v = v.trim();
      if (!v) return 'Введите имя';
      if (v.length < 2) return 'Имя слишком короткое';
      if (!/^[A-Za-zА-Яа-яЁё\s'-]+$/.test(v)) return 'Используйте только буквы';
      return '';
    },
    phone: function (v) {
      var d = phoneDigits(v);
      if (!d.length) return 'Введите телефон';
      if (d.length < 10) return 'Введите телефон полностью';
      return '';
    },
    plate: function (v) {
      var p = normPlate(v).replace(/[\s-]/g, '');
      if (!p) return '';
      if (!/^[АВЕКМНОРСТУХ]\d{3}[АВЕКМНОРСТУХ]{2}\d{2,3}$/.test(p)) return 'Формат номера: А123ВС 777. Можно оставить пустым';
      return '';
    },
    consent: function (v, el) { return el.checked ? '' : 'Без согласия мы не сможем принять заявку'; }
  };

  // Проверяет одно поле и показывает ошибку под ним. Возвращает true, если всё хорошо.
  function validateField(el) {
    var err = validators[el.dataset.validate](el.value, el);
    var wrap = el.closest('.field, .consent');
    var box = $('.field__error, .consent__error', wrap);
    wrap.classList.toggle('is-invalid', !!err);
    wrap.classList.toggle('is-valid', !err && el.type !== 'checkbox' && !!el.value.trim());
    el.setAttribute('aria-invalid', String(!!err));
    box.textContent = err;
    return !err;
  }

  function initFieldValidation(form) {
    $$('[data-mask="phone"]', form).forEach(initPhoneMask);
    $$('[data-validate="plate"]', form).forEach(initPlate);
    $$('[data-validate]', form).forEach(function (el) {
      // Проверяем «на лету», но только после первого ухода с поля — чтобы не ругаться на полуслове
      el.addEventListener('blur', function () { if (el.type !== 'checkbox') { el.dataset.touched = '1'; validateField(el); } });
      el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', function () {
        if (el.dataset.touched || el.type === 'checkbox') validateField(el);
      });
    });
  }

  // Проверить все поля; фокус на первое ошибочное
  function validateAll(root) {
    var firstBad = null;
    $$('[data-validate]', root).forEach(function (el) {
      el.dataset.touched = '1';
      if (!validateField(el) && !firstBad) firstBad = el;
    });
    if (firstBad) firstBad.focus();
    return !firstBad;
  }

  function resetForm(form) {
    form.reset();
    $$('.field, .consent', form).forEach(function (w) { w.classList.remove('is-invalid', 'is-valid'); });
    $$('[aria-invalid]', form).forEach(function (el) { el.removeAttribute('aria-invalid'); });
    $$('.field__error, .consent__error', form).forEach(function (el) { el.textContent = ''; });
    $$('[data-touched]', form).forEach(function (el) { delete el.dataset.touched; });
  }

  /* ---------- Калькулятор и запись ---------- */
  function initBooking() {
    var form = $('#booking-form');
    if (!form || !P) return;

    var state = { step: 1, brand: '', model: '', works: [], parts: 'our', date: null, time: null };
    var steps = $$('.step', form);
    var progress = $$('.progress li', form);
    var btnBack = $('#step-back'), btnNext = $('#step-next'), btnSubmit = $('#step-submit');
    var errorBox = $('#step-error');
    var stepNames = ['машина и работы', 'дата и время', 'контакты'];
    var brandSel = $('#car-brand'), modelSel = $('#car-model'), worksBox = $('#works');
    var check = '<span class="choice__mark"><svg aria-hidden="true"><use href="#i-check"/></svg></span>';
    var localBookings = []; // демо-режим: записи этой вкладки, чтобы занятое время сразу пропадало

    function est() { return state.brand && state.model ? P.estimate(state.brand, state.model, state.works, state.parts) : null; }
    function car() { return state.brand && state.model ? P.findCar(state.brand, state.model) : null; }

    /* Шаг 1: машина */
    brandSel.innerHTML = '<option value="">Выберите марку</option>' +
      P.BRANDS.map(function (b) { return '<option value="' + b.id + '">' + b.name + '</option>'; }).join('') +
      '<option value="' + P.OTHER_BRAND + '">Другая марка</option>';

    function renderModels() {
      if (!state.brand) {
        modelSel.innerHTML = '<option value="">Сначала марка</option>';
        modelSel.disabled = true;
      } else if (state.brand === P.OTHER_BRAND) {
        $('#car-model-label').textContent = 'Класс машины';
        modelSel.innerHTML = '<option value="">Выберите класс</option>' + ['A', 'B', 'C'].map(function (c) {
          return '<option value="' + c + '">' + P.CLASSES[c].short + ' — ' + P.CLASSES[c].name.toLowerCase() + '</option>';
        }).join('');
        modelSel.disabled = false;
      } else {
        $('#car-model-label').textContent = 'Модель';
        var b = P.BRANDS.find(function (x) { return x.id === state.brand; });
        modelSel.innerHTML = '<option value="">Выберите модель</option>' + b.models.map(function (m) {
          return '<option value="' + m[0] + '">' + m[1] + '</option>';
        }).join('');
        modelSel.disabled = false;
      }
      if (state.brand !== P.OTHER_BRAND) $('#car-model-label').textContent = 'Модель';
      modelSel.value = state.model;
    }
    brandSel.addEventListener('change', function () {
      state.brand = brandSel.value;
      state.model = '';
      renderModels();
      update();
      if (state.brand) modelSel.focus();
    });
    modelSel.addEventListener('change', function () {
      state.model = modelSel.value;
      errorBox.textContent = '';
      update();
    });

    function renderClass() {
      var c = car(), box = $('#car-class');
      if (!c) {
        box.innerHTML = state.brand === P.OTHER_BRAND
          ? 'Класс влияет на стоимость нормочаса. Не уверены — выберите B, мастер уточнит.'
          : 'Выберите машину — цены пересчитаются под её класс.';
        return;
      }
      var cl = P.CLASSES[c.cls];
      box.innerHTML = '<b>' + cl.short + '</b>' + cl.name + ' · нормочас ' + rub(cl.rate);
    }

    /* Шаг 1: работы — группы и карточки из справочника */
    function renderWorks() {
      var c = car();
      var k = c ? { A: 0, B: 1, C: 2 }[c.cls] : 0;
      worksBox.innerHTML = P.GROUPS.map(function (g) {
        var items = P.WORKS.filter(function (w) { return w.group === g.id; }).map(function (w) {
          var e = P.estimate(c ? state.brand : P.OTHER_BRAND, c ? state.model : 'A', [w.id], state.parts);
          return '<label class="choice"><input type="checkbox" name="works" value="' + w.id + '"' +
            (state.works.indexOf(w.id) > -1 ? ' checked' : '') + '>' +
            '<span class="choice__box">' + check +
            '<span class="choice__text"><b>' + w.name + '</b><small>' + w.note + '</small></span>' +
            '<span class="choice__price">от ' + rub(e.totalMin) + '<small>' + hoursText(w.h[k]) + '</small></span></span></label>';
        }).join('');
        return '<div class="works__group" role="group" aria-labelledby="wg-' + g.id + '"><h3 id="wg-' + g.id + '">' + g.name + '</h3><div class="choice-list">' + items + '</div></div>';
      }).join('');
    }
    worksBox.addEventListener('change', function () {
      state.works = $$('input:checked', worksBox).map(function (i) { return i.value; });
      errorBox.textContent = '';
      renderSummary();
    });
    $$('input[name="parts"]', form).forEach(function (r) {
      r.addEventListener('change', function () {
        state.parts = r.value;
        renderWorks();
        renderSummary();
      });
    });

    function update() {
      // Другая машина — другая длительность и цена: выбранное время сбрасываем
      state.time = null;
      renderClass();
      renderWorks();
      renderSummary();
    }

    /* Шаг 2: дата и время.
       С сервером — GET /slots (учитывает реальные записи в базе).
       В демо — тот же расчёт из справочника прямо в браузере. */
    var datesBox = $('#dates'), slotsBox = $('#slots');
    var slotCache = {};      // ключ «машина|работы» -> { dur, days: { '2026-11-03': { long, free: [...] } } }
    var slotsState = 'idle'; // idle / loading / error

    function slotKey() { return state.brand + '|' + state.model + '|' + state.works.slice().sort().join(','); }

    function loadSlots() {
      var key = slotKey();
      if (slotCache[key]) return Promise.resolve();
      if (!LEAD_ENDPOINT) {
        var e = est(), ctx = P.nextDays();
        ctx.bookings = localBookings;
        slotCache[key] = { dur: e.dur, days: toMap(P.freeSlots(e.dur, ctx)) };
        return Promise.resolve();
      }
      slotsState = 'loading';
      var url = LEAD_ENDPOINT + '/slots?brand=' + encodeURIComponent(state.brand) + '&model=' + encodeURIComponent(state.model) +
        '&works=' + encodeURIComponent(state.works.join(','));
      return fetch(url, { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (json) {
        slotCache[key] = { dur: json.dur, days: toMap(json.days) };
        slotsState = 'idle';
      }).catch(function () { slotsState = 'error'; });
    }
    function toMap(list) {
      var map = {};
      list.forEach(function (d) { map[d.date] = d; });
      return map;
    }

    function dayInfo(key) {
      var p = key.split('-').map(Number);
      var dt = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
      var o = { timeZone: 'UTC' };
      return {
        key: key, date: dt, sunday: dt.getUTCDay() === 0,
        weekday: dt.toLocaleDateString('ru-RU', Object.assign({ weekday: 'short' }, o)),
        label: dt.toLocaleDateString('ru-RU', Object.assign({ day: 'numeric', month: 'long' }, o)),
        month: dt.toLocaleDateString('ru-RU', Object.assign({ month: 'short' }, o)).replace('.', '')
      };
    }

    function renderDates() {
      var cache = slotCache[slotKey()];
      if (!cache) {
        datesBox.innerHTML = '';
        $('#slots-label').textContent = '';
        if (slotsState === 'error') {
          slotsState = 'idle';
          slotsBox.innerHTML = '<p class="slots-empty">Не удалось загрузить расписание. <button type="button" class="btn btn--link" id="slots-retry">Попробовать ещё раз</button> или позвоните: <a href="tel:+74957904312">' + PHONE + '</a>.</p>';
          $('#slots-retry').addEventListener('click', renderDates);
          return;
        }
        slotsBox.innerHTML = '<p class="slots-empty" role="status">Загружаем свободное время…</p>';
        loadSlots().then(renderDates);
        return;
      }
      var days = Object.keys(cache.days).sort();
      var long = days.some(function (k) { return cache.days[k].long; });
      $('#dur-hint').innerHTML = long
        ? 'Работ примерно на <b>' + duration(cache.dur) + '</b> — больше рабочего дня. Привезите машину к открытию, заберёте на следующий день.'
        : 'Работы займут до <b>' + duration(cache.dur) + '</b>. Выберите время приезда — к нему освободится подъёмник.';
      if (!state.date || !cache.days[state.date]) {
        // По умолчанию — первый день со свободным временем
        state.date = days.find(function (k) { return cache.days[k].free.length; }) || days[0];
      }
      datesBox.innerHTML = days.map(function (k, i) {
        var d = dayInfo(k), full = !cache.days[k].free.length;
        return '<button type="button" class="date-btn' + (d.sunday ? ' is-sunday' : '') + (full ? ' is-full' : '') + '" data-date="' + k + '" aria-pressed="' + (k === state.date) + '" aria-label="' + (i === 0 ? 'Сегодня, ' : '') + d.weekday + ', ' + d.label + (full ? ', мест нет' : '') + '">' +
          '<span>' + (i === 0 ? 'сегодня' : d.weekday) + '</span><b>' + d.date.getUTCDate() + '</b><span>' + d.month + '</span></button>';
      }).join('');
      renderSlots();
    }
    function renderSlots() {
      var cache = slotCache[slotKey()];
      var day = cache.days[state.date], d = dayInfo(state.date);
      var pl = P.plan(state.date, cache.dur);
      if (state.time && day.free.indexOf(state.time) < 0) state.time = null;
      var html = pl.starts.map(function (m) {
        var t = P.timeStr(m), free = day.free.indexOf(t) > -1;
        return '<button type="button" class="slot" data-time="' + t + '"' + (free ? '' : ' disabled aria-label="' + t + ', занято"') +
          ' aria-pressed="' + (state.time === t) + '">' + t + '</button>';
      }).join('');
      slotsBox.innerHTML = day.free.length ? html
        : '<p class="slots-empty">На этот день все подъёмники заняты. Выберите другую дату или позвоните <a href="tel:+74957904312">' + PHONE + '</a> — иногда освобождается время.</p>';
      $('#slots-label').textContent = 'Время приезда, ' + d.label + ', ' + d.weekday;
    }
    datesBox.addEventListener('click', function (e) {
      var b = e.target.closest('.date-btn'); if (!b) return;
      state.date = b.dataset.date; state.time = null;
      $$('.date-btn', datesBox).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      renderSlots(); renderSummary();
    });
    slotsBox.addEventListener('click', function (e) {
      var b = e.target.closest('.slot'); if (!b || b.disabled) return;
      state.time = b.dataset.time;
      $$('.slot', slotsBox).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      errorBox.textContent = '';
      renderSummary();
    });

    /* Итог справа и строка с ценой у кнопки (на телефоне) */
    function dayLabel() {
      if (!state.date) return '';
      var d = dayInfo(state.date);
      return d.weekday + ', ' + d.label;
    }
    function renderSummary() {
      var c = car(), e = est();
      $('#sum-car').innerHTML = c ? '<b>' + esc(c.title) + '</b> · ' + P.CLASSES[c.cls].short + ', нормочас ' + rub(P.CLASSES[c.cls].rate) : 'Выберите машину';
      var has = e && e.lines.length;
      $('#sum-lines').innerHTML = has
        ? e.lines.map(function (l) { return '<li><span>' + l.name + '</span><span>' + range(l.laborMin + l.partsMin, l.laborMax + l.partsMax) + '</span></li>'; }).join('')
        : '<li class="summary__empty">' + (c ? 'Отметьте работы — цена появится здесь.' : 'Выберите машину и отметьте работы — цена появится здесь.') + '</li>';
      $('#sum-labor').textContent = has ? range(e.laborMin, e.laborMax) : '—';
      $('#sum-parts').textContent = !has ? '—' : (state.parts === 'own' ? 'ваши' : (e.partsMax ? range(e.partsMin, e.partsMax) : 'не нужны'));
      $('#sum-dur').textContent = has ? 'до ' + duration(e.dur) : '—';
      $('#sum-date').textContent = state.time ? dayLabel() + ', ' + state.time : '—';
      $('#sum-total').textContent = has ? range(e.totalMin, e.totalMax) : '—';
      $('#step-total').innerHTML = has && state.step < 3
        ? '<b>' + range(e.totalMin, e.totalMax) + '</b><span>до ' + duration(e.dur) + ' на подъёмнике</span>' : '';
      $('#sum-note').textContent = state.parts === 'own'
        ? 'Цена только за работу. Гарантия — на работу, на ваши детали — гарантия продавца.'
        : 'Окончательную цену мастер назовёт после осмотра — до начала работ. Доп. работы только после звонка.';
    }

    /* Переходы между шагами */
    function validateStep() {
      if (state.step === 1) {
        if (!state.brand) return 'Выберите марку машины';
        if (!state.model) return state.brand === P.OTHER_BRAND ? 'Выберите класс машины' : 'Выберите модель';
        if (!state.works.length) return 'Отметьте хотя бы одну работу. Не знаете, что сломалось, — выберите диагностику';
      }
      if (state.step === 2 && !state.time) return 'Выберите время приезда';
      return '';
    }
    function goTo(n, focus) {
      state.step = n;
      steps.forEach(function (s) { s.hidden = +s.dataset.step !== n; });
      progress.forEach(function (li, i) {
        li.classList.toggle('is-current', i === n - 1);
        li.classList.toggle('is-done', i < n - 1);
      });
      btnBack.hidden = n === 1;
      btnNext.hidden = n === 3;
      btnNext.firstChild.textContent = n === 1 ? 'Выбрать время' : 'К контактам';
      btnSubmit.hidden = n !== 3;
      errorBox.textContent = '';
      $('#step-status').textContent = 'Шаг ' + n + ' из 3: ' + stepNames[n - 1];
      if (n === 2) renderDates();
      renderSummary();
      if (focus) {
        var fs = steps[n - 1];
        fs.setAttribute('tabindex', '-1');
        fs.focus({ preventScroll: true });
        var top = form.getBoundingClientRect().top;
        if (top < 0) form.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      }
    }
    btnNext.addEventListener('click', function () {
      var err = validateStep();
      if (err) {
        errorBox.textContent = err;
        if (state.step === 1 && !state.brand) brandSel.focus();
        else if (state.step === 1 && !state.model) modelSel.focus();
        return;
      }
      goTo(state.step + 1, true);
    });
    btnBack.addEventListener('click', function () { goTo(state.step - 1, true); });

    initFieldValidation(form);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (state.step !== 3) { btnNext.click(); return; }
      if (!validateAll(steps[2])) return;
      var name = $('#b-name').value.trim();
      var phone = $('#b-phone').value;
      var plate = normPlate($('#b-plate').value).replace(/[\s-]/g, '');
      // Отправляем только коды машины и работ: цену и длительность сервер посчитает сам
      sendLead(form, {
        type: 'booking',
        brand: state.brand, model: state.model, works: state.works, parts: state.parts,
        date: state.date, time: state.time,
        name: name, phone: phone, plate: plate, comment: $('#b-comment').value,
        consent: true
      }, btnSubmit, errorBox).then(function (res) {
        var e = est();
        if (!LEAD_ENDPOINT) {
          // Демо: ставим машину на свободный пост в браузере
          var ctx = P.nextDays(); ctx.bookings = localBookings;
          var start = P.parseTime(state.time), post = P.freePost(state.date, start, e.dur, ctx);
          localBookings.push({ post_id: post ? post.id : 1, date: state.date, start_min: start, dur: P.plan(state.date, e.dur).occupy });
          res = { post: post ? post.name : 'Пост 1', estimate: { min: e.totalMin, max: e.totalMax } };
        }
        slotCache = {}; // расписание изменилось
        showSuccess(name, phone, res);
      }, function (err) {
        if (err.status !== 409) return;
        // Время заняли, пока человек заполнял форму: обновляем расписание и возвращаем на шаг 2
        delete slotCache[slotKey()];
        state.time = null;
        goTo(2, true);
        errorBox.textContent = 'Это время только что заняли. Выберите другое — расписание обновлено.';
      });
    });

    function showSuccess(name, phone, res) {
      var c = car();
      $('#booking-success-text').textContent = name + ', ждём ' + c.title + ' ' + dayLabel() + ' в ' + state.time +
        ' — ' + ADDRESS + ' (' + res.post + '). Предварительно ' + range(res.estimate.min, res.estimate.max) +
        '. Мастер-приёмщик перезвонит на ' + phone.replace(/ /g, ' ') + ' в течение 15 минут и подтвердит запись.';
      $$('.step, .step-nav, .progress, #step-error', form).forEach(function (el) { el.hidden = true; });
      var ok = $('#booking-success');
      ok.hidden = false;
      ok.focus();
      if (ok.getBoundingClientRect().top < 0) form.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    }

    /* .ics — файл события для любого календаря */
    $('#add-calendar').addEventListener('click', function () {
      var p = state.date.split('-').map(Number), m = P.parseTime(state.time), e = est();
      // Москва = UTC+3 круглый год, переводим в UTC
      var start = new Date(Date.UTC(p[0], p[1] - 1, p[2], 0, m - 180));
      var end = new Date(start.getTime() + P.plan(state.date, e.dur).occupy * 60000);
      var fmt = function (d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); };
      var desc = car().title + ': ' + e.lines.map(function (l) { return l.name; }).join(', ') + '. Телефон: ' + PHONE;
      var ics = [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Protektor Autoservice//RU', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        'UID:' + Date.now() + '@protektor-auto.example',
        'DTSTAMP:' + fmt(new Date()),
        'DTSTART:' + fmt(start),
        'DTEND:' + fmt(end),
        'SUMMARY:Автосервис «Протектор»',
        'DESCRIPTION:' + desc.replace(/([,;])/g, '\\$1'),
        'LOCATION:Москва\\, ул. Перерва\\, 74\\, стр. 2',
        'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:Через 2 часа — автосервис «Протектор»', 'END:VALARM',
        'END:VEVENT', 'END:VCALENDAR'
      ].join('\r\n');
      var url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
      var a = document.createElement('a');
      a.href = url; a.download = 'protektor-' + state.date + '.ics';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });

    $('#booking-again').addEventListener('click', function () {
      resetForm(form);
      state = { step: 1, brand: state.brand, model: state.model, works: [], parts: 'our', date: null, time: null };
      brandSel.value = state.brand;
      renderModels();
      $('#booking-success').hidden = true;
      $$('.step-nav, .progress, #step-error', form).forEach(function (el) { el.hidden = false; });
      update();
      goTo(1, true);
    });

    renderModels();
    update();
    goTo(1, false);
  }

  /* ---------- «Перезвоните мне» ---------- */
  function initCallback() {
    var form = $('#callback-form');
    if (!form) return;
    initFieldValidation(form);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!validateAll(form)) return;
      var phone = $('#c-phone').value;
      sendLead(form, {
        type: 'callback', name: $('#c-name').value.trim(), phone: phone, topic: $('#c-topic').value, consent: true
      }, $('button[type="submit"]', form), $('#callback-error')).then(function () {
        $('#callback-success-text').textContent = 'Перезвоним на ' + phone + ' в течение 15 минут (Пн–Сб 9–21, Вс 10–18).';
        $('.callback-fields', form).hidden = true;
        var ok = $('#callback-success');
        ok.hidden = false;
        ok.focus();
      }, function () {});
    });
    $('#callback-again').addEventListener('click', function () {
      resetForm(form);
      $('#callback-success').hidden = true;
      $('.callback-fields', form).hidden = false;
      $('#c-name').focus();
    });
  }

  /* ---------- Слайдер отзывов со свайпом ---------- */
  function initSlider() {
    var root = $('#slider');
    if (!root) return;
    var track = $('.slider__track', root);
    var slides = $$('.review', track);
    var dotsBox = $('#slider-dots');
    var prev = $('#slider-prev'), next = $('#slider-next');
    var index = 0, perView = 1, step = 0;

    function measure() {
      var gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      step = slides[0].getBoundingClientRect().width + gap;
      perView = Math.max(1, Math.round((track.getBoundingClientRect().width + gap) / step));
      var max = slides.length - perView;
      dotsBox.innerHTML = '';
      for (var i = 0; i <= max; i++) {
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('aria-label', 'Отзыв ' + (i + 1));
        b.dataset.i = i;
        dotsBox.appendChild(b);
      }
      go(Math.min(index, max));
    }
    function go(i) {
      var max = slides.length - perView;
      index = Math.max(0, Math.min(i, max));
      track.style.transform = 'translateX(' + (-index * step) + 'px)';
      prev.disabled = index === 0;
      next.disabled = index === max;
      $$('button', dotsBox).forEach(function (b, k) { b.setAttribute('aria-current', String(k === index)); });
      slides.forEach(function (s, k) {
        var visible = k >= index && k < index + perView;
        s.setAttribute('aria-hidden', String(!visible));
      });
    }
    prev.addEventListener('click', function () { go(index - 1); });
    next.addEventListener('click', function () { go(index + 1); });
    dotsBox.addEventListener('click', function (e) { if (e.target.dataset.i) go(+e.target.dataset.i); });
    root.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') go(index - 1);
      if (e.key === 'ArrowRight') go(index + 1);
    });

    // Свайп: следим за пальцем, вертикальную прокрутку страницы не блокируем (touch-action: pan-y)
    var startX = 0, startY = 0, dx = 0, dragging = false, decided = false;
    track.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      startX = e.clientX; startY = e.clientY; dx = 0; dragging = true; decided = false;
    });
    window.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      dx = e.clientX - startX;
      if (!decided) {
        if (Math.abs(dx) < 6 && Math.abs(e.clientY - startY) < 6) return;
        decided = true;
        if (Math.abs(e.clientY - startY) > Math.abs(dx)) { dragging = false; return; }
        root.classList.add('is-dragging');
      }
      track.style.transform = 'translateX(' + (-index * step + dx) + 'px)';
    });
    function end() {
      if (!dragging) return;
      dragging = false;
      root.classList.remove('is-dragging');
      if (Math.abs(dx) > 50) go(index + (dx < 0 ? 1 : -1)); else go(index);
    }
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);

    var t;
    window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(measure, 150); });
    requestAnimationFrame(measure);
  }

  /* ---------- Ссылки на мессенджеры: в демо — подсказка вместо пустой ссылки ---------- */
  function initDemoLinks() {
    $$('[data-demo-link]').forEach(function (a) {
      var name = a.dataset.demoLink, href = LINKS[name];
      if (href) { a.href = href; a.target = '_blank'; a.rel = 'noopener'; return; }
      a.setAttribute('aria-label', name + ' (в демо-версии не подключён)');
      a.addEventListener('click', function (e) {
        e.preventDefault();
        toast('Демо-версия: здесь откроется ' + name + ' сервиса. Пока звоните: ' + PHONE);
      });
    });
  }

  /* ---------- Cookie-баннер ---------- */
  function initCookie() {
    var box = $('#cookie');
    if (!box) return;
    var KEY = 'protektor-cookie-ok';
    var ok = false;
    try { ok = localStorage.getItem(KEY) === '1'; } catch (e) { /* приватный режим */ }
    if (ok) return;
    box.hidden = false;
    $('#cookie-ok').addEventListener('click', function () {
      try { localStorage.setItem(KEY, '1'); } catch (e) { /* ничего страшного */ }
      box.hidden = true;
    });
  }

  /* ---------- Запуск ---------- */
  [initHeader, initReveal, initExample, initPrices, initBooking, initCallback, initSlider, initDemoLinks, initCookie]
    .forEach(function (fn) {
      try { fn(); } catch (err) { console.error('[Протектор] ' + fn.name + ':', err); }
    });
})();
