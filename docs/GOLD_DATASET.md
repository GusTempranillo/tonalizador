# Conjunto real de validación tonal

El test automático incluye 150 casos adversariales de **identificación de catálogo**.
La precisión musical debe medirse aparte con canciones cuya tonalidad haya sido
revisada por una persona; el repositorio no inventa esas etiquetas.

Crear `tests/fixtures/gold-keys.csv` con al menos 150 filas:

```csv
title,artists,album,isrc,expected_key,notes
```

Requisitos mínimos:

- incluir directos, remixes, remasters, covers y títulos repetidos;
- incluir artistas con comas, acentos, `Topic`, VEVO y colaboraciones;
- documentar en `notes` la fuente y fecha de la revisión;
- medir `auto_classified_correct / auto_classified_total`;
- no aprobar una versión si la precisión automática es inferior al 95 %;
- informar la cobertura por separado: dejar casos en revisión no cuenta como error.

Este archivo no debe contener credenciales ni audio. Si la playlist es privada,
mantener el fixture fuera de Git y ejecutar el mismo arnés en el entorno local.
