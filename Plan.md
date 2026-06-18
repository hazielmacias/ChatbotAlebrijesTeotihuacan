# Plan de Desarrollo — Chatbot WhatsApp "Alebrijes Teotihuacan"

## 1. Resumen del Proyecto

Chatbot de WhatsApp para la Academia de Fútbol **Alebrijes de Oaxaca Teotihuacan** (fuerzas básicas). Funciona con reglas (sin IA). Incluye un dashboard web para monitorear conversaciones en tiempo real, responder manualmente y gestionar el catálogo de planes.

### Stack Tecnológico

| Componente | Tecnología |
|---|---|
| Runtime | Node.js 18+ |
| Framework Backend | Express.js |
| Frontend Dashboard | HTML + CSS + JS vanilla |
| Base de datos | Supabase (PostgreSQL) |
| Tiempo real | Supabase Realtime |
| Autenticación | Supabase Auth (email/password) |
| Chatbot | Motor de reglas (flujos JSON definidos) |
| WhatsApp API | Meta Cloud API (Graph API v18+) |
| Deploy | Vercel (serverless) |
| Repositorio | GitHub |

---

## Fase 1 — Infraestructura y Setup

### 1.1 Repositorio y proyecto

- [x] **1.1.1** Crear repositorio en GitHub: `alebrijes-teotihuacan-chatbot`
- [x] **1.1.2** Clonar repositorio localmente
- [x] **1.1.3** Inicializar proyecto Node.js: `npm init -y`
- [x] **1.1.4** Instalar dependencias base:
  ```
  npm install express cors dotenvhelmet
  npm install @supabase/supabase-js
  npm install axios
  ```
- [x] **1.1.5** Instalar dependencias de desarrollo:
  ```
  npm install -D nodemon vercel
  ```
- [x] **1.1.6** Crear estructura de carpetas:
  ```
  /api/
    /webhook.js
    /auth/
      /login.js
      /me.js
    /conversations/
      /index.js
      /[id]/
        /toggle-bot.js
    /messages/
      /index.js
      /send.js
    /kpis/
      /index.js
    /catalog/
      /index.js
  /src/
    /bot/
      /engine.js
      /flows/
        /menu.json
        /catalogo.json
        /faq.json
      /sender.js
    /lib/
      /supabase.js
      /meta-api.js
    /middleware/
      /auth.js
  /public/
    /index.html
    /login.html
    /dashboard.html
    /chat.html
    /catalog.html
    /css/
      /styles.css
      /chat.css
      /whatsapp-theme.css
    /js/
      /auth.js
      /dashboard.js
      /chat.js
      /catalog.js
      /supabase-client.js
      /realtime.js
  vercel.json
  .env.example
  .gitignore
  ```
- [x] **1.1.7** Crear `.gitignore` (node_modules, .env, .vercel)
- [x] **1.1.8** Crear `.env.example` con las variables necesarias:
  ```
  # Supabase
  SUPABASE_URL=https://xxx.supabase.co
  SUPABASE_SERVICE_KEY=eyJ...
  SUPABASE_ANON_KEY=eyJ...

  # Meta WhatsApp API
  META_VERIFY_TOKEN=tu_token_de_verificacion
  META_ACCESS_TOKEN=tu_access_token_permanente
  META_PHONE_NUMBER_ID=tu_phone_number_id
  META_WABA_ID=tu_waba_id

  # App
  PORT=3000
  APP_URL=https://tu-app.vercel.app
  ```
- [x] **1.1.9** Crear `vercel.json` con configuración de serverless functions

### 1.2 Supabase — Proyecto y base de datos

- [x] **1.2.1** Crear proyecto en Supabase (región: US East o la más cercana)
- [x] **1.2.2** Copiar URL del proyecto y keys al `.env`
- [x] **1.2.3** Crear tabla `contacts`:
  ```sql
  CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT now()
  );
  ```
- [x] **1.2.4** Crear tabla `conversations`:
  ```sql
  CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID NOT NULL REFERENCES contacts(id),
    phone VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'active',  -- active, closed
    bot_active BOOLEAN DEFAULT true,
    current_flow VARCHAR(50),
    current_step VARCHAR(50),
    flow_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
  );
  ```
