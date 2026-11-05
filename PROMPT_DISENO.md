# Prompt de diseño para Ayni

> **Cómo usarlo:** abre la carpeta del proyecto `ayni` en VS Code con Claude, copia todo el bloque de abajo (desde "Eres el diseñador…" hasta el final) y pégalo en el chat. Está pensado para que Claude primero proponga la dirección visual, espere tu visto bueno y después la implemente en el código.

---

Eres el diseñador y desarrollador frontend principal de **Ayni**, una app para organizar **pasanakus** (el ahorro rotativo boliviano) sobre PayPal, con IA. Vas a rediseñar la app para que sea **llamativa, memorable y con identidad propia**. Trabajas directamente sobre el código de este repositorio.

## 1. Contexto del producto

- **Ayni** es el principio andino de reciprocidad: *hoy por ti, mañana por mí*.
- En un pasanaku, cada miembro aporta lo mismo en cada ronda y, por turnos, uno se lleva el pozo completo.
- Lo que hace única a Ayni es la **red de confianza**: el historial de pagos, verificado con la cuenta de PayPal, se convierte en un **pasaporte de confianza** que permite entrar a pasanakus abiertos entre desconocidos. Una **garantía escalonada** protege al grupo si alguien deja de pagar.
- Usuarios: personas de Bolivia y Latinoamérica, muchas sin historial bancario, que usan el celular para todo. También lo verán los jueces de un hackathon internacional de PayPal (la app es bilingüe, español e inglés).
- La idea visual central: **cada aporte es un hilo; el pasanaku completo es un tejido.** El aguayo (el tejido andino de colores) es la metáfora de toda la app.

## 2. Stack y restricciones técnicas

- **Expo SDK 58, React Native, Expo Router y TypeScript.** La misma app corre en **Android** y en **web** (Expo web). Todo lo que hagas debe funcionar en ambos: nada que dependa solo del navegador.
- El tema actual está en `app/src/lib/theme.ts` y los componentes base en `app/src/components/ui.tsx`. Las pantallas están en `app/src/app/`. Los textos bilingües están en `app/src/lib/i18n.tsx`: todo texto nuevo va ahí, en los dos idiomas.
- **No cambies la lógica** de negocio, las llamadas a la API ni los flujos de pago. Solo diseño, componentes, animación y textos de interfaz.
- Puedes agregar dependencias, siempre con `npx expo install` para que sean compatibles con el SDK:
  - `react-native-svg` para patrones, íconos, avatares e ilustraciones.
  - `expo-font` y paquetes `@expo-google-fonts/*` para la tipografía.
  - `expo-haptics` para vibraciones en Android.
  - `react-native-reanimated` (ya instalado) para las animaciones.
- **Todo lo visual se dibuja con código (SVG)**: patrones, íconos, avatares e ilustraciones. Nada de imágenes descargadas de internet ni de bancos de imágenes.
- Debe verse bien en un celular de 360 px de ancho y en escritorio (contenido centrado, con un ancho máximo cómodo).

## 3. Dirección visual

### 3.1 Sensación
**Moderno con raíz andina:** la estructura limpia y clara de una app actual, con una identidad andina **protagonista** y una energía **festiva**. Referencia de actitud: **Duolingo** (personalidad, celebraciones, rachas, sensación de logro). Toma de Duolingo la *actitud*, nunca su estética, sus colores, su personaje ni su forma de dibujar.

### 3.2 Dos modos: noche y amanecer
- **Modo oscuro, "Noche andina":** el cielo profundo del altiplano de noche, azul índigo muy oscuro, casi negro, con los colores del aguayo brillando encima como hilos de luz.
- **Modo claro, "Amanecer andino":** el cielo del altiplano al amanecer, claro y cálido, con luz suave y los mismos colores del aguayo, ajustados para contraste sobre fondo claro.
- La app sigue el modo del sistema y tiene además un interruptor manual (sistema, claro, oscuro), guardado en el dispositivo.
- La transición entre modos puede ser una animación de "amanecer" o "anochecer".

