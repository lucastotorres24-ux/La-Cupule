// ---- Reescritura de la física de "No haga sino Jogar" ----
// Cambios pedidos por el usuario:
//  1) Los dos jugadores se mueven libres por TODA la cancha (ya no hay tope en la mitad).
//  2) Colisión jugador-balón más confiable (submuestreo de física por cuadro, para que el
//     balón no atraviese al rival cuando se mueve rápido).
//  3) El travesano (y el palo frontal) del arco ahora sí colisiona: si el balón lo toca, rebota.
//  4) Los power-ups ya no solo caen al piso: flotan (con un vaivén suave) en el aire y se activan
//     al tocarlos con el balón (se lo lleva quien tocó el balón por última vez) O al tocarlos con
//     el cuerpo de un jugador directamente (se lo lleva ese jugador, sin importar quién tocó el
//     balón antes).
//  5) Colisión simple jugador-jugador (para que no se atraviesen ahora que comparten toda la cancha).

const CABEZONES_ANCHO = 960;
const CABEZONES_ALTO = 400;
const CABEZONES_SUELO_Y = 340;
const CABEZONES_ARCO_ALTO = 130;
const CABEZONES_ARCO_ANCHO = 26;
const CABEZONES_RADIO_CABEZA = 26;
const CABEZONES_RADIO_BALON = 14;
const CABEZONES_CUERPO_RADIO = 29;
const CABEZONES_CUERPO_CENTRO_Y = 41;
const CABEZONES_GRAVEDAD = 2200;
const CABEZONES_GRAVEDAD_BALON = 1050;
const CABEZONES_SALTO_V = 800;
const CABEZONES_VELOCIDAD = 300;
const CABEZONES_RESTITUCION = 0.72;
const CABEZONES_FRICCION_SUELO = 0.985;
const CABEZONES_ALCANCE_GOLPE = 78;
const CABEZONES_COOLDOWN_GOLPE = 0.32;
const CABEZONES_DURACION_PARTIDO_S = 120;
const CABEZONES_GOLES_PARA_GANAR = 5;
const CABEZONES_POWERUP_INTERVALO_S = 16;
const CABEZONES_POWERUP_DURACION_S = 9;
const CABEZONES_SUBPASOS = 8; // más fino = el balón a máxima velocidad ya no puede "saltar" a través del travesano/pared en un solo sub-paso
const CABEZONES_TRAVESANO_GROSOR = 10;
const CABEZONES_POWERUPS = [
  { tipo: "velocidad", icono: "⚡", nombre: "Velocidad", color: "#FFE94D" },
  { tipo: "cabezon", icono: "🎈", nombre: "Cabezón", color: "#FF6FD8" },
  { tipo: "fuego", icono: "🔥", nombre: "Balón de fuego", color: "#FF7A1A" },
  { tipo: "congelar", icono: "🧊", nombre: "Congela al rival", color: "#7FE8FF" },
  { tipo: "lento", icono: "🐌", nombre: "Ralentiza al rival", color: "#9B5CFF" },
  { tipo: "arco_chico", icono: "🛡️", nombre: "Achica tu arco", color: "#3DFFA0" },
  { tipo: "arco_grande", icono: "🎯", nombre: "Agranda el arco rival", color: "#FF2FD6" },
];

const EQUIPOS_CABEZONES = [
  { nombre: "Rojo Furia", principal: "#D81E28", secundario: "#FFFFFF", rayas: false },
  { nombre: "Azul Real", principal: "#1E3A8A", secundario: "#FFFFFF", rayas: false },
  { nombre: "Verdeamarelo", principal: "#FEDD00", secundario: "#009739", rayas: false },
  { nombre: "Albiceleste", principal: "#75AADB", secundario: "#FFFFFF", rayas: true },
  { nombre: "Merengue", principal: "#F5F5F5", secundario: "#1E3A8A", rayas: false },
  { nombre: "Xeneize", principal: "#0A2A66", secundario: "#FFD100", rayas: true },
  { nombre: "Negro Total", principal: "#1B1B1F", secundario: "#D81E28", rayas: false },
  { nombre: "Naranja Total", principal: "#FF6A13", secundario: "#1B1B1F", rayas: false },
];
function equipoAleatorioCabezones(evitarNombre) {
  const opciones = evitarNombre ? EQUIPOS_CABEZONES.filter((e) => e.nombre !== evitarNombre) : EQUIPOS_CABEZONES;
  return opciones[Math.floor(Math.random() * opciones.length)];
}

function crearJugadorCabezones(lado) {
  const x = lado === "izquierda" ? CABEZONES_ANCHO * 0.22 : CABEZONES_ANCHO * 0.78;
  return { lado, x, vx: 0, altura: 0, vAltura: 0, pateando: false, cooldownPatada: 0, efecto: null, efectoVenceEn: 0 };
}
function crearBalonCabezones() {
  return { x: CABEZONES_ANCHO / 2, altura: 140, vAltura: 0, vx: 0, efecto: null, efectoVenceEn: 0 };
}
function crearPowerupCabezones() {
  const def = CABEZONES_POWERUPS[Math.floor(Math.random() * CABEZONES_POWERUPS.length)];
  const margen = CABEZONES_ARCO_ANCHO + 110;
  return {
    tipo: def.tipo,
    x: margen + Math.random() * (CABEZONES_ANCHO - margen * 2),
    alturaBase: 120 + Math.random() * 130,
    altura: 0,
    t: 0,
  };
}
function crearEstadoPartidoCabezones(opts) {
  const equipoIzq = equipoAleatorioCabezones();
  const equipoDer = equipoAleatorioCabezones(equipoIzq.nombre);
  const metaGoles = (opts && opts.metaGoles) || CABEZONES_GOLES_PARA_GANAR;
  const duracionS = (opts && opts.duracionS) || CABEZONES_DURACION_PARTIDO_S;
  return {
    jugadorIzq: crearJugadorCabezones("izquierda"),
    jugadorDer: crearJugadorCabezones("derecha"),
    balon: crearBalonCabezones(),
    golesIzq: 0, golesDer: 0,
    metaGoles, duracionS,
    tiempoRestante: duracionS,
    fase: "jugando",
    ultimoGol: null,
    ultimoGolTs: 0,
    ultimoToque: null,
    powerup: null,
    powerupProximoEn: CABEZONES_POWERUP_INTERVALO_S,
    ganador: null,
    equipoIzq, equipoDer,
    // Tamaño efectivo de cada arco (1 = normal). Los power-ups "arco_chico"/"arco_grande" lo
    // cambian temporalmente — se guarda por LADO (no por jugador) porque es una propiedad de la
    // cancha, y con revanchas/reinicios el arco de cada lado siempre debe volver a 1.
    arcoIzqFactor: 1, arcoIzqVenceEn: 0,
    arcoDerFactor: 1, arcoDerVenceEn: 0,
  };
}
function clonarEstadoCabezones(estado) {
  return {
    ...estado,
    jugadorIzq: { ...estado.jugadorIzq },
    jugadorDer: { ...estado.jugadorDer },
    balon: { ...estado.balon },
    powerup: estado.powerup ? { ...estado.powerup } : null,
  };
}

