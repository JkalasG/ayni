# Ayni · Sistema de diseño "Andes"

Sistema de diseño aplicado a toda la app, en modo claro y oscuro.

## 1. Concepto

**Cada aporte es un hilo; el pasanaku completo es un tejido.** La app es un aguayo que se va tejiendo bajo el cielo del altiplano.

- **La estructura es moderna:** columnas claras, mucho aire y tipografía grande. La identidad andina es protagonista, pero vive en lugares concretos: el tejido, las franjas, los avatares, los íconos y el cielo. No se usa como relleno.
- **La actitud es festiva:** cuando alguien paga o recibe el pozo, la app lo celebra. Se toma de Duolingo solo la actitud (rachas, logros, celebraciones), nunca su estética.
- **Un solo lenguaje gráfico:** todo se dibuja sobre la misma **cuadrícula de puntadas**, es decir, celdas cuadradas con una pequeña separación. Patrones, íconos, avatares y el tejido del pasanaku parecen bordados por la misma mano. Ese es el rasgo que hace reconocible a Ayni.

## 2. Dos cielos

| | Noche andina (oscuro) | Amanecer andino (claro) |
|---|---|---|
| Idea | El cielo del altiplano de noche: índigo casi negro, estrellas en forma de pequeños rombos y una luna "tejida" en franjas | El amanecer: celeste pálido arriba y bandas durazno hacia el horizonte, con el sol tejido en franjas asomando detrás de los cerros |
| Degradados | Solo en **bandas**, como las capas del cielo; nunca transiciones suaves | Igual |
| Prohibido | Brillos, resplandores, vidrio | — |

- La app sigue el modo del sistema. Además tiene un interruptor manual con tres opciones (como el sistema, claro, oscuro), que se guarda en el dispositivo: `localStorage` en la web y `SecureStore` en Android.
- El proveedor está en `src/lib/scheme.tsx` y los tokens en `src/lib/theme.ts` (`night`, `dawn`).
- Propongo para la etapa 2 una transición de "amanecer/anochecer": las bandas del cielo cambian de color una por una, de arriba hacia abajo. Con movimiento reducido, el cambio es instantáneo.

## 3. Paleta final y contraste verificado

Ajusté la paleta del prompt. En modo claro, varios colores de estado no llegaban a 4.5:1 como texto (el amarillo `#C99500` daba 2.5:1 sobre el fondo). Por eso cada color tiene dos versiones:

- **`fill`:** para gráficos (puntadas, rellenos, íconos). Mínimo 3:1 sobre `bg`, `surface` y `surfaceAlt`.
- **`text`:** para texto. Mínimo 4.5:1 sobre `bg`, `surface` y `surfaceAlt`.

En modo oscuro las dos versiones son iguales. Subí un poco el fucsia y el rojo para que pasen sobre `surfaceAlt`.

**Base**

| Token | Oscuro | Claro | Contraste del texto (peor caso) |
|---|---|---|---|
| `bg` | `#0B0E27` | `#FFF6EC` | — |
| `surface` | `#151A3D` | `#FFFFFF` | — |
| `surfaceAlt` | `#1E2452` | `#FBE9D7` | — |
| `ink` | `#F7F3EA` | `#1A1A3A` | 13.3 : 1 / 14.2 : 1 |
| `muted` | `#A6A9C9` | `#6B6585` | 6.4 : 1 / 4.6 : 1 |

**Colores con significado** (el contraste es el del peor caso del `text`, sobre `surfaceAlt`)

