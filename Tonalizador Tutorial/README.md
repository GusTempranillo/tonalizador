# Comprender el Tonalizador — Tutorial interactivo

Experiencia de aprendizaje interactiva sobre la herramienta
[Tonalizador](https://tonalizador.xosemiguel.eu/): no solo enseña a usarla,
sino a comprender las ideas musicales y computacionales que hay detrás.

## Cómo abrirla

Basta con abrir `index.html` en cualquier navegador moderno (Chrome, Edge,
Firefox, Safari). No hay que instalar nada ni ejecutar ningún servidor.
Todo el sonido se sintetiza en el navegador con WebAudio; ningún dato sale
de la página. Con conexión a internet se cargan las fuentes tipográficas,
Tailwind y GSAP desde CDN; sin conexión, la página sigue funcionando con
un aspecto ligeramente más sobrio.

## Estructura narrativa

Un viaje en cuatro actos y 15 capítulos, con un experimento interactivo
en casi todos ellos:

- **Acto I — El oído**: el problema que resuelve, qué es una tonalidad
  (Exp. 1-2), mayor/menor (Exp. 3), escalas (Exp. 4).
- **Acto II — El mapa**: la rueda Camelot interactiva (Exp. 5).
- **Acto III — La máquina**: la cadena de fuentes caché → Spotify →
  ReccoBeats → análisis local (Exp. 6), las reglas de identificación de
  grabaciones (Exp. 7) y el laboratorio acústico en vivo (Exp. 8), con la
  fórmula de confianza real.
- **Acto IV — La práctica**: anatomía de un resultado (Exp. 9), casos
  ambiguos — relativas y modulación (Exp. 10-11), ejemplos famosos con los
  cinco resultados reales de producción y el truco de los cuatro acordes
  (Exp. 12-13), el manual de usuario convertido en juego (ver abajo),
  aplicaciones y juego de mezcla armónica (Exp. 14), errores frecuentes,
  quiz final (Exp. 15) y conclusión.

Además, un **glosario flotante**: la primera aparición de cada término clave
en cada capítulo es pulsable y muestra su definición sin perder el sitio.
Al final del viaje hay un índice desplegable con los 20 términos.

## La misión guiada (capítulo 11)

El manual de usuario es un juego de 12 retos sobre capturas reales de la
herramienta, tomadas durante un análisis auténtico de cinco canciones:

- 8 escenas con puntos explorables sobre la interfaz; cada una plantea un
  reto de «toca el lugar correcto». Lupa al pasar el cursor y lente de
  aumento a pantalla completa.
- El juego se abre **a pantalla completa** al llegar a él; se sale con `Esc`
  o con el botón ⤡. Cuando el navegador exige un gesto del usuario para
  activarla (lo habitual al llegar solo con scroll), se ofrece con un toque
  y la elección se recuerda.
- 4 retos finales de criterio, sin imagen, con las opciones plegadas.
- Marcador con aciertos, fallos y puntos (+100 / −25), valoración final por
  rangos y diploma descargable en PNG, generado en el propio navegador y
  expedido a nombre de quien juega (el nombre es obligatorio y se recuerda).
- Teclado: ← → cambian de escena, 1-8 saltan a una escena, 9/0 a la ronda final.

## Progreso guardado

La puntuación de la misión y los capítulos ya leídos se guardan en el
navegador (`localStorage`), de modo que puedes cerrar la página y continuar
más tarde; en el menú, los capítulos leídos aparecen con ✓. Si el navegador
no permite guardar, todo sigue funcionando igual, sin memoria entre visitas.

## Fidelidad técnica

Los contenidos se elaboraron a partir del código fuente real del proyecto:

- Perfiles tonales Krumhansl–Kessler y correlación de Pearson idénticos a
  `src/lib/acousticAnalysis.ts` (algoritmo `local_hpcp_v2_full`).
- Fórmula de confianza real: 0,42·correlación + 0,30·separación +
  0,10·concentración + 0,18·acuerdo; umbral de fiabilidad 62 %.
- Tabla Camelot idéntica a `contracts/keyMap.ts`.
- Reglas de matching (`metadata_exact_title_artist`,
  `metadata_remaster_equivalent`, directos/covers a revisión) de
  `api/matching.ts` (versión `matching-v4`).
- Resultados de ejemplo de las pruebas reales en producción (julio 2026).

## Archivos

```
index.html          Estructura y todos los textos (SPA, HTML5 semántico)
css/main.css        Sistema de diseño completo (tema oscuro «observatorio»)
css/utilities.css   Utilidades mínimas de apoyo
js/theory.js        Datos y lógica musical pura (perfiles, Camelot, escalas)
js/audio.js         Motor WebAudio (piano sintetizado, secuencias)
js/chapters.js      Los experimentos interactivos y la misión guiada
js/main.js          Arranque: cabecera, menú, progreso, revelados, GSAP
img/app-*.webp      Capturas reales de la herramienta (misión guiada)
img/og-tutorial.png Imagen de vista previa al compartir el enlace
```

Sin frameworks ni compilación: HTML5 + CSS + JavaScript ES6, SVG, Canvas,
WebAudio, GSAP y Tailwind por CDN.
