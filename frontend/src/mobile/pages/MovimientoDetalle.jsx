import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Loader2, Check, Calendar, User, DollarSign,
  AlertTriangle, Trash2, CheckCircle2, TrendingUp,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Detalle de un movimiento + acción "Cerrar movimiento".
 * Cargamos el movimiento desde la lista del registro (no hay GET por id directo
 * en el backend; trae 1 fetch por registro_id y filtramos).
 *
 * PUT /api/movimientos-produccion/:id  con el body completo + fecha_fin + cantidad_recibida.
 * DELETE /api/movimientos-produccion/:id
 */
export const MobileMovimientoDetalle = () => {
  const { id: registroId, movId } = useParams();
  const navigate = useNavigate();

  const [registro, setRegistro] = useState(null);
  const [mov, setMov] = useState(null);
  const [servicios, setServicios] = useState([]);
  const [loading, setLoading] = useState(true);

  // bottom sheets
  const [showCerrar, setShowCerrar] = useState(false);
  const [showAvance, setShowAvance] = useState(false);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [regRes, movRes, srvRes] = await Promise.all([
          axios.get(`${API}/registros/${registroId}`),
          axios.get(`${API}/movimientos-produccion?registro_id=${registroId}&limit=200`),
          axios.get(`${API}/servicios-produccion`).catch(() => ({ data: [] })),
        ]);
        setRegistro(regRes.data);
        const items = movRes.data?.items || movRes.data || [];
        const found = (Array.isArray(items) ? items : []).find(m => m.id === movId);
        setMov(found || null);
        setServicios(Array.isArray(srvRes.data) ? srvRes.data : (srvRes.data?.items || []));
      } catch {
        setMov(null);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [registroId, movId]);

  // ¿El servicio del movimiento usa reporte de avance %?
  const servicioActual = useMemo(
    () => servicios.find(s => s.id === mov?.servicio_id),
    [servicios, mov]
  );
  const usaAvance = !!servicioActual?.usa_avance_porcentaje;

  // Refresca el detalle tras una acción (cerrar/eliminar)
  const refreshMov = async () => {
    try {
      const res = await axios.get(`${API}/movimientos-produccion?registro_id=${registroId}&limit=200`);
      const items = res.data?.items || res.data || [];
      const found = (Array.isArray(items) ? items : []).find(m => m.id === movId);
      setMov(found || null);
    } catch { /* no-op */ }
  };

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>
        <Loader2 className="m-spin" size={32} style={{ margin: '0 auto' }} />
      </div>
    );
  }

  if (!mov) {
    return (
      <>
        <div className="m-header">
          <button className="m-h-icon" onClick={() => navigate(-1)}><ArrowLeft size={18} /></button>
          <div style={{ flex: 1, fontWeight: 600 }}>Movimiento no encontrado</div>
        </div>
        <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: 14 }}>
          No se pudo cargar el movimiento.
        </div>
      </>
    );
  }

  const enviada  = Number(mov.cantidad_enviada || 0);
  const recibida = Number(mov.cantidad_recibida ?? mov.cantidad ?? 0);
  const diff     = Math.max(0, enviada - recibida);
  const cerrado  = !!mov.fecha_fin;
  const enProgreso = mov.fecha_inicio && !mov.fecha_fin;
  const pct = enviada > 0 ? Math.min(100, Math.round((recibida / enviada) * 100)) : 0;

  return (
    <>
      <div className="m-header">
        <button className="m-h-icon" onClick={() => navigate(-1)}><ArrowLeft size={18} /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {registro?.modelo_nombre || registro?.modelo_manual?.nombre_modelo || mov.servicio_nombre || '—'}
          </div>
          <div style={{
            fontSize: 11, opacity: 0.85, marginTop: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {registro?.n_corte}
            {' · '}{mov.servicio_nombre || 'Movimiento'}
            {' · '}detalle
          </div>
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Card resumen */}
        <div className="m-card" style={{
          background: cerrado ? '#f0fdf4' : enProgreso ? '#f0fdfa' : 'white',
          borderColor: cerrado ? '#86efac' : enProgreso ? '#5eead4' : '#e5e7eb',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{mov.servicio_nombre || '—'}</div>
              <div style={{
                fontSize: 12, color: '#475569', marginTop: 4,
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <User size={11} />
                {mov.persona_nombre || '—'}
                {mov.persona_tipo && <span style={{ color: '#94a3b8' }}>· {mov.persona_tipo}</span>}
              </div>
            </div>
            <EstadoBadge cerrado={cerrado} enProgreso={enProgreso} />
          </div>

          {/* Cantidades en grid */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
            marginTop: 12, paddingTop: 12,
            borderTop: `1px solid ${cerrado ? '#bbf7d0' : enProgreso ? '#99f6e4' : '#f1f5f9'}`,
            textAlign: 'center',
          }}>
            <Cant label="Enviadas" value={enviada} />
            <Cant label="Recibidas" value={recibida} highlight={enProgreso} />
            <Cant
              label={enProgreso ? 'Pendientes' : 'Merma'}
              value={enProgreso ? (enviada - recibida) : diff}
              color={enProgreso ? '#b45309' : (diff > 0 ? '#b91c1c' : '#94a3b8')}
            />
          </div>

          {/* Barra avance */}
          {enProgreso && (
            <div style={{ marginTop: 10 }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                fontSize: 10, color: '#64748b', marginBottom: 4,
              }}>
                <span>Avance</span>
                <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600 }}>{pct}%</span>
              </div>
              <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  width: `${pct}%`, height: '100%',
                  background: 'var(--m-brand)', transition: 'width .3s',
                }} />
              </div>
            </div>
          )}
        </div>

        {/* Datos */}
        <div className="m-card" style={{ padding: 0 }}>
          <Row icon={<Calendar size={14} />} k="Fecha inicio" v={fmtFecha(mov.fecha_inicio)} />
          {mov.fecha_esperada_movimiento && !cerrado && (
            <Row k="Fecha esperada fin" v={fmtFecha(mov.fecha_esperada_movimiento)} />
          )}
          {mov.fecha_fin && (
            <Row k="Fecha fin real" v={fmtFecha(mov.fecha_fin)} highlight />
          )}
          <Row icon={<DollarSign size={14} />} k="Tarifa aplicada"
            v={`S/. ${Number(mov.tarifa_aplicada || 0).toFixed(2)} / prenda`} />
          <Row k="Costo calculado"
            v={`S/. ${Number(mov.costo_calculado || 0).toFixed(2)}`}
            valueColor="var(--m-brand)" mono last />
        </div>

        {/* Observaciones */}
        {mov.observaciones && (
          <div>
            <span className="m-label-xs">Observaciones</span>
            <div className="m-card" style={{ marginTop: 6, fontSize: 13, color: '#475569' }}>
              {mov.observaciones}
            </div>
          </div>
        )}

        {/* Avance % actual (si aplica) */}
        {usaAvance && enProgreso && (
          <div className="m-card" style={{ background: '#f0fdfa', borderColor: '#5eead4' }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              fontSize: 12, color: 'var(--m-brand)',
            }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                <TrendingUp size={14} /> Avance reportado
              </span>
              <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, fontSize: 18 }}>
                {mov.avance_porcentaje != null ? `${mov.avance_porcentaje}%` : 'sin reporte'}
              </span>
            </div>
            <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden', marginTop: 8 }}>
              <div style={{
                width: `${Math.min(100, Number(mov.avance_porcentaje) || 0)}%`,
                height: '100%', background: 'var(--m-brand)', transition: 'width .3s',
              }} />
            </div>
          </div>
        )}

        {/* Acciones */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {/* Reportar avance (solo si el servicio usa avance %) */}
          {usaAvance && enProgreso && (
            <button
              className="m-btn m-btn-outline"
              style={{ borderColor: 'var(--m-brand)', color: 'var(--m-brand)' }}
              onClick={() => setShowAvance(true)}
            >
              <TrendingUp size={18} />
              Reportar avance
            </button>
          )}

          {/* Cerrar (solo si está en curso) */}
          {enProgreso && (
            <button
              className="m-btn m-btn-primary"
              onClick={() => setShowCerrar(true)}
            >
              <CheckCircle2 size={18} />
              Cerrar movimiento
            </button>
          )}

          {/* Eliminar */}
          <button
            className="m-btn m-btn-outline"
            style={{ borderColor: '#fca5a5', color: '#b91c1c' }}
            onClick={async () => {
              if (!window.confirm('¿Eliminar este movimiento? La acción no se puede deshacer.')) return;
              try {
                await axios.delete(`${API}/movimientos-produccion/${movId}`);
                navigate(-1);
              } catch (e) {
                const detail = e?.response?.data?.detail || 'Error al eliminar';
                alert(typeof detail === 'string' ? detail : 'Error al eliminar');
              }
            }}
          >
            <Trash2 size={16} />
            Eliminar movimiento
          </button>
        </div>
      </div>

      {showCerrar && (
        <CerrarMovSheet
          mov={mov}
          onClose={() => setShowCerrar(false)}
          onCerrado={async () => {
            setShowCerrar(false);
            await refreshMov();
          }}
        />
      )}

      {showAvance && (
        <AvanceMovSheet
          mov={mov}
          onClose={() => setShowAvance(false)}
          onGuardado={async () => {
            setShowAvance(false);
            await refreshMov();
          }}
        />
      )}
    </>
  );
};