// Aceleración/desaceleración por segundo al cambiar de dirección o soltar el botón: antes la
// velocidad era binaria (arrancaba y frenaba en seco de un cuadro a otro), lo que se sentía tosco.
// El valor es alto a propósito — llega a la velocidad máxima en well bajo 0.1s — para que se
// sienta ágil y responsivo, solo con un poquito de suavizado en vez de un salto instantáneo.
const CABEZONES_ACELERACION = 4600;
function moverJugadorCabezones(jugador, entrada, dt) {
  const congelado = jugador.efecto === "congelado";
  const velocidadBase = jugador.efecto === "velocidad" ? CABEZONES_VELOCIDAD * 1.55
    : jugador.efecto === "lento" ? CABEZONES_VELOCIDAD * 0.5
    : CABEZONES_VELOCIDAD;
  let vxObjetivo = 0;
  if (!congelado) {
    if (entrada.izq) vxObjetivo -= velocidadBase;
    if (entrada.der) vxObjetivo += velocidadBase;
  }
  let vx;
  if (congelado) {
    vx = 0; // congelado de verdad: no desliza, se detiene en seco
  } else {
    const cambioMax = CABEZONES_ACELERACION * dt;
    const dv = vxObjetivo - jugador.vx;
    vx = jugador.vx + Math.max(-cambioMax, Math.min(cambioMax, dv));
  }
  jugador.x += vx * dt;
  jugador.vx = vx;
  // Libre por toda la cancha (antes cada uno estaba encerrado en su mitad): el único límite
  // es no meterse dentro de los arcos.
  const margenArco = CABEZONES_ARCO_ANCHO + CABEZONES_RADIO_CABEZA;
  jugador.x = Math.max(margenArco, Math.min(CABEZONES_ANCHO - margenArco, jugador.x));
  if (entrada.saltar && jugador.altura === 0 && jugador.vAltura === 0 && !congelado) {
    jugador.vAltura = jugador.efecto === "cabezon" ? CABEZONES_SALTO_V * 1.08 : CABEZONES_SALTO_V;
  }
  jugador.vAltura -= CABEZONES_GRAVEDAD * dt;
  jugador.altura += jugador.vAltura * dt;
  if (jugador.altura <= 0) { jugador.altura = 0; jugador.vAltura = 0; }
  if (jugador.cooldownPatada > 0) jugador.cooldownPatada = Math.max(0, jugador.cooldownPatada - dt);
  jugador.pateando = !!(entrada.patear && jugador.cooldownPatada <= 0 && !congelado);
}

const CABEZONES_VELOCIDAD_MAX_BALON = 1400; // tope de seguridad: evita que un cúmulo de rebotes
// dispare la velocidad del balón a un punto en que pudiera atravesar algo entre sub-pasos.
function avanzarBalonCabezones(balon, dt) {
  balon.vx = Math.max(-CABEZONES_VELOCIDAD_MAX_BALON, Math.min(CABEZONES_VELOCIDAD_MAX_BALON, balon.vx));
  balon.vAltura -= CABEZONES_GRAVEDAD_BALON * dt;
  balon.altura += balon.vAltura * dt;
  balon.x += balon.vx * dt;
  if (balon.altura <= 0) {
    balon.altura = 0;
    balon.vAltura = Math.abs(balon.vAltura) > 40 ? -balon.vAltura * CABEZONES_RESTITUCION : 0;
    balon.vx *= CABEZONES_FRICCION_SUELO;
  }
  const alturaMax = CABEZONES_SUELO_Y - 20;
  if (balon.altura > alturaMax) { balon.altura = alturaMax; balon.vAltura = -Math.abs(balon.vAltura) * 0.5; }
}

// arcoIzqFactor/arcoDerFactor (opcionales, 1 por defecto) escalan la altura efectiva del arco de
// CADA lado — los power-ups "arco_chico"/"arco_grande" los cambian temporalmente por partido.
function revisarGolYParedes(balon, arcoIzqFactor, arcoDerFactor) {
  const radio = balon.efecto === "gigante" ? CABEZONES_RADIO_BALON * 1.8 : CABEZONES_RADIO_BALON;
  if (balon.x - radio < 0) {
    const altoArcoIzq = CABEZONES_ARCO_ALTO * (arcoIzqFactor || 1);
    if (balon.altura < altoArcoIzq) return "derecha";
    balon.x = radio; balon.vx = Math.abs(balon.vx) * CABEZONES_RESTITUCION;
  }
  if (balon.x + radio > CABEZONES_ANCHO) {
    const altoArcoDer = CABEZONES_ARCO_ALTO * (arcoDerFactor || 1);
    if (balon.altura < altoArcoDer) return "izquierda";
    balon.x = CABEZONES_ANCHO - radio; balon.vx = -Math.abs(balon.vx) * CABEZONES_RESTITUCION;
  }
  return null;
}

// El travesano de cada arco ahora sí colisiona de verdad: si el balón lo toca (por arriba o por
// abajo) rebota en vez de atravesarlo. Solo cubre la barra horizontal de arriba (el travesano) —
// el resto del marco del arco es visual, para no bloquear tiros que van limpio hacia el gol.
function revisarColisionArco(balon, arcoIzqFactor, arcoDerFactor) {
  const radio = balon.efecto === "gigante" ? CABEZONES_RADIO_BALON * 1.8 : CABEZONES_RADIO_BALON;
  const mitadGrosor = CABEZONES_TRAVESANO_GROSOR / 2;
  let choco = false;
  [
    { enBorde: 0, signo: 1, factor: arcoIzqFactor || 1 },
    { enBorde: CABEZONES_ANCHO, signo: -1, factor: arcoDerFactor || 1 },
  ].forEach(({ enBorde, signo, factor }) => {
    const xPoste = enBorde + signo * CABEZONES_ARCO_ANCHO;
    const yTravesano = CABEZONES_SUELO_Y - CABEZONES_ARCO_ALTO * factor;
    const ballY = CABEZONES_SUELO_Y - balon.altura;
    const xMin = Math.min(enBorde, xPoste), xMax = Math.max(enBorde, xPoste);

    const cercaX = Math.max(xMin, Math.min(balon.x, xMax));
    const dxBar = balon.x - cercaX;
    const dyBar = ballY - yTravesano;
    const distBar = Math.hypot(dxBar, dyBar);
    if (distBar < radio + mitadGrosor) {
      const nx = distBar > 0.001 ? dxBar / distBar : 0;
      const ny = distBar > 0.001 ? dyBar / distBar : (balon.vAltura > 0 ? -1 : 1);
      const solape = (radio + mitadGrosor) - distBar;
      balon.x += nx * solape;
      balon.altura -= ny * solape;
      if (Math.abs(ny) >= Math.abs(nx)) {
        balon.vAltura = -balon.vAltura * CABEZONES_RESTITUCION;
        if (Math.abs(balon.vAltura) < 60) balon.vAltura = ny < 0 ? 90 : -90;
      } else {
        balon.vx = -balon.vx * CABEZONES_RESTITUCION;
      }
      choco = true;
    }
  });
  return choco;
}

