// ── Física de Cúpula GP para el servidor (modo en línea) ──
//
// Este archivo es, en su primera parte, una copia EXACTA del bloque de física/IA/generación de
// pistas que corre en el navegador (src/App.jsx) — mismas constantes, mismas funciones, mismo
// comportamiento. Si algún día se ajusta la física de Cúpula GP en App.jsx, hay que copiar el mismo
// cambio acá también para que una carrera en línea se sienta igual que una carrera local.
//
// Debajo de esa copia (buscar "ONLINE — orquestación multijugador") está el código NUEVO específico
// del modo en línea: arma el estado inicial con un auto por jugador conectado (nunca hay bots en
// línea) y avanza la física usando la entrada de CADA jugador por separado, en vez de una sola
// entrada compartida como hace el modo solo-vs-bots.
//
// COLORS solo lo usan las funciones de DIBUJO de más abajo (dibujarAutoGP, dibujarMinimapaGP, etc.)
// — el servidor nunca las llama (no tiene pantalla), pero se dejan tal cual para que este archivo
// sea copia fiel del original y sea fácil de comparar/actualizar.
const COLORS = {
  neonAmber: "#FFB020", neonBlue: "#2FA8FF", neonRed: "#FF2F2F", neonMagenta: "#FF2FD6",
  neonSuccess: "#2FFF8A", white: "#FFFFFF", textMuted: "#8A93A6", steel: "#5A6577",
};

const GP_TRACK_ANCHO = 170;
const GP_TRACK_MITAD = GP_TRACK_ANCHO / 2;
const GP_NUM_BOTS = 15;
const GP_AUTO_LARGO = 34;
const GP_AUTO_ANCHO = 18;
const GP_RADIO_COLISION = 15;
const GP_VUELTAS_OPCIONES = [3, 5, 10, 20];
const GP_VEL_MAX_BASE = 420; // px/s de mundo, a plena pista — velocidad extrema, sensación de carrera rápida
const GP_FUERZA_MOTOR = 340;
const GP_FUERZA_FRENO = 420;
const GP_RESISTENCIA = 0.3; // resistencia al rodar (rolling resistance), siempre activa
const GP_GIRO_MAX = 2.8; // rad/s de referencia a velocidad de crucero
const GP_UMBRAL_DERRAPE = 155; // velocidad lateral (px/s) a partir de la cual se considera derrape (antes 110 — se disparaba solo con giros normales)
const GP_DERRAPE_MS = 300; // cuánto se mantiene el estado de derrape una vez disparado
const GP_CAMARA_LOOKAHEAD = 130;
const GP_CAMARA_SUAVIDAD = 0.00002; // más chico = cámara más "pegada"; se usa como base de un lerp exponencial independiente del framerate
const GP_RESTITUCION = 0.78; // "bounciness" de los choques auto-auto (0 = se pegan, 1 = rebote elástico total)
const GP_EMPUJE_MINIMO = 55; // separación garantizada (px/s) al chocar, aunque ambos autos lleven la misma velocidad
const GP_GOLPE_DERRAPE_UMBRAL = 95; // velocidad relativa lateral de impacto a partir de la cual el golpe fuerza un derrape
const GP_RAYCAST_DIST = 130; // alcance de las 3 "antenas" de los bots
const GP_RAYCAST_ANGULO = 0.5; // rad de apertura de las antenas diagonales respecto al frente
const GP_BOOST_RECTA = 1.32; // multiplicador de fuerza de motor de los bots en recta despejada
const GP_LIMITE_OFFROAD_BOT = GP_TRACK_MITAD * 0.9; // más allá de esto la IA prioriza volver a la pista, ignorando cualquier esquive
const GP_DERRAPE_MANUAL_DIR_MIN = 0.2; // cuánto hay que estar girando para que el botón de derrape haga efecto
const GP_TURBO_MS = 1400;
const GP_TURBO_FUERZA = 1.5;
const GP_ESCUDO_MS = 4500;
const GP_LENTO_MS = 1500;
const GP_LENTO_FACTOR = 0.55;
const GP_ACEITE_VIDA = 9; // segundos que dura una mancha de aceite tirada en la pista
const GP_ACEITE_RADIO = 22;
const GP_COFRE_RADIO = 24;
const GP_COFRE_RESPAWN_MS = 7000;
const GP_TIPOS_PODER = ["turbo", "escudo", "aceite", "rayo"];
const GP_ICONOS_PODER = { turbo: "🚀", escudo: "🛡️", aceite: "🛢️", rayo: "⚡" };
// Valla física: nadie puede alejarse del centro de la pista más que esto — al tocarla, rebota de
// vuelta en vez de poder seguir de largo hacia el pasto infinito. Dentro de este margen (65 unidades
// de "escape" más allá del borde de la pista) todavía se puede cortar una curva por afuera con
// normalidad, como en cualquier juego de carreras.
const GP_MURO_DIST = GP_TRACK_MITAD + 65;
const GP_MURO_REBOTE = 1.35; // cuánto rebota la velocidad que iba "hacia afuera" al pegar contra la valla
// F1-style: puntos por posición final de cada carrera de un torneo (11° en adelante no suma).
const GP_PUNTOS_TORNEO = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
function puntosParaPosicionGP(pos) { return GP_PUNTOS_TORNEO[pos - 1] || 0; }
const GP_OPCIONES_TORNEO = [3, 5, 8];
const GP_NOMBRES_PODER = { turbo: "TURBO", escudo: "ESCUDO", aceite: "ACEITE", rayo: "RAYO" };

// Ambientación distinta por pista: paleta de cielo/terreno, colores de pianito y qué mezcla de
// decoraciones usa cada circuito — así las 8 pistas no comparten el mismo look verde-genérico.
const GP_TEMAS = {
  ovalo: { cieloTop: "#0d2414", cieloBottom: "#081a0e", pastoA: "#123A1C", pastoB: "#173F20", curbA: "#E23B3B", curbB: "#EDEDED", secuenciaDecos: ["grada", "arbol", "neumaticos", "arbol", "bandera"] },
  autodromo: { cieloTop: "#1b2028", cieloBottom: "#12151b", pastoA: "#1E2530", pastoB: "#242C38", curbA: "#E23B3B", curbB: "#EDEDED", secuenciaDecos: ["grada", "grada", "neumaticos", "bandera", "neumaticos"] },
  estadio: { cieloTop: "#0b1330", cieloBottom: "#080c20", pastoA: "#122018", pastoB: "#16281d", curbA: COLORS.neonAmber, curbB: "#EDEDED", secuenciaDecos: ["grada", "grada", "bandera", "grada", "neumaticos"] },
  granrecta: { cieloTop: "#3a2412", cieloBottom: "#1c130a", pastoA: "#4A3A22", pastoB: "#54432A", curbA: "#E29A3B", curbB: "#EDEDED", secuenciaDecos: ["roca", "bandera", "neumaticos", "roca", "grada"] },
  serpiente: { cieloTop: "#0a2a1a", cieloBottom: "#05150c", pastoA: "#0F3B1F", pastoB: "#134526", curbA: "#E23B3B", curbB: "#EDEDED", secuenciaDecos: ["arbol", "arbol", "neumaticos", "arbol", "bandera"] },
  herradura: { cieloTop: "#0c2438", cieloBottom: "#08141f", pastoA: "#123047", pastoB: "#163a54", curbA: COLORS.neonBlue, curbB: "#EDEDED", secuenciaDecos: ["neumaticos", "bandera", "grada", "neumaticos", "arbol"] },
  zigzag: { cieloTop: "#3a1c30", cieloBottom: "#1c0e18", pastoA: "#2E1A3A", pastoB: "#38203F", curbA: "#E2833B", curbB: "#EDEDED", secuenciaDecos: ["bandera", "neumaticos", "arbol", "bandera", "roca"] },
  volcan: { cieloTop: "#3a0d0d", cieloBottom: "#1a0505", pastoA: "#2A1414", pastoB: "#331717", curbA: "#1A1A1E", curbB: COLORS.neonAmber, secuenciaDecos: ["roca", "roca", "bandera", "roca", "neumaticos"] },
};

// Circuito rectangular: dos rectas + dos semicírculos de 180° — nunca se autointersecta.
function construirCircuitoRectangular(recta, radio) {
  const nRecta = 44, nCurva = 46;
  const pts = [];
  for (let i = 0; i < nRecta; i++) {
    const t = i / nRecta;
    pts.push({ x: -recta / 2 + t * recta, y: -radio });
  }
  for (let i = 0; i < nCurva; i++) {
    const ang = -Math.PI / 2 + (i / nCurva) * Math.PI;
    pts.push({ x: recta / 2 + Math.cos(ang) * radio, y: Math.sin(ang) * radio });
  }
  for (let i = 0; i < nRecta; i++) {
    const t = i / nRecta;
    pts.push({ x: recta / 2 - t * recta, y: radio });
  }
  for (let i = 0; i < nCurva; i++) {
    const ang = Math.PI / 2 + (i / nCurva) * Math.PI;
    pts.push({ x: -recta / 2 + Math.cos(ang) * radio, y: Math.sin(ang) * radio });
  }
  return pts;
}

