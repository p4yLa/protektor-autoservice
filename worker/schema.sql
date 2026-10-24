-- Записи на ремонт. Применить: npx wrangler d1 execute protektor --remote --file=schema.sql
CREATE TABLE IF NOT EXISTS bookings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id     INTEGER NOT NULL,              -- номер поста (подъёмника): 1, 2, 3
  date        TEXT    NOT NULL,              -- '2026-11-03' (московская дата)
  start_min   INTEGER NOT NULL,              -- приезд в минутах от полуночи: 10:30 -> 630
  dur         INTEGER NOT NULL,              -- сколько занят пост, минут (посчитано на сервере)
  brand       TEXT    NOT NULL,              -- код марки из справочника: kia, lada, other
  model       TEXT    NOT NULL,              -- код модели: rio, vesta (для other — класс A/B/C)
  car_class   TEXT    NOT NULL,              -- A / B / C
  works       TEXT    NOT NULL,              -- коды работ через запятую: 'to,pads_f'
  parts       TEXT    NOT NULL,              -- our — наши запчасти, own — привезёт свои
  est_min     INTEGER NOT NULL,              -- оценка «от», ₽ — посчитана на сервере
  est_max     INTEGER NOT NULL,              -- оценка «до», ₽
  name        TEXT    NOT NULL,
  phone       TEXT    NOT NULL,
  plate       TEXT    NOT NULL DEFAULT '',   -- госномер, если указали: А123ВС777
  comment     TEXT    NOT NULL DEFAULT '',   -- «что беспокоит»
  status      TEXT    NOT NULL DEFAULT 'new', -- new / confirmed / done / cancelled
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Ускоряет главный запрос: «какие записи на посту в этот день»
CREATE INDEX IF NOT EXISTS idx_bookings_date_post ON bookings (date, post_id);