/* ─────── Componentes auxiliares ─────── */
const EstadoBadge = ({ cerrado, enProgreso }) => {
  if (cerrado) {
    return <span className="m-pill m-pill-green"><Check size={10} /> cerrado</span>;
  }
  if (enProgreso) {
    return <span className="m-pill m-pill-blue">en curso</span>;
  }
  return <span className="m-pill m-pill-gray">programado</span>;
};

const Cant = ({ label, value, highlight = false, color }) => (
  <div style={highlight ? {
    background: 'var(--m-brand-soft)', borderRadius: 8, padding: 6,
  } : {}}>
    <div style={{
      fontSize: 10, textTransform: 'uppercase', fontWeight: 600,
      color: highlight ? 'var(--m-brand)' : '#64748b',
    }}>
      {label}
    </div>
    <div style={{
      fontFamily: 'ui-monospace, monospace', fontWeight: 700, fontSize: 18,
      color: highlight ? 'var(--m-brand)' : (color || 'inherit'),
    }}>
      {value || '—'}
    </div>
  </div>
);

const Row = ({ icon, k, v, highlight = false, valueColor, mono = false, last = false }) => (
  <div style={{
    padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    borderBottom: last ? 0 : '1px solid #f1f5f9',
    background: highlight ? '#f0fdf4' : 'transparent',
    fontSize: 13,
  }}>
    <span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {icon}{k}
    </span>
    <span style={{
      fontWeight: 600,
      color: valueColor || '#0f172a',
      fontFamily: mono ? 'ui-monospace, monospace' : 'inherit',
    }}>
      {v}
    </span>
  </div>
);

