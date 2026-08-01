# R4 · Memoria del coach (diseño para revisión)

**Autor:** Torvalds (CTO) · **Para:** Lugia (Director) · **Fecha:** 2026-07-31
**Objetivo:** el coach RECUERDA a la persona entre sesiones (anti-churn). **Alcance recomendado (Lugia): SIMPLE** = tabla estructurada/curada + inyección al contexto. **pgvector + embeddings (Voyage) = enhancement a escala, NO ahora.**

## 1. QUÉ recuerda (tipos)
Alineado con `save_memory` de Karpathy §4.7 (enum cerrado):
- **favorito** — le gustan (tacos, café sin azúcar).
- **rechazo** — no le gustan / no come (brócoli, hígado).
- **lesion** — limitación física (hombro derecho), puede caducar.
- **compromiso** — meta blanda ("entrenar 4×/sem", "menos refresco").
- **preferencia** — estilo/logística (cocina rápida, sin cena tarde).
- **hecho_clave** — dato útil recurrente ("viaja los lunes").

> **NUNCA** alergias/intolerancias como memoria suelta (dato de SALUD). Ver §4.

## 2. Tabla (aditiva, idempotente; la corre Emiliano)
`supabase/coach-memoria.sql`:
```sql
create table if not exists public.coach_memories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  tipo       text not null check (tipo in ('favorito','rechazo','lesion','compromiso','preferencia','hecho_clave')),
  contenido  text not null,
  norm       text not null,                 -- contenido normalizado (dedupe)
  activa     boolean not null default true, -- soft-delete
  caduca_en  date,                          -- null = permanente
  fuente     text default 'save_memory',    -- save_memory | extraccion | perfil
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, tipo, norm)              -- dedupe hermético a nivel BD
);
-- RLS CRUD propio + revoke anon + grant authenticated (consistente con coach.sql).
```

## 3. CÓMO se captura
### 3.1 Tool `save_memory(tipo, contenido, caducidad_dias)` (Karpathy §4.7)
- Executor (backend): normaliza `contenido` → `norm`; **upsert por (user_id,tipo,norm)** (dedupe); `caducidad_dias>0 → caduca_en = hoy+dias`, `0 → null`.
- **Direct-write** + confirmación por `responder` ("Lo recordaré: no te gusta el brócoli"). Es dato menor (no salud) → sin confirmación UI, coherente con `actualizar_contexto_dia` ya aprobado.
- **Guard de salud (dura):** si `tipo` no está en el enum, o el `contenido` matchea heurística de alergia/intolerancia (`/alergi|alérgic|intoleran|celiac/`), NO se guarda como memoria → el coach deriva al flujo de **restricciones duras** (que está BLOQUEADO hasta el diseño hermético del filtro, `plan/coach-alergias-arquitectura.md`). Nunca degradar una alergia a "preferencia".

### 3.2 Extracción de la conversación — sub-rebanada POSTERIOR (R4-3)
Empezar SIN auto-extracción (solo la tool explícita) para mantener R4 simple y barato. Luego: un paso ligero post-turno (Haiku, structured) que PROPONE hechos a guardar (con dedupe). Opcional.

## 4. Salud/alergias (regla dura)
- `save_memory` **no** captura alergias/intolerancias (enum las excluye + guard §3.1).
- La captura de alergias es su propio slice y **no se despliega** sin el diseño hermético (etiquetas de alérgeno por ingrediente, no keyword) + confirmación UI. Ver `plan/coach-alergias-arquitectura.md`.

## 5. CÓMO se recupera e inyecta (capa de memoria)
- `assembleContext` añade una query: memorias `activa AND (caduca_en IS NULL OR caduca_en >= hoy)`, orden `updated_at desc`, **límite ~12** (cota de tokens).
- **Inyección en L2 (volátil, `<contexto_dia>`):** las memorias cambian en el tiempo → van con el turno de usuario (después del breakpoint de caché), NO en el system. La plantilla de Karpathy ya prevé la línea `Memoria: {{…}}`. Formato compacto:
  `Memoria: [favorito] café sin azúcar · [rechazo] brócoli · [lesion] hombro der. (temporal) · [compromiso] entrenar 4×/sem.`
- El persona ya instruye "usa la memoria para NO repetir y referenciar el pasado". Cero cambio de prompt salvo rellenar la línea.

## 6. Costo estimado
- **R4-1 (tool + inyección):** ~**$0 marginal**. La inyección es lectura de BD; `save_memory` es una tool DENTRO del turno existente (sin llamada extra a IA). Coste = tokens del bloque memoria en contexto (~50–150 tok/turno) + schema de la tool. Despreciable.
- **R4-3 (auto-extracción):** +1 llamada Haiku pequeña por turno (~300 tok) → céntimos; opcional.
- **pgvector + Voyage (escala):** embeddings (~$0.00002/1k tok) + infra pgvector; **diferido** hasta que el volumen de memorias por usuario lo justifique (retrieval semántico). En beta, top-N recientes/curados basta.

## 7. Sub-rebanadas
- **R4-1** (valor "me recuerda"): tabla + RLS/grants (SQL, Emiliano) · `save_memory` tool + executor (dedupe, caducidad, guard de salud) · inyección de memorias activas en `<contexto_dia>`. Tests: dedupe, caducidad, guard de alergia, formato de inyección. *Deploy-safe si la tabla no existe aún (lectura vacía).*
- **R4-2** (gestión): superficie mínima para ver/olvidar memorias (en Perfil o un "el coach recuerda: …"). Opcional en beta.
- **R4-3** (auto-extracción): propuesta post-turno de hechos a guardar.
- **R4-4** (escala): pgvector + Voyage para retrieval semántico.

## 8. No-regresión / seguridad
- Aditivo: no toca chat/foto/texto/generar_cena/cambiar_plan/cap/reembolso/rediseño; no toca globals.css ni HOME.
- Deploy-safe sin el SQL (memorias = lectura vacía). Cap de tokens con límite 12. Dedupe hermético en BD (unique) + normalización.
- Alergias fuera de este slice (regla dura).

## 9. Archivos (plan, R4-1)
- `supabase/coach-memoria.sql` (NUEVO, Emiliano).
- `lib/coach/actions.js`: `guardarMemoria({ supabase, userId, input })` (dedupe/caducidad/guard).
- `lib/coach/context.js`: query de memorias + pasarlas a `ctx`.
- `lib/coach/persona.js`: rellenar la línea `Memoria:` en `contextoDiaBlock`.
- `app/api/coach/chat/route.js`: `SAVE_MEMORY_TOOL` + manejo en el loop (direct-write, cierra con responder).
- Tests en `lib/coach/actions.test.js`.
