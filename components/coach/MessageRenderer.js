'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { parseMessage } from '@/lib/coach/parseMessage';
import NutritionCard from './cards/NutritionCard';
import MealCard from './cards/MealCard';
import RecommendationCard from './cards/RecommendationCard';
import ProgressCard from './cards/ProgressCard';
import WorkoutCard from './cards/WorkoutCard';

// Mapeo de componentes para Markdown: garantiza que `##`/`**`/`|`/`---` SIEMPRE se
// rendericen estilizados, NUNCA crudos. rehype-sanitize elimina cualquier HTML/XSS.
const MD_COMPONENTS = {
  h1: (p) => <p className="c-title" {...p} />,
  h2: (p) => <p className="c-title" {...p} />,
  h3: (p) => <p className="c-title" {...p} />,
  p: (p) => <p className="c-body" {...p} />,
  strong: (p) => <strong {...p} />,
  ul: (p) => <ul className="md-list" {...p} />,
  ol: (p) => <ol className="md-list" {...p} />,
  li: (p) => <li {...p} />,
  a: (p) => <a {...p} target="_blank" rel="noopener noreferrer" />,
  hr: () => <hr className="md-hr" />,
  table: (p) => <div className="md-table-wrap"><table {...p} /></div>,
  code: (p) => <code className="md-code" {...p} />,
  pre: (p) => <pre className="md-pre" {...p} />,
};

// Mapea la accion de Karpathy (enum) a un prompt/navegación que el chat ya sabe hacer.
const ACCION_PROMPT = {
  generar_cena: '¿Qué puedo cenar hoy?',
  lista_super: 'Arma mi lista del súper para esta semana.',
  actualizar_agua: 'Registra un vaso de agua.',
  ver_progreso: '¿Cómo voy esta semana?',
  registrar_texto: 'Quiero registrar una comida.',
  cambiar_plan: 'Quiero cambiar mi plan.',
};

// N-I9: honra accion.ref (p.ej. momento del día) en vez de asumir siempre "cenar".
const MOMENTO_VERBO = { desayuno: 'desayunar', comida: 'comer', cena: 'cenar', snack: 'un snack' };
function promptDeAccion(accion) {
  if (accion?.accion === 'generar_cena' && accion.ref) {
    const v = MOMENTO_VERBO[String(accion.ref).toLowerCase()];
    if (v) return v === 'un snack' ? '¿Qué snack puedo comer hoy?' : `¿Qué puedo ${v} hoy?`;
  }
  return ACCION_PROMPT[accion?.accion] || '';
}

function Card({ b, onRegisterMeal }) {
  switch (b.tipo) {
    case 'nutrition':
      return <NutritionCard {...b} />;
    case 'meal':
      return <MealCard {...b} onRegister={onRegisterMeal} />;
    case 'recommendation':
      return <RecommendationCard {...b} />;
    case 'progress':
      return <ProgressCard {...b} />;
    case 'workout':
      return <WorkoutCard {...b} />;
    default:
      return null; // tipo desconocido → degradar sin romper (Rams §4)
  }
}

export default function MessageRenderer({ content, onAccion, onRegisterMeal }) {
  const parsed = parseMessage(content);

  if (parsed.kind === 'structured') {
    const { titular, bloques, accion } = parsed.data;
    const showAccion = accion && accion.accion !== 'ninguna' && accion.label;
    return (
      <div className="coach-msg">
        {titular ? <div className="coach-titular">{titular}</div> : null}
        {bloques.map((b, i) => (
          <Card key={i} b={b} onRegisterMeal={onRegisterMeal} />
        ))}
        {showAccion && (
          <div className="c-card__actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onAccion?.(accion, promptDeAccion(accion))}
            >
              {accion.label}
            </button>
          </div>
        )}
      </div>
    );
  }

  // Prosa (usuario, legacy o fallback): Markdown SANITIZADO, nunca crudo.
  return (
    <div className="coach-msg md-prose">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} components={MD_COMPONENTS}>
        {parsed.text}
      </ReactMarkdown>
    </div>
  );
}
