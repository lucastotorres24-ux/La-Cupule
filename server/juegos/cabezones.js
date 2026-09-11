// ── "No haga sino Jogar" para el servidor — envoltorio delgado sobre la física de fisica.js ──
//
// La física en sí (fisica.js) no cambia nada acá — sigue siendo la misma copia exacta de lo que
// corre en el navegador. Lo único nuevo es adaptar su forma "izquierda/derecha, 2 jugadores fijos"
// a la forma genérica que usa el gestor de salas del servidor (un mapa de entradas por jugadorId).
// El primero en unirse a la sala juega de lado izquierdo, el segundo de lado derecho — igual que
// "jugador1"/"jugador2" en la versión anterior basada en Firebase.
const F = require("./fisica.js");

const ENTRADA_VACIA = { izq: false, der: false, saltar: false, patear: false };
const MAX_JUGADORES = 2;

function crearEstado(jugadores, config) {
  return F.crearEstadoPartidoCabezones(config || undefined);
}

function avanzar(estado, dt, entradasPorId, jugadores) {
  const idIzq = jugadores[0] && jugadores[0].id;
  const idDer = jugadores[1] && jugadores[1].id;
  const entradaIzq = (idIzq && entradasPorId[idIzq]) || ENTRADA_VACIA;
  const entradaDer = (idDer && entradasPorId[idDer]) || ENTRADA_VACIA;
  return F.avanzarPartidoCabezones(estado, dt, entradaIzq, entradaDer);
}

function estaTerminado(estado) {
  return estado.fase === "terminado";
}

// Se necesitan los 2 jugadores para arrancar — con solo uno no hay partido.
function puedeEmpezar(jugadores) {
  return jugadores.length === MAX_JUGADORES;
}

module.exports = { crearEstado, avanzar, estaTerminado, puedeEmpezar, maxJugadores: MAX_JUGADORES };
