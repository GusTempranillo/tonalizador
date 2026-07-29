# Tonalizador de Estrella

Aplicación personal para importar playlists de TuneMyMusic o Google Takeout,
identificar cada grabación con Spotify y agruparla por tonalidad usando
ReccoBeats. Los casos ambiguos nunca se clasifican automáticamente: quedan en
una tabla de revisión con corrección manual.

## Cambios principales de v2

- coincidencia por URL de Spotify, ISRC y metadatos estrictos, en ese orden;
- umbrales conservadores y trazabilidad de la grabación encontrada;
- resultados independientes por canción y reanudación desde `localStorage`;
- caché compartida con versión, confianza, fuente y caducidad;
- acceso público con límites por IP y cola global de proveedores;
- correcciones manuales privadas para cada navegador, sin contaminar la caché común;
- reintentos de proveedores con timeout, backoff y `Retry-After`;
- exportación de playlists, `revisar.csv` y `resumen.csv`;
- sin descargas ni análisis de previews de Apple/iTunes;
- interfaz accesible por teclado, pestañas semánticas y progreso anunciado.

## Desarrollo

Requisitos: Node.js 20+, pnpm y MySQL.

```bash
pnpm install
pnpm db:migrate
pnpm dev
```

Copiar `.env.example` a `.env` y configurar:

- `DATABASE_URL`: conexión MySQL/MariaDB para desarrollo local;
- `SPOTIFY_CLIENT_ID` y `SPOTIFY_CLIENT_SECRET`;
- `SPOTIFY_MARKET=ES`.

La aplicación es pública. Las credenciales de Spotify son secretos exclusivos
del servidor: nunca deben tener prefijo `VITE_` ni guardarse en GitHub.

### Migración

`db/migrations/0001_precision_cache.sql` crea `song_cache`. En Docker se aplica
automáticamente al inicializar un volumen de MariaDB nuevo. En un despliegue
existente reconstruye la tabla, por lo que hay que hacer una copia de seguridad.

## Despliegue en el VPS

El despliegue recomendado usa el repositorio de GitHub como fuente y ejecuta
la aplicación y MariaDB en Docker dentro del VPS:

```bash
./deploy/create-env.sh
# Rellenar únicamente las dos claves de Spotify en .env.
docker compose up -d --build
sudo ./deploy/install-nginx.sh
```

La aplicación solo publica `127.0.0.1:3010`; Nginx es el único punto de entrada.
La configuración preparada para `tonalizador.xosemiguel.eu` está en
`deploy/nginx.tonalizador.conf`. El servicio existente del puerto 3000 no se
modifica. `create-env.sh` genera contraseñas aleatorias de MariaDB sin
mostrarlas, y `install-nginx.sh` instala el virtual host y solicita el
certificado de Let’s Encrypt de forma interactiva. La configuración HTTPS se
vincula solo a la IP pública para convivir con Tailscale, que ya utiliza el
puerto 443 de su interfaz privada.

## Verificación

```bash
pnpm check
pnpm lint
pnpm test
pnpm build
```

Las pruebas incluyen un corpus adversarial sintético de 150 identificaciones,
casos CSV, reintentos y timeouts. La evaluación musical real necesita un
conjunto etiquetado por una persona; su formato y criterio de precisión ≥95 %
están en [`docs/GOLD_DATASET.md`](docs/GOLD_DATASET.md).

## Privacidad y operación

El CSV se interpreta en el navegador. El servidor recibe únicamente metadatos
musicales y conserva una caché compartida de proveedor. Las correcciones
manuales permanecen en el `localStorage` del navegador que las realizó. Los
logs normales no incluyen títulos ni artistas. ReccoBeats es una fuente de
análisis de catálogo, no una garantía de tonalidad musical exacta.
