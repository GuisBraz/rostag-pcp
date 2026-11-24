/* ---------------------------------------------------------------------------
   Resumo da BOM guardado no projeto (p.bom): as peças com Cald/Usi, em texto
   curto, para o andamento (aba Projetos, Painel…) sair do Avanço sem ler a
   planilha inteira de cada projeto. Grava quem pode mexer na planilha
   (Gerência, GP e técnico do projeto). Projeto antigo, com a planilha subida
   antes disso, ganha o resumo na primeira vez que alguém desses o abre.
--------------------------------------------------------------------------- */
import { estado, buscarProjeto } from '../estado.js';
import { agoraIso } from '../nucleo/fmt.js';
import * as Avanco from '../dominio/avanco.js';
import * as Projeto from '../dominio/projeto.js';
import * as Producao from '../dominio/producao.js';
import * as Auth from '../dados/auth.js';
import * as DadosAvanco from '../dados/avanco.js';
import { persistir, redesenhar } from './app.js';

// Inclui, modifica e exporta planilhas: Gerência, GP do projeto e técnico do projeto.
export function podeMexer(p) {
  return !!p && (Auth.souGerente() || (!!Auth.uid() && (p.gpUid === Auth.uid() || p.responsavelUid === Auth.uid())));
}

export function resumoDe(matriz) {
  const lidos = matriz ? Avanco.itens(matriz) : null;
  return lidos ? { linhas: Avanco.compactar(Avanco.linhasDaBom(lidos.itens)), em: agoraIso() } : null;
}

export function gravar(p, matriz) {
  if (!p || !podeMexer(p)) return Promise.resolve(false);
  p.bom = resumoDe(matriz);
  redesenhar();
  return persistir().then(function () { return true; });
}
export function limpar(p) {
  if (!p || !podeMexer(p) || p.bom == null) return Promise.resolve(false);
  p.bom = null;
  redesenhar();
  return persistir().then(function () { return true; });
}

// Projeto sem o resumo (planilha subida antes): lê a planilha uma vez e grava.
const tentados = new Set();
export function conferir(p) {
  if (!p || p.bom !== undefined || tentados.has(p.id) || !podeMexer(p) || !Projeto.aberto(p)) return Promise.resolve(false);
  tentados.add(p.id);
  return DadosAvanco.lerGuardada(p.id).then(function (doc) {
    const atual = buscarProjeto(p.id);
    if (!atual || atual.bom !== undefined) return false;
    atual.bom = doc ? resumoDe(doc.matriz) : null;
    redesenhar();
    return persistir().then(function () { return true; });
  }).catch(function (e) { console.warn('resumo da BOM:', e); return false; });
}

// Gerência, ao entrar: completa os projetos abertos que ainda não têm o resumo (um de cada vez).
let rodando = false;
export function conferirTodos() {
  if (rodando || !Auth.souGerente()) return;
  rodando = true;
  const fila = estado.projetos.filter(function (p) { return p.bom === undefined && Projeto.aberto(p); }).map(function (p) { return p.id; });
  (function proximo() {
    const id = fila.shift();
    if (!id) { rodando = false; return; }
    conferir(buscarProjeto(id)).then(proximo, proximo);
  })();
}

/** Avanço do projeto para os cartões: { pct, feitas, pecas, temBom, pecasBom } (ops: as do projeto) */
// Programador: só a área dele (ele não lê as OPs da outra área)
export function avancoDe(p, ops) {
  const linhas = p && p.bom && Array.isArray(p.bom.linhas) ? Avanco.descompactar(p.bom.linhas) : null;
  if (linhas && linhas.length) {
    const r = Avanco.avancoProjeto(linhas, ops, Auth.areaProgramador() || undefined);
    return { pct: r.pct, feitas: Math.round(r.feitas), pecas: r.pecas, temBom: true, pecasBom: linhas.reduce(function (a, l) { return a + (l.q || 0); }, 0) };
  }
  const st = Producao.estatisticas(ops || []);
  return { pct: st.pct, feitas: st.pecasFeitas, pecas: st.pecas, temBom: !!(p && p.bom), pecasBom: 0 };
}
