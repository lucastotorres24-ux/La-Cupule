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
      // Sub-pasos: en vez de mover todo de un solo salto grande cada 50ms, se avanza varias veces
      // con un dt más chico dentro del mismo tick (si el juego pide subPasos>1). Con esto (a) un
      // balón/auto rápido ya no puede "saltar" de un lado al otro de un colisionador en un solo paso
      // grande (menos atravesamientos), y (b) la simulación del servidor queda más parecida a una
      // continua de verdad, que es justo lo que el cliente predice cuadro a cuadro — así hay menos
      // desvío entre lo que el cliente predijo y lo que el servidor terminó calculando. No cambia
      // cuántas veces por segundo se manda la red (eso lo sigue marcando TICK_MS), solo qué tan fino
      // se calcula puertas adentro cada vez.
      const subPasos = handler.subPasos || 1;
      const subDt = dt / subPasos;
      for (let s = 0; s < subPasos; s++) {
        sala.estado = handler.avanzar(sala.estado, subDt, sala.entradas, sala.jugadores);
      }
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

  // ¿Ya hay alguien en la sala (menos "exceptoId") con ese mismo color/skin? Los juegos que no usan
  // color (cabezones no manda skinIndex) nunca entran acá — solo importa cuando skinIndex no es null.
  function colorTomado(sala, skinIndex, exceptoId) {
    return sala.jugadores.some((j) => j.id !== exceptoId && j.skinIndex === skinIndex);
  }

  // Primer color libre, buscando desde 0. Con 8 jugadores máximo y 16 colores esto siempre encuentra
  // uno; si por algún motivo no hubiera ninguno libre, se deja el que se pidió (mejor repetido que
  // romper el join).
  function primerColorLibre(sala, exceptoId) {
    for (let i = 0; i < 32; i++) if (!colorTomado(sala, i, exceptoId)) return i;
    return null;
  }

  function unirseSala({ id, codigo, nombre, skinIndex }) {
    const cod = (codigo || "").toUpperCase();
    const sala = salas.get(cod);
    if (!sala) return { ok: false, error: "esa sala no existe" };
    if (sala.empezada) return { ok: false, error: "esa carrera ya empezó" };
    const handler = JUEGOS[sala.juego];
    if (sala.jugadores.length >= handler.maxJugadores) return { ok: false, error: "la sala está llena" };
    // Si el color pedido ya lo tiene otro (dos personas lo eligieron a la vez antes de unirse, sin
    // verse entre sí), se le asigna el primer color libre en su lugar — así nunca quedan dos autos
    // del mismo color en una carrera. Quien ya estaba en la sala tiene preferencia sobre su color.
    let skinFinal = skinIndex;
    if (skinFinal != null && colorTomado(sala, skinFinal, id)) skinFinal = primerColorLibre(sala, id);
    const jugador = { id, nombre: (nombre || "Piloto").slice(0, 24), skinIndex: skinFinal };
    sala.jugadores.push(jugador);
    jugadorSala.set(id, cod);
    onJugadores(cod, { jugadores: listaJugadores(sala), empezada: sala.empezada });
    return { ok: true, codigo: cod, miId: id, juego: sala.juego, config: sala.config, jugadores: listaJugadores(sala), skinIndex: skinFinal };
  }

  // Cambiar de color desde el lobby (antes de arrancar) — rechaza si alguien más de la sala ya tiene
  // ese color puesto, para que nunca haya dos autos iguales en una misma carrera.
  function cambiarSkin({ id, skinIndex }) {
    const cod = jugadorSala.get(id);
    const sala = cod && salas.get(cod);
    if (!sala) return { ok: false, error: "no estás en ninguna sala" };
    if (sala.empezada) return { ok: false, error: "ya empezó, no se puede cambiar" };
    if (skinIndex != null && colorTomado(sala, skinIndex, id)) return { ok: false, error: "ese color ya lo tiene otro jugador" };
    const jugador = sala.jugadores.find((j) => j.id === id);
    if (!jugador) return { ok: false, error: "no estás en ninguna sala" };
    jugador.skinIndex = skinIndex;
    onJugadores(cod, { jugadores: listaJugadores(sala), empezada: sala.empezada });
    return { ok: true };
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
    crearSala, unirseSala, empezar, jugarDeNuevo, input, retirarse, salir, cambiarSkin,
    _salas: salas, _jugadorSala: jugadorSala, // solo para tests/inspección
  };
}

module.exports = { crearGestorSalas };
