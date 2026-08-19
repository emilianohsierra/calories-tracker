'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';
import MiProgreso from '@/components/coach/MiProgreso';
import Celebracion from '@/components/coach/Celebracion';
import Mascota, { estadoMascota } from '@/components/coach/Mascota';
import { getGamificacion } from '@/lib/coach/gamificacionClient';

// Sección "HOY" (§22): la SIGUIENTE MEJOR ACCIÓN como héroe + objetivo del día (lista marcable) +
// progreso X/Y + racha + XP/nivel discreto. Estética premium: cards + barras calmadas, coherente
// con dark. La UI NO inventa (todo del backend). Deploy-safe: si no hay datos/flag off → no renderiza.
// onAccion(accion): HOME mapea la acción (registrar / checkin / coach / objetivo / leccion).
export default function HoySection({ onAccion }) {
  const [data, setData] = useState(undefined); // undefined=cargando · null=degrade · objeto=listo
  const [progresoOpen, setProgresoOpen] = useState(false);

  useEffect(() => {
    let vivo = true;
    getGamificacion().then((d) => { if (vivo) setData(d); });
    return () => { vivo = false; };
  }, []);

  if (data === null) return null; // degrada (flag off / sin backend) sin romper HOME
  if (data === undefined) return <HoySkeleton />;

  const acc = data.siguiente_accion;
  const objetivos = Array.isArray(data.objetivo_hoy) ? data.objetivo_hoy : [];
  const prog = data.progreso || { hechas: objetivos.filter((o) => o.hecho).length, total: objetivos.length };
  const pct = prog.total > 0 ? Math.min(prog.hechas / prog.total, 1) : 0;
  const racha = data.racha;
  const xp = data.xp;
  const mascota = estadoMascota(data); // null → no se renderiza (respeta mascota:null del backend)
  const runAccion = (a) => { if (a?.ruta) onAccion?.({ ruta: a.ruta }); else onAccion?.(a); };

  return (
    <section aria-label="Hoy" style={{ marginBottom: 'var(--s4)' }}>
      {/* HÉROE: la siguiente mejor acción */}
      {acc?.titulo && (
        <div className="card" style={{ background: 'linear-gradient(135deg, var(--brand-tint), var(--surface))', border: '1px solid var(--border)', boxShadow: 'var(--shadow-1)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--s2)' }}>
            <p className="c-subtitle" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, margin: '0 0 var(--s1)', color: 'var(--brand-strong)', fontWeight: 700, letterSpacing: '.03em', textTransform: 'uppercase', fontSize: 11 }}>
              <Icon name="sparkles" size={13} /> Tu siguiente paso
            </p>
            {mascota && <Mascota {...mascota} size={48} />}
          </div>
          <h2 className="c-title" style={{ fontSize: 20, lineHeight: '26px', margin: '0 0 var(--s1)' }}>{acc.titulo}</h2>
          {acc.descripcion && <p className="c-body" style={{ margin: 0, color: 'var(--text-2)' }}>{acc.descripcion}</p>}
          {acc.cta?.label && (
            <div style={{ marginTop: 'var(--s3)' }}>
              <button type="button" className="btn btn-primary" onClick={() => runAccion(acc.cta)} style={{ minHeight: 'var(--touch)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {acc.cta.label}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Objetivo de hoy (lista marcable simple) + progreso */}
      {objetivos.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--s2)', marginBottom: 'var(--s2)' }}>
            <span className="c-subtitle" style={{ margin: 0 }}>Tu objetivo de hoy</span>
            <span className="num c-subtitle">{prog.hechas} de {prog.total}</span>
          </div>
          <div role="progressbar" aria-valuenow={prog.hechas} aria-valuemin={0} aria-valuemax={prog.total} aria-label={`${prog.hechas} de ${prog.total} actividades`}
            style={{ height: 6, borderRadius: 'var(--r-pill)', background: 'var(--surface-2)', overflow: 'hidden', marginBottom: 'var(--s3)' }}>
            <div style={{ height: '100%', width: `${pct * 100}%`, background: 'var(--brand)', borderRadius: 'var(--r-pill)', transition: 'width var(--dur-ring) var(--ease-spring)' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s1)' }}>
            {objetivos.map((o) => (o.hecho ? (
              <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)', minHeight: 'var(--touch)', color: 'var(--text-2)' }}>
                <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--ok)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="check" size={14} /></span>
                <span style={{ textDecoration: 'line-through', textDecorationColor: 'var(--text-3)' }}>{o.label}</span>
              </div>
            ) : (
              <button key={o.id} type="button" onClick={() => runAccion(o.accion || o)} aria-label={`${o.label} — pendiente`}
                style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)', minHeight: 'var(--touch)', width: '100%', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text)' }}>
                <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: '50%', border: '2px solid var(--border)', flexShrink: 0 }} />
                <span>{o.label}</span>
              </button>
            )))}
          </div>
        </div>
      )}

      {/* Racha + XP/nivel discreto → abre "Mi progreso" */}
      {(racha || xp) && (
        <button type="button" onClick={() => setProgresoOpen(true)} aria-label="Ver mi progreso"
          style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 'var(--s3)', minHeight: 'var(--touch)', padding: 'var(--s3)', borderRadius: 'var(--r-md)', border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer' }}>
          {racha && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: racha.recuperacion ? 'var(--text-3)' : 'var(--brand-strong)', fontWeight: 600 }}>
              <Icon name="flame" size={16} /> <span className="num">{racha.dias ?? 0}</span>
            </span>
          )}
          {xp && (
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span className="c-subtitle" style={{ color: 'var(--text-2)' }}>Nivel {xp.nivel} · {xp.nombre}</span>
              <span style={{ height: 5, borderRadius: 'var(--r-pill)', background: 'var(--surface-2)', overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', width: `${xp.meta > 0 ? Math.min((xp.xp || 0) / xp.meta, 1) * 100 : 0}%`, background: 'var(--brand)' }} />
              </span>
            </span>
          )}
          <span aria-hidden="true" style={{ color: 'var(--text-3)', display: 'inline-flex' }}><Icon name="chevronRight" size={18} /></span>
        </button>
      )}

      {progresoOpen && <MiProgreso data={data} onClose={() => setProgresoOpen(false)} />}
      {data.celebracion && <Celebracion celebracion={data.celebracion} />}
    </section>
  );
}

function HoySkeleton() {
  return (
    <section aria-busy="true" aria-label="Cargando tu día" style={{ marginBottom: 'var(--s4)' }}>
      <div className="card" style={{ opacity: 0.7 }}>
        <div style={{ height: 14, width: '40%', background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', marginBottom: 8 }} />
        <div style={{ height: 20, width: '75%', background: 'var(--surface-2)', borderRadius: 'var(--r-sm)' }} />
      </div>
    </section>
  );
}
