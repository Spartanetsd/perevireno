/* Перевірено — інтерфейс. Пошук — у search.js, база — у sources.json. */
(function () {
  'use strict';

  var P = window.Poshuk;
  var EXAMPLES = [
    'Як зупинити сильну кровотечу з ноги?',
    'Коли можна стріляти без попередження?',
    'Чи можна застосувати силу до вагітної?',
    'Як надати допомогу при опіку?'
  ];

  var state = { data: null, index: null };

  function byId(id) { return document.getElementById(id); }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) { n.className = cls; }
    if (text !== undefined && text !== null) { n.textContent = text; }
    return n;
  }

  function txt(s) { return document.createTextNode(s); }

  function asList(v) {
    if (Array.isArray(v)) { return v; }
    return v ? [String(v)] : [];
  }

  function date(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? m[3] + '.' + m[2] + '.' + m[1] : String(iso || '');
  }

  function quoted(words) {
    return words.map(function (w) { return '«' + w + '»'; }).join(', ');
  }

  function plural(n, one, few, many) {
    var a = n % 10;
    var b = n % 100;
    if (a === 1 && b !== 11) { return one; }
    if (a >= 2 && a <= 4 && (b < 12 || b > 14)) { return few; }
    return many;
  }

  // Нерозривний пробіл перед тире й після «№», щоб рядок не починався з тире.
  function typo(s) {
    return String(s || '')
      .replace(/ — /g, '\u00A0— ')
      .replace(/№ /g, '№\u00A0')
      .replace(/(\d)-([IVXLC]+)/g, '$1\u2011$2');
  }

  function reduceMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // Текст із підсвіткою знайдених слів (жовтий маркер).
  function fill(node, text, lit) {
    P.parts(typo(text), lit).forEach(function (part) {
      if (part.hit) { node.appendChild(el('mark', null, part.text)); }
      else { node.appendChild(txt(part.text)); }
    });
  }

  function stamp(checked) {
    var s = el('div', 'stamp');
    s.setAttribute('aria-hidden', 'true');
    s.appendChild(el('span', 'stamp-main', 'Перевірено'));
    s.appendChild(el('span', 'stamp-sub', date(checked)));
    return s;
  }

  // Пояснення і текст джерела — поруч.
  function pair(f, lit, verified) {
    var grid = el('div', 'pair');

    var note = el('section', 'note');
    note.appendChild(el('h3', 'panel-title', 'Пояснення'));
    var ul = el('ul', 'steps');
    asList(f.explanation).forEach(function (line) { ul.appendChild(el('li', null, typo(line))); });
    note.appendChild(ul);

    var sheet = el('section', verified ? 'sheet has-stamp' : 'sheet');
    sheet.appendChild(el('h3', 'vh', 'Текст джерела'));
    if (verified) { sheet.appendChild(stamp(f.checked)); }
    // Назва документа: акт звичайним, конкретний порядок чи стаття — жирним.
    var doc = el('p', 'doc');
    var cut = String(f.document).indexOf(' — ');
    if (cut > 0) {
      doc.appendChild(el('span', 'doc-act', typo(f.document.slice(0, cut))));
      doc.appendChild(el('span', 'doc-part', typo(f.document.slice(cut + 3))));
    } else {
      doc.appendChild(el('span', 'doc-part', typo(f.document)));
    }
    sheet.appendChild(doc);

    var req = el('dl', 'req');
    [['Версія', f.version], ['Де саме', f.locator], ['Перевірено', date(f.checked)]].forEach(function (row) {
      req.appendChild(el('dt', null, row[0]));
      req.appendChild(el('dd', null, typo(row[1])));
    });
    sheet.appendChild(req);

    var body = el('div', 'doc-text');
    asList(f.text).forEach(function (para) {
      var p = el('p');
      fill(p, para, lit);
      body.appendChild(p);
    });
    sheet.appendChild(body);

    if (f.quote) {
      var q = el('blockquote', 'quote');
      q.appendChild(el('span', 'quote-label', 'Дослівно'));
      var qp = el('p');
      fill(qp, '«' + f.quote + '»', lit);
      q.appendChild(qp);
      sheet.appendChild(q);
    }

    grid.appendChild(note);
    grid.appendChild(sheet);
    return grid;
  }

  // Чому знайдено: де саме збіглися слова запиту.
  function why(match) {
    var groups = [
      ['text', 'Підсвічено в тексті джерела: '],
      ['title', 'У назві чи реквізитах документа: '],
      ['keywords', 'За ключовими словами бази: ']
    ];
    var box = el('div', 'why');
    groups.forEach(function (g) {
      var words = match.hits.filter(function (h) { return !h.weak && h.place === g[0]; });
      if (!words.length) { return; }
      var p = el('p');
      p.appendChild(txt(g[1]));
      words.forEach(function (h, i) {
        if (i) { p.appendChild(txt(', ')); }
        p.appendChild(el('b', null, h.word));
      });
      p.appendChild(txt('.'));
      box.appendChild(p);
    });
    return box;
  }

  function partialNote(match) {
    var note = el('p', 'result-note');
    note.appendChild(txt('У цьому фрагменті немає ' + plural(match.missing.length, 'слова', 'слів', 'слів') + ' '));
    note.appendChild(el('b', null, quoted(match.missing)));
    note.appendChild(txt(', тож пояснення стосується лише знайденої частини запиту.'));
    return note;
  }

  // Інші фрагменти — розгортаються під головним.
  function moreBlock(results) {
    var box = el('div', 'more');
    box.appendChild(el('h3', null, 'Також може стосуватися'));
    results.forEach(function (r) {
      var d = el('details', 'more-item');
      d.appendChild(el('summary', null, r.fragment.title + (r.level === 'full' ? '' : ' (частковий збіг)')));
      if (r.level !== 'full') { d.appendChild(partialNote(r)); }
      d.appendChild(pair(r.fragment, r.litStems, r.level === 'full'));
      d.appendChild(why(r));
      box.appendChild(d);
    });
    return box;
  }

  // Головний знайдений фрагмент.
  function renderMatch(match) {
    var full = match.level === 'full';
    var art = el('article', 'result ' + (full ? 'found' : 'partial'));
    var head = el('header');
    head.appendChild(el('h2', 'result-title', full ? 'Знайдено джерело' : 'Точного джерела немає'));
    if (!full) {
      head.appendChild(el('p', 'result-note result-lead', 'Нижче — найближчий фрагмент із бази.'));
      head.appendChild(partialNote(match));
    }
    art.appendChild(head);
    art.appendChild(pair(match.fragment, match.litStems, full));
    art.appendChild(why(match));
    return art;
  }

  function renderFound(r) {
    var art = renderMatch(r.results[0]);
    var rest = r.results.slice(1, 3);
    if (rest.length) { art.appendChild(moreBlock(rest)); }
    return art;
  }

  function baseLinks(box) {
    state.data.fragments.forEach(function (f) {
      var b = el('button', 'link-btn', f.title);
      b.type = 'button';
      b.addEventListener('click', function () { openFragment(f); });
      box.appendChild(b);
    });
  }

  function renderNone(r) {
    var art = el('article', 'result none');
    art.appendChild(el('h2', 'result-title press', 'Джерела немає'));
    var p = el('p', 'hint');
    p.appendChild(txt('Відповіді не буде: у базі немає фрагмента зі ' +
      plural(r.missing.length, 'словом', 'словами', 'словами') + ' '));
    p.appendChild(el('b', null, quoted(r.missing)));
    p.appendChild(txt('. Сформулюйте інакше або додайте перевірений фрагмент у sources.json.'));
    art.appendChild(p);
    var more = el('div', 'more');
    more.appendChild(el('h3', null, 'У базі зараз'));
    baseLinks(more);
    art.appendChild(more);
    return art;
  }

  function renderGeneral() {
    var art = el('article', 'result general');
    art.appendChild(el('h2', 'result-title', 'Запит надто загальний'));
    art.appendChild(el('p', 'hint', 'Додайте конкретне слово, наприклад: кровотеча, джгут, попередження, вогнепальна зброя.'));
    return art;
  }

  function show(node, scroll) {
    var out = byId('out');
    out.textContent = '';
    out.appendChild(node);
    var st = out.querySelector('.stamp');
    if (st) { st.classList.add('press'); }
    if (scroll && out.scrollIntoView) {
      out.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
    }
  }

  function run(query) {
    if (!state.index) { return; }
    var r = P.search(state.index, query);
    if (r.status === 'empty') {
      show(el('p', 'hint', 'Введіть слово або питання, наприклад «джгут».'), false);
      return;
    }
    if (r.status === 'general') { show(renderGeneral(), true); return; }
    if (r.status === 'none') { show(renderNone(r), true); return; }
    show(renderFound(r), true);
  }

  function openFragment(f) {
    var art = el('article', 'result found');
    var head = el('header');
    head.appendChild(el('h2', 'result-title', f.title));
    head.appendChild(el('p', 'result-note', f.discipline ? f.discipline + '. Фрагмент із бази.' : 'Фрагмент із бази.'));
    art.appendChild(head);
    art.appendChild(pair(f, [], true));
    show(art, true);
  }

  function renderBase() {
    var box = byId('base');
    box.textContent = '';
    var n = state.data.fragments.length;
    box.appendChild(el('h2', 'base-title', 'Що є в базі'));
    box.appendChild(el('p', 'base-sub', n + ' ' + plural(n, 'фрагмент', 'фрагменти', 'фрагментів') +
      ', перевірено ' + date(state.data.checked) + '. Торкніться, щоб відкрити.'));
    var ul = el('ul', 'base-list');
    state.data.fragments.forEach(function (f) {
      var li = el('li');
      var b = el('button', 'base-item');
      b.type = 'button';
      b.appendChild(el('span', 'base-disc', f.discipline || ''));
      b.appendChild(el('span', 'base-name', f.title));
      b.appendChild(el('span', 'base-doc', String(f.document).split(' — ')[0] + '. ' + f.version + '.'));
      b.addEventListener('click', function () { openFragment(f); });
      li.appendChild(b);
      ul.appendChild(li);
    });
    box.appendChild(ul);
  }

  function renderExamples() {
    var box = byId('examples');
    EXAMPLES.forEach(function (q) {
      var b = el('button', 'chip', q);
      b.type = 'button';
      b.addEventListener('click', function () {
        byId('q').value = q;
        run(q);
      });
      box.appendChild(b);
    });
  }

  function showError(title, items) {
    var box = el('div', 'error');
    box.appendChild(el('p', null, title));
    if (items && items.length) {
      var ul = el('ul');
      items.forEach(function (t) { ul.appendChild(el('li', null, t)); });
      box.appendChild(ul);
    }
    show(box, false);
  }

  // Стан офлайн-копії.
  function setStatus(text, mode) {
    var s = byId('status');
    s.textContent = text;
    s.className = 'status' + (mode ? ' ' + mode : '');
  }

  function offlineReady() {
    if (!window.caches) { return Promise.resolve(false); }
    return caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return caches.open(k).then(function (c) { return c.match('sources.json'); });
      }));
    }).then(function (hits) { return hits.some(Boolean); }).catch(function () { return false; });
  }

  var swState = 'wait';

  function refreshStatus() {
    if (!state.data) { return; }
    if (swState === 'off') {
      setStatus(navigator.onLine ? 'Офлайн-копія недоступна в цьому перегляді' : 'Немає мережі', 'warn');
      return;
    }
    offlineReady().then(function (ready) {
      if (!navigator.onLine) {
        setStatus(ready ? 'Немає мережі: працюю з копії на пристрої' : 'Немає мережі', ready ? 'ok' : 'warn');
      } else {
        setStatus(ready ? 'Офлайн-копія готова' : 'Готую офлайн-копію…', ready ? 'ok' : '');
      }
    });
  }

  function setupOffline() {
    if (!('serviceWorker' in navigator)) { swState = 'off'; refreshStatus(); return; }
    try {
      navigator.serviceWorker.register('sw.js')
        .then(function () { return navigator.serviceWorker.ready; })
        .then(function () { swState = 'on'; refreshStatus(); })
        .catch(function () { swState = 'off'; refreshStatus(); });
    } catch (e) {
      swState = 'off';
      refreshStatus();
    }
  }

  function load() {
    fetch('sources.json', { cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) { throw new Error('HTTP ' + res.status); }
        return res.text();
      })
      .then(function (raw) {
        var data;
        try { data = JSON.parse(raw); } catch (e) {
          showError('У sources.json помилка формату JSON: ' + e.message);
          setStatus('База не відкрилась', 'warn');
          return;
        }
        var problems = P.validate(data);
        if (problems.length) {
          showError('У sources.json бракує даних:', problems);
          setStatus('База не відкрилась', 'warn');
          return;
        }
        state.data = data;
        state.index = P.buildIndex(data);
        renderBase();
        setStatus('База відкрита', '');
        refreshStatus();
      })
      .catch(function () {
        showError('Не вдалося відкрити sources.json. Відкрийте застосунок через GitHub Pages або інший вебсервер, а не як файл із пристрою.');
        setStatus('База не відкрилась', 'warn');
      });
  }

  byId('form').addEventListener('submit', function (e) {
    e.preventDefault();
    var input = byId('q');
    run(input.value);
    input.blur();
  });

  window.addEventListener('online', refreshStatus);
  window.addEventListener('offline', refreshStatus);

  renderExamples();
  load();
  setupOffline();
}());