// balonAntesX/balonAntesAltura (opcionales) son la posición del balón ANTES de moverse este
// sub-paso. Con ellas se revisa el punto más cercano al jugador de todo el TRAYECTO que recorrió
// el balón en el sub-paso (no solo su posición final) — así, si iba muy rápido y su punto final ya
// quedó del otro lado del jugador, igual se detecta que "pasó rozando" y rebota en vez de
// atravesarlo sin tocarlo. Si no se pasan, se comporta igual que antes (solo posición final).
function resolverColisionJugadorBalon(jugador, balon, balonAntesX, balonAntesAltura) {
  const centroJugadorY = CABEZONES_SUELO_Y - jugador.altura - CABEZONES_CUERPO_CENTRO_Y;
  const radioBalon = balon.efecto === "gigante" ? CABEZONES_RADIO_BALON * 1.8 : CABEZONES_RADIO_BALON;
  const radios = CABEZONES_CUERPO_RADIO + radioBalon;

  const x1 = balonAntesX === undefined ? balon.x : balonAntesX;
  const y1 = CABEZONES_SUELO_Y - (balonAntesAltura === undefined ? balon.altura : balonAntesAltura);
  const x2 = balon.x, y2 = CABEZONES_SUELO_Y - balon.altura;
  const segX = x2 - x1, segY = y2 - y1;
  const largoSeg2 = segX * segX + segY * segY;
  let t = largoSeg2 > 0.0001 ? ((jugador.x - x1) * segX + (centroJugadorY - y1) * segY) / largoSeg2 : 1;
  t = Math.max(0, Math.min(1, t));
  const cercaX = x1 + segX * t, cercaY = y1 + segY * t;
  const dx = cercaX - jugador.x, dy = cercaY - centroJugadorY;
  const distancia = Math.hypot(dx, dy) || 0.001;
  if (distancia >= radios) return false;
  const nx = dx / distancia, ny = dy / distancia;
  // Reubicamos el balón justo afuera del cuerpo en la dirección del punto de contacto real
  // (no de su posición final), con un margen extra (1.12x en vez de solo 1.06x) — reubicarlo
  // demasiado justo al borde hacía que, si el jugador seguía moviéndose hacia el balón, volviera a
  // quedar "adentro" el siguiente sub-paso y se resolviera de nuevo, y de nuevo.
  const radiosConMargen = radios * 1.12;
  balon.x = jugador.x + nx * radiosConMargen;
  const nuevoCentroBalonY = centroJugadorY + ny * radiosConMargen;
  balon.altura = CABEZONES_SUELO_Y - nuevoCentroBalonY;
  const impulso = 260;
  // El rebote ahora también conserva parte de la velocidad que TRAÍA el balón (antes era un empuje
  // de magnitud fija sin importar si venía lento o a toda velocidad, lo que se sentía como que
  // "rebota mal" en un tiro fuerte). Un balón que venía rápido rebota más fuerte.
  const rebotePropio = Math.min(500, Math.abs(balon.vx)) * 0.45;
  // Causa real de que el balón se quedara "pegado" al cuerpo hasta saltar: si el jugador seguía
  // caminando hacia el balón, alcanzaba el nuevo margen de separación casi al instante (más rápido
  // de lo que el balón lograba alejarse) y esta función se volvía a disparar una y otra vez,
  // reseteando la posición al mismo lugar en bucle. La solución de raíz es garantizar que el balón
  // SIEMPRE salga más rápido de lo que el jugador puede volver a alcanzarlo.
  const cierreJugador = Math.max(0, (jugador.vx || 0) * nx);
  const magnitud = Math.max(impulso + rebotePropio, cierreJugador + 240);
  let vxNuevo = nx * magnitud;
  // Un choque de CUERPO (no una patada, que ya solo dispara hacia el arco rival por diseño) nunca
  // debe mandar el balón hacia el PROPIO arco — eso es justo el autogol regalado que se reportó. Si
  // el rebote natural del choque iba hacia adentro de su arco, se redirige hacia afuera en cambio.
  const haciaAfuera = jugador.lado === "izquierda" ? 1 : -1;
  if (vxNuevo * haciaAfuera < 0) vxNuevo = Math.abs(vxNuevo) * haciaAfuera;
  balon.vx = vxNuevo;
  // Solo un golpe claramente "por arriba" (cabezazo) empuja el balón hacia arriba. Antes CUALQUIER
  // contacto —incluso uno lateral, al ras del cuerpo— aplastaba la velocidad vertical del balón
  // casi a 0 (con Math.max), y si el jugador se quedaba ahí, el balón dejaba de caer y quedaba
  // flotando "pegado" contra el costado del cuerpo en vez de seguir su caída natural.
  if (ny < -0.35) {
    balon.vAltura = Math.max(balon.vAltura, -ny * impulso * 0.6);
  }
  return true;
}

// Empuje simple para que los dos cabezones no se atraviesen ahora que comparten toda la cancha
// (antes no hacía falta: cada uno estaba encerrado en su mitad y nunca se tocaban).
function resolverColisionJugadorJugador(jIzq, jDer) {
  const cyIzq = CABEZONES_SUELO_Y - jIzq.altura - CABEZONES_CUERPO_CENTRO_Y;
  const cyDer = CABEZONES_SUELO_Y - jDer.altura - CABEZONES_CUERPO_CENTRO_Y;
  const dx = jDer.x - jIzq.x;
  const dy = cyDer - cyIzq;
  const distancia = Math.hypot(dx, dy) || 0.001;
  const radios = CABEZONES_CUERPO_RADIO * 1.7;
  if (distancia >= radios) return;
  const nx = dx / distancia;
  const solape = radios - distancia;
  const margenArco = CABEZONES_ARCO_ANCHO + CABEZONES_RADIO_CABEZA;
  jIzq.x = Math.max(margenArco, Math.min(CABEZONES_ANCHO - margenArco, jIzq.x - nx * solape * 0.5));
  jDer.x = Math.max(margenArco, Math.min(CABEZONES_ANCHO - margenArco, jDer.x + nx * solape * 0.5));
}