- [x] **1.2.5** Crear tabla `messages`:
  ```sql
  CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id),
    wa_id VARCHAR(100),
    direction VARCHAR(10) NOT NULL,  -- inbound, outbound
    content TEXT NOT NULL,
    type VARCHAR(20) DEFAULT 'text',  -- text, image, interactive, template
    sent_by VARCHAR(10) DEFAULT 'bot',  -- bot, human
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
  );
  ```
- [x] **1.2.6** Crear tabla `catalog_plans`:
  ```sql
  CREATE TABLE catalog_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price DECIMAL(10,2),
    category VARCHAR(50),
    image_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
  );
  ```
- [x] **1.2.7** Crear tabla `dashboard_users` (metadata extra para usuarios):
  ```sql
  CREATE TABLE dashboard_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID REFERENCES auth.users(id),
    display_name VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT now()
  );
  ```
- [x] **1.2.8** Crear índices:
  ```sql
  CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
  CREATE INDEX idx_conversations_phone ON conversations(phone);
  CREATE INDEX idx_conversations_status ON conversations(status);
  CREATE INDEX idx_contacts_phone ON contacts(phone);
  ```
- [x] **1.2.9** Configurar RLS (Row Level Security) en todas las tablas:
  - `messages`: SELECT/INSERT para usuarios autenticados, INSERT para service_role
  - `conversations`: SELECT/UPDATE para autenticados, INSERT para service_role
  - `contacts`: SELECT para autenticados, INSERT para service_role
  - `catalog_plans`: CRUD completo para autenticados, SELECT público
  - `dashboard_users`: SELECT/INSERT para autenticados
- [x] **1.2.10** Habilitar Supabase Realtime en las tablas `messages` y `conversations`
- [x] **1.2.11** Configurar Supabase Auth: habilitar login por email/password
- [x] **1.2.12** Crear usuario admin en Supabase Auth (email + password)

### 1.3 Meta Developer — WhatsApp Business API

- [x] **1.3.1** Ir a https://developers.facebook.com/ y crear cuenta de desarrollador
- [x] **1.3.2** Crear una nueva App (tipo: Business)
- [x] **1.3.3** Agregar producto "WhatsApp" a la App
- [x] **1.3.4** En la configuración de WhatsApp API:
  - Anotar el `Phone Number ID`
  - Anotar el `WhatsApp Business Account ID` (WABA ID)
  - Generar y copiar el `Access Token` permanente
- [x] **1.3.5** Definir el `Verify Token` personalizado para el webhook (ej: `alebrijes_verify_2024`)
- [x] **1.3.6** Anotar todas las credenciales en el `.env` local (NUNCA subir `.env` a GitHub)
- [x] **1.3.7** Configurar webhook URL apuntando a `https://tu-app.vercel.app/api/webhook` (se completa después del deploy)

### 1.4 Vercel — Deploy inicial

- [x] **1.4.1** Crear cuenta en Vercel (si no existe)
- [x] **1.4.2** Conectar repositorio GitHub a Vercel
- [x] **1.4.3** Configurar variables de entorno en Vercel (Panel → Settings → Environment Variables) con todos los valores del `.env`
- [x] **1.4.4** Hacer deploy inicial vacío para obtener la URL base
- [x] **1.4.5** Actualizar la URL del webhook en Meta Developer Console con la URL de Vercel

---

## Fase 2 — Backend: Webhook y Motor del Bot

### 2.1 Módulos base

- [x] **2.1.1** Crear `src/lib/supabase.js`: cliente de Supabase con service_role key (para backend)
- [x] **2.1.2** Crear `src/lib/meta-api.js`: funciones para enviar mensajes de WhatsApp vía Meta API
  - `sendMessage(phone, text)` — enviar texto
  - `sendInteractiveMessage(phone, header, body, buttons)` — enviar mensaje con botones
  - `sendImageMessage(phone, imageUrl, caption)` — enviar imagen
- [x] **2.1.3** Crear `src/middleware/auth.js`: middleware que valida token JWT de Supabase Auth en rutas protegidas

