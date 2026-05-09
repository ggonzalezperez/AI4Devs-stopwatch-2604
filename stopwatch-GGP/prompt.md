# Prompt utilizado

Chatbot: Claude (Anthropic) — Claude Opus 4.7 (1M context).

## Historial de versiones

- **v1** (Iteración 1): versión inicial.
- **v2** (consolidada): incorpora los fixes de Iteración 2:
  - Refuerzo de `display:none` para elementos con `[hidden]` cuando hay reglas CSS de `display` que lo pisan (caso `<input>` y `<span>` del display superpuestos).
  - Validación en vivo del input de edición directa (máscara `HH:MM:SS`, sólo `[0-9:]`, `maxlength="8"`, revert via evento `input`).
  - Aviso visible (borde rojo + animación de sacudida + mensaje `role="alert"`) si el parser rechaza el valor al confirmar.

---

# ROL
Actúas como un desarrollador frontend senior especializado en JavaScript vanilla, HTML semántico y CSS moderno, con experiencia en testing y en construir interfaces accesibles y responsivas.

# CONTEXTO
Estoy resolviendo un ejercicio de prompt engineering. Debo construir una aplicación web de "Cronómetro y Cuenta Atrás" inspirada en https://www.online-stopwatch.com/, partiendo de unos archivos seed mínimos.

Archivos seed actuales (carpeta `template/`):

- `template/index.html` con marcador básico y referencia a `script.js`.
- `template/script.js` vacío.

Restricciones técnicas:
- Vanilla HTML + CSS + JavaScript. NADA de frameworks (React, Vue, Tailwind, jQuery, etc.) ni dependencias externas.
- Todo debe funcionar abriendo `index.html` directamente en el navegador (`file://`), sin servidor, sin build step.
- **Arquitectura de ficheros entregables (estricta):**
  - `index.html` — incluye TODO el CSS embebido en un único bloque `<style>` dentro del `<head>`. NO crear `styles.css` externo.
  - `script.js` — único fichero JavaScript de la app.
  - Permitido como tooling separado: `tests.html` (test runner) y `prompt.md` (este prompt). Sin más ficheros de código.
- Sin recursos externos (ni fuentes web, ni imágenes, ni audio importado): todo inline (SVG en HTML, sonido sintetizado con `AudioContext`).
- Código limpio, comentado donde aporte valor, nombres claros, separación de responsabilidades.
- El destino del trabajo es el directorio `stopwatch-GGP/` y debe contener también este `prompt.md`.

# OBJETIVO

Implementar una SPA de una sola página con tres vistas (sin recargar, alternando visibilidad por JS):

## Cabecera y pie comunes a las tres vistas

- **Cabecera (franja azul fina arriba)**: texto interior **configurable y genérico**. NO hardcodear el dominio `online-stopwatch.com` ni cualquier marca de terceros. Expón el texto como una constante en `script.js` (`APP_TITLE = 'Stopwatch & Countdown'` por defecto). Si se deja vacío la franja queda vacía.
- **Pie (franja azul fina abajo)**: en las vistas Stopwatch y Countdown debe contener una flecha verde "← Back" que vuelve al selector. En la vista Selector el pie es una franja vacía.

## Vista 1 — Selector

Dos tarjetas grandes lado a lado:
- Izquierda: "Stopwatch" con una flecha verde apuntando hacia arriba.
- Derecha: "Countdown" con una flecha roja apuntando hacia abajo.
- Fondo blanco a la izquierda y verde muy claro a la derecha, separadas por una línea vertical sutil.
- Al hacer click en una tarjeta se navega a la vista correspondiente.

## Vista 2 — Stopwatch (cronómetro hacia arriba)

- Display grande con formato HH:MM:SS y, abajo a la derecha del display, los milisegundos en tres dígitos `000` más pequeños. El display tiene fondo lila muy claro y borde redondeado oscuro grueso.
- Dos botones grandes debajo, redondeados y con borde negro:
  - "Start" verde. Cuando está corriendo se transforma en "Pause" amarillo/naranja; **al pausar muestra "Continue"** (NO "Resume").
  - "Clear" rojo (resetea a 00:00:00.000; deshabilitado si ya está a cero y parado).