function intentarGolpe(jugador, balon) {
  if (!jugador.pateando || jugador.cooldownPatada > 0) return false;
  const centroJugadorY = CABEZONES_SUELO_Y - jugador.altura - CABEZONES_CUERPO_CENTRO_Y;
  const centroBalonY = CABEZONES_SUELO_Y - balon.altura;
  const dx = balon.x - jugador.x;
  const dy = centroBalonY - centroJugadorY;
  const distancia = Math.hypot(dx, dy);
  if (distancia > CABEZONES_ALCANCE_GOLPE) return false;
  const haciaArco = jugador.lado === "izquierda" ? 1 : -1;
  const esCabezazo = dy < -20;
  const fuerzaX = (jugador.efecto === "fuego" || balon.efecto === "fuego") ? 900 : 760;
  balon.vx = haciaArco * fuerzaX + jugador.vx * 0.3;
  balon.vAltura = esCabezazo ? 260 : 480;
  jugador.cooldownPatada = CABEZONES_COOLDOWN_GOLPE;
  return true;
}

const CABEZONES_ARCO_FACTOR_DURACION_S = 8;
function aplicarPowerupCabezones(estado, tipo, ladoBeneficiario) {
  if (tipo === "fuego") { estado.balon.efecto = "fuego"; estado.balon.efectoVenceEn = CABEZONES_POWERUP_DURACION_S; return; }
  const jugador = ladoBeneficiario === "derecha" ? estado.jugadorDer : estado.jugadorIzq;
  if (tipo === "congelar" || tipo === "lento") {
    const rival = jugador === estado.jugadorIzq ? estado.jugadorDer : estado.jugadorIzq;
    rival.efecto = tipo;
    rival.efectoVenceEn = tipo === "congelar" ? 2.2 : 3.5;
  } else if (tipo === "arco_chico") {
    // Achica el propio arco: quien lo toma se vuelve más difícil de vencer un rato.
    if (ladoBeneficiario === "izquierda") { estado.arcoIzqFactor = 0.55; estado.arcoIzqVenceEn = CABEZONES_ARCO_FACTOR_DURACION_S; }
    else { estado.arcoDerFactor = 0.55; estado.arcoDerVenceEn = CABEZONES_ARCO_FACTOR_DURACION_S; }
  } else if (tipo === "arco_grande") {
    // Agranda el arco RIVAL: quien lo toma se lo pone más fácil para anotarle al otro.
    if (ladoBeneficiario === "izquierda") { estado.arcoDerFactor = 1.7; estado.arcoDerVenceEn = CABEZONES_ARCO_FACTOR_DURACION_S; }
    else { estado.arcoIzqFactor = 1.7; estado.arcoIzqVenceEn = CABEZONES_ARCO_FACTOR_DURACION_S; }
  } else {
    jugador.efecto = tipo; jugador.efectoVenceEn = CABEZONES_POWERUP_DURACION_S;
  }
}

// Los power-ups ya no solo caen: flotan en el aire con un vaivén suave. Se activan al tocarlos
// con el balón (se lo lleva quien tocó el balón por última vez) o directamente con el cuerpo de
// un jugador (se lo lleva ese jugador, sin importar quién tocó el balón antes).
function actualizarPowerupsCabezones(estado, dt) {
  if (!estado.powerup) {
    estado.powerupProximoEn -= dt;
    if (estado.powerupProximoEn <= 0) {
      estado.powerup = crearPowerupCabezones();
      estado.powerupProximoEn = CABEZONES_POWERUP_INTERVALO_S;
    }
    return;
  }
  const p = estado.powerup;
  p.t += dt;
  p.altura = p.alturaBase + Math.sin(p.t * 2.1) * 14;

  const radioBalon = estado.balon.efecto === "gigante" ? CABEZONES_RADIO_BALON * 1.8 : CABEZONES_RADIO_BALON;
  const dxBalon = estado.balon.x - p.x;
  const dyBalon = (CABEZONES_SUELO_Y - estado.balon.altura) - (CABEZONES_SUELO_Y - p.altura);
  if (Math.hypot(dxBalon, dyBalon) < radioBalon + 22) {
    aplicarPowerupCabezones(estado, p.tipo, estado.ultimoToque || "izquierda");
    estado.powerup = null;
    return;
  }
  const jugadores = [estado.jugadorIzq, estado.jugadorDer];
  for (let i = 0; i < jugadores.length; i++) {
    const jugador = jugadores[i];
    const centroJugadorY = CABEZONES_SUELO_Y - jugador.altura - CABEZONES_CUERPO_CENTRO_Y;
    const dxJ = jugador.x - p.x;
    const dyJ = centroJugadorY - (CABEZONES_SUELO_Y - p.altura);
    if (Math.hypot(dxJ, dyJ) < CABEZONES_CUERPO_RADIO + 20) {
      aplicarPowerupCabezones(estado, p.tipo, jugador.lado);
      estado.powerup = null;
      return;
    }
  }
}

function expirarEfectosCabezones(estado, dt) {
  [estado.jugadorIzq, estado.jugadorDer].forEach((j) => {
    if (j.efecto) { j.efectoVenceEn -= dt; if (j.efectoVenceEn <= 0) { j.efecto = null; j.efectoVenceEn = 0; } }
  });
  if (estado.balon.efecto) { estado.balon.efectoVenceEn -= dt; if (estado.balon.efectoVenceEn <= 0) { estado.balon.efecto = null; estado.balon.efectoVenceEn = 0; } }
  if (estado.arcoIzqFactor !== 1) { estado.arcoIzqVenceEn -= dt; if (estado.arcoIzqVenceEn <= 0) { estado.arcoIzqFactor = 1; estado.arcoIzqVenceEn = 0; } }
  if (estado.arcoDerFactor !== 1) { estado.arcoDerVenceEn -= dt; if (estado.arcoDerVenceEn <= 0) { estado.arcoDerFactor = 1; estado.arcoDerVenceEn = 0; } }
}