| Token | Estado real | Oscuro | Claro fill | Claro text | Contraste oscuro / claro |
|---|---|---|---|---|---|
| `fucsia` | Acción principal, "tu turno", celebración | `#FF4A97` | `#D4106B` | `#C20A60` | 4.7 / 5.1 |
| `rojo` | Atrasado, pago rechazado | `#FF6153` | `#D2301F` | `#BF2416` | 5.0 / 5.1 |
| `naranja` | Pendiente | `#FF8A1F` | `#D46400` | `#A84E00` | 6.2 / 4.7 |
| `amarillo` | El pozo, cobró el pozo, logros | `#FFD23F` | `#B07F00` | `#8A6400` | 10.2 / 4.5 |
| `verde` | Pagado, éxito | `#2FD49A` | `#0E9A64` | `#0A7A4F` | 7.7 / 4.5 |
| `turquesa` | Información, cubierto con garantía | `#29C6E0` | `#0A8BA8` | `#06708A` | 7.2 / 4.8 |
| `paypal` | Solo el botón de PayPal | `#FFC439` | `#FFC439` | — | Texto `#111` sobre él: 10.5 |

**Texto sobre botones fucsia:** en modo claro, blanco sobre `#D4106B` da 5.1:1. En modo oscuro el texto va en el índigo del fondo, porque blanco sobre `#FF4A97` daría solo 3.1:1; índigo sobre `#FF4A97` da 6.0:1.

**Hilos decorativos (`threads`):** son colores vivos que se usan solo en patrones, nunca detrás de texto.

**Reglas**
- Un color de estado nunca aparece solo: siempre lo acompaña un texto ("Pagó", "Pendiente") o un ícono.
- **Privacidad:** el grupo ve solo verde/pagado o naranja/pendiente. El rojo (rechazado) y el turquesa (cubierto con garantía) los ven solo el propio miembro y el organizador.

## 4. Tipografía

| Rol | Familia | Por qué |
|---|---|---|
| Display: títulos, montos, celebraciones | **Unbounded** (500, 700 y 800) | Es ancha y geométrica, con terminaciones redondas. Su forma cuadrada conversa con la cuadrícula de puntadas, y en tamaño grande ("ayni" a 168 px, el pozo) tiene presencia de cartel de feria sin parecer infantil |
| Lectura: todo lo demás | **Figtree** (400 y 700) | Geométrica y muy legible; sus números son limpios (sin el cero tachado de Atkinson, que en montos parecía un error de pantalla) |

- Es una mezcla de las dos parejas propuestas. Unbounded con Figtree perdía legibilidad para personas mayores, y Bricolage tiene menos presencia en los montos.
- **Cifras de ancho fijo:** verifiqué que las dos fuentes traen la función `tnum`. Los montos usan el token `tabular` (`fontVariant: ["tabular-nums"]`), para que las columnas se alineen.
- **Escala:** 168 y 92 (marca), 30 y 24 (títulos), 21 (frase), 17 (texto), 15 (secundario). El texto nunca baja de 14.
- No uso mayúsculas sostenidas en etiquetas ni etiquetas pequeñas encima de los títulos.

## 5. Sistema de patrones de aguayo

Está en `src/components/aguayo.tsx`. Todo se dibuja en SVG, con un `Path` por color, así que es barato de renderizar.

| Motivo | Uso |
|---|---|
| `franjas` | Bordes y separadores finos |
| `zigzag` | Bandas de acompañamiento |
| `rombos` | Rombos concéntricos: la banda central, el motivo protagonista |
| `escalonado` | Pirámides escalonadas para encabezados y para la ronda en que se cobra el pozo |
| `puntos` | Fondos muy suaves |

- **`AguayoBand`:** dibuja un motivo, en horizontal o en vertical.
- **`AguayoUnfold`:** la composición estándar (franjas, zigzag, rombos, zigzag, franjas). Se despliega desde la banda central hacia afuera.
- **Respeto cultural:** solo uso motivos textiles genéricos. No uso la chakana (y por eso evito las cruces escalonadas), ni la wiphala, ni otros símbolos sagrados o políticos.

## 6. Esquinas

Ayni no usa un mismo radio para todo:

