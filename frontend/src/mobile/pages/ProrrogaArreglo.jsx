import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Loader2, Save, AlertTriangle, Clock, Check,
  Calendar, User, Lock, History, Info,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const MAX_PRORROGAS = 2;
const MIN_DIAS = 1;
const MAX_DIAS = 14;
const ATAJOS = [1, 3, 7, 14];

/**
 * Otorgar prórroga a un arreglo — pantalla full (mockup 33).
 *
 *   GET  /api/fallados/tablero?registro_id=X → ubica el arreglo por id
 *   POST /api/arreglos/:id/prorroga          → body: { dias, motivo? }
 *
 * Reglas backend:
 *   - Solo admin / supervisor_acabado
 *   - Máx 2 prórrogas por arreglo
 *   - dias entre 1 y 14
 */
export const MobileProrrogaArreglo = () => {
  const { id: registroId, arregloId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const puedeProrrogar = user?.rol === 'admin' || user?.rol === 'supervisor_acabado';

  const [arreglo, setArreglo] = useState(null);
  const [registro, setRegistro] = useState(null);
  const [loading, setLoading] = useState(true);

  const [dias, setDias] = useState(3);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [tabRes, regRes] = await Promise.all([
          axios.get(`${API}/fallados/tablero?registro_id=${registroId}`),
          axios.get(`${API}/registros/${registroId}`),
        ]);
        setRegistro(regRes.data);

        // Buscar el arreglo en los grupos
        const grupos = tabRes.data?.grupos || {};
        const todos = [
          ...(grupos.vencidos || []),
          ...(grupos.por_vencer || []),
          ...(grupos.en_proceso || []),
          ...(grupos.resueltos_hoy || []),
        ];
        const a = todos.find(x => x.arreglo_id === arregloId);
        setArreglo(a || null);
      } catch (e) {
        setError('Error al cargar el arreglo');
      } finally {
        setLoading(false);
      }
    })();
  }, [registroId, arregloId]);

  const prorrogasUsadas = Number(arreglo?.num_prorrogas || 0);
  const restantes = MAX_PRORROGAS - prorrogasUsadas;
  const yaCompletado = arreglo
    ? Number(arreglo.pendiente || 0) <= 0
    : false;

  const fechaActual = arreglo?.fecha_limite || null;
  const fechaOriginal = arreglo?.fecha_limite_original || fechaActual;
  const vencidoHoy = fechaActual && new Date(fechaActual) < startOfToday();

  const nuevaFecha = useMemo(() => {
    if (!fechaActual) return null;
    return sumarDias(fechaActual, dias);
  }, [fechaActual, dias]);

  const confirmar = async () => {
    setError('');
    if (!puedeProrrogar) return setError('Solo admin / supervisor_acabado puede dar prórroga.');
    if (restantes <= 0) return setError(`Ya se alcanzó el máximo de ${MAX_PRORROGAS} prórrogas.`);
    if (yaCompletado) return setError('El arreglo ya está completado, no requiere prórroga.');
    if (dias < MIN_DIAS || dias > MAX_DIAS) {
      return setError(`Días debe estar entre ${MIN_DIAS} y ${MAX_DIAS}`);
    }
    setEnviando(true);
    try {
      await axios.post(`${API}/arreglos/${arregloId}/prorroga`, {
        dias,
        motivo: motivo.trim() || undefined,
      });
      navigate(-1);
    } catch (e) {
      const det = e?.response?.data?.detail || 'Error al otorgar la prórroga';
      setError(typeof det === 'string' ? det : String(det));
    } finally {
      setEnviando(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>
        <Loader2 className="m-spin" size={32} style={{ margin: '0 auto' }} />
      </div>
    );
  }

  if (!arreglo) {
    return (
      <>
        <div className="m-header">
          <button className="m-h-icon" onClick={() => navigate(-1)}><ArrowLeft size={18} /></button>
          <div style={{ flex: 1, fontWeight: 600 }}>Prórroga</div>
        </div>
        <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
          <AlertTriangle size={36} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
          <p style={{ fontSize: 14 }}>No se encontró el arreglo.</p>
        </div>
      </>
    );
  }

  // Histórico de prórrogas (si el backend lo devuelve)
  const historico = Array.isArray(arreglo.prorrogas) ? arreglo.prorrogas : [];

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      minHeight: '100vh', paddingBottom: 76,
    }}>
      <div className="m-header" style={{ flexShrink: 0 }}>
        <button className="m-h-icon" onClick={() => navigate(-1)} aria-label="Volver">
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 11, opacity: 0.85,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {registro?.n_corte} · {registro?.modelo_nombre || registro?.modelo_manual?.nombre_modelo || '—'}
          </div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>Otorgar prórroga</div>
        </div>
      </div>

      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Bloqueo si no tiene permisos */}
        {!puedeProrrogar && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c',
            borderRadius: 12, padding: 12, fontSize: 13,
            display: 'flex', gap: 8, alignItems: 'flex-start',
          }}>
            <Lock size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>Solo <strong>admin</strong> o <strong>supervisor de acabado</strong> puede otorgar prórroga.</span>
          </div>
        )}

        {/* Info del arreglo */}
        <div className="m-card" style={{ padding: 14 }}>
          <Row icon={<User size={14} />} label="Proveedor"
            value={arreglo.persona || arreglo.servicio || '—'} />
          <Row icon={<Clock size={14} />} label="Servicio"
            value={arreglo.servicio || (arreglo.tipo_arreglo === 'tela' ? 'Arreglo interno (TELA)' : '—')} />
          <Row icon={<Calendar size={14} />} label="Pendiente"
            value={`${arreglo.pendiente || 0} pza${Number(arreglo.pendiente) !== 1 ? 's' : ''}`} />
        </div>

        {/* Fechas */}
        <div className="m-card" style={{ padding: 14, background: '#f8fafc' }}>
          <Row icon={<Calendar size={14} />} label="Fecha original" value={fmtFechaLarga(fechaOriginal)} />
          <Row
            icon={<Calendar size={14} />}
            label="Fecha actual"
            value={
              <span style={{
                color: vencidoHoy ? '#b91c1c' : '#0f172a',
                fontWeight: vencidoHoy ? 700 : 600,
              }}>
                {fmtFechaLarga(fechaActual)}
                {vencidoHoy && <span style={{ marginLeft: 6, fontSize: 11 }}>(vencido)</span>}
              </span>
            }
          />
          <Row icon={<History size={14} />} label="Prórrogas usadas"
            value={
              <span style={{
                color: restantes <= 0 ? '#b91c1c' : '#0f172a',
                fontWeight: 700,
              }}>
                {prorrogasUsadas} de {MAX_PRORROGAS}
              </span>
            } />
        </div>

        {/* Histórico previo */}
        {historico.length > 0 && (
          <div>
            <div className="m-label-xs" style={{ marginBottom: 6 }}>Histórico de prórrogas</div>
            <div className="m-card" style={{ padding: 0, overflow: 'hidden' }}>
              {historico.map((p, i) => (
                <div key={i} style={{
                  padding: 10, fontSize: 12,
                  borderBottom: i < historico.length - 1 ? '1px solid #f1f5f9' : 'none',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <strong style={{ color: '#0f172a' }}>
                      +{p.dias} día{p.dias !== 1 ? 's' : ''}
                    </strong>
                    <span style={{ color: '#64748b' }}>
                      {fmtFechaCorta(p.fecha_anterior)} → {fmtFechaCorta(p.fecha_nueva)}
                    </span>
                  </div>
                  {p.motivo && (
                    <div style={{ color: '#64748b', marginTop: 2, fontStyle: 'italic' }}>
                      "{p.motivo}"
                    </div>
                  )}
                  {p.por_usuario_nombre && (
                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                      por {p.por_usuario_nombre}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Aviso si está al límite */}
        {restantes <= 0 && (
          <div style={{
            background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e',
            borderRadius: 12, padding: 12, fontSize: 12,
            display: 'flex', gap: 8, alignItems: 'flex-start',
          }}>
            <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              Este arreglo ya alcanzó el máximo de <strong>{MAX_PRORROGAS}</strong> prórrogas.
              No se puede otorgar otra — debe pasar a facturación o resolverse.
            </span>
          </div>
        )}

        {/* Selector de días */}
        {restantes > 0 && !yaCompletado && (
          <>
            <div>
              <div className="m-label-xs" style={{ marginBottom: 8 }}>
                Días adicionales (1 a {MAX_DIAS})
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center' }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'stretch',
                  border: '1px solid #d1d5db', borderRadius: 12, overflow: 'hidden',
                  background: 'white',
                }}>
                  <button
                    onClick={() => setDias(Math.max(MIN_DIAS, dias - 1))}
                    disabled={dias <= MIN_DIAS}
                    style={btnStep}
                  >−</button>
                  <input
                    type="number"
                    min={MIN_DIAS} max={MAX_DIAS}
                    value={dias}
                    onChange={(e) => {
                      const n = Math.max(MIN_DIAS, Math.min(MAX_DIAS, Number(e.target.value) || MIN_DIAS));
                      setDias(n);
                    }}
                    style={inputStep}
                  />
                  <button
                    onClick={() => setDias(Math.min(MAX_DIAS, dias + 1))}
                    disabled={dias >= MAX_DIAS}
                    style={btnStep}
                  >+</button>
                </div>
                <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.4 }}>
                  → nueva fecha<br/>
                  <strong style={{
                    fontFamily: 'ui-monospace, monospace',
                    color: 'var(--m-brand)', fontSize: 16,
                  }}>
                    {fmtFechaLarga(nuevaFecha)}
                  </strong>
                </div>
              </div>
            </div>

            {/* Atajos */}
            <div>
              <div className="m-label-xs" style={{ marginBottom: 8 }}>Atajos</div>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
              }}>
                {ATAJOS.map(n => (
                  <button
                    key={n}
                    onClick={() => setDias(n)}
                    className={`m-chip ${dias === n ? 'active' : ''}`}
                    style={{
                      fontSize: 14, minHeight: 42, padding: '6px 0',
                      justifyContent: 'center', fontWeight: 700,
                    }}
                  >
                    +{n}d
                  </button>
                ))}
              </div>
            </div>

            {/* Motivo */}
            <div>
              <div className="m-label-xs" style={{ marginBottom: 6 }}>
                Motivo <span style={{ color: '#94a3b8', fontWeight: 500 }}>(opcional)</span>
              </div>
              <textarea
                rows={3}
                className="m-input"
                style={{ padding: 10, fontFamily: 'inherit', fontSize: 14, resize: 'vertical' }}
                placeholder="Ej: María avisó que terminará el miércoles · Cliente extendió plazo de entrega"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                maxLength={300}
              />
              <div style={{
                fontSize: 11, color: '#94a3b8', marginTop: 4, textAlign: 'right',
              }}>
                {motivo.length} / 300
              </div>
            </div>
          </>
        )}

        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c',
            borderRadius: 10, padding: 10, fontSize: 13,
            display: 'flex', gap: 8, alignItems: 'flex-start',
          }}>
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Footer fijo */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'white', borderTop: '1px solid #e5e7eb',
        padding: '10px 12px', display: 'flex', gap: 8, zIndex: 50,
      }}>
        <button
          onClick={() => navigate(-1)}
          className="m-btn m-btn-outline"
          style={{ flex: 1, minHeight: 48, borderColor: '#cbd5e1', color: '#475569' }}
        >
          Cancelar
        </button>
        <button
          className="m-btn m-btn-primary"
          disabled={enviando || !puedeProrrogar || restantes <= 0 || yaCompletado}
          onClick={confirmar}
          style={{ flex: 2, minHeight: 48 }}
        >
          {enviando
            ? <><Loader2 className="m-spin" size={18} /> Otorgando...</>
            : <><Save size={18} /> Otorgar prórroga</>}
        </button>
      </div>
    </div>
  );
};

