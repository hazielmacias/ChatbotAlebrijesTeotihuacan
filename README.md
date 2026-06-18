# Alebrijes Teotihuacan — Chatbot de WhatsApp + Dashboard

Chatbot de WhatsApp Business para la Academia de Futbol **Alebrijes de Oaxaca Teotihuacan** (fuerzas basicas). Motor de reglas (sin IA) con dashboard web para monitorear conversaciones en tiempo real, responder manualmente como agente humano y gestionar el catalogo de planes.

## Stack tecnologico

| Componente       | Tecnologia                                    |
|------------------|-----------------------------------------------|
| Runtime          | Node.js 18+                                   |
| Backend          | Serverless functions (Vercel `@vercel/node`)  |
| Frontend         | HTML + CSS + JS vanilla (sin frameworks)      |
| Base de datos    | Supabase (PostgreSQL)                         |
| Tiempo real      | Supabase Realtime (WebSockets)                |
| Autenticacion    | Supabase Auth (email/password)                |
| Chatbot          | Motor de reglas (flujos JSON declarativos)    |
| WhatsApp API     | Meta Cloud API (Graph API v18+)               |
| Deploy           | Vercel (auto-deploy en push a `main`)         |
| Repositorio      | GitHub                                        |

## Estructura del proyecto

```
.
+-- api/                              # Serverless functions
|   +-- webhook.js                    # Endpoint del webhook de Meta (GET verify + POST mensajes)
|   +-- auth/
|   |   +-- login.js                  # POST /api/auth/login
|   |   +-- me.js                     # GET /api/auth/me
|   +-- conversations/
|   |   +-- index.js                  # GET /api/conversations
|   |   +-- toggle-bot.js             # POST /api/conversations/toggle-bot
|   +-- messages/
|   |   +-- index.js                  # GET /api/messages
|   |   +-- send.js                   # POST /api/messages/send
|   +-- kpis/
|   |   +-- index.js                  # GET /api/kpis
|   +-- catalog/
|       +-- index.js                  # GET/POST /api/catalog
|       +-- get.js                    # GET /api/catalog/get?id=
|       +-- update.js                 # PATCH /api/catalog/update
|       +-- delete.js                 # DELETE /api/catalog/delete (soft delete)
+-- src/
|   +-- bot/
|   |   +-- engine.js                 # Motor de reglas del chatbot
|   |   +-- sender.js                 # Wrapper de Meta API + storage en Supabase
|   |   +-- flows/                    # Flujos JSON declarativos
|   |       +-- menu.json             # Menu principal
|   |       +-- escuela.json          # Flujo Escuela (6-11 anos)
|   |       +-- tdp.json              # Flujo Tercera Division (2005-2012)
|   |       +-- piloto.json           # Flujo Piloto (2002-2004)
|   |       +-- faq.json              # Flujo Preguntas Frecuentes
|   |       +-- cierre.json           # Cierre + datos de contacto
|   +-- lib/
|   |   +-- supabase.js               # Clientes Supabase (admin + anon)
|   |   +-- meta-api.js               # Llamadas a Meta Graph API
|   +-- middleware/
|       +-- auth.js                   # requireAuth() para endpoints protegidos
+-- public/                           # Frontend (servido por Vercel como static)
|   +-- login.html                    # Pagina de login
|   +-- dashboard.html                # SPA shell del dashboard
|   +-- css/
|   |   +-- variables.css             # CSS custom properties (paleta institucional)
|   |   +-- styles.css                # Estilos base + componentes
|   |   +-- whatsapp-theme.css        # Replica visual de WhatsApp Web
|   |   +-- chat.css                  # Estilos del chat (burbujas, input, toggle)
|   +-- js/
|   |   +-- config.js                 # Config publica (Supabase anon key)
|   |   +-- api.js                    # Cliente HTTP centralizado
|   |   +-- auth.js                   # Wrapper de Supabase Auth + dashboard_users
|   |   +-- supabase-client.js        # Cliente Supabase + Realtime
|   |   +-- router.js                 # Hash router + toast helper
|   |   +-- views/
|   |       +-- conversations.js      # Vista de conversaciones + chat
|   |       +-- kpis.js               # Vista de KPIs con Realtime
|   |       +-- catalog.js            # Vista de catalogo con CRUD
|   |       +-- settings.js           # Vista de configuracion
|   +-- favicon.ico, favicon-*.png, logo-alebrijes.png
+-- scripts/                          # Scripts de utilidad
|   +-- setup-dashboard-users.js      # Crea los 4 usuarios del dashboard
|   +-- generate-favicons.js          # Genera los favicons desde el logo
|   +-- test-webhook-verification.js  # Test del handshake del webhook
|   +-- test-e2e-flow.js              # Suite E2E (19 tests)
|   +-- test-*.js                     # Tests de endpoints especificos
+-- vercel.json                       # Config de Vercel
+-- package.json                      # Dependencias + scripts
+-- .env.example                      # Template de variables de entorno
+-- Plan.md                           # Plan de desarrollo con checkboxes
+-- README.md                         # Este archivo
```

