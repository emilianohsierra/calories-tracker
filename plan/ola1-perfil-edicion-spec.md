# Ola 1 — Pantalla PERFIL + Edición de plan (spec corto)

**Rol:** UX/UI Lead · **Autor:** Rams Design (skm3lj3d) · **Fecha:** 2026-07-28
**Coherente con:** `plan/ola1-spec-diseno.md` (tokens, shell, onboarding). **Objetivo:** corregir perfil/plan sin re-hacer el onboarding.
**Principio:** **una fuente de verdad** — los pasos del onboarding se reusan tal cual, precargados con los valores actuales. No hay formularios duplicados.

---

## 1. Punto de entrada (ambos)

1. **Pestaña Perfil** (tab bar, §2 del spec): pantalla `app/perfil/page.js` con secciones. Avatar del `GreetingHeader` de HOME también abre aquí.
2. **Botón "Editar mi plan" en HOME**: link discreto dentro de `DayProgress` (junto a "Editar meta") → abre la sección de plan del Perfil. Acceso rápido al caso más común (corregir peso/objetivo).

---

## 2. Pantalla PERFIL — estructura (`app/perfil/page.js`)

Lista de secciones tipo "ajustes" (Notion/iOS Settings), cada fila = valor actual + chevron → abre el **paso del onboarding correspondiente** como hoja de edición:

```
┌─ Perfil ───────────────────────────────────┐
│  [avatar] Emiliano            [tema ☾/☀]    │
├─ MI PLAN ──────────────────────────────────┤
│  Objetivo        Perder grasa        →      │  → GoalPicker (Paso 2)
│  Coach           Sereno · Pérdida    →      │  → selector coach/tono
│  Meta            1 560 kcal · P140   →      │  → PlanReveal (solo lectura + "recalcular")
├─ MIS DATOS ────────────────────────────────┤
│  Sexo · Edad     Hombre · 30         →      │  → BaseDataStep (Paso 3)
│  Peso · Altura   70 kg · 175 cm      →      │  → BaseDataStep (Paso 3)
│  Actividad       Moderado (1.55)     →      │  → BaseDataStep (Paso 3)
│  Parámetros      Ritmo, dieta, etc.  →      │  → ObjectiveParams (Paso 4)
│  Intolerancias   Lactosa             →      │  → ObjectiveParams (Paso 4)
├─ CUENTA ───────────────────────────────────┤
│  Suscripción     Free                →      │  → UpgradeModal.js
│  Notificaciones AM/PM · Tema · Salir        │
└─────────────────────────────────────────────┘
```
- Cada fila muestra el **valor actual** (`.num` en cifras). Target ≥44px, foco visible, chevron a la derecha.
- Reusa tokens/estilos del sistema; secciones con `text-caption` en `--text-3` como encabezado.

---

## 3. Formulario pre-llenado (reusa pasos del onboarding)

**Clave:** los componentes `components/onboarding/*` (`GoalPicker`, `BaseDataStep`, `ObjectiveParams`) aceptan una prop `initialValues` y un `mode`:
- `mode="onboarding"` → wizard lineal 6 pasos (flujo actual).
- `mode="edit"` → **hoja modal individual** (un solo paso), precargada con `initialValues` del perfil guardado, con botones **Cancelar / Guardar**.

Flujo de edición:
1. Toca una fila → abre el paso como **hoja modal** (`Sheet`, desde abajo) con los valores actuales ya rellenados.
2. El usuario edita solo lo que necesita (defaults inteligentes intactos).
3. **Guardar** → `PUT` al perfil → si el cambio afecta el cálculo (sexo/edad/peso/altura/actividad/objetivo/params) → **recalcular plan** (§4).
4. Cambios que **no** recalculan (nombre, tema, notificaciones, coach/tono, intolerancias sin impacto energético) → guardan y cierran con toast, sin recálculo.

Datos que **sí** disparan recálculo: `sexo, edad, peso, altura, actividad(PAL), objetivo_primario, ritmo/params energéticos, patrón_dieta`.

