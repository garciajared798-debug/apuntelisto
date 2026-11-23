/* =========================================================
   ApunteListo · Lógica de la aplicación (JavaScript puro)
   Guardamos todo en localStorage: no hay servidor ni login.
   ========================================================= */

"use strict";

const CLAVE_TAREAS = "apuntelisto.tareas.v1";
const CLAVE_OLAS = "apuntelisto.olas.v1";
const PRIORIDADES = ["baja", "media", "alta"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Atajo para buscar elementos del DOM
const $ = (selector) => document.querySelector(selector);

const elementos = {
  formulario: $("#formulario"),
  titulo: $("#titulo"),
  materia: $("#materia"),
  fecha: $("#fecha"),
  prioridad: $("#prioridad"),
  nota: $("#nota"),
  listaMaterias: $("#listaMaterias"),
  errores: {
    titulo: $("#errorTitulo"),
    materia: $("#errorMateria"),
    fecha: $("#errorFecha"),
    prioridad: $("#errorPrioridad")
  },
  avisoEdicion: $("#avisoEdicion"),
  tituloEditando: $("#tituloEditando"),
  textoGuardar: $("#textoGuardar"),
  btnGuardar: $("#btnGuardar"),
  btnCancelar: $("#btnCancelar"),
  btnLimpiar: $("#btnLimpiar"),
  buscar: $("#buscar"),
  filtroEstado: $("#filtroEstado"),
  filtroMateria: $("#filtroMateria"),
  ordenar: $("#ordenar"),
  lista: $("#listaTareas"),
  mensajeVacio: $("#mensajeVacio"),
  textoVacio: $("#textoVacio"),
  contadorPendientes: $("#contadorPendientes"),
  contadorCompletadas: $("#contadorCompletadas"),
  saludo: $("#saludo"),
  aviso: $("#aviso"),
  btnOlas: $("#btnOlas"),
  textoOlas: $("#textoOlas")
};

// Estado de la aplicación
let tareas = cargarTareas();
let editandoId = null;
let timerAviso;
let guardarFallidoAvisado = false;
let olasActivas = cargarPreferenciaOlas();

/* ---------------------------------------------------------
   Utilidades
   --------------------------------------------------------- */

// ID único (randomUUID si está disponible, si no, una combinación simple)
function nuevoId() {
  if (window.crypto && typeof crypto.randomUUID === "function") {
    return `t-${crypto.randomUUID()}`;
  }
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

// Protegemos cualquier texto escrito por el usuario antes de ponerlo en el HTML
function escapeHTML(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, (caracter) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[caracter]));
}

