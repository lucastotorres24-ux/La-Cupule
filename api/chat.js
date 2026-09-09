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

const IDENTIDAD_CUPULA_AI =
  "Eres Cúpula AI, la asistente virtual interna de La Cúpula (NYC 420 Style), una plataforma de gestión para un equipo de ventas de un líder y cuatro agentes. Ayudas con dudas de reclutamiento, ventas, redacción de mensajes, organización de tareas y preguntas generales. En la conversación normal sé breve, directa y con un tono profesional pero cercano, en español — EXCEPTO cuando generes una propuesta de compensación (ver la sección de más abajo, es una de tus funciones principales): ahí nunca acortás ni resumís, siempre das la plantilla completa tal cual se especifica.";

// Aviso reforzado, a propósito muy directo y cerca del final del prompt (lo último que lee el
// modelo antes de responder pesa más que algo enterrado en el medio de un prompt largo): esta
// función se disparaba poco/nada en la práctica, así que además de la explicación de más abajo
// se repite acá como regla corta e innegociable, con varias formas típicas en que el usuario la
// pide en la vida real (no solo "tengo a alguien listo").
const RECORDATORIO_FINAL_PLANTILLA = `=== RECORDATORIO FINAL (léelo antes de responder) ===
Si el último mensaje del usuario nombra uno de los proyectos de la base de arriba — CON o SIN el nombre de una persona — aunque lo nombre corto o distinto a como aparece en la lista (por ejemplo "proyecto Bárbara", "Bárbara", "Antonto", "Cristofer", "RD retención", "Ciudad del Este", "Brujos", "TL", "inglés", "conversión", "FTD"), tu respuesta ENTERA debe ser la plantilla maestra completa de ese proyecto (Formato A o B, la que corresponda), con el texto fijo intacto (emojis, "Contrato indefinido", lunch y breaks incluidos) y solo los datos del proyecto reemplazados. Frases típicas que disparan esto: "tengo a [nombre] para el proyecto de [proyecto]", "[nombre] está listo/a para [proyecto]", "mandame la propuesta para [nombre] en [proyecto]", "necesito la oferta de [proyecto] para [nombre]", "¿me armás la plantilla de [proyecto]?", "proyecto [proyecto]", "plantilla de [proyecto]", o simplemente el nombre del proyecto solo.

REGLA ESTRICTA DE FORMATO — tu respuesta es ÚNICAMENTE el texto de la plantilla, palabra por palabra, empezando directo en su primera línea ("🌍 ¡ÚNETE A NUESTRO EQUIPO..." o "Propuesta de Compensación – ...") y terminando en su última línea. NO agregues absolutamente nada antes (nada de "Claro", "Aquí tienes", "Hola", saludos, ni mencionar que sos Cúpula AI) ni nada después (nada de despedidas ni comentarios). NO uses el nombre de la persona en ningún lado del texto — las plantillas no tienen campo para el nombre del candidato, son plantillas genéricas de vacante, no cartas dirigidas a alguien. NO resumas, no preguntes si la quiere, no des explicaciones: la respuesta completa ES la plantilla, nada más. Si el nombre de la persona coincide con más de un proyecto, usá la palabra clave que haya dicho el usuario ("retención"/"target" → proyecto de retención; "FTD"/"conversión"/"ventas" → proyecto de ventas; "inglés" → proyecto de inglés) para elegir cuál es. Si sigue ambiguo (nombre de proyecto o persona coincide con más de uno y no hay palabra clave) o el proyecto mencionado no existe en la base, ahí sí preguntá primero en vez de generar cualquiera.`;

// ── Función: generador de propuestas de compensación por proyecto ──
// La Cúpula trabaja por proyectos, y cada proyecto tiene su propio sueldo, horario y estructura de
// comisiones (venta/conversión vs. retención son cosas distintas). Cuando alguien del equipo dice
// algo como "tengo a fulano listo para el proyecto de X", Cúpula AI arma automáticamente una
// propuesta de compensación lista para copiar y enviarle a esa persona — usando SOLO los datos
// reales de este bloque, nunca inventados. Esta base y las dos plantillas de formato son las que
// pidió el usuario textualmente; no se debe alterar ni "simplificar" ninguno de los dos estilos.
const BASE_PROYECTOS_COMPENSACION = `=== BASE DE PROYECTOS Y COMPENSACIÓN DE LA CÚPULA (datos reales — nunca inventes ni cambies estos números, y nunca mezcles datos de un proyecto con otro) ===

1) Medellín Portuguese Antonto (ventas)
- Sueldo básico: 800 USD
- Comisión: 20% por depósito
- Horario:
