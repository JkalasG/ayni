# Ayni: documento del proyecto

> *Ayni* es el principio andino de reciprocidad: **hoy por ti, mañana por mí.**

| | |
|---|---|
| **Hackathon** | Build What's Next with PayPal and AI (Devpost) |
| **Cierre de envíos** | 12 de noviembre de 2026, 3:00 PM (hora del Este) |
| **Anuncio de ganadores** | 21 de diciembre de 2026 |
| **Equipo** | 1 persona |
| **Categorías objetivo** | Most Impactful, Most Creative, Best Use of PayPal + AI, Best Demo Delivery, Top 3 general |

---

## 1. Resumen

Ayni es una aplicación (Android y web) para organizar **pasanakus**, el ahorro rotativo tradicional de Bolivia, sobre **PayPal**, con **Claude** como asistente, mediador y evaluador de confianza.

Cada miembro aporta la misma cantidad por ronda y, en cada ronda, uno recibe el pozo completo. Ayni resuelve el problema que más rompe estos grupos, **el que cobra primero y deja de pagar**, con una **garantía escalonada** que protege al grupo, y además permite formar **pasanakus abiertos entre desconocidos** gracias a una **reputación verificada** construida con el historial de pagos.

---

## 2. La idea

### 2.1 El problema

El ahorro rotativo existe en todo el mundo con distintos nombres: pasanaku (Bolivia), tanda (México), junta (Perú), san (Venezuela), susu (África Occidental y el Caribe), tontina, chama, arisan. Lo usan cientos de millones de personas, muchas sin acceso a crédito bancario.

Funciona con confianza, y falla siempre de las mismas formas:

1. **El que cobra en los primeros turnos deja de pagar.** Quienes cobran al final son los que más arriesgan y los que suelen perder.
2. **Atrasos y olvidos.** Nadie quiere ser "el que cobra" a los demás.
3. **Peleas por el orden de los turnos.**
4. **Cuentas en un cuaderno** que solo entiende el organizador.
5. **Solo funciona entre conocidos.** Quien no tiene un grupo de confianza queda fuera.

### 2.2 La solución

| Problema | Solución en Ayni |
|---|---|
| El que cobra y desaparece | **Garantía escalonada:** quien cobra temprano recibe el pozo menos un porcentaje retenido, que se le devuelve al terminar sus aportes. Si se atrasa, su propia garantía cubre el aporte. El grupo no pierde dinero |
| Atrasos | **Recordatorios escritos por la IA** que escalan de amables a firmes, **multa configurable** que va al pozo y cobertura automática con la garantía |
| Orden de turnos | El grupo elige: **sorteo**, **organizador** o **IA**, que propone un orden justo explicando sus razones según el historial |
| Cuentas poco claras | Todo pago queda registrado y visible para el grupo; el **asistente** responde "¿cuánto debo?", "¿cuándo me toca?" |
| Solo entre conocidos | **Pasanakus abiertos** con **perfil de confianza** verificado por PayPal y **reglas de admisión** que define el organizador |
| Conflictos | **Mediador de IA**: cambios de turno, "no puedo pagar esta semana", disputas |

### 2.3 Principio de seguridad

**La IA lee, explica y propone; nunca mueve dinero.** Toda acción que mueva dinero o cambie turnos se convierte en una *decisión pendiente* que el organizador aprueba. Si no responde dentro del plazo configurado, se ejecuta automáticamente para no bloquear al grupo.

### 2.4 Diferenciación

Frente a otras propuestas de ahorro rotativo con PayPal, que se enfocan en proteger al grupo de un organizador deshonesto, Ayni ataca el riesgo más común (el miembro que cobra y deja de pagar), forma grupos confiables entre desconocidos y ofrece app nativa para Android.

---

## 3. Usuarios y roles

| Rol | Puede |
|---|---|
| **Miembro** | Unirse o solicitar unirse, pagar aportes, ver el estado del grupo, conversar con el asistente, pedir cambios de turno |
| **Organizador** | Todo lo anterior, más crear el grupo, configurar reglas, definir el orden, iniciar el pasanaku, aprobar o rechazar decisiones pendientes y solicitudes de admisión |
| **Asistente de IA** | Consultar datos del grupo, escribir recordatorios, proponer orden y garantías, recomendar admisiones, mediar y escalar al organizador |
| **Motor** (proceso automático) | Avanzar rondas, enviar recordatorios, aplicar multas, cubrir con garantía, ejecutar decisiones vencidas |

