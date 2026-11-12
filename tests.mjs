// Автотести пошуку. Запуск: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const Poshuk = require('./search.js');
const data = JSON.parse(readFileSync(join(here, 'sources.json'), 'utf8'));
const index = Poshuk.buildIndex(data);

function first(query) {
  const r = Poshuk.search(index, query);
  return r.status === 'found' ? r.results[0].fragment.id : r.status;
}

function nearest(query) {
  const r = Poshuk.search(index, query);
  return r.status === 'partial' ? r.results[0].fragment.id : r.status;
}

test('sources.json: три фрагменти з джерелом, версією, текстом і поясненням', () => {
  assert.deepEqual(Poshuk.validate(data), []);
  assert.equal(data.fragments.length, 3);
  for (const f of data.fragments) {
    assert.match(f.checked, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(f.version.length > 5, f.id + ': версія документа');
  }
});

test('Запит 1 «Як зупинити сильну кровотечу з ноги?» → наказ МОЗ № 441, повний збіг', () => {
  const r = Poshuk.search(index, 'Як зупинити сильну кровотечу з ноги?');
  assert.equal(r.status, 'found');
  assert.equal(r.results.length, 1);
  assert.equal(r.results[0].fragment.id, 'krovotecha');
  assert.equal(r.results[0].level, 'full');
});

test('Запит 2 «Коли можна стріляти без попередження?» → ст. 46, поруч ст. 43', () => {
  const r = Poshuk.search(index, 'Коли можна стріляти без попередження?');
  assert.equal(r.status, 'found');
  assert.equal(r.results[0].fragment.id, 'vohnepalna');
  assert.equal(r.results[0].level, 'full');
  assert.equal(r.results[1].fragment.id, 'prymus');
  assert.equal(r.results[1].level, 'partial');
});

test('Запит 3 «Як надати допомогу при опіку?» → джерела немає', () => {
  const r = Poshuk.search(index, 'Як надати допомогу при опіку?');
  assert.equal(r.status, 'none');
  assert.deepEqual(r.missing, ['опіку']);
});

test('Синоніми, номери статей і одруківки', () => {
  assert.equal(first('турнікет'), 'krovotecha');
  assert.equal(first('жгут на коліно'), 'krovotecha');
  assert.equal(first('кравотеча'), 'krovotecha');
  assert.equal(first('441'), 'krovotecha');
  assert.equal(first('гучномовець'), 'prymus');
  assert.equal(first('Чи можна застосувати силу до вагітної?'), 'prymus');
  assert.equal(first('ст. 43'), 'prymus');
  assert.equal(first('стрільба у вибухонебезпечному місці'), 'vohnepalna');
  assert.equal(first('ст. 46'), 'vohnepalna');
});

test('Загальні слова самі нічого не знаходять', () => {
  assert.equal(first('допомога поліцейського'), 'general');
  assert.equal(first('надати допомогу'), 'general');
  assert.equal(first('Як лікувати перелом?'), 'none');
  assert.equal(first(''), 'empty');
  assert.equal(first('  ?! '), 'empty');
});

test('Частковий збіг: «точного джерела немає» і чого саме бракує', () => {
  const r = Poshuk.search(index, 'кровотеча при опіку');
  assert.equal(r.status, 'partial');
  assert.equal(r.results[0].fragment.id, 'krovotecha');
  assert.deepEqual(r.results[0].missing, ['опіку']);
  assert.equal(nearest('чистка зброї'), 'vohnepalna');
  assert.equal(nearest('скільки тримати джгут'), 'krovotecha');
});

test('Випадкові збіги в тексті не видаються за джерело', () => {
  for (const q of ['що робити при переломі руки', 'як перевірити пульс', 'травма шиї',
    'службовий собака', 'перевірка документів', 'дихальні шляхи', 'затримання особи',
    'сортування постраждалих', 'евакуація пораненого', 'серцево-легенева реанімація', 'свідомість']) {
    assert.equal(first(q), 'none', q);
  }
});

test('Підсвітка знайдених слів у тексті джерела', () => {
  const r = Poshuk.search(index, 'джгут');
  const text = r.results[0].fragment.text.join(' ');
  const lit = Poshuk.parts(text, r.results[0].litStems).filter((p) => p.hit).map((p) => p.text.toLowerCase());
  assert.ok(lit.includes('джгут'));
  assert.equal(lit.join('').length > 0, true);
});

test('Той самий запит — той самий результат', () => {
  const a = JSON.stringify(Poshuk.search(index, 'попередження голосом'));
  const b = JSON.stringify(Poshuk.search(index, 'попередження голосом'));
  assert.equal(a, b);
});

test('У проєкті немає латинської літери «' + String.fromCharCode(90) + '»', () => {
  const bad = String.fromCharCode(122);
  for (const name of readdirSync(here)) {
    assert.ok(!name.toLowerCase().includes(bad), 'назва файлу: ' + name);
    if (/\.(html|css|js|mjs|json|webmanifest|md)$/.test(name)) {
      const body = readFileSync(join(here, name), 'utf8').toLowerCase();
      assert.ok(!body.includes(bad), 'вміст файлу: ' + name);
    }
  }
});
