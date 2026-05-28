import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Loader2, PauseCircle, CheckCircle2, AlertTriangle, Send,
  Clock, User, Package,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Detalle de una incidencia con timeline de avances + resolver.
 *
 * Endpoints:
 *   GET  /api/incidencias?... (filtra por id no soportado directo, así que
 *        cargamos por registro_id y filtramos) — alternativa: cargar la lista
 *        global y elegir. Usamos /:registro_id/avances junto a la base.
 *   GET  /api/incidencias/:id/avances → timeline
 *   POST /api/incidencias/:id/avances → nuevo avance
 *   PUT  /api/incidencias/:id → resolver con fecha_resolucion
 *
 * Como GET /api/incidencias/:registro_id devuelve un array por corte, hacemos:
 * 1. Buscar la incidencia en la lista global filtrada (más rápido y unificado)
 *    o cargar GET /api/incidencias/:registro_id usando el registro_id que
 *    venga de la navegación; pero como entramos solo con incidencia_id, primero
 *    obtenemos la incidencia desde la lista global.
 */
export const MobileIncidenciaDetalle = () => {
  const { id: incidenciaId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [incidencia, setIncidencia] = useState(null);
  const [avances, setAvances] = useState([]);
  const [loading, setLoading] = useState(true);

  const [nuevoAvance, setNuevoAvance] = useState('');
  const [enviandoAvance, setEnviandoAvance] = useState(false);
  const [resolviendo, setResolviendo] = useState(false);
  const [error, setError] = useState('');

  const esAdmin = user?.rol === 'admin';
  const autor = user?.nombre_completo || user?.username || 'Usuario';

  const cargar = async () => {
    setLoading(true);
    try {
      // 1. Traemos la incidencia desde la lista global (con todos los joins)
      //    Pedimos estado=todas y buscamos por id.
      const lista = await axios.get(`${API}/incidencias?estado=todas&limit=500`).catch(() => ({ data: { items: [] } }));
      const items = lista.data?.items || [];
      const found = items.find(x => x.id === incidenciaId);
      setIncidencia(found || null);

      // 2. Cargamos los avances
      const av = await axios.get(`${API}/incidencias/${incidenciaId}/avances`).catch(() => ({ data: [] }));
      setAvances(Array.isArray(av.data) ? av.data : []);
    } catch {
      setIncidencia(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [incidenciaId]);

  const reportarAvance = async () => {
    if (!nuevoAvance.trim()) return;
    setError('');
    setEnviandoAvance(true);
    try {
      await axios.post(`${API}/incidencias/${incidenciaId}/avances`, {
        comentario: nuevoAvance.trim(),
        usuario: autor,
      });
      setNuevoAvance('');
      // Recargar solo avances
      const av = await axios.get(`${API}/incidencias/${incidenciaId}/avances`);
      setAvances(Array.isArray(av.data) ? av.data : []);
    } catch (e) {
      const det = e?.response?.data?.detail;
      setError(typeof det === 'string' ? det : 'No se pudo guardar el avance');
    } finally {
      setEnviandoAvance(false);
    }
  };

  const resolver = async () => {
    if (!window.confirm('¿Marcar esta incidencia como resuelta? Si paraliza, se reanuda la producción del corte.')) return;
    setError('');
    setResolviendo(true);
    try {
      // El backend usa el campo `estado` (ABIERTA / RESUELTA), no fecha_resolucion.
      await axios.put(`${API}/incidencias/${incidenciaId}`, {
        estado: 'RESUELTA',
      });
      await cargar();
    } catch (e) {
      const det = e?.response?.data?.detail;
      setError(typeof det === 'string' ? det : 'No se pudo resolver la incidencia');
    } finally {
      setResolviendo(false);
    }
  };

  // Avances en orden cronológico inverso (más reciente arriba)
  const avancesReverso = useMemo(() => [...avances].reverse(), [avances]);

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>
        <Loader2 className="m-spin" size={32} style={{ margin: '0 auto' }} />
      </div>
    );
  }

  if (!incidencia) {
    return (
      <>
        <div className="m-header">
          <button className="m-h-icon" onClick={() => navigate(-1)} aria-label="Volver">
            <ArrowLeft size={18} />
          </button>
          <div style={{ flex: 1, fontWeight: 600 }}>Incidencia no encontrada</div>
        </div>
        <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
          <p>No se pudo cargar la incidencia.</p>
          <Link to="/m/incidencias" style={{ color: 'var(--m-brand)', fontWeight: 600 }}>
            ← Volver a incidencias
          </Link>
        </div>
      </>
    );
  }

  const resuelta = incidencia.estado === 'RESUELTA';
  const paraliza = incidencia.paraliza && !resuelta;

  return (
    <>
      <div className="m-header">
        <button className="m-h-icon" onClick={() => navigate(-1)} aria-label="Volver">
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, opacity: 0.85, fontFamily: 'ui-monospace, monospace' }}>
            {incidencia.registro_n_corte}
            {incidencia.registro_modelo ? ` · ${incidencia.registro_modelo}` : ''}
          </div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>
            Incidencia{resuelta ? ' · Resuelta' : ''}
          </div>
        </div>
      </div>

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Card cabecera */}
        <div className="m-card" style={{
          padding: 12,
          ...(paraliza ? { border: '2px solid #fca5a5', background: '#fef2f2' } : {}),
          ...(resuelta ? { border: '1px solid #86efac', background: '#f0fdf4' } : {}),
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {paraliza && (
              <span className="m-pill m-pill-red" style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <PauseCircle size={10} /> PARALIZA
              </span>
            )}
            {resuelta ? (
              <span className="m-pill m-pill-green" style={{ fontSize: 10 }}>✓ RESUELTA</span>
            ) : (
              <span className="m-pill m-pill-amber" style={{ fontSize: 10 }}>ABIERTA</span>
            )}
            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#64748b' }}>
              {fmtRelativa(incidencia.fecha_hora)}
            </span>
          </div>

          <div style={{
            fontWeight: 700, fontSize: 16,
            textDecoration: resuelta ? 'line-through' : 'none',
            color: resuelta ? '#475569' : '#0f172a',
          }}>
            {incidencia.motivo_nombre || 'Incidencia'}
          </div>

          {incidencia.comentario && (
            <div style={{
              fontSize: 12, color: '#475569', marginTop: 6, lineHeight: 1.5,
            }}>
              {incidencia.comentario}
            </div>
          )}

          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${paraliza ? '#fecaca' : '#f1f5f9'}` }}>
            <div style={{ fontSize: 10, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
              <User size={10} /> Reportada por <strong style={{ color: '#0f172a' }}>{incidencia.usuario || 'desconocido'}</strong>
            </div>
            {paraliza && incidencia.paralizacion_inicio && (
              <div style={{ fontSize: 10, color: '#b91c1c', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                <Clock size={10} /> {fmtTiempoParalizado(incidencia.paralizacion_inicio)}
              </div>
            )}
            {resuelta && incidencia.fecha_resolucion && (
              <div style={{ fontSize: 10, color: '#15803d', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                <CheckCircle2 size={10} /> Resuelta {fmtRelativa(incidencia.fecha_resolucion)}
              </div>
            )}
          </div>
        </div>

        {/* Timeline de avances */}
        <div>
          <div className="m-label-xs" style={{ marginBottom: 10 }}>
            Seguimiento ({avances.length} avance{avances.length !== 1 ? 's' : ''})
          </div>

          {avances.length === 0 ? (
            <div style={{
              padding: 16, textAlign: 'center', color: '#94a3b8', fontSize: 12,
              background: 'white', border: '1px solid #e5e7eb', borderRadius: 12,
            }}>
              Aún no se reportaron avances.
            </div>
          ) : (
            <div style={{ position: 'relative', paddingLeft: 28 }}>
              <div style={{
                position: 'absolute', left: 10, top: 4, bottom: 4,
                width: 2, background: '#e2e8f0',
              }} />
              {avancesReverso.map((av, i) => {
                const esUltimo = i === 0;
                return (
                  <div key={av.id} style={{ position: 'relative', paddingBottom: 14 }}>
                    <div style={{
                      position: 'absolute', left: -22, top: 4,
                      width: esUltimo ? 20 : 16,
                      height: esUltimo ? 20 : 16,
                      borderRadius: '50%',
                      background: esUltimo ? 'var(--m-brand)' : 'white',
                      border: esUltimo ? '4px solid white' : '2px solid var(--m-brand)',
                      boxShadow: esUltimo ? '0 0 0 1px var(--m-brand)' : 'none',
                    }} />
                    <div className="m-card" style={{ padding: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 600 }}>
                          {av.usuario || 'desconocido'}
                        </span>
                        <span style={{ fontSize: 10, color: '#94a3b8' }}>
                          {fmtRelativa(av.fecha || av.created_at)}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#0f172a', lineHeight: 1.5 }}>
                        {av.comentario}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Form: reportar avance (solo si abierta) */}
        {!resuelta && (
          <div className="m-card" style={{
            padding: 12, background: 'var(--m-brand-soft)',
            borderColor: '#5eead4',
          }}>
            <div className="m-label-xs" style={{ color: 'var(--m-brand)', marginBottom: 8 }}>
              + Reportar avance
            </div>
            <textarea
              value={nuevoAvance}
              onChange={(e) => setNuevoAvance(e.target.value)}
              placeholder="Contá qué se hizo o qué pasó con esta incidencia"
              rows={3}
              style={{
                width: '100%', padding: 10, fontSize: 13,
                border: '1px solid #d1d5db', borderRadius: 10,
                fontFamily: 'inherit', resize: 'vertical',
              }}
            />
            {error && (
              <div style={{
                background: '#fef2f2', color: '#b91c1c', border: '1px solid #fca5a5',
                borderRadius: 8, padding: 8, fontSize: 11, marginTop: 8,
              }}>{error}</div>
            )}
            <button
              onClick={reportarAvance}
              disabled={enviandoAvance || !nuevoAvance.trim()}
              className="m-btn m-btn-primary"
              style={{ width: '100%', marginTop: 8 }}
            >
              {enviandoAvance
                ? <><Loader2 className="m-spin" size={16} /> Guardando…</>
                : <><Send size={16} /> Guardar avance</>}
            </button>
          </div>
        )}

        {/* Botón Resolver (si abierta) */}
        {!resuelta && (
          <button
            onClick={resolver}
            disabled={resolviendo}
            className="m-btn m-btn-primary"
            style={{
              width: '100%', minHeight: 48,
              background: '#10b981',
              fontWeight: 700, fontSize: 14,
            }}
          >
            {resolviendo
              ? <><Loader2 className="m-spin" size={18} /> Resolviendo…</>
              : <><CheckCircle2 size={18} /> Resolver{paraliza ? ' y reanudar producción' : ''}</>}
          </button>
        )}

        {/* Re-abrir (solo admin si está resuelta) */}
        {resuelta && esAdmin && (
          <button
            onClick={async () => {
              if (!window.confirm('¿Re-abrir esta incidencia? Volverá al estado ABIERTA.')) return;
              try {
                await axios.put(`${API}/incidencias/${incidenciaId}`, {
                  estado: 'ABIERTA',
                });
                await cargar();
              } catch { /* silent */ }
            }}
            className="m-btn m-btn-outline"
            style={{ width: '100%' }}
          >
            Re-abrir incidencia
          </button>
        )}
      </div>
    </>
  );
};

function fmtRelativa(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const ahora = new Date();
  const diffMs = ahora - d;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'hace segundos';
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `hace ${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `hace ${diffD} día${diffD !== 1 ? 's' : ''}`;
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtTiempoParalizado(inicioISO) {
  if (!inicioISO) return '';
  const inicio = new Date(inicioISO);
  if (isNaN(inicio.getTime())) return '';
  const ahora = new Date();
  const diffMs = ahora - inicio;
  const horas = Math.floor(diffMs / 3600000);
  const mins = Math.floor((diffMs % 3600000) / 60000);
  if (horas === 0) return `Paralizado hace ${mins} min`;
  if (horas < 24) return `Paralizado hace ${horas}h ${mins}min`;
  const dias = Math.floor(horas / 24);
  return `Paralizado hace ${dias} día${dias !== 1 ? 's' : ''} ${horas % 24}h`;
}

export default MobileIncidenciaDetalle;