// Spline Catmull-Rom (pasa exactamente por cada punto de control, a diferencia de Bézier) — genera
// una curva cerrada suave uniendo N puntos de control en secuencia.
function evaluarCatmullRomGP(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  const x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
  const y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
  return { x, y };
}
function construirPistaSplineGP(controlPoints, segmentosPorTramo) {
  const n = controlPoints.length;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const p0 = controlPoints[(i - 1 + n) % n], p1 = controlPoints[i], p2 = controlPoints[(i + 1) % n], p3 = controlPoints[(i + 2) % n];
    for (let s = 0; s < segmentosPorTramo; s++) {
      pts.push(evaluarCatmullRomGP(p0, p1, p2, p3, s / segmentosPorTramo));
    }
  }
  return pts;
}
// Puntos de control en coordenadas polares con ángulo SIEMPRE creciente alrededor de un centro
// (radio = base + dos armónicos senoidales) — matemáticamente "estrella-convexa": un único radio
// por ángulo, así la curva jamás puede cruzarse a sí misma sin importar qué tan ondulada quede.
function construirControlesPolaresGP(nCtrl, base, a1, k1, fase1, a2, k2, fase2) {
  const pts = [];
  for (let i = 0; i < nCtrl; i++) {
    const ang = (Math.PI * 2 * i) / nCtrl;
    const r = base + a1 * Math.sin(k1 * ang + fase1) + a2 * Math.sin(k2 * ang + fase2);
    pts.push({ x: r * Math.cos(ang), y: r * Math.sin(ang) });
  }
  return pts;
}

// Índice del punto de la curva más cercano a (x,y), buscando en una ventana alrededor del último
// índice conocido (mucho más barato que recorrer los ~200-300 puntos enteros cada cuadro, para 16
// autos). "pista" es el circuito activo de esta carrera (uno de GP_PISTAS).
function indiceCercanoGP(pista, x, y, idxAprox) {
  const N = pista.nPuntos;
  let mejorIdx = idxAprox, mejorD = Infinity;
  for (let d = -18; d <= 18; d++) {
    const i = ((idxAprox + d) % N + N) % N;
    const p = pista.centerline[i];
    const dx = p.x - x, dy = p.y - y;
    const dist = dx * dx + dy * dy;
    if (dist < mejorD) { mejorD = dist; mejorIdx = i; }
  }
  return { idx: mejorIdx, dist: Math.sqrt(mejorD) };
}

// Vector perpendicular a la curva en un punto (para offsets de línea de carrera de los bots).
function lateralEnGP(pista, idx) {
  const N = pista.nPuntos;
  const a = pista.centerline[(idx - 1 + N) % N];
  const b = pista.centerline[(idx + 1) % N];
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: -dy / len, y: dx / len };
}

// Ambientación del circuito: gradas, árboles, banderas y pilas de neumáticos ubicados a intervalos
// fijos alrededor del óvalo (por fuera del ancho de pista), todo dibujado con formas vectoriales —
// no depende de ningún PNG. Se calcula una sola vez (el circuito no cambia) y el tipo de cada
// elemento sale de su índice, así siempre queda igual entre partidas (nada parpadea ni se reubica
// solo). Inspirado en las convenciones visuales típicas de juegos de carreras top-down (asfalto
// gris con pianito rojo/blanco, pasto con franjas de corte, gradas y banderas de colores).
function construirDecoracionesGP(pista) {
  const decos = [];
  const paso = 7; // cada cuántos puntos de la curva va un elemento
  const secuencia = (pista.tema && pista.tema.secuenciaDecos) || ["grada", "arbol", "neumaticos", "arbol", "bandera"];
  for (let i = 0; i < pista.nPuntos; i += paso) {
    const p = pista.centerline[i];
    const lat = lateralEnGP(pista, i);
    const cicloTipo = Math.floor(i / paso) % secuencia.length;
    const tipo = secuencia[cicloTipo];
    const lado = (Math.floor(i / paso) % 2 === 0) ? 1 : -1;
    const offset = GP_TRACK_MITAD + 46 + (tipo === "grada" ? 30 : 0) + (Math.sin(i * 0.7) * 12);
    decos.push({
      tipo,
      x: p.x + lat.x * offset * lado,
      y: p.y + lat.y * offset * lado,
      rot: Math.atan2(lat.y, lat.x) * lado,
      lado,
    });
  }
  return decos;
}

