import { describe, it, expect, vi } from 'vitest';
import { verificarNudgeIA, extraerNumeros, puliArNudge } from './redactar.js';

describe('redactar · post-check verificarNudgeIA', () => {
  const det = 'Vas 60 de 120 g de proteína. Te faltan 60 g; una cena con proteína lo cierra.';

  it('acepta un texto pulido que conserva EXACTO el conjunto de cifras', () => {
    const ia = 'Vamos con todo: llevas 60 de 120 g de proteína y te faltan 60 g. Una buena cena lo cierra.';
    expect(verificarNudgeIA(ia, det).ok).toBe(true);
  });
  it('DESCARTA si menciona peso/báscula (guardrail)', () => {
    const ia = 'Te faltan 60 de 120 g de proteína; así bajas de peso más rápido.';
    const r = verificarNudgeIA(ia, det);
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('prohibido');
  });
  it('DESCARTA si CAMBIA una cifra', () => {
    const ia = 'Llevas 60 de 100 g de proteína, te faltan 60 g.'; // 120 -> 100
    const r = verificarNudgeIA(ia, det);
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('cifra');
  });
  it('DESCARTA si INVENTA una cifra nueva', () => {
    const ia = 'Vas 60 de 120 g de proteína; te faltan 60 g, unas 3 pechugas lo cierran.'; // 3 inventado
    expect(verificarNudgeIA(ia, det).ok).toBe(false);
  });
  it('DESCARTA si PIERDE una cifra', () => {
    const ia = 'Te falta algo de proteína, una cena lo cierra.'; // sin 60/120
    expect(verificarNudgeIA(ia, det).ok).toBe(false);
  });
  it('DESCARTA vacío o demasiado largo', () => {
    expect(verificarNudgeIA('', det).ok).toBe(false);
    expect(verificarNudgeIA('x'.repeat(400), 'sin cifras').ok).toBe(false);
  });
  it('missed_meal (sin cifras) acepta reescritura sin números; rechaza si mete un número', () => {
    const det0 = 'Cuéntame qué comiste y lo cuadro contigo.';
    expect(verificarNudgeIA('¿Me cuentas qué comiste? Lo cuadro contigo.', det0).ok).toBe(true);
    expect(verificarNudgeIA('Llevas 2 comidas sin registrar hoy.', det0).ok).toBe(false);
  });
  it('extraerNumeros toma los enteros', () => {
    expect(extraerNumeros('60 de 120 g, faltan 60')).toEqual(['60', '120', '60']);
  });
});

describe('redactar · post-check léxico (re-ataque Nielsen: stems + frases)', () => {
  // Sin cifras a ambos lados → aislamos el léxico (las cifras no interfieren).
  const det = 'Registra tu comida de hoy y te ayudo.';
  const debeDescartar = (frase) => {
    const r = verificarNudgeIA(frase, det);
    expect(r.ok, `debería descartar: "${frase}" (motivo=${r.motivo})`).toBe(false);
  };

  it('descarta las 13 frases que ANTES bypasseaban', () => {
    [
      'No te des un atracon hoy.',                 // atracon (TCA)
      'Compensalo con ejercicio manana.',           // compensar
      'Mejor prueba a ayunar un rato.',             // ayunar
      'Salta la cena de hoy.',                      // salta la cena
      'No comas nada mas por hoy.',                 // no comas
      'Ve a pesarte a la bascula.',                 // pesar/pesas/bascula
      'Vas a quedar bien flaca.',                   // flaca
      'No te veas gordito.',                        // gordito
      'Haz una dieta severa esta semana.',          // dieta severa
      'Reduce la grasa corporal ya.',              // reduce la grasa / grasa corporal
      'Cuida tu cintura y tus medidas.',           // cintura / medidas
      'Ya bajaste una talla, sigue.',              // talla
      'Sal a quemar calorias despues.',            // quemar
    ].forEach(debeDescartar);
  });

  it('descarta pese a MAYÚSCULAS y ACENTOS (normalización)', () => {
    debeDescartar('ÁYUNA hoy y no comas.');
    debeDescartar('Baja de PESO rápido.');
    debeDescartar('Salta   la   cena.'); // espacios colapsados
  });

  it('NO bloquea nudges legítimos (anti sobre-filtrado)', () => {
    const okFrases = [
      'Registra tu comida de hoy y te ayudo.',
      'Agrega una grasa saludable como aguacate.',       // 'grasa' sola es válida (marco añadir)
      'Cuentame que comiste y lo cuadro contigo.',        // 'comiste' no es culpa
      'Sigue registrando, vas muy bien esta semana.',     // 'registra' no cae en 'restric'
      'Resalta lo bueno y date una recompensa saludable.',// 'resalta'/'recompensa' NO son saltar/compensar
      'Abre tu coach para ver el detalle del promedio.',  // 'detalle'/'promedio' no caen en talla/medid
      'Suma proteina en la cena de hoy.',                 // 'cena' sola es válida
    ];
    for (const f of okFrases) {
      const r = verificarNudgeIA(f, det);
      expect(r.ok, `NO debería bloquear: "${f}" (motivo=${r.motivo})`).toBe(true);
    }
  });

  it('los 4 cuerpos deterministas de F1 PASAN el post-check (fallback siempre seguro)', () => {
    const cuerpos = [
      'Cuéntame qué comiste y lo cuadro contigo. Un registro rápido mantiene tu día al día.',
      'Vas 60 de 120 g de proteína. Te faltan 60 g; una cena con proteína lo cierra.',
      'Llevas 7 días seguidos registrando. Ese hábito es lo que mueve la aguja. Sigue así.',
      'Esta semana registraste 5/7 días, con un promedio de 1850 kcal al día. Abre tu coach para ver el detalle.',
    ];
    for (const c of cuerpos) expect(verificarNudgeIA(c, c).ok, c).toBe(true);
  });
});