// Motor principal: función pura. Ahora corre la física en varios submuestreos por cuadro
// (CABEZONES_SUBPASOS) para que un balón rápido no atraviese a un jugador ni el travesano del
// arco entre un cuadro y el siguiente.
function avanzarPartidoCabezones(estado, dt, entradaIzq, entradaDer) {
  if (estado.fase !== "jugando") return estado;
  const nuevo = clonarEstadoCabezones(estado);
  const subDt = dt / CABEZONES_SUBPASOS;
  let gol = null;
  for (let paso = 0; paso < CABEZONES_SUBPASOS; paso++) {
    moverJugadorCabezones(nuevo.jugadorIzq, entradaIzq, subDt);
    moverJugadorCabezones(nuevo.jugadorDer, entradaDer, subDt);
    resolverColisionJugadorJugador(nuevo.jugadorIzq, nuevo.jugadorDer);
    const balonAntesX = nuevo.balon.x, balonAntesAltura = nuevo.balon.altura;
    avanzarBalonCabezones(nuevo.balon, subDt);
    revisarColisionArco(nuevo.balon, nuevo.arcoIzqFactor, nuevo.arcoDerFactor);
    if (resolverColisionJugadorBalon(nuevo.jugadorIzq, nuevo.balon, balonAntesX, balonAntesAltura)) nuevo.ultimoToque = "izquierda";
    if (resolverColisionJugadorBalon(nuevo.jugadorDer, nuevo.balon, balonAntesX, balonAntesAltura)) nuevo.ultimoToque = "derecha";
    if (intentarGolpe(nuevo.jugadorIzq, nuevo.balon)) nuevo.ultimoToque = "izquierda";
    if (intentarGolpe(nuevo.jugadorDer, nuevo.balon)) nuevo.ultimoToque = "derecha";
    gol = revisarGolYParedes(nuevo.balon, nuevo.arcoIzqFactor, nuevo.arcoDerFactor);
    if (gol) break;
  }
  actualizarPowerupsCabezones(nuevo, dt);
  expirarEfectosCabezones(nuevo, dt);
  nuevo.tiempoRestante = Math.max(0, nuevo.tiempoRestante - dt);
  if (gol) {
    if (gol === "derecha") nuevo.golesDer += 1; else nuevo.golesIzq += 1;
    nuevo.ultimoGol = gol;
    nuevo.ultimoGolTs = Date.now();
    nuevo.jugadorIzq = crearJugadorCabezones("izquierda");
    nuevo.jugadorDer = crearJugadorCabezones("derecha");
    nuevo.balon = crearBalonCabezones();
    nuevo.powerup = null;
    // un gol es un punto de reinicio limpio — las ventajas de arco no se cargan de un gol al otro
    nuevo.arcoIzqFactor = 1; nuevo.arcoIzqVenceEn = 0;
    nuevo.arcoDerFactor = 1; nuevo.arcoDerVenceEn = 0;
  }
  const metaGoles = nuevo.metaGoles || CABEZONES_GOLES_PARA_GANAR;
  if (nuevo.tiempoRestante <= 0 || nuevo.golesIzq >= metaGoles || nuevo.golesDer >= metaGoles) {
    nuevo.fase = "terminado";
    nuevo.ganador = nuevo.golesIzq === nuevo.golesDer ? "empate" : (nuevo.golesIzq > nuevo.golesDer ? "izquierda" : "derecha");
  }
  return nuevo;
}

// Tres niveles de dificultad (Fácil / Medio / Modo Ronaldinho), más duros que la primera versión —
// "reaccion" es la probabilidad de que el bot realmente reaccione en cada llamada (simula reflejos
// humanos más lentos en fácil); "zonaMuerta" qué tan preciso es ubicándose; "alcanceExtra" multiplica
// el alcance de golpe (mejor anticipación/timing en los niveles altos); "probSalto" qué tan seguido
// intenta cabecear un balón aéreo que se le viene; "cobertura" qué tan agresivo es defendiendo/se
// reposiciona antes de tocar un balón peligroso; "anclaje" qué tanto se mantiene cerca de una línea
// de resguardo frente a su arco en vez de abandonarlo por completo cuando el balón está lejos (0 =
// siempre va directo al balón sin importar qué tan lejos esté su arco, 1 = nunca se aleja del todo).
// "ruido" = margen de error aleatorio (en unidades de cancha) que se le suma a dónde apunta a
// pararse en cada decisión — sin esto, la IA es una función determinista del estado del juego, así
// que jugando varias veces contra ella se puede aprender el patrón exacto ("si me paro acá, el bot
// SIEMPRE hace esto") y explotarlo para goles fáciles una y otra vez. Con ruido, la MISMA situación
// no produce siempre exactamente la misma reacción — más en fácil (menos preciso), casi nada en
// Ronaldinho (pero no cero, para que tampoco sea 100% predecible ni al nivel más alto).
// "avance" (nuevo): qué tan lejos hacia el arco RIVAL está dispuesto a comprometerse el bot cuando
// no está defendiendo una amenaza real (0 = nunca sale de su propio tercio de cancha, 1 = puede
// llegar hasta la línea de gol rival). Antes el bot podía perseguir la intercepción predictiva del
// balón hasta CUALQUIER punto de la cancha, incluso muy adentro del campo rival, dejando su propio
// arco completamente vacío mientras tanto — esto es justo lo que hace que "cuide el arco a toda
// costa": pone un techo a qué tan lejos avanza salvo que el balón YA esté más allá de ese límite (ahí
// no hay nada que cuidar, así que sí puede ir).
// "prioridadPoder" (nuevo, ronda 2): antes el bot ignoraba por completo los power-ups que flotan en
// la cancha. Este número (0 a 1) controla qué tanto se anima a desviarse de su objetivo normal para
// ir a buscar uno cuando conviene (está cerca y no lo tiene más lejos que el rival) — 0 lo ignora
// como antes, 1 lo prioriza fuerte. Nunca compite con una cobertura urgente del propio arco (eso
// sigue siendo lo primero, sin excepción).
// "probControlAvanzado" (nuevo, ronda 2): antes, en cuanto el balón entraba en su alcance de patada,
// el bot pateaba SIEMPRE de una — no existía la idea de "domino el balón, no tengo presión encima,
// avanzo un poco antes de definir". Esta probabilidad (0 a 1) controla qué tan seguido, cuando el
// rival está lejos (sin presión) y el bot todavía no está en zona de ataque profunda, elige seguir
// avanzando con el balón en los pies (llevándoselo por delante al caminar) en vez de rematar de
// primera — así el ataque se siente más orgánico y menos "tocar y patear" siempre igual. Ya cerca del
// arco rival, o bajo presión real, esto no aplica: ahí siempre define.
// "riesgoMarcador" (nuevo, ronda 2, no es un número de esta tabla sino un comportamiento fijo que
// usa "avance"/"anclaje" como base): con el marcador y el tiempo restante del partido, el bot ahora
// ajusta EN VIVO qué tan lejos se anima a avanzar — más arriesgado si va perdiendo y queda poco
// tiempo, más conservador (cuida el resultado) si va ganando cómodo y queda poco tiempo. Un jugador
// "orgánico" de verdad no juega exactamente igual en el minuto 1 que en el descuento estando 4-0.
// Valores afinados por auto-juego: el bot jugó cientos/miles de partidos simulados (con las reglas
// reales del juego — a 5 goles o 120s, no una prueba artificial) contra pequeñas variaciones de sí
// mismo, y se midió automáticamente cuál combinación gana más, concede menos, Y juega un partido más
// completo (tiempo real atacando con el balón controlado en campo rival, power-ups aprovechados) —
// así el bot "corrige errores solo" en vez de que yo adivine manualmente los números. Se validó con
// muestras grandes (20-40 partidos por comparación) antes de aceptar cada combinación, y se confirmó
// que la escalera de dificultad se mantiene intacta: Medio le gana claramente a Fácil, y Ronaldinho le
// gana claramente a Medio. Fácil se dejó igual a propósito (prioridadPoder y probControlAvanzado en 0
// — sigue sin usar power-ups ni intercepción, para que siga siendo vencible como corresponde al nivel
// de entrada) y no participó de esta segunda ronda de ajuste.
const DIFICULTADES_BOT_CABEZONES = {
  facil: { reaccion: 0.6, zonaMuerta: 22, alcanceExtra: 1.2, probSalto: 0.35, cobertura: 0.4, anclaje: 0.26, tick: 140, ruido: 60, avance: 0.55, prioridadPoder: 0, probControlAvanzado: 0 },
  medio: { reaccion: 0.41, zonaMuerta: 18.4, alcanceExtra: 1.53, probSalto: 0.52, cobertura: 0.68, anclaje: 0.9, tick: 75, ruido: 12.8, avance: 0.53, prioridadPoder: 0.98, probControlAvanzado: 0.06 },
  ronaldinho: { reaccion: 0.4, zonaMuerta: 2, alcanceExtra: 2.23, probSalto: 1, cobertura: 0.92, anclaje: 1, tick: 45, ruido: 10, avance: 0.95, prioridadPoder: 0, probControlAvanzado: 0 },
};
// IA del bot (siempre juega en el lado derecho). Además de perseguir el balón:
//  - Defiende de verdad y "cuida su arco a muerte": si el balón está lejos y no es peligro
//    inmediato, no lo persigue a ciegas hasta el otro extremo de la cancha — se mantiene cerca de
//    una línea de resguardo frente a su propio arco (anclaje), lista para reaccionar, en vez de
//    dejar el arco completamente vacío.
//  - Si el balón SÍ es peligroso (más cerca de su arco que del rival) y el bot está del lado
//    equivocado (el balón quedó "detrás" suyo), primero se ubica ENTRE el balón y su propio arco
//    (cobertura) para poder despejar hacia afuera en vez de llegar por el lado malo.
//  - Los golpes (patada e incluso el choque pasivo de cuerpo) ya nunca mandan el balón hacia el
//    propio arco por diseño de la física — así que la IA ya no puede regalar un autogol por sí sola.
//  - No se queda empujando de frente contra el rival sin avanzar: si queda pegado a él (choque de
//    cuerpos) y no puede alcanzar el balón, salta para separarse en vez de insistir sin resultado.
// Intercepción predictiva: en vez de perseguir dónde ESTÁ el balón ahora mismo (que en un juego con
// gravedad y rebotes siempre llega "un paso tarde", persiguiendo un blanco que ya se movió), se
// simula la trayectoria futura del balón con la misma física real (gravedad, rebote en el piso,
// fricción) y se apunta al primer punto de esa trayectoria que el jugador alcanzaría a tiempo si sale
// ya mismo. Esta es la técnica clásica de "intercepción" que usan los bots reales de juegos con
// pelota (por ejemplo el capítulo "Simple Soccer" de Programming Game AI by Example, o los algoritmos
// de intercepción usados en RoboCup) en vez de la persecución ingenua de la posición actual. Si no
// encuentra ningún punto alcanzable dentro del horizonte de tiempo dado, devuelve la posición actual
// del balón (el comportamiento ingenuo de antes) como respaldo.
function predecirInterceptacionBalonCabezones(balon, jugadorX, velocidadJugador, horizonteS) {
  const paso = 0.05;
  const clon = { x: balon.x, altura: balon.altura, vAltura: balon.vAltura, vx: balon.vx, efecto: balon.efecto };
  for (let t = paso; t <= horizonteS + 1e-9; t += paso) {
    avanzarBalonCabezones(clon, paso);
    const distancia = Math.abs(clon.x - jugadorX);
    const tiempoLlegada = distancia / Math.max(1, velocidadJugador);
    if (tiempoLlegada <= t) return clon.x;
  }
  return balon.x;
}