function dibujarArbolGP(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath(); ctx.ellipse(2, 4, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#3D2A16";
  ctx.fillRect(-2.5, -6, 5, 12);
  const copas = [[-6, -18, 11], [6, -20, 12], [0, -28, 13]];
  copas.forEach(([cx, cy, r], idx) => {
    ctx.fillStyle = idx % 2 === 0 ? "#1F7A3A" : "#238C42";
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  });
  ctx.restore();
}

function dibujarGradaGP(ctx, x, y, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const ancho = 64, alto = 26;
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect(-ancho / 2, 6, ancho, 6);
  // Estructura del techo/soporte.
  ctx.fillStyle = "#2A2E38";
  ctx.fillRect(-ancho / 2 - 4, -alto / 2 - 6, ancho + 8, 6);
  // Gradas escalonadas con "espectadores" como puntos de color.
  const filas = 4;
  for (let f = 0; f < filas; f++) {
    const fy = -alto / 2 + f * (alto / filas) + 2;
    ctx.fillStyle = f % 2 === 0 ? "#3A3F4C" : "#31353F";
    ctx.fillRect(-ancho / 2, fy, ancho, alto / filas - 1);
    for (let s = 0; s < 9; s++) {
      const sx = -ancho / 2 + 4 + s * (ancho - 8) / 8;
      const hue = (s * 53 + f * 97) % 360;
      ctx.fillStyle = `hsl(${hue}, 65%, ${55 + (f % 2) * 8}%)`;
      ctx.beginPath(); ctx.arc(sx, fy + (alto / filas) / 2, 1.6, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

function dibujarNeumaticosGP(ctx, x, y, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const posiciones = [[-8, 0], [8, 0], [0, -9], [-8, -14], [8, -14]];
  posiciones.forEach(([px, py]) => {
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath(); ctx.ellipse(px + 1, py + 6, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#1A1A1E";
    ctx.beginPath(); ctx.arc(px, py, 6.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#EDEDED";
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(px, py, 6.5, 0, Math.PI * 2); ctx.stroke();
  });
  ctx.restore();
}

function dibujarBanderaGP(ctx, x, y, rot, colorId) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = "#8A8E98";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(0, -26); ctx.stroke();
  const colores = ["#E23B3B", COLORS.neonAmber, COLORS.neonBlue, "#EDEDED"];
  ctx.fillStyle = colores[colorId % colores.length];
  ctx.beginPath();
  ctx.moveTo(0, -26); ctx.lineTo(16, -21); ctx.lineTo(0, -16);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function dibujarRocaGP(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath(); ctx.ellipse(2, 5, 13, 5, 0, 0, Math.PI * 2); ctx.fill();
  const bloques = [[-6, -2, 10], [5, 0, 9], [0, -8, 8]];
  bloques.forEach(([bx, by, r], i) => {
    ctx.fillStyle = i % 2 === 0 ? "#5A5449" : "#6E675A";
    ctx.beginPath();
    ctx.moveTo(bx, by - r);
    ctx.lineTo(bx + r * 0.9, by - r * 0.2);
    ctx.lineTo(bx + r * 0.5, by + r * 0.8);
    ctx.lineTo(bx - r * 0.6, by + r * 0.7);
    ctx.lineTo(bx - r * 0.9, by - r * 0.3);
    ctx.closePath();
    ctx.fill();
  });
  ctx.restore();
}

function dibujarDecoracionGP(ctx, deco, idx) {
  if (deco.tipo === "arbol") dibujarArbolGP(ctx, deco.x, deco.y);
  else if (deco.tipo === "grada") dibujarGradaGP(ctx, deco.x, deco.y, deco.rot);
  else if (deco.tipo === "neumaticos") dibujarNeumaticosGP(ctx, deco.x, deco.y, deco.rot);
  else if (deco.tipo === "roca") dibujarRocaGP(ctx, deco.x, deco.y);
  else dibujarBanderaGP(ctx, deco.x, deco.y, deco.rot, idx);
}

// Curbs tipo "pianito": bloques cortos alternados rojo/blanco pegados a cada borde de la pista,
// orientados con la tangente de la curva en ese punto — más parecido a un circuito real que una
// simple línea punteada.
function dibujarCurbsGP(ctx, pista) {
  const pasoCurb = 2;
  const tema = pista.tema || GP_TEMAS.ovalo;
  for (let i = 0; i < pista.nPuntos; i += pasoCurb) {
    const p = pista.centerline[i];
    const lat = lateralEnGP(pista, i);
    const sig = pista.centerline[(i + 1) % pista.nPuntos];
    const tangRot = Math.atan2(sig.y - p.y, sig.x - p.x);
    const color = Math.floor(i / pasoCurb) % 2 === 0 ? tema.curbA : tema.curbB;
    ctx.fillStyle = color;
    [1, -1].forEach((lado) => {
      const cx = p.x + lat.x * GP_TRACK_MITAD * lado;
      const cy = p.y + lat.y * GP_TRACK_MITAD * lado;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(tangRot);
      ctx.fillRect(-1, -8, 10, 16);
      ctx.restore();
    });
  }
}

// Valla: raya tipo bandera de carreras (rojo/blanco a rayas) dibujada en el límite físico real
// (GP_MURO_DIST) a cada lado de la pista — así el jugador VE dónde está el límite antes de pegar
// contra él, no es una pared invisible.
function dibujarVallaGP(ctx, pista) {
  const trazar = (signo) => {
    ctx.beginPath();
    for (let i = 0; i <= pista.nPuntos; i++) {
      const idx = i % pista.nPuntos;
      const p = pista.centerline[idx];
      const lat = lateralEnGP(pista, idx);
      const x = p.x + lat.x * GP_MURO_DIST * signo, y = p.y + lat.y * GP_MURO_DIST * signo;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  };
  ctx.save();
  ctx.lineWidth = 6;
  ctx.lineJoin = "round";
  [1, -1].forEach((signo) => {
    ctx.setLineDash([18, 18]);
    ctx.strokeStyle = "#E23B3B";
    trazar(signo); ctx.stroke();
    ctx.setLineDash([18, 18]);
    ctx.lineDashOffset = 18;
    ctx.strokeStyle = "#EDEDED";
    trazar(signo); ctx.stroke();
  });
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
  ctx.restore();
}

function dibujarParticulaGP(ctx, p) {
  const vidaFrac = Math.max(0, p.vida / p.vidaMax);
  ctx.save();
  if (p.tipo === "chispa") {
    ctx.globalAlpha = vidaFrac;
    ctx.fillStyle = COLORS.neonAmber;
    ctx.shadowColor = COLORS.neonAmber;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (p.tipo === "humo") {
    ctx.globalAlpha = vidaFrac * 0.35;
    ctx.fillStyle = "#CCCCCC";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3 + (1 - vidaFrac) * 6, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.globalAlpha = vidaFrac * 0.3;
    ctx.fillStyle = "#8A6B3D";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2 + (1 - vidaFrac) * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

const GP_PATRON_PASTO_CACHE = {};
function obtenerPatronPastoGP(ctx, tema) {
  const t = tema || GP_TEMAS.ovalo;
  if (GP_PATRON_PASTO_CACHE[t.pastoA]) return GP_PATRON_PASTO_CACHE[t.pastoA];
  const tile = document.createElement("canvas");
  tile.width = 96; tile.height = 96;
  const tctx = tile.getContext("2d");
  tctx.fillStyle = t.pastoA;
  tctx.fillRect(0, 0, 96, 96);
  tctx.fillStyle = t.pastoB;
  tctx.fillRect(0, 0, 96, 48);
  const patron = ctx.createPattern(tile, "repeat");
  GP_PATRON_PASTO_CACHE[t.pastoA] = patron;
  return patron;
}

// Arma el objeto completo de un circuito a partir de su curva de puntos ya generada: longitud
// acumulada punto a punto (para medir progreso/posiciones), largo total de vuelta y la
// ambientación (gradas/árboles/neumáticos/banderas) calculada una sola vez.
// Cofres de poderes: repartidos a intervalos regulares sobre la propia línea central de la pista
// (a diferencia de la ambientación, que va al costado) — unos 8-9 por vuelta.
function construirCofresGP(pista) {
  const cofres = [];
  const paso = Math.max(12, Math.floor(pista.nPuntos / 9));
  for (let i = 0; i < pista.nPuntos; i += paso) {
    const p = pista.centerline[i];
    cofres.push({ idx: i, x: p.x, y: p.y, activo: true, respawnEn: 0 });
  }
  return cofres;
}

function construirPistaGP(id, nombre, centerline) {
  const nPuntos = centerline.length;
  const longitudes = [0];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 1; i <= nPuntos; i++) {
    const a = centerline[i - 1];
    const b = centerline[i % nPuntos];
    longitudes.push(longitudes[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  centerline.forEach((p) => {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  });
  const pista = {
    id, nombre, centerline, nPuntos, longitudes, largoVuelta: longitudes[nPuntos],
    tema: GP_TEMAS[id] || GP_TEMAS.ovalo, bbox: { minX, maxX, minY, maxY },
  };
  pista.decoraciones = construirDecoracionesGP(pista);
  pista.cofres = construirCofresGP(pista);
  return pista;
}

// 8 circuitos épicos: 4 rectangulares (rectas reales + curvas de 180°, buenos para horquillas y
// rectas largas) y 4 generados con spline Catmull-Rom sobre puntos de control polares (curvas más
// orgánicas, eses y sectores técnicos) — todos escalados para ~30s de vuelta a GP_VEL_MAX_BASE.
const GP_PISTAS = [
  // Las 3 rectangulares "aburridas" (recta muchísimo más larga que el radio de las curvas) fueron
  // re-escaladas: mismo generador 100% seguro (dos rectas + dos semicírculos, nunca se
  // autointerseca), pero con radios de curva mucho más grandes — así quedan curvas amplias y
  // cerradas de verdad, buenas para derrapar, en vez de dos rectas larguísimas unidas por curvitas.
  construirPistaGP("ovalo", "Óvalo Clásico", construirCircuitoRectangular(950, 1050)),
  construirPistaGP("autodromo", "Autódromo Norte", construirCircuitoRectangular(2080, 850)),
  construirPistaGP("estadio", "Estadio Doble", construirCircuitoRectangular(587, 1017)),
  construirPistaGP("granrecta", "Gran Recta Cúpula", construirCircuitoRectangular(2701, 700)),
  construirPistaGP("serpiente", "Circuito Serpiente", construirPistaSplineGP(
    construirControlesPolaresGP(20, 1248, 225, 3, 0.3, 75, 7, 1.1), 14
  )),
  construirPistaGP("herradura", "Herradura Brava", construirPistaSplineGP(
    construirControlesPolaresGP(16, 1009, 283, 2, 0.0, 71, 5, 0.6), 14
  )),
  construirPistaGP("zigzag", "Zigzag Costero", construirPistaSplineGP(
    construirControlesPolaresGP(24, 983, 138, 4, 0.5, 98, 9, 0.2), 14
  )),
  construirPistaGP("volcan", "Anillo Volcán", construirPistaSplineGP(
    construirControlesPolaresGP(14, 1436, 144, 1, 0.0, 57, 3, 0.4), 14
  )),
];

// Modo Torneo: arma una secuencia de "cantidad" pistas al azar (sistema de "bolsa" — se baraja el
// set completo de las 8 y se va sacando una por una; si el torneo pide más carreras que pistas
// existen, se vuelve a barajar en vez de repetir siempre en el mismo orden).
function pistasAleatoriasGP(cantidad) {
  const ids = GP_PISTAS.map((p) => p.id);
  const resultado = [];
  let bolsa = [];
  while (resultado.length < cantidad) {
    if (bolsa.length === 0) bolsa = [...ids].sort(() => Math.random() - 0.5);
    resultado.push(bolsa.pop());
  }
  return resultado;
}

function crearAutoGP({ esBot, skinIndex, idxInicial }, pista) {
  const p = pista.centerline[idxInicial];
  const lat = lateralEnGP(pista, idxInicial);
  const offsetSalida = esBot ? (Math.random() * 2 - 1) * GP_TRACK_MITAD * 0.5 : 0;
  const sig = pista.centerline[(idxInicial + 1) % pista.nPuntos];
  const anguloInicial = Math.atan2(sig.y - p.y, sig.x - p.x);
  return {
    esBot, skinIndex,
    x: p.x + lat.x * offsetSalida, y: p.y + lat.y * offsetSalida,
    heading: anguloInicial, vx: 0, vy: 0,
    idxCercano: idxInicial, offRoad: false,
    enDerrape: false, derrapeHasta: 0,
    vueltas: -1, ultimaVueltaMs: 0, // -1 porque cruzar la salida al arrancar no debe contar
    // Los bots corren igual o levemente más rápido que el jugador (0.98x-1.12x) — bots "entrenados",
    // no relleno lento; el rubber-banding en entradaBotGP se encarga de que no se escapen solos.
    velMaxBase: GP_VEL_MAX_BASE * (esBot ? 0.98 + Math.random() * 0.14 : 1),
    offsetLinea: esBot ? (Math.random() * 2 - 1) * GP_TRACK_MITAD * 0.55 : 0,
    faseOffset: Math.random() * Math.PI * 2,
    lookahead: 9 + Math.floor(Math.random() * 6),
    // Poderes: un ítem a la vez (estilo Mario Kart), más los relojes de efectos activos.
    powerUp: null, turboHasta: 0, escudoHasta: 0, lentoHasta: 0,
  };
}

function progresoGP(auto, pista) {
  return Math.max(0, auto.vueltas) * pista.largoVuelta + pista.longitudes[auto.idxCercano];
}

// Sensor tipo raycast: ¿hay otro auto dentro de "distMax" a lo largo del rayo que sale de "auto" en
// dirección heading+anguloOffset? Se proyecta la posición relativa de cada otro auto sobre esa
// dirección (distancia hacia adelante) y sobre la perpendicular (qué tan centrado está en el "haz"
// del sensor, ancho fijo ~2x el radio de colisión). Devuelve el más cercano detectado o null — son
// las "3 antenas" (frente + 2 diagonales) que le dan a los bots ojos para esquivar/adelantar en vez
// de solo seguir la línea de la pista a ciegas.
function sensorGP(auto, anguloOffset, autos, distMax) {
  const ang = auto.heading + anguloOffset;
  const dirX = Math.cos(ang), dirY = Math.sin(ang);
  let masCercano = null, distMasCercana = Infinity;
  for (const otro of autos) {
    if (otro === auto) continue;
    const dx = otro.x - auto.x, dy = otro.y - auto.y;
    const adelante = dx * dirX + dy * dirY;
    if (adelante <= 0 || adelante > distMax) continue;
    const lateral = Math.abs(-dy * dirX + dx * dirY);
    if (lateral > GP_RADIO_COLISION * 2.4) continue;
    if (adelante < distMasCercana) { distMasCercana = adelante; masCercano = otro; }
  }
  return masCercano;
}

// Offset lateral ACTUAL del auto respecto al centro de la pista (con signo, en la misma base que
// lateralEnGP/offsetLinea) — se usa para saber qué tan cerca del borde/pasto está de verdad, más
// allá de hacia dónde esté mirando en este instante.
function offsetLateralActualGP(pista, auto) {
  const idx = auto.idxCercano;
  const p = pista.centerline[idx];
  const lat = lateralEnGP(pista, idx);
  return (auto.x - p.x) * lat.x + (auto.y - p.y) * lat.y;
}

// Le arma la entrada (acelerar/frenar/girar) a un bot mirando un punto más adelante en la curva,
// con su propio offset lateral (línea de carrera) para no ir todos pegados al centro, más:
//  · 3 sensores raycast (frente + 2 diagonales) para detectar autos cerca y esquivar/adelantar.
//  · Boost al 100% en recta despejada (curvatura baja y nada detectado adelante).
//  · Rubber-banding: si va bastante atrás del líder, un empujón extra de fuerza.
//  · Freno de seguridad de pista: si el esquive de un auto los estaba empujando hacia el pasto,
//    ahora SIEMPRE se prioriza volver a la pista por sobre esquivar — antes el esquive podía
//    ganarle a la línea de carrera y mandaba al bot derechito afuera.
//  · Poderes: los toman solos al pasar por un cofre y los usan con criterio simple (turbo en
//    recta, rayo si hay alguien justo adelante, aceite si los persiguen de cerca, escudo apenas
//    lo tienen porque es puramente defensivo).
//  · Malicia en la última vuelta: si van cuerpo a cuerpo con un rival cerca de la meta, un empujón
//    de verdad hacia él en vez de solo esquivarlo — juegan la posición como pediste.
function entradaBotGP(bot, autos, pista, totalVueltas) {
  const objIdx = (bot.idxCercano + bot.lookahead) % pista.nPuntos;
  const lat = lateralEnGP(pista, objIdx);
  const offsetVivo = bot.offsetLinea * (0.7 + 0.3 * Math.sin(Date.now() / 1400 + bot.faseOffset));
  const obj = { x: pista.centerline[objIdx].x + lat.x * offsetVivo, y: pista.centerline[objIdx].y + lat.y * offsetVivo };
  let diff = Math.atan2(obj.y - bot.y, obj.x - bot.x) - bot.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  let dir = Math.max(-1, Math.min(1, diff * 2.4));

  // Curvatura más adelante, para frenar antes de curvas cerradas.
  const objLejosIdx = (bot.idxCercano + bot.lookahead * 3) % pista.nPuntos;
  const anguloAhora = Math.atan2(obj.y - bot.y, obj.x - bot.x);
  const objLejos = pista.centerline[objLejosIdx];
  let diffCurva = Math.atan2(objLejos.y - bot.y, objLejos.x - bot.x) - anguloAhora;
  while (diffCurva > Math.PI) diffCurva -= Math.PI * 2;
  while (diffCurva < -Math.PI) diffCurva += Math.PI * 2;
  const curvatura = Math.abs(diffCurva);
  const velActual = Math.hypot(bot.vx, bot.vy);
  let freno = curvatura > 0.85 && velActual > bot.velMaxBase * 0.55;

  // Sensores: si hay algo justo al frente, esquivar hacia el lado que las antenas diagonales ven
  // despejado (adelantar) — si ambos lados también están bloqueados, frenar un poco en vez de
  // empujar contra el tráfico.
  const frente = sensorGP(bot, 0, autos, GP_RAYCAST_DIST);
  if (frente) {
    const libreIzq = !sensorGP(bot, -GP_RAYCAST_ANGULO, autos, GP_RAYCAST_DIST * 0.8);
    const libreDer = !sensorGP(bot, GP_RAYCAST_ANGULO, autos, GP_RAYCAST_DIST * 0.8);
    if (libreIzq && (!libreDer || bot.offsetLinea <= 0)) dir = Math.max(-1, dir - 0.7);
    else if (libreDer) dir = Math.min(1, dir + 0.7);
    else freno = true;
  }

  // Malicia cerca de la meta: en la última vuelta, si hay un rival prácticamente al lado peleando
  // la posición, un empujón de dir hacia él (no solo esquivarlo) — bounded, no un volantazo.
  if (totalVueltas != null && bot.vueltas >= totalVueltas - 1) {
    let rival = null, distRival = Infinity;
    for (const otro of autos) {
      if (otro === bot) continue;
      const d = Math.hypot(otro.x - bot.x, otro.y - bot.y);
      if (d < 60 && d < distRival && Math.abs(progresoGP(otro, pista) - progresoGP(bot, pista)) < 45) {
        rival = otro; distRival = d;
      }
    }
    if (rival) {
      let angRival = Math.atan2(rival.y - bot.y, rival.x - bot.x) - bot.heading;
      while (angRival > Math.PI) angRival -= Math.PI * 2;
      while (angRival < -Math.PI) angRival += Math.PI * 2;
      dir = Math.max(-1, Math.min(1, dir + angRival * 0.4));
    }
  }

  // Freno de seguridad de pista: tiene PRIORIDAD sobre todo lo anterior — si el offset actual ya
  // se está pasando del borde, ignorar esquive/malicia y clavar el volante de vuelta al centro.
  const offsetActual = offsetLateralActualGP(pista, bot);
  if (Math.abs(offsetActual) > GP_LIMITE_OFFROAD_BOT) {
    dir = offsetActual > 0 ? -1 : 1;
  }

  // Boost: recta despejada (poca curvatura adelante y nada detectado por el sensor frontal).
  const boost = !freno && !frente && curvatura < 0.18;

  // Rubber-banding leve: si va bastante atrás de la punta, un empujón extra de fuerza para no
  // perder la carrera por completo (los líderes no reciben ayuda extra).
  const punta = Math.max(...autos.map((a) => progresoGP(a, pista)));
  const atras = punta - progresoGP(bot, pista);
  const rubberBand = atras > pista.largoVuelta * 0.12;

  // Poderes: criterio simple pero con intención — no los guardan indefinidamente.
  let usarPoder = false;
  if (bot.powerUp === "turbo") usarPoder = boost;
  else if (bot.powerUp === "rayo") usarPoder = !!frente;
  else if (bot.powerUp === "escudo") usarPoder = true;
  else if (bot.powerUp === "aceite") usarPoder = !!sensorGP(bot, Math.PI, autos, 95);

  return { accel: !freno, freno, dir, boost: boost || rubberBand, usarPoder };
}

// Rebufo: si hay otro auto justo adelante (dentro de ~105 unidades, bastante alineado con el
// heading), da un 22% extra de fuerza de motor — beneficia a quien va detrás, sea el jugador o un
// bot. Un poco más generoso en rango y efecto que antes (pedido explícito: "más activo").
function hayRebufoGP(auto, autos) {
  const dirH = { x: Math.cos(auto.heading), y: Math.sin(auto.heading) };
  for (const otro of autos) {
    if (otro === auto) continue;
    const dx = otro.x - auto.x, dy = otro.y - auto.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 105 || dist < 1) continue;
    const alineacion = (dx * dirH.x + dy * dirH.y) / dist;
    if (alineacion > 0.88) return true;
  }
  return false;
}

function actualizarFisicaAutoGP(auto, dt, entrada, rebufo) {
  const dirH = { x: Math.cos(auto.heading), y: Math.sin(auto.heading) };
  const dirL = { x: -dirH.y, y: dirH.x };
  const vAdelante = auto.vx * dirH.x + auto.vy * dirH.y;
  const vLateral = auto.vx * dirL.x + auto.vy * dirL.y;

  const factorSuperficie = auto.offRoad ? 0.6 : 1;
  const amortLateralBase = auto.offRoad ? 11 : 6.2;

  const ahora = Date.now();
  const turboActivo = !!auto.turboHasta && ahora < auto.turboHasta;
  const lentoActivo = !!auto.lentoHasta && ahora < auto.lentoHasta;

  // Derrape: automático al pasar el umbral de velocidad lateral (como siempre), PERO también se
  // puede pedir a mano con el botón/tecla de derrape mientras se gira a buena velocidad — deja el
  // control fino intacto (no cambia nada si no se usa) y agrega un derrape voluntario "a lo drift"
  // para quien lo quiera manejar activamente.
  const pideDerrapeManual = !!entrada.derrape && Math.abs(entrada.dir) > GP_DERRAPE_MANUAL_DIR_MIN && Math.abs(vAdelante) > auto.velMaxBase * 0.25;
  if (Math.abs(vLateral) > GP_UMBRAL_DERRAPE || pideDerrapeManual) auto.derrapeHasta = ahora + GP_DERRAPE_MS;
  auto.enDerrape = ahora < auto.derrapeHasta;
  // Durante el derrape el agarre lateral baja (el auto resbala de verdad hacia afuera de la curva)
  // pero sin pasarse — antes bajaba tanto (0.13x) que se sentía como manejar sobre hielo apenas se
  // giraba fuerte; ahora derrapa visiblemente pero se puede controlar.
  const amortLateral = auto.enDerrape ? amortLateralBase * 0.32 : amortLateralBase;

  let fuerza = 0;
  const acelerando = entrada.accel || turboActivo; // el turbo empuja solo, aunque no se toque el gas
  if (acelerando) fuerza += GP_FUERZA_MOTOR * (rebufo ? 1.22 : 1) * (entrada.boost ? GP_BOOST_RECTA : 1) * (turboActivo ? GP_TURBO_FUERZA : 1);
  if (entrada.freno && !turboActivo) fuerza -= GP_FUERZA_FRENO;

  let nuevoVAdelante = vAdelante + fuerza * dt;
  nuevoVAdelante *= Math.max(0, 1 - GP_RESISTENCIA * dt);
  const velMaxEfectiva = auto.velMaxBase * factorSuperficie * (lentoActivo ? GP_LENTO_FACTOR : 1) * (turboActivo ? 1.18 : 1);
  nuevoVAdelante = Math.max(-velMaxEfectiva * 0.45, Math.min(velMaxEfectiva, nuevoVAdelante));

  const nuevoVLateral = vLateral * Math.max(0, 1 - amortLateral * dt * 8);

  const velAbs = Math.hypot(auto.vx, auto.vy);
  if (velAbs > 6) {
    const factorVel = Math.min(1, velAbs / 130);
    const signo = nuevoVAdelante < 0 ? -1 : 1;
    auto.heading += entrada.dir * GP_GIRO_MAX * factorVel * dt * signo;
  }

  auto.vx = dirH.x * nuevoVAdelante + dirL.x * nuevoVLateral;
  auto.vy = dirH.y * nuevoVAdelante + dirL.y * nuevoVLateral;
  auto.x += auto.vx * dt;
  auto.y += auto.vy * dt;
}

// Colisión elástica real (anti-"pegado"): se separan las hitboxes al toque (posición) y se
// intercambia velocidad a lo largo del vector normal del choque con un coeficiente de restitución
// (masas iguales para los 16 autos) — a diferencia de solo frenarlos y mezclar velocidades sin
// rebote, esto SIEMPRE produce una velocidad de separación real a lo largo del normal, así que dos
// autos no pueden quedar empujándose en bucle infinito. Además hay un empuje mínimo garantizado
// (GP_EMPUJE_MINIMO) para el caso límite de dos autos yendo en paralelo a la misma velocidad, donde
// la velocidad relativa de acercamiento es casi cero y aun así hay que separarlos de verdad. Un
// golpe fuerte (velocidad relativa alta) además tira a ambos autos a un derrape forzado con un
// pequeño giro brusco — "salen proyectados" en vez de solo detenerse.
function resolverColisionesGP(st) {
  const autos = st.autos;
  const minDist = GP_RADIO_COLISION * 2;
  for (let i = 0; i < autos.length; i++) {
    for (let j = i + 1; j < autos.length; j++) {
      const a = autos[i], b = autos[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.001 && dist < minDist) {
        const nx = dx / dist, ny = dy / dist; // normal de a hacia b
        const tx = -ny, ty = nx; // tangente (perpendicular al normal)

        // 1) Separación posicional inmediata — nunca deja overlap residual.
        const solape = (minDist - dist) / 2 + 0.5;
        a.x -= nx * solape; a.y -= ny * solape;
        b.x += nx * solape; b.y += ny * solape;

        // 2) Intercambio elástico de velocidad a lo largo del normal (masas iguales).
        const vnA = a.vx * nx + a.vy * ny, vnB = b.vx * nx + b.vy * ny;
        const vtA = a.vx * tx + a.vy * ty, vtB = b.vx * tx + b.vy * ty;
        const relVn = vnA - vnB; // >0 = se están acercando a lo largo del normal
        let vnA2 = vnA, vnB2 = vnB;
        if (relVn > 0) {
          const impulso = ((1 + GP_RESTITUCION) / 2) * relVn;
          vnA2 = vnA - impulso;
          vnB2 = vnB + impulso;
        }
        // Empuje mínimo garantizado, aunque no se estén acercando (autos yendo en paralelo a la
        // misma velocidad) — sin esto, ese caso puntual no genera ninguna velocidad de separación.
        vnA2 -= GP_EMPUJE_MINIMO / 2;
        vnB2 += GP_EMPUJE_MINIMO / 2;

        a.vx = vnA2 * nx + vtA * tx; a.vy = vnA2 * ny + vtA * ty;
        b.vx = vnB2 * nx + vtB * tx; b.vy = vnB2 * ny + vtB * ty;

        // 3) Golpe fuerte → derrape forzado + pequeño giro brusco en ambos, simulando perder el
        // control un instante (choque real de carreras, no solo un frenón). El poder "escudo" no
        // hace al auto invencible a los choques (la física de separación de arriba sigue igual de
        // normal, así no se vuelve una pared que rompe el juego) — solo evita QUE ESE auto en
        // particular pierda el control por el golpe.
        const relSpeed = Math.hypot(a.vx - b.vx, a.vy - b.vy);
        if (relVn > GP_GOLPE_DERRAPE_UMBRAL || relSpeed > GP_GOLPE_DERRAPE_UMBRAL) {
          const ahora = Date.now();
          const aEscudo = a.escudoHasta && ahora < a.escudoHasta;
          const bEscudo = b.escudoHasta && ahora < b.escudoHasta;
          const giro = 0.18 + Math.random() * 0.16;
          if (!aEscudo) { a.derrapeHasta = ahora + GP_DERRAPE_MS; a.enDerrape = true; a.heading -= giro; }
          if (!bEscudo) { b.derrapeHasta = ahora + GP_DERRAPE_MS; b.enDerrape = true; b.heading += giro; }
          // Efecto de impacto: chispas en el punto de contacto + una sacudida de cámara chica (solo
          // si el jugador fue parte del choque, para no sacudir la pantalla por golpes ajenos).
          const golpeX = (a.x + b.x) / 2, golpeY = (a.y + b.y) / 2;
          for (let p = 0; p < 7; p++) {
            const ang = Math.random() * Math.PI * 2, vel = 60 + Math.random() * 90;
            st.particulas.push({ x: golpeX, y: golpeY, vx: Math.cos(ang) * vel, vy: Math.sin(ang) * vel, vida: 0.35, vidaMax: 0.35, tipo: "chispa" });
          }
          if (a === st.jugador || b === st.jugador) st.sacudida = Math.max(st.sacudida, 12);
        }
      }
    }
  }
}

function crearEstadoGP(skinJugador, totalVueltas, pistaId) {
  const pista = GP_PISTAS.find((p) => p.id === pistaId) || GP_PISTAS[0];
  const autos = [];
  // Grilla de largada: todos arrancan un poco antes del índice 0 (la línea de meta), en filas
  // escalonadas para no aparecer superpuestos.
  const idxSalida = pista.nPuntos - 6;
  const orden = [{ esBot: false, skinIndex: skinJugador }];
  const skinsBots = [];
  for (let i = 0; i < GP_NUM_BOTS; i++) skinsBots.push((skinJugador + 1 + i) % 16);
  for (const s of skinsBots) orden.push({ esBot: true, skinIndex: s });
  orden.forEach((o, i) => {
    const idx = (idxSalida - Math.floor(i / 2) * 3 + pista.nPuntos) % pista.nPuntos;
    const auto = crearAutoGP({ esBot: o.esBot, skinIndex: o.skinIndex, idxInicial: idx }, pista);
    if (o.esBot) auto.offsetLinea = (i % 2 === 0 ? 1 : -1) * GP_TRACK_MITAD * 0.4;
    autos.push(auto);
  });
  return {
    pista, autos, jugador: autos[0], totalVueltas,
    inicioMs: Date.now(), terminado: false, posicionFinalJugador: 0,
    marcasDerrape: [], particulas: [], sacudida: 0, camara: { x: autos[0].x, y: autos[0].y },
    cuentaRegresiva: 3.2,
    // Poderes: manchas de aceite tiradas en la pista (independientes de cada auto).
    aceites: [],
    // Récord de vuelta: se arranca a contar recién cuando termina la cuenta regresiva.
    vueltasTiempos: [], mejorVuelta: null, peorVuelta: null, inicioVueltaMs: null,
  };
}

// Aplica el efecto de un power-up recién usado (turbo/escudo/aceite/rayo) — ver los comentarios de
// cada const GP_* arriba para los valores. No es invasivo: nada tira a nadie fuera de la pista ni
// bloquea el control por completo, solo da ventajas/desventajas temporales chicas.
function usarPoderGP(auto, autos, st) {
  const tipo = auto.powerUp;
  if (!tipo) return;
  auto.powerUp = null;
  const ahora = Date.now();
  if (tipo === "turbo") {
    auto.turboHasta = ahora + GP_TURBO_MS;
  } else if (tipo === "escudo") {
    auto.escudoHasta = ahora + GP_ESCUDO_MS;
  } else if (tipo === "aceite") {
    const dirH = { x: Math.cos(auto.heading), y: Math.sin(auto.heading) };
    st.aceites.push({ x: auto.x - dirH.x * 26, y: auto.y - dirH.y * 26, vida: GP_ACEITE_VIDA, usado: false });
  } else if (tipo === "rayo") {
    // Apunta al rival inmediatamente adelante en progreso de carrera — un poder ofensivo real.
    let objetivo = null, mejorDif = Infinity;
    const progresoAuto = progresoGP(auto, st.pista);
    for (const otro of autos) {
      if (otro === auto) continue;
      const dif = progresoGP(otro, st.pista) - progresoAuto;
      if (dif > 0 && dif < mejorDif) { mejorDif = dif; objetivo = otro; }
    }
    if (objetivo && !(objetivo.escudoHasta && ahora < objetivo.escudoHasta)) {
      objetivo.lentoHasta = ahora + GP_LENTO_MS;
    }
  }
}

function actualizarGP(st, dt, entrada) {
  if (st.cuentaRegresiva > 0) {
    st.cuentaRegresiva -= dt;
    if (st.cuentaRegresiva <= 0) st.inicioVueltaMs = Date.now();
    return;
  }
  const pista = st.pista;
  const ahora = Date.now();

  // Cofres de poderes: los que están apagados vuelven a activarse pasado su respawn; los activos
  // se los lleva el primer auto (sin ítem en mano) que pase cerca.
  for (const cofre of pista.cofres) {
    if (!cofre.activo) {
      if (ahora >= cofre.respawnEn) cofre.activo = true;
      continue;
    }
    for (const auto of st.autos) {
      if (auto.powerUp) continue;
      if (Math.hypot(auto.x - cofre.x, auto.y - cofre.y) < GP_COFRE_RADIO) {
        auto.powerUp = GP_TIPOS_PODER[Math.floor(Math.random() * GP_TIPOS_PODER.length)];
        cofre.activo = false;
        cofre.respawnEn = ahora + GP_COFRE_RESPAWN_MS;
        break;
      }
    }
  }

  // Manchas de aceite: un solo golpe por mancha (como una banana de Mario Kart) — el auto que la
  // pisa (sin escudo) entra en derrape forzado con un pequeño giro brusco.
  st.aceites.forEach((h) => { h.vida -= dt; });
  st.aceites = st.aceites.filter((h) => h.vida > 0 && !h.usado);
  for (const h of st.aceites) {
    for (const auto of st.autos) {
      if (auto.escudoHasta && ahora < auto.escudoHasta) continue;
      if (Math.hypot(auto.x - h.x, auto.y - h.y) < GP_ACEITE_RADIO) {
        h.usado = true;
        auto.derrapeHasta = ahora + GP_DERRAPE_MS;
        auto.enDerrape = true;
        auto.heading += (Math.random() < 0.5 ? -1 : 1) * (0.2 + Math.random() * 0.15);
        break;
      }
    }
  }

  for (const auto of st.autos) {
    const cercano = indiceCercanoGP(pista, auto.x, auto.y, auto.idxCercano);
    const idxPrevio = auto.idxCercano;
    auto.idxCercano = cercano.idx;
    auto.offRoad = cercano.dist > GP_TRACK_MITAD;

    // Vuelta: el índice más cercano pasa de estar cerca del final (N-1) a cerca del arranque (0).
    if (idxPrevio > pista.nPuntos * 0.75 && auto.idxCercano < pista.nPuntos * 0.25) {
      auto.vueltas += 1;
      auto.ultimaVueltaMs = Date.now();
      // Récord de mejor/peor vuelta — solo del jugador, y solo vueltas completas de verdad (la
      // primera vez que se cruza la meta al arrancar no cuenta, por eso el >= 1).
      if (auto === st.jugador && auto.vueltas >= 1) {
        const duracion = (ahora - (st.inicioVueltaMs || ahora)) / 1000;
        st.vueltasTiempos.push(duracion);
        if (st.mejorVuelta === null || duracion < st.mejorVuelta) st.mejorVuelta = duracion;
        if (st.peorVuelta === null || duracion > st.peorVuelta) st.peorVuelta = duracion;
      }
      if (auto === st.jugador) st.inicioVueltaMs = ahora;
      if (!auto.esBot && auto.vueltas >= st.totalVueltas && !st.terminado) {
        st.terminado = true;
        const ordenados = [...st.autos].sort((a, b) => progresoGP(b, pista) - progresoGP(a, pista));
        st.posicionFinalJugador = ordenados.indexOf(st.jugador) + 1;
      }
    }

    const entradaAuto = auto.esBot ? entradaBotGP(auto, st.autos, pista, st.totalVueltas) : entrada;
    if (entradaAuto.usarPoder) usarPoderGP(auto, st.autos, st);
    const rebufo = hayRebufoGP(auto, st.autos);
    actualizarFisicaAutoGP(auto, dt, entradaAuto, rebufo);

    // Valla física: si alguien se pasa del límite de "escape" más allá del borde de pista, lo frena
    // en seco ahí y le anula/rebota la velocidad que iba hacia afuera — nadie puede seguir de largo
    // hacia el pasto sin fin. Antes esto no existía y quedarse "varado" lejos de la pista (con el
    // 60% de velocidad y mucho menos agarre por ir offRoad) se sentía como quedarse sin motor.
    const offLat = offsetLateralActualGP(pista, auto);
    if (Math.abs(offLat) > GP_MURO_DIST) {
      const idxM = auto.idxCercano;
      const pM = pista.centerline[idxM];
      const latM = lateralEnGP(pista, idxM);
      const signoM = offLat > 0 ? 1 : -1;
      auto.x = pM.x + latM.x * GP_MURO_DIST * signoM;
      auto.y = pM.y + latM.y * GP_MURO_DIST * signoM;
      const vLatM = auto.vx * latM.x + auto.vy * latM.y;
      if (vLatM * signoM > 0) {
        auto.vx -= latM.x * vLatM * GP_MURO_REBOTE;
        auto.vy -= latM.y * vLatM * GP_MURO_REBOTE;
      }
    }

    // Marcas de derrape continuas (sin sorteo) mientras dure el estado — un derrape de verdad deja
    // un rastro negro parejo en el asfalto, no puntitos intermitentes. Además, humo de neumático
    // mientras derrapa y polvo mientras anda por el pasto — efectos de movimiento, no solo la marca.
    if (auto.enDerrape) {
      st.marcasDerrape.push({ x: auto.x, y: auto.y, vida: 2.2, vidaMax: 2.2 });
      if (Math.random() < 0.55) {
        st.particulas.push({ x: auto.x, y: auto.y, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20, vida: 0.6, vidaMax: 0.6, tipo: "humo" });
      }
    } else if (auto.offRoad && Math.hypot(auto.vx, auto.vy) > 40 && Math.random() < 0.4) {
      st.particulas.push({ x: auto.x, y: auto.y, vx: -auto.vx * 0.15 + (Math.random() - 0.5) * 25, vy: -auto.vy * 0.15 + (Math.random() - 0.5) * 25, vida: 0.45, vidaMax: 0.45, tipo: "polvo" });
    }
  }
  resolverColisionesGP(st);
  st.marcasDerrape = st.marcasDerrape.filter((m) => (m.vida -= dt) > 0);
  st.particulas.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vida -= dt; });
  st.particulas = st.particulas.filter((p) => p.vida > 0);
  st.sacudida = Math.max(0, st.sacudida * Math.max(0, 1 - dt * 9));
  // Tope defensivo de rendimiento: con hasta 16 autos derrapando/levantando polvo a la vez de forma
  // continua los arreglos podrían crecer mucho — se descartan los elementos más viejos primero.
  if (st.marcasDerrape.length > 500) st.marcasDerrape.splice(0, st.marcasDerrape.length - 500);
  if (st.particulas.length > 400) st.particulas.splice(0, st.particulas.length - 400);

  // Cámara: sigue al jugador con un adelanto en la dirección en que se está moviendo (no
  // necesariamente hacia donde mira el auto — durante un derrape puede ser distinto).
  const j = st.jugador;
  const velAbs = Math.hypot(j.vx, j.vy);
  const dirCam = velAbs > 25
    ? { x: j.vx / velAbs, y: j.vy / velAbs }
    : { x: Math.cos(j.heading), y: Math.sin(j.heading) };
  const factor = Math.min(1, velAbs / GP_VEL_MAX_BASE);
  const objX = j.x + dirCam.x * GP_CAMARA_LOOKAHEAD * factor;
  const objY = j.y + dirCam.y * GP_CAMARA_LOOKAHEAD * factor;
  const suavidad = 1 - Math.pow(GP_CAMARA_SUAVIDAD, dt);
  st.camara.x += (objX - st.camara.x) * suavidad;
  st.camara.y += (objY - st.camara.y) * suavidad;
}

// Recorta y dibuja un auto de la grilla 4x4 del spritesheet (16 celdas: [0] jugador, [1..15] bots).
// El sprite original mira "hacia arriba" (como casi todo asset top-down de autos) — como nuestro
// heading=0 apunta "hacia la derecha", se rota heading+90° para alinear el morro del auto.
function dibujarSombraAutoGP(ctx, auto, ancho, alto) {
  ctx.save();
  ctx.translate(auto.x + 3, auto.y + 4);
  ctx.rotate(auto.heading + Math.PI / 2);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(0, 0, ancho * 0.62, alto * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Íconos de poderes: cofre giratorio en la pista (sin recoger), mancha de aceite pegada al asfalto.
function dibujarCofreGP(ctx, cofre) {
  const t = Date.now() / 400;
  const escala = 0.85 + Math.sin(t + cofre.idx) * 0.12;
  ctx.save();
  ctx.translate(cofre.x, cofre.y);
  ctx.rotate(t * 0.6);
  ctx.scale(escala, escala);
  ctx.shadowColor = COLORS.neonAmber;
  ctx.shadowBlur = 12;
  ctx.fillStyle = COLORS.neonAmber;
  ctx.fillRect(-9, -9, 18, 18);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#3a2a06";
  ctx.lineWidth = 2;
  ctx.strokeRect(-9, -9, 18, 18);
  ctx.fillStyle = "#3a2a06";
  ctx.font = "800 13px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("?", 0, 1);
  ctx.restore();
}
function dibujarAceiteGP(ctx, h) {
  ctx.save();
  ctx.globalAlpha = Math.min(1, h.vida / 1.5);
  ctx.translate(h.x, h.y);
  ctx.fillStyle = "#0a0a0a";
  ctx.beginPath();
  ctx.ellipse(0, 0, GP_ACEITE_RADIO * 0.9, GP_ACEITE_RADIO * 0.62, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(140,120,255,0.35)";
  ctx.beginPath();
  ctx.ellipse(-4, -3, GP_ACEITE_RADIO * 0.4, GP_ACEITE_RADIO * 0.24, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function dibujarAutoGP(ctx, assets, auto, ancho, alto) {
  const img = assets.get("autos");
  const ahora = Date.now();
  // Estela de turbo: un par de trazos de velocidad naranjas detrás del auto mientras dura el boost.
  if (auto.turboHasta && ahora < auto.turboHasta) {
    ctx.save();
    ctx.translate(auto.x, auto.y);
    ctx.rotate(auto.heading + Math.PI / 2);
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = COLORS.neonAmber;
    ctx.shadowColor = COLORS.neonAmber;
    ctx.shadowBlur = 16;
    [-6, 6].forEach((ox) => {
      ctx.beginPath();
      ctx.moveTo(ox - 3, alto / 2 + 2);
      ctx.lineTo(ox + 3, alto / 2 + 2);
      ctx.lineTo(ox, alto / 2 + 20 + Math.random() * 10);
      ctx.closePath();
      ctx.fill();
    });
    ctx.restore();
  }
  ctx.save();
  ctx.translate(auto.x, auto.y);
  ctx.rotate(auto.heading + Math.PI / 2);
  if (img) {
    const cols = 4, filas = 4;
    const cw = img.width / cols, ch = img.height / filas;
    const col = auto.skinIndex % cols, fila = Math.floor(auto.skinIndex / cols);
    ctx.drawImage(img, col * cw, fila * ch, cw, ch, -ancho / 2, -alto / 2, ancho, alto);
  } else {
    const hue = (auto.skinIndex * 47) % 360;
    ctx.shadowColor = `hsl(${hue},90%,55%)`;
    ctx.shadowBlur = auto.esBot ? 4 : 10;
    ctx.fillStyle = `hsl(${hue},80%,50%)`;
    ctx.beginPath();
    ctx.moveTo(0, -alto / 2);
    ctx.lineTo(ancho / 2, alto / 2);
    ctx.lineTo(-ancho / 2, alto / 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  // Luces traseras neón (freno) — un par de rectángulos brillantes atrás del auto.
  ctx.shadowColor = auto.enDerrape ? COLORS.neonAmber : COLORS.neonRed;
  ctx.shadowBlur = auto.enDerrape ? 14 : 7;
  ctx.fillStyle = auto.enDerrape ? COLORS.neonAmber : "#FF2A2A";
  ctx.fillRect(-ancho / 2 + 2, alto / 2 - 3, 4, 3);
  ctx.fillRect(ancho / 2 - 6, alto / 2 - 3, 4, 3);
  ctx.shadowBlur = 0;
  ctx.restore();
  // Anillo de escudo: un aro translúcido girando alrededor del auto mientras dura.
  if (auto.escudoHasta && ahora < auto.escudoHasta) {
    ctx.save();
    ctx.translate(auto.x, auto.y);
    ctx.rotate(ahora / 300);
    ctx.strokeStyle = COLORS.neonBlue;
    ctx.shadowColor = COLORS.neonBlue;
    ctx.shadowBlur = 10;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(ancho, alto) * 0.62, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

// Mini-mapa: recuadro chico y semitransparente en una esquina (no invasivo) con el trazo de la
// pista completa y un punto por cada auto — para ubicar de un vistazo dónde va cada competidor sin
// taparle la pantalla al jugador.
function dibujarMinimapaGP(ctx, st, canvasW, canvasH) {
  const pista = st.pista;
  const tam = 118, margen = 14, pad = 12;
  const bx = canvasW - tam - margen, by = canvasH - tam - margen;
  const bbox = pista.bbox;
  const w = Math.max(1, bbox.maxX - bbox.minX), h = Math.max(1, bbox.maxY - bbox.minY);
  const escala = Math.min((tam - pad * 2) / w, (tam - pad * 2) / h);
  const offX = bx + tam / 2 - (bbox.minX + w / 2) * escala;
  const offY = by + tam / 2 - (bbox.minY + h / 2) * escala;

  ctx.save();
  ctx.fillStyle = "rgba(5,6,10,0.6)";
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(bx, by, tam, tam, 10); ctx.fill(); }
  else ctx.fillRect(bx, by, tam, tam);
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1;
  ctx.strokeRect(bx, by, tam, tam);

  ctx.beginPath();
  for (let i = 0; i < pista.nPuntos; i += 3) {
    const p = pista.centerline[i];
    const px = p.x * escala + offX, py = p.y * escala + offY;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 2;
  ctx.stroke();

  st.autos.forEach((auto) => {
    const px = auto.x * escala + offX, py = auto.y * escala + offY;
    ctx.beginPath();
    ctx.arc(px, py, auto === st.jugador ? 3.6 : 2, 0, Math.PI * 2);
    ctx.fillStyle = auto === st.jugador ? COLORS.neonAmber : "rgba(255,255,255,0.7)";
    ctx.fill();
  });
  ctx.restore();
}

// ── ONLINE — orquestación multijugador (nueva, no existe en el navegador) ──
//
// Nunca hay bots en línea: solo un auto por jugador humano conectado a la sala. Cada auto guarda
// su propio "jugadorId" (el socket.id) para saber a quién pertenece, y su propio cronómetro de
// vuelta (mejor/peor vuelta ya no es solo del "st.jugador" único como en modo solo — acá cada
// jugador tiene el suyo). La carrera de la sala termina recién cuando TODOS los que siguen
// conectados ya llegaron o se retiraron — nadie se queda esperando a un auto fantasma, pero
// tampoco se corta la carrera de los demás apenas llega el primero.
const ENTRADA_VACIA_GP = { accel: false, freno: false, dir: 0, derrape: false, usarPoder: false };

function crearEstadoGPOnline(jugadores, config) {
  const pistaId = (config && config.pistaId) || GP_PISTAS[0].id;
  const pista = GP_PISTAS.find((p) => p.id === pistaId) || GP_PISTAS[0];
  const totalVueltas = (config && config.vueltas) || 3;
  const idxSalida = pista.nPuntos - 6;
  const autos = jugadores.map((j, i) => {
    const idx = (idxSalida - Math.floor(i / 2) * 3 + pista.nPuntos) % pista.nPuntos;
    const auto = crearAutoGP({ esBot: false, skinIndex: (j.skinIndex != null ? j.skinIndex : i) % 16, idxInicial: idx }, pista);
    auto.jugadorId = j.id;
    auto.nombre = j.nombre || "Piloto";
    auto.vueltasTiempos = []; auto.mejorVuelta = null; auto.peorVuelta = null; auto.inicioVueltaMs = null;
    auto.llego = false; auto.retirado = false; auto.posicionFinal = 0;
    return auto;
  });
  return {
    pista, autos, totalVueltas,
    terminado: false, siguientePosicion: 1,
    cuentaRegresiva: 3.2,
    aceites: [],
  };
}

function retirarAutoGPOnline(st, jugadorId) {
  const auto = st.autos.find((a) => a.jugadorId === jugadorId);
  if (auto && !auto.llego && !auto.retirado) {
    auto.retirado = true;
    auto.posicionFinal = st.siguientePosicion++;
  }
}

// Igual que actualizarGP del navegador (mismo orden: cofres → aceites → por-auto física → colisiones)
// pero (a) cada auto no-bot usa SU PROPIA entrada por jugadorId en vez de una entrada compartida, y
// (b) el cronómetro de vuelta y la condición de llegada son por auto, no solo del "st.jugador" único.
// Las partículas/marcas de derrape (puramente visuales) se dejan afuera a propósito — cada cliente
// las genera localmente mirando enDerrape/offRoad/velocidad de cualquier auto, así el paquete que
// viaja por la red se queda liviano (nada más que posición/velocidad/estado de cada auto).
function avanzarGPOnline(st, dt, entradasPorId) {
  if (st.cuentaRegresiva > 0) {
    st.cuentaRegresiva -= dt;
    if (st.cuentaRegresiva <= 0) {
      const ahoraInicio = Date.now();
      st.autos.forEach((a) => { a.inicioVueltaMs = ahoraInicio; });
    }
    return st;
  }
  const pista = st.pista;
  const ahora = Date.now();

  for (const cofre of pista.cofres) {
    if (!cofre.activo) {
      if (ahora >= cofre.respawnEn) cofre.activo = true;
      continue;
    }
    for (const auto of st.autos) {
      if (auto.powerUp || auto.retirado) continue;
      if (Math.hypot(auto.x - cofre.x, auto.y - cofre.y) < GP_COFRE_RADIO) {
        auto.powerUp = GP_TIPOS_PODER[Math.floor(Math.random() * GP_TIPOS_PODER.length)];
        cofre.activo = false;
        cofre.respawnEn = ahora + GP_COFRE_RESPAWN_MS;
        break;
      }
    }
  }

  st.aceites.forEach((h) => { h.vida -= dt; });
  st.aceites = st.aceites.filter((h) => h.vida > 0 && !h.usado);
  for (const h of st.aceites) {
    for (const auto of st.autos) {
      if (auto.retirado) continue;
      if (auto.escudoHasta && ahora < auto.escudoHasta) continue;
      if (Math.hypot(auto.x - h.x, auto.y - h.y) < GP_ACEITE_RADIO) {
        h.usado = true;
        auto.derrapeHasta = ahora + GP_DERRAPE_MS;
        auto.enDerrape = true;
        auto.heading += (Math.random() < 0.5 ? -1 : 1) * (0.2 + Math.random() * 0.15);
        break;
      }
    }
  }

  for (const auto of st.autos) {
    if (auto.retirado) continue;
    const cercano = indiceCercanoGP(pista, auto.x, auto.y, auto.idxCercano);
    const idxPrevio = auto.idxCercano;
    auto.idxCercano = cercano.idx;
    auto.offRoad = cercano.dist > GP_TRACK_MITAD;

    if (idxPrevio > pista.nPuntos * 0.75 && auto.idxCercano < pista.nPuntos * 0.25) {
      auto.vueltas += 1;
      auto.ultimaVueltaMs = ahora;
      if (auto.vueltas >= 1) {
        const duracion = (ahora - (auto.inicioVueltaMs || ahora)) / 1000;
        auto.vueltasTiempos.push(duracion);
        if (auto.mejorVuelta === null || duracion < auto.mejorVuelta) auto.mejorVuelta = duracion;
        if (auto.peorVuelta === null || duracion > auto.peorVuelta) auto.peorVuelta = duracion;
      }
      auto.inicioVueltaMs = ahora;
      if (auto.vueltas >= st.totalVueltas && !auto.llego) {
        auto.llego = true;
        auto.posicionFinal = st.siguientePosicion++;
      }
    }

    const entradaAuto = (auto.jugadorId && entradasPorId[auto.jugadorId]) || ENTRADA_VACIA_GP;
    if (entradaAuto.usarPoder) usarPoderGP(auto, st.autos, st);
    const rebufo = hayRebufoGP(auto, st.autos);
    actualizarFisicaAutoGP(auto, dt, entradaAuto, rebufo);

    const offLat = offsetLateralActualGP(pista, auto);
    if (Math.abs(offLat) > GP_MURO_DIST) {
      const idxM = auto.idxCercano;
      const pM = pista.centerline[idxM];
      const latM = lateralEnGP(pista, idxM);
      const signoM = offLat > 0 ? 1 : -1;
      auto.x = pM.x + latM.x * GP_MURO_DIST * signoM;
      auto.y = pM.y + latM.y * GP_MURO_DIST * signoM;
      const vLatM = auto.vx * latM.x + auto.vy * latM.y;
      if (vLatM * signoM > 0) {
        auto.vx -= latM.x * vLatM * GP_MURO_REBOTE;
        auto.vy -= latM.y * vLatM * GP_MURO_REBOTE;
      }
    }
  }
  resolverColisionesGP({ autos: st.autos.filter((a) => !a.retirado), jugador: null, particulas: [], sacudida: 0 });

  if (st.autos.every((a) => a.llego || a.retirado)) st.terminado = true;
  return st;
}

function estaTerminadoGPOnline(st) { return !!st.terminado; }

module.exports = {
  GP_PISTAS, GP_NUM_BOTS,
  crearEstadoGPOnline, avanzarGPOnline, retirarAutoGPOnline, estaTerminadoGPOnline,
};
