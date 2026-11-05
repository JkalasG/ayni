# Guía de arranque (para ti)

## 0. Ver la app sin conectarte a nada (modo simulado)

En `backend/.env` pon `APP_MODE=mock` y en `app/.env` pon `EXPO_PUBLIC_API_URL=http://localhost:4000`. Luego:

```bash
cd backend && npm install && npm run dev      # terminal 1
cd app && npm install && npx expo start --web # terminal 2 → http://localhost:8081
```

- **Base de datos local** embebida (en `backend/.mock-db`, no necesitas instalar Postgres).
- **PayPal simulado**: el botón de pagar abre una página "PayPal simulado"; nada sale de tu computadora. Panel con todo lo "cobrado" y "enviado": http://localhost:4000/__paypal/
- **Asistente sin IA**: responde "¿cuánto debo?", "¿cuándo me toca?", "¿quién falta?", "quiero pagar", "no puedo pagar".
- **Datos de muestra** listos: entra con "Entrar como miembro de prueba" como Doña Rosa (grupo activo, cambio de turno pendiente, registro de la IA, disputas), Marisol (solicitud de Tomás con recomendación) o Tomás/Kusi (explorar y perfil).
- En la app aparece una etiqueta **MODO SIMULADO** abajo.
- Empezar de cero: `npm run mock:reset` (con el backend detenido) y otra vez `npm run dev`.

Para volver a PayPal y Claude reales: `APP_MODE=live` y completa el resto del `.env` (ver `.env.example`).

## 1. Lo que necesitas crear

1. **PayPal Developer** (developer.paypal.com):
   - En *Apps & Credentials* (modo **Sandbox**) crea una app y copia `Client ID` y `Secret`.
   - En la app activa **Log in with PayPal**, marca *Email* y *Full name*, y pon como Return URL: `TU_URL_BACKEND/auth/paypal/callback`.
   - En *Features* activa **Payouts**, **Invoicing** y **Disputes**.
   - En *Webhooks* agrega `TU_URL_BACKEND/paypal/webhook` con estos eventos y copia el **Webhook ID**:
     `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.PAYOUTS-ITEM.SUCCEEDED`, `PAYMENT.PAYOUTS-ITEM.FAILED`, `PAYMENT.PAYOUTS-ITEM.UNCLAIMED`, `INVOICING.INVOICE.PAID`, `CUSTOMER.DISPUTE.CREATED`.
   - En *Sandbox → Accounts* crea **7 cuentas Personal** (Doña Rosa, Juan Carlos, Marisol, Don Efraín, Wara, Tomás, Kusi). Anota sus correos y contraseñas: van en `DEMO_MEMBER_EMAILS` en ese orden y en el README para los jueces.
2. **API key de Anthropic** (console.anthropic.com). Sin ella la app funciona igual, con textos y reglas de respaldo.
3. **Postgres en Neon** (neon.tech, gratis y no expira). **No uses el Postgres gratuito de Render: expira a los 30 días, antes del 21 de diciembre.** Copia la URL de conexión (con `?sslmode=require`) en `DATABASE_URL`.

## 2. Correr el backend

```bash
cd backend
cp .env.example .env     # completa los valores
npm install
npx prisma db push       # crea las tablas
npm run db:seed          # miembros demo, historial, el grupo demo y un grupo abierto
npm run dev
npm test                 # pruebas de las reglas (garantía, multas, riesgo, admisión)
```

Prueba de punta a punta (opcional, necesita una base **vacía** aparte, por ejemplo otra rama de Neon):

```bash
E2E_DATABASE_URL="postgresql://...ayni_e2e" npm run test:e2e
```

Simula un pasanaku completo con un PayPal falso: atrasos, cobertura con garantía, impago, factura, compensación, admisión con depósito, y verifica que **todo el dinero que entra es igual al que sale**.

**Importante:** PayPal necesita poder llegar a tu backend (para el login y el regreso del pago). `localhost` no sirve para eso. Dos opciones:
- Desplegar en Render desde el principio (recomendado), o
- Usar un túnel como `cloudflared tunnel --url http://localhost:4000` y poner esa URL en `PUBLIC_API_URL` y en el Return URL de PayPal.

## 3. Correr la app

```bash
cd app
cp .env.example .env     # EXPO_PUBLIC_API_URL = URL de tu backend
npm install
npx expo start
```
- En tu Android: abre **Expo Go** y escanea el QR (las notificaciones push no funcionan en Expo Go; sí en el APK).
- Para la versión web: presiona `w`.

## 4. Probar todo (modo demo)

**Flujo principal (Pasanaku del barrio, código `BARRIO`):**
1. Entra como "Doña Rosa" (organizadora) con el botón de miembro de prueba.
2. Abre "Pasanaku del barrio" → **Definir orden de turnos** → la IA propone el orden con razones → **Aprobar** → **Iniciar pasanaku**.
3. Entra como cada miembro y **Paga con PayPal** (usa las cuentas sandbox Personal).
4. Cuando todos pagan, la organizadora ve **Enviar el pozo** → Aprobar → el pozo llega por Payouts (revisa la cuenta sandbox del ganador).
5. Deja a alguien sin pagar y usa **Avanzar (demo)**: verás recordatorios escalonados, la multa, la **factura de PayPal** (etapa firme) y la cobertura con su garantía. Si no tiene garantía, aparece la decisión **Cerrar la ronda sin su aporte**.
6. Prueba el chat: "¿cuánto debo?", "¿cuándo me toca?", "no puedo pagar esta semana", "quiero cambiar turno con Marisol".
7. Abre **Registro de la IA** para ver qué consultó y por qué decidió.

**Pasanaku abierto (código `ABIERT`, organiza Marisol):**
1. Entra como **Tomás** → **Explorar pasanakus abiertos**: casi cumple (75% a tiempo, piden 80%). **Solicitar unirme** → autoriza el depósito en PayPal.
2. Entra como **Marisol**: en *Decisiones pendientes* ves su perfil de confianza, qué reglas cumple y la **recomendación de la IA** → Aprobar (se cobra el depósito como su primer aporte) o Rechazar (se anula, no se cobra nada).
3. Entra como **Kusi** (nuevo): se acepta automáticamente; al definir el orden queda en la segunda mitad y con garantía adicional.
4. **Mi perfil de confianza** muestra el historial de cada uno.

## 5. APK para Android

```bash
cd app
npm install -g eas-cli
eas login
eas init                              # crea el proyecto y guarda el projectId en app.json
# edita eas.json: EXPO_PUBLIC_API_URL = URL de tu backend en Render
eas credentials                       # (opcional) sube credenciales FCM para las notificaciones push
eas build -p android --profile preview
```
Descarga el `.apk` y súbelo como *Release* en GitHub.

## 6. Antes de enviar (12 nov, 3 PM hora del Este)

- Despliega con `render.yaml` (API + web) y pon la URL de Neon en `DATABASE_URL`. Completa `PUBLIC_API_URL` y `APP_WEB_URL`.
- Corre `npm run db:seed` una vez contra la base de producción (desde tu PC con la `DATABASE_URL` de Neon).
- Graba el video (< 3 min) en tu Android.
- Completa en el README: link del video, de la demo, del APK y las cuentas sandbox para los jueces.
- Repo público con la licencia MIT visible.
- Cambia "Ayni authors" en `LICENSE` por tu nombre si quieres.