### 3.3 Paleta (punto de partida; ajústala y justifícala)

| Token | Noche andina (oscuro) | Amanecer andino (claro) | Uso |
|---|---|---|---|
| `bg` | `#0B0E27` | `#FFF6EC` | Fondo |
| `surface` | `#151A3D` | `#FFFFFF` | Paneles |
| `surfaceAlt` | `#1E2452` | `#FBE9D7` | Áreas secundarias |
| `ink` | `#F7F3EA` | `#1A1A3A` | Texto principal |
| `muted` | `#A6A9C9` | `#6B6585` | Texto secundario |
| `fucsia` | `#FF2E88` | `#D4106B` | Acción principal, celebración |
| `rojo` | `#FF4B3E` | `#D2301F` | Alertas, atrasos |
| `naranja` | `#FF8A1F` | `#E06A00` | Pendiente |
| `amarillo` | `#FFD23F` | `#C99500` | Pozo, logros |
| `verde` | `#2FD49A` | `#0E9A64` | Pagado, éxito |
| `turquesa` | `#29C6E0` | `#0A8BA8` | Información, PayPal |
| `paypal` | `#FFC439` | `#FFC439` | Solo el botón de PayPal |

Reglas de color:
- **Contraste mínimo 4.5:1** para el texto normal y 3:1 para el texto grande, en ambos modos. Verifícalo.
- Cada color de estado corresponde a **un estado real** (pagado, pendiente, atrasado, cubierto con garantía, cobró el pozo) y siempre va acompañado de texto o ícono: **nunca solo color**.
- Se permiten degradados **solo en bandas**, como las capas del cielo del altiplano o las franjas de un tejido. Nada de degradados suaves y genéricos.

### 3.4 Tipografía
- **Dos familias:** una **display** llamativa para títulos, montos grandes y celebraciones, y una de **lectura** muy legible para todo lo demás.
- Candidatas (elige una pareja y justifica la elección, o propón otra mejor que cumpla lo mismo):
  - Display: **Unbounded** (ancha y geométrica) con lectura **Figtree**.
  - Display: **Bricolage Grotesque** con lectura **Atkinson Hyperlegible** (pensada para la legibilidad).
- Prohibidas: Inter, Roboto, Space Grotesk, Geist, Poppins, Montserrat.
- Los montos usan números de ancho fijo para que las columnas se alineen.
- Los montos importantes son **grandes**: el pozo debe sentirse como un tesoro.

## 4. Elementos de identidad (todos dibujados en SVG)

### 4.1 Sistema de patrones de aguayo
- Crea un componente de patrones con motivos geométricos de tejido andino: **rombos, zigzag, escalonados, bandas y franjas de colores**.
- Componible: franjas para bordes, bandas para encabezados, fondos con poca opacidad para que no compitan con el contenido.
- **Respeto cultural:** usa motivos textiles genéricos. **No uses** la chakana, la wiphala ni otros símbolos sagrados o políticos como decoración.

### 4.2 Tejido del pasanaku (la pantalla estrella)
- Una cuadrícula con una fila por miembro y una columna por ronda, que **se ve como un aguayo que se va tejiendo**.
- Cada aporte pagado es una celda "tejida" con un motivo y color; los pendientes se ven como hilo sin tejer; la ronda en que cada uno cobra el pozo tiene un motivo especial.
- Al pagar, el hilo **se teje en vivo** con una animación.
- Al completarse una ronda, la columna entera brilla y aparece una celebración.

### 4.3 Avatares tejidos
- Cada miembro tiene un **avatar generado a partir de su identificador**: un patrón geométrico único (motivo, colores y orientación), siempre igual para la misma persona. Con sus iniciales encima o al lado.
- Deben ser distinguibles entre sí y verse bien en tamaño pequeño (32 px) y grande (96 px).

### 4.4 Íconos propios
- Diseña un set de íconos **dibujados sobre una cuadrícula de tejido**, como si fueran bordados o pixel art textil: inicio, grupos, explorar, pasaporte, chat, avisos, pagar, pozo, garantía, turno, aprobar, rechazar, compartir, idioma, modo claro/oscuro.
- Reemplaza todos los emojis que hoy se usan como íconos.

