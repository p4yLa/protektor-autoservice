// Обновляет цены, видимые без JavaScript (и поисковикам), из справочника js/catalog.js.
// Запуск из корня репозитория:  node tools/price-table.mjs
// Скрипт переписывает куски index.html между метками <!--PRICE_ROWS--> и <!--EXAMPLE_LINES-->.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const P = createRequire(import.meta.url)('../js/catalog.js');

// Неразрывные пробелы: цена не разрывается на две строки
const num = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const rub = (n) => num(n) + ' ₽';
const range = (a, b) => (a === b ? rub(a) : num(a) + '–' + rub(b));
const hours = (h) => String(h).replace('.', ',');
const CLS = ['A', 'B', 'C'];

const rows = P.GROUPS.map((g) => {
  const works = P.WORKS.filter((w) => w.group === g.id).map((w) => {
    const cells = CLS.map((c, i) => {
      const e = P.estimate('other', c, [w.id], 'own');
      return `<td data-col="${c}">от ${rub(e.laborMin)}<small>${hours(w.h[i][0])}${w.h[i][0] === w.h[i][1] ? '' : '–' + hours(w.h[i][1])} н·ч</small></td>`;
    }).join('');
    return `              <tr><th scope="row"><b>${w.name}</b><small>${w.note}</small></th>${cells}</tr>`;
  }).join('\n');
  return `            <tbody>\n              <tr class="price-group"><th scope="rowgroup" colspan="4">${g.name}</th></tr>\n${works}\n            </tbody>`;
}).join('\n');

const ex = P.estimate('kia', 'rio', ['to', 'pads_f'], 'our');
const exLines = ex.lines.map((l) => `            <li><span>${l.name}</span><b>${range(l.laborMin + l.partsMin, l.laborMax + l.partsMax)}</b></li>`).join('\n');

let html = fs.readFileSync('index.html', 'utf8');
const put = (tag, body) => {
  const re = new RegExp('(<!--' + tag + '-->)[\\s\\S]*?(\\s*<!--/' + tag + '-->)');
  if (!re.test(html)) throw new Error('Нет метки ' + tag);
  html = html.replace(re, `$1\n${body}$2`);
};
put('PRICE_ROWS', rows);
put('EXAMPLE_LINES', exLines);
html = html.replace(/(<b id="ex-total">)[^<]*/, '$1' + range(ex.totalMin, ex.totalMax));
fs.writeFileSync('index.html', html);
console.log('Обновлено: ' + P.WORKS.length + ' работ, пример ' + range(ex.totalMin, ex.totalMax));
