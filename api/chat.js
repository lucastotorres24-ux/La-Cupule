// Esta función corre en el servidor de Vercel, NUNCA en el navegador del usuario.
// La llave (GEMINI_API_KEY) queda escondida — nadie puede verla mirando el código de la página.
// Usa el nivel gratuito de Google Gemini (sin tarjeta de crédito).
//
// IMPORTANTE — por qué este archivo vive en /api/: Vercel solo despliega como función
// serverless los archivos que están dentro de la carpeta /api en la raíz del repo. Antes este
// código vivía en un archivo suelto llamado "Chat" en la raíz (sin carpeta /api ni extensión
// .js), así que Vercel nunca lo desplegaba como endpoint — por eso el chat no respondía y solo
// funcionaban los enlaces estáticos a otras IA. Este archivo reemplaza a aquel.

const MODELO = "gemini-3.5-flash-lite"; // más rápido que gemini-3.6-flash, sigue en nivel gratis

// El usuario no recuerda con certeza qué nombre de variable configuró en Vercel, así que se
// revisan varios nombres posibles en orden — el primero que exista se usa. Esto hace que el
// sistema se autodiagnostique en vez de depender de que alguien recuerde el nombre exacto.
const NOMBRES_POSIBLES_LLAVE = [
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "GOOGLE_GEMINI_API_KEY",
  "GEMINI_KEY",
  "API_KEY_GEMINI",
];

function obtenerLlaveGemini() {
  for (const nombre of NOMBRES_POSIBLES_LLAVE) {
    const valor = process.env[nombre];
    if (valor && valor.trim()) return { llave: valor.trim(), nombreUsado: nombre };
  }
  return null;
}

const PROMPT_SISTEMA_CHAT =
  "Eres Cúpula AI, la asistente virtual interna de La Cúpula (NYC 420 Style), una plataforma de gestión para un equipo de ventas de un líder y cuatro agentes. Ayudas con dudas de reclutamiento, ventas, redacción de mensajes, organización de tareas y preguntas generales. Sé breve, directa y con un tono profesional pero cercano, en español.";