// Quita acentos para que "matematicas" encuentre "Matemáticas"
function normalizar(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function conPlural(cantidad, singular, plural) {
  return `${cantidad} ${cantidad === 1 ? singular : plural}`;
}

function dosDigitos(numero) {
  return String(numero).padStart(2, "0");
}

// Fecha de hoy en formato YYYY-MM-DD (hora local, no UTC)
function hoyISO() {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${dosDigitos(hoy.getMonth() + 1)}-${dosDigitos(hoy.getDate())}`;
}

// Convierte "YYYY-MM-DD" a una Date local
function fechaDesdeISO(iso) {
  const partes = String(iso).split("-");
  return new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));
}

// Comprueba que la fecha exista de verdad (descarta cosas como 2026-02-31)
function esFechaValida(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) return false;
  const fecha = fechaDesdeISO(iso);
  return (
    fecha.getFullYear() === Number(iso.slice(0, 4)) &&
    fecha.getMonth() === Number(iso.slice(5, 7)) - 1 &&
    fecha.getDate() === Number(iso.slice(8, 10))
  );
}

// Días que faltan: negativo = vencida, 0 = hoy, 1 = mañana
function diasHasta(iso) {
  const hoy = new Date();
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((fechaDesdeISO(iso) - inicioHoy) / 86400000);
}

// Fecha bonita para mostrar en la tarjeta: "12 dic 2026"
function formatearFecha(iso) {
  const fecha = fechaDesdeISO(iso);
  return `${fecha.getDate()} ${MESES[fecha.getMonth()]} ${fecha.getFullYear()}`;
}

/* ---------------------------------------------------------
   Guardado en el navegador (localStorage)
   --------------------------------------------------------- */

function cargarTareas() {
  try {
    const guardado = localStorage.getItem(CLAVE_TAREAS);
    if (!guardado) return [];

    const datos = JSON.parse(guardado);
    if (!Array.isArray(datos)) return [];

    // Limpiamos posibles datos antiguos o incompletos
    return datos
      .filter((tarea) => tarea && typeof tarea.titulo === "string" && tarea.titulo.trim())
      .map((tarea) => ({
        id: typeof tarea.id === "string" ? tarea.id : nuevoId(),
        titulo: tarea.titulo.trim(),
        materia: typeof tarea.materia === "string" && tarea.materia.trim() ? tarea.materia.trim() : "General",
        fecha: esFechaValida(tarea.fecha) ? tarea.fecha : hoyISO(),
        prioridad: PRIORIDADES.includes(tarea.prioridad) ? tarea.prioridad : "media",
        nota: typeof tarea.nota === "string" ? tarea.nota : "",
        completada: Boolean(tarea.completada),
        creadaEl: Number(tarea.creadaEl) || Date.now(),
        actualizadaEl: Number(tarea.actualizadaEl) || Number(tarea.creadaEl) || Date.now()
      }));
  } catch (error) {
    return [];
  }
}

function guardarTareas() {
  try {
    localStorage.setItem(CLAVE_TAREAS, JSON.stringify(tareas));
  } catch (error) {
    // Si el navegador bloquea el almacenamiento, la app sigue funcionando en memoria
    if (!guardarFallidoAvisado) {
      guardarFallidoAvisado = true;
      mostrarAviso("No pudimos guardar en este navegador, pero puedes seguir usando la página.");
    }
  }
}

function cargarPreferenciaOlas() {
  try {
    const guardado = localStorage.getItem(CLAVE_OLAS);
    if (guardado !== null) return JSON.parse(guardado) !== false;
  } catch (error) {
    // Sin preferencia guardada, seguimos con el valor por defecto
  }

  // Si el sistema pide menos movimiento, empezamos con las olas pausadas
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return !reduce;
}

function guardarPreferenciaOlas() {
  try {
    localStorage.setItem(CLAVE_OLAS, JSON.stringify(olasActivas));
  } catch (error) {
    // Preferencia no guardada: no es crítico
  }
}

/* ---------------------------------------------------------
   Interfaz: saludo, olas y avisos
   --------------------------------------------------------- */

function actualizarSaludo() {
  const hora = new Date().getHours();
  const saludo = hora < 12 ? "Buenos días" : hora < 20 ? "Buenas tardes" : "Buenas noches";
  elementos.saludo.textContent = `¡${saludo}! 👋`;
}

function aplicarOlas() {
  document.body.classList.toggle("sin-olas", !olasActivas);
  elementos.btnOlas.setAttribute("aria-pressed", String(olasActivas));
  elementos.btnOlas.setAttribute(
    "aria-label",
    olasActivas ? "Pausar animación de las olas" : "Activar animación de las olas"
  );
  elementos.textoOlas.textContent = olasActivas ? "Pausar olas" : "Activar olas";
  guardarPreferenciaOlas();
}

function mostrarAviso(mensaje) {
  clearTimeout(timerAviso);
  elementos.aviso.textContent = mensaje;
  elementos.aviso.classList.add("is-visible");
  timerAviso = setTimeout(() => elementos.aviso.classList.remove("is-visible"), 2800);
}

/* ---------------------------------------------------------
   Validación del formulario
   --------------------------------------------------------- */

function leerFormulario() {
  return {
    titulo: elementos.titulo.value.trim(),
    materia: elementos.materia.value.trim(),
    fecha: elementos.fecha.value.trim(),
    prioridad: elementos.prioridad.value,
    nota: elementos.nota.value.trim()
  };
}

function validarDatos(datos) {
  const errores = {};

  if (!datos.titulo) {
    errores.titulo = "Escribe un título para la tarea.";
  }

  if (!datos.materia) {
    errores.materia = "Indica la materia o asignatura.";
  }

  if (!datos.fecha) {
    errores.fecha = "Elige la fecha de entrega.";
  } else if (!esFechaValida(datos.fecha)) {
    errores.fecha = "La fecha no es válida. Usa el selector de fecha.";
  }

  if (!PRIORIDADES.includes(datos.prioridad)) {
    errores.prioridad = "Elige una prioridad: baja, media o alta.";
  }

  return errores;
}

function mostrarErrores(errores) {
  Object.entries(elementos.errores).forEach(([campo, nodoError]) => {
    const mensaje = errores[campo] || "";
    nodoError.textContent = mensaje;
    if (mensaje) {
      elementos[campo].setAttribute("aria-invalid", "true");
    } else {
      elementos[campo].removeAttribute("aria-invalid");
    }
  });
}

/* ---------------------------------------------------------
   Filtrado, orden y contadores
   --------------------------------------------------------- */

function coincideFiltros(tarea) {
  const busqueda = normalizar(elementos.buscar.value);
  if (busqueda && !normalizar(`${tarea.titulo} ${tarea.materia}`).includes(busqueda)) {
    return false;
  }

  const estado = elementos.filtroEstado.value;
  if (estado === "pendientes" && tarea.completada) return false;
  if (estado === "completadas" && !tarea.completada) return false;

  const materia = elementos.filtroMateria.value;
  if (materia && tarea.materia !== materia) return false;

  return true;
}

function pesoPrioridad(prioridad) {
  return { alta: 0, media: 1, baja: 2 }[prioridad] ?? 3;
}

function tareasVisibles() {
  const lista = tareas.filter(coincideFiltros);

  switch (elementos.ordenar.value) {
    case "prioridad":
      lista.sort((a, b) =>
        Number(a.completada) - Number(b.completada) ||
        pesoPrioridad(a.prioridad) - pesoPrioridad(b.prioridad) ||
        a.fecha.localeCompare(b.fecha)
      );
      break;

    case "recientes":
      lista.sort((a, b) => b.creadaEl - a.creadaEl);
      break;

    case "fecha":
    default:
      // Las pendientes primero; luego la fecha más cercana y la prioridad como empate
      lista.sort((a, b) =>
        Number(a.completada) - Number(b.completada) ||
        a.fecha.localeCompare(b.fecha) ||
        pesoPrioridad(a.prioridad) - pesoPrioridad(b.prioridad)
      );
  }

  return lista;
}

function actualizarContadores() {
  const pendientes = tareas.filter((tarea) => !tarea.completada).length;
  const completadas = tareas.length - pendientes;

  elementos.contadorPendientes.textContent =
    `Tienes ${conPlural(pendientes, "tarea pendiente", "tareas pendientes")}`;
  elementos.contadorCompletadas.textContent =
    `Tienes ${conPlural(completadas, "tarea completada", "tareas completadas")}`;
}

function actualizarOpcionesMaterias() {
  const materias = [...new Set(tareas.map((tarea) => tarea.materia).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "es"));

  const seleccionada = elementos.filtroMateria.value;

  elementos.filtroMateria.innerHTML =
    '<option value="">Todas las materias</option>' +
    materias.map((materia) => `<option value="${escapeHTML(materia)}">${escapeHTML(materia)}</option>`).join("");

  // Si la materia seleccionada ya no existe, volvemos a "Todas"
  elementos.filtroMateria.value = materias.includes(seleccionada) ? seleccionada : "";

  elementos.listaMaterias.innerHTML = materias
    .map((materia) => `<option value="${escapeHTML(materia)}"></option>`)
    .join("");
}

// Si una tarea nueva o editada no coincide con los filtros, los dejamos como al inicio
function asegurarQueSeVe(tarea) {
  if (coincideFiltros(tarea)) return;
  elementos.buscar.value = "";
  elementos.filtroEstado.value = "todas";
  elementos.filtroMateria.value = "";
}

/* ---------------------------------------------------------
   Dibujo de las tarjetas
   --------------------------------------------------------- */

function chip(clase, contenido) {
  return `<span class="chip ${clase}">${contenido}</span>`;
}

function chipPrioridad(prioridad) {
  const etiquetas = { baja: "Baja", media: "Media", alta: "Alta" };
  return chip(
    `chip--${prioridad}`,
    `<svg class="ico-mini" aria-hidden="true"><use href="#i-bandera"></use></svg> ${etiquetas[prioridad]}`
  );
}

function chipsDeEstado(tarea) {
  if (tarea.completada) {
    return chip("chip--hecha", '<svg class="ico-mini" aria-hidden="true"><use href="#i-check"></use></svg> Hecha');
  }

  const dias = diasHasta(tarea.fecha);

  if (dias < 0) {
    return chip("chip--vencida", `Vencida hace ${conPlural(Math.abs(dias), "día", "días")}`);
  }
  if (dias === 0) {
    return chip("chip--hoy", "Vence hoy");
  }
  if (dias === 1) {
    return chip("chip--manana", "Vence mañana");
  }
  return "";
}

function plantillaTarjeta(tarea, animacion) {
  const titulo = escapeHTML(tarea.titulo);
  const nota = escapeHTML(tarea.nota);

  const accionCompletar = tarea.completada ? "Marcar como pendiente" : "Marcar como completada";

  return `
    <li class="tarjeta ${tarea.completada ? "is-completada" : ""} ${animacion}" data-id="${escapeHTML(tarea.id)}">
      <div class="tarjeta__cuerpo">
        <div class="tarjeta__encabezado">
          <span class="check-estado" aria-hidden="true">
            <svg class="ico-mini"><use href="#i-check"></use></svg>
          </span>
          <div class="tarjeta__info">
            <h3 class="tarjeta__titulo">${titulo}</h3>
            <div class="tarjeta__meta">
              ${chip("chip--materia", `<svg class="ico-mini" aria-hidden="true"><use href="#i-libro"></use></svg> ${escapeHTML(tarea.materia)}`)}
              ${chip("chip--fecha", `<svg class="ico-mini" aria-hidden="true"><use href="#i-calendario"></use></svg> ${formatearFecha(tarea.fecha)}`)}
              ${chipPrioridad(tarea.prioridad)}
              ${chipsDeEstado(tarea)}
            </div>
          </div>
        </div>
        ${tarea.nota ? `<p class="tarjeta__nota">${nota}</p>` : ""}
      </div>

      <div class="tarjeta__acciones" role="group" aria-label="Acciones para ${titulo}">
        <button type="button" class="btn-icono btn-icono--completar ${tarea.completada ? "is-hecho" : ""}"
                data-action="completar" title="${accionCompletar}"
                aria-label="${accionCompletar}: ${titulo}">
          <svg class="ico" aria-hidden="true"><use href="#i-check"></use></svg>
        </button>
        <button type="button" class="btn-icono btn-icono--editar" data-action="editar"
                title="Editar tarea" aria-label="Editar tarea: ${titulo}">
          <svg class="ico" aria-hidden="true"><use href="#i-editar"></use></svg>
        </button>
        <button type="button" class="btn-icono btn-icono--eliminar" data-action="eliminar"
                title="Eliminar tarea" aria-label="Eliminar tarea: ${titulo}">
          <svg class="ico" aria-hidden="true"><use href="#i-basura"></use></svg>
        </button>
      </div>
    </li>`;
}

function render(opciones = {}) {
  actualizarContadores();

  const visibles = tareasVisibles();
  const animar = opciones.animar;

  elementos.lista.innerHTML = visibles
    .map((tarea) => plantillaTarjeta(tarea, animar && animar.id === tarea.id ? animar.clase : ""))
    .join("");

  elementos.lista.hidden = visibles.length === 0;
  elementos.mensajeVacio.hidden = visibles.length > 0;

  if (visibles.length === 0) {
    elementos.textoVacio.textContent = tareas.length === 0
      ? "¡No tienes tareas pendientes! Disfruta tu descanso 🌊"
      : "No encontramos tareas con esos filtros. Prueba con otra búsqueda.";
  }

  // Quitamos la clase de animación cuando termina para no repetirla en futuros renders
  if (animar) {
    setTimeout(() => {
      const nodo = elementos.lista.querySelector(`[data-id="${animar.id}"]`);
      if (nodo) nodo.classList.remove(animar.clase);
    }, 800);
  }
}

// Devolvemos el foco al botón que el usuario acaba de usar
function restaurarFoco(id, accion) {
  const boton = elementos.lista.querySelector(`[data-id="${id}"] [data-action="${accion}"]`);
  if (boton) {
    boton.focus({ preventScroll: true });
  } else {
    elementos.lista.focus({ preventScroll: true });
  }
}

/* ---------------------------------------------------------
   Modo edición
   --------------------------------------------------------- */

function entrarEnEdicion(tarea) {
  editandoId = tarea.id;

  elementos.titulo.value = tarea.titulo;
  elementos.materia.value = tarea.materia;
  elementos.fecha.value = tarea.fecha;
  elementos.prioridad.value = tarea.prioridad;
  elementos.nota.value = tarea.nota;

  elementos.tituloEditando.textContent = tarea.titulo;
  elementos.avisoEdicion.hidden = false;
  elementos.textoGuardar.textContent = "Guardar cambios";
  elementos.btnGuardar.querySelector("use").setAttribute("href", "#i-check");

  elementos.formulario.scrollIntoView({ behavior: "smooth", block: "center" });
  elementos.titulo.focus({ preventScroll: true });
}

function salirDeEdicion() {
  editandoId = null;
  elementos.avisoEdicion.hidden = true;
  elementos.tituloEditando.textContent = "";
  elementos.textoGuardar.textContent = "Agregar tarea";
  elementos.btnGuardar.querySelector("use").setAttribute("href", "#i-mas");
  elementos.formulario.reset();
  mostrarErrores({});
}

/* ---------------------------------------------------------
   Acciones sobre las tareas
   --------------------------------------------------------- */

function procesarEnvio(evento) {
  evento.preventDefault();

  const datos = leerFormulario();
  const errores = validarDatos(datos);
  mostrarErrores(errores);

  if (Object.keys(errores).length > 0) {
    elementos[Object.keys(errores)[0]].focus();
    return;
  }

  const eraEdicion = Boolean(editandoId);
  let id;
  let mensaje;
  let claseAnimacion;

  if (eraEdicion) {
    const tarea = tareas.find((item) => item.id === editandoId);
    if (!tarea) {
      salirDeEdicion();
      return;
    }

    Object.assign(tarea, datos, { actualizadaEl: Date.now() });
    id = tarea.id;
    mensaje = `Tarea "${tarea.titulo}" actualizada.`;
    claseAnimacion = "is-editado";
  } else {
    const ahora = Date.now();
    const tarea = {
      id: nuevoId(),
      ...datos,
      completada: false,
      creadaEl: ahora,
      actualizadaEl: ahora
    };
    tareas.push(tarea);
    id = tarea.id;
    mensaje = `Tarea "${tarea.titulo}" agregada.`;
    claseAnimacion = "is-nuevo";
  }

  guardarTareas();
  actualizarOpcionesMaterias();

  const tareaAfectada = tareas.find((item) => item.id === id);
  if (eraEdicion) {
    salirDeEdicion();
  } else {
    elementos.formulario.reset();
    mostrarErrores({});
  }

  if (tareaAfectada) asegurarQueSeVe(tareaAfectada);
  render({ animar: { id, clase: claseAnimacion } });
  mostrarAviso(mensaje);

  if (eraEdicion) {
    restaurarFoco(id, "editar");
  } else {
    elementos.titulo.focus({ preventScroll: true });
  }
}

function alternarCompletada(id) {
  const tarea = tareas.find((item) => item.id === id);
  if (!tarea) return;

  tarea.completada = !tarea.completada;
  tarea.actualizadaEl = Date.now();

  guardarTareas();
  render({
    animar: {
      id,
      clase: tarea.completada ? "is-completando" : "is-descompletando"
    }
  });

  mostrarAviso(tarea.completada
    ? `¡Listo! "${tarea.titulo}" completada.`
    : `"${tarea.titulo}" volvió a pendientes.`);

  restaurarFoco(id, "completar");
}

function eliminarTarea(id, boton) {
  const tarea = tareas.find((item) => item.id === id);
  if (!tarea) return;

  const confirmado = window.confirm(`¿Eliminar la tarea "${tarea.titulo}"?\n\nEsta acción no se puede deshacer.`);
  if (!confirmado) return;

  // Primero animamos la tarjeta y después la quitamos del estado
  const tarjeta = boton.closest(".tarjeta");
  if (tarjeta) {
    tarjeta.classList.add("is-saliendo");
    tarjeta.querySelectorAll("button").forEach((botonInterno) => {
      botonInterno.disabled = true;
    });
  }

  setTimeout(() => {
    tareas = tareas.filter((item) => item.id !== id);
    if (editandoId === id) salirDeEdicion();

    guardarTareas();
    actualizarOpcionesMaterias();
    render();
    mostrarAviso(`Tarea "${tarea.titulo}" eliminada.`);
  }, 260);
}

/* ---------------------------------------------------------
   Eventos
   --------------------------------------------------------- */

elementos.formulario.addEventListener("submit", procesarEnvio);

elementos.formulario.addEventListener("reset", () => {
  // El reset lo dispara el formulario, incluso desde "Cancelar edición"
  setTimeout(() => mostrarErrores({}), 0);
});

elementos.btnLimpiar.addEventListener("click", () => {
  if (editandoId) salirDeEdicion();
});

elementos.btnCancelar.addEventListener("click", () => {
  salirDeEdicion();
  mostrarAviso("Edición cancelada.");
  elementos.titulo.focus();
});

elementos.lista.addEventListener("click", (evento) => {
  const boton = evento.target.closest("button[data-action]");
  if (!boton) return;

  const id = boton.closest(".tarjeta")?.dataset.id;
  if (!id) return;

  if (boton.dataset.action === "completar") alternarCompletada(id);
  if (boton.dataset.action === "editar") {
    const tarea = tareas.find((item) => item.id === id);
    if (tarea) entrarEnEdicion(tarea);
  }
  if (boton.dataset.action === "eliminar") eliminarTarea(id, boton);
});

elementos.buscar.addEventListener("input", () => render());
elementos.filtroEstado.addEventListener("change", () => render());
elementos.filtroMateria.addEventListener("change", () => render());
elementos.ordenar.addEventListener("change", () => render());

elementos.btnOlas.addEventListener("click", () => {
  olasActivas = !olasActivas;
  aplicarOlas();
  mostrarAviso(olasActivas ? "Olas en movimiento 🌊" : "Olas pausadas.");
});

/* ---------------------------------------------------------
   Inicio
   --------------------------------------------------------- */

actualizarSaludo();
setInterval(actualizarSaludo, 60000); // Actualiza el saludo si pasa de hora
aplicarOlas();
actualizarOpcionesMaterias();
render();
