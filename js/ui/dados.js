/* ---------------------------------------------------------------------------
   Dados do app — exportar backup (JSON/CSV), importar e apagar tudo.
--------------------------------------------------------------------------- */
import { estado } from '../estado.js';
import { hoje, br, csvCampo } from '../nucleo/fmt.js';
import { T, plural, STATUS_LABEL, SIT_LABEL } from '../i18n/index.js';
import { VERSAO } from '../dominio/constantes.js';
import * as Projeto from '../dominio/projeto.js';
import * as Cronograma from '../dominio/cronograma.js';
import * as Auth from '../dados/auth.js';
import { $, registrarAcoes } from './dom.js';
import { confirmar } from './modal.js';
import { toast } from './toast.js';
import { persistir, redesenhar } from './app.js';
import { irPara } from './rota.js';

const TAMANHO_MAX_IMPORT = 10 * 1024 * 1024;

function baixar(conteudo, nome, mime) {
  const blob = new Blob([conteudo], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}
function nomeArquivo(ext) {
  const equipe = (Auth.equipeAtualNome() || 'equipe').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').toLowerCase();
  return 'rostag-pcp-' + equipe + '-' + hoje() + '.' + ext;
}

export function exportarJSON() {
  baixar(JSON.stringify({ schema: 4, app: 'ROSTAG PCP', versao: VERSAO, equipe: Auth.equipeAtualNome(),
    salvoEm: new Date().toISOString(), projetos: estado.projetos }, null, 2), nomeArquivo('json'), 'application/json');
  toast(T('t.backupExportado'));
}

function exportarCSV() {
  const cab = T('csv.cab');
  const linhas = estado.projetos.map(function (p) {
    const c = Cronograma.calcular(p);
    return [p.commessa, p.cliente, p.descricao, p.tipoServico, p.gp, p.om,
      br(p.dataSolicitacao), br(p.pcpInicio), br(p.pcpFim), br(c.fimPrevisto), SIT_LABEL(Projeto.situacaoPcp(p)),
      br(p.entrega), STATUS_LABEL(Projeto.status(p)), Projeto.progresso(p), br(p.concluidoEm),
      Projeto.ciclo(p) == null ? '' : Projeto.ciclo(p), Projeto.diasParadoTotal(p), p.reagendamentos.length
    ].map(csvCampo).join(';');
  });
  // BOM + ponto e vírgula: abre certo no Excel em português
  baixar('﻿' + [cab.map(csvCampo).join(';')].concat(linhas).join('\r\n'), nomeArquivo('csv'), 'text/csv;charset=utf-8');
  toast(T('t.csvExportado'));
}

function importarJSON(ev) {
  const input = ev.target;
  const file = input.files && input.files[0];
  input.value = '';
  if (!file || !Auth.souGPouCoordenador()) return;
  if (file.size > TAMANHO_MAX_IMPORT) { toast(T('t.importGrande'), { tipo: 'erro' }); return; }
  const leitor = new FileReader();
  leitor.onload = function () {
    let novos;
    try {
      novos = Projeto.migrar(JSON.parse(leitor.result));
      if (!novos.length) throw new Error('arquivo sem projetos');
    } catch (e) {
      toast(T('t.importErro'), { tipo: 'erro', ms: 6000 });
      return;
    }
    // ids repetidos no arquivo viram projetos distintos
    const vistos = {};
    novos.forEach(function (p) { if (vistos[p.id]) p.id = Projeto.novoId(); vistos[p.id] = true; });
    confirmar(T('q.importar', plural(novos.length, 'lista.projeto', 'lista.projetos'), estado.projetos.length),
      { titulo: T('cfg.impJson'), textoOk: T('q.importarOk'), perigo: true }).then(function (ok) {
      if (!ok) return;
      const backup = estado.projetos;
      estado.projetos = novos;
      irPara('projetos');
      redesenhar();
      toast(T('t.importado', plural(novos.length, 't.importadoU', 't.importadoM')), { acao: { label: T('btn.desfazer'), fn: function () {
        estado.projetos = backup; redesenhar(); persistir().catch(function () {});
      } } });
      persistir().catch(function () {});
    });
  };
  leitor.readAsText(file);
}

function apagarTudo() {
  if (!Auth.souGPouCoordenador() || !estado.projetos.length) return;
  confirmar(T('cfg.apagarTudoConfirm'), { titulo: T('cfg.apagarTudo'), textoOk: T('cfg.apagarTudo'), perigo: true }).then(function (ok) {
    if (!ok) return;
    const backup = estado.projetos;
    estado.projetos = [];
    redesenhar();
    toast(T('cfg.apagarTudoFeito'), { acao: { label: T('btn.desfazer'), fn: function () {
      estado.projetos = backup; redesenhar(); toast(T('cfg.apagarTudoDesfeito')); persistir().catch(function () {});
    } } });
    persistir().catch(function () {});
  });
}

registrarAcoes({
  exportarJSON: exportarJSON,
  exportarCSV: exportarCSV,
  abrirImportador: function () { $('import-file').click(); },
  importarJSON: importarJSON,
  apagarTudo: apagarTudo
});
