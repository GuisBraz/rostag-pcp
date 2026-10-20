// Popula os emuladores (firestore + auth) com uma equipe de teste para o modo
// ?emulador=1. Rode com os emuladores ligados: node scripts/semear-emulador.mjs
// As contas usam a senha de teste do projeto; nada disso toca a produção.
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';

const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake';
const SENHA = 'teste-' + 'local-123';
const PESSOAS = [
  ['gerente', 'Gerência Teste', 'gerente_pcp'], ['gerente2', 'Gerente Dois', 'gerente_pcp'], ['gp', 'GP Teste', 'gp'], ['tecnico', 'Técnico Teste', 'tecnico'],
  ['cq', 'Qualidade Teste', 'cq'], ['progu', 'Programador Usinagem', 'prog_usinagem']
];

async function conta(apelido, nome) {
  const r = await fetch(AUTH, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: apelido + '@teste.local', password: SENHA, displayName: nome, returnSecureToken: true }) });
  const j = await r.json();
  if (!j.localId) throw new Error('signUp ' + apelido + ': ' + JSON.stringify(j.error));
  return j.localId;
}

const env = await initializeTestEnvironment({ projectId: 'demo-rostag', firestore: { host: '127.0.0.1', port: 8080 } });
const uids = {};
for (const [ap, nome] of PESSOAS) uids[ap] = await conta(ap, nome);

const agora = new Date();
const iso = (dias) => new Date(agora.getTime() + dias * 86400000).toISOString();
const dia = (dias) => iso(dias).slice(0, 10);

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const E = 'EQT';
  await db.doc('equipes/' + E).set({ nome: 'Equipe Teste', coordenadorUid: uids.gerente, criadoPorUid: uids.gerente, criadoEm: iso(-200), papeisMigrados: true });
  await db.doc('equipeSegredos/' + E).set({ senhaHash: 'x' });
  for (const [ap, nome, papel] of PESSOAS) {
    await db.doc('usuarios/' + uids[ap]).set({ nome, equipesCriadas: ap === 'gerente' ? 1 : 0 });
    await db.doc('usuarios/' + uids[ap] + '/minhasEquipes/' + E).set({ papel, nomeEquipe: 'Equipe Teste', entrouEm: iso(-200) });
    await db.doc('equipes/' + E + '/membros/' + uids[ap]).set({ nome, email: ap + '@teste.local', papel, entrouEm: iso(-200) });
  }
  const proj = { commessa: '2026-101', descricao: 'Skid de bombeamento', cliente: 'Petro Teste', tipo: 'fabricacao', status: 'ativo',
    gpUid: uids.gp, responsavelUid: uids.tecnico, solicitacao: dia(-120), pcpInicio: dia(-100), pcpFim: dia(-40), prodFim: dia(40),
    entrega: dia(60), paralisacoes: [], checklist: [], criadoEm: iso(-120), criadoPorUid: uids.gp };
  await db.doc('equipes/' + E + '/projetos/p1').set(proj);
  const base = { projetoId: 'p1', commessa: '2026-101', cliente: 'Petro Teste', descricaoProjeto: 'Skid de bombeamento',
    gpUid: uids.gp, tecnicoUid: uids.tecnico, rev: '0', pesoUnit: 120, criadoPorUid: uids.tecnico, atualizadoEm: iso(-150) };
  const fin = (d) => ({ finalizadoPorUid: uids.cq, finalizadoPorNome: 'Qualidade Teste', finalizadoEm: iso(d) });
  const ops = [];
  for (let i = 1; i <= 24; i++) {
    const area = i % 3 ? 'caldeiraria' : 'usinagem';
    const o = { ...base, area, numero: '0205' + String(2500 + i), desenho: '16095' + (60 + i), posicao: String(i), descricao: ['SUPORTE', 'CHAPA BASE', 'EIXO', 'FLANGE', 'TAMPA'][i % 5],
      qtd: 1 + (i % 4), pesoTotal: 120 * (1 + (i % 4)), status: 'aberta', criadoEm: iso(-170 + i * 3) };
    // histórico: aprovadas espalhadas pelos últimos meses
    if (i <= 12) Object.assign(o, { status: 'aprovada' }, fin(-160 + i * 12));
    if (i === 6) Object.assign(o, { status: 'desvio', retrabalhoDesde: iso(-95) }, fin(-80));
    ops.push(o);
  }
  for (let i = 0; i < ops.length; i++) await db.doc('equipes/' + E + '/ops/op' + (i + 1)).set(ops[i]);
  await db.doc('equipes/' + E + '/rncs/rOld').set({
    numero: '014', produto: 'SUPORTE', desenho: '1609566', rev: '0', commessa: '2026-101', op: '02052506', qtd: '3', tag: '', item: '6',
    setor: { usinagem: true, caldeiraria: false, pintura: false, fornecedor: false, outros: false }, setorOutros: '', procedencia: 'interno',
    descricao: 'Furo de fixação deslocado 3 mm.', inspetor: 'Qualidade Teste', qtdNc: '1', data: dia(-95),
    disposicao: 'Aceitar com desvio após consulta à engenharia.', dispResponsavel: 'Engenharia', dispData: dia(-90),
    reOp: '', reInspetor: 'Qualidade Teste', reData: dia(-80), reResultado: 'desvio', reResponsavel: 'Gerência', observacoes: '',
    situacao: 'encerrada', atualizadoEm: iso(-80), opId: 'op6', projetoId: 'p1', area: 'usinagem', gpUid: uids.gp, tecnicoUid: uids.tecnico,
    criadoPorUid: uids.cq, criadoPorNome: 'Qualidade Teste', criadoEm: iso(-95) });
  await db.doc('equipes/' + E + '/ops/op6').update({ rncAtualId: 'rOld', rncNumero: '014' });
});
await env.cleanup();
console.log('Equipe Teste criada com', PESSOAS.map((p) => p[0] + '@teste.local').join(', '));