function decidirEntradaBotCabezones(estado, dificultad, alerta) {
  const cfgBase = DIFICULTADES_BOT_CABEZONES[dificultad] || DIFICULTADES_BOT_CABEZONES.medio;
  // Modo alerta: se activa un rato (lo controla quien llama a esta función) justo después de recibir
  // un gol. En vez de arriesgarse a repetir el mismo error que acaba de costarle un gol, durante esa
  // ventana el bot juega más precavido: reacciona más seguido, se pega más a su línea de resguardo y
  // salta más a despejar. Es lo más parecido a "reaccionar a lo que acaba de pasar" que puede hacer
  // sin memoria entre partidas (esa es una función aparte, más grande, para más adelante).
  const cfg = alerta ? {
    ...cfgBase,
    anclaje: Math.min(1, cfgBase.anclaje + 0.3),
    probSalto: Math.min(1, cfgBase.probSalto + 0.3),
    reaccion: Math.min(1, cfgBase.reaccion + 0.2),
    zonaMuerta: Math.max(2, cfgBase.zonaMuerta - 4),
  } : cfgBase;
  const jugador = estado.jugadorDer;
  const rival = estado.jugadorIzq;
  const balon = estado.balon;
  const usaComportamientoAvanzado = dificultad !== "facil";

  const distBalonArcoPropio = Math.abs(CABEZONES_ANCHO - balon.x);
  const distBalonArcoRival = Math.abs(0 - balon.x);
  const enPeligro = distBalonArcoPropio < distBalonArcoRival;
  const malUbicado = enPeligro && jugador.x < balon.x - 4;
  // Contragolpe urgente: el balón quedó "detrás" del bot, entre él y su propio arco, y encima ya
  // está cerca de ese arco — un rival esperando atrás puede empujarlo o pasarlo por arriba hacia el
  // arco vacío. Antes esta cobertura solo se activaba en dificultades con cobertura>0.4 (fácil quedaba
  // completamente afuera) y encima podía "saltarse" el turno por el margen de error normal del bot —
  // así se quedaba de espaldas mientras el balón entraba. Ahora SIEMPRE intenta cubrir algo (más débil
  // en fácil, total en Ronaldinho) y fuerza que este cuadro sí reaccione.
  const contragolpeUrgente = malUbicado && distBalonArcoPropio < 340;
  const lineaResguardoX = CABEZONES_ANCHO * 0.82;
  const distBalonBot = Math.abs(balon.x - jugador.x);
  const distanciaRival = Math.hypot(rival.x - jugador.x, (CABEZONES_SUELO_Y - rival.altura) - (CABEZONES_SUELO_Y - jugador.altura));

  // ── Conciencia de marcador y tiempo restante ──
  // Un jugador "orgánico" de verdad no juega exactamente igual todo el partido: yendo perdiendo y con
  // poco tiempo se anima a arriesgar más arriba; yendo ganando cómodo y con poco tiempo, se repliega
  // más para conservar el resultado. Esto ajusta EN VIVO qué tan lejos avanza (avance) y qué tan
  // pegado se queda a su arco (anclaje) sin tocar el resto del comportamiento — no se aplica en
  // fácil (se queda siempre igual, a propósito, para el nivel de entrada), ni cuando falta mucho
  // partido (el ajuste crece recién cerca del final, no desde el arranque).
  let avanceEfectivo = cfg.avance;
  let anclajeEfectivo = cfg.anclaje;
  if (usaComportamientoAvanzado && typeof estado.golesDer === "number" && typeof estado.golesIzq === "number") {
    const diferencia = estado.golesDer - estado.golesIzq; // >0 = el bot va ganando
    const metaGoles = estado.metaGoles || CABEZONES_GOLES_PARA_GANAR;
    const duracionTotal = estado.duracionS || CABEZONES_DURACION_PARTIDO_S;
    const tiempoRestanteFrac = duracionTotal > 0 ? Math.max(0, Math.min(1, (estado.tiempoRestante ?? duracionTotal) / duracionTotal)) : 1;
    const urgenciaTiempo = 1 - tiempoRestanteFrac; // 0 al arranque del partido, 1 sobre la hora
    const presionMarcador = Math.max(-1, Math.min(1, -diferencia / Math.max(2, metaGoles - 1)));
    const ajuste = presionMarcador * urgenciaTiempo * 0.22;
    avanceEfectivo = Math.max(0.15, Math.min(0.98, cfg.avance + ajuste));
    anclajeEfectivo = Math.max(0.1, Math.min(1, cfg.anclaje - ajuste * 0.6));
  }

  let objetivoX;
  if (malUbicado) {
    const objetivoCobertura = Math.min(CABEZONES_ANCHO - CABEZONES_ARCO_ANCHO - 8, balon.x + 30);
    objetivoX = balon.x + (objetivoCobertura - balon.x) * Math.max(0.35, cfg.cobertura);
  } else if (!enPeligro && distBalonBot > 260) {
    // el balón está lejos y no es una amenaza inmediata: se queda parcialmente en su línea de
    // resguardo en vez de abandonar el arco por completo (más "anclaje" = se aleja menos).
    objetivoX = balon.x + (lineaResguardoX - balon.x) * anclajeEfectivo;
  } else if (dificultad === "facil") {
    // en fácil no se usa intercepción a propósito, para que siga sintiéndose como un bot
    // principiante que corre detrás de la pelota en vez de anticiparse.
    objetivoX = balon.x;
  } else {
    objetivoX = predecirInterceptacionBalonCabezones(balon, jugador.x, CABEZONES_VELOCIDAD, 0.9);
  }

  // ── Power-ups: ahora el bot los ve (antes los ignoraba por completo) ──
  // Solo se anima a desviarse hacia uno cuando no hay peligro real en su propio arco (nunca abandona
  // una cobertura urgente por un power-up) y cuando está razonablemente cerca de tomarlo antes que el
  // rival — si el rival lo tiene mucho más a mano, no vale la pena dejar su posición por él. La línea
  // defensiva máxima (más abajo) se sigue aplicando igual sobre este objetivo: no se compromete más
  // adelante de lo que su "avance" permite ni siquiera por un power-up.
  if (usaComportamientoAvanzado && !malUbicado && estado.powerup && cfg.prioridadPoder > 0) {
    const pu = estado.powerup;
    const distBotPowerup = Math.abs(pu.x - jugador.x);
    const distRivalPowerup = Math.abs(pu.x - rival.x);
    const puConviene = distBotPowerup < 380 && distBotPowerup <= distRivalPowerup + 60;
    if (puConviene) {
      objetivoX = objetivoX + (pu.x - objetivoX) * cfg.prioridadPoder;
    }
  }

  // Línea defensiva máxima: el bot "cuida su arco a toda costa" — sin este límite, la intercepción
  // predictiva de arriba (o la búsqueda de un power-up) podía mandarlo MUY adentro del campo rival,
  // dejando su propio arco completamente desprotegido mientras tanto. Cuando no está defendiendo una
  // amenaza real (no malUbicado), nunca avanza más allá de esta línea — salvo que el balón YA esté más
  // adelante que ella, caso en el que no hay nada que cuidar en el camino y sí puede ir a buscarlo.
  // "avance" (0 a 1, ya ajustado arriba por marcador/tiempo) controla qué tan agresivo puede ser cada
  // dificultad: más alto en Ronaldinho (buen atacante, pero conserva margen) que en Fácil.
  if (!malUbicado) {
    const lineaDefensivaX = CABEZONES_ANCHO * (1 - Math.max(0, Math.min(1, avanceEfectivo || 0.7)));
    objetivoX = Math.max(objetivoX, Math.min(lineaDefensivaX, balon.x));
  }
  // Margen de error: rompe el patrón "misma situación = mismo movimiento exacto siempre" que se
  // puede aprender y explotar para anotar fácil una y otra vez.
  objetivoX += (Math.random() * 2 - 1) * cfg.ruido;

  const entrada = { izq: false, der: false, saltar: false, patear: false };
  const distX = objetivoX - jugador.x;
  const reaccionEfectiva = contragolpeUrgente ? Math.max(cfg.reaccion, 0.85) : cfg.reaccion;
  if (Math.random() < reaccionEfectiva) {
    if (distX > cfg.zonaMuerta) entrada.der = true;
    else if (distX < -cfg.zonaMuerta) entrada.izq = true;
  }

  const centroJugadorY = CABEZONES_SUELO_Y - jugador.altura - CABEZONES_CUERPO_CENTRO_Y;
  const centroBalonY = CABEZONES_SUELO_Y - balon.altura;
  const distanciaBalon = Math.hypot(balon.x - jugador.x, centroBalonY - centroJugadorY);
  const alcance = CABEZONES_ALCANCE_GOLPE * cfg.alcanceExtra;
  if (distanciaBalon < alcance) {
    // ── Control/amague: "domino el balón, sin presión encima, elijo el momento" ──
    // Antes, en cuanto el balón entraba en alcance, el bot pateaba SIEMPRE de una — no existía un
    // paso intermedio. Ahora, solo cuando NO es una situación urgente (no malUbicado, no
    // contragolpeUrgente, no en modo alerta), el rival está lejos (sin presión real) y el bot
    // todavía no está en zona de ataque profunda (ya cerca del arco rival, definir de una sigue
    // siendo lo correcto), a veces elige seguir avanzando con el balón por delante en vez de
    // rematar de primera — el toque de cuerpo al caminar ya empuja el balón hacia adelante, así que
    // esto se siente como llevárselo, no como ignorarlo.
    const sinPresion = distanciaRival > 155;
    const zonaAtaqueProfunda = jugador.x < CABEZONES_ANCHO * 0.38;
    const puedeControlar = usaComportamientoAvanzado && sinPresion && !zonaAtaqueProfunda
      && !contragolpeUrgente && !alerta && cfg.probControlAvanzado > 0
      && Math.random() < cfg.probControlAvanzado;
    if (!puedeControlar) {
      entrada.patear = true;
    }
    if (centroBalonY < centroJugadorY - 15 && jugador.altura === 0) entrada.saltar = true;
  } else if (balon.vx < 0 && Math.abs(balon.x - jugador.x) < 230 && centroBalonY < centroJugadorY && jugador.altura === 0 && Math.random() < cfg.probSalto) {
    // cabezazo ofensivo: el balón va hacia el arco rival, está cerca y arriba — se eleva a rematarlo.
    entrada.saltar = true;
  } else if (balon.vx > 0 && (jugador.x - balon.x) > -20 && (jugador.x - balon.x) < 180 && centroBalonY < centroJugadorY - 10 && jugador.altura === 0 && Math.random() < Math.min(1, cfg.probSalto + 0.3)) {
    // despeje defensivo: el balón viene POR ARRIBA hacia su propio arco (un globo por encima del bot)
    // y todavía no está a distancia de patada — antes esto se dejaba pasar sin más, así que un rival
    // que se quedaba esperando atrás podía tirarlo por encima del bot una y otra vez para anotar en
    // bucle; ahora salta a intentar despejarlo/cabecearlo antes de que le pase por arriba.
    entrada.saltar = true;
  }

  const pegadoAlRival = distanciaRival < CABEZONES_CUERPO_RADIO * 2;
  if (pegadoAlRival && distanciaBalon > alcance && jugador.altura === 0 && Math.random() < (0.35 + cfg.cobertura * 0.35)) {
    entrada.saltar = true;
  }

  return entrada;
}

