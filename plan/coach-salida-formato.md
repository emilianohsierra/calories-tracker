# Coach — Formato de salida (tarjetas, profesional/humano)

**Autor:** Karpathy AI-Nutri · **Impl:** Torvalds/CTO (gkmi48v7, renderer), Rams (skm3lj3d, tarjetas) · **Reporta:** Lugia (mwao6a57)
**Base:** `plan/coach-cerebro.md`, `plan/coach-fase1-cerebro.md`. **Fecha:** 2026-07-31

> **Decisión de arquitectura:** el coach **no** escribe texto libre ni Markdown. Responde **siempre** llamando a una tool `responder` cuyo `input` es una estructura de **tarjetas** que el frontend renderiza en componentes. Así: 0 Markdown crudo, 0 ensayos, 0 emojis, y los **números se validan contra el motor** antes de pintar (la IA no inventa). Las tools de acción (`generar_cena`, etc., de `coach-fase1-cerebro.md`) siguen igual; `responder` es el **canal de respuesta final** del turno.

---

## 1. SYSTEM PROMPT — sección de estilo y salida (añadir/reemplazar)

Añadir este bloque al system prompt (`plan/coach-fase1-cerebro.md` §1.1), y **actualizar** los tonos (§3 de este doc):

```
# CÓMO RESPONDES (formato y estilo)
- Respondes SIEMPRE llamando a la herramienta `responder`. NO escribas texto libre ni Markdown: la app
  pinta tus tarjetas. Cada dato va en su campo; no uses viñetas, asteriscos, encabezados ni tablas.
- Corto, claro, profesional y cercano. Como un buen entrenador que respeta el tiempo de la persona.
- REGLA DE ORO: primero el DATO que necesita saber (titular), luego UNA acción concreta para ahora.
- Números: SOLO usa cifras que estén en las metas del motor, el <contexto_dia> o en resultados de
  herramientas. Si no tienes un número, llama a la herramienta o pídelo; NUNCA lo inventes ni lo redondees
  a ojo.
- PROHIBIDO: emojis; párrafos largos o "ensayos"; frases genéricas de ánimo vacío
  ("excelente, sigue así", "vamos con todo", "tú puedes", "¡lo estás haciendo increíble!").
  Si motivas, hazlo con un dato concreto del historial, no con una porra.
- Una sola acción por respuesta. El titular es la única cosa que la persona DEBE leer.
```

**Ejemplo (bueno) — cómo se estructura:**
Entrada: proteína hoy 48/119 g.
Salida (`responder`):
```json
{
  "titular": "Vas corto de proteína: 48 de 119 g, te faltan 71 g.",
  "bloques": [
    { "tipo": "nutrition", "metrica": "proteina", "consumido": 48, "objetivo": 119, "pendiente": 71, "unidad": "g" }
  ],
  "accion": { "label": "Ver cena rica en proteína", "accion": "generar_cena", "ref": "cena" }
}
```
El frontend lo pinta como: titular (1 línea) + tarjeta de nutrición (barra 48/119, "faltan 71 g") + botón de acción. Nada de "¡Excelente! 💪 Sigue así, te faltan solo unos gramitos…".

---

## 2. Regla de oro (en cada respuesta)

1. **QUÉ necesita saber** → `titular` (1 frase, el dato/insight). Es lo único imprescindible.
2. **QUÉ hacer ahora** → `accion` (una sola CTA). Si no hay acción, `accion.accion = "ninguna"`.
Los `bloques` (tarjetas) son el soporte visual del titular; 0–3 como máximo, nunca un muro.

---

## 3. Tonos actualizados (sin emojis, sin porras)

Reemplazar los 4 bloques de `coach-fase1-cerebro.md` §3 por estos (misma ciencia y guardrails; solo estilo). **Ningún tono usa emojis ni frases de ánimo vacías; si motiva, cita un dato.**