---

## 4. Funcionamiento

### 4.1 Ciclo de un pasanaku

```
Crear grupo → Invitar / publicar → Miembros se unen → Definir orden de turnos
→ Iniciar → [Ronda N: todos aportan → pozo listo → organizador aprueba → Payout al ganador]
→ ... → Última ronda → Devolución de garantías → Fin
```

### 4.2 Garantía escalonada

- **Porcentaje base por turno:** decrece linealmente desde el máximo configurado (por defecto 25%) en el turno 1 hasta 0% en el último turno.
- **Ajuste por riesgo:** la IA ajusta el porcentaje hasta ±10 puntos según el puntaje de riesgo del miembro. El último turno siempre es 0%.
- **Tope:** nunca se retiene más de lo que la persona aún debe al grupo (sus aportes restantes).
- **Devolución:** automática por Payouts cuando el miembro ya no tiene aportes pendientes.

Ejemplo con 5 miembros, aporte de $100 y pozo de $500: el turno 1 recibe $375 y quedan $125 retenidos; el turno 5 recibe $500.

### 4.3 Atrasos

| Etapa | Momento | Qué pasa |
|---|---|---|
| Amable | Antes del vencimiento | Recordatorio cálido |
| Vencido | Pasó la fecha | Recordatorio claro y se aplica la multa |
| Firme | A mitad del período de gracia | Recordatorio firme |
| Final | Terminó el período de gracia | Se cubre con su garantía; si no alcanza, se avisa al organizador y se abre mediación |

### 4.4 Pasanakus abiertos y admisión

- **Perfil de confianza:** pasanakus completados y abandonados, porcentaje de pagos a tiempo, atrasos, veces que se usó su garantía, antigüedad y cuenta verificada con PayPal. Solo se usa el comportamiento de pago dentro de Ayni; nunca datos personales como edad, origen o género.
- **Requisitos del organizador:** mínimo de pasanakus completados, mínimo de pagos a tiempo, máximo de atrasos y si acepta miembros nuevos.
- **Miembros nuevos:** si se aceptan, entran en turnos de la segunda mitad y con garantía adicional, para construir su reputación sin poner en riesgo al grupo.
- **Modos de admisión:** manual, automático por reglas, o con ayuda de IA (automático si cumple; en casos límite, la IA explica y recomienda al organizador, que decide).
- **Depósito de admisión:** la solicitud deja un monto autorizado en PayPal, no cobrado. Si se rechaza, se anula; si se acepta, se cobra como primer aporte.

---

## 5. Requerimientos funcionales

Estado: ✅ implementado en el esqueleto · 🔜 planeado · ⭐ opcional si sobra tiempo.

### Cuentas e identidad
| ID | Requerimiento | Estado |
|---|---|---|
| RF-01 | Iniciar sesión con Log in with PayPal y obtener nombre y correo verificados | ✅ |
| RF-02 | Inicio de sesión como miembro de prueba para los jueces (activable por configuración) | ✅ |
| RF-03 | Elegir idioma (español o inglés); el asistente responde en el idioma del usuario | ✅ |
| RF-04 | Ver el propio perfil de confianza | 🔜 |

### Grupos
| ID | Requerimiento | Estado |
|---|---|---|
| RF-05 | Crear un pasanaku con nombre, aporte, frecuencia (semanal, quincenal, mensual), máximo de miembros, multa, garantía máxima y método de orden | ✅ |
| RF-06 | Unirse con código de invitación o enlace | ✅ |
| RF-07 | Definir el orden de turnos por sorteo, por el organizador o por propuesta de la IA | ✅ |
| RF-08 | Iniciar el pasanaku: crear todas las rondas y aportes | ✅ |
| RF-09 | Modo demo con rondas de minutos | ✅ |
| RF-10 | Publicar un pasanaku como abierto, con requisitos de admisión | 🔜 |
| RF-11 | Explorar pasanakus abiertos y solicitar unirse, viendo si se cumplen los requisitos | 🔜 |
| RF-12 | Admitir solicitudes en modo manual, automático o con recomendación de IA | 🔜 |