### 2.2 Webhook de WhatsApp

- [x] **2.2.1** Crear `api/webhook.js` con handler para Vercel serverless
- [x] **2.2.2** Implementar `GET /api/webhook`: verificación del webhook por Meta
  - Recibe `hub.mode=subscribe`, `hub.verify_token`, `hub.challenge`
  - Valida que `hub.verify_token` coincida con `META_VERIFY_TOKEN`
  - Responde con `hub.challenge`
- [x] **2.2.3** Implementar `POST /api/webhook`: recepción de mensajes
  - Validar firma HMAC del payload (header `X-Hub-Signature-256`) usando App Secret
  - Extraer número de teléfono del remitente, timestamp, contenido del mensaje
  - Procesar solo mensajes de tipo `text` e `interactive` (ignorar status, read receipts, etc.)
  - Llamar al bot engine para procesar el mensaje
  - Responder con HTTP 200 inmediatamente (no bloquear)

### 2.3 Bot Engine — Motor de reglas

- [x] **2.3.1** Crear `src/bot/engine.js` con la lógica principal:
  ```
  function processMessage(phone, messageText):
    1. Buscar o crear contacto en tabla contacts
    2. Buscar o crear conversación activa en tabla conversations
    3. Guardar mensaje inbound en tabla messages
    4. Si bot_active = false → no enviar respuesta automática, terminar
    5. Si bot_active = true → determinar siguiente respuesta según current_flow y current_step
    6. Guardar mensaje outbound en tabla messages
    7. Actualizar current_flow, current_step, flow_data en conversations
    8. Enviar mensaje outbound vía Meta API
  ```
- [x] **2.3.2** Implementar detección de flujo:
  - Si `current_flow` es null → mostrar Menú Principal
  - Si el usuario envía "0" o "menú" → reiniciar a Menú Principal
  - Si el usuario envía un número → navegar según la opción seleccionada en el flujo actual
  - Si el usuario envía texto que no coincide con una opción → responder con mensaje de ayuda

### 2.4 Flujos del Bot (archivos JSON)

- [x] **2.4.1** Crear `src/bot/flows/menu.json` — Menú Principal:
  ```
  Flujo: menu
  Paso: start
  Respuesta: "⚽ ¡Hola! 👋 Bienvenido a la Academia de Fútbol Alebrijes de Oaxaca Teotihuacan.
  
  ¿En qué te puedo ayudar?
  
  1️⃣ Ver planes de inscripción
  2️⃣ Preguntas frecuentes
  3️⃣ Hablar con una persona
  
  Responde con el número de la opción."
  Opciones:
    1 → ir a flujo catalogo, paso planes_list
    2 → ir a flujo faq, paso categories
    3 → ir a flujo menu, paso human_takeover
  ```
- [x] **2.4.2** Crear `src/bot/flows/catalogo.json` — Catálogo/Planes:
  ```
  Flujo: catalogo
  Paso: plans_list
  Respuesta: "📋 Nuestros planes de inscripción:
  
  [Lista dinámica desde BD de catalog_plans]
  
  Responde el número del plan para ver los detalles."
  Opciones:
    N → ir a paso plan_detail para el plan N
    0 → volver al menú principal
  
  Paso: plan_detail
  Respuesta: "📋 {nombre del plan}
  💰 Precio: ${precio}
  📝 {descripción}
  
  ¿Quieres más información?
  1️⃣ Hablar con una persona
  0️⃣ Volver al menú"
  Opciones:
    1 → ir a flujo menu, paso human_takeover
    0 → ir a flujo menu, paso start
  ```
- [x] **2.4.3** Crear `src/bot/flows/faq.json` — Preguntas Frecuentes:
  ```
  Flujo: faq
  Paso: categories
  Respuesta: "❓ Preguntas frecuentes:
  
  1️⃣ Horarios y ubicación
  2️⃣ Requisitos de inscripción
  3️⃣ Costos y pagos
  4️⃣ Edades permitidas
  0️⃣ Volver al menú"
  Opciones:
    1 → ir a paso horarios
    2 → ir a paso requisitos
    3 → ir a paso costos
    4 → ir a paso edades
    0 → ir a flujo menu, paso start
  
  Paso: horarios (y similar para cada categoría)
  Respuesta: [texto informativo de la categoría]
  Opciones:
    0 → volver al menú principal
    9 → volver a lista de FAQ
  ```