## Setup local

### Prerrequisitos

- Node.js 18 o superior
- Una cuenta en [Supabase](https://supabase.com) con el schema ya migrado
- Una cuenta de [Meta for Developers](https://developers.facebook.com) con la app de WhatsApp configurada
- [ngrok](https://ngrok.com) o similar (opcional, para pruebas locales del webhook)

### 1. Clonar el repositorio

```bash
git clone https://github.com/hazielmacias/ChatbotAlebrijesTeotihuacan.git
cd ChatbotAlebrijesTeotihuacan
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar variables de entorno

Copia el template y editalo con tus credenciales:

```bash
cp .env.example .env
```

Edita `.env` con tus valores:

```env
# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxxxx
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxxxx

# Meta WhatsApp Cloud API
META_VERIFY_TOKEN=alebrijes_verify_token_2024
META_ACCESS_TOKEN=EAAxxxxxxx
META_PHONE_NUMBER_ID=123456789012345
META_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Opcional
PORT=3000
APP_URL=http://localhost:3000
```

**Como obtener cada credencial:**

| Variable | Donde obtenerla |
|----------|-----------------|
| `SUPABASE_URL` | Supabase Dashboard > Settings > API |
| `SUPABASE_ANON_KEY` | Supabase Dashboard > Settings > API (clave publica `anon`) |
| `SUPABASE_SERVICE_KEY` | Supabase Dashboard > Settings > API (clave secreta `service_role`) |
| `META_VERIFY_TOKEN` | Tu eleccion (debe coincidir con el configurado en Meta Console) |
| `META_ACCESS_TOKEN` | Meta for Developers > WhatsApp > Configuration > System user access token |
| `META_PHONE_NUMBER_ID` | Meta for Developers > WhatsApp > Configuration > Phone number ID |
| `META_APP_SECRET` | Meta for Developers > Settings > Basic > App secret |

### 4. Crear los usuarios del dashboard

```bash
node scripts/setup-dashboard-users.js
```

Esto crea 4 usuarios en Supabase Auth + registros en `dashboard_users`:

| Email | Password | Display name |
|-------|----------|--------------|
| `areli@alebrijesteotihuacan.com` | `areli123` | Areli |
| `athziri@alebrijesteotihuacan.com` | `athziri123` | Athziri |
| `juan@alebrijesteotihuacan.com` | `juan123` | Juan |
| `lalo@alebrijesteotihuacan.com` | `lalo123` | Lalo |

**Importante**: cambia los passwords antes de produccion.

### 5. Levantar el servidor de desarrollo

```bash
npm run dev
```

El servidor arranca en `http://localhost:3000` (o el puerto configurado en `PORT`).

- **Dashboard**: http://localhost:3000/dashboard.html
- **Login**: http://localhost:3000/login.html

### 6. Probar el webhook localmente (opcional)

Para que Meta pueda llegar a tu localhost, usa ngrok:

```bash
ngrok http 3000
```

Copia la URL HTTPS que te da ngrok y configurala en Meta for Developers > WhatsApp > Configuration > Webhook URL:

```
https://xxxxx.ngrok-free.app/api/webhook
```

## Deploy en Vercel

El deploy es **automatico** al hacer push a `main`:

```bash
git add .
git commit -m "feat: nueva funcionalidad"
git push origin main
```

Vercel detecta el push, compila las serverless functions y despliega en ~30-60 segundos.

### Configuracion inicial en Vercel Dashboard

1. Ve a [vercel.com](https://vercel.com) y conecta tu cuenta de GitHub
2. Importa el repo `hazielmacias/ChatbotAlebrijesTeotihuacan`
3. En **Settings > Environment Variables**, agrega las 8 variables listadas en `.env.example`:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `SUPABASE_ANON_KEY`
   - `META_VERIFY_TOKEN`
   - `META_ACCESS_TOKEN`
   - `META_PHONE_NUMBER_ID`
   - `META_APP_SECRET`
   - (opcional) `META_WABA_ID`
4. **Deploy!** — Vercel asigna una URL tipo `https://alebrijes-chatbot.vercel.app`

### Configuracion del webhook en Meta

Una vez desplegado:

1. Ve a [developers.facebook.com](https://developers.facebook.com) > tu App > WhatsApp > Configuration
2. En la seccion **Webhook**, haz clic en **Edit**:
   - **Callback URL**: `https://alebrijes-chatbot.vercel.app/api/webhook`
   - **Verify Token**: el mismo valor que `META_VERIFY_TOKEN` en Vercel
3. En **Webhook fields**, suscribete a: `messages`
4. Haz clic en **Test** para verificar la conexion

## Variables de entorno

| Variable | Requerida | Descripcion | Donde se usa |
|----------|-----------|-------------|--------------|
| `SUPABASE_URL` | Si | URL del proyecto Supabase | `src/lib/supabase.js`, `src/middleware/auth.js` |
| `SUPABASE_SERVICE_KEY` | Si | Service role key (privada) | `src/lib/supabase.js` (cliente admin) |
| `SUPABASE_ANON_KEY` | Si | Anon key (publica por diseno) | `src/middleware/auth.js`, `api/auth/login.js`, `public/js/config.js` |
| `META_VERIFY_TOKEN` | Si | Token de verificacion del webhook | `api/webhook.js` (GET handshake) |
| `META_ACCESS_TOKEN` | Si | Access token de la system user | `src/lib/meta-api.js` (enviar mensajes) |
| `META_PHONE_NUMBER_ID` | Si | ID del numero de WhatsApp Business | `src/lib/meta-api.js` |
| `META_APP_SECRET` | Si | App secret para validar firma HMAC | `api/webhook.js` (verificacion), `src/lib/meta-api.js` |
| `META_WABA_ID` | No | WhatsApp Business Account ID (reservado) | (uso futuro) |
| `PORT` | No | Puerto del servidor local (default 3000) | `api/index.js` |
| `APP_URL` | No | URL publica de la app | varios |

## Comandos utiles

### Desarrollo

```bash
npm run dev                       # Levanta el servidor con nodemon (hot reload)
npm start                        # Levanta el servidor en modo produccion
```

### Tests

```bash
node scripts/test-webhook-verification.js   # Test del handshake de Meta (4 tests)
node scripts/test-e2e-flow.js               # Suite E2E completa (19 tests)
node scripts/test-kpis.js                   # Test del endpoint /api/kpis (11 tests)
node scripts/test-catalog.js                # Test del catalogo CRUD (24 tests)
node scripts/test-messages.js               # Test del endpoint /api/messages (14 tests)
node scripts/test-conversations.js          # Test del endpoint /api/conversations (13 tests)
```

### Setup

```bash
node scripts/setup-dashboard-users.js       # Crea los 4 usuarios del dashboard
node scripts/generate-favicons.js           # Regenera los favicons desde assets/
```

### Git

```bash
git status                                   # Ver cambios
git add .                                    # Stage todos los cambios
git commit -m "feat: ..."                    # Commit con mensaje descriptivo
git push origin main                         # Push a main → deploy automatico
```

## Arquitectura

### Flujo del mensaje (inbound)

```
WhatsApp user
    |
    v
Meta Cloud API
    |
    v
POST /api/webhook  (verifica firma HMAC con META_APP_SECRET)
    |
    v
src/bot/engine.js: processIncomingMessage()
    |
    +---> Guarda mensaje inbound en tabla `messages`
    +---> Verifica `bot_active` de la conversacion
    +---> Si bot OFF: retorna (no responde)
    +---> Si bot ON: navega el flow actual, ejecuta step
    +---> Llama a sendAndStore() que:
              |
              +---> Envia via Meta API
              +---> Guarda respuesta outbound en tabla `messages`
              +---> Actualiza `current_flow` y `current_step`
```

### Flujo del dashboard (Realtime)

```
Dashboard (browser)
    |
    +---> Supabase Realtime: suscribe a INSERTs en `messages`
    |     (filtrado por conversation_id si hay una activa)
    |
    +---> Al recibir INSERT:
              +---> Agrega burbuja al chat
              +---> Si es inbound + bot ON: muestra "escribiendo..."
              +---> Si es outbound del bot: oculta "escribiendo..."
              +---> Actualiza lista de conversaciones (last_message preview)
              +---> Incrementa unread_count si no es la conversacion activa
    |
    +---> Auto-scroll al fondo del chat
    |
    +---> Si es agente humano:
              +---> POST /api/messages/send (optimistic UI + server confirm)
```

### Estados de la conversacion

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| `id` | uuid | Identificador unico |
| `contact_id` | uuid | FK a `contacts` |
| `phone` | string | Telefono del contacto (E.164) |
| `status` | enum | `active` \| `closed` |
| `bot_active` | bool | Si el bot responde automaticamente |
| `current_flow` | string | Flujo actual (`menu`, `escuela`, `tdp`, `piloto`, `faq`, `cierre`) |
| `current_step` | string | Step actual dentro del flujo |
| `flow_data` | jsonb | Datos acumulados del flujo (categoria, schedule, etc.) |

## Stack visual

- **Paleta institucional**: Negro `#111111` (60%), Blanco (30%), Naranja `#FF5E00` (10%)
- **Acentos tiliche** (header del dashboard): Rosa, Verde, Azul, Amarillo, Morado
- **Tipografia**: Outfit (display) + Inter (UI)
- **WhatsApp Web replica**:
  - Header `#008069` (turquesa)
  - Burbuja outbound `#d9fdd3` (verde claro)
  - Burbuja inbound `#ffffff` (blanco)
  - Day separators con pill blanca
  - Indicador "escribiendo" con 3 dots animados

## Seguridad

- **Backend (server-side only)**: SERVICE_KEY, META_ACCESS_TOKEN, META_APP_SECRET — solo en `api/**` y `src/**`
- **Frontend (publico por diseno)**: ANON_KEY esta en `public/js/config.js` — protegido por RLS en Supabase
- **Firma HMAC**: todos los webhooks de Meta validan `X-Hub-Signature-256` con `crypto.timingSafeEqual()` (anti timing-attack)
- **No secrets en repo**: `.env` esta en `.gitignore`, `.env.example` solo tiene placeholders
- **Auth required**: todos los endpoints de dashboard requieren Bearer token valido (validado con Supabase Auth + `dashboard_users`)

## Limitaciones conocidas

- **Integracion catalogo ↔ bot**: el bot usa planes hardcoded en `escuela.json`/`tdp.json`/`piloto.json`. El catalogo es una entidad separada para el dashboard. La integracion dinamica se intento pero Vercel tuvo problemas de cache de bundle al desplegar nuevos archivos `api/*` (incluso con `builds` quitado y `fs.readFileSync` runtime). Se documento en Plan.md como work item futuro.
- **Vercel build cache**: a veces Vercel no detecta nuevos archivos en `api/*` despues de varios re-deploys. Workaround: forzar re-deploy tocando archivos existentes.

## Licencia

ISC