- Comportamiento:
  - Precisión real: usar `performance.now()` y deltas, NO `setInterval` puro acumulando milisegundos. Refresco visual mediante `requestAnimationFrame`.
  - Al volver al selector, el cronómetro se detiene y se resetea.

## Vista 3 — Countdown (cuenta atrás)

### Display
- Misma estética que el Stopwatch (HH:MM:SS + 000 ms, fondo lila, borde negro grueso).

- **Display directamente editable**: además del teclado numérico en pantalla, el usuario puede entrar en modo edición:
  - Click sobre el display, o `Tab` + `Enter`/`Espacio` cuando tiene foco (`tabindex="0"`).
  - Implementación: un `<input type="text">` superpuesto con la misma tipografía que el display. Cuando se entra en edición, se oculta el `<span>` del display y se muestra el `<input>`.
  - **CRÍTICO de CSS**: el atributo HTML `hidden` aplica `display:none` por defecto, pero CUALQUIER regla `display: ...` propia lo pisa. Por tanto, para todo elemento con `display` explícito (en concreto `.display-text` y `.display-input`) hay que añadir explícitamente `[hidden] { display: none !important; }` o equivalente. Sin esto, el `<input>` y el `<span>` se renderizan superpuestos al cargar.
  - `inputmode="numeric"` (mejor experiencia en móvil), `autocomplete="off"`, `spellcheck="false"`, `maxlength="8"` (máscara `DD:DD:DD`).
  - **Validación en vivo (obligatoria)** mediante el evento `input`:
    - Sólo se permiten dígitos y `:` (los caracteres no válidos se bloquean en `keydown`).
    - Como máximo 2 grupos separados por `:` (3 grupos en total) y cada grupo con máximo 2 dígitos.
    - Si el `input` produce un valor que viola la máscara (p. ej. al pegar), se revierte automáticamente al último valor válido. NO se permite mantener un valor con un grupo de 3+ dígitos como `0020:00:00`.
    - Mantener una variable `lastValidInput` actualizada para esta reversión.
  - **Validación al confirmar** (Enter, click fuera, blur):
    - Si `parseDisplayString(value)` devuelve `null`, NO se sale de modo edición. Se muestra:
      1. Borde rojo del display (`.display.error`).
      2. Mensaje `role="alert"` debajo del display: "Invalid time. Use HH:MM:SS (digits and colons only, max 2 digits per group)." (oculto en estado normal).
      3. Animación de sacudida del display, replicable (quitar/añadir clase `shake` con reflow forzado).
      4. El input recupera foco y selecciona su contenido.
    - El error se limpia automáticamente cuando el usuario teclea de nuevo o se sale del modo edición con Esc.
  - Mientras el countdown está corriendo o pausado, el display NO es editable (el modo edición se cierra si estaba activo y la clase `editable` se retira).

### Keypad
- Teclado numérico debajo del display, dos filas de seis botones grandes verdes:
  - Fila 1: `5  6  7  8  9  Set`
  - Fila 2: `0  1  2  3  4  Clear`  (botón "Clear" en gris)

- Lógica de entrada del keypad estilo calculadora de microondas: cada dígito pulsado entra por la derecha y desplaza los demás a la izquierda; el buffer guarda como mucho los últimos 6 dígitos y se renderiza zero-padded como `HH:MM:SS`. NO se valida en vivo: se aceptan dígitos sin restricción.

- **Normalización en `Set`**: el buffer se interpreta como raw `(hh*3600 + mm*60 + ss) * 1000`, por lo que `0090` (90 s) inicia en `00:01:30`. Documentado en JSDoc.

### Botón Set y modo running/paused
- "Set" inicia la cuenta atrás desde el valor introducido (sea desde keypad o desde edición directa).
- **Decisión fija**: al pulsar `Set`, el keypad se OCULTA y aparecen dos botones grandes con la misma estética del Stopwatch: `Pause` verde (que pasa a `Continue` al pausar) + `Clear` rojo. Al pulsar `Clear` o cuando el countdown llega a cero, se vuelve a mostrar el keypad con buffer vacío.
- Convención de etiquetas: `Continue` (NO `Resume`).

