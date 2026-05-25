import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Loader2, Plus, Check, Clock, User, Calendar,
  AlertCircle, Copy,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Lista de movimientos de un registro.
 * GET /api/movimientos-produccion?registro_id=X
 * Muestra:
 *   - Resumen de ruta (cuántos cerrados / en curso / pendientes)
 *   - Lista de cards por movimiento con estado visual
 *   - Cantidad efectiva al pie (última recibida o última enviada)
 */
export const MobileMovimientosRegistro = () => {
  const { id: registroId } = useParams();
  const navigate = useNavigate();

  const [registro, setRegistro] = useState(null);
  const [movimientos, setMovimientos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [regRes, movRes] = await Promise.all([
          axios.get(`${API}/registros/${registroId}`),
          axios.get(`${API}/movimientos-produccion?registro_id=${registroId}&limit=200`),
        ]);
        setRegistro(regRes.data);
        const items = movRes.data?.items || movRes.data || [];
        setMovimientos(Array.isArray(items) ? items : []);
      } catch {
        setMovimientos([]);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [registroId]);

  // El "activo" sigue la misma lógica que RegistroMovimientosCard del desktop:
  //  1) Movimiento en progreso (fecha_inicio sin fecha_fin)
  //  2) Más reciente por fecha_fin
  //  3) Más reciente por fecha_inicio
  //  4) Si nada de eso, el primero (backend devuelve DESC por created_at)
  const movActivoId = useMemo(() => {
    if (movimientos.length === 0) return null;
    const inProgress = movimientos.find(m => m.fecha_inicio && !m.fecha_fin);
    if (inProgress) return inProgress.id;
    let bestId = movimientos[0]?.id || null;
    let bestDate = '';
    movimientos.forEach(m => {
      const d = m.fecha_fin || m.fecha_inicio || '';
      if (d && d > bestDate) { bestDate = d; bestId = m.id; }
    });
    return bestId;
  }, [movimientos]);

  // Lista re-ordenada: el activo va primero, el resto en su orden original (DESC por created_at)
  const movimientosOrdenados = useMemo(() => {
    if (!movActivoId) return movimientos;
    const activo = movimientos.find(m => m.id === movActivoId);
    const resto = movimientos.filter(m => m.id !== movActivoId);
    return activo ? [activo, ...resto] : movimientos;
  }, [movimientos, movActivoId]);

  // Resumen
  const cerrados = movimientos.filter(m => m.fecha_fin).length;
  const enCurso = movimientos.filter(m => m.fecha_inicio && !m.fecha_fin).length;
  const total = movimientos.length;

  // Cantidad efectiva = cantidad_recibida del activo, o cantidad_enviada si aún no recibió
  const movActivo = movimientos.find(m => m.id === movActivoId) || null;
  const cantidadEfectiva = movActivo
    ? Number(movActivo.cantidad_recibida ?? movActivo.cantidad ?? movActivo.cantidad_enviada ?? 0)
    : null;

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>
        <Loader2 className="m-spin" size={32} style={{ margin: '0 auto' }} />
      </div>
    );
  }

  return (
    <>
      <div className="m-header">
        <button className="m-h-icon" onClick={() => navigate(-1)} aria-label="Volver">
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {registro?.modelo_nombre || registro?.modelo_manual?.nombre_modelo || '—'}
          </div>
          <div style={{
            fontSize: 11, opacity: 0.85, marginTop: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {registro?.n_corte} · Movimientos · {total}
          </div>
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Resumen de avance por ruta */}
        {total > 0 && (
          <div className="m-card" style={{ background: '#f8fafc' }}>
            <div className="m-label-xs" style={{ marginBottom: 6 }}>Avance por servicios</div>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, textAlign: 'center',
            }}>
              <KPI value={cerrados} label="Cerrados" color="#15803d" />
              <KPI value={enCurso} label="En curso" color="#0f766e" />
              <KPI value={total - cerrados - enCurso} label="Programados" color="#64748b" />
            </div>
          </div>
        )}

        {/* CTA nuevo movimiento */}
        <Link
          to={`/m/registros/${registroId}/nuevo-movimiento`}
          className="m-btn m-btn-primary"
          style={{ textDecoration: 'none' }}
        >
          <Plus size={18} /> Nuevo movimiento
        </Link>

        {/* Lista de movimientos */}
        {total === 0 ? (
          <div className="m-card" style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>
            <Clock size={36} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
            <p style={{ margin: 0, fontSize: 14 }}>
              Sin movimientos aún. Crea el primero con el botón de arriba.
            </p>
          </div>
        ) : (
          movimientosOrdenados.map(m => (
            <MovimientoCard
              key={m.id}
              m={m}
              isActivo={m.id === movActivoId}
            />
          ))
        )}

        {/* Cantidad efectiva */}
        {cantidadEfectiva !== null && (
          <div className="m-card" style={{
            background: '#f1f5f9',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginTop: 8,
          }}>
            <div>
              <div style={{
                fontSize: 10, color: '#64748b', textTransform: 'uppercase',
                fontWeight: 600, letterSpacing: '.05em',
              }}>Cantidad efectiva actual</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>
                Último movimiento {movActivo?.fecha_fin ? 'cerrado' : 'activo'}
              </div>
            </div>
            <div style={{
              fontFamily: 'ui-monospace, monospace', fontWeight: 700,
              fontSize: 24, color: 'var(--m-brand)',
            }}>
              {cantidadEfectiva}
            </div>
          </div>
        )}
      </div>
    </>
  );
};

