import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, addDias, difDias, dataValida, br, csvCampo, iniciais, fds, dataDoInstante, horaDoInstante } from '../js/nucleo/fmt.js';
import { prefs } from '../js/nucleo/prefs.js';

test('esc escapa os cinco caracteres perigosos', () => {
  assert.equal(esc('<a href="x" onclick=\'y\'>&</a>'), '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  assert.equal(esc(null), '');
  assert.equal(esc(0), '0');
});

test('datas locais: soma, diferença e virada de mês/ano', () => {
  assert.equal(addDias('2026-01-31', 1), '2026-02-01');
  assert.equal(addDias('2026-12-31', 1), '2027-01-01');
  assert.equal(addDias('2026-03-01', -1), '2026-02-28');
  assert.equal(difDias('2026-01-01', '2026-01-31'), 30);
  assert.equal(difDias('2026-02-01', '2026-01-01'), -31);
});

test('dataValida rejeita formato errado e dia inexistente', () => {
  assert.ok(dataValida('2026-02-28'));
  assert.ok(!dataValida('2026-02-30'));
  assert.ok(!dataValida('28/02/2026'));
  assert.ok(!dataValida(null));
});

test('br segue o idioma', () => {
  prefs.idioma = 'pt';
  assert.equal(br('2026-07-04'), '04/07/2026');
  prefs.idioma = 'en';
  assert.equal(br('2026-07-04'), '07/04/2026');
  prefs.idioma = 'pt';
  assert.equal(br(null), '—');
});

test('csvCampo neutraliza fórmula e escapa separador', () => {
  assert.equal(csvCampo('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCampo('+1'), "'+1");
  assert.equal(csvCampo('a;b'), '"a;b"');
  assert.equal(csvCampo('normal'), 'normal');
});

test('iniciais e fim de semana', () => {
  assert.equal(iniciais('Guilherme dos Santos Braz'), 'GB');
  assert.equal(iniciais(''), '?');
  assert.ok(fds('2026-10-17'));   // sábado
  assert.ok(!fds('2026-10-14'));  // quarta
});

test('instante UTC vira data e hora locais', () => {
  const local = new Date(2026, 9, 14, 22, 13);   // 14/10 22:13 no fuso da máquina
  assert.equal(dataDoInstante(local.toISOString()), '2026-10-14');
  assert.equal(horaDoInstante(local.toISOString()), '22:13');
  assert.equal(dataDoInstante('lixo'), '');
});