describe('redactar · post-check léxico (re-ataque Nielsen iteración 2)', () => {
  const det = 'Registra tu comida de hoy y te ayudo.';
  const debeDescartar = (frase) => {
    const r = verificarNudgeIA(frase, det);
    expect(r.ok, `debería descartar: "${frase}" (motivo=${r.motivo})`).toBe(false);
  };

  it('#1 ALTO: descarta los bypasses NUEVOS (purga/castigo/imagen corporal/restricción)', () => {
    [
      'Vomita lo que comiste.',            // vomit
      'Aguantate el hambre un rato.',      // aguantate el hambre
      'Haz doble cardio manana.',          // doble cardio
      'Suda lo que comiste hoy.',          // suda lo que
      'Castigate por eso.',                // castig
      'Haz tu penitencia despues.',        // penitencia
      'Cuida tu figura.',                  // figura
      'Baja la panza ya.',                 // panza
      'Marca abdomen esta semana.',        // abdomen
      'Adios lonjas.',                     // lonja
      'Adios rollitos.',                   // rollito
      'Te ves inflado.',                   // inflad
      'Cero carbos por hoy.',              // cero carbo
      'Ni un gramo mas.',                  // ni un gramo
      'Prueba un detox.',                  // detox
      'Quemalo con ejercicio.',            // quemalo con ejercicio
      'Muerete de hambre no.',             // muerete de hambre
      'Vas a pasar hambre.',               // pasar hambre
      'Baja la barriga.',                  // barrig
      'Baja tus medidas corporales.',      // medidas corporales
    ].forEach(debeDescartar);
  });

  it('#2 MEDIO: NO bloquea palabras comunes que antes rompían', () => {
    const okFrases = [
      'A pesar de todo, vas muy bien.',            // 'pesar' ya no es stem
      'En buena medida cumpliste tu meta.',        // 'medid' ya no es stem
      'Te ves atractiva y con energia.',           // 'atractiva' ya no cae en 'atrac'
      // regresión: los que ya pasaban siguen pasando
      'Agrega una grasa saludable.',
      'Suma proteina en la cena.',
      'Sigue registrando, vas bien.',
      'Un plato pesado no; algo ligero.',          // 'pesado' no cae en 'peso'
      'Reposa y sigue asi manana.',                // 'reposa' no cae en 'peso'
      'Que buen desayuno te espera.',
      'Una cena con proteina quita el hambre.',    // 'hambre' a secas es válido
    ];
    for (const f of okFrases) {
      const r = verificarNudgeIA(f, det);
      expect(r.ok, `NO debería bloquear: "${f}" (motivo=${r.motivo})`).toBe(true);
    }
  });
});