/* ─────── Bottom sheet: cerrar movimiento ─────── */
const CerrarMovSheet = ({ mov, onClose, onCerrado }) => {
  const enviada = Number(mov.cantidad_enviada || 0);
  // default: recibidas = enviadas (caso ideal, sin merma)
  const [recibidas, setRecibidas] = useState(enviada);
  const [fechaFin, setFechaFin] = useState(hoyISO());
  const [observaciones, setObservaciones] = useState(mov.observaciones || '');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const merma = Math.max(0, enviada - Number(recibidas));
  const recibidasNum = Number(recibidas);
  const valido = recibidasNum >= 0 && recibidasNum <= enviada && fechaFin;

  const confirmar = async () => {
    if (!valido) return;
    setEnviando(true);
    setError('');
    try {
      // PUT requiere el body completo del movimiento
      await axios.put(`${API}/movimientos-produccion/${mov.id}`, {
        registro_id: mov.registro_id,
        servicio_id: mov.servicio_id,
        persona_id: mov.persona_id,
        cantidad_enviada: enviada,
        cantidad_recibida: recibidasNum,
        fecha_inicio: mov.fecha_inicio,
        fecha_fin: fechaFin,
        fecha_esperada_movimiento: mov.fecha_esperada_movimiento || undefined,
        observaciones: observaciones.trim(),
        tarifa_aplicada: Number(mov.tarifa_aplicada || 0),
      });
      onCerrado();
    } catch (e) {
      const detail = e?.response?.data?.detail || 'Error al cerrar el movimiento';
      setError(typeof detail === 'string' ? detail : 'Error al cerrar el movimiento');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        zIndex: 100, display: 'flex', alignItems: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white', width: '100%',
          borderTopLeftRadius: 20, borderTopRightRadius: 20,
          padding: '8px 16px 20px', maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        <div style={{
          width: 40, height: 4, background: '#cbd5e1', borderRadius: 2,
          margin: '0 auto 12px',
        }} />
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
          Cerrar movimiento
        </div>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
          {mov.servicio_nombre} · {mov.persona_nombre}
        </div>

        {/* Resumen */}
        <div className="m-card" style={{ background: '#f8fafc', padding: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ color: '#64748b' }}>Enviadas</span>
            <strong style={{ fontFamily: 'ui-monospace, monospace' }}>{enviada}</strong>
          </div>
        </div>

        {/* Cantidad recibida */}
        <div style={{ marginBottom: 12 }}>
          <span className="m-label-xs">Cantidad recibida (final)</span>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginTop: 8, justifyContent: 'center',
          }}>
            <button
              className="m-btn m-btn-outline"
              style={{ width: 48, padding: 0, fontSize: 22 }}
              onClick={() => setRecibidas(Math.max(0, Number(recibidas) - 1))}
            >−</button>
            <input
              type="number" className="m-input"
              value={recibidas}
              onChange={(e) => setRecibidas(Number(e.target.value) || 0)}
              style={{
                maxWidth: 120, textAlign: 'center', fontSize: 22, fontWeight: 700,
                ...(recibidasNum > enviada ? { borderColor: '#dc2626', color: '#dc2626' } : {}),
              }}
            />
            <button
              className="m-btn m-btn-outline"
              style={{ width: 48, padding: 0, fontSize: 22 }}
              onClick={() => setRecibidas(Math.min(enviada, Number(recibidas) + 1))}
            >+</button>
          </div>
          <div style={{
            display: 'flex', justifyContent: 'center', gap: 6,
            marginTop: 8, flexWrap: 'wrap',
          }}>
            <button
              className="m-chip"
              style={{ fontSize: 11, minHeight: 30, padding: '4px 10px' }}
              onClick={() => setRecibidas(enviada)}
            >
              Todo OK ({enviada})
            </button>
            <button
              className="m-chip"
              style={{ fontSize: 11, minHeight: 30, padding: '4px 10px' }}
              onClick={() => setRecibidas(0)}
            >
              Nada recibido
            </button>
          </div>
        </div>

        {/* Merma preview */}
        {merma > 0 && (
          <div style={{
            background: '#fef3c7', border: '1px solid #fcd34d',
            color: '#92400e', borderRadius: 12, padding: '10px 12px',
            fontSize: 13, marginBottom: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={14} />
              Merma calculada
            </span>
            <strong style={{ fontFamily: 'ui-monospace, monospace' }}>
              {merma} prenda{merma !== 1 ? 's' : ''}
            </strong>
          </div>
        )}

        {recibidasNum > enviada && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fca5a5',
            color: '#b91c1c', borderRadius: 12, padding: '10px 12px',
            fontSize: 12, marginBottom: 12,
          }}>
            No puedes recibir más de lo enviado ({enviada}).
          </div>
        )}

        {/* Fecha fin */}
        <div style={{ marginBottom: 12 }}>
          <span className="m-label-xs">Fecha fin</span>
          <input
            type="date" className="m-input"
            style={{ marginTop: 6 }}
            value={fechaFin}
            onChange={(e) => setFechaFin(e.target.value)}
            max={hoyISO()}
          />
        </div>

        {/* Observaciones */}
        <div style={{ marginBottom: 12 }}>
          <span className="m-label-xs">Observaciones (opcional)</span>
          <textarea
            rows={2} className="m-input"
            style={{ padding: 12, marginTop: 6, resize: 'vertical', fontFamily: 'inherit' }}
            placeholder="Ej: 2 prendas con defecto..."
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
          />
        </div>

        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fca5a5',
            color: '#b91c1c', borderRadius: 12, padding: 10, fontSize: 13,
            marginBottom: 12,
          }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="m-btn m-btn-outline" style={{ flex: 1 }} onClick={onClose}>
            Cancelar
          </button>
          <button
            className="m-btn m-btn-primary"
            style={{ flex: 2 }}
            disabled={!valido || enviando}
            onClick={confirmar}
          >
            {enviando
              ? <><Loader2 className="m-spin" size={18} /> Cerrando...</>
              : <><Check size={18} /> Confirmar cierre</>}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ─────── Bottom sheet: reportar avance % ─────── */