### Llegada a cero
- Detener el countdown.
- Parpadear el display 5 veces (animación CSS `@keyframes display-blink` con `step-end` y 5 iteraciones; reflow forzado para poder replicar).
- Emitir un beep sintetizado con `AudioContext` (oscilador `square`, ~880 Hz, 5 tonos). Crear/`resume()` el contexto en el primer gesto del usuario para sortear las políticas de autoplay.

## Requisitos comunes

- Diseño fiel a las imágenes de referencia: tipografía sans-serif gruesa, bordes negros gruesos redondeados, sombras sutiles. Paleta primaria:
  - Verde `#00B050`, Rojo `#E60000`, Azul franjas `#1F4E9D`, Lila claro display `#E8E8FF`, Ámbar pause `#F2B030`, Gris `#BFBFBF`.
- Responsive: en móviles (≤480 px) los botones y el display se reescalan manteniendo proporciones; a 360 px el display sigue cabiendo sin desbordar.
- Accesibilidad:
  - `aria-label` en botones cuyo texto no es autosuficiente; iconos SVG en `aria-hidden`.
  - `:focus-visible` con outline azul de 3 px en cualquier elemento focuseable.
  - Display de Countdown con `tabindex="0"`, `Enter`/`Espacio` abre edición.
  - Mensaje de error con `role="alert"`.
  - `aria-live="off"` en los timers (no anunciar el tic-tac al lector de pantalla).
- Atajos de teclado:
  - **Stopwatch**: `Enter`/`Espacio` alterna `Start`/`Pause`/`Continue`. `Esc` ejecuta `Clear` si hay tiempo, si no vuelve al selector.
  - **Countdown idle (no edición)**: `0`–`9` introducen dígitos al keypad. `Backspace` borra el último dígito. `Enter` ejecuta `Set`. `Esc` hace `Clear` si el buffer no está vacío, si no vuelve al selector.
  - **Countdown editando**: el input nativo recibe los eventos. `Enter` confirma (= Set), `Esc` cancela, `Backspace` borra carácter. Los caracteres no válidos se bloquean en `keydown` y la máscara se enforza en `input`.
  - **Countdown running/paused**: `Enter` toggle pause/continue. `Esc` reset (vuelve al keypad vacío).
- Sin librerías externas. **Sin emojis** en el código ni en la UI.
- Etiquetas en inglés.
- Convención de etiquetas de control: "Start" / "Pause" / "Continue" / "Clear" / "Set" / "Back".

# ARQUITECTURA DE JS

- IIFE en `script.js`. Expone en `window.App` los helpers puros y las clases de estado para que `tests.html` los testee sin DOM.
- **Helpers puros (testables)**:
  - `pad2(n)`, `pad3(n)`.
  - `formatTime(ms) -> { display, milliText, hours, minutes, seconds, millis }`. Clamp horas a 99.
  - `keypadShiftIn(buffer, digit)`, `keypadBackspace(buffer)`.
  - `bufferToMs(buffer)` con normalización (ver decisión en Keypad).
  - `msToBuffer(ms)` (round-trip con `bufferToMs`).
  - `parseDisplayString(str)` acepta `""`, `SS`, `MM:SS`, `HH:MM:SS` (cada parte ≤ 2 dígitos, ≤ 99). Devuelve `ms` o `null` si inválido.
  - `isValidPartialMask(v)` para la validación en vivo del input editable: sólo `[0-9:]`, ≤ 3 grupos, cada grupo ≤ 2 dígitos.
- **Clases de estado** (con `now` inyectable para tests):
  - `StopwatchState` con métodos `start/pause/clear/getCurrentMs/getStateLabel`. Estados: `idle | running | paused`.
  - `CountdownState` con `setTotal/start/pause/clear/getCurrentMs/isFinished/getStateLabel`.
- DOM bootstrap dentro del `DOMContentLoaded`, con routing de vistas que detiene/resetea timers al cambiar de vista.

# TESTING

