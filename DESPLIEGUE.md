# Desplegar Ayni en tu VPS con Docker

Tres contenedores en un solo servidor:

| Contenedor | Qué hace |
|---|---|
| `db` | Postgres 16. Los datos viven en el volumen `pgdata`. |
| `api` | La API (Node). Al arrancar crea o actualiza las tablas (`prisma db push`). |
| `web` | Caddy: sirve la app web, reenvía `/api/*` a la API y **consigue solo el certificado HTTPS**. |

Todo se sirve desde un único dominio: la app en `https://TU_DOMINIO` y la API en `https://TU_DOMINIO/api`. Solo se abren los puertos 80 y 443.

Esto se probó construyendo las tres imágenes y levantándolas juntas: la API arranca, crea las tablas, el seed carga los 7 miembros, `/api/health` responde por Caddy y las rutas de la app (`/groups`) cargan.

---

## 1. Qué necesitas

- Un VPS con **Docker y Docker Compose v2** (`docker compose version`). En Ubuntu: `curl -fsSL https://get.docker.com | sh`.
- **2 GB de RAM** como mínimo. La compilación de la app web es lo que más memoria usa; con 1 GB agrega swap (`fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`).
- Un **nombre de dominio** apuntando al servidor. Si no tienes uno, usa tu IP con sslip.io: la IP `203.0.113.10` se convierte en `203-0-113-10.sslip.io` y funciona con HTTPS.
- Puertos **80 y 443** abiertos en el firewall del VPS (y en el del proveedor, si tiene uno): `ufw allow 80,443/tcp && ufw allow 443/udp`.
- Tu app de PayPal sandbox con las credenciales (ver sección 4).

## 2. Subir el código y configurar

```bash
git clone https://github.com/JkalasG/ayni.git && cd ayni     # o copia la carpeta con scp / rsync
cp .env.docker.example .env
nano .env
```

Lo mínimo que debes completar en `.env`:

| Variable | Qué poner |
|---|---|
| `DOMAIN` | `ayni.tudominio.com`, sin `https://` ni `/` |
| `POSTGRES_PASSWORD` | `openssl rand -hex 24` (solo letras y números) |
| `JWT_SECRET` | `openssl rand -hex 48` |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | De developer.paypal.com → Apps & Credentials (Sandbox) |
| `PAYPAL_WEBHOOK_ID` | Se obtiene en el paso 4; puede quedar vacío en el primer arranque |
| `DEMO_MEMBER_EMAILS`, `DEMO_MEMBER_PASSWORD` | Las 7 cuentas sandbox, en orden: Doña Rosa, Juan Carlos, Marisol, Don Efraín, Wara, Tomás, Kusi |
| `ANTHROPIC_API_KEY` **o** `AI_BASE_URL` + `AI_API_KEY` + `AI_MODEL` | El modelo del asistente. Sin ninguno la app usa reglas fijas. |
| `EXPO_PUBLIC_BRYNTUM_LICENSE` | Tu clave de Bryntum (opcional; sin ella sale la insignia de prueba) |

`.env` no se sube a git. Protégelo: `chmod 600 .env`.

## 3. Levantar

```bash
docker compose up -d --build        # la primera vez tarda varios minutos (compila la app web)
docker compose ps                   # los tres deben estar "running" y la api "healthy"
docker compose exec api npm run db:seed    # UNA vez: miembros demo, historial y pasanakus de ejemplo
```

Comprueba: `https://TU_DOMINIO/api/health` debe responder `{"ok":true,"mode":"live"}` y `https://TU_DOMINIO` debe mostrar la pantalla de bienvenida. El certificado HTTPS tarda unos segundos en emitirse la primera vez; si falla, casi siempre es el DNS o el puerto 80 cerrado (`docker compose logs web`).

**No ejecutes `db:seed` dos veces** sobre la misma base si no quieres duplicar los datos demo.

## 3b. Si el servidor ya tiene nginx o Apache en los puertos 80/443

Comprueba con `ss -tlnp | grep -E ':80 |:443 '`. Si algo los usa, Caddy no puede tomarlos: levanta con el archivo adicional y deja que tu nginx haga de entrada.

```bash
docker compose -f docker-compose.yml -f docker-compose.nginx.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.nginx.yml exec api npm run db:seed    # una vez
```

El contenedor `web` queda escuchando solo en `127.0.0.1:8081` (HTTP, inaccesible desde fuera). Después:

```bash
sudo cp deploy/nginx-ayni.conf /etc/nginx/sites-available/ayni      # revisa que server_name sea tu subdominio
sudo ln -s /etc/nginx/sites-available/ayni /etc/nginx/sites-enabled/ayni
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d ayni.devsjec.com                            # emite el HTTPS y agrega la redireccion
```

Todo lo demás (PayPal, `.env`, copias) es igual. Con esta variante usa siempre los dos `-f` en cada comando de `docker compose` (`logs`, `restart`, `up --build`…), o expórtalo una vez: `export COMPOSE_FILE=docker-compose.yml:docker-compose.nginx.yml`.

## 4. Configurar PayPal (sandbox)

En developer.paypal.com → tu app (reemplaza `TU_DOMINIO`):