### 4.5 Ilustraciones de personas
- Ilustraciones planas y coloridas de **personas comunes y actuales**: diversas en edad, género y estilo, en situaciones cotidianas (en el mercado, con el celular, en familia, celebrando el pozo).
- **Respeto:** nada de caricaturas ni estereotipos; no reduzcas a las personas a un traje típico. Si aparece ropa tradicional, que sea una opción entre muchas, tratada con dignidad.
- Úsalas en la bienvenida, en los estados vacíos y en las celebraciones.

### 4.6 Personaje (opcional, propón primero)
- Si suma, propón un personaje **original** para las celebraciones y los consejos, por ejemplo un pequeño **nudo de hilo** vivo que teje (conecta con los quipus andinos). Debe ser claramente distinto del búho de Duolingo y de cualquier mascota conocida.
- No lo implementes sin mi aprobación.

## 5. Animación y celebración (mucha y festiva)

- **Pagaste tu aporte:** el hilo se teje en tu fila, vibración suave y confeti de pequeños rombos de colores.
- **Recibiste el pozo:** pantalla completa de celebración, el monto contando hacia arriba, lluvia de rombos y franjas de aguayo que se despliegan, ilustración celebrando, vibración fuerte.
- **Racha de pagos a tiempo** (al estilo de las rachas de Duolingo): un contador con una llama o hilo que crece, visible en el pasaporte.
- **Subir de nivel en el pasaporte:** animación de "nivel nuevo" con su insignia tejida.
- **El pozo llenándose:** un indicador animado que se llena con hilos de colores a medida que entran los aportes.
- Transiciones entre pantallas con franjas de aguayo que se deslizan.
- Pulsación al presionar los botones principales.

Reglas de animación:
- Todo con **Reanimated**, fluido a 60 cuadros por segundo en un Android de gama media.
- Las animaciones **no bloquean**: el usuario puede seguir usando la app mientras se ven.
- Respeta la preferencia de **movimiento reducido** del sistema: en ese caso, celebraciones sin movimiento (aparecer y desaparecer).
- Las celebraciones grandes (pozo, nivel nuevo) se pueden cerrar con un toque.

## 6. Gamificación del pasaporte de confianza

El pasaporte refleja **datos reales**; la gamificación solo los hace visibles y motivadores, nunca los inventa ni los infla.

- **Niveles** con nombres del tejido, por ejemplo: *Hilo* (nuevo) → *Trenza* → *Tejido* → *Aguayo* → *Maestro tejedor*. Cada nivel con su insignia tejida.
- **Racha** de pagos a tiempo.
- **Logros** tejidos: primer pasanaku completado, diez pagos a tiempo, primer pasanaku abierto, nunca usó su garantía, etc.
- El pasaporte muestra: pasanakus completados, porcentaje a tiempo, racha, nivel y la marca de "verificado con PayPal".
- Debe poder **compartirse** como una tarjeta visual (imagen o vista para mostrar).
- Con un tono de orgullo y dignidad: es la historia de cumplimiento de una persona, no un juego trivial.

## 7. Pantallas a diseñar

### 7.1 Bienvenida y login
- Primera impresión: el nombre **Ayni** en grande con su significado, un tejido de aguayo que se despliega al entrar, una ilustración y la frase "Hoy por ti, mañana por mí".
- Botón "Ingresar con PayPal" (respetando el color de PayPal) y "Entrar a la demo".
- Selector de idioma y de modo claro/oscuro.

### 7.2 Mis pasanakus y grupo
- **Mis pasanakus:** cada grupo como una tarjeta con su franja de aguayo propia, el monto del pozo, mi próxima fecha y mi turno.
- **Grupo:** el pozo en grande con su indicador de llenado, la ronda actual, quién recibe, el **tejido del pasanaku**, mi garantía y el botón de pago. Las decisiones pendientes del organizador destacadas.
- **Privacidad:** al grupo solo se le muestra pagado o pendiente; los motivos (garantía usada, multa) solo los ve el propio miembro y el organizador.

