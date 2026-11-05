# Guía de configuración de las APIs que faltan

Hoy Ayni corre completo en **modo simulado** (`APP_MODE=mock`): PayPal falso, IA con reglas de respaldo y base de datos local. Para pasar a **modo real** (`APP_MODE=live`) necesitas 4 cosas externas. Esta guía las explica en orden.

| # | Qué | Para qué | Obligatoria en live | Costo |
|---|---|---|---|---|
| 1 | Base de datos Postgres (Neon) | Guardar todo | Sí | Gratis |
| 2 | PayPal Developer (Sandbox) | Login, cobros, pozos, depósitos, garantía, disputas | Sí | Gratis |
| 3 | Anthropic (Claude) | Asistente, orden de turnos, recomendación de admisión | No (hay respaldo) | De pago, poco uso |
| 4 | Hosting (Render) + Expo/EAS | Backend público, web para jueces, APK | Sí para el envío | Gratis |

> Nunca subas claves a git. El archivo `.env` ya está en `.gitignore`.

---

## Estado de las pruebas (hecho)

Probé el backend en modo simulado:

- `npm test`: **15 de 15** pruebas unitarias de las reglas de negocio pasan.
- `npm run test:smoke` (nuevo, `backend/test/smoke.mjs`): **62 de 62** comprobaciones sobre todos los endpoints: login, perfil, grupos, admisión, explorar, solicitudes, chat, registro de IA, disputas, avisos, decisiones del organizador, cobro completo por PayPal simulado, doble pago bloqueado, redirecciones peligrosas rechazadas y webhook sin firma rechazado.
- `npm run test:e2e` **no se corrió**: pide una base Postgres vacía (`E2E_DATABASE_URL`). Es la prueba más completa del dinero (idempotencia, garantías, facturas, compensaciones). Córrela cuando tengas la base de Neon (paso 1).

Lo que **no** se puede probar sin credenciales reales: el login real de PayPal, los cobros y pagos reales en Sandbox, los webhooks firmados, las facturas, las disputas reales y las respuestas de Claude.

---

## Paso 1. Base de datos (Neon)

No uses el Postgres gratuito de Render: **expira a los 30 días**, antes del fin del jurado.

1. Entra a <https://neon.tech> y crea un proyecto llamado `ayni`.
2. Copia la **connection string** (termina en `?sslmode=require`).
3. En `backend/.env`:
   ```
   DATABASE_URL=postgresql://usuario:clave@ep-xxxx.neon.tech/ayni?sslmode=require
   ```
4. Crea las tablas:
   ```bash
   cd backend
   npx prisma db push
   ```
5. Para la prueba completa del dinero crea **otra** base vacía (rama de Neon) y úsala solo para esto:
   ```
   E2E_DATABASE_URL=postgresql://.../ayni_e2e?sslmode=require
   npm run test:e2e
   ```
   ⚠ Esa prueba escribe datos: nunca la apuntes a tu base real.

---

## Paso 2. PayPal Developer (Sandbox)

Entra a <https://developer.paypal.com> con tu cuenta de PayPal. Trabaja siempre en **Sandbox**, nunca en Live.

### 2.1 Crear la app
1. *Apps & Credentials* → modo **Sandbox** → **Create App** (tipo *Merchant*).
2. Copia **Client ID** y **Secret**:
   ```
   PAYPAL_CLIENT_ID=...
   PAYPAL_CLIENT_SECRET=...
   PAYPAL_API_BASE=https://api-m.sandbox.paypal.com
   PAYPAL_WEB_BASE=https://www.sandbox.paypal.com
   ```

### 2.2 Activar las funciones que usa Ayni
En la app, sección **Features**, activa:
- **Log in with PayPal** → marca **Email** y **Full name**. Sin *Email*, el login falla con "PayPal did not return an email".
  - **Return URL:** `TU_URL_BACKEND/auth/paypal/callback` (por ejemplo `https://ayni-api.onrender.com/auth/paypal/callback`). Debe coincidir exacto.
- **Payouts** (para enviar el pozo y devolver garantías).
- **Invoicing** (facturas de cobro firme).
- **Disputes** (pantalla de disputas del organizador).

