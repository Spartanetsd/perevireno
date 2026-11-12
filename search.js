/*
 * Перевірено — пошук за ключовими словами без мовних моделей.
 * Працює в браузері (window.Poshuk) і в Node (module.exports).
 * Жодних мережевих запитів: шукає лише в тексті з sources.json.
 *
 * Як рахується збіг:
 *  1. Запит ділиться на слова; службові слова відкидаються.
 *  2. Кожне слово зводиться до основи (легкий стемінг української).
 *  3. Загальні слова («допомога», «поліцейський», «застосування»…) — слабкі:
 *     самі по собі вони нічого не знаходять.
 *  4. Фрагмент показується, лише якщо в ньому знайдено хоча б одне сильне
 *     слово запиту, покрито щонайменше половину сильних слів і збіг вагомий
 *     (є в ключових словах чи назві або кілька збігів у тексті).
 *  5. Усі сильні слова знайдено — «Знайдено джерело». Не всі — «Точного
 *     джерела немає» і найближчий фрагмент. Нічого — «Джерела немає».
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.Poshuk = api;
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function list(s) { return s.split(/\s+/).filter(Boolean); }

  // Службові слова — не впливають на пошук.
  var STOP = new Set(list(
    'а аби або але б би бо в во вже все від для до є ж же з за зі і із й к ко коли ли ' +
    'мені мене на над не ні ну о об от по при про с та так там те то ти тут у уже хто ' +
    'це цей ця цього чи чим що щоб як яка яке який які якщо ще лише тільки лиш бути був ' +
    'була було були буде може можна треба потрібно мати має ми ви він вона воно вони я ' +
    'себе собі де куди тому тоді чому навіщо скільки під між через після перед без поки ' +
    'ст ч п пп'
  ));

  // Закінчення для легкого стемінгу (довші перевіряються першими).
  var ENDINGS = list(
    'ування ювання ення ання іння ість ості ами ями ові еві єві ого ому ими іми ях ах ' +
    'ам ям ою ею єю ій ий ої ів їв ей их іх ом ем ти ть ся сь ла ли ло ні на не но ну ' +
    'ня а я и і ї у ю о е є ь й'
  ).sort(function (a, b) { return b.length - a.length; });

  function stem(word) {
    var w = String(word || '');
    if (/^\d+$/.test(w)) { return w; }
    for (var i = 0; i < ENDINGS.length; i++) {
      var e = ENDINGS[i];
      if (w.length - e.length >= 3 && w.endsWith(e)) { return w.slice(0, -e.length); }
    }
    return w;
  }

  // Загальні слова: допомагають ранжувати, але самі нічого не знаходять.
  var WEAK = list(
    'допомога допомогу допомоги допомогою надати надавати надання поліцейський ' +
    'поліцейського поліцейські поліція поліції особа особи людина людини люди людей ' +
    'робити зробити діяти дія дії правила правило порядок порядку закон закону стаття ' +
    'статті пункт частина випадок випадку випадках застосування застосувати ' +
    'застосовувати використати використання можливо перевірити перевірка ' +
    'постраждалий постраждалі постраждалих постраждалим поранений поранення ' +
    'рука руки руку нога ноги ногу нозі голова голови тіло шия шиї палець пальці'
  ).map(stem);

  function isWeak(st) {
    for (var i = 0; i < WEAK.length; i++) {
      var w = WEAK[i];
      if (st === w || (w.length >= 5 && st.indexOf(w) === 0)) { return true; }
    }
    return false;
  }

  function clean(text) {
    return String(text || '').toLowerCase().replace(/['’ʼ`]/g, '').replace(/ё/g, 'е');
  }

  // Слова тексту: { word, stem, weak }. Службові слова й поодинокі цифри — геть.
  function terms(text) {
    var out = [];
    clean(text).split(/[^\p{L}\p{N}]+/u).forEach(function (w) {
      if (!w || /^\d$/.test(w) || STOP.has(w)) { return; }
      var st = stem(w);
      out.push({ word: w, stem: st, weak: isWeak(st) });
    });
    return out;
  }

  function uniqueTerms(arr) {
    var seen = {};
    return arr.filter(function (t) {
      if (seen[t.stem]) { return false; }
      seen[t.stem] = true;
      return true;
    });
  }

  function commonPrefix(a, b) {
    var n = Math.min(a.length, b.length);
    var i = 0;
    while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) { i++; }
    return i;
  }

  // Відстань редагування з перестановкою сусідніх літер (для одруківок).
  function distance(a, b) {
    var m = a.length, n = b.length;
    var d = [];
    for (var i = 0; i <= m; i++) { d.push([i]); }
    for (var j = 1; j <= n; j++) { d[0][j] = j; }
    for (i = 1; i <= m; i++) {
      for (j = 1; j <= n; j++) {
        var cost = a[i - 1] === b[j - 1] ? 0 : 1;
        var v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          v = Math.min(v, d[i - 2][j - 2] + 1);
        }
        d[i][j] = v;
      }
    }
    return d[m][n];
  }

  // Якість збігу двох основ: 1 — точний; 0.9 — одна основа починає іншу;
  // 0.85 / 0.8 — довгий / короткий спільний корінь; 0.7 — одруківка.
  function quality(q, s) {
    if (q === s) { return 1; }
    if (/^\d+$/.test(q) || /^\d+$/.test(s)) { return 0; }
    var shortOne = q.length <= s.length ? q : s;
    var longOne = shortOne === q ? s : q;
    var p = commonPrefix(q, s);
    // Спільний корінь: коротша основа — початок довшої або майже вся збігається,
    // а довша не надто довга (інакше «перелом» ловив би «перелічених»).
    if (p >= 4 && p === shortOne.length && p / longOne.length >= 0.6) { return 0.9; }
    if (p >= 5 && p / shortOne.length >= 0.8 && p / longOne.length >= 0.6) { return p >= 6 ? 0.85 : 0.8; }
    if (shortOne.length >= 6 && longOne.length - shortOne.length <= 1 && distance(q, s) <= 1) {
      return 0.7;
    }
    return 0;
  }

  function asText(v) {
    if (Array.isArray(v)) { return v.join(' '); }
    return String(v || '');
  }

  var FIELDS = [
    { key: 'keywords', label: 'ключові слова', weight: 3 },
    { key: 'title', label: 'назва', weight: 2.5 },
    { key: 'meta', label: 'реквізити документа', weight: 1.5 },
    { key: 'text', label: 'текст джерела', weight: 1 }
  ];

  function fieldText(f, key) {
    if (key === 'keywords') { return asText(f.keywords); }
    if (key === 'title') { return asText(f.title) + ' ' + asText(f.discipline); }
    if (key === 'meta') { return asText(f.document) + ' ' + asText(f.locator); }
    return asText(f.text) + ' ' + asText(f.quote);
  }

  function buildIndex(data) {
    var fragments = data && Array.isArray(data.fragments) ? data.fragments : [];
    var docs = fragments.map(function (f, order) {
      var stems = {};
      FIELDS.forEach(function (fl) {
        terms(fieldText(f, fl.key)).forEach(function (t) {
          var e = stems[t.stem] || (stems[t.stem] = { weight: 0, fields: [] });
          if (fl.weight > e.weight) { e.weight = fl.weight; }
          if (e.fields.indexOf(fl.label) < 0) { e.fields.push(fl.label); }
        });
      });
      return { fragment: f, order: order, stems: stems, keys: Object.keys(stems) };
    });
    return { docs: docs };
  }

  function round(x) { return Math.round(x * 100) / 100; }

  function scoreDoc(doc, qterms, strongTotal) {
    var score = 0;
    var strongHit = 0;
    var hits = [];
    var missing = [];
    var lit = {};
    qterms.forEach(function (t) {
      var best = null;
      var where = {};
      doc.keys.forEach(function (s) {
        var q = quality(t.stem, s);
        if (!q) { return; }
        var e = doc.stems[s];
        var val = q * e.weight + 0.2 * (e.fields.length - 1);
        if (!best || val > best.val) { best = { val: val, q: q }; }
        e.fields.forEach(function (name) { where[name] = true; });
        // Підсвічуємо лише впевнені збіги (короткий спільний корінь — ні).
        if (!t.weak && q !== 0.8) { lit[s] = true; }
      });
      if (best) {
        score += (t.weak ? 0.25 : 1) * best.val;
        if (!t.weak) { strongHit++; }
        var place = where['текст джерела'] ? 'text'
          : (where['назва'] || where['реквізити документа'] ? 'title' : 'keywords');
        hits.push({ word: t.word, weak: t.weak, exact: best.q === 1, place: place });
      } else if (!t.weak) {
        missing.push(t.word);
      }
    });
    return {
      fragment: doc.fragment,
      order: doc.order,
      score: round(score),
      strongHit: strongHit,
      strongTotal: strongTotal,
      coverage: strongTotal ? strongHit / strongTotal : 0,
      level: strongHit === strongTotal ? 'full' : 'partial',
      hits: hits,
      missing: missing,
      litStems: Object.keys(lit)
    };
  }

  var MIN_SCORE = 2;

  /*
   * Результат пошуку:
   *  status 'empty'   — порожній запит;
   *  status 'general' — лише загальні слова, треба уточнити;
   *  status 'none'    — джерела немає;
   *  status 'partial' — точного джерела немає, results — найближчі фрагменти;
   *  status 'found'   — є повний збіг, results — від найкращого.
   */
  function search(index, query) {
    var qterms = uniqueTerms(terms(query));
    if (!qterms.length) { return { status: 'empty', terms: [] }; }
    var strong = qterms.filter(function (t) { return !t.weak; });
    if (!strong.length) { return { status: 'general', terms: qterms }; }
    var results = index.docs
      .map(function (d) { return scoreDoc(d, qterms, strong.length); })
      .filter(function (r) {
        return r.strongHit >= 1 && (r.coverage >= 0.5 || r.strongHit >= 2) && r.score >= MIN_SCORE;
      })
      .sort(function (a, b) {
        var fa = a.level === 'full' ? 1 : 0;
        var fb = b.level === 'full' ? 1 : 0;
        return (fb - fa) || (b.score - a.score) || (b.coverage - a.coverage) || (a.order - b.order);
      });
    if (!results.length) {
      return { status: 'none', terms: qterms, missing: strong.map(function (t) { return t.word; }) };
    }
    return {
      status: results[0].level === 'full' ? 'found' : 'partial',
      terms: qterms,
      results: results
    };
  }

  // Розбиває текст на шматки для підсвітки: [{ text, hit }].
  function parts(text, litStems) {
    var set = new Set(litStems || []);
    var any = Boolean(litStems && litStems.length);
    var out = [];
    var src = String(text || '');
    var re = /[\p{L}\p{N}'’ʼ]+/gu;
    var last = 0;
    var m;
    while ((m = re.exec(src)) !== null) {
      var w = clean(m[0]);
      var hit = any && !STOP.has(w) && set.has(stem(w));
      if (hit) {
        if (m.index > last) { out.push({ text: src.slice(last, m.index), hit: false }); }
        out.push({ text: m[0], hit: true });
        last = m.index + m[0].length;
      }
    }
    if (last < src.length) { out.push({ text: src.slice(last), hit: false }); }
    return out;
  }

  var REQUIRED = ['id', 'title', 'document', 'version', 'locator', 'checked', 'text', 'explanation', 'keywords'];

  // Перевіряє sources.json і повертає список проблем (порожній — усе добре).
  function validate(data) {
    if (!data || !Array.isArray(data.fragments)) { return ['У файлі немає списку «fragments».']; }
    var problems = [];
    if (!data.fragments.length) { problems.push('Список «fragments» порожній.'); }
    var ids = {};
    data.fragments.forEach(function (f, i) {
      var name = 'Фрагмент ' + (i + 1) + (f && f.id ? ' (' + f.id + ')' : '');
      REQUIRED.forEach(function (k) {
        var v = f ? f[k] : undefined;
        var empty = v === undefined || v === null ||
          (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length);
        if (empty) { problems.push(name + ': немає поля «' + k + '».'); }
      });
      if (f && f.id) {
        if (ids[f.id]) { problems.push(name + ': id повторюється.'); }
        ids[f.id] = true;
      }
    });
    return problems;
  }

  return {
    version: '1.0.0',
    terms: terms,
    stem: stem,
    quality: quality,
    buildIndex: buildIndex,
    search: search,
    parts: parts,
    validate: validate
  };
}));