### Pagos
| ID | Requerimiento | Estado |
|---|---|---|
| RF-13 | Pagar el aporte de la ronda con PayPal, con la multa incluida si hay atraso | ✅ |
| RF-14 | Confirmar pagos por regreso del checkout y por webhook (sin duplicados) | ✅ |
| RF-15 | Enviar el pozo al ganador con Payouts, descontando su garantía | ✅ |
| RF-16 | Devolver la garantía al terminar los aportes | ✅ |
| RF-17 | Cubrir un aporte vencido con la garantía del miembro | ✅ |
| RF-18 | Enviar factura de PayPal en atrasos firmes | 🔜 |
| RF-19 | Depósito de admisión con autorización (anular o cobrar) | 🔜 |
| RF-20 | Resumen de disputas de PayPal para el organizador | 🔜 |
| RF-21 | Aporte automático con suscripción de PayPal | ⭐ |

### Decisiones del organizador
| ID | Requerimiento | Estado |
|---|---|---|
| RF-22 | Aprobar o rechazar: envío del pozo, orden propuesto por la IA, cambios de turno | ✅ |
| RF-23 | Ejecución automática de decisiones no respondidas dentro del plazo | ✅ |

### Inteligencia artificial
| ID | Requerimiento | Estado |
|---|---|---|
| RF-24 | Asistente de chat con herramientas sobre datos reales del grupo | ✅ |
| RF-25 | Botón de pago desde el chat | ✅ |
| RF-26 | Recordatorios personalizados y escalonados | ✅ |
| RF-27 | Propuesta de orden de turnos con razones | ✅ |
| RF-28 | Mediación: solicitud de cambio de turno y escalamiento al organizador | ✅ |
| RF-29 | Recomendación de admisión con explicación | 🔜 |
| RF-30 | Registro visible de qué consultó la IA y por qué decidió | 🔜 |

### Notificaciones
| ID | Requerimiento | Estado |
|---|---|---|
| RF-31 | Avisos dentro de la app (recordatorios, pozos, decisiones, mediaciones) | ✅ |
| RF-32 | Notificaciones push en Android | ⭐ |

---

## 6. Requerimientos no funcionales

| ID | Categoría | Requerimiento |
|---|---|---|
| RNF-01 | **Seguridad del dinero** | La IA nunca ejecuta movimientos de dinero; solo el miembro (al pagar) o una decisión aprobada o vencida |
| RNF-02 | **Idempotencia** | Ningún pago, envío ni decisión se ejecuta dos veces, aunque se repita una solicitud o lleguen webhooks duplicados |
| RNF-03 | **Integridad** | Montos en centavos enteros; reglas de dinero en funciones puras con pruebas automáticas |
| RNF-04 | **Autenticación** | Tokens firmados (JWT); el estado de los redireccionamientos va firmado y solo se permite volver a la propia app |
| RNF-05 | **Verificación** | Webhooks de PayPal validados con la API de verificación de firma |
| RNF-06 | **Privacidad y equidad** | La admisión y el riesgo usan solo el historial de pagos en Ayni; nunca datos personales sensibles |
| RNF-07 | **Transparencia** | Cada decisión de la IA viene con una explicación en lenguaje simple |
| RNF-08 | **Disponibilidad para jueces** | Demo web hospedada, cuentas de prueba listas y base de datos que no expire antes del 21 de diciembre |
| RNF-09 | **Multiplataforma** | Un solo código para Android (.apk) y web |
| RNF-10 | **Usabilidad** | Diseño pensado para celular, cálido y comunitario, textos simples, bilingüe |
| RNF-11 | **Resiliencia** | Si la IA falla o no está configurada, se usan textos y reglas de respaldo y la app sigue funcionando |
| RNF-12 | **Configuración** | Toda clave y URL en variables de entorno; nada sensible en el código |
| RNF-13 | **Licencia** | Código abierto con licencia MIT, visible en el repositorio |

---

## 7. Tecnologías y por qué