**amigable**
```
# TONO: Amigable
Cálido y cercano, pero sin exagerar. Sin emojis. Reconoce el esfuerzo citando un dato real
("llevas 9 días cumpliendo proteína"), nunca con porras genéricas. Frases cortas y humanas.
```
**entrenador**
```
# TONO: Entrenador
Directo y con foco. Sin emojis. Reta a cerrar la meta del día con datos, no con arengas. Nunca empujes
déficits agresivos ni presiones a alguien en situación sensible. Exiges constancia, no sacrificas la salud.
```
**analitico**
```
# TONO: Analítico
Preciso y objetivo. Sin emojis. Cifras, porcentajes y tendencias. Presenta el dato y la acción; sin adornos.
```
**tranquilo**
```
# TONO: Tranquilo
Calmado y sin presión. Sin emojis ni porras. Si un día no salió, lo normalizas con datos y propones el
siguiente paso. Invitas, no exiges.
```

---

## 4. Especificación de la tool `responder` (formato exacto de salida)

`tool_choice`: el system obliga a terminar el turno llamando `responder`. Formato Anthropic, `strict: true`, `additionalProperties: false`. Todos los campos **requeridos**; para "no aplica" usar `""` (string) o `0` (número) — el frontend oculta campos vacíos. Cards como `anyOf` discriminado por `tipo` (const).

```json
{
  "name": "responder",
  "description": "Emite la respuesta del coach como tarjetas para renderizar. Es la ÚNICA forma de responder al usuario: no escribas texto libre. Titular = el dato que debe saber; accion = la única acción para ahora; bloques = 0 a 3 tarjetas de soporte.",
  "strict": true,
  "input_schema": {
    "type": "object",
    "additionalProperties": false,
    "required": ["titular", "bloques", "accion"],
    "properties": {
      "titular": { "type": "string", "description": "1 frase, el dato/insight clave. Sin Markdown ni emojis." },
      "bloques": {
        "type": "array",
        "description": "0 a 3 tarjetas de soporte.",
        "items": {
          "anyOf": [
            { "type": "object", "additionalProperties": false,
              "required": ["tipo","metrica","consumido","objetivo","pendiente","unidad"],
              "properties": {
                "tipo": { "const": "nutrition" },
                "metrica": { "type": "string", "enum": ["proteina","calorias","carbohidratos","grasa","agua","fibra"] },
                "consumido": { "type": "number" },
                "objetivo": { "type": "number" },
                "pendiente": { "type": "number" },
                "unidad": { "type": "string", "enum": ["g","kcal","ml"] }
              } },
            { "type": "object", "additionalProperties": false,
              "required": ["tipo","titulo","kcal","prot_g","carb_g","gras_g","ingredientes","tiempo_min","costo"],
              "properties": {
                "tipo": { "const": "meal" },
                "titulo": { "type": "string" },
                "kcal": { "type": "number" }, "prot_g": { "type": "number" },
                "carb_g": { "type": "number" }, "gras_g": { "type": "number" },
                "ingredientes": { "type": "array", "items": { "type": "string" } },
                "tiempo_min": { "type": "number" }, "costo": { "type": "string" }
              } },
            { "type": "object", "additionalProperties": false,
              "required": ["tipo","texto","motivo"],
              "properties": {
                "tipo": { "const": "recommendation" },
                "texto": { "type": "string" }, "motivo": { "type": "string" }
              } },
            { "type": "object", "additionalProperties": false,
              "required": ["tipo","metrica","valor","tendencia","contexto"],
              "properties": {
                "tipo": { "const": "progress" },
                "metrica": { "type": "string" }, "valor": { "type": "string" },
                "tendencia": { "type": "string", "enum": ["sube","baja","estable"] },
                "contexto": { "type": "string" }
              } },
            { "type": "object", "additionalProperties": false,
              "required": ["tipo","cuando","timing","sugerencia"],
              "properties": {
                "tipo": { "const": "workout" },
                "cuando": { "type": "string" }, "timing": { "type": "string" },
                "sugerencia": { "type": "string" }
              } }
          ]
        }
      },
      "accion": {
        "type": "object", "additionalProperties": false,
        "required": ["label","accion","ref"],
        "properties": {
          "label": { "type": "string", "description": "Texto del botón. \"\" si accion=ninguna." },
          "accion": { "type": "string",
            "enum": ["registrar_texto","registrar_foto","generar_cena","cambiar_plan","lista_super","actualizar_agua","ver_progreso","ninguna"] },
          "ref": { "type": "string", "description": "Contexto para la acción (p.ej. \"cena\"). \"\" si no aplica." }
        }
      }
    }
  }
}
```

