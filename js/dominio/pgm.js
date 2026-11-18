/* ---------------------------------------------------------------------------
   PGM — programa de corte da caldeiraria (relatório de nesting do Plasma ou
   do Oxicorte). O técnico sobe o PDF; o site lê o nº do programa (CNC), a
   máquina, o tempo (× quantidade de chapas), a chapa, o peso, a commessa e o
   trabalho. Na Carga Máquina (cortes) o PGM vai para a fila da máquina:
   aguardando programação → na fila → cortando → cortado (sai da carga).
   Controle só pelo nº do PGM (não liga às OPs). Sem Firebase.
--------------------------------------------------------------------------- */
import { chave, texto } from './planilha.js';
import { linhasDaPagina } from './opPdf.js';

export const LIMITES = { numero: 30, texto: 120, curto: 60 };

// Valor na mesma linha depois do rótulo (rótulo comparado sem acento/espaço).
function aposRotulo(linhas, rotulo) {
  for (const l of linhas) {
    for (let i = 0; i < l.partes.length; i++) {
      const k = chave(l.partes[i]);
      if (k === rotulo) return l.partes.slice(i + 1).join(' ');
      if (k.indexOf(rotulo) === 0 && k.length > rotulo.length) return texto(l.partes[i].slice(l.partes[i].search(/[:]/) + 1 || rotulo.length));
    }
  }
  return '';
}
function primeiro(re, s) { const m = String(s || '').match(re); return m ? m : null; }
function num(s) { const v = Number(String(s == null ? '' : s).replace(/\s/g, '').replace(',', '.')); return isFinite(v) ? v : null; }

// "00:22:01.36" → minutos (22,02)
export function minutosDoTempo(s) {
  const m = primeiro(/(\d{1,3}):(\d{2}):(\d{2})(?:[.,](\d+))?/, s);
  if (!m) return null;
  return Math.round((+m[1] * 60 + +m[2] + (+m[3] + (m[4] ? Number('0.' + m[4]) : 0)) / 60) * 100) / 100;
}
// Máquina pelo nome do relatório: "…PLASMA…" → plasma; "…OXICORTE…" → oxicorte
export function maquinaDoTexto(s) {
  const k = chave(s);
  if (k.indexOf('PLASMA') >= 0) return 'plasma';
  if (k.indexOf('OXICORTE') >= 0 || k.indexOf('OXICORT') >= 0) return 'oxicorte';
  return '';
}
// A máquina cadastrada combina com a do PGM? (pelo nome ou pelo tipo)
export function daMaquina(pgm, m) {
  if (!pgm || !m || !pgm.maquina) return false;
  return maquinaDoTexto((m.nome || '') + ' ' + (m.tipo || '')) === pgm.maquina;
}

/**
 * Páginas do PDF (itens {x, y, s}) → { ok, motivo?, numero, maquinaTexto, maquina,
 * tempoMin, quantidade, horas, chapa, dimensoes, material, peso, commessa, trabalho, data }
 */