| Capa | Tecnología | Por qué |
|---|---|---|
| App móvil y web | **React Native + Expo (SDK 58) + Expo Router** | Un solo código para Android y web; ya conoces TypeScript y Expo; el APK se genera en la nube sin Android Studio |
| Lenguaje | **TypeScript** (en todo el proyecto) | Menos errores con dinero gracias a los tipos; mismo lenguaje en app y backend |
| Backend | **Node.js + Express** | Simple, rápido de construir y fácil de desplegar |
| Base de datos | **PostgreSQL en Neon** | Datos relacionales (grupos, rondas, aportes) y transacciones seguras; Neon es gratuito y no expira, a diferencia de la base gratuita de Render |
| Acceso a datos | **Prisma** | Esquema claro, tipos automáticos y transacciones para operaciones de dinero |
| Validación | **Zod** | Rechaza datos inválidos antes de que lleguen a la lógica |
| IA | **Claude (Anthropic API) con tool use** | Muy bueno en agentes con herramientas, español natural y explicaciones claras; permite que la IA consulte datos reales en vez de inventar |
| Pagos | **PayPal REST API (sandbox)** | Requisito del hackathon y base de la confianza: identidad, cobros, envíos y verificación |
| Hospedaje | **Render** | Despliegue desde GitHub con un archivo `render.yaml`; aloja la API y la web |
| Builds Android | **EAS Build (Expo)** | Genera el `.apk` en la nube |
| Token en el celular | **expo-secure-store** | Guarda la sesión cifrada en el dispositivo |
| Pruebas | **node:test** | Pruebas de las reglas de dinero sin dependencias adicionales |

### 7.1 APIs de PayPal

| API | Uso en Ayni | Estado |
|---|---|---|
| Identity (Log in with PayPal) | Login, correo verificado para los envíos y reputación anclada a una cuenta real | ✅ |
| Orders v2 | Cobro de cada aporte, con multa incluida | ✅ |
| Payouts | Envío del pozo menos la garantía; devolución de la garantía | ✅ |
| Webhooks | Confirmación de pagos y estado de los envíos | ✅ |
| Invoicing | Factura para atrasos | 🔜 |
| Payments (autorización y anulación) | Depósito de admisión en pasanakus abiertos; reembolsos | 🔜 |
| Disputes | Resumen de disputas para el mediador | 🔜 |
| Agent Toolkit / MCP | Herramientas oficiales de PayPal para la IA (solo funciones seguras) | ⭐ |
| Subscriptions + Catalog Products | Aporte automático | ⭐ |
| Transaction Search | Conciliación del libro de cuentas | ⭐ |

### 7.2 Uso de la IA

| Función | Qué hace Claude |
|---|---|
| Asistente | Responde con datos reales usando herramientas (estado del grupo, mi situación, botón de pago) |
| Recordatorios | Escribe mensajes cortos que escalan de amables a firmes, en el idioma del miembro |
| Orden de turnos | Propone un orden justo con una razón por miembro |
| Garantía | Su evaluación del riesgo ajusta el porcentaje retenido dentro de límites fijos |
| Mediador | Escucha a ambas partes, propone una solución y crea solicitudes para el organizador |
| Admisión | Recomienda en casos límite y explica por qué |

Modelo por defecto: `claude-sonnet-5-5`, configurable por variable de entorno.

---

## 8. Estructura del proyecto

### 8.1 Arquitectura

```
┌──────────────────────────┐        ┌───────────────────────────────┐
│ App Expo (Android + web) │ ─────► │ API Node/Express (Render)     │
└──────────────────────────┘        │  ├─ Reglas (garantía, multas, │
                                    │  │  riesgo)                    │
                                    │  ├─ Servicios (grupos, pagos, │
                                    │  │  decisiones)                │
                                    │  ├─ Motor (cada 20 s)          │
                                    │  └─ Agente de IA               │
                                    └──────┬─────────┬──────────┬───┘
                                           │         │          │
                                    PostgreSQL   PayPal REST   Claude
                                     (Neon)      (sandbox)   (Anthropic)
```

### 8.2 Carpetas

```
ayni/
├── README.md               Documentación para los jueces (inglés)
├── GUIA_ES.md              Guía de arranque (español)
├── PROYECTO_AYNI.md        Este documento
├── LICENSE                 MIT
├── render.yaml             Despliegue en Render
├── backend/
│   ├── prisma/schema.prisma    Modelo de datos
│   └── src/
│       ├── domain/rules.ts     Reglas puras + pruebas
│       ├── services/           groups, payments, actions, engine, notify
│       ├── ai/agent.ts         Asistente, recordatorios, orden de turnos
│       ├── paypal.ts           Cliente de PayPal
│       ├── auth.ts             Sesiones y redireccionamientos seguros
│       ├── routes.ts           Endpoints de la API
│       └── seed.ts             Datos de demo
└── app/
    └── src/
        ├── app/                Pantallas (Expo Router)
        ├── components/ui.tsx   Componentes visuales
        └── lib/                API, sesión, pagos, idiomas, tema
```