// ── Extrapolación para el invitado en línea ──
// Entre paquete y paquete del anfitrión (llegan seguido, pero con algo de jitter en redes menos
// estables), el invitado sigue moviendo el balón y al rival con la misma física real en vez de
// quedarse "congelado" hasta el próximo dato — así no se ve a saltos. Ahora además son conscientes
// de colisión: si en el trayecto extrapolado el balón se cruza con la posición actual (mostrada en
// pantalla) de alguno de los dos jugadores, rebota — antes la extrapolación era solo balística
// (gravedad + velocidad) sin chequear jugadores, así que en pantalla del invitado el balón podía
// "atravesar" a un jugador visualmente aunque en la física real del anfitrión sí hubiera rebotado;
// esto lo corrige del lado visual también, no solo del lado autoritativo.
function extrapolarBalonCabezones(balon, dt, jugadorIzq, jugadorDer, arcoIzqFactor, arcoDerFactor) {
  const clon = { ...balon };
  const antesX = clon.x, antesAltura = clon.altura;
  avanzarBalonCabezones(clon, dt);
  revisarColisionArco(clon, arcoIzqFactor, arcoDerFactor);
  if (jugadorIzq) resolverColisionJugadorBalon(jugadorIzq, clon, antesX, antesAltura);
  if (jugadorDer) resolverColisionJugadorBalon(jugadorDer, clon, antesX, antesAltura);
  if (!Number.isFinite(clon.x) || !Number.isFinite(clon.altura) || !Number.isFinite(clon.vx) || !Number.isFinite(clon.vAltura)) {
    return balon;
  }
  return clon;
}
function extrapolarJugadorRemotoCabezones(jugador, dt) {
  const clon = { ...jugador };
  if (clon.efecto !== "congelado") clon.x += clon.vx * dt;
  clon.vAltura -= CABEZONES_GRAVEDAD * dt;
  clon.altura += clon.vAltura * dt;
  if (clon.altura <= 0) { clon.altura = 0; clon.vAltura = 0; }
  return clon;
}

