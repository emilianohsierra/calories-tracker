'use client';

import ProgressRing from '@/components/ProgressRing';
import MacroBar from '@/components/home/MacroBar';
import TrainingRow from '@/components/home/TrainingRow';
import CoachLine from '@/components/home/CoachLine';

// El corazón de la HOME: el briefing diario del coach.
// Compone TrainingRow + anillo de kcal (héroe) + macros en barras premium + 1 CoachLine.
// - `briefing`: forma de getHomeBriefing() (o su fallback). Da objetivo/entreno/coachLine.
// - `totals`: consumido REAL del día (fuente de verdad de lo registrado; actualiza en vivo).
// - `targets`: plan calculado (respaldo del objetivo).
// - `loading`: muestra skeleton sereno.
export default function BriefingCard({ totals, targets, briefing, loading = false, onAsk }) {
  if (loading) return <BriefingSkeleton />;

  // Objetivo: contrato real del server usa {kcal, protein_g, carbs_g, fat_g, ...}; misma
  // convención que targets. Si macrosObjetivo es null, se deriva del plan (targets).
  // Si tampoco hay plan → estado vacío. Internamente uso prot/carb/gras.
  const mo = briefing?.macrosObjetivo;
  const src = mo || (targets ? { kcal: targets.kcal_target, protein_g: targets.protein_g, carbs_g: targets.carbs_g, fat_g: targets.fat_g } : null);
  const objetivo = src
    ? { kcal: Math.round(src.kcal || 0), prot: Math.round(src.protein_g || 0), carb: Math.round(src.carbs_g || 0), gras: Math.round(src.fat_g || 0) }
    : null;

  if (!objetivo || !objetivo.kcal) {
    return <EmptyBriefing coachLine={briefing?.coachLine} onAsk={onAsk} />;
  }

  // Consumido: en vivo desde totals (se actualiza al registrar sin refetch). Si totals aún
  // no cargó y el briefing trae macrosConsumidos (mismas claves protein_g…), se usa de respaldo.
  const mc = briefing?.macrosConsumidos;
  const liveKcal = Math.round(totals?.calories || 0);
  const consumido =
    liveKcal > 0 || !mc
      ? { kcal: liveKcal, prot: Math.round(totals?.protein_g || 0), carb: Math.round(totals?.carbs_g || 0), gras: Math.round(totals?.fat_g || 0) }
      : { kcal: Math.round(mc.kcal || 0), prot: Math.round(mc.protein_g || 0), carb: Math.round(mc.carbs_g || 0), gras: Math.round(mc.fat_g || 0) };

  const kcalGoal = objetivo.kcal;
  const kcal = consumido.kcal;
  const remaining = kcalGoal - kcal;
  const state = kcal > kcalGoal * 1.05 ? 'over' : kcal > kcalGoal * 0.9 ? 'warn' : 'ok';
  const color = state === 'over' ? 'var(--over)' : state === 'warn' ? 'var(--warn-c)' : 'var(--brand)';
  const restMsg =
    state === 'over'
      ? `Te pasaste por ${Math.abs(remaining)} kcal — mañana es otro día.`
      : `Te quedan ${Math.max(remaining, 0)} kcal.`;

  const macros = [
    { label: 'Proteína', value: consumido.prot, goal: objetivo.prot, color: 'var(--protein)', track: 'var(--protein-track)' },
    { label: 'Carbos', value: consumido.carb, goal: objetivo.carb, color: 'var(--carbs)', track: 'var(--carbs-track)' },
    { label: 'Grasa', value: consumido.gras, goal: objetivo.gras, color: 'var(--fat)', track: 'var(--fat-track)' },
  ];

  return (
    <section className="card" aria-label="Tu briefing de hoy" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s4)' }}>
      <TrainingRow entreno={briefing?.entrenoDelDia} />

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div role="meter" aria-valuemin={0} aria-valuemax={kcalGoal} aria-valuenow={kcal} aria-label="Calorías del día">
          <ProgressRing value={kcal} goal={kcalGoal} size={168} stroke={16} color={color}>
            <span className="num" style={{ fontSize: 40, lineHeight: '44px', fontWeight: 700, color: 'var(--text)' }}>
              {kcal}
            </span>
            <span className="ring-caption">de {kcalGoal} kcal</span>
          </ProgressRing>
        </div>
      </div>
      <p className="ring-caption" style={{ textAlign: 'center', margin: '0' }}>{restMsg}</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }} aria-label="Macros objetivo">
        {macros.map((m) => (
          <MacroBar key={m.label} {...m} />
        ))}
      </div>

      <CoachLine text={briefing?.coachLine} onAsk={onAsk} />
    </section>
  );
}

// Estado vacío: hay perfil pero aún no hay objetivo del día (macros null).
// Sereno, sin cero mudo; ofrece hablar con el coach o armar el plan.
function EmptyBriefing({ coachLine, onAsk }) {
  return (
    <section className="card" aria-label="Tu briefing de hoy" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s4)' }}>
      <TrainingRow entreno={null} />
      <p className="c-body" style={{ textAlign: 'center', color: 'var(--text-2)', margin: 0 }}>
        Aún no tengo tu plan de hoy. Registra tu primera comida y te voy guiando.
      </p>
      <CoachLine text={coachLine || 'Empecemos: cuéntame qué comiste o pídeme una idea para hoy.'} onAsk={onAsk} />
    </section>
  );
}

// Skeleton sereno (sin animación agresiva; seguro con prefers-reduced-motion).
function BriefingSkeleton() {
  const block = (h, w = '100%') => (
    <div style={{ height: h, width: w, borderRadius: 'var(--r-md)', background: 'var(--surface-2)' }} />
  );
  return (
    <section className="card" aria-busy="true" aria-label="Analizando tu día" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s4)', opacity: 0.7 }}>
      {block(28, '48%')}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: 168, height: 168, borderRadius: '50%', background: 'var(--surface-2)' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
        {block(14)}
        {block(14)}
        {block(14)}
      </div>
      {block(44)}
    </section>
  );
}
