import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Loader2, FlaskConical, Clock, Check, X,
  AlertCircle, Send, Plus, ArrowDownToLine, AlertTriangle,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Muestras enviadas a lavandería para este registro.
 *   GET /api/registros/:id/muestras-lavanderia
 * Solo consulta.
 */
export const MobileMuestrasLavanderia = () => {
  const { id: registroId } = useParams();
  const navigate = useNavigate();

  const [registro, setRegistro] = useState(null);
  const [muestras, setMuestras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [retornoDe, setRetornoDe] = useState(null);

  const cargarMuestras = async () => {
    try {
      const res = await axios.get(`${API}/registros/${registroId}/muestras-lavanderia`);
      setMuestras(Array.isArray(res.data) ? res.data : []);
    } catch {
      setMuestras([]);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const [regRes] = await Promise.all([
          axios.get(`${API}/registros/${registroId}`),
          cargarMuestras(),
        ]);
        setRegistro(regRes.data);
      } finally {
        setLoading(false);
      }
    })();
  }, [registroId]);

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>
        <Loader2 className="m-spin" size={32} style={{ margin: '0 auto' }} />
      </div>
    );
  }

  const total = muestras.reduce((s, m) => s + Number(m.cantidad_total || 0), 0);

  return (
    <>
      <div className="m-header">
        <button className="m-h-icon" onClick={() => navigate(-1)} aria-label="Volver">
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 600, fontSize: 15, lineHeight: 1.2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {registro?.modelo_nombre || registro?.modelo_manual?.nombre_modelo || 'Muestras'}
          </div>
          <div style={{
            fontSize: 11, opacity: 0.85, marginTop: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {registro?.n_corte} · Muestras a lavandería
          </div>
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Botón crear muestra */}
        <Link
          to={`/m/registros/${registroId}/nueva-muestra-lavanderia`}
          className="m-btn m-btn-primary"
          style={{ textDecoration: 'none', minHeight: 44 }}
        >
          <Plus size={18} /> Nueva muestra a lavandería
        </Link>

        {muestras.length === 0 ? (
          <div className="m-card" style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>
            <FlaskConical size={36} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
            <p style={{ margin: 0, fontSize: 14 }}>
              No se han enviado muestras a lavandería en este corte.
            </p>
          </div>
        ) : (
          <>
            {/* Resumen */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8,
              padding: 12, background: 'var(--m-brand-soft)', borderRadius: 12,
              textAlign: 'center',
            }}>
              <ResumenItem label="Envíos" value={muestras.length} />
              <ResumenItem label="Total prendas" value={total.toLocaleString('es-PE')} mono />
            </div>

            <div className="m-label-xs" style={{ marginTop: 4 }}>Historial de envíos</div>

            {muestras.map(m => (
              <MuestraCard
                key={m.id}
                muestra={m}
                onMarcarRetorno={() => setRetornoDe(m)}
              />
            ))}
          </>
        )}
      </div>

      {/* Bottom sheet: marcar retorno */}
      {retornoDe && (
        <MarcarRetornoSheet
          muestra={retornoDe}
          onClose={() => setRetornoDe(null)}
          onDone={async () => { setRetornoDe(null); await cargarMuestras(); }}
        />
      )}
    </>
  );
};