1. **Log in with PayPal**: activa el alcance *Email* y pon como *Return URL*: `https://TU_DOMINIO/api/auth/paypal/callback`
2. **Features**: activa **Payouts**, **Invoicing** y **Disputes**. Opcionales: **Vault**, **Transaction Search** y **Balances**.
3. **Webhooks** → *Add webhook*: URL `https://TU_DOMINIO/api/paypal/webhook`, con los eventos que lista el README (sección "With PayPal sandbox and an AI model"). Copia el **Webhook ID** a `PAYPAL_WEBHOOK_ID` en `.env` y recarga: `docker compose up -d api`.
4. Crea las **7 cuentas sandbox *Personal*** (Sandbox → Accounts) y pon sus correos en `DEMO_MEMBER_EMAILS`. Si ya las tienes, no hace falta crearlas otra vez.

> Las URLs llevan **`/api`** porque la API cuelga de ese prefijo. Si PayPal rechaza la Return URL, revisa que coincida letra por letra con `https://TU_DOMINIO/api/auth/paypal/callback`.

## 5. APK de Android

En `app/eas.json`, perfil `preview`, pon `EXPO_PUBLIC_API_URL` = `https://TU_DOMINIO/api` y construye con `npx eas build -p android --profile preview` (ver README).

## 5b. Llenar PayPal con actividad real (opcional)

El seed deja datos de muestra en Ayni, pero PayPal sandbox queda vacío. El script de `tools/real-data` lo llena de verdad: cada miembro paga con su cuenta sandbox en PayPal Checkout (Chrome lo maneja solo) y la organizadora envía los pozos con Payouts. Se ejecuta **desde tu PC**, contra tu servidor:

```bash
cd tools/real-data
npm install
node run.mjs --check                        # solo lee: comprueba servidor, cuentas y Chrome
node run.mjs --only feria --rounds 1        # primera prueba: una ronda de un solo pasanaku
node run.mjs                                # todo: 2 pasanakus, 8 rondas, unos 30 pagos reales
node run.mjs --headful                      # muestra Chrome (si PayPal pide un captcha, lo resuelves tú)
```

- Se puede cortar y volver a correr: continúa donde quedó cada pasanaku.
- Si PayPal cambia su pantalla o pide verificación, deja una captura en `tools/real-data/screenshots/` y avisa del paso donde se detuvo.
- Los pasanakus que crea son `Pasanaku de la feria (PayPal real)` y `Ahorro del barrio (PayPal real)`; los montos y miembros se cambian al inicio de `run.mjs`.
- Para enviar un pozo, la cuenta Business de tu app necesita saldo: sale de los propios pagos de la ronda, pero si falla con "saldo insuficiente", agrégale fondos en el panel sandbox (Accounts → tu cuenta Business → Fund).

## 6. Mantenimiento

```bash
docker compose logs -f api                 # ver lo que hace la API
docker compose restart api                 # tras cambiar .env (variables de la API)
docker compose up -d --build web           # tras cambiar DOMAIN o la licencia de Bryntum (van dentro de la web compilada)
git pull && docker compose up -d --build   # actualizar el código
```

**Copia de seguridad de la base** (hazla antes de actualizar y antes de la fecha de evaluación):

```bash
docker compose exec -T db pg_dump -U ayni ayni | gzip > ayni-$(date +%F).sql.gz
# restaurar:  gunzip -c ayni-AAAA-MM-DD.sql.gz | docker compose exec -T db psql -U ayni ayni
```

**Empezar de cero** (borra TODOS los datos): `docker compose down -v` y luego el paso 3.

## 7. Seguridad

- `ENABLE_DEMO_LOGIN=true` muestra a cualquiera un botón para entrar como miembro de prueba, y la clave de las cuentas sandbox en la pantalla de bienvenida. Es lo que necesita el jurado; son cuentas de **sandbox, sin dinero real**. Cuando termine la evaluación, ponlo en `false` y reinicia la API.
- La base de datos **no se publica** fuera de Docker: solo la API la alcanza. Mantenla así.
- Cambiar `JWT_SECRET` cierra la sesión de todos los usuarios.
- Si algún día pasas a PayPal real (no sandbox): `PAYPAL_API_BASE=https://api-m.paypal.com` y `PAYPAL_WEB_BASE=https://www.paypal.com`. Para producción hacen falta además las licencias de transmisión de dinero que menciona el README.

## Problemas comunes

| Síntoma | Causa probable |
|---|---|
| `set DOMAIN in .env` al hacer `up` | Falta una variable obligatoria en `.env` |
| La web no carga por HTTPS | DNS sin apuntar al VPS, o puertos 80/443 cerrados. Mira `docker compose logs web` |
| La app dice "no se puede conectar" | La web se compiló con otro `DOMAIN`: corrige `.env` y `docker compose up -d --build web` |
| El login con PayPal vuelve con error | La Return URL no coincide con `https://TU_DOMINIO/api/auth/paypal/callback` |
| `api` se reinicia sin parar | `docker compose logs api`: casi siempre falta `JWT_SECRET` o `PAYPAL_CLIENT_ID` |
| La compilación se corta sola | Poca RAM: agrega swap (sección 1) |