describe('redactar · orquestación puliArNudge (gating + costo + fallback)', () => {
  const nudge = { event_type: 'low_protein', titulo: 'T', cuerpo: 'Te faltan 40 g de proteína.' };
  const okText = 'Vamos, te faltan 40 g de proteína; una cena con proteína lo cierra.';
  const mkAnthropic = (text) => ({ messages: { create: vi.fn(async () => ({ content: [{ type: 'text', text }] })) } });

  it('Free → determinista, SIN llamar al modelo ni reservar (0 gasto)', async () => {
    const anthropic = mkAnthropic(okText);
    const reservar = vi.fn(); const reembolsar = vi.fn();
    const r = await puliArNudge({ anthropic, isPro: false, model: 'm', nudge, modo: 'normal', reservar, reembolsar });
    expect(r.via).toBe('determinista');
    expect(r.cuerpo).toBe(nudge.cuerpo);
    expect(anthropic.messages.create).not.toHaveBeenCalled();
    expect(reservar).not.toHaveBeenCalled();
  });

  it('IA apagada (anthropic null) → determinista, sin reservar', async () => {
    const reservar = vi.fn();
    const r = await puliArNudge({ anthropic: null, isPro: true, model: 'm', nudge, modo: 'normal', reservar, reembolsar: vi.fn() });
    expect(r.via).toBe('determinista');
    expect(reservar).not.toHaveBeenCalled();
  });

  it('kill-switch / cap agotado (reserva no permitida) → determinista, SIN llamar al modelo', async () => {
    const anthropic = mkAnthropic(okText);
    const reservar = vi.fn(async () => ({ allowed: false, reason: 'kill_switch' }));
    const r = await puliArNudge({ anthropic, isPro: true, model: 'm', nudge, modo: 'normal', reservar, reembolsar: vi.fn() });
    expect(r.via).toBe('determinista');
    expect(r.motivo).toBe('kill_switch');
    expect(anthropic.messages.create).not.toHaveBeenCalled();
  });

  it('Pro + reserva OK + texto en carril → IA, cifras intactas', async () => {
    const anthropic = mkAnthropic(okText);
    const reservar = vi.fn(async () => ({ allowed: true, reason: 'ok' }));
    const reembolsar = vi.fn();
    const r = await puliArNudge({ anthropic, isPro: true, model: 'm', nudge, modo: 'entrenador', reservar, reembolsar });
    expect(r.via).toBe('ia');
    expect(r.cuerpo).toContain('40'); // cifra del motor intacta
    expect(reembolsar).not.toHaveBeenCalled();
  });

  it('post-check descarta (peso) → determinista + REEMBOLSA', async () => {
    const anthropic = mkAnthropic('Te faltan 40 g de proteína para bajar de peso.');
    const reservar = vi.fn(async () => ({ allowed: true, reason: 'ok' }));
    const reembolsar = vi.fn();
    const r = await puliArNudge({ anthropic, isPro: true, model: 'm', nudge, modo: 'normal', reservar, reembolsar });
    expect(r.via).toBe('determinista');
    expect(r.cuerpo).toBe(nudge.cuerpo);
    expect(reembolsar).toHaveBeenCalledOnce();
  });

  it('post-check descarta (cifra cambiada) → determinista + REEMBOLSA', async () => {
    const anthropic = mkAnthropic('Te faltan 80 g de proteína.'); // 40 -> 80
    const reservar = vi.fn(async () => ({ allowed: true, reason: 'ok' }));
    const reembolsar = vi.fn();
    const r = await puliArNudge({ anthropic, isPro: true, model: 'm', nudge, modo: 'normal', reservar, reembolsar });
    expect(r.via).toBe('determinista');
    expect(reembolsar).toHaveBeenCalledOnce();
  });

  it('Haiku lanza → determinista + REEMBOLSA (nunca rompe la notificación)', async () => {
    const anthropic = { messages: { create: vi.fn(async () => { throw new Error('429'); }) } };
    const reservar = vi.fn(async () => ({ allowed: true, reason: 'ok' }));
    const reembolsar = vi.fn();
    const r = await puliArNudge({ anthropic, isPro: true, model: 'm', nudge, modo: 'normal', reservar, reembolsar });
    expect(r.via).toBe('determinista');
    expect(r.cuerpo).toBe(nudge.cuerpo);
    expect(reembolsar).toHaveBeenCalledOnce();
  });
});
