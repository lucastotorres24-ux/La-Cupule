// Prueba de humo del gestor de salas, sin red — simula reloj propio para que los ticks avancen
// determinísticamente sin depender de setInterval real ni del tiempo de pared.
const assert = require("assert");
const { crearGestorSalas } = require("./salas.js");
const cabezones = require("./juegos/cabezones.js");
const gp = require("./juegos/gp_sala.js");

function crearRelojFalso() {
  let t = 1000000;
  const pendientes = [];
  return {
    ahora: () => t,
    setInterval: (fn, ms) => { const h = { fn, ms }; pendientes.push(h); return h; },
    clearInterval: (h) => { const i = pendientes.indexOf(h); if (i >= 0) pendientes.splice(i, 1); },
    avanzar(ms) {
      const pasos = Math.round(ms / 50);
      for (let i = 0; i < pasos; i++) {
        t += 50;
        for (const h of [...pendientes]) h.fn();
      }
    },
  };
}

function pruebaCabezones() {
  const reloj = crearRelojFalso();
  const eventos = [];
  const gestor = crearGestorSalas({ cabezones }, {
    ahora: reloj.ahora, setInterval: reloj.setInterval, clearInterval: reloj.clearInterval,
    onJugadores: (c, p) => eventos.push(["jugadores", c, p]),
    onEmpezando: (c, p) => eventos.push(["empezando", c, p]),
    onEstado: (c, p) => eventos.push(["estado", c, p]),
    onTerminado: (c, p) => eventos.push(["terminado", c, p]),
  });

  const r1 = gestor.crearSala({ id: "s1", juego: "cabezones", nombre: "Wizzrd" });
  assert.ok(r1.ok, "crear sala cabezones debe ok");
  assert.strictEqual(r1.codigo.length, 4);
  const noExiste = gestor.unirseSala({ id: "sX", codigo: "ZZZZ", nombre: "Nadie" });
  assert.strictEqual(noExiste.ok, false, "unirse a código inexistente debe fallar");

  const noEmpiezaSolo = gestor.empezar({ id: "s1" });
  assert.strictEqual(noEmpiezaSolo.ok, false, "cabezones no debe poder empezar con 1 solo jugador");

  const r2 = gestor.unirseSala({ id: "s2", codigo: r1.codigo, nombre: "Paris" });
  assert.ok(r2.ok, "segundo jugador debe poder unirse");
  assert.strictEqual(r2.jugadores.length, 2);

  const r3 = gestor.unirseSala({ id: "s3", codigo: r1.codigo, nombre: "Cristian" });
  assert.strictEqual(r3.ok, false, "un tercero no debe poder unirse (cabezones es 1v1)");

  const noHostEmpieza = gestor.empezar({ id: "s2" });
  assert.strictEqual(noHostEmpieza.ok, false, "solo el host puede empezar");

  const okEmpieza = gestor.empezar({ id: "s1" });
  assert.ok(okEmpieza.ok, "el host sí debe poder empezar con 2 jugadores");
  assert.ok(eventos.some((e) => e[0] === "empezando"), "debe emitir 'empezando'");

  // input de ambos jugadores pateando hacia adelante un rato — no debe tirar excepciones ni
  // colgarse, y en algún momento debe llegar a estado "jugando".
  gestor.input({ id: "s1", seq: 1, input: { izq: false, der: true, saltar: false, patear: false } });
  gestor.input({ id: "s2", seq: 1, input: { izq: true, der: false, saltar: false, patear: false } });
  reloj.avanzar(3000);
  const ultimoEstado = eventos.filter((e) => e[0] === "estado").pop();
  assert.ok(ultimoEstado, "debe haber emitido al menos un 'estado'");
  assert.ok(["esperando", "jugando"].includes(ultimoEstado[2].estado.fase), "fase válida");

  // s2 se desconecta a mitad de partido — la sala debe seguir viva con s1 como único jugador,
  // y s1 pasa a ser host (ya lo era).
  gestor.salir({ id: "s2" });
  const sala = gestor._salas.get(r1.codigo);
  assert.strictEqual(sala.jugadores.length, 1, "debe quedar 1 jugador tras la salida");
  assert.strictEqual(sala.hostId, "s1");

  gestor.salir({ id: "s1" });
  assert.strictEqual(gestor._salas.has(r1.codigo), false, "la sala debe cerrarse sola cuando queda vacía");

  console.log("✔ cabezones: crear/unirse/límite de jugadores/host/empezar/tick/salida — todo OK");
}