### 8.3 Modelo de datos

| Entidad | Contenido principal |
|---|---|
| **User** | Identificador de PayPal, correo, nombre, idioma |
| **Group** | Nombre, código, organizador, aporte, frecuencia, método de orden, multa, garantía máxima, plazos, estado, modo demo |
| **Membership** | Usuario en un grupo: turno, porcentaje de garantía, garantía retenida, puntaje de riesgo |
| **Round** | Número, ganador, fecha de vencimiento, estado |
| **Contribution** | Aporte de un miembro en una ronda: monto, multa, estado, orden de PayPal, recordatorios enviados |
| **Payout** | Envío del pozo o devolución de garantía, con el lote de PayPal |
| **PendingAction** | Decisión que espera al organizador, con plazo de ejecución automática |
| **ChatMessage** | Mensajes del grupo, del asistente y del sistema |
| **Notification** | Avisos para cada usuario |
| *JoinRequest* (🔜) | Solicitud de admisión: perfil evaluado, recomendación de IA, depósito autorizado, estado |

### 8.4 API principal

| Método y ruta | Función |
|---|---|
| `GET /auth/paypal/start`, `GET /auth/paypal/callback` | Login con PayPal |
| `GET /me`, `PATCH /me` | Usuario actual e idioma |
| `GET/POST /groups`, `POST /groups/join` | Listar, crear y unirse |
| `GET /groups/:id` | Detalle del grupo |
| `POST /groups/:id/order`, `POST /groups/:id/start` | Orden de turnos e inicio |
| `POST /contributions/:id/checkout`, `GET /paypal/return` | Pagar un aporte |
| `POST /paypal/webhook` | Eventos de PayPal |
| `POST /actions/:id/approve` y `/reject` | Decisiones del organizador |
| `GET/POST /groups/:id/chat` | Chat con el asistente |
| `GET /notifications` | Avisos |

---

## 9. Plan de trabajo

| Día | Fecha | Objetivo |
|---|---|---|
| 1 | 5 nov | Credenciales, despliegue y **flujo de pago real en sandbox** (login, aporte, pozo) |
| 2 | 6 nov | Garantía, atrasos y motor probados de punta a punta; corrección de errores |
| 3 | 7 nov | IA probada: asistente, recordatorios, orden de turnos, mediación |
| 4 | 8 nov | Pasanakus abiertos: perfil de confianza, exploración y admisión |
| 5 | 9 nov | Depósito de admisión, factura para atrasos, disputas y registro de la IA |
| 6 | 10 nov | Pulido visual, APK con EAS y datos de demo |
| 7 | 11 nov | Video, README final y cuentas para los jueces |
| 8 | 12 nov | Margen y envío antes de las 3:00 PM (hora del Este) |

**Regla de prioridad:** nada de lo planeado se construye si el flujo principal no funciona con PayPal real.

---

## 10. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Algo falla en la demo | Priorizar el flujo principal, modo demo y datos precargados |
| Poco tiempo (8 días, 1 persona) | Prioridades estrictas; lo opcional queda como hoja de ruta |
| La base de datos expira antes del juicio | Usar Neon en lugar de la base gratuita de Render |
| El servidor gratuito "duerme" | Avisar en el README que la primera carga tarda unos segundos |
| Los jueces no conocen el pasanaku | Explicarlo en los primeros 20 segundos del video |
| Competencia con otro proyecto de ahorro rotativo | Mostrar desde el inicio la garantía y los pasanakus abiertos |
| Custodia de fondos en la vida real | Declararlo como limitación; el camino en producción son las soluciones de PayPal para plataformas y un socio regulado |

---

## 11. Entregables del hackathon

- [ ] Repositorio público en GitHub con licencia MIT visible
- [ ] Demo web hospedada en Render
- [ ] APK publicado como *Release* en GitHub
- [ ] Video de menos de 3 minutos en YouTube, grabado en Android, sin música con derechos
- [ ] Descripción del proyecto y herramientas usadas en Devpost
- [ ] Cuentas sandbox de prueba listadas para los jueces