---

## 4. Confirmación y feedback al recalcular

- Al guardar un cambio que recalcula: hoja breve **"Actualizando tu plan…"** reusando `CalculatingStep` (Paso 5) — 1–2s, anillos llenándose, respeta reduced-motion.
- Llama al **mismo endpoint de cálculo** de Karpathy (`§4.3` del spec Ola 1): mismo input, misma salida `{kcal_objetivo, macros, fibra, hidratacion}`.
- **Resultado con diff claro** (no un cambio silencioso):
  ```
  Tu plan cambió
  Calorías   1 560 → 1 720 kcal   (+160)
  Proteína   140 → 150 g          (+10)
  Carbos / Grasa …
  [Ver detalle]        [Entendido]
  ```
  El delta se muestra con color de estado (subida/bajada neutra, no "malo"). Copy del coach: *"Ajusté tu plan a tus nuevos datos."*
- `Toast` "Plan actualizado ✔". HOME refleja la nueva meta en `DayProgress` al volver (recargar meta/anillos).

---

## 5. Cuando cambia el OBJETIVO → nuevo plan revelado

Cambiar objetivo es el cambio mayor → merece el momento "ajá", no solo un toast:
1. Fila **Objetivo** → `GoalPicker` en `mode="edit"` precargado (objetivo actual marcado).
2. Al guardar nuevo objetivo/primario → si faltan params propios del nuevo objetivo (ej. cambió a "hipertrofia" y no hay días de entreno) → abre **solo** `ObjectiveParams` de lo faltante (no todo el wizard).
3. Recalcula y muestra **`PlanReveal` completo** (Paso 6) — anillo grande de kcal + macros + chips del nuevo objetivo, con encabezado *"Tu nuevo plan"* y CTA **"Empezar"** → HOME.
4. Guarda historial del cambio (para el motor adaptativo de Karpathy; opcional Ola 1).

**Regla:** cambiar objetivo **no borra** historial ni racha (Drucker: la memoria es el costo de cambio). Solo actualiza meta/macros hacia adelante.

---

## 6. Mapeo a archivos del repo

| Pieza | Archivo | Acción |
|---|---|---|
| Pantalla Perfil | `app/perfil/page.js` | **Nuevo** |
| Filas de ajustes | `components/perfil/SettingRow.js` | **Nuevo** (ligero) |
| Hoja de edición (paso individual) | `components/ui/Sheet.js` | **Nuevo/reusar** primitivo |
| Pasos reutilizados | `components/onboarding/GoalPicker.js`, `BaseDataStep.js`, `ObjectiveParams.js` | **Reusar** + prop `initialValues`/`mode` |
| Recalcular ("Actualizando…") | `components/onboarding/CalculatingStep.js` | **Reusar** |
| Nuevo plan revelado | `components/onboarding/PlanReveal.js` | **Reusar** (con encabezado "Tu nuevo plan") |
| Diff del plan | `components/PlanDiff.js` | **Nuevo** (ligero) |
| Persistencia perfil/meta | `app/api/settings` (+ tabla perfil) | **Extender** (coordinar CTO) |
| Cálculo del plan | endpoint Karpathy `§4.3` | **Reusar** (mismo que onboarding) |
| Suscripción | `components/UpgradeModal.js` | **Reusar** |
| Toast/feedback | `components/ui/Toast.js` | **Reusar** |

---

## 7. Dependencias
- **CTO:** persistir el perfil de onboarding como registro editable (tabla/campos), y que `PUT /api/settings` (o `/api/profile`) acepte updates parciales. La racha/historial no se tocan al recalcular.
- **Karpathy:** el endpoint de cálculo debe ser **idempotente y reutilizable** (mismo input→output para onboarding y edición). Devolver el plan anterior + nuevo para el diff (o el cliente lo compara).
- **Reusa el 100% de los componentes de onboarding** — esta pantalla es "onboarding en modo edición", no un módulo nuevo. Esfuerzo bajo.
