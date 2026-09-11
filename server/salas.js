// ── Gestor de salas — lógica pura, sin Socket.io ──
//
// Separado de index.js a propósito: acá no hay nada de red, solo la lógica de "quién está en qué
// sala, quién es el host, cuándo se puede empezar, qué corre el bucle de física" — así se puede
// probar de punta a punta con Node normal y corriente (sin depender de instalar socket.io/express),
// y index.js queda como un adaptador chico que solo conecta estos eventos a los sockets reales.
function crearGestorSalas(JUEGOS, opts = {}) {
  const TICK_MS = opts.tickMs || 50;
  const LETRAS_CODIGO = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // sin I/O, se confunden fácil al dictarlos
  const ahora = opts.ahora || (() => Date.now());
  const setIntervalFn = opts.setInterval || setInterval;
  const clearIntervalFn = opts.clearInterval || clearInterval;
  const onJugadores = opts.onJugadores || (() => {});
  const onEmpezando = opts.onEmpezando || (() => {});
  const onEstado = opts.onEstado || (() => {});
  const onTerminado = opts.onTerminado || (() => {});

  // código de 4 letras -> Sala. jugadorSala: id de jugador -> código de su sala actual.
  const salas = new Map();
  const jugadorSala = new Map();

  function generarCodigo() {
    let codigo;
    do {
      codigo = Array.from({ length: 4 }, () => LETRAS_CODIGO[Math.floor(Math.random() * LETRAS_CODIGO.length)]).join("");
    } while (salas.has(codigo));
    return codigo;
  }

  function listaJugadores(sala) {
    return sala.jugadores.map((j) => ({ id: j.id, nombre: j.nombre, skinIndex: j.skinIndex, esHost: j.id === sala.hostId }));
  }

  function detenerTick(sala) {
    if (sala.intervalId) { clearIntervalFn(sala.intervalId); sala.intervalId = null; }
  }

  function cerrarSala(codigo) {
    const sala = salas.get(codigo);
    if (!sala) return;
    detenerTick(sala);
    salas.delete(codigo);
  }

  function empezarSala(sala) {
    const handler = JUEGOS[sala.juego];
    sala.empezada = true;
    sala.estado = handler.crearEstado(sala.jugadores, sala.config);
    sala.entradas = {};
    sala.secuencias = {};
    let ultimoTs = ahora();
    onEmpezando(sala.codigo, { estado: sala.estado, jugadores: listaJugadores(sala) });
    sala.intervalId = setIntervalFn(() => {
      const t = ahora();
      const dt = Math.min(0.05, (t - ultimoTs) / 1000);
      ultimoTs = t;
      sala.estado = handler.avanzar(sala.estado, dt, sala.entradas, sala.jugadores);
      // El paquete de cada tick va "liviano" cuando el juego ofrece un resumen (GP: sin repetir la
      // pista entera 20 veces por segundo); si no ofrece uno (cabezones: ya es chico de por sí), se
      // manda el estado completo tal cual.
      const paquete = handler.estadoLigero ? handler.estadoLigero(sala.estado) : sala.estado;
      onEstado(sala.codigo, { tick: t, estado: paquete, acks: sala.secuencias });
      if (handler.estaTerminado(sala.estado)) {
        detenerTick(sala);
        onTerminado(sala.codigo, { estado: sala.estado });
      }
    }, TICK_MS);
  }

  function crearSala({ id, juego, nombre, config, skinIndex }) {
    const handler = JUEGOS[juego];
    if (!handler) return { ok: false, error: "juego desconocido" };
    const codigo = generarCodigo();
    const jugador = { id, nombre: (nombre || "Piloto").slice(0, 24), skinIndex };
    const sala = {
      codigo, juego, config: config || {}, jugadores: [jugador], hostId: id,
      empezada: false, estado: null, entradas: {}, secuencias: {}, intervalId: null,
    };
    salas.set(codigo, sala);
    jugadorSala.set(id, codigo);
    return { ok: true, codigo, miId: id, jugadores: listaJugadores(sala) };
  }

  function unirseSala({ id, codigo, nombre, skinIndex }) {
    const cod = (codigo || "").toUpperCase();
    const sala = salas.get(cod);
    if (!sala) return { ok: false, error: "esa sala no existe" };
    if (sala.empezada) return { ok: false, error: "esa carrera ya empezó" };
    const handler = JUEGOS[sala.juego];
    if (sala.jugadores.length >= handler.maxJugadores) return { ok: false, error: "la sala está llena" };
    const jugador = { id, nombre: (nombre || "Piloto").slice(0, 24), skinIndex };
    sala.jugadores.push(jugador);
    jugadorSala.set(id, cod);
    onJugadores(cod, { jugadores: listaJugadores(sala), empezada: sala.empezada });
    return { ok: true, codigo: cod, miId: id, juego: sala.juego, config: sala.config, jugadores: listaJugadores(sala) };
  }

  function empezar({ id }) {
    const cod = jugadorSala.get(id);
    const sala = cod && salas.get(cod);
    if (!sala) return { ok: false, error: "no estás en ninguna sala" };
    if (sala.hostId !== id) return { ok: false, error: "solo quien creó la sala puede empezar" };
    if (sala.empezada) return { ok: false, error: "ya empezó" };
    const handler = JUEGOS[sala.juego];
    if (!handler.puedeEmpezar(sala.jugadores)) return { ok: false, error: "faltan jugadores" };
    empezarSala(sala);
    return { ok: true };
  }

  function jugarDeNuevo({ id }) {
    const cod = jugadorSala.get(id);
    const sala = cod && salas.get(cod);
    if (!sala) return { ok: false, error: "no estás en ninguna sala" };
    if (sala.hostId !== id) return { ok: false, error: "solo quien creó la sala puede reiniciar" };
    detenerTick(sala);
    empezarSala(sala);
    return { ok: true };
  }

  function input({ id, seq, input: entrada }) {
    const cod = jugadorSala.get(id);
    const sala = cod && salas.get(cod);
    if (!sala || !sala.empezada) return;
    sala.entradas[id] = entrada;
    if (seq != null) sala.secuencias[id] = seq;
  }

  function retirarse({ id }) {
    const cod = jugadorSala.get(id);
    const sala = cod && salas.get(cod);
    if (!sala || !sala.empezada) return;
    const handler = JUEGOS[sala.juego];
    if (handler.retirar) handler.retirar(sala.estado, id);
  }

  function salir({ id }) {
    const cod = jugadorSala.get(id);
    if (!cod) return;
    const sala = salas.get(cod);
    jugadorSala.delete(id);
    if (!sala) return;
    sala.jugadores = sala.jugadores.filter((j) => j.id !== id);
    delete sala.entradas[id];
    delete sala.secuencias[id];
    if (sala.jugadores.length === 0) {
      cerrarSala(cod);
    } else {
      if (sala.hostId === id) sala.hostId = sala.jugadores[0].id; // se traspasa solo
      onJugadores(cod, { jugadores: listaJugadores(sala), empezada: sala.empezada });
    }
  }

  return {
    crearSala, unirseSala, empezar, jugarDeNuevo, input, retirarse, salir,
    _salas: salas, _jugadorSala: jugadorSala, // solo para tests/inspección
  };
}

module.exports = { crearGestorSalas };