- [x] **2.4.4** Crear `src/bot/flows/menu.json` — Takeover humano:
  ```
  Flujo: menu
  Paso: human_takeover
  Acción: set bot_active = false en la conversación
  Respuesta: "🔤 Te conecto con una persona del equipo. En un momento te responderán."
  ```
- [x] **2.4.5** Implementar carga dinámica de planes desde `catalog_plans` en el paso `plans_list` del motor

### 2.5 Módulo de envío de mensajes (sender)

- [x] **2.5.1** Crear `src/bot/sender.js`: wrapper que:
  - Llama a `meta-api.js` para enviar el mensaje
  - Guarda el mensaje outbound en tabla `messages`
  - Maneja errores de la API de Meta (rate limits, números inválidos, etc.)

---

## Fase 3 — Backend: API del Dashboard

### 3.1 Autenticación

- [x] **3.1.1** Crear `api/auth/login.js`:
  - `POST /api/auth/login`
  - Recibe `{ email, password }`
  - Usa Supabase Auth `signInWithPassword`
  - Retorna `{ token, user }`
- [x] **3.1.2** Crear `api/auth/me.js`:
  - `GET /api/auth/me`
  - Valida token JWT del header Authorization
  - Retorna datos del usuario actual

### 3.2 Conversaciones

- [x] **3.2.1** Crear `api/conversations/index.js`:
  - `GET /api/conversations`
  - Lista conversaciones con datos del contacto
  - Parámetros de query: `status` (active/closed), `search` (por nombre/teléfono), `page`, `limit`
  - Retorna: array de conversaciones con último mensaje y datos del contacto
- [x] **3.2.2** Crear `api/conversations/[id]/toggle-bot.js`:
  - `POST /api/conversations/:id/toggle-bot`
  - Body: `{ bot_active: true/false }`
  - Actualiza campo `bot_active` en la conversación
  - Si `bot_active` cambia de false a true → enviar mensaje de reactivación al usuario
  - Retorna: conversación actualizada

### 3.3 Mensajes

- [x] **3.3.1** Crear `api/messages/index.js`:
  - `GET /api/messages?conversation_id=xxx`
  - Lista mensajes de una conversación, ordenados por timestamp ascendente
  - Retorna: array de mensajes
- [x] **3.3.2** Crear `api/messages/send.js`:
  - `POST /api/messages/send`
  - Body: `{ conversation_id, content }`
  - Obtiene teléfono de la conversación
  - Envía mensaje vía Meta API
  - Guarda mensaje outbound en tabla `messages` con `sent_by = 'human'`
  - Retorna: mensaje enviado

### 3.4 KPIs

- [x] **3.4.1** Crear `api/kpis/index.js`:
  - `GET /api/kpis`
  - Queries a Supabase:
    - Total de mensajes (count messages)
    - Conversaciones activas (count conversations where status='active')
    - Usuarios únicos (count contacts)
    - Mensajes de hoy (count messages where created_at >= today)
    - Conversaciones por estado (group by status)
    - Mensajes por día últimos 7 días (group by date)
  - Retorna: objeto JSON con todos los KPIs

### 3.5 Catálogo (CRUD)

- [ ] **3.5.1** Crear `api/catalog/index.js`:
  - `GET /api/catalog` — lista planes activos
  - `POST /api/catalog` — crear plan (campos: name, description, price, category, image_url)
  - `PATCH /api/catalog/:id` — actualizar plan
  - `DELETE /api/catalog/:id` — soft delete (is_active = false)
  - Todos protegidos con middleware de auth

---

## Fase 4 — Frontend: Dashboard

### 4.1 Estructura base y estilos