| Elemento | Esquina |
|---|---|
| Elementos clave: botones principales, controles superiores, pozo, pasaporte, celebraciones | **Escalonada**, como el borde de un tejido (`SteppedBox` y `StepButton` en `src/components/stepped.tsx`) |
| Paneles secundarios | Recta o con radio 6 |
| Filas y listas | Sin caja: separadores de 1 px |

No uso sombras genéricas: la jerarquía viene de los bordes, las franjas y el color.

## 7. Íconos

- Están en `src/components/icons.tsx` y se dibujan sobre una **cuadrícula de 9 × 9 puntadas**, como pixel art textil.
- Hay 17: inicio, grupos, explorar, pasaporte, chat, avisos, pagar, pozo, garantía, turno, aprobar, rechazar, compartir, idioma, claro, oscuro y sistema.
- Son decorativos por defecto. Cuando un ícono es lo único que explica un control, recibe un `label` para lectores de pantalla.
- En la etapa 2 reemplazan los íconos de texto que aún quedan.

## 8. Avatares tejidos

- Están en `src/components/woven-avatar.tsx`. Cada avatar es una tela de 8 × 8 puntadas con las esquinas escalonadas.
- Se genera a partir del id del miembro con un hash: elige entre 6 motivos (rombo concéntrico, chevrones, diagonales, damero, pirámide escalonada, franjas), 2 colores de los hilos y 4 orientaciones. Eso da 480 combinaciones, y la misma persona siempre recibe la misma tela.
- Desde 40 px, las iniciales van en una placa central. En 32 px se muestra solo la tela, con el nombre al lado.
- Se ven en la lista de miembros de prueba de la bienvenida.

## 9. Ilustraciones de personas

- Están en `src/components/altiplano.tsx`. Son planas, sin contorno, con rasgos mínimos: ojos y, a veces, una sonrisa.
- **La escena de la bienvenida:** cuatro vecinos el día en que alguien recibe el pozo. Una señora mayor revisa su celular; un joven con gorra muestra que el pago se hizo; una mujer levanta la bolsita tejida (el pozo); un señor mayor con lentes aplaude.
- Hay distintas edades, géneros y tonos de piel, con ropa de todos los días. La única prenda tradicional es un chal a franjas, una opción entre muchas. No hay caricaturas, y los brazos son cortos y proporcionados.
- **Para la etapa 2:** escenas de estado vacío (alguien en el mercado con el celular) y de celebración (la persona que cobró, con la familia).

## 10. Lenguaje de animación

Todo se hace con Reanimated. Con movimiento reducido no hay movimiento: los elementos solo aparecen y desaparecen. Las animaciones no bloquean la interacción, y las celebraciones grandes se cierran con un toque.

| Momento | Animación | Estado |
|---|---|---|
| Entrar a la bienvenida | El aguayo se despliega: la banda central se teje primero y después las de los lados | Hecho |
| Presionar un botón principal | Pulsación (escala 0.96) y vibración suave en Android | Hecho |
| Abrir "Entrar a la demo" | La lista aparece con un fundido | Hecho |
| Pagar tu aporte | La puntada se teje en tu fila, con vibración suave y confeti de rombos | Hecho |
| Ronda completa | La columna del tejido brilla en dorado y cae confeti de rombos | Hecho |
| Recibir el pozo | Pantalla completa: se despliegan franjas tejidas, el monto cuenta hacia arriba y vibra en Android | Hecho |
| El pozo llenándose | Una barra que se llena con hilos de colores, uno por aporte | Hecho |
| Racha y nivel nuevo | La racha se ve en el pasaporte y en la celebración; al subir de nivel, la insignia tejida se arma girando | Hecho |
| Cambio de pantalla | Una franja de aguayo que barre la pantalla | Pendiente |

## 11. Gamificación del pasaporte

La gamificación se calcula solo con el perfil de confianza real (`src/lib/levels.ts`); no inventa ni infla nada.

**Niveles**, cada uno con su insignia tejida:

