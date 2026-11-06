# Ayni: logos y banners

Propuesta de identidad para Ayni, con la tipografía y los colores de la app (paleta Noche andina / Amanecer andino). Todo está generado con código: no hay imágenes de internet, chakana ni wiphala.

Cada pieza viene en SVG (en `logos/` y `banners/`) y en PNG (en `png/`).

## La idea

- **El logotipo "ayni"** usa Unbounded ExtraBold con letras apretadas, igual que en la barra lateral de la app. Las letras están convertidas en trazos, así que se ve igual en cualquier computadora, con o sin la fuente instalada.
- **El emblema** es un rombo de franjas, como los rombos del aguayo. La mitad izquierda va en colores cálidos (fucsia, amarillo) y la derecha en fríos (turquesa, verde). Las dos se encuentran en un centro dorado: el pozo. Es el ayni, dar y recibir.
- **Los banners** repiten el paisaje de la bienvenida: un sol en franjas, montañas escalonadas con nieve y bandas de aguayo arriba y abajo.

## Logos

| Archivo | Uso |
|---|---|
| `ayni-logo-horizontal-noche` | Logo principal sobre fondo oscuro (README, presentaciones) |
| `ayni-logo-horizontal-amanecer` | Logo principal sobre fondo claro |
| `ayni-logo-horizontal-transparente-claro` | Sin fondo, para poner sobre fotos o fondos oscuros |
| `ayni-logo-horizontal-transparente-oscuro` | Sin fondo, para fondos claros |
| `ayni-logotipo-noche` / `-amanecer` | Solo la palabra "ayni", sin emblema |
| `ayni-logo-vertical-noche` / `-amanecer` | Con el lema "Hoy por ti, mañana por mí.", para portadas y la pantalla final del video |
| `ayni-icono-app` / `-claro` | Ícono de 1024 × 1024 para la app y la tienda |
| `ayni-logo-monocromo-tinta` / `-crema` | A una sola tinta: sellos, recibos, impresión en un color |

## Banners

| Archivo | Tamaño | Dónde va |
|---|---|---|
| `ayni-github-social-1280x640` | 1280 × 640 | Vista previa del repositorio en GitHub (Settings → Social preview) |
| `ayni-github-social-claro-1280x640` | 1280 × 640 | La misma, en versión clara |
| `ayni-devpost-1200x800` | 1200 × 800 | Imagen de portada del proyecto en Devpost (proporción 3:2) |
| `ayni-portada-x-1500x500` | 1500 × 500 | Portada de X o LinkedIn |
| `ayni-redes-1080x1080` | 1080 × 1080 | Publicación cuadrada en Instagram o Facebook |
| `ayni-video-1920x1080` | 1920 × 1080 | Miniatura y pantalla inicial del video de YouTube |

## Colores

| Nombre | Noche (oscuro) | Amanecer (claro) |
|---|---|---|
| Fondo | `#0B0E27` | `#FFF6EC` |
| Texto | `#F7F3EA` | `#1A1A3A` |
| Fucsia | `#FF4A97` | `#D4106B` |
| Naranja | `#FF8A1F` | `#D46400` |
| Amarillo | `#FFD23F` | `#B07F00` |
| Verde | `#2FD49A` | `#0E9A64` |
| Turquesa | `#29C6E0` | `#0A8BA8` |
| Oro del pozo | `#FFC93C` | `#FFC93C` |

## Tipografía

- **Unbounded** ExtraBold (800) para el logotipo y Black (900) para los titulares.
- **Figtree** (400 y 700) para el texto y las etiquetas.

Ambas son las mismas de la app y tienen licencia libre (SIL Open Font License), que permite usarlas en logos. En los SVG todo el texto ya está convertido en trazos, así que no hace falta tener las fuentes instaladas.

## Reglas de uso

- Deja alrededor del logo un espacio libre de al menos el alto de la "a".
- No estires, no rotes ni cambies los colores del emblema. Para un solo color, usa las versiones monocromas.
- Sobre fotos, usa la versión transparente que más contraste tenga.
- Tamaño mínimo: 24 px de alto para el emblema solo y 32 px para el logo horizontal.

## Cómo editar y volver a generar

Los textos, colores y tamaños están en `generar.py`. Necesita Python con `fontTools` (`pip install fonttools`) y lee las fuentes de `app/node_modules`, así que antes corre `npm install` en `app/`.

```bash
# desde la raíz del repositorio
python propuesta/generar.py propuesta
```

Para volver a exportar los PNG hace falta Node con `puppeteer-core` y Google Chrome instalado. La ruta de Chrome está escrita al inicio de `exportar-png.mjs`; cámbiala si tu Chrome está en otro lugar.

```bash
npm install puppeteer-core
node propuesta/exportar-png.mjs propuesta
```
