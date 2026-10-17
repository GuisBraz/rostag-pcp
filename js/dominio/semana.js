/* ---------------------------------------------------------------------------
   Semana das notificações: de segunda a domingo. Toda segunda a lista vira —
   o que é da semana anterior expira, e os alertas do Sistema que continuam
   valendo voltam como não lidos.
--------------------------------------------------------------------------- */
import { parse, addDias } from '../nucleo/fmt.js';

// Segunda-feira da semana do dia (AAAA-MM-DD).
export function inicioSemana(dia) {
  const d = parse(dia);
  const desdeSegunda = (d.getDay() + 6) % 7;   // domingo = 6
  return addDias(dia, -desdeSegunda);
}

// Instante (ISO, UTC) da segunda 00:00 local — para comparar com criadoEm.
export function instanteInicioSemana(dia) {
  return parse(inicioSemana(dia)).toISOString();
}

// Notificação gravada (criadoEm ISO) ainda vale nesta semana?
export function daSemana(criadoEm, dia) {
  return !!criadoEm && String(criadoEm) >= instanteInicioSemana(dia);
}

// Chave do estado de um alerta do Sistema nesta semana, nesta equipe.
export function chaveAlerta(semana, equipeId, alertaId) {
  return (semana + '_' + (equipeId || '-') + '_' + alertaId).replace(/[^\w:.-]+/g, '_').slice(0, 300);
}