function pruebaGP() {
  const reloj = crearRelojFalso();
  const eventos = [];
  const gestor = crearGestorSalas({ gp }, {
    ahora: reloj.ahora, setInterval: reloj.setInterval, clearInterval: reloj.clearInterval,
    onJugadores: (c, p) => eventos.push(["jugadores", c, p]),
    onEmpezando: (c, p) => eventos.push(["empezando", c, p]),
    onEstado: (c, p) => eventos.push(["estado", c, p]),
    onTerminado: (c, p) => eventos.push(["terminado", c, p]),
  });

  const r1 = gestor.crearSala({ id: "j1", juego: "gp", nombre: "Wizzrd", config: { pistaId: "ovalo", vueltas: 1 }, skinIndex: 0 });
  assert.ok(r1.ok);
  // GP sí debe poder arrancar con 1 solo jugador (para probar la pista solo, sin bots).
  const okEmpiezaSolo = gestor.empezar({ id: "j1" });
  assert.ok(okEmpiezaSolo.ok, "GP debe poder empezar con 1 jugador");
  const empezando = eventos.find((e) => e[0] === "empezando");
  assert.strictEqual(empezando[2].estado.autos.length, 1, "el estado inicial debe tener exactamente 1 auto (sin bots)");

  // maneja inputs "hacia adelante" simples y corre un buen rato — no debe tirar NaN ni colgarse.
  let ultimoEstado = null;
  for (let i = 0; i < 400; i++) {
    gestor.input({ id: "j1", seq: i, input: { accel: true, freno: false, dir: Math.sin(i * 0.05) * 0.3, derrape: false, usarPoder: false } });
    reloj.avanzar(50);
  }
  ultimoEstado = eventos.filter((e) => e[0] === "estado").pop();
  const auto = ultimoEstado[2].estado.autos[0];
  assert.ok(isFinite(auto.x) && isFinite(auto.y), "posición del auto debe seguir siendo un número válido");
  assert.strictEqual(auto.jugadorId, "j1");
  assert.strictEqual(auto.nombre, undefined, "el paquete liviano de cada tick NO debe repetir el nombre (va una sola vez, en 'empezando')");
  assert.strictEqual(empezando[2].estado.autos[0].nombre, "Wizzrd", "el nombre sí debe venir en el paquete completo inicial");
  assert.strictEqual(gestor._salas.get(r1.codigo).estado.autos[0].nombre, "Wizzrd", "el servidor sigue sabiendo el nombre internamente");

  console.log("✔ GP online: crear sala sin bots/empezar con 1 jugador/tick liviano sin nombre/estado completo con nombre/sin NaN — todo OK");

  // Segunda sala GP: probar que un segundo jugador se une, ambos autos existen, y "retirarse" marca
  // al que se retira sin tirar la sala para el otro.
  const r2 = gestor.crearSala({ id: "k1", juego: "gp", nombre: "Marcus", config: { pistaId: "serpiente", vueltas: 1 } });
  gestor.unirseSala({ id: "k2", codigo: r2.codigo, nombre: "Kevin" });
  gestor.empezar({ id: "k1" });
  gestor.retirarse({ id: "k2" });
  reloj.avanzar(500);
  const sala2 = gestor._salas.get(r2.codigo);
  const autoK2 = sala2.estado.autos.find((a) => a.jugadorId === "k2");
  assert.strictEqual(autoK2.retirado, true, "k2 debe quedar marcado como retirado");
  const autoK1 = sala2.estado.autos.find((a) => a.jugadorId === "k1");
  assert.strictEqual(autoK1.retirado, false, "k1 debe seguir corriendo normal");
  console.log("✔ GP online: retirarse de una carrera con más de 1 jugador — no afecta al resto");
}

pruebaCabezones();
pruebaGP();
console.log("\n=== TODAS LAS PRUEBAS DEL GESTOR DE SALAS PASARON ===");