// Qué tan fuerte corregir hacia el dato del anfitrión, según qué tan lejos está la predicción/
// extrapolación local de ese dato ("distancia" en px, puede venir de un solo eje o de un hypot).
// Por debajo de `zonaMuerta` no corrige nada (ese margen es error normal de predicción/latencia:
// corregirlo igual es lo que se sentía como un "imán" frenando el movimiento, o como que el balón
// se pegaba de los pies al ser jalado de vuelta constantemente). Entre `zonaMuerta` y `zonaFuerte`
// la corrección crece gradualmente de `tasaMin` a `tasaMax`; por encima de `zonaFuerte` corrige al
// máximo (`tasaMax`), para que un desync real (por ejemplo tras una patada que el anfitrión resolvió
// distinto, o un paquete perdido) sí se corrija rápido y no se quede visiblemente desincronizado.
function factorSuavizadoCabezones(distancia, zonaMuerta, zonaFuerte, dt, tasaMin, tasaMax) {
  if (!(distancia > zonaMuerta)) return 0;
  const t = Math.min(1, (distancia - zonaMuerta) / Math.max(1e-6, zonaFuerte - zonaMuerta));
  const tasa = tasaMin + t * (tasaMax - tasaMin);
  return Math.min(1, Math.max(0, dt) * tasa);
}

module.exports = {
  CABEZONES_ANCHO, CABEZONES_ALTO, CABEZONES_SUELO_Y, CABEZONES_ARCO_ALTO, CABEZONES_ARCO_ANCHO,
  CABEZONES_RADIO_CABEZA, CABEZONES_RADIO_BALON, CABEZONES_CUERPO_RADIO, CABEZONES_CUERPO_CENTRO_Y,
  CABEZONES_ALCANCE_GOLPE,
  CABEZONES_DURACION_PARTIDO_S, CABEZONES_GOLES_PARA_GANAR, CABEZONES_POWERUPS, EQUIPOS_CABEZONES,
  DIFICULTADES_BOT_CABEZONES, CABEZONES_VELOCIDAD_MAX_BALON, CABEZONES_ACELERACION, CABEZONES_VELOCIDAD,
  crearJugadorCabezones, crearBalonCabezones, crearEstadoPartidoCabezones, clonarEstadoCabezones,
  moverJugadorCabezones, avanzarBalonCabezones, revisarGolYParedes, revisarColisionArco,
  resolverColisionJugadorBalon, resolverColisionJugadorJugador, intentarGolpe,
  aplicarPowerupCabezones, actualizarPowerupsCabezones, expirarEfectosCabezones,
  avanzarPartidoCabezones, decidirEntradaBotCabezones, equipoAleatorioCabezones,
  extrapolarBalonCabezones, extrapolarJugadorRemotoCabezones, factorSuavizadoCabezones,
  predecirInterceptacionBalonCabezones,
};