const KPI = ({ value, label, color }) => (
  <div>
    <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
    <div style={{
      fontSize: 9, color: '#64748b', textTransform: 'uppercase',
      fontWeight: 600, letterSpacing: '.03em',
    }}>
      {label}
    </div>
  </div>
);

/* ───────── Card de un movimiento ───────── */
const MovimientoCard = ({ m, isActivo }) => {
  const enviada  = Number(m.cantidad_enviada || 0);
  const recibida = Number(m.cantidad_recibida ?? m.cantidad ?? 0);
  const diff     = Math.max(0, enviada - recibida);
  const cerrado  = !!m.fecha_fin;
  const enProgreso = m.fecha_inicio && !m.fecha_fin;
  const pct = enviada > 0 ? Math.min(100, Math.round((recibida / enviada) * 100)) : 0;

  // Estado visual
  const estado = cerrado ? 'cerrado'
                : enProgreso ? 'en_curso'
                : 'programado';

  const cfg = {
    cerrado:    { color: '#15803d', bg: '#f0fdf4', border: '#86efac', label: 'cerrado',    icon: <Check size={10} /> },
    en_curso:   { color: '#0f766e', bg: '#f0fdfa', border: '#5eead4', label: 'en curso',   icon: <Clock size={10} /> },
    programado: { color: '#64748b', bg: 'white',   border: '#e5e7eb', label: 'programado', icon: null },
  }[estado];

  return (
    <Link
      to={`/m/registros/${m.registro_id}/movimientos/${m.id}`}
      className="m-card m-card-tap"
      style={{
        background: cfg.bg,
        borderColor: cfg.border,
        textDecoration: 'none', color: 'inherit', display: 'block',
        ...(isActivo && enProgreso
          ? { boxShadow: 'inset 0 0 0 2px var(--m-brand)' }
          : {}),
        opacity: estado === 'programado' ? 0.7 : 1,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{m.servicio_nombre || '—'}</span>
            <span className={`m-pill ${
              estado === 'cerrado'    ? 'm-pill-green'
              : estado === 'en_curso' ? 'm-pill-blue'
              : 'm-pill-gray'
            }`}>
              {cfg.icon}{cfg.label}
            </span>
            {isActivo && enProgreso && (
              <span className="m-pill" style={{ background: 'var(--m-brand)', color: 'white' }}>
                ACTIVO
              </span>
            )}
          </div>
          {m.persona_nombre && (
            <div style={{
              fontSize: 12, color: '#475569', marginTop: 2,
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <User size={11} />
              <span style={{
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{m.persona_nombre}</span>
              {m.persona_tipo && (
                <span style={{ color: '#94a3b8', fontSize: 11 }}>· {m.persona_tipo}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Cantidades */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
        marginTop: 10, paddingTop: 10,
        borderTop: `1px solid ${cfg.border}`,
        textAlign: 'center',
      }}>
        <div>
          <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
            Enviadas
          </div>
          <div style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, fontSize: 14 }}>
            {enviada}
          </div>
        </div>
        <div style={enProgreso ? {
          background: 'var(--m-brand-soft)', borderRadius: 8, padding: 4,
        } : {}}>
          <div style={{
            fontSize: 9, textTransform: 'uppercase', fontWeight: 600,
            color: enProgreso ? 'var(--m-brand)' : '#64748b',
          }}>
            Recibidas
          </div>
          <div style={{
            fontFamily: 'ui-monospace, monospace', fontWeight: 700, fontSize: 14,
            color: enProgreso ? 'var(--m-brand)' : 'inherit',
          }}>
            {recibida}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
            {enProgreso ? 'Pendientes' : 'Merma'}
          </div>
          <div style={{
            fontFamily: 'ui-monospace, monospace', fontWeight: 700, fontSize: 14,
            color: enProgreso
              ? (enviada - recibida > 0 ? '#b45309' : '#94a3b8')
              : (diff > 0 ? '#b91c1c' : '#94a3b8'),
          }}>
            {enProgreso ? (enviada - recibida) || '—' : (diff || '—')}
          </div>
        </div>
      </div>

      {/* Barra avance (solo si en curso) */}
      {enProgreso && (
        <div style={{ marginTop: 8 }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b',
            marginBottom: 4,
          }}>
            <span>Avance</span>
            <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600 }}>{pct}%</span>
          </div>
          <div style={{ height: 4, background: '#e2e8f0', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              width: `${pct}%`, height: '100%',
              background: 'var(--m-brand)', transition: 'width .3s',
            }} />
          </div>
        </div>
      )}

      {/* Fechas + costo */}
      <div style={{
        marginTop: 10, paddingTop: 8,
        borderTop: `1px solid ${cfg.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontSize: 11, color: '#64748b',
      }}>
        <span style={{
          fontFamily: 'ui-monospace, monospace',
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
          <Calendar size={11} />
          {fmtFechaCorta(m.fecha_inicio)}
          {m.fecha_fin && <> → {fmtFechaCorta(m.fecha_fin)}</>}
          {!m.fecha_fin && m.fecha_esperada_movimiento && <> · esp. {fmtFechaCorta(m.fecha_esperada_movimiento)}</>}
        </span>
        {(m.costo_calculado || 0) > 0 && (
          <span style={{
            fontFamily: 'ui-monospace, monospace', fontWeight: 600,
            color: cerrado ? '#15803d' : 'var(--m-brand)',
          }}>
            S/. {Number(m.costo_calculado).toFixed(2)}
          </span>
        )}
      </div>

      {/* Observaciones */}
      {m.observaciones && (
        <div style={{
          marginTop: 8, fontSize: 12, color: '#475569',
          background: 'rgba(255,255,255,0.6)', borderRadius: 8, padding: '6px 10px',
        }}>
          <span style={{ fontWeight: 600 }}>Obs:</span> {m.observaciones}
        </div>
      )}
    </Link>
  );
};

/* ───────── Helpers ───────── */
function fmtFechaCorta(iso) {
  if (!iso) return '—';
  const s = String(iso);
  // YYYY-MM-DD → DD/MM
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split('-');
    return `${d}/${m}`;
  }
  return s;
}

export default MobileMovimientosRegistro;
