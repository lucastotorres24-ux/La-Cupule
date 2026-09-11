// ── Servidor genérico de La Cúpula: salas con código + servidor autoritativo por WebSockets ──
//
// Reemplaza el enfoque anterior (Firebase Realtime Database como transporte, con el doble salto que
// eso implicaba) por conexiones directas de Socket.io: cada cliente abre un socket con este
// servidor, crea o se une a una sala con un código de 4 letras, manda solo sus botones/teclas, y
// este proceso —el único que corre la física real, a 20 ticks por segundo— le contesta a todos los
// de la sala por igual. Ningún navegador es "más servidor" que otro.
//
// Agnóstico al juego: cada juego (No haga sino Jogar, Cúpula GP) es un módulo en ./juegos con la
// misma forma {crearEstado, avanzar, estaTerminado, puedeEmpezar, maxJugadores}. Agregar un juego
// nuevo más adelante es solo sumar un módulo acá abajo, en JUEGOS.
//
// La lógica de salas en sí (quién está en qué sala, cuándo se puede empezar, el bucle de tick) vive
// en ./salas.js, sin nada de Socket.io — así se puede probar con Node solo. Este archivo es nomás
// el adaptador fino que conecta esos eventos a conexiones de red reales.

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { crearGestorSalas } = require("./salas.js");

const cabezones = require("./juegos/cabezones.js");
const gp = require("./juegos/gp_sala.js");

const JUEGOS = { cabezones, gp };
const PUERTO = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }, // La Cúpula es un equipo cerrado, no hace falta restringir origen acá
});

const gestor = crearGestorSalas(JUEGOS, {
  tickMs: 50, // 20 ticks por segundo, como pide el servidor autoritativo
  onJugadores: (codigo, payload) => io.to(codigo).emit("jugadores", payload),
  onEmpezando: (codigo, payload) => io.to(codigo).emit("empezando", payload),
  onEstado: (codigo, payload) => io.to(codigo).emit("estado", payload),
  onTerminado: (codigo, payload) => io.to(codigo).emit("terminado", payload),
});

io.on("connection", (socket) => {
  let miSala = null; // código de la sala en la que está este socket, si hay alguna

  socket.on("crearSala", (payload = {}, cb) => {
    const res = gestor.crearSala({ id: socket.id, ...payload });
    if (res.ok) { socket.join(res.codigo); miSala = res.codigo; }
    cb && cb(res);
  });

  socket.on("unirseSala", (payload = {}, cb) => {
    const res = gestor.unirseSala({ id: socket.id, ...payload });
    if (res.ok) { socket.join(res.codigo); miSala = res.codigo; }
    cb && cb(res);
  });

  socket.on("empezar", (_payload, cb) => { cb && cb(gestor.empezar({ id: socket.id })); });
  socket.on("jugarDeNuevo", (_payload, cb) => { cb && cb(gestor.jugarDeNuevo({ id: socket.id })); });

  // Cambiar de color/skin desde el lobby (antes de arrancar) — el gestor rechaza si alguien más de
  // la sala ya lo tiene puesto, así nunca hay dos autos del mismo color en una misma carrera.
  socket.on("cambiarSkin", ({ skinIndex } = {}, cb) => { cb && cb(gestor.cambiarSkin({ id: socket.id, skinIndex })); });

  // Cada quien manda solo su propia entrada (botones/teclas), nunca posición ni estado del juego —
  // el servidor es el único que decide qué pasó de verdad, así nadie tiene ventaja por su conexión.
  socket.on("input", ({ seq, input } = {}) => { gestor.input({ id: socket.id, seq, input }); });

  // Retirarse de una carrera en curso (Cúpula GP) sin cortarle la carrera a los demás.
  socket.on("retirarse", () => { gestor.retirarse({ id: socket.id }); });

  function salirDeSala() {
    if (!miSala) return;
    gestor.salir({ id: socket.id });
    socket.leave(miSala);
    miSala = null;
  }
  socket.on("salirSala", salirDeSala);
  socket.on("disconnect", salirDeSala);
});

app.get("/", (req, res) => {
  res.send(`cupula-server activo — salas abiertas: ${gestor._salas.size}`);
});

server.listen(PUERTO, () => {
  console.log(`[cupula-server] escuchando en el puerto ${PUERTO} (Socket.io, salas con código)`);
});
