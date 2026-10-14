// Verificação estática do site (rode com: npm run check).
//  1. todo módulo em js/ compila;
//  2. toda ação usada no HTML ou nos templates (data-acao, data-change,
//     data-submit, data-enter) está registrada em algum registrarAcoes();
//  3. não sobrou handler inline (onclick=...), que a CSP bloquearia;
//  4. todo arquivo listado no service worker existe.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (p) => fs.readFileSync(path.join(raiz, p), 'utf8');
let erros = 0;
function falha(msg) { console.error('✖ ' + msg); erros++; }

function arquivos(dir) {
  return fs.readdirSync(path.join(raiz, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? arquivos(path.join(dir, e.name)) : (e.name.endsWith('.js') ? [path.join(dir, e.name)] : []));
}
const modulos = arquivos('js');

for (const m of modulos) {
  try { execFileSync(process.execPath, ['--check', path.join(raiz, m)], { stdio: 'pipe' }); }
  catch (e) { falha('não compila: ' + m + '\n' + e.stderr); }
}

const html = ler('index.html');
// sem comentários de bloco (a documentação cita data-acao="nome" como exemplo)
const codigo = modulos.map(ler).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
const usadas = new Set();
for (const fonte of [html, codigo]) {
  for (const m of fonte.matchAll(/data-(?:acao|change|submit|enter)="([A-Za-z]\w*)"/g)) usadas.add(m[1]);
}
const registradas = new Set();
for (const bloco of codigo.matchAll(/registrarAcoes\(\{([\s\S]*?)\n\}\);/g)) {
  for (const m of bloco[1].matchAll(/(?:^|[\s,{])([A-Za-z]\w*)\s*:/g)) registradas.add(m[1]);
}
for (const a of usadas) if (!registradas.has(a)) falha('ação sem handler: ' + a);

const inline = html.match(/\son[a-z]+="/g);
if (inline) falha('handlers inline no HTML: ' + inline.join(', '));
if (/\son[a-z]+=\\?["']/.test(codigo.replace(/\/\/.*$/gm, ''))) falha('handler inline gerado em template JS');

const sw = ler('sw.js');
const lista = sw.match(/const ARQUIVOS = \[([\s\S]*?)\];/)[1].match(/'([^']+)'/g).map((s) => s.slice(1, -1));
for (const f of lista) if (f !== './' && !fs.existsSync(path.join(raiz, f))) falha('service worker lista arquivo inexistente: ' + f);
for (const m of modulos) if (!lista.includes(m.split(path.sep).join('/'))) falha('módulo fora do cache offline (sw.js): ' + m);

console.log(erros ? `\n${erros} problema(s).` : `✔ ${modulos.length} módulos, ${usadas.size} ações, service worker ok.`);
process.exit(erros ? 1 : 0);