- [x] **4.1.1** Crear `public/css/styles.css` — estilos generales del dashboard (layout, nav, cards, forms)
- [x] **4.1.2** Crear `public/css/whatsapp-theme.css` — estilos para la interfaz tipo WhatsApp Web:
  - Chat bubbles (verdes para enviados, grises para recibidos)
  - Timestamps alineados a la derecha dentro de cada burbuja
  - Avatares circulares con iniciales
  - Input de mensaje con borde redondeado en la parte inferior
  - Lista de conversaciones en panel izquierdo (300px mínimo)
  - Panel de chat en el centro (flex-grow)
  - Indicador "en línea" / "última conexión"
  - Colores: fondo #eae6df, header #008069, bubbles salientes #d9fdd3, entrantes #ffffff
- [x] **4.1.3** Crear `public/css/chat.css` — estilos específicos del componente de chat

### 4.2 Cliente Supabase

- [x] **4.2.1** Crear `public/js/supabase-client.js`:
  - Inicializar cliente de Supabase con anon key
  - Exportar funciones: `signIn`, `signOut`, `getSession`, `onAuthStateChange`
  - Exportar funciones de Realtime: `subscribeToMessages`, `subscribeToConversations`, `unsubscribeAll`

### 4.3 Login

- [x] **4.3.1** Crear `public/login.html`:
  - Formulario centrado con email y password
  - Logo/nombre del proyecto
  - Botón "Iniciar sesión"
  - Link a recuperar contraseña
- [x] **4.3.2** Crear `public/js/auth.js`:
  - Manejar submit del formulario de login
  - Llamar a `signIn` de Supabase
  - Redirigir a `/dashboard.html` si éxito
  - Mostrar error si falla
  - Verificar sesión al cargar la página, redirigir si ya autenticado
  - Función de logout

### 4.4 Dashboard — KPIs

- [x] **4.4.1** Crear `public/dashboard.html`:
  - Navbar con logo, nombre "Alebrijes Teotihuacan", botón de logout
  - Grid de KPI cards:
    - Total de mensajes
    - Conversaciones activas
    - Usuarios únicos
    - Mensajes hoy
  - Gráfico simple de mensajes por día (últimos 7 días) usando CSS bars (sin librería externa)
- [x] **4.4.2** Crear `public/js/views/kpis.js` (módulo equivalente a `dashboard.js` en la arquitectura SPA con router):
  - Fetch a `GET /api/kpis` al cargar
  - Renderizar KPIs en las cards (6 stat cards + gráfico 7 días + breakdown por estado)
  - Suscribirse a Supabase Realtime en tabla `messages` (sin filtro) para actualizar contadores en vivo
  - Auto-refresh cada 30 segundos como fallback
  - Debounce 1.5s en eventos Realtime para evitar rafaga
  - Teardown automático al navegar fuera (libera interval + channel)

### 4.5 Dashboard — Conversaciones

- [x] **4.5.1** Integrar vista de conversaciones en `dashboard.html` o crear página dedicada:
  - Panel izquierdo: lista de conversaciones (scrollable) — `wa-conversations-panel` + `wa-conv-list`
  - Cada item muestra: nombre/teléfono, último mensaje, timestamp, badge con mensajes nuevos — `wa-conv-item` con avatares, preview, time, badge Bot/Humano + unread
  - Barra de búsqueda arriba de la lista — `wa-search` con input `conv-search` (busca por nombre, teléfono o contenido)
  - Filtro por status (todas, activas, cerradas) — `wa-conv-filters` con Todos/Activos/Cerrados/Bot/Humano
  - Click en conversación → abrir vista de chat — `selectConversation()` + responsive mobile toggle
- [x] **4.5.2** Suscripción Realtime:
  - Al abrir una conversación, suscribirse a nuevos mensajes en `messages` donde `conversation_id = id` — `subscribeToActiveConversation()` con `subscribeToMessages()`
  - Al recibir mensaje nuevo, agregar burbuja al chat en tiempo real — push a `state.messages` + `renderMessages()` con dedup
  - Actualizar lista de conversaciones cuando cambia `updated_at` — `subscribeToConversations()` + `subscribeToAllMessages()` con updates incrementales (last_message, unread_count)

### 4.6 Dashboard — Chat estilo WhatsApp Web

