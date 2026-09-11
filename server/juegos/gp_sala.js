// ── Cúpula GP para el servidor — envoltorio de sala sobre la física de gp.js ──
//
// Mismo patrón que cabezones.js: gp.js tiene la física pura (copia del navegador + la orquestación
// online), este archivo solo la conecta a la forma genérica que espera el gestor de salas.
const GP = require("./gp.js");

const MAX_JUGADORES = 8; // de sobra para el equipo de La Cúpula

function crearEstado(jugadores, config) {
  return GP.crearEstadoGPOnline(jugadores, config);
}

function avanzar(estado, dt, entradasPorId) {
  return GP.avanzarGPOnline(estado, dt, entradasPorId);
}

function estaTerminado(estado) {
  return GP.estaTerminadoGPOnline(estado);
}

function retirar(estado, jugadorId) {
  GP.retirarAutoGPOnline(estado, jugadorId);
}

// Alcanza con 1 jugador para arrancar (por si alguien quiere probar la pista solo, sin bots).
function puedeEmpezar(jugadores) {
  return jugadores.length >= 1;
}

// El estado completo trae la pista ENTERA (centerline con ~180 puntos, decoraciones, cofres, tema)
// — eso solo hace falta una vez, al arrancar (el cliente ya tiene el mismo GP_PISTAS localmente, así
// que ni siquiera necesitaría el servidor para esto, pero mandarlo una vez es más simple y a prueba
// de que algún día la pista se genere distinto). Mandar la pista entera EN CADA TICK (20 veces por
// segundo) sería tirar a la basura ancho de banda por algo que nunca cambia — así que el tick
// periódico solo lleva lo que de verdad cambia cuadro a cuadro.
function estadoLigero(estado) {
  return {
    cuentaRegresiva: estado.cuentaRegresiva,
    terminado: estado.terminado,
    cofresActivos: estado.pista.cofres.map((c) => c.activo),
    autos: estado.autos.map((a) => ({
      jugadorId: a.jugadorId, x: a.x, y: a.y, heading: a.heading, vx: a.vx, vy: a.vy,
      enDerrape: a.enDerrape, offRoad: a.offRoad, powerUp: a.powerUp,
      turboHasta: a.turboHasta, escudoHasta: a.escudoHasta, lentoHasta: a.lentoHasta,
      vueltas: a.vueltas, llego: a.llego, retirado: a.retirado, posicionFinal: a.posicionFinal,
      mejorVuelta: a.mejorVuelta, peorVuelta: a.peorVuelta,
    })),
  };
}

module.exports = { crearEstado, avanzar, estaTerminado, retirar, puedeEmpezar, estadoLigero, maxJugadores: MAX_JUGADORES, GP_PISTAS: GP.GP_PISTAS };
