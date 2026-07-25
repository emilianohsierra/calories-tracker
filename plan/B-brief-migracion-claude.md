# BRIEF DE IMPLEMENTACIÓN — Migrar motor de IA: OpenAI → Claude (Anthropic)

**De:** Lugia (Director General / CPO)
**Para:** Torvalds CTO (owner) · revisión de esquema/prompt: Karpathy AI-Nutri
**Prioridad:** 🔴 Crítico (es la decisión de proveedor del fundador; desbloquea todo lo demás)
**Fecha:** 2026-07-24

---

## Objetivo
El fundador (Emiliano) usa las APIs de **Claude/Anthropic** (tiene crédito y experiencia con `claude-haiku-4-5`). Hay que reemplazar el proveedor OpenAI por Anthropic en el motor de análisis de foto, **sin cambiar el contrato** que el resto de la app espera. El cambio debe quedar **aislado en `lib/analyze.js`** — idealmente `app/api/analyze/route.js` NO se toca (o se toca lo mínimo).

## Alcance (qué SÍ y qué NO)
- ✅ Reescribir `lib/analyze.js` para usar el SDK `@anthropic-ai/sdk` (Messages API + **tool use** para forzar el JSON estructurado).
- ✅ Actualizar `package.json` (quitar `openai`, agregar `@anthropic-ai/sdk`) y correr `npm install`.
- ✅ Actualizar `.env.local.example` (documentar `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL`; quitar OpenAI/Grok).
- ❌ NO tocar la BD, el storage, el auth ni la UX (eso es Sprint 1 / C, aparte).
- ❌ NO implementar el grounding nutricional todavía (eso es Beta; ver `plan/ia-precision.md`).

## Contrato que se DEBE preservar (para no romper el resto de la app)
La función exportada sigue siendo:
```
analyzeFoodImage(base64, mimeType, hint = '', correction = null)
  → devuelve { analysis, provider, model }
```
- `analysis` es un objeto con EXACTAMENTE estos campos (mismos que hoy consume `app/api/analyze/route.js` y `components/AddMealModal.js`):
  `es_comida (bool), titulo (str), descripcion (str), tipo_comida (enum: desayuno|comida|cena|snack), calorias (int), proteinas_g (num), carbohidratos_g (num), grasas_g (num), confianza (enum: alta|media|baja), ingredientes (string[])`.
- `provider` debe seguir siendo un objeto con estos campos (los usa el manejo de errores de `app/api/analyze/route.js:51-66`): `{ id, label, keyEnv, modelEnv, defaultModel, billingHint }`.
- Mantener `resolveProvider()` exportada y `err.code` para: `NO_API_KEY`, `BAD_PROVIDER`. Mapear "sin crédito" de Anthropic a `err.code='insufficient_quota'` para que el mensaje amigable actual siga funcionando.

## Diseño de referencia (implementar en este espíritu)
- Cliente: `new Anthropic({ apiKey })`.
- **Tool use** para salida estructurada: definir una tool `registrar_analisis` cuyo `input_schema` sea el JSON Schema de los campos de arriba, y forzarla con `tool_choice: { type: 'tool', name: 'registrar_analisis' }`. El `analysis` se extrae del bloque `content` de tipo `tool_use` (`block.input`).
- `system`: reusar el `SYSTEM_PROMPT` actual (nutriólogo, español, cocina mexicana) — no degradar ese sesgo latino, es diferenciador.
- Imagen: bloque `{ type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } }`.
- Reanálisis con corrección: replicar la lógica actual (mensaje `assistant` con el análisis previo + mensaje `user` con la corrección, respetando lo que afirma el usuario).
- **Quick-win aprobado por el Director:** fijar `temperature: 0.2` (hoy es 1.0 → misma foto da números distintos; ver `plan/ia-precision.md` hallazgo C). `max_tokens: 1024`.
- Modelo por defecto: `claude-haiku-4-5`, override por `ANTHROPIC_MODEL`.

## Provider object sugerido
```
{ id:'anthropic', label:'Claude (Anthropic)', keyEnv:'ANTHROPIC_API_KEY',
  modelEnv:'ANTHROPIC_MODEL', defaultModel:'claude-haiku-4-5',
  billingHint:'console.anthropic.com → Billing' }
```

## Seguridad / operación
- **NUNCA** imprimas ni cites el valor de ninguna API key. Al inspeccionar `.env.local`, solo nombres de variables.
- Deja anotado en `.env.local.example` que hay que poner `ANTHROPIC_API_KEY` (el fundador la agrega él mismo).

## Criterios de aceptación (Definition of Done)
1. `npm run build` pasa sin errores.
2. `lib/analyze.js` ya no importa `openai`; usa `@anthropic-ai/sdk`.
3. El contrato (`analysis` + `provider`) queda idéntico → `app/api/analyze/route.js` funciona sin cambios (o con cambios mínimos justificados).
4. `.env.local.example` actualizado a Anthropic.
5. NO corras el server ni hagas llamadas reales a la API (para no gastar crédito) — basta con que compile y el código sea correcto. Si quieres una verificación real, pídemela antes.
6. Reporta con `report-task`: qué cambiaste, resultado del build, y cualquier decisión que tomaste distinta a este brief (con justificación).

## Coordinación
- Karpathy AI-Nutri: revisa que el `input_schema` de la tool y el `SYSTEM_PROMPT` conserven fidelidad nutricional y el sesgo a comida mexicana. Deja tu OK o ajustes en el reporte.