- [x] **4.6.1** Crear `public/chat.html` (o como sección dentro de dashboard):
  - Layout idéntico a WhatsApp Web:
    - **Panel izquierdo** (300px): lista de conversaciones con búsqueda
    - **Panel derecho** (flex-grow): chat activo
  - Panel derecho tiene 3 zonas:
    - **Header**: nombre/teléfono del contacto, badge "🤖 Bot activo" / "👤 Control manual", toggle switch para bot
    - **Body** (scrollable): mensajes con estilo de burbujas, timestamps, indicador de enviado por bot/humano
    - **Footer**: input de texto + botón enviar
- [x] **4.6.2** Crear `public/js/chat.js`:
  - Cargar historial de mensajes: `GET /api/messages?conversation_id=xxx`
  - Renderizar mensajes como burbujas:
    - Mensajes inbound: burbuja gris, alineados a la izquierda
    - Mensajes outbound bot: burbuja verde, alineados a la derecha, etiqueta "🤖 Bot"
    - Mensajes outbound humano: burbuja verde, alineados a la derecha, etiqueta "👤 Tú"
  - Función de envío: `POST /api/messages/send`
  - Al enviar mensaje: agregar burbuja optimista, confirmar con respuesta de API
  - Scroll automático al último mensaje
  - Enter para enviar, Shift+Enter para nueva línea

### 4.7 Toggle Bot On/Off

- [x] **4.7.1** En el header del chat, agregar un toggle switch:
  - Estado ON (verde): "Bot activo" → el bot responde automáticamente
  - Estado OFF (rojo): "Control manual" → el operador responde manualmente
  - Al hacer toggle: `POST /api/conversations/:id/toggle-bot` con `{ bot_active: true/false }`
  - Feedback visual inmediato (cambio de color del badge y el switch)
  - Confirmación con toast/snackbar

### 4.8 Catálogo de Planes

- [x] **4.8.1** Crear `public/catalog.html`:
  - Navbar consistente con el resto del dashboard
  - Tabla/lista de planes existentes con: nombre, precio, categoría, estado (activo/inactivo)
  - Botón "Agregar plan"
  - Cada plan tiene botones: editar, desactivar/activar, eliminar
- [x] **4.8.2** Crear `public/js/catalog.js`:
  - Fetch a `GET /api/catalog` al cargar
  - Renderizar lista de planes
  - Modal/formulario para crear plan (campos: nombre, descripción, precio, categoría, URL imagen)
  - Modal/formulario para editar plan existente
  - Confirmación antes de eliminar/desactivar
  - `POST`, `PATCH`, `DELETE` a `/api/catalog`

---

## Fase 5 — Deploy e Integración Final

### 5.1 Vercel Serverless Configuration

- [x] **5.1.1** `vercel.json` configurado:
  ```json
  {
    "$schema": "https://openapi.vercel.sh/vercel.json",
    "version": 2,
    "builds": [
      { "src": "api/**/*.js", "use": "@vercel/node" }
    ],
    "functions": {
      "api/webhook.js": { "maxDuration": 30 },
      "api/**/*.js":     { "maxDuration": 30 }
    }
  }
  ```
  - `api/**/*.js` se compila con `@vercel/node` (serverless functions)
  - `public/` se sirve automáticamente como static files (default de Vercel, no requiere `@vercel/static` legacy)
  - `/api/*` se resuelve a `api/*`; todo lo demás va a `public/`
  - **12/12 endpoints** verificados en producción (auth, conversations, messages, kpis, catalog CRUD completo)
  - **Static** verificado: dashboard.html, login.html, favicon.ico, css/variables.css, js/api.js → todos 200
- [x] **5.1.2** Verificado: 12/12 serverless functions exportan `module.exports = async function handler(req, res) { ... }`:
  - `api/webhook.js`
  - `api/auth/login.js`
  - `api/auth/me.js`
  - `api/catalog/delete.js`
  - `api/catalog/get.js`
  - `api/catalog/index.js`
  - `api/catalog/update.js`
  - `api/conversations/index.js`
  - `api/conversations/toggle-bot.js`
  - `api/kpis/index.js`
  - `api/messages/index.js`
  - `api/messages/send.js`

### 5.2 Variables de entorno