/* ──────── Helpers ──────── */
const Row = ({ icon, label, value }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '6px 0', fontSize: 13,
  }}>
    <span style={{ color: '#94a3b8' }}>{icon}</span>
    <span style={{ flex: 1, color: '#64748b' }}>{label}</span>
    {typeof value === 'string' || typeof value === 'number'
      ? <strong style={{ color: '#0f172a' }}>{value}</strong>
      : value}
  </div>
);

const btnStep = {
  width: 50, height: 50, fontSize: 22, fontWeight: 700,
  background: '#f8fafc', border: 0, cursor: 'pointer',
};
const inputStep = {
  width: 80, textAlign: 'center', fontSize: 22, fontWeight: 800,
  border: 'none', outline: 'none', fontVariantNumeric: 'tabular-nums',
  color: 'var(--m-brand)',
};

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}
function startOfToday() {
  const [y, m, d] = hoyISO().split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function sumarDias(fechaISO, n) {
  const s = String(fechaISO || hoyISO()).slice(0, 10);
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + Number(n || 0));
  return date.toISOString().slice(0, 10);
}
function fmtFechaLarga(iso) {
  if (!iso) return '—';
  const s = String(iso).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  }
  return s;
}
function fmtFechaCorta(iso) {
  if (!iso) return '—';
  const s = String(iso).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [, m, d] = s.split('-');
    return `${d}/${m}`;
  }
  return s;
}

export default MobileProrrogaArreglo;