// Prompt de extracción para audios de candidatos. Los candidatos pueden hablar español, inglés,
// francés, italiano o portugués — el modelo transcribe el audio y aplica el formato en un solo
// paso. A pedido del usuario: cualquier campo/área que no se mencione claramente en el audio se
// OMITE por completo del resultado (no se escribe "No especificado" ni la línea vacía).
const PROMPT_EXTRACCION_AUDIO = `Actúa como un analista de reclutamiento senior para ventas de brokers, con muy buena redacción profesional en español.
Vas a recibir un audio de un candidato (puede estar en español, inglés, francés, italiano o portugués). Transcribe internamente el audio y primero decide si el candidato TIENE experiencia previa trabajando con brokers/forex/trading o NO la tiene, según lo que diga.

Usa ÚNICAMENTE UNO de estos dos formatos según lo que detectes (nunca mezcles campos de los dos). En ambos casos, el último campo es siempre "Perfil": un resumen profesional de 3 a 5 líneas, en frases completas, que sintetice lo más relevante que dijo el candidato (trayectoria, actitud, fortalezas, motivación) — igual de completo que el ejemplo de estilo al final de estas instrucciones.

Si TIENE experiencia con brokers:
Tipo de perfil: Con experiencia
Nombre completo:
Edad:
Nacionalidad:
Tráfico trabajado:
Resultado máximo obtenido:
Resultado mínimo obtenido:
Empresas o proyectos:
Países en los que ha trabajado:
Tiempo de experiencia con brokers:
Perfil:

Si NO tiene experiencia con brokers:
Tipo de perfil: Sin experiencia
Nombre completo:
Edad:
Nacionalidad:
Ciudad donde reside:
Experiencia o conocimientos en Forex/trading:
A qué se dedica actualmente:
Por qué le interesa esta oportunidad:
Qué le motiva a formar parte del proyecto:
Perfil:

⚠️ REGLAS IMPORTANTES:
La primera línea SIEMPRE debe ser "Tipo de perfil: Con experiencia" o "Tipo de perfil: Sin experiencia", sin excepción.
Para cada campo, incluye TODA la información relevante que el candidato haya dado sobre ese punto — no la resumas a una sola palabra ni la recortes de más. Si menciona varios elementos (países, empresas, etc.), lístalos todos, uno por línea con "*". Si menciona detalles, cifras, nombres, tiempos o contexto adicional, consérvalos.
Redacta cada campo en frases completas, con buena redacción y tono profesional, corrigiendo ortografía — pero sin eliminar información real que el candidato haya dado con tal de acortar. El campo "Perfil" final NUNCA se omite ni se acorta a una sola línea: siempre es un párrafo completo de 3 a 5 líneas.
Si un campo del formato elegido (distinto de "Perfil") no se menciona con claridad en el audio, OMÍTELO POR COMPLETO: no escribas esa línea, y nunca pongas "No especificado" ni nada equivalente.
No mezcles campos de ambos formatos ni agregues campos que no estén en el formato elegido.
No inventes información que el candidato no haya dicho.

🎯 OBJETIVO:
Convertir audios de candidatos en el perfil correcto (con o sin experiencia) listo para reclutamiento y selección en brokers, con el nivel de detalle y redacción profesional de este ejemplo de estilo (los datos de este ejemplo son ficticios, solo copia el TONO y el nivel de detalle, no la estructura de campos que use):

Nombre: Patricia Lopera
Edad: 43 años
Nacionalidad: Colombiana
Ciudad: Medellín

Tráfico trabajado:
* Colombia
* Ecuador
* Brasil

Empresas:
* Asisurilla
* Experiencia en diversos call centers y empresas comerciales

País de trabajo:
Colombia

Perfil:
Profesional con amplia experiencia comercial en ventas de propiedad raíz y atención en call centers. Se destaca por su orientación a resultados, facilidad para relacionarse con clientes, actitud positiva y disposición para aprender. Cuenta con experiencia trabajando con clientes colombianos, ecuatorianos y brasileños y mantiene un constante interés por fortalecer sus conocimientos e idiomas.`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido" });
    return;
  }

  const encontrada = obtenerLlaveGemini();
  if (!encontrada) {
    res.status(500).json({
      error:
        "No hay ninguna llave de Gemini configurada en Vercel. Ve a Vercel → tu proyecto → Settings → Environment Variables y agrega una variable llamada GEMINI_API_KEY con tu llave de Google AI Studio (aistudio.google.com/apikey), luego vuelve a desplegar.",
    });
    return;
  }
  const { llave } = encontrada;

  try {
    const { messages, audio } = req.body || {};
    if (!Array.isArray(messages)) {
      res.status(400).json({ error: "Falta el historial de mensajes en la solicitud." });
      return;
    }

    const historialReciente = messages.slice(-8); // menos historial = respuesta más rápida
    const contents = historialReciente.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    // Modo audio: se le agrega el audio (en base64) como parte del último mensaje del usuario,
    // junto con el prompt fijo de extracción de perfil — Gemini transcribe y extrae en una sola
    // llamada, sin necesidad de un paso separado de "speech-to-text".
    let systemPrompt = PROMPT_SISTEMA_CHAT;
    if (audio && audio.data) {
      systemPrompt = PROMPT_EXTRACCION_AUDIO;
      const ultimo = contents[contents.length - 1];
      const parteAudio = { inline_data: { mime_type: audio.mimeType || "audio/ogg", data: audio.data } };
      if (ultimo && ultimo.role === "user") {
        ultimo.parts.push(parteAudio);
      } else {
        contents.push({ role: "user", parts: [parteAudio] });
      }
    }

    const respuestaGemini = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent?key=${llave}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
        }),
      }
    );

    let data;
    try {
      data = await respuestaGemini.json();
    } catch {
      res.status(502).json({
        error: `Gemini respondió con un formato inesperado (código HTTP ${respuestaGemini.status}). Intenta de nuevo en unos segundos.`,
      });
      return;
    }

    if (!respuestaGemini.ok || data.error) {
      const mensaje = data?.error?.message || `Error HTTP ${respuestaGemini.status} al llamar a Gemini.`;
      res.status(502).json({ error: mensaje });
      return;
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "(sin respuesta)";
    res.status(200).json({ text });
  } catch (err) {
    res.status(500).json({ error: `Error interno del servidor: ${String(err && err.message ? err.message : err)}` });
  }
}
