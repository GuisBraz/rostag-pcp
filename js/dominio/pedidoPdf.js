/* ---------------------------------------------------------------------------
   PDF do pedido de compra (gerado pelo sistema da empresa) → dados. Puro cálculo.

   Cabeçalho: "PEDIDO DE COMPRAS - REAL  057577 /1", fornecedor (Razão
   Social), condição de pagamento e data de emissão, comprador.
   Itens: uma linha por item (Item, Produto, Descrição, U, Quantidade, …,
   Valor Unitário, IPI, Valor Total, Dt. Entrega, Commessa, Nº SC) e uma
   segunda linha com o resto da descrição e o último dígito da SC, que
   quebra (ex.: "03697" + "1" = SC 036971). SC e pedido têm 6 dígitos.
   Entrada: o texto de cada página com posição ([{ x, y, s }], y de cima
   para baixo), como em opPdf.js.
--------------------------------------------------------------------------- */
import { chave, texto, numero } from './planilha.js';
import { linhasDaPagina } from './opPdf.js';

const DATA = /\b(\d{2}\/\d{2}\/\d{4})\b/;
const NUM = /\d{1,3}(?:\.\d{3})*,\d+|\d+,\d+/g;
const UNIDADES = { P: 'PC', U: 'UN', K: 'KG', M: 'M', L: 'L', C: 'CJ' };

function depois(tudo, rotulo) {
  const i = tudo.toUpperCase().indexOf(rotulo.toUpperCase());
  return i < 0 ? '' : texto(tudo.slice(i + rotulo.length));
}

// Posição (x) das colunas, pelo cabeçalho da tabela de itens.
function colunas(linha) {
  const c = {};
  linha.itens.forEach(function (it) {
    const k = chave(it.s);
    if (c.descricao == null && k.indexOf('DESCRICAO') === 0) c.descricao = it.x;
    else if (c.u == null && k === 'U' && c.descricao != null) c.u = it.x;
    else if (c.commessa == null && (k.indexOf('COMESSA') === 0 || k.indexOf('COMMESSA') === 0)) c.commessa = it.x;
    else if (c.sc == null && k.indexOf('NROS') === 0) c.sc = it.x;
  });
  return c.descricao != null && c.u != null && c.commessa != null && c.sc != null ? c : null;
}

/**
 * O PDF inteiro → { ok, motivo?, numero, fornecedor, codigoFornecedor, emissao,
 *   pagamento, comprador, total, itens: [{ item, produto, descricao, unidade, qtd,
 *   valorUnit, valorTotal, entrega, commessa, sc }] }
 * motivo: 'semTexto' (só imagem) · 'naoEhPedido'
 */
export function lerPedido(paginas) {
  const comTexto = (paginas || []).filter(function (p) { return p && p.some(function (it) { return texto(it.s); }); });
  if (!comTexto.length) return { ok: false, motivo: 'semTexto' };
  const r = { ok: true, numero: '', fornecedor: '', codigoFornecedor: '', emissao: '', pagamento: '', comprador: '', total: null, itens: [] };
  comTexto.forEach(function (pg) {
    const linhas = linhasDaPagina(pg);
    let cols = null, atual = null;
    linhas.forEach(function (l, i) {
      const tudo = l.partes.join(' ');
      const k = chave(tudo);
      // cabeçalho do pedido (as letras de "PEDIDO DE COMPRAS" vêm separadas)
      if (!r.numero && k.indexOf('PEDIDODECOMPRAS') >= 0) { const m = tudo.match(/\b(\d{6})\s*\/\s*\d+/); if (m) r.numero = m[1]; }
      if (!r.fornecedor && /Social:/i.test(tudo)) {
        const s = depois(tudo, 'Social:'); r.fornecedor = texto(s.split(/Codigo:/i)[0]);
        const cod = tudo.match(/Codigo:\s*(\d+)/i); if (cod) r.codigoFornecedor = cod[1];
      }
      if (!r.emissao && k.indexOf('CONDICAODEPAGTO') === 0 && linhas[i + 1]) {
        const prox = linhas[i + 1].partes.join(' ');
        const d = prox.match(DATA); if (d) r.emissao = d[1];
        r.pagamento = texto(prox.split(DATA)[0]);
      }
      if (!r.comprador && /Responsavel\s*:/i.test(tudo)) r.comprador = depois(tudo, 'Responsavel :') || depois(tudo, 'Responsavel:');
      if (r.total == null && /Total\s+Geral/i.test(tudo)) { const n = tudo.match(NUM); if (n) r.total = numero(n[n.length - 1]); }
      // tabela de itens
      if (!cols && k.indexOf('PRODUTO') >= 0 && k.indexOf('DESCRICAO') >= 0) { cols = colunas(l); return; }
      if (!cols) return;
      const p0 = l.itens[0];
      const ehItem = l.itens.length > 3 && /^\d{2,4}$/.test(texto(p0.s)) && /^\d{6,}$/.test(texto(l.itens[1].s));
      if (ehItem) {
        const desc = [], meio = [], com = [], sc = [];
        let unidade = '';
        l.itens.slice(2).forEach(function (it) {
          if (it.x < cols.u - 4) desc.push(texto(it.s));
          else if (!unidade && it.x < cols.u + 18 && /^[A-Za-z]{1,3}$/.test(texto(it.s))) unidade = texto(it.s).toUpperCase();
          else if (it.x < cols.commessa - 6) meio.push(texto(it.s));
          else if (it.x < cols.sc - 6) com.push(texto(it.s));
          else sc.push(texto(it.s));
        });
        const juntos = meio.join(' ');
        const nums = (juntos.replace(DATA, ' ').match(NUM) || []).map(numero);
        const data = juntos.match(DATA);
        atual = {
          item: texto(p0.s), produto: texto(l.itens[1].s), descricao: desc.join(' '), unidade: UNIDADES[unidade] || unidade,
          qtd: nums[0] == null ? null : nums[0], valorUnit: nums[2] == null ? null : nums[2], valorTotal: nums.length >= 5 ? nums[4] : (nums[nums.length - 1] == null ? null : nums[nums.length - 1]),
          entrega: data ? data[1] : '', commessa: com.join(''), sc: sc.join('').replace(/\D/g, '')
        };
        r.itens.push(atual);
        return;
      }
      // segunda linha do item: o resto da descrição e o fim da SC
      if (atual && l.y - (atual.y || 0) >= 0) {
        const desc = l.itens.filter(function (it) { return it.x >= cols.descricao - 4 && it.x < cols.u - 4; }).map(function (it) { return texto(it.s); });
        const sc = l.itens.filter(function (it) { return it.x >= cols.sc - 6; }).map(function (it) { return texto(it.s); }).join('').replace(/\D/g, '');
        const outros = l.itens.filter(function (it) { return it.x < cols.descricao - 4; }).length;
        if (!outros && (desc.length || sc)) {
          if (desc.length) atual.descricao = texto(atual.descricao + ' ' + desc.join(' '));
          if (sc && atual.sc.length < 6) atual.sc += sc;
          return;
        }
        atual = null;
      }
    });
  });
  r.itens.forEach(function (it, i) { it.item = String(i + 1); it.descricao = it.descricao.slice(0, 200); it.sc = it.sc.slice(0, 6); });
  if (!r.numero || !r.itens.length) return { ok: false, motivo: 'naoEhPedido' };
  return r;
}
