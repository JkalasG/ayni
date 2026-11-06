# Ideas pendientes para Ayni (hackathon de PayPal)

Guía para retomar más adelante. Regla de oro: **cada cosa divertida debe mostrar algo real de PayPal o del producto.** Si es solo decoración, resta.

---

## 1. Cofre que se llena al pagar (prioridad alta) — HECHO

> Implementado como vasija tejida en `app/src/components/vasija.tsx`, usada en el pozo del grupo y en `/demo`.

**Qué es:** reemplazar la barra del pozo por un cofre (o vasija) que se llena de hilos y rombos de colores a medida que entran los aportes.

**Por qué suma:** el pozo ya tiene una barra; esto es el mismo dato con más gracia. Y refuerza que PayPal está dentro de la app.

**Cómo hacerlo bien:**
- El cofre se llena **solo cuando PayPal confirma el cobro**, no cuando se toca el botón. Así la animación demuestra el evento real.
- Dibujado en SVG, animado con Reanimated.
- Vibración suave al llenarse un tramo y confeti de rombos al completarse.
- Respetar "movimiento reducido": sin animación, solo aparece lleno.
- No bloquear la pantalla: el usuario sigue usando la app mientras ocurre.

**Dónde tocar:**
- `app/src/app/groups/[id]/index.tsx` (bloque del pozo y barra de aportes, componente `SegmentFill`).
- `app/src/components/celebrations.tsx` (confeti y vibración ya existen).

---

## 2. Buscar pasanakus por país, con mapa (prioridad alta) — HECHO

> `Group.country` y `User.country` en Prisma, país al crear grupo, filtro y mapa de mosaicos en Explorar (`app/src/components/country-map.tsx`), lista de países como texto, y tres grupos abiertos de la diáspora en el seed (MADRID, BAIRES, VIRGIN).

**Qué es:** en Explorar, un mapa dibujado en SVG de Latinoamérica y de los países de la diáspora, con pines en los grupos abiertos y filtro por país.

**Por qué suma:** es la idea más fuerte. Un pasanaku entre bolivianos que viven afuera y su familia en Bolivia es justo donde PayPal gana a un banco: **pagos entre países**. Hoy no está en el proyecto y cuenta una historia de impacto para los jueces.

**Qué cuesta:**
- Un campo nuevo `country` en el grupo (esquema de Prisma + backend + formulario de crear grupo).
- Filtro por país en la pantalla Explorar (`app/src/app/explore.tsx`).
- Mapa SVG simple con pines. Estilizado con el lenguaje del tejido (celdas/puntos), no un mapa realista.
- Textos nuevos en `app/src/lib/i18n.tsx`, en español e inglés.

**Cuidado:** el mapa debe ser accesible. La lista de grupos por país tiene que existir también como texto, no solo como pines.

---

## 3. Caso entre países en el escenario de demo (opcional) — HECHO

> En el paso 5 de `/demo`, Tomás paga desde España y PayPal convierte EUR a USD.

**Qué es:** agregar al escenario `/demo` un aporte desde otro país (por ejemplo, un miembro en España aportando a un pasanaku en Bolivia).

**Dónde tocar:** `app/src/app/demo.tsx` (pasos, eventos de PayPal y textos `demoS0` a `demoS8`).

**Depende de:** haber hecho la idea 2, para que el caso tenga sentido en el producto real.

---

## Lo que NO haría

- **Personaje que camina buscando en Explorar:** se ve infantil para una app de dinero, los jueces ven un demo corto y no exploran, y es la animación más cara y con más riesgo de tirones en un Android de gama media.
- **Más animaciones en todas partes:** con 2 o 3 momentos de celebración (pagar, recibir el pozo, subir de nivel) la app se siente viva. Con diez parece un juego y pierde confianza.

---

## Orden sugerido

1. Cofre que se llena al confirmarse el pago de PayPal.
2. Campo de país + filtro + mapa SVG en Explorar.
3. Caso entre países en `/demo`.

## Reglas para todo lo que se agregue

- Todo se dibuja con código (SVG). Nada de imágenes de internet.
- Funciona en Android y en web.
- Respeta movimiento reducido y tiene etiquetas de accesibilidad.
- Lo simulado dice claramente "Simulado".
- Textos nuevos en `app/src/lib/i18n.tsx`, en los dos idiomas.