### 7.3 Red de confianza
- **Explorar pasanakus abiertos:** tarjetas con aporte, frecuencia, lugares libres, requisitos e indicador inmediato de si cumplo ("Cumples todo", "Te falta 1 pasanaku completado").
- **Solicitud de ingreso:** mi pasaporte comparado con los requisitos, uno por uno, con claridad visual.
- **Recomendación de la IA** (vista del organizador): la explicación de la IA en una tarjeta clara, siempre con la decisión final en manos del organizador.
- **Mi pasaporte de confianza:** la pantalla más "Duolingo" de la app: nivel, racha, logros, historial y botón para compartir.

### 7.4 Escenario de demo (para jueces)
- Una página con un botón **"Reproducir escenario"** que cuenta una historia en 30 a 45 segundos: Wara, sin historial bancario pero con dos pasanakus completados, solicita entrar a un grupo de desconocidos; la IA recomienda aceptarla y el organizador aprueba; en la ronda, a un miembro le rechazan el pago y la garantía lo cubre; el pozo llega por PayPal; el pasaporte de Wara sube de nivel.
- En pantallas anchas, **tres paneles**: el celular del miembro, el organizador y una línea de eventos de PayPal en vivo. En el celular, uno tras otro.
- Que se vea espectacular grabada en video: es la escena principal del demo del hackathon.
- Todo lo simulado debe decir **"Simulado"** claramente.

## 8. Lo que no quiero: diseño genérico o "hecho por IA"

Evita todo esto:
- Degradados morados o azul a morado, texto con degradado, brillos sobre fondo oscuro, efecto vidrio (glassmorphism).
- Tres tarjetas iguales en fila con un ícono arriba de cada una.
- Etiquetas pequeñas encima de cada título, o una "píldora" sobre el título principal.
- Emojis como íconos.
- Tarjetas dentro de tarjetas.
- Sombras genéricas en todo; mejor bordes, franjas y color.
- Ilustraciones genéricas de "personas corporativas" con brazos largos.
- Esquinas redondeadas iguales en todo; define un sistema propio (por ejemplo, esquinas con un corte escalonado como el borde de un tejido en elementos clave).
- Textos de relleno, "lorem ipsum" o frases vacías ("Revoluciona tus finanzas"). Los textos dicen qué pasa y a quién.
- Botones que no hacen nada.

## 9. Accesibilidad (no negociable)

- Zonas táctiles de al menos 44 × 44 px; los botones principales, más grandes.
- Contraste verificado en ambos modos.
- Estados siempre con texto o ícono, además del color.
- Etiquetas de accesibilidad en íconos y botones; avisos para lectores de pantalla cuando cambia un estado ("Pago recibido").
- Movimiento reducido respetado.
- Los patrones de fondo nunca reducen la legibilidad del texto.

## 10. Cómo quiero que trabajes

1. **Primero, propuesta.** Antes de tocar las pantallas, crea `app/DESIGN.md` con: concepto, paleta final de ambos modos con el contraste verificado, pareja tipográfica justificada, sistema de patrones, estilo de íconos y avatares, lenguaje de animación y la lista de cosas prohibidas. Implementa solo una pantalla de muestra (la bienvenida) en ambos modos. **Detente y espera mi aprobación.**
2. **Después, la base:** tokens del tema (claro y oscuro), proveedor de tema con el interruptor, fuentes, componentes de patrones, íconos, avatares y celebraciones.
3. **Luego, las pantallas**, en este orden: Grupo y tejido → Red de confianza → Escenario de demo → el resto.
4. **Revisa tu trabajo visualmente:** corre la versión web y toma capturas de cada pantalla en ambos modos, a 360 px y a 1280 px de ancho. Míralas y corrige lo que se vea mal antes de decir que terminaste.
5. **Verifica que nada se rompió:** chequeo de tipos (`npx tsc --noEmit`) y que la app siga iniciando en web y en Android.
6. Al terminar cada etapa, dame un resumen corto de lo que cambió y las capturas.