export function lerPgm(paginas, nomeArquivo) {
  const linhas = linhasDaPagina((paginas || [])[0] || []);
  const tudo = linhas.map(function (l) { return l.partes.join(' '); }).join('\n');
  const r = { numero: '', maquinaTexto: '', maquina: '', tempoMin: null, quantidade: 1, horas: 0, chapa: '', dimensoes: '', material: '', peso: null, commessa: '', trabalho: '', data: '' };
  // nº do programa: rótulo CNC; senão o nome do arquivo ("PGM 0X0989.pdf")
  const cnc = aposRotulo(linhas, 'CNC');
  const mNum = primeiro(/^\s*([0-9A-Z][0-9A-Z.\-]{2,})/i, cnc) || primeiro(/PGM\s*[-_ ]?\s*([0-9A-Z][0-9A-Z.\-]{2,})/i, nomeArquivo);
  r.numero = mNum ? mNum[1].toUpperCase().slice(0, LIMITES.numero) : '';
  // dimensões da chapa (na linha do CNC: 4000 x 1500 x 12.7)
  const dims = primeiro(/(\d{2,5}(?:[.,]\d+)?)\s*x?\s+x?\s*(\d{2,5}(?:[.,]\d+)?)\s*x?\s+x?\s*(\d{1,3}(?:[.,]\d+)?)/i, cnc.replace(r.numero, ' '));
  if (dims) r.dimensoes = dims[1] + ' x ' + dims[2] + ' x ' + dims[3];
  const data = primeiro(/(\d{2}\/\d{2}\/\d{4})/, tudo);
  r.data = data ? data[1] : '';
  // chapa: depois de "Ref" ou, quando o rótulo fica noutra linha, o que vem antes de "Quantidade"
  let chapa = texto(aposRotulo(linhas, 'REF').replace(/quantidade.*$/i, ''));
  if (!chapa) {
    const lq = linhas.find(function (l) { return l.partes.some(function (x) { return chave(x) === 'QUANTIDADE'; }); });
    if (lq) chapa = texto(lq.partes.slice(0, lq.partes.findIndex(function (x) { return chave(x) === 'QUANTIDADE'; })).filter(function (x) { return chave(x) !== 'REF'; }).join(' '));
  }
  r.chapa = chapa.slice(0, LIMITES.texto);
  const qtd = primeiro(/(\d+)/, aposRotulo(linhas, 'QUANTIDADE'));
  r.quantidade = qtd && +qtd[1] > 0 ? Math.min(999, +qtd[1]) : 1;
  r.trabalho = texto(aposRotulo(linhas, 'TRABALHO')).slice(0, LIMITES.curto);
  const com = primeiro(/(\d{4}-\d{2,4}[A-Z]?(?:\s*-\s*REV\.?\s*\d+)?)/i, aposRotulo(linhas, 'COMMESSA')) || primeiro(/\b(\d{4}-\d{3}[A-Z]?)\b/, tudo);
  r.commessa = com ? texto(com[1]).slice(0, LIMITES.curto) : '';
  // máquina: o texto até o rótulo seguinte ("Peso")
  const maq = aposRotulo(linhas, 'MAQUINA').replace(/\s*Peso.*$/i, '');
  r.maquinaTexto = texto(maq || (primeiro(/^.*(?:PLASMA|OXICORTE).*$/im, tudo) || [''])[0]).slice(0, LIMITES.texto);
  r.maquina = maquinaDoTexto(r.maquinaTexto);
  r.material = texto(aposRotulo(linhas, 'MATERIAL').replace(/\s+X\s+[\d.,]+\s*$/i, '')).slice(0, LIMITES.curto);
  const peso = primeiro(/([\d.,]+)\s*kg/i, aposRotulo(linhas, 'PESO')) || primeiro(/([\d.,]+)\s*kg/i, tudo);
  r.peso = peso ? num(peso[1]) : null;
  // tempo total do programa (por chapa) × quantidade de chapas
  r.tempoMin = minutosDoTempo(aposRotulo(linhas, 'TEMPOTOTAL'));
  r.horas = r.tempoMin != null ? Math.round(r.tempoMin * r.quantidade / 60 * 1000) / 1000 : 0;
  if (!r.numero) return Object.assign(r, { ok: false, motivo: 'semNumero' });
  if (r.tempoMin == null) return Object.assign(r, { ok: false, motivo: 'semTempo' });
  return Object.assign(r, { ok: true });
}

// Situação do PGM: 'aguardando' | 'fila' | 'cortando' | 'cortado'
export function situacao(pgm, naFila) {
  if (!pgm) return null;
  if (pgm.situacao === 'cortado') return 'cortado';
  if (pgm.situacao === 'cortando') return 'cortando';
  return naFila ? 'fila' : 'aguardando';
}
// Id do documento: um PGM por número dentro do projeto (subir de novo atualiza).
export function idPgm(projetoId, numero) { return String(projetoId) + '_' + chave(numero); }
// O PGM como "OP" para a fila/agenda da máquina (id 'pgm:<id>').
export const PREFIXO = 'pgm:';
export function ehPgm(opId) { return String(opId || '').indexOf(PREFIXO) === 0; }
export function comoOp(pgm) {
  return {
    id: PREFIXO + pgm.id, pgmId: pgm.id, ehPgm: true, pgm: pgm, numero: pgm.numero, commessa: pgm.commessa || '', projetoId: pgm.projetoId,
    descricao: [pgm.chapa, pgm.dimensoes].filter(Boolean).join(' · '), desenho: '', area: 'caldeiraria',
    horasPrevistas: Number(pgm.horas) || 0, operacoes: [], status: 'aberta', qtd: pgm.quantidade, pesoTotal: pgm.peso,
    encerradaEm: pgm.situacao === 'cortado' ? (pgm.cortadoEm || 'x') : null
  };
}