> Payouts suele estar limitado en cuentas nuevas. Si no aparece, pídelo desde *Features* o prueba con otra cuenta de desarrollador.

### 2.3 Webhook
1. En la misma app → **Webhooks** → **Add Webhook**.
2. **URL:** `TU_URL_BACKEND/paypal/webhook` (debe ser pública y HTTPS).
3. Marca estos eventos:
   - `CHECKOUT.ORDER.APPROVED`
   - `PAYMENT.CAPTURE.COMPLETED`
   - `PAYMENT.PAYOUTS-ITEM.SUCCEEDED`
   - `PAYMENT.PAYOUTS-ITEM.FAILED`
   - `PAYMENT.PAYOUTS-ITEM.UNCLAIMED`
   - `INVOICING.INVOICE.PAID`
   - `CUSTOMER.DISPUTE.CREATED`
4. Copia el **Webhook ID** (no es la URL):
   ```
   PAYPAL_WEBHOOK_ID=...
   ```
Sin este ID el backend **rechaza todos los webhooks** (comportamiento seguro a propósito). La app sigue funcionando porque el retorno de PayPal también confirma el pago; el webhook es el respaldo.

### 2.4 Cuentas de prueba
En *Sandbox → Accounts* crea **7 cuentas Personal** con estos nombres, en este orden:

1. Doña Rosa  2. Juan Carlos  3. Marisol  4. Don Efraín  5. Wara  6. Tomás  7. Kusi

Los correos van en el mismo orden, separados por comas:
```
DEMO_MEMBER_EMAILS=rosa@personal.example.com,juan@personal.example.com,marisol@...,efrain@...,wara@...,tomas@...,kusi@...
```
Guarda también las contraseñas para ponerlas en el README para los jueces. Luego carga los datos de ejemplo:
```bash
cd backend
npm run db:seed
```
Si faltan correos, los pagos a esos miembros fallarán (usan correos de relleno).

### 2.5 Comprobar PayPal
1. Arranca el backend en live y abre `TU_URL_BACKEND/health`: debe responder `{"ok":true,"mode":"live"}`.
2. En la app, "Ingresar con PayPal" debe llevarte a PayPal Sandbox y volver con tu sesión.
3. Paga un aporte con una cuenta personal de prueba. El cobro debe aparecer en el panel **Actividad de PayPal** del grupo.
4. En el dashboard → *Webhooks* → *Webhooks Events* debes ver las entregas con estado 200.

---

## Paso 3. Anthropic (Claude), opcional

Sin esta clave todo funciona con textos y reglas de respaldo. Con ella el asistente responde de verdad, la IA propone el orden de turnos y recomienda aceptar o rechazar solicitudes.