| Nivel | Qué pide |
|---|---|
| Hilo | Nada: es el nivel de entrada |
| Trenza | 1 pasanaku completado |
| Tejido | 2 completados y al menos 90 % de pagos a tiempo |
| Aguayo | 4 completados y al menos 95 % a tiempo |
| Maestro tejedor | 8 completados, sin haber usado nunca la garantía y sin abandonos |

- **Racha:** los pagos a tiempo seguidos, contados desde el más reciente. Es el único dato que se agregó al backend: el campo `streak` del perfil, de solo lectura y con su prueba unitaria.
- **Logros:** primer pasanaku, tres pasanakus, 10 pagos a tiempo, racha de 5, nunca usó su garantía y verificado con PayPal.
- **Nivel nuevo:** cuando el nivel sube respecto a la última visita en el dispositivo, la insignia se arma con una animación.
- **Compartir:** el pasaporte se comparte con la hoja nativa en Android, o con `navigator.share` o el portapapeles en la web.

## 12. Personaje (solo propuesta, no implementado)

**"Kipu"** sería un pequeño nudo de hilo vivo, inspirado en los quipus andinos:

- Su cuerpo es un nudo redondo de un solo color, con un hilo que le sale y con el que teje. Tiene dos ojos de puntada y no tiene alas, pico ni rasgos de animal.
- Aparecería solo en las celebraciones y en consejos breves ("Faltan 2 días para tu aporte").
- Es claramente distinto del búho de Duolingo y de cualquier mascota conocida.

Lo implemento solo si lo apruebas.

## 13. Lo que no se hace

- Degradados morados, o de azul a morado, y texto con degradado.
- Brillos sobre fondo oscuro y efecto vidrio.
- Tres tarjetas iguales en fila con un ícono arriba de cada una, y tarjetas dentro de tarjetas.
- Etiquetas pequeñas o "píldoras" encima de los títulos, y mayúsculas sostenidas en etiquetas.
- Emojis como íconos.
- Sombras genéricas, y el mismo radio en todo.
- Ilustraciones de "personas corporativas" con brazos largos.
- Caricaturas y estereotipos.
- La chakana, la wiphala y otros símbolos sagrados o políticos.
- Textos de relleno, frases vacías y botones que no hacen nada.
- Imágenes descargadas: todo se dibuja con código.
- Las fuentes Inter, Roboto, Space Grotesk, Geist, Poppins y Montserrat.

## 14. Accesibilidad

- Las zonas táctiles miden al menos 44 × 44 px. Los botones principales miden 58 px de alto, y las filas de la demo 64 px.
- El contraste está verificado en los dos modos (sección 3).
- Los estados siempre llevan texto o ícono, además del color.
- **Lectores de pantalla:**
  - El modo de color es un grupo de opciones (`radiogroup`) con su estado anunciado.
  - El botón de idioma dice adónde cambia.
  - Los patrones y las ilustraciones están ocultos para los lectores, porque son decoración.
- Se respeta el movimiento reducido (`useReducedMotion`).
- Los patrones nunca van detrás de texto.

## Actualización: PayPal visible y pulido

- **PayPal dentro de la interfaz:** chip amarillo "PayPal · Simulado" en la bienvenida, en el pozo y en el panel de actividad del grupo (`components/paypal.tsx`). Cada línea sale de un cobro o un envío real (`paidAt`, `paypalCaptureId`, `payouts`); nada inventado.
- **Escenario de demo** en `/demo`: 9 pasos en ~40 s con tres paneles (celular de Wara, organizadora, eventos de PayPal). Todo lleva la marca "Simulado".
- **El pozo es un bloque dorado sólido** (`#FFC93C` con tinta `#1A1A3A`, contraste ~10:1 en ambos modos).
- **Esquinas escalonadas en todo:** tarjetas, campos, chips, insignias y botones. El botón desactivado ya no es un rosa pálido.
- **Pendiente = hilos sueltos** en el tejido (ya no una caja punteada tipo wireframe).
