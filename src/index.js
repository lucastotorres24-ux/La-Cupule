// ── Servidor de "No haga sino Jogar" para La Cúpula ──
//
// Este es el único cambio de fondo para que host e invitado dejen de tener conectividad distinta:
// antes, el navegador de quien CREABA la sala ("jugador1"/anfitrión) corría todo el partido — por
// eso siempre tenía cero de retraso consigo mismo mientras el otro jugador dependía 100% de la red
// para todo. Ahora NINGÚN navegador simula el partido: los dos mandan solo sus botones (izq/der/
// saltar/patear) a Firebase, y este proceso — que corre aparte, siempre encendido, sin depender del
// navegador de nadie — es el ÚNICO que corre la física real y decide qué pasó. Los dos navegadores
// reciben el resultado exactamente igual, con la misma latencia de red para ambos.
//
// Usa la misma base de datos de Firebase que ya usa la app (Realtime Database, reglas abiertas —
// no hace falta ninguna clave ni cuenta de servicio, se conecta igual que el navegador). La física
// de acá (./fisica.js) es una copia exacta de la que corre en el navegador — si algún día se ajusta
// la física del juego en App.jsx, hay que copiar el mismo cambio acá también.

const http = require("http");
const { initializeApp } = require("firebase/app");
const { getDatabase, ref, onValue, set } = require("firebase/database");
const F = require("./fisica.js");

const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL || "https://the-cupule-7cd07-default-rtdb.firebaseio.com";
const PUERTO = process.env.PORT || 3000;
// Cada cuántos ms el servidor "piensa" un cuadro de física y manda el resultado — 40ms (~25 veces
// por segundo) es más que suficiente para que se vea fluido y es lo mismo que ya usan los clientes
// para mandar sus botones, así que no hay ningún lado esperando innecesariamente.
const TICK_MS = 40;
// Si una sala queda "activa" pero nunca llega ni un solo botón de ninguno de los dos jugadores en
// este tiempo, se considera abandonada y se detiene el bucle solo — red de seguridad por si algún
// navegador se cerró mal y no alcanzó a limpiar su propia ruta de "sala activa".
const TIEMPO_INACTIVIDAD_MS = 20000;
const ENTRADA_VACIA = { izq: false, der: false, saltar: false, patear: false };

const app = initializeApp({ databaseURL: FIREBASE_DB_URL });
const db = getDatabase(app);

const RT_ESTADO = (roomId) => `cabezones_rt/estado/${roomId}`;
const RT_ENTRADA1 = (roomId) => `cabezones_rt/entrada1/${roomId}`;
const RT_ENTRADA2 = (roomId) => `cabezones_rt/entrada2/${roomId}`;
const RT_SALA_ACTIVA = "cabezones_rt/salaActiva";

// roomId -> { estado, entrada1, entrada2, intervalId, dejarEntrada1, dejarEntrada2, ultimaActividadTs }
const partidas = new Map();

function iniciarPartida(roomId, config) {
  if (partidas.has(roomId)) return; // ya está corriendo, no hay que hacer nada
  console.log(`[cupula-server] iniciando partida: ${roomId}`);

  const registro = {
    estado: F.crearEstadoPartidoCabezones(config || undefined),
    entrada1: { ...ENTRADA_VACIA },
    entrada2: { ...ENTRADA_VACIA },
    intervalId: null,
    dejarEntrada1: null,
    dejarEntrada2: null,
    ultimaActividadTs: Date.now(),
  };
  partidas.set(roomId, registro);

  registro.dejarEntrada1 = onValue(ref(db, RT_ENTRADA1(roomId)), (snap) => {
    if (snap.exists()) { registro.entrada1 = snap.val(); registro.ultimaActividadTs = Date.now(); }
  });
  registro.dejarEntrada2 = onValue(ref(db, RT_ENTRADA2(roomId)), (snap) => {
    if (snap.exists()) { registro.entrada2 = snap.val(); registro.ultimaActividadTs = Date.now(); }
  });

  let ultimoTs = Date.now();
  registro.intervalId = setInterval(() => {
    const ahora = Date.now();
    const dt = Math.min(0.05, (ahora - ultimoTs) / 1000);
    ultimoTs = ahora;

    if (ahora - registro.ultimaActividadTs > TIEMPO_INACTIVIDAD_MS) {
      console.log(`[cupula-server] partida ${roomId} sin actividad — deteniendo`);
      detenerPartida(roomId);
      return;
    }

    registro.estado = F.avanzarPartidoCabezones(registro.estado, dt, registro.entrada1, registro.entrada2);
    set(ref(db, RT_ESTADO(roomId)), registro.estado).catch(() => {});

    if (registro.estado.fase === "terminado") {
      // Dejamos un par de segundos el estado final visible antes de cerrar el bucle, por si algún
      // cliente todavía no procesó el último cuadro.
      setTimeout(() => detenerPartida(roomId), 2000);
    }
  }, TICK_MS);
}

function detenerPartida(roomId) {
  const registro = partidas.get(roomId);
  if (!registro) return;
  if (registro.intervalId) clearInterval(registro.intervalId);
  if (registro.dejarEntrada1) registro.dejarEntrada1();
  if (registro.dejarEntrada2) registro.dejarEntrada2();
  partidas.delete(roomId);
  console.log(`[cupula-server] partida detenida: ${roomId}`);
}

// Escucha qué salas están "activas" (los clientes escriben/borran esta ruta al empezar/terminar un
// partido — ver RT_SALA_ACTIVA_CABEZONES en App.jsx). Cada cambio trae el snapshot completo de todas
// las salas activas en este momento; se compara contra lo que este proceso ya tiene corriendo para
// arrancar lo nuevo y detener lo que ya no está. Con como mucho un puñado de partidos simultáneos
// (el equipo de La Cúpula), esto es más que suficiente — no hace falta nada más sofisticado.
onValue(ref(db, RT_SALA_ACTIVA), (snap) => {
  const activas = snap.exists() ? snap.val() : {};
  const idsActivos = new Set(Object.keys(activas || {}));
  for (const roomId of idsActivos) {
    if (!partidas.has(roomId)) iniciarPartida(roomId, activas[roomId] && activas[roomId].config);
  }
  for (const roomId of partidas.keys()) {
    if (!idsActivos.has(roomId)) detenerPartida(roomId);
  }
});

console.log("[cupula-server] escuchando salas activas en Firebase...");

// Servidor HTTP mínimo: casi todo hospedaje gratuito (Render y similares) necesita que el proceso
// responda a algo por HTTP para considerarlo "vivo" — esto no lo usa el juego para nada, es solo
// para que la plataforma sepa que el servicio está encendido.
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(`cupula-server activo — partidas en curso: ${partidas.size}`);
}).listen(PUERTO, () => {
  console.log(`[cupula-server] escuchando HTTP en el puerto ${PUERTO}`);
});
