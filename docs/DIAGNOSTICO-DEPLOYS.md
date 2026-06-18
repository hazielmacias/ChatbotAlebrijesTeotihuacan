# Diagnóstico: Deploys no se aplican + Bot no responde

## Problema 1: Vercel no toma los nuevos commits

### Síntomas
- Cada `git push` se hace correctamente al remoto (verificado: `Local == Remote`)
- El `X-Vercel-Id` cambia (indica que algo se está sirviendo)
- PERO el contenido de los archivos NO cambia: el typing indicator (`wa-typing--self`) y el `showBotTyping()` que están en `cd262ba` no aparecen en producción
- La última versión desplegada corresponde a un commit anterior

### Causa raíz
Encontré dos problemas en el repo:

1. **`.github/workflows/deploy.yml`** — Un workflow de GitHub Actions que intentaba hacer deploy via `vercel deploy` CLI requiriendo secrets (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`). Los secrets no estaban configurados, así que el workflow fallaba silenciosamente y los commits NO generaban deploys.

   **Fix aplicado**: renombrado a `.github/workflows/deploy.yml.disabled` para que no se ejecute más. Vercel ahora debería usar el auto-deploy via GitHub integration.

2. **La integración GitHub → Vercel probablemente se rompió** — Vercel responde con un ID nuevo pero sirve archivos antiguos. Esto indica que la conexión con GitHub perdió la subscripción a nuevos pushes.

### Fix manual requerido (en Vercel Dashboard)
El fix aplicado al workflow **no es suficiente**. Hace falta intervención manual:

1. **Ve a** https://vercel.com/hazielmacias-projects/alebrijes-chatbot
2. **Settings → Git** → Verifica que el repo `hazielmacias/ChatbotAlebrijesTeotihuacan` esté conectado
   - Si NO está, haz clic en **"Connect Git Repository"** y vuelve a conectar
3. **Deployments** → Busca el último deploy (debería ser el más reciente después del push)
   - Si NO hay deploys nuevos desde el commit `b94505b`, haz clic en **"Redeploy"** en el último deploy existente
4. Espera 1-2 minutos a que termine el build
5. Verifica que el deploy terminó con status **"Ready"** (no "Error" ni "Building")

### Verificación post-fix
Una vez completado, el siguiente comando debería mostrar el typing indicator:
```bash
$chatCss = (Invoke-WebRequest -Uri "https://alebrijes-chatbot.vercel.app/css/chat.css" -UseBasicParsing).Content
$chatCss -match "wa-typing--self"
# Debe devolver: True
```

Si sigue devolviendo `False` después de un redeploy manual, hay un problema más profundo con el proyecto (pausado, plan excedido, etc.) que requiere contactar soporte de Vercel.

---

## Problema 2: El bot no contesta los mensajes reales de WhatsApp

### Síntomas (de los logs)
- **200 OK** en mis tests (yo firmo los webhooks con el `META_APP_SECRET` correcto)
- **401 Unauthorized** en los webhooks REALES de Meta (body length 824)
- Los logs muestran: `expected: sha256=XXX provided: sha256=YYY` — son **diferentes**

### Causa raíz
El `META_APP_SECRET` configurado en Vercel es **diferente** al App Secret actual de la app en Meta for Developers. Esto pasa cuando:
- Se rotó el App Secret en Meta pero no se actualizó en Vercel
- O nunca se configuró el correcto desde el inicio

Cuando Meta firma un webhook con su App Secret y Vercel verifica con uno diferente, las firmas no coinciden → 401 → Meta no recibe el 200 OK → Meta NO sabe que el mensaje fue entregado → el bot nunca responde al usuario.

### Fix manual requerido (en Meta + Vercel)

1. **Obtén el App Secret actual de Meta**:
   - Ve a https://developers.facebook.com/apps
   - Selecciona tu App de WhatsApp
   - **Settings → Basic** → **App Secret** → clic en "Show" → copia el valor
2. **Actualiza la variable en Vercel**:
   - Ve a https://vercel.com/hazielmacias-projects/alebrijes-chatbot/settings/environment-variables
   - Busca `META_APP_SECRET`
   - Pega el valor que copiaste de Meta
   - **Save** (esto dispara un redeploy automático con el nuevo secret)
3. **Espera el redeploy** (1-2 min)
4. **Verificación**: envía un mensaje de WhatsApp real al número de la app. El bot debe responder.

### Verificación post-fix
El test debe pasar:
```bash
node scripts/test-webhook-verification.js
# Debe mostrar: "OK: Webhook listo para configurar en Meta Developer Console"
```

Y luego envía un mensaje real desde WhatsApp al número del bot. Deberías ver en los logs de Vercel:
```
[verify] body length: XXX expected: sha256=... provided: sha256=...  (iguales)
[sender] OK: type=text wa_id=... db_id=... elapsed=...ms attempts=1
```

---

## Resumen de cambios en este commit

1. ✅ **`.github/workflows/deploy.yml.disabled`** — workflow manual deshabilitado
2. ✅ **Vercel auto-deploy debería activarse** — si no, hacer redeploy manual

## Lo que el usuario debe hacer

| # | Acción | Dónde |
|---|--------|-------|
| 1 | Verificar conexión GitHub → Vercel y reconnect si es necesario | Vercel Dashboard → Settings → Git |
| 2 | Forzar redeploy del último commit | Vercel Dashboard → Deployments → Redeploy |
| 3 | Verificar que `META_APP_SECRET` en Vercel == Meta App Secret | Vercel Settings + Meta for Developers |
| 4 | Esperar auto-redeploy y enviar mensaje real de prueba | WhatsApp |

## Estado del código
- ✅ Todo commiteado en `main` (último: `14cd423 chore: trigger vercel redeploy`)
- ✅ Tests locales pasan (19/19 E2E + 4/4 webhook verification)
- ⏳ Pendiente: que Vercel tome el código nuevo
- ⏳ Pendiente: que el bot responda a mensajes reales (requiere fix manual de secrets)