### 4.1 Tarjetas → render (para Rams y el CTO)
Cada tarjeta es un componente; el frontend mapea campos a slots, **sin interpretar Markdown**:

| Tarjeta | Componente | Campos → UI |
|---|---|---|
| **nutrition** | Anillo/barra de macro | `metrica` (etiqueta), `consumido`/`objetivo` (barra), `pendiente` ("faltan X u"), `unidad` |
| **meal** | Tarjeta de comida | `titulo`, chips de `kcal`/`prot_g`/`carb_g`/`gras_g`, `ingredientes` (lista), `tiempo_min`, `costo` |
| **recommendation** | Tarjeta de consejo | `texto` (1–2 frases), `motivo` (secundario, opcional) |
| **progress** | Tarjeta de progreso | `metrica`, `valor`, flecha por `tendencia`, `contexto` |
| **workout** | Tarjeta de entreno | `cuando`, `timing`, `sugerencia` |
| **titular** | Encabezado del mensaje | texto plano, 1 línea, peso visual alto |
| **accion** | Botón primario | `label`; al tocar, ejecuta `accion` (map a tool/pantalla) con `ref` |

Múltiples opciones de comida = varias tarjetas `meal` (p. ej. `generar_cena` con 2 opciones → 2 tarjetas `meal` + `accion` "Registrar la que elijas").

### 4.2 Validación de números (CTO — enforcement de "la IA no inventa")
Antes de renderizar, el backend valida el `input` de `responder`:
1. **Tarjetas nutrition:** recomputar `pendiente = objetivo − consumido`; y `objetivo`/`consumido` deben coincidir con las metas del motor y el `<contexto_dia>`. Si difieren → **sobreescribir con los valores del motor** (el motor manda).
2. **Tarjetas meal:** `kcal`/macros deben venir de un resultado previo de `generar_cena`/`cambiar_plan`/grounding. Si la tarjeta trae números sin respaldo de tool → marcar `estimado` o descartarlos (mostrar solo lo respaldado).
3. **progress:** `valor` proviene de `tendencias` del contexto.
4. Si el `input` no valida contra el schema (raro con `strict`) o el modelo emite texto libre en vez de llamar `responder` → **fallback**: envolver ese texto en una tarjeta `recommendation` de una línea. Nunca pintar Markdown crudo.

### 4.3 Notas de implementación (CTO)
- El chat corre el loop de tools (auto). Las tools de acción se resuelven primero; el turno **termina** cuando el modelo llama `responder`. Ese `input` ES la respuesta a pintar.
- Si `responder` llega con `bloques: []`, pintar solo `titular` + `accion` (respuesta mínima válida).
- Máx 3 bloques (recortar en backend si llegan más).
- `strict:true` en `responder` garantiza la forma; aun así, validar números (§4.2) porque `strict` valida forma, no veracidad.
- Caché: `responder` es una tool → va en el bloque `tools` (estable, cacheado) junto con las de acción.
- Streaming: se puede streamear el `input` de `responder` para pintar el titular apenas llega; o esperar el objeto completo (más simple en Fase 1).

---

## Coordinación
- **Rams (skm3lj3d):** diseñar los 5 componentes de tarjeta (nutrition/meal/recommendation/progress/workout) + encabezado (titular) + botón de acción, todos legibles sin Markdown; estados vacíos (campos `""`/`0` ocultos); layout de múltiples tarjetas `meal`.
- **CTO (gkmi48v7):** tool `responder` en el loop del coach; validación de números §4.2 (motor manda); fallback §4.2.4; recorte a 3 bloques; caché de tools. Actualizar el system prompt (§1 y §3 de este doc) y los tonos.

**Prioridad:** (1) tool `responder` + render de `titular`/`nutrition`/`accion` (cubre el caso proteína del ejemplo), (2) `meal` (opciones de `generar_cena`), (3) `progress`/`workout`/`recommendation`, (4) validación de números y fallback.
