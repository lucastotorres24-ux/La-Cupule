// ── Gestor de salas — lógica pura, sin Socket.io ──
//
// Separado de index.js a propósito: acá no hay nada de red, solo la lógica de "quién está en qué
// sala, quién es el host, cuándo se puede empezar, qué corre el bucle de física" — así se puede
// probar de punta a punta con Node normal y corriente (sin depender de instalar socket.io/express),
// y index.js queda como un adaptador chico que solo conecta estos eventos a los sockets reales.
function crearGestorSalas(JUEGOS, opts = {}) {
  const TICK_MS = opts.tickMs || 50;
  // Cuánto se le espera a alguien que se desconectó a mitad de partido antes de sacarlo de verdad.
  // Socket.io reconecta solo ante un corte de wifi/datos/VPN de un instante, o un hipo del servidor
  // (Render gratis a veces tira un 502 de un par de segundos) — 15s de gracia alcanza de sobra para
  // eso sin dejar colgada una partida cuando alguien de verdad se fue.
  const GRACIA_RECONEXION_MS = opts.graciaReconexionMs || 20000;
  // Entrada "neutral" genérica (sirve para cualquier juego: cabezones solo mira los booleanos de
  // movimiento, Cúpula GP además necesita "dir" como NÚMERO 0 y no undefined — un auto que ya venía
  // con velocidad y de golpe recibe entrada.dir=undefined corrompe el heading a NaN para siempre en
  // el próximo tick, mucho peor que el bug que se está arreglando). Se usa para "soltar los botones"
  // de alguien que se desconectó, sin arriesgar a romper la física de ningún juego.
  const ENTRADA_NEUTRAL = { izq: false, der: false, saltar: false, patear: false, accel: false, freno: false, dir: 0, derrape: false, usarPoder: false, boost: false };
  const LETRAS_CODIGO = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // sin I/O, se confunden fácil al dictarlos
  const ahora = opts.ahora || (() => Date.now());
  const setIntervalFn = opts.setInterval || setInterval;
  const clearIntervalFn = opts.clearInterval || clearInterval;
  const setTimeoutFn = opts.setTimeout || setTimeout;
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
    return sala.jugadores.map((j) => ({
      id: j.id, nombre: j.nombre, skinIndex: j.skinIndex, esHost: j.id === sala.hostId,
      desconectado: !!j.desconectadoDesde,
    }));
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

  function crearSala({ id, juego, nombre, config, skinIndex, idEstable }) {
    const handler = JUEGOS[juego];
    if (!handler) return { ok: false, error: "juego desconocido" };
    const codigo = generarCodigo();
    const jugador = { id, nombre: (nombre || "Piloto").slice(0, 24), skinIndex, idEstable: idEstable || null };
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

  function unirseSala({ id, codigo, nombre, skinIndex, idEstable }) {
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
    const jugador = { id, nombre: (nombre || "Piloto").slice(0, 24), skinIndex: skinFinal, idEstable: idEstable || null };
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

  // Se llama cuando el SOCKET se corta (evento "disconnect" de Socket.io) — que no es lo mismo que
  // "el jugador se fue": un wifi/datos móviles que titubea un instante, una VPN que se recicla, o el
  // servidor gratis que da un hipo de un par de segundos, TODOS cortan el socket y Socket.io los
  // reconecta solo por debajo, sin que el jugador haga nada. Antes, cualquiera de esos cortes lo
  // sacaba de la sala en el acto (vía salir()): el navegador seguía mandando botones e ignorando que
  // ya no era parte de nada, y su auto/jugador quedaba "fantasma" en el estado del otro lado, sin
  // recibir más entradas — eso es lo que se veía como que el auto pierde el control y se va para los
  // lados, o el balón/rival se traba, cada vez peor con el rato. Ahora, si la partida ya está en
  // marcha, se le da una ventana de gracia para reconectar (ver reconectar() más abajo) antes de
  // sacarlo de verdad. Si todavía estaba en el lobby (sala sin empezar), no hay nada que conservar —
  // se va directo, como antes.
  function desconectar({ id }) {
    const cod = jugadorSala.get(id);
    const sala = cod && salas.get(cod);
    if (!sala) return;
    if (!sala.empezada) { salir({ id }); return; }
    const jugador = sala.jugadores.find((j) => j.id === id);
    if (!jugador || jugador.desconectadoDesde) return; // ya estaba en gracia (o no existe)
    sala.entradas[id] = { ...ENTRADA_NEUTRAL }; // no se quede "acelerando" fantasma con la última tecla apretada
    jugador.desconectadoDesde = ahora();
    if (sala.hostId === id) {
      const otro = sala.jugadores.find((j) => j.id !== id);
      if (otro) sala.hostId = otro.id;
    }
    onJugadores(cod, { jugadores: listaJugadores(sala), empezada: sala.empezada });
    setTimeoutFn(() => {
      const salaAhora = salas.get(cod);
      if (!salaAhora) return;
      const jugadorAhora = salaAhora.jugadores.find((j) => j.id === id);
      // Si para cuando se cumple la gracia sigue marcado como desconectado (nadie reconectó en su
      // lugar), recién ahí se lo saca de verdad.
      if (jugadorAhora && jugadorAhora.desconectadoDesde) salir({ id });
    }, GRACIA_RECONEXION_MS);
  }

  // El navegador, apenas Socket.io le avisa que la conexión volvió, pide reconectarse a la MISMA
  // sala con el identificador estable que generó al entrar (no cambia entre cortes, a diferencia del
  // id de socket, que es nuevo cada vez) — así retoma exactamente el mismo jugador/auto donde iba,
  // en vez de quedar fantasma o entrar como uno nuevo.
  function reconectar({ id, codigo, idEstable }) {
    const cod = (codigo || "").toUpperCase();
    const sala = salas.get(cod);
    if (!sala) return { ok: false, error: "esa sala ya no existe" };
    if (!idEstable) return { ok: false, error: "falta identificador" };
    const jugador = sala.jugadores.find((j) => j.idEstable === idEstable && j.desconectadoDesde);
    if (!jugador) return { ok: false, error: "no había nadie esperando reconectar con ese identificador" };
    const idViejo = jugador.id;
    jugador.id = id;
    delete jugador.desconectadoDesde;
    jugadorSala.delete(idViejo);
    jugadorSala.set(id, cod);
    sala.entradas[id] = sala.entradas[idViejo] || {};
    if (idViejo !== id) delete sala.entradas[idViejo];
    if (sala.secuencias[idViejo] != null) { sala.secuencias[id] = sala.secuencias[idViejo]; }
    if (idViejo !== id) delete sala.secuencias[idViejo];
    if (sala.hostId === idViejo) sala.hostId = id;
    // Algunos juegos (Cúpula GP) guardan el id del jugador ADENTRO de su propio estado (el auto de
    // cada quien) además de en la lista de la sala — hay que actualizarlo ahí también para que el
    // servidor y el navegador sigan de acuerdo en cuál auto es cuál.
    if (sala.estado && Array.isArray(sala.estado.autos)) {
      sala.estado.autos.forEach((a) => { if (a.jugadorId === idViejo) a.jugadorId = id; });
    }
    onJugadores(cod, { jugadores: listaJugadores(sala), empezada: sala.empezada });
    const handler = JUEGOS[sala.juego];
    const estadoActual = sala.empezada && sala.estado
      ? (handler.estadoLigero ? handler.estadoLigero(sala.estado) : sala.estado)
      : null;
    return { ok: true, codigo: cod, miId: id, juego: sala.juego, empezada: sala.empezada, estado: estadoActual };
  }

  return {
    crearSala, unirseSala, empezar, jugarDeNuevo, input, retirarse, salir, desconectar, reconectar, cambiarSkin,
    _salas: salas, _jugadorSala: jugadorSala, // solo para tests/inspección
  };
}

module.exports = { crearGestorSalas };