- [x] **5.2.1** Configuradas en Vercel Dashboard → Settings → Environment Variables y verificadas operativas en producción:

  | Variable | Usada en | Verificación |
  |----------|----------|--------------|
  | `SUPABASE_URL` | `src/lib/supabase.js`, `src/middleware/auth.js`, `api/auth/login.js` | ✅ Login funciona (200) |
  | `SUPABASE_SERVICE_KEY` | `src/lib/supabase.js` (admin client) | ✅ /api/kpis (200), /api/conversations (200), /api/catalog (200) |
  | `SUPABASE_ANON_KEY` | `src/middleware/auth.js`, `api/auth/login.js` | ✅ Login funciona (200) |
  | `META_VERIFY_TOKEN` | `api/webhook.js` (GET hub.mode=subscribe) | ✅ Webhook GET responde 403 con token incorrecto (carga correcta) |
  | `META_ACCESS_TOKEN` | `src/lib/meta-api.js` (enviar mensajes) | ✅ /api/messages/send (200) → WhatsApp real |
  | `META_PHONE_NUMBER_ID` | `src/lib/meta-api.js` | ✅ Mismo /api/messages/send (200) |
  | `META_APP_SECRET` | `api/webhook.js` (verificación firma), `src/lib/meta-api.js` | ✅ Webhook POST sin firma → 401 |
  | `META_WABA_ID` | (reservado para uso futuro) | ⚠️ Definida en .env.example, no usada actualmente por código |

  **Nota de seguridad**: ninguna variable está expuesta en `public/` o código del cliente. Las keys privadas (SERVICE_KEY, META_ACCESS_TOKEN, META_APP_SECRET) solo se usan en serverless functions (`api/**`). El anon key se publica en `public/js/config.js` (es público por diseño, RLS protege los datos).

### 5.3 Webhook en Meta

- [x] **5.3.1** En Meta Developer Console → WhatsApp → Configuration:
  - Callback URL: `https://tu-app.vercel.app/api/webhook`
  - Verify Token: mismo valor que `META_VERIFY_TOKEN` en .env
- [x] **5.3.2** Suscribirse a eventos del webhook: `messages`
- [x] **5.3.3** Verificar que el webhook pasa la verificación de Meta (GET request)

### 5.4 Testing end-to-end

- [x] **5.4.1** Enviar mensaje de prueba al número de WhatsApp Business
- [x] **5.4.2** Verificar que el webhook recibe el mensaje y guarda en Supabase
- [x] **5.4.3** Verificar que el bot responde con el menú principal
- [x] **5.4.4** Navegar por todas las opciones del bot (planes, FAQ, hablar con persona)
- [x] **5.4.5** Abrir el dashboard y verificar que la conversación aparece en la lista
- [x] **5.4.6** Abrir el chat y verificar que los mensajes se ven como en WhatsApp Web
- [x] **5.4.7** Enviar un mensaje manual desde el dashboard y verificar que llega al WhatsApp
- [x] **5.4.8** Apagar el bot en una conversación y verificar que no responde automáticamente
- [x] **5.4.9** Encender el bot y verificar que envía mensaje de reactivación
- [x] **5.4.10** Verificar que los KPIs se actualizan en el dashboard en tiempo real
- [x] **5.4.11** Crear un plan desde el dashboard y verificar que aparece en el bot

---

## Fase 6 — Seguridad y Pulido

### 6.1 Seguridad

- [ ] **6.1.1** Validar firma HMAC de Meta en el webhook (X-Hub-Signature-256) usando App Secret
- [ ] **6.1.2** Agregar middleware CORS: permitir solo el dominio de Vercel
- [ ] **6.1.3** Rate limiting en endpoints de API: máximo 100 requests por minuto por IP
- [ ] **6.1.4** Sanitizar inputs del usuario antes de guardar en BD (evitar SQL injection)
- [ ] **6.1.5** No exponer service_role key en el frontend, solo anon key
- [ ] **6.1.6** Validar que el usuario esté autenticado en todas las rutas del dashboard

### 6.2 Manejo de errores