const MuestraCard = ({ muestra, onMarcarRetorno }) => {
  const estCfg = estadoCfg(muestra.estado);
  const StateIcon = estCfg.Icon;
  const puedeMarcarRetorno = muestra.estado === 'enviada' && !muestra.fecha_retorno;

  return (
    <div className="m-card" style={{ borderColor: estCfg.border }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: 10, color: '#64748b', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '.04em',
          }}>
            Enviado · {fmtFecha(muestra.fecha_envio)}
          </div>
          <div style={{ fontWeight: 700, fontSize: 14, marginTop: 4 }}>
            {Number(muestra.cantidad_total || 0)} pza{Number(muestra.cantidad_total) !== 1 ? 's' : ''}
            {muestra.lavanderia_nombre
              ? <span style={{ color: '#64748b', fontWeight: 500 }}> · {muestra.lavanderia_nombre}</span>
              : null}
          </div>
          {muestra.fecha_retorno && (
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              Retornó {fmtFecha(muestra.fecha_retorno)}
            </div>
          )}
        </div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 10, fontWeight: 700, padding: '4px 8px',
          borderRadius: 999, letterSpacing: '.02em',
          background: estCfg.bg, color: estCfg.fg,
          textTransform: 'uppercase', flexShrink: 0,
        }}>
          {StateIcon && <StateIcon size={11} />}
          {estCfg.label}
        </span>
      </div>

      {/* Colores */}
      {Array.isArray(muestra.colores) && muestra.colores.length > 0 && (
        <div style={{
          marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          {muestra.colores.map(c => {
            const dec = decisionCfg(c.decision);
            const DecIcon = dec.Icon;
            return (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 12,
              }}>
                <span style={{ flex: 1, minWidth: 0, color: '#0f172a', fontWeight: 600 }}>
                  {c.color_nombre || '—'}
                </span>
                <span style={{
                  fontFamily: 'ui-monospace, monospace',
                  color: '#475569', fontWeight: 600,
                }}>
                  {Number(c.cantidad || 0)} pza{Number(c.cantidad) !== 1 ? 's' : ''}
                </span>
                {c.decision && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 3,
                    fontSize: 10, fontWeight: 700, padding: '2px 6px',
                    borderRadius: 999, letterSpacing: '.02em',
                    background: dec.bg, color: dec.fg,
                    textTransform: 'uppercase',
                  }}>
                    {DecIcon && <DecIcon size={10} />}
                    {dec.label}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Observación */}
      {muestra.observaciones && (
        <div style={{
          marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9',
          fontSize: 12, color: '#475569', fontStyle: 'italic',
        }}>
          “{muestra.observaciones}”
        </div>
      )}

      {/* Botón marcar retorno */}
      {puedeMarcarRetorno && (
        <button
          onClick={onMarcarRetorno}
          className="m-btn m-btn-outline"
          style={{
            width: '100%', marginTop: 10,
            borderColor: 'var(--m-brand)', color: 'var(--m-brand)',
            minHeight: 40, fontSize: 13,
          }}
        >
          <ArrowDownToLine size={14} /> Marcar retorno de lavandería
        </button>
      )}
    </div>
  );
};

/* ──────── Bottom sheet: Marcar retorno ──────── */
const MarcarRetornoSheet = ({ muestra, onClose, onDone }) => {
  const [fechaRetorno, setFechaRetorno] = useState(hoyISO());
  const [observaciones, setObservaciones] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const confirmar = async () => {
    setError('');
    if (!fechaRetorno) return setError('Indica la fecha de retorno');
    setEnviando(true);
    try {
      await axios.put(`${API}/muestras-lavanderia/${muestra.id}/retorno`, {
        fecha_retorno: fechaRetorno,
        observaciones: observaciones.trim() || undefined,
      });
      onDone();
    } catch (e) {
      const det = e?.response?.data?.detail || 'Error al marcar el retorno';
      setError(typeof det === 'string' ? det : String(det));
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
          padding: '12px 20px 24px', maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        <div style={{ width: 40, height: 4, background: '#cbd5e1', borderRadius: 2, margin: '0 auto 14px' }} />

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>Marcar retorno</div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
            Envío del {fmtFecha(muestra.fecha_envio)} · {Number(muestra.cantidad_total || 0)} pzs
            {muestra.lavanderia_nombre ? ` · ${muestra.lavanderia_nombre}` : ''}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <span className="m-label-xs">Fecha de retorno</span>
          <input
            type="date"
            className="m-input"
            value={fechaRetorno}
            onChange={(e) => setFechaRetorno(e.target.value)}
            style={{ marginTop: 8, fontSize: 14 }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <span className="m-label-xs">Observación (opcional)</span>
          <textarea
            rows={2}
            className="m-input"
            placeholder="Ej: Llegaron 9 de 10 — falta 1 azul..."
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            style={{ padding: 12, marginTop: 8, fontFamily: 'inherit', resize: 'vertical' }}
          />
        </div>

        <div style={{
          background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 12,
          padding: 10, fontSize: 11, color: '#475569', lineHeight: 1.5,
          display: 'flex', gap: 8, alignItems: 'flex-start',
          marginBottom: 14,
        }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            La decisión por color (aprobado/rechazado) y las correcciones
            se asignan desde la versión web una vez que la muestra está retornada.
          </span>
        </div>

        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c',
            borderRadius: 12, padding: 12, fontSize: 13,
            display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12,
          }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="m-btn m-btn-outline" style={{ flex: 1 }} onClick={onClose}>
            Cancelar
          </button>
          <button
            className="m-btn m-btn-primary"
            style={{ flex: 1.5 }}
            disabled={enviando}
            onClick={confirmar}
          >
            {enviando
              ? <><Loader2 className="m-spin" size={16} /> Guardando...</>
              : <><Check size={16} /> Confirmar retorno</>}
          </button>
        </div>
      </div>
    </div>
  );
};

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

const ResumenItem = ({ label, value, mono = false }) => (
  <div>
    <div style={{
      fontSize: 20, fontWeight: 800, color: 'var(--m-brand)',
      fontFamily: mono ? 'ui-monospace, monospace' : 'inherit', lineHeight: 1.1,
    }}>{value}</div>
    <div style={{
      fontSize: 10, color: '#64748b', fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '.04em', marginTop: 2,
    }}>{label}</div>
  </div>
);

function estadoCfg(estado = '') {
  const e = String(estado).toLowerCase();
  if (e === 'aprobada')   return { label: 'Aprobada',   bg: '#dcfce7', fg: '#15803d', border: '#86efac', Icon: Check };
  if (e === 'rechazada')  return { label: 'Rechazada',  bg: '#fee2e2', fg: '#b91c1c', border: '#fca5a5', Icon: X };
  if (e === 'parcial')    return { label: 'Parcial',    bg: '#fef3c7', fg: '#92400e', border: '#fcd34d', Icon: AlertCircle };
  if (e === 'pendiente_decision') return { label: 'Pendiente', bg: '#dbeafe', fg: '#1d4ed8', border: '#93c5fd', Icon: Clock };
  if (e === 'enviada')    return { label: 'Enviada',    bg: '#f1f5f9', fg: '#475569', border: '#cbd5e1', Icon: Send };
  return { label: estado || 'Sin estado', bg: '#f1f5f9', fg: '#475569', border: '#e2e8f0', Icon: null };
}

function decisionCfg(decision) {
  if (decision === 'aprobado')  return { label: 'OK',   bg: '#dcfce7', fg: '#15803d', Icon: Check };
  if (decision === 'rechazado') return { label: 'No',   bg: '#fee2e2', fg: '#b91c1c', Icon: X };
  return { label: 'Pend.', bg: '#dbeafe', fg: '#1d4ed8', Icon: Clock };
}

function fmtFecha(iso) {
  if (!iso) return '—';
  const s = String(iso);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  return s;
}

export default MobileMuestrasLavanderia;
