# Tonalizador — Informe ejecutivo y guía completa

> **Para quién es este documento:** para cualquier persona, aunque no sepa nada de música ni de informática. Aquí no hace falta saber qué es una "API" ni qué es un "acorde". Todo se explica desde cero, con ejemplos de la vida cotidiana.

**Dirección de la herramienta:** https://tonalizador.xosemiguel.eu/
**Fecha del informe:** 31 de julio de 2026

---

## Índice

1. [¿Qué es Tonalizador? (en una frase)](#1-qué-es-tonalizador-en-una-frase)
2. [Las tres ideas musicales que necesitas (explicadas sin música)](#2-las-tres-ideas-musicales-que-necesitas-explicadas-sin-música)
3. [¿Para qué sirve? Usos y beneficios](#3-para-qué-sirve-usos-y-beneficios)
4. [Cómo se usa, paso a paso](#4-cómo-se-usa-paso-a-paso)
5. [¿Cómo funciona por dentro?](#5-cómo-funciona-por-dentro)
6. [¿Por qué funciona así? La filosofía de la herramienta](#6-por-qué-funciona-así-la-filosofía-de-la-herramienta)
7. [Cómo leer los resultados](#7-cómo-leer-los-resultados)
8. [Límites y preguntas frecuentes](#8-límites-y-preguntas-frecuentes)
9. [Privacidad: qué sale de tu dispositivo y qué no](#9-privacidad-qué-sale-de-tu-dispositivo-y-qué-no)
10. [Glosario rápido](#10-glosario-rápido)
11. [Ficha técnica resumida](#11-ficha-técnica-resumida)
12. [Fuentes consultadas](#12-fuentes-consultadas)

---

## 1. ¿Qué es Tonalizador? (en una frase)

**Tonalizador es una página web que coge tu lista de canciones y te dice en qué "tono" está cada una, para que puedas agruparlas por tonos y crear listas de música que suenen bien seguidas.**

> 🧺 **Analogía: la colada.**
> Imagina que tienes un cesto enorme de ropa mezclada. Tonalizador es como una persona muy ordenada que va sacando prenda a prenda y las separa en montones: "blancas por aquí, oscuras por allá, delicadas aparte". Al final no tienes un cesto caótico, sino montones perfectamente etiquetados. Con Tonalizador, el cesto es tu playlist y los montones son las tonalidades.

No hace falta instalar nada, no hay que crear ninguna cuenta y es gratuita. Se abre en el navegador (Chrome, Edge, Safari…) desde un ordenador o un móvil.

---

## 2. Las tres ideas musicales que necesitas (explicadas sin música)

Solo hay que entender **tres conceptos**. Con ellos, todo lo demás del documento se entiende solo.

### 2.1. La tonalidad: el "hogar" de una canción

Cada canción está construida alrededor de una nota principal que actúa como su "casa". La canción sale de paseo, sube, baja… pero siempre tiende a volver a esa casa. Esa casa se llama **tonalidad**.

> 🎨 **Analogía: el color dominante.**
> Piensa en la decoración de una habitación. Puede tener muchos objetos, pero casi siempre hay un color dominante: "esta habitación es azul", "esta es beige". Con las canciones pasa igual: aunque tengan muchas notas, hay una que domina. Decir "esta canción está en Do" es como decir "esta habitación es azul".

Además, cada tonalidad tiene dos "estados de ánimo" posibles:

- **Mayor** → suena más alegre, luminosa, festiva. *(Como una foto a pleno sol.)*
- **menor** → suena más melancólica, íntima, seria. *(La misma foto en un día nublado.)*

Por eso los resultados dicen cosas como **"Re Mayor"** o **"Do menor"**: la nota-casa (Re, Do…) más el estado de ánimo (Mayor o menor).

Tonalizador muestra cada tonalidad de **tres formas equivalentes**, como un mismo nombre escrito en tres idiomas:

| Forma | Ejemplo | ¿Quién la usa? |
|---|---|---|
| Española | Do menor | La forma tradicional en España y Latinoamérica |
| Anglosajona | Cm | La que usan las apps y webs internacionales (C=Do, D=Re, E=Mi, F=Fa, G=Sol, A=La, B=Si; la "m" significa "menor") |
| Camelot | 5A | Un código pensado para combinar canciones (ver 2.2) |

### 2.2. El código Camelot: el "reloj" para combinar canciones

El sistema Camelot coloca las 24 tonalidades posibles en una rueda parecida a un reloj: números del 1 al 12, con una letra **A** (tonos menores) o **B** (tonos Mayores).

**La regla de oro es sencillísima:** dos canciones combinan bien si sus códigos Camelot son **iguales o vecinos** (el mismo número con otra letra, o el número de al lado con la misma letra).

```
   Canción en 5A combina bien con...
   │
   ├── 5A  → misma casilla (combinación perfecta)
   ├── 5B  → mismo número, otra letra
   ├── 4A  → número vecino por abajo
   └── 6A  → número vecino por arriba
```

> 🧩 **Analogía: piezas de puzle.**
> Cada canción es una pieza de puzle y el código Camelot dibuja la forma de sus bordes. Dos piezas con bordes compatibles encajan sin forzar; dos piezas incompatibles chirrían aunque las aprietes. Los DJ profesionales usan exactamente este truco (lo llaman "mezcla armónica") para que una canción entre en la siguiente sin que se note un choque desagradable.

### 2.3. Los BPM: el pulso de la canción

**BPM** significa "beats por minuto": cuántos golpes de ritmo da la canción en un minuto.

> ❤️ **Analogía: el latido del corazón.**
> Una persona en reposo late a unos 60-80 pulsaciones por minuto; corriendo, a 150. Las canciones igual: una balada ronda 70 BPM, una canción de baile ronda 120-130. Saber los BPM ayuda a no poner una canción "corriendo" justo después de una "durmiendo la siesta".

---

## 3. ¿Para qué sirve? Usos y beneficios

### ¿Qué problema resuelve?

Averiguar la tonalidad de una canción **a oído** requiere años de formación musical. Hacerlo con una playlist de 300 canciones, además, llevaría días. Tonalizador lo hace automáticamente en minutos.

### Usos concretos

```
USOS DE TONALIZADOR
│
├── 🎧 Crear playlists que fluyen
│      Ordenar las canciones para que cada una "encaje" con la
│      siguiente y la lista suene como un todo, sin saltos bruscos.
│
├── 🎤 Cantar o tocar encima
│      Si cantas o tocas un instrumento, saber el tono de la canción
│      te dice si te viene cómoda o si te quedará muy aguda/grave.
│
├── 🎚️ Sesiones tipo DJ (mezcla armónica)
│      Encadenar canciones de códigos Camelot vecinos, como hacen
│      los profesionales, para fiestas o eventos.
│
├── 🧘 Ambientes coherentes
│      Listas para estudiar, yoga o cenas donde el "estado de ánimo"
│      (Mayor/menor) y el pulso (BPM) se mantienen estables.
│
└── 🔍 Curiosidad musical
       Descubrir en qué tono está esa canción que te encanta,
       incluso desde un archivo MP3 que tengas guardado.
```

### Beneficios frente a hacerlo a mano

En lugar de días de trabajo experto, se obtiene en minutos una clasificación con dos garantías: la herramienta **te dice de dónde sacó cada dato** (transparencia) y **nunca inventa una respuesta cuando tiene dudas** — las canciones dudosas quedan en una lista de revisión, claramente separadas.

---

## 4. Cómo se usa, paso a paso

La pantalla principal muestra tres grandes botones que son también los tres pasos del proceso:

```
   ①  EXPORTAR  ──▶  ②  ANALIZAR  ──▶  ③  DESCARGAR
   "Trae tus           "Identifica          "Recoge tus
    canciones"          la tonalidad"        nuevas listas"
```

> 📦 **Analogía general: una mudanza ordenada.**
> ① Haces el inventario de lo que tienes (exportar la lista).
> ② Un equipo experto examina y etiqueta cada objeto (analizar).
> ③ Recibes las cajas ya clasificadas y etiquetadas (descargar).

### Paso ① — Exportar: conseguir la lista de tus canciones

Tonalizador necesita saber **qué canciones** hay en tu playlist. Para eso se usa un servicio gratuito externo llamado **TuneMyMusic**, que convierte tu playlist (por ejemplo, de YouTube Music) en un pequeño archivo de texto llamado **CSV**.

Un CSV es simplemente una lista escrita: título, artista, álbum… **No contiene la música**, igual que el índice de un libro no contiene los capítulos. Tu playlist original no se toca ni se modifica.

Instrucciones:

1. En Tonalizador, pulsa **«Abrir TuneMyMusic»**. Se abre otra pestaña sin cerrar Tonalizador.
2. En TuneMyMusic, elige **YouTube Music** como origen y sigue sus indicaciones para acceder a tus playlists.
3. Selecciona **solo la playlist** que quieres ordenar.
4. Elige exportarla **a un archivo** en formato **CSV**. Se guardará normalmente en tu carpeta *Descargas*.
5. Vuelve a Tonalizador, pulsa **«Ya tengo el archivo CSV»** y elige ese archivo.

> 💡 **Atajo:** si solo te interesa **una** canción y ya tienes su archivo de audio (MP3, etc.) en tu dispositivo, no necesitas ningún CSV: pulsa **«Analizar una canción de mi dispositivo»** y elige el archivo directamente.

### Paso ② — Analizar: identificar la tonalidad de cada canción

1. Pulsa **«Elegir el archivo CSV de mi playlist»** y selecciona el archivo `.csv` que guardaste.
2. Comprueba que el nombre del archivo y el número de canciones son los esperados. Si no, puedes elegir otro archivo.
3. Pulsa **«Analizar mis canciones»** y deja que trabaje. **El progreso se guarda solo** en tu navegador: si se corta internet o cierras la página, al volver continúa donde estaba.
4. Al terminar, junto a cada canción aparece su tonalidad (en español, en notación internacional y en Camelot), sus BPM y **de dónde salió el dato**.
5. Si alguna canción **queda sin tonalidad** o el resultado no es fiable, junto a esa canción (y solo a esa) aparece el botón **«Analizar audio»**: puedes darle su archivo MP3, M4A, WAV, FLAC, OGG o AAC y Tonalizador lo examinará "escuchándolo" directamente en tu dispositivo.

> ⏳ **Aviso práctico:** el análisis de un archivo de audio examina la canción completa, de principio a fin. En un móvil puede tardar varios minutos y gastar más batería. Es normal.

### Paso ③ — Descargar: recoger las listas ya ordenadas

1. Revisa el resumen: cuántas canciones quedaron **clasificadas** y cuántas **necesitan revisión**.
2. Pulsa **«Descargar todas las listas»**. Recibirás un único archivo llamado `playlists-por-tonalidad.zip`.
3. Al abrir el ZIP encontrarás:

```
playlists-por-tonalidad.zip
│
├── Un archivo CSV por cada tonalidad encontrada
│     (p. ej. las canciones en Do menor juntas, las de Re Mayor juntas...)
│     Dentro de cada archivo se conserva el orden original de tu playlist.
│
├── resumen.csv  →  la tabla general con todos los datos de todas las canciones
│
└── revisar.csv  →  (solo si hace falta) las canciones dudosas,
                    para que decidas tú con calma
```

4. Si quieres convertir alguna de esas listas en una playlist real de YouTube Music, usa TuneMyMusic **en sentido inverso**: importa el CSV de la tonalidad que quieras.

> 📦 **Analogía:** es como recibir cajas ya etiquetadas y una hoja resumen: cada caja contiene las canciones de una tonalidad, y tú decides cuáles vuelves a colocar en la estantería de YouTube Music.

---

## 5. ¿Cómo funciona por dentro?

Aquí está la parte más interesante: **¿cómo sabe Tonalizador el tono de una canción?** No lo adivina: consulta fuentes fiables en un orden muy pensado, y solo da una respuesta cuando está seguro.

### 5.1. La cadena de consulta: de lo más rápido a lo más laborioso

Para cada canción de la lista, Tonalizador sigue esta cadena, parándose en cuanto obtiene una respuesta fiable:

```
PARA CADA CANCIÓN...
│
│  1º  ¿Ya la conocemos?  →  MEMORIA (caché)
│      Si alguien ya consultó esa canción antes, la respuesta está
│      guardada y se devuelve al instante.
│      🗂️ Como el archivador de una gestoría: si el expediente ya
│         existe, no se vuelve a tramitar.
│
│  2º  ¿Qué canción es exactamente?  →  SPOTIFY (identificación)
│      Con el título y el artista del CSV, se localiza la grabación
│      exacta en el catálogo de Spotify. Solo identifica: confirma
│      "es ESTA grabación y no otra parecida".
│      🕵️ Como comprobar el DNI: mismo nombre no basta, hay que
│         asegurarse de que es la persona correcta.
│
│  3º  ¿En qué tono está?  →  RECCOBEATS (datos musicales)
│      Una base de datos musical gratuita que, para esa grabación
│      exacta, proporciona la tonalidad y los BPM.
│      📚 Como la enciclopedia especializada: una vez sabes el DNI
│         del libro, buscas su ficha técnica.
│
│  4º  ¿Nada funcionó?  →  ANÁLISIS ACÚSTICO LOCAL (opcional, tú decides)
│      Si ninguna fuente dio un dato fiable, la canción queda "sin
│      clasificar" y se te ofrece analizarla desde su archivo de
│      audio, directamente en tu dispositivo.
│      👨‍⚕️ Como el especialista: si el historial no aclara el caso,
│         se examina al paciente en persona.
│
└── En todo momento la herramienta anota QUÉ fuente usó y POR QUÉ,
    y te lo muestra junto a cada resultado.
```

**¿Por qué ese orden?** Por eficiencia y fiabilidad: primero lo instantáneo (memoria), luego lo automático y contrastado (Spotify + ReccoBeats), y solo al final lo laborioso (analizar el audio). Igual que ante una duda primero miras tus apuntes, luego consultas un libro, y solo si nada funciona haces el experimento tú mismo.

### 5.2. ¿Por qué es tan importante identificar la grabación exacta?

Una misma canción puede existir en muchas versiones: la de estudio, la del concierto en directo, un remix, una versión acústica, una regrabación… **y cada versión puede estar en un tono distinto.**

> 🥛 **Analogía: la leche del supermercado.**
> Pedir "leche" no basta: ¿entera, desnatada, sin lactosa? Si el repartidor te trae una cualquiera, puede acertar o no. Tonalizador es un repartidor escrupuloso: si no está seguro de qué "versión" exacta pides, **prefiere preguntarte antes que traerte la equivocada**.

Por eso Tonalizador aplica reglas estrictas: una coincidencia exacta de título y artista continúa automáticamente; una remasterización claramente equivalente (la misma grabación con sonido pulido) también; pero directos, remixes, versiones acústicas, covers o artistas distintos **nunca se dan por buenos automáticamente** — van a la lista de revisión.

### 5.3. El análisis acústico local: cómo "escucha" tu ordenador una canción

Cuando le das un archivo de audio, Tonalizador hace esto **dentro de tu navegador, sin enviar nada a internet**:

```
CÓMO SE ANALIZA UN ARCHIVO DE AUDIO
│
├── 1. Abre el archivo y lo convierte en sonido "en bruto"
│      (millones de números que describen la onda sonora).
│
├── 2. Recorre la canción completa, de principio a fin,
│      midiendo cuánto "pesa" cada una de las 12 notas musicales.
│      🍇 Como pasar la uva por una báscula grano a grano para saber
│         qué variedad domina en la caja.
│
├── 3. Compara ese "perfil de notas" con los patrones típicos
│      de las 24 tonalidades posibles (12 Mayores + 12 menores).
│      👣 Como comparar una huella encontrada con las fichas de
│         huellas conocidas: gana la que mejor encaja.
│
├── 4. Detecta también el pulso (BPM) contando los golpes rítmicos.
│
└── 5. Da el resultado CON un nivel de confianza.
       Si la coincidencia no es clara, lo dice honestamente y el
       resultado se queda en revisión: no entra a escondidas en
       las listas descargables.
```

Este método (técnicamente, un "perfil cromático" o HPCP) es el mismo enfoque que usan las herramientas profesionales de análisis musical. Tiene límites de seguridad para no saturar tu dispositivo: archivos de hasta 64 MB y canciones de hasta 15 minutos.

---

## 6. ¿Por qué funciona así? La filosofía de la herramienta

Cuatro principios explican todas las decisiones de diseño:

### 1º. «Mejor decir "no lo sé" que equivocarse en silencio»

Un dato erróneo colocado con seguridad es peor que un hueco visible: contamina la playlist sin que nadie lo note. Por eso los casos dudosos van **siempre** a una tabla de revisión donde tú tienes la última palabra, y por eso, cuando una fuente no proporciona un nivel de confianza, la herramienta muestra "sin dato" **en lugar de inventarse un porcentaje**.

> ⚖. Como un médico prudente: ante síntomas ambiguos no receta al azar; pide más pruebas o te deriva al especialista.

### 2º. «Cada respuesta lleva su recibo»

Junto a cada tonalidad se indica la fuente ("Spotify identificó la canción; tonalidad obtenida de ReccoBeats"), si vino de la memoria compartida, y la explicación del proceso. Nada es una caja negra.

> 🧾 Como un ticket de compra detallado: no solo el total, sino qué costó cada cosa.

### 3º. «Tu música no viaja»

La lista CSV se lee en tu propio navegador; al servidor solo llegan títulos y artistas para poder consultarlos. Y cuando analizas un archivo de audio, **el archivo jamás se sube a internet**: se examina dentro de tu dispositivo y se descarta al terminar. Tus correcciones manuales también se quedan solo en tu navegador.

### 4º. «El trabajo hecho no se repite»

Las tonalidades ya averiguadas se guardan en una memoria compartida (caché) con fecha de caducidad y número de versión. Si tú u otra persona consultáis mañana la misma canción, la respuesta es inmediata. Y si el método de análisis mejora, el número de versión cambia y los resultados antiguos se recalculan en lugar de arrastrarse.

---

## 7. Cómo leer los resultados

Cada canción analizada muestra una ficha como esta (ejemplo real de las pruebas de la herramienta):

| Dato | Ejemplo | Qué significa |
|---|---|---|
| Tonalidad en español | Do menor | La "casa" de la canción y su estado de ánimo, en nomenclatura tradicional |
| Notación anglosajona | Cm | Lo mismo, en el formato internacional de las apps |
| Código Camelot | 5A | Lo mismo, en el formato para combinar canciones entre sí |
| BPM | 143 | El pulso: golpes de ritmo por minuto |
| Fuente | ReccoBeats | De dónde salió el dato de tonalidad |
| Caché | Sí/No | Si la respuesta ya estaba en la memoria compartida |
| Confianza de identificación | Alta | Cuánta seguridad hay de que se encontró **la grabación correcta** |
| Confianza tonal | (si existe) | Cuánta seguridad hay en la **tonalidad misma**; si la fuente no la da, no se inventa |

Fíjate en que hay **dos confianzas distintas**, y conviene no mezclarlas: una cosa es estar seguro de *qué canción es* (identificación) y otra de *en qué tono está* (tonal). Como en una biblioteca: puedes estar segurísimo de haber cogido el libro correcto y aun así dudar de en qué idioma está escrito uno de sus capítulos.

---

## 8. Límites y preguntas frecuentes

**«¿Se equivoca alguna vez?»**
Puede. Las fuentes de catálogo (como ReccoBeats) son datos estadísticos de gran calidad, no un dictamen de un musicólogo. Por eso la herramienta muestra siempre la fuente y mantiene la opción de corregir a mano.

**«¿Qué pasa con canciones que cambian de tono a mitad?»**
Algunas canciones "se mudan de casa" a mitad de camino (los músicos lo llaman *modular*). *Bohemian Rhapsody* es el ejemplo clásico: pasa por varios tonos. Para estos casos, el resultado indica la tonalidad **predominante** global — útil para clasificar, pero no un análisis musicológico de cada sección.

**«¿Por qué una canción se queda "sin clasificar"?»**
Porque ninguna fuente automática dio un dato fiable: quizá es una canción poco conocida, una versión rara, o hay varias ediciones demasiado parecidas entre sí. Es el sistema funcionando bien: prefiere el hueco al error. Para esas canciones tienes dos salidas: el análisis acústico de su archivo de audio, o la corrección manual si tú conoces el tono.

**«¿Necesito cuenta de Spotify o de YouTube Music?»**
No necesitas cuenta de Spotify: la herramienta usa su catálogo internamente. Para exportar tu playlist con TuneMyMusic sí necesitarás acceder a tu cuenta del servicio donde está la playlist (por ejemplo, YouTube Music), pero eso ocurre en la web de TuneMyMusic, no en Tonalizador.

**«¿Cuánto tarda?»**
La consulta de una playlist es cuestión de segundos o minutos (y las repeticiones, casi instantáneas gracias a la memoria compartida). El análisis acústico de un archivo de audio es lo más lento: examina la canción entera y en un móvil puede llevar varios minutos.

**«¿Modifica mis playlists originales?»**
No. Tonalizador solo lee una copia de la lista (el CSV) y produce archivos nuevos. Tu playlist original queda intacta.

---

## 9. Privacidad: qué sale de tu dispositivo y qué no

```
TU DISPOSITIVO                          INTERNET
─────────────────────────────          ─────────────────────────────
El archivo CSV se lee aquí      ──▶    Solo viajan títulos y artistas,
                                       para poder identificarlos.

Tus archivos de audio (MP3...)  ──▶    ✗ NUNCA se suben. Se analizan
                                       aquí dentro y se descartan.

Tus correcciones manuales       ──▶    ✗ Se quedan en tu navegador.

El progreso del análisis        ──▶    ✗ Se guarda en tu navegador
                                       (por eso puedes continuar
                                       donde lo dejaste).
```

Además, los registros normales del servidor no guardan títulos ni artistas, y la herramienta no descarga música de ningún sitio: solo consulta datos *sobre* la música.

---

## 10. Glosario rápido

| Término | En una frase |
|---|---|
| **Tonalidad** | La nota "hogar" de una canción, con su estado de ánimo Mayor (luminoso) o menor (melancólico). |
| **BPM** | Pulsaciones por minuto: el latido de la canción. |
| **Camelot** | Código tipo "reloj" (1A–12B) que dice qué canciones combinan bien entre sí. |
| **CSV** | Archivo de texto con una lista (títulos, artistas…); el índice, no la música. |
| **TuneMyMusic** | Servicio web gratuito que convierte playlists en archivos CSV y viceversa. |
| **Spotify (aquí)** | El catálogo que se usa para confirmar qué grabación exacta es cada canción. |
| **ReccoBeats** | Base de datos musical gratuita que aporta la tonalidad y los BPM de cada grabación. |
| **Caché** | La "memoria" compartida donde se guardan respuestas ya averiguadas para no repetir trabajo. |
| **Análisis acústico local** | El examen del archivo de audio hecho dentro de tu propio dispositivo, sin subir nada. |
| **Modular** | Cuando una canción cambia de tonalidad a mitad de camino. |
| **ZIP** | Un "paquete" que agrupa varios archivos en uno solo para descargarlos de una vez. |

---

## 11. Ficha técnica resumida

| Aspecto | Detalle |
|---|---|
| Tipo de herramienta | Aplicación web pública y gratuita, sin cuentas de usuario |
| Dirección | https://tonalizador.xosemiguel.eu/ |
| Entrada principal | Archivo CSV de playlist (vía TuneMyMusic) o un archivo de audio suelto |
| Formatos de audio admitidos | MP3, M4A, WAV, FLAC, OGG, AAC |
| Salida | ZIP con un CSV por tonalidad + resumen general + lista de revisión |
| Datos por canción | Tonalidad (española, anglosajona y Camelot), BPM, fuente, confianzas y explicación |
| Fuentes automáticas | Memoria compartida → identificación en Spotify → tonalidad y BPM de ReccoBeats |
| Último recurso | Análisis acústico dentro del navegador (canción completa; límites: 64 MB y 15 minutos) |
| Casos dudosos | Nunca se clasifican solos: van a revisión con corrección manual |
| Privacidad | El audio nunca se sube; correcciones y progreso quedan en tu navegador |
| Accesibilidad | Manejable por teclado, con progreso anunciado y diseño adaptado a móvil |

---

## 12. Fuentes consultadas

Documentación y código del propio proyecto Tonalizador (README, guía integrada en la aplicación, documento técnico de traspaso y código fuente del análisis), más las páginas oficiales de los servicios externos:

- Tonalizador (aplicación en producción): https://tonalizador.xosemiguel.eu/
- Repositorio público del proyecto: https://github.com/GusTempranillo/tonalizador
- ReccoBeats — introducción y documentación: https://reccobeats.com/docs/documentation/introduction
- ReccoBeats — extracción de características de audio: https://reccobeats.com/docs/documentation/Analysis/audio-features-extraction
- TuneMyMusic — exportar de YouTube Music a CSV: https://www.tunemymusic.com/transfer/youtube-music-to-file
- TuneMyMusic — importar un CSV a YouTube Music: https://www.tunemymusic.com/transfer/csv-to-youtube-music

---

*Informe elaborado el 31 de julio de 2026 a partir del análisis del código fuente y la documentación del proyecto, verificado con fuentes públicas actualizadas.*
