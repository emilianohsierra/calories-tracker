// Validación + construcción de una fila de `meals` (sin user_id). Fuente ÚNICA de la
// verdad para insertar comidas: la reusan POST /api/meals y el ejecutor de la tool
// `registrar_comida_foto` del coach (evita drift). Números tal cual (no inventa).
export const MEAL_TYPES = ['desayuno', 'comida', 'cena', 'snack'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateMeal(body) {
  const date = String(body.date || '');
  const time = String(body.time || '');
  const title = String(body.title || '').trim().slice(0, 120);
  if (!DATE_RE.test(date)) return { ok: false, error: 'Fecha inválida' };
  if (!/^\d{2}:\d{2}$/.test(time)) return { ok: false, error: 'Hora inválida' };
  if (!title) return { ok: false, error: 'El título es obligatorio' };
  const calories = Math.round(Number(body.calories));
  if (!Number.isFinite(calories) || calories < 0 || calories > 10000) {
    return { ok: false, error: 'Calorías inválidas' };
  }
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : 0;
  };
  return {
    ok: true,
    row: {
      date,
      time,
      title,
      description: String(body.description || '').slice(0, 600),
      meal_type: MEAL_TYPES.includes(body.meal_type) ? body.meal_type : 'comida',
      calories,
      protein_g: num(body.protein_g),
      carbs_g: num(body.carbs_g),
      fat_g: num(body.fat_g),
      ingredients: Array.isArray(body.ingredients) ? body.ingredients.slice(0, 20) : [],
      confidence: String(body.confidence || '').slice(0, 10),
      image: String(body.image || '').replace(/[^a-zA-Z0-9.-]/g, ''),
    },
  };
}
