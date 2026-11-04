# Guía de arranque (para ti)

## 1. Lo que necesitas crear

1. **PayPal Developer** (developer.paypal.com):
   - En *Apps & Credentials* (modo **Sandbox**) crea una app y copia `Client ID` y `Secret`.
   - En la app activa **Log in with PayPal**, marca *Email* y *Full name*, y pon como Return URL: `TU_URL_BACKEND/auth/paypal/callback`.
   - Activa **Payouts**.
   - En *Sandbox → Accounts* crea **5 cuentas Personal** (los miembros del pasanaku de prueba). Anota sus correos y contraseñas.
2. **API key de Anthropic** (console.anthropic.com).
3. **Postgres**: el más fácil es el gratuito de Render (lo crea `render.yaml`) o uno local.

## 2. Correr el backend

```bash
cd backend
cp .env.example .env     # completa los valores
npm install
npx prisma db push       # crea las tablas
npm run db:seed          # crea 5 miembros demo con los correos de DEMO_MEMBER_EMAILS
npm run dev
npm test                 # pruebas de las reglas (retención, multas, riesgo)
```

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
- En tu Android: abre **Expo Go** y escanea el QR.
- Para la versión web: presiona `w`.

## 4. Probar el ciclo completo (modo demo)

1. Entra como "Doña Rosa" (organizadora) con el botón de miembro de prueba.
2. Abre "Pasanaku del barrio" → **Definir orden de turnos** → la IA propone el orden con razones → **Aprobar** → **Iniciar pasanaku**.
3. Entra como cada miembro y **Paga con PayPal** (usa las cuentas sandbox Personal).
4. Cuando todos pagan, la organizadora ve **Enviar el pozo** → Aprobar → el pozo llega por Payouts (revisa la cuenta sandbox del ganador).
5. Deja a alguien sin pagar y usa **Avanzar (demo)**: verás recordatorios escalonados, la multa y la cobertura con su garantía.
6. Prueba el chat: "¿cuánto debo?", "¿cuándo me toca?", "no puedo pagar esta semana", "quiero cambiar turno con Marisol".

## 5. Antes de enviar (12 nov, 3 PM hora del Este)

- Despliega con `render.yaml` y completa las URLs.
- Graba el video (< 3 min) en tu Android.
- Completa en el README: link del video, link de la demo y cuentas sandbox para los jueces.
- Repo público con la licencia MIT visible.
- Cambia "Ayni authors" en `LICENSE` por tu nombre si quieres.