const AvanceMovSheet = ({ mov, onClose, onGuardado }) => {
  const [pct, setPct] = useState(Number(mov.avance_porcentaje) || 0);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const guardar = async () => {
    setEnviando(true);
    setError('');
    try {
      await axios.put(
        `${API}/reportes-produccion/costura/avance/${mov.id}`,
        { avance_porcentaje: Number(pct) }
      );
      onGuardado();
    } catch (e) {
      const detail = e?.response?.data?.detail || 'Error al reportar avance';
      setError(typeof detail === 'string' ? detail : 'Error al reportar avance');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        zIndex: 100, display: 'flex', alignItems: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white', width: '100%',
          borderTopLeftRadius: 20, borderTopRightRadius: 20,
          padding: '8px 16px 20px', maxHeight: '85vh', overflowY: 'auto',
        }}
      >
        <div style={{ width: 40, height: 4, background: '#cbd5e1', borderRadius: 2, margin: '0 auto 12px' }} />
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
          Reportar avance
        </div>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
          {mov.servicio_nombre} · {mov.persona_nombre}
        </div>

        {/* Display porcentaje grande */}
        <div style={{
          textAlign: 'center', margin: '16px 0 24px',
          fontFamily: 'ui-monospace, monospace', fontWeight: 700,
          fontSize: 48, color: 'var(--m-brand)', lineHeight: 1,
        }}>
          {pct}<span style={{ fontSize: 24, color: '#94a3b8' }}>%</span>
        </div>

        {/* Slider */}
        <input
          type="range" min="0" max="100" step="5"
          value={pct}
          onChange={(e) => setPct(Number(e.target.value))}
          style={{
            width: '100%', height: 8, accentColor: 'var(--m-brand)',
            marginBottom: 12,
          }}
        />

        {/* Chips de atajo */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6,
          marginBottom: 16,
        }}>
          {[25, 50, 75, 100].map(n => (
            <button
              key={n}
              className={`m-chip ${pct === n ? 'active' : ''}`}
              style={{ fontSize: 12, minHeight: 36, padding: '6px 0', justifyContent: 'center' }}
              onClick={() => setPct(n)}
            >
              {n}%
            </button>
          ))}
        </div>

        {/* Cantidad implícita */}
        <div className="m-card" style={{ background: '#f8fafc', padding: 10, marginBottom: 12 }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', fontSize: 13,
          }}>
            <span style={{ color: '#64748b' }}>Equivale a aprox.</span>
            <strong style={{ fontFamily: 'ui-monospace, monospace' }}>
              {Math.round((Number(mov.cantidad_enviada || 0) * pct) / 100)}
              {' '}/ {Number(mov.cantidad_enviada || 0)} prendas
            </strong>
          </div>
        </div>

        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fca5a5',
            color: '#b91c1c', borderRadius: 12, padding: 10, fontSize: 13,
            marginBottom: 12,
          }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="m-btn m-btn-outline" style={{ flex: 1 }} onClick={onClose}>
            Cancelar
          </button>
          <button
            className="m-btn m-btn-primary"
            style={{ flex: 2 }}
            onClick={guardar}
            disabled={enviando}
          >
            {enviando
              ? <><Loader2 className="m-spin" size={18} /> Guardando...</>
              : <><Check size={18} /> Guardar avance</>}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ─────── Helpers ─────── */
function fmtFecha(iso) {
  if (!iso) return '—';
  const s = String(iso);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  return s;
}
function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export default MobileMovimientoDetalle;
