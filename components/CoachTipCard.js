'use client';

// Consejo del día — tarjeta hero compartible en HOME.
// Ola 1: el texto puede venir del motor IA (después) o de un fallback estático por coach.
// Compartir: Web Share API con fallback a portapapeles. SIN PII en el texto compartido.
const FALLBACK = {
  perdida_grasa: 'Prioriza proteína en cada comida: te sacia y protege tu músculo mientras bajas grasa.',
  hipertrofia: 'Reparte tu proteína en 3–4 tomas al día para maximizar la síntesis muscular.',
  runner: 'Llega a tus entrenos con carbohidratos: son la gasolina que sostiene tu ritmo.',
  bienestar: 'Suma una verdura más hoy. Los pequeños cambios sostenidos son los que quedan.',
};

export default function CoachTipCard({ coach, tip }) {
  const text = tip || FALLBACK[coach] || FALLBACK.bienestar;

  const share = async () => {
    const payload = { title: 'Consejo del día', text, url: typeof window !== 'undefined' ? window.location.origin : '' };
    try {
      if (navigator.share) await navigator.share(payload);
      else {
        await navigator.clipboard.writeText(`${text}`);
        alert('Consejo copiado 📋');
      }
    } catch {
      // el usuario canceló el diálogo de compartir: no es error
    }
  };

  return (
    <section className="tip-card" aria-label="Consejo del día">
      <span className="tip-eyebrow">Consejo de hoy</span>
      <p className="tip-body">{text}</p>
      <div className="tip-actions">
        <button type="button" className="chip-action" onClick={share}>
          Compartir
        </button>
      </div>
    </section>
  );
}