Antes de darme el código final:
1. Crea un archivo `tests.html` que cargue `script.js` y ejecute pruebas unitarias propias (sin frameworks; mini test runner casero) para:
   - `formatTime(ms)` (incluyendo 0, ms con segundo cerrado, hh+mm+ss, negativos clamp, hours cap a 99).
   - `keypadShiftIn`, `keypadBackspace` (incluyendo crecer hasta 6 y descartar el más viejo, rechazar no-dígitos).
   - `bufferToMs` y `msToBuffer` (con round-trip y casos de normalización tipo `9999`).
   - `parseDisplayString` (válidos: `""`, `30`, `1:30`, `01:30:00`; inválidos: `abc`, `1:2:3:4`, `100:00`, `1234567`; normalización en `99:99:99`).
   - `isValidPartialMask` (vacío válido, `12:`, `12:34:56`, `0020:00:00` rechazado, `1:2:3:4` rechazado, no-dígitos rechazados).
   - Transición `idle → running → paused → continue → idle` de `StopwatchState`.
   - Transición de `CountdownState` con `setTotal/start/pause/start/finish/clear`, incluyendo `cannot start with 0`.
2. Lista en un bloque "Plan de pruebas manuales" los casos a verificar en navegador, incluyendo: navegación entre vistas, start/pause/continue/clear del stopwatch, precisión tras 60 s, introducción y validación del countdown vía keypad, **edición directa del display con teclado físico (incluyendo intento de pegar un valor inválido y intento de teclear un grupo de 3 dígitos)**, llegada a cero con beep y parpadeo, atajos de teclado, responsive a 360 px y 1280 px, recarga de la página, y comprobación de que el `<input>` editable NO se renderiza superpuesto al `<span>` cuando está oculto.
3. Ejecuta mentalmente los tests y reporta resultado esperado vs. obtenido. Si algún test falla en tu razonamiento, corrige el código antes de entregármelo.

# AUTO-REVISIÓN DE CÓDIGO

Después de escribir el código y antes de mostrármelo, haz una revisión crítica como si fueras otro ingeniero senior y reporta una sección "Auto-review" con:
- Bugs potenciales o race conditions detectados (en particular: doble disparo de teclados físicos vs. listeners de input, replay de animaciones CSS, autoplay policy de `AudioContext`, atributo `hidden` pisado por reglas `display:`).
- Smells de código y refactors aplicados (por ejemplo: no acceder a campos privados de las clases de estado desde la UI; usar `getStateLabel()`).
- Riesgos de accesibilidad o usabilidad (incluyendo modos de edición y eventos de foco).
- Cobertura de tests: qué quedó cubierto y qué no.
Aplica las correcciones de tu propia review antes de la entrega.

# FORMATO DE ENTREGA

Devuélveme la solución en este orden y formato:

1. Resumen de decisiones de diseño (máx. 10 bullets): elecciones no obvias y por qué.
2. `index.html` — bloque de código completo (incluye el `<style>` con todo el CSS embebido).
3. `script.js` — bloque de código completo, con comentarios JSDoc en las funciones públicas.
4. `tests.html` — bloque de código completo con el mini test runner y los asserts.
5. Plan de pruebas manuales — checklist marcable.
6. Auto-review — sección descrita arriba.
7. Resultado esperado de los tests — tabla con test, resultado, comentario.

# FLUJO DE TRABAJO ITERATIVO (IMPORTANTE)

No es un one-shot. Trabajaremos por iteraciones:

- Iteración 1: entrégame todo lo anterior. NO des nada por cerrado.
- Yo revisaré el código en mi local y te daré feedback: cambios visuales, bugs encontrados, ajustes de comportamiento, etc.
- Tú aplicas SOLO lo que pido, sin añadir features no solicitadas, y vuelves a entregar el bloque o bloques afectados (no repitas el código completo si solo cambia uno).
- Repetimos hasta que yo escriba explícitamente "OK final" o "aprobado". SOLO entonces consideras la entrega cerrada y me preparas un resumen ejecutivo final con los cambios totales aplicados desde la primera iteración.

Si en algún punto tienes dudas razonables sobre un detalle de diseño o comportamiento, PREGÚNTAME antes de inventar; haz como máximo 3 preguntas concretas agrupadas y continúa con la mejor suposición indicada como tal.

Las imágenes de referencia (selector, stopwatch, countdown, ejemplo de display editable) van adjuntas. Empieza por la Iteración 1.