1. <https://console.anthropic.com> → **API Keys** → crear clave.
2. Pon saldo (con pocas consultas basta para el hackathon).
3. En `backend/.env`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ANTHROPIC_MODEL=claude-sonnet-5-5
   ```
4. Comprobar: en un grupo, abre el **Chat** y pregunta "¿cuánto debo?". Si responde con detalle y aparece una entrada en **Registro de la IA**, está activa. Si no hay clave, responde con el texto de respaldo.

---

## Paso 4. Publicar (Render + Expo)

### 4.1 Backend y web en Render
El archivo `render.yaml` ya define los dos servicios (`ayni-api` y `ayni-web`).
1. Sube el repo a GitHub.
2. En Render → **New → Blueprint** → elige el repo.
3. Completa las variables del backend (`sync: false` en el yaml):

| Variable | Valor |
|---|---|
| `DATABASE_URL` | URL de Neon |
| `PUBLIC_API_URL` | `https://ayni-api.onrender.com` (la URL real de tu API) |
| `APP_WEB_URL` | `https://ayni-web.onrender.com` (la URL real de la web) |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` / `PAYPAL_WEBHOOK_ID` | del paso 2 |
| `ANTHROPIC_API_KEY` | del paso 3 (opcional) |
| `DEMO_MEMBER_EMAILS` | los 7 correos |
| `ENABLE_DEMO_LOGIN` | `true` (ya viene) |
| `APP_MODE` | no la definas, o `live` |

   `JWT_SECRET` se genera solo.
4. En el servicio web `ayni-web` define `EXPO_PUBLIC_API_URL` con la URL de la API.
5. **Vuelve a PayPal** y pon las URLs reales en el *Return URL* y en el *Webhook* (paso 2.2 y 2.3).
6. El plan gratis de Render se duerme tras 15 minutos sin uso: **abre `/health` un minuto antes de cada demo** para despertarlo.

### 4.2 Probar en tu computadora antes de publicar
PayPal necesita una URL pública para volver y para los webhooks. En local usa un túnel:
```bash
ngrok http 4000
```
Pon la URL del túnel en `PUBLIC_API_URL` y en los ajustes de PayPal. Para el celular físico, en `app/.env`:
```
EXPO_PUBLIC_API_URL=http://TU_IP_LOCAL:4000
```
(No `localhost`: en el celular `localhost` es el propio celular.)

### 4.3 APK de Android (EAS)
```bash
cd app
npm install -g eas-cli
eas login
eas init                       # crea el projectId (también activa las notificaciones push)
# edita eas.json: EXPO_PUBLIC_API_URL = URL real de tu API
eas build -p android --profile preview
```
- Las notificaciones push **no funcionan en Expo Go**; solo en el APK.
- Para push en el APK hacen falta credenciales de Firebase (FCM). Si las omites, la app usa los avisos dentro de la app y no falla.

---

## Tabla de variables (`backend/.env`)

| Variable | Modo | Ejemplo / nota |
|---|---|---|
| `APP_MODE` | ambos | `mock` o `live` |
| `PORT` | ambos | `4000` |
| `JWT_SECRET` | live | cadena larga aleatoria |
| `PUBLIC_API_URL` | live | URL pública del backend |
| `APP_WEB_URL` | live | URL de la web de Expo |
| `APP_SCHEME` | ambos | `ayni` |
| `ENABLE_DEMO_LOGIN` | live | `true` para jueces |
| `ALLOW_EXPO_GO` | live | `true` si pruebas con Expo Go |
| `DATABASE_URL` | live | Neon |
| `ENGINE_INTERVAL_MS` | ambos | `20000` (recordatorios, multas, cobros) |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | live | paso 2.1 |
| `PAYPAL_API_BASE`, `PAYPAL_WEB_BASE` | live | URLs de Sandbox |
| `PAYPAL_WEBHOOK_ID` | live | paso 2.3 |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | live | paso 3 |
| `DEMO_MEMBER_EMAILS` | seed | 7 correos en orden |
| `E2E_DATABASE_URL` | solo pruebas | base vacía |

`app/.env`: solo `EXPO_PUBLIC_API_URL`.

---

## Lista de comprobación final

- [ ] `/health` responde `"mode":"live"`
- [ ] Login con PayPal Sandbox vuelve a la app con sesión
- [ ] Un aporte pagado con cuenta de prueba aparece en **Actividad de PayPal**
- [ ] El pozo se envía (Payout) y el miembro lo ve en su cuenta de Sandbox
- [ ] Los webhooks aparecen con estado 200 en el dashboard de PayPal
- [ ] El chat responde con IA y deja registro
- [ ] `npm run test:e2e` pasa con la base vacía
- [ ] La web de Render abre y "Entrar a la demo" lista a los 7 miembros
- [ ] El APK instala y se conecta a la API pública
- [ ] El README tiene las cuentas de prueba para los jueces

## Problemas frecuentes

| Síntoma | Causa probable |
|---|---|
| "PayPal did not return an email" | Falta marcar **Email** en Log in with PayPal |
| Vuelve de PayPal con `login_cancelled` o error | El *Return URL* no coincide exacto con `PUBLIC_API_URL/auth/paypal/callback` |
| Los webhooks dan 400 | Falta `PAYPAL_WEBHOOK_ID` o es el de otra app |
| El pozo no se envía | Payouts no activado o el correo del miembro no es una cuenta Sandbox real |
| El celular no conecta | `EXPO_PUBLIC_API_URL` apunta a `localhost` en vez de la IP o la URL pública |
| La primera petición tarda 30+ s | Render gratis estaba dormido |
| El chat responde genérico | No hay `ANTHROPIC_API_KEY` o no tiene saldo |