- [ ] **6.2.1** Try/catch en todos los handlers de API
- [ ] **6.2.2** Respuestas de error consistentes: `{ error: true, message: "..." }`
- [ ] **6.2.3** Logs de errores en Vercel (console.error para que aparezcan en Vercel Logs)
- [ ] **6.2.4** Retry básico en envío de mensajes (si Meta API falla, reintentar 1 vez después de 2 segundos)

### 6.3 UX y pulido

- [x] **6.3.1** Pantalla de "sin conversación seleccionada" en el chat (similar WhatsApp Web):
  - Implementada en `public/js/views/conversations.js` líneas 137-147 (`.wa-chat-empty`)
  - SVG ilustrativo de WhatsApp + título "Selecciona una conversacion" + mensaje
  - Solo se muestra cuando no hay conversación activa
- [x] **6.3.2** Indicador de "escribiendo..." cuando el bot está procesando:
  - `showBotTyping()`: cuando llega un mensaje inbound via Realtime y `bot_active=true`, muestra 3 dots animados en el body del chat
  - `hideBotTyping()`: cuando llega la respuesta del bot, oculta el indicator
  - Safety net: si el bot no responde en 30s, oculta el typing
  - User typing: cuando el agente escribe en el input, "Escribiendo..." aparece en el status del header (se oculta a los 2s sin escribir)
- [x] **6.3.3** Responsive: dashboard funciona en móvil (lista de conversaciones ocultable):
  - `public/css/whatsapp-theme.css` media query `@media (max-width: 768px)`
  - Toggle via clase `.wa-app--mobile-chat-open` agregada al abrir una conversación
  - Default: muestra lista, oculta chat. Con clase: oculta lista, muestra chat
  - Botón "atrás" en el header del chat (visible solo en mobile)
- [x] **6.3.4** Toast de confirmación para acciones:
  - `window.toast.success()`, `.error()`, `.warning()`, `.info()` definidos en `public/js/router.js`
  - Usado en: toggle bot, send message, save plan, delete plan, login, error de API, etc.
  - CSS en `styles.css`: `.toast-container`, `.toast--success/error/warning/info`
- [x] **6.3.5** Loading spinners en llamadas a API:
  - `.spinner` y `.spinner--lg` en `styles.css` (animación CSS pura, sin librerías)
  - Usados en: lista de conversaciones (carga inicial), mensajes (carga inicial), dashboard views (kpis, catalog, settings)
  - Modal save: botón con texto "Guardando..." mientras espera API
- [x] **6.3.6** Push a GitHub y deploy automático en Vercel:
  - Vercel conectado al repo `hazielmacias/ChatbotAlebrijesTeotihuacan`
  - Cada `git push origin main` dispara deploy automático
  - Verificado en múltiples commits durante el desarrollo (24+ deploys)

### 6.4 Documentación

- [ ] **6.4.1** Crear `README.md` con:
  - Descripción del proyecto
  - Instrucciones de setup local (`npm install`, configurar `.env`, `npm run dev`)
  - Instrucciones de deploy (`git push` → Vercel auto-deploy)
  - Estructura del proyecto
  - Variables de entorno necesarias
  - Comandos útiles

---

## Notas Importantes

1. **Sin IA**: El bot funciona exclusivamente con reglas definidas en los archivos JSON de flujos. No se usa ningún modelo de lenguaje.
2. **Español**: Todo el contenido del bot y del dashboard está en español.
3. **Vercel Serverless**: No hay servidor persistente. Las funciones son stateless. El estado se guarda en Supabase.
4. **Realtime**: El dashboard actualiza en vivo usando Supabase Realtime (suscripción a cambios en tablas `messages` y `conversations`).
5. **WhatsApp Web replica**: La interfaz de chat imita el diseño de WhatsApp Web (burbujas, timestamps, layout de dos paneles).
6. **Toggle bot por conversación**: Cada conversación tiene su propio `bot_active`. Apagar el bot en una conversación no afecta las demás.
7. **Meta Cloud API**: Se usa la API Cloud de Meta (no On-Premise). El access token debe ser permanente o renovarse según la política de Meta.
8. **Número de sandbox**: Para desarrollo, usar el número de prueba que Meta proporciona. Para producción, vincular un número real de WhatsApp Business.
