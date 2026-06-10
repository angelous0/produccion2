import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Loader2, Plus, AlertTriangle, PauseCircle,
  Check, CheckCircle2, MessageSquare, AlertCircle, X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { puede, ACCIONES } from '../utils/permisos';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Lista de incidencias del registro.
 * GET  /api/incidencias/:registro_id    → trae [{id, tipo, motivo_nombre, comentario, estado,
 *                                              paraliza, paralizacion_activa, paralizacion_inicio,
 *                                              fecha_hora, usuario, avances_count, ...}]
 * PUT  /api/incidencias/:id              → resolver con {estado, comentario_resolucion}
 * POST /api/incidencias/:id/avances      → agregar avance
 */
export const MobileIncidenciasRegistro = () => {
  const { id: registroId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [registro, setRegistro] = useState(null);
  const [incidencias, setIncidencias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('activas'); // 'activas' | 'cerradas' | 'todas'

  // Bottom sheet activo
  const [resolver, setResolver] = useState(null);  // incidencia a resolver
  const [agregarAvance, setAgregarAvance] = useState(null); // incidencia a la que agregar avance

  const fetchAll = async () => {
    try {
      const [regRes, incRes] = await Promise.all([
        axios.get(`${API}/registros/${registroId}`),
        axios.get(`${API}/incidencias/${registroId}`).catch(() => ({ data: [] })),
      ]);
      setRegistro(regRes.data);
      setIncidencias(Array.isArray(incRes.data) ? incRes.data : []);
    } catch {
      setIncidencias([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registroId]);

  // Hay paralización activa?
  const paralizacionActiva = useMemo(
    () => incidencias.some(i => i.paralizacion_activa),
    [incidencias]
  );

  // Separar por estado
  const activas = incidencias.filter(i => i.estado === 'ABIERTA');
  const cerradas = incidencias.filter(i => i.estado === 'RESUELTA');

  const mostrar = tab === 'activas' ? activas
    : tab === 'cerradas' ? cerradas
    : incidencias;

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
            {registro?.modelo_nombre || registro?.modelo_manual?.nombre_modelo || 'Incidencias'}
          </div>
          <div style={{
            fontSize: 11, opacity: 0.85, marginTop: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {registro?.n_corte}
            {registro?.estado && <> · {registro.estado}</>}
            {' · Incidencias · '}{incidencias.length}
          </div>
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Banner si está paralizado */}
        {paralizacionActiva && (
          <div style={{
            background: '#fef2f2', border: '2px solid #fca5a5',
            borderRadius: 12, padding: 12,
            display: 'flex', alignItems: 'flex-start', gap: 10,
          }}>
            <PauseCircle size={18} style={{ color: '#b91c1c', flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 13, color: '#b91c1c' }}>
              <div style={{ fontWeight: 700 }}>Producción paralizada</div>
              <div style={{ marginTop: 2, opacity: 0.9 }}>
                Resuelve la incidencia activa para reanudar movimientos.
              </div>
            </div>
          </div>
        )}

        {/* CTA crear */}
        <Link
          to={`/m/registros/${registroId}/nueva-incidencia`}
          className="m-btn m-btn-primary"
          style={{ textDecoration: 'none' }}
        >
          <Plus size={18} /> Reportar incidencia
        </Link>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
          <button
            className={`m-chip ${tab === 'activas' ? 'active' : ''}`}
            style={{ fontSize: 12, minHeight: 36, padding: '6px 14px' }}
            onClick={() => setTab('activas')}
          >
            Activas · {activas.length}
          </button>
          <button
            className={`m-chip ${tab === 'cerradas' ? 'active' : ''}`}
            style={{ fontSize: 12, minHeight: 36, padding: '6px 14px' }}
            onClick={() => setTab('cerradas')}
          >
            Cerradas · {cerradas.length}
          </button>
          <button
            className={`m-chip ${tab === 'todas' ? 'active' : ''}`}
            style={{ fontSize: 12, minHeight: 36, padding: '6px 14px' }}
            onClick={() => setTab('todas')}
          >
            Todas · {incidencias.length}
          </button>
        </div>

        {/* Lista */}
        {mostrar.length === 0 ? (
          <div className="m-card" style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>
            <AlertCircle size={36} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
            <p style={{ margin: 0, fontSize: 14 }}>
              {tab === 'activas' ? 'Sin incidencias activas.'
                : tab === 'cerradas' ? 'Sin incidencias cerradas.'
                : 'Este registro no tiene incidencias reportadas.'}
            </p>
          </div>
        ) : (
          mostrar.map(i => (
            <IncidenciaCard
              key={i.id}
              inc={i}
              onResolver={() => setResolver(i)}
              onAvance={() => setAgregarAvance(i)}
              puedeResolver={puede(user, ACCIONES.RESOLVER_INCIDENCIA)}
            />
          ))
        )}
      </div>

      {resolver && (
        <ResolverSheet
          inc={resolver}
          onClose={() => setResolver(null)}
          onResuelto={async () => {
            setResolver(null);
            await fetchAll();
          }}
        />
      )}
      {agregarAvance && (
        <AvanceSheet
          inc={agregarAvance}
          usuario={user?.nombre_completo || user?.username || 'Operario'}
          onClose={() => setAgregarAvance(null)}
          onGuardado={async () => {
            setAgregarAvance(null);
            await fetchAll();
          }}
        />
      )}
    </>
  );
};

/* ──────── Card de una incidencia ──────── */
const IncidenciaCard = ({ inc, onResolver, onAvance, puedeResolver }) => {
  const activa = inc.estado === 'ABIERTA';
  const paraliza = !!inc.paraliza;
  const cfg = activa
    ? (paraliza
        ? { border: '#fca5a5', bg: '#fef2f2' }
        : { border: '#fcd34d', bg: '#fffbeb' })
    : { border: '#86efac', bg: '#f0fdf4', opacity: 0.85 };

  // duración de paralización si está activa
  const duracion = useMemo(() => {
    if (!inc.paralizacion_inicio || !inc.paralizacion_activa) return null;
    const inicio = new Date(inc.paralizacion_inicio);
    const ahora = new Date();
    const ms = ahora - inicio;
    const horas = Math.floor(ms / (1000 * 60 * 60));
    const dias = Math.floor(horas / 24);
    if (dias > 0) return `${dias} día${dias !== 1 ? 's' : ''}`;
    if (horas > 0) return `${horas} hora${horas !== 1 ? 's' : ''}`;
    return 'minutos';
  }, [inc.paralizacion_inicio, inc.paralizacion_activa]);

  return (
    <div className="m-card" style={{ borderColor: cfg.border, background: cfg.bg, opacity: cfg.opacity }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          {/* Badges */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
            <span className={`m-pill ${activa
              ? (paraliza ? 'm-pill-red' : 'm-pill-amber')
              : 'm-pill-green'}`}>
              {activa
                ? (paraliza ? 'PARALIZA' : 'ABIERTA')
                : '✓ RESUELTA'}
            </span>
            {inc.motivo_nombre && (
              <span className="m-pill m-pill-gray">{inc.motivo_nombre}</span>
            )}
            {duracion && activa && (
              <span style={{
                fontSize: 10, fontWeight: 700, color: '#b91c1c',
              }}>
                hace {duracion}
              </span>
            )}
          </div>

          {/* Comentario */}
          {inc.comentario && (
            <p style={{
              fontSize: 13, color: '#1e293b', marginTop: 8, lineHeight: 1.4,
            }}>
              {inc.comentario}
            </p>
          )}

          {/* Meta */}
          <div style={{
            display: 'flex', gap: 10, fontSize: 11, color: '#64748b', marginTop: 8,
            flexWrap: 'wrap',
          }}>
            <span style={{ fontFamily: 'ui-monospace, monospace' }}>
              {fmtFechaHora(inc.fecha_hora)}
            </span>
            {inc.usuario && (
              <>
                <span>·</span>
                <span>por {inc.usuario}</span>
              </>
            )}
            {(inc.avances_count || 0) > 0 && (
              <>
                <span>·</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <MessageSquare size={11} />
                  {inc.avances_count} avance{inc.avances_count !== 1 ? 's' : ''}
                </span>
              </>
            )}
          </div>

          {/* Resolución (si está cerrada) */}
          {!activa && inc.comentario_resolucion && (
            <div style={{
              marginTop: 8, padding: '8px 10px', background: 'rgba(255,255,255,0.6)',
              borderRadius: 8, fontSize: 12, color: '#475569',
            }}>
              <span style={{ fontWeight: 700, color: '#15803d' }}>Resolución:</span>{' '}
              {inc.comentario_resolucion}
            </div>
          )}
        </div>
      </div>

      {/* Acciones */}
      {activa && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            className="m-btn m-btn-outline"
            style={{ flex: 1, minHeight: 42, fontSize: 13 }}
            onClick={onAvance}
          >
            <MessageSquare size={14} /> + Avance
          </button>
          {/* Resolver levanta paralizaciones — requiere permiso explícito */}
          {puedeResolver && (
            <button
              className="m-btn"
              style={{
                flex: 1, minHeight: 42, fontSize: 13,
                background: '#dcfce7', color: '#15803d', fontWeight: 700,
              }}
              onClick={onResolver}
            >
              <Check size={14} /> Resolver
            </button>
          )}
        </div>
      )}
    </div>
  );
};

/* ═════════════════════ BOTTOM SHEET: RESOLVER ═════════════════════ */
const ResolverSheet = ({ inc, onClose, onResuelto }) => {
  const [comentarioResolucion, setComentarioResolucion] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const paraliza = !!inc.paraliza && !!inc.paralizacion_activa;

  const confirmar = async () => {
    setError('');
    setEnviando(true);
    try {
      await axios.put(`${API}/incidencias/${inc.id}`, {
        estado: 'RESUELTA',
        comentario_resolucion: comentarioResolucion.trim() || null,
      });
      onResuelto();
    } catch (e) {
      const detail = e?.response?.data?.detail || 'Error al resolver la incidencia';
      setError(typeof detail === 'string' ? detail : 'Error al resolver la incidencia');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <SheetShell onClose={onClose}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 17 }}>Resolver incidencia</div>
        <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
          {inc.motivo_nombre || '—'}
        </div>
      </div>

      {paraliza && (
        <div style={{
          background: '#dcfce7', border: '1px solid #86efac', color: '#15803d',
          borderRadius: 12, padding: 12, marginBottom: 16,
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13 }}>
            <div style={{ fontWeight: 700 }}>Levantará la paralización</div>
            <div style={{ marginTop: 2, opacity: 0.9 }}>
              El registro volverá a estado operativo normal y se podrán crear nuevos movimientos.
            </div>
          </div>
        </div>
      )}

      {/* Comentario original */}
      {inc.comentario && (
        <div className="m-card" style={{ background: '#f8fafc', padding: 12, marginBottom: 16 }}>
          <div className="m-label-xs" style={{ marginBottom: 6 }}>Reporte original</div>
          <p style={{ fontSize: 13, color: '#475569', margin: 0 }}>{inc.comentario}</p>
        </div>
      )}

      {/* Comentario de resolución */}
      <div style={{ marginBottom: 16 }}>
        <span className="m-label-xs">¿Cómo se resolvió? (recomendado)</span>
        <textarea
          rows={3}
          className="m-input"
          style={{ padding: 12, marginTop: 8, fontFamily: 'inherit', resize: 'vertical' }}
          placeholder="Ej: Material llegó al día siguiente. Producción retomada."
          value={comentarioResolucion}
          onChange={(e) => setComentarioResolucion(e.target.value)}
        />
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
          Se publicará en el chat del registro con tono <strong>resuelto</strong>.
        </div>
      </div>

      {error && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c',
          borderRadius: 12, padding: 12, fontSize: 13, marginBottom: 12,
        }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="m-btn m-btn-outline" style={{ flex: 1 }} onClick={onClose}>
          Cancelar
        </button>
        <button
          className="m-btn m-btn-primary"
          style={{ flex: 2 }}
          disabled={enviando}
          onClick={confirmar}
        >
          {enviando
            ? <><Loader2 className="m-spin" size={18} /> Resolviendo...</>
            : <><Check size={18} /> Resolver{paraliza ? ' y reanudar' : ''}</>}
        </button>
      </div>
    </SheetShell>
  );
};

/* ═════════════════════ BOTTOM SHEET: AGREGAR AVANCE ═════════════════════ */
const AvanceSheet = ({ inc, usuario, onClose, onGuardado }) => {
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const confirmar = async () => {
    setError('');
    if (!comentario.trim()) { setError('Escribe un comentario para el avance'); return; }
    setEnviando(true);
    try {
      await axios.post(`${API}/incidencias/${inc.id}/avances`, {
        comentario: comentario.trim(),
      });
      onGuardado();
    } catch (e) {
      const detail = e?.response?.data?.detail || 'Error al agregar avance';
      setError(typeof detail === 'string' ? detail : 'Error al agregar avance');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <SheetShell onClose={onClose}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 17 }}>Agregar avance</div>
        <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
          {inc.motivo_nombre || '—'}
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
          como {usuario}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <span className="m-label-xs">¿Qué pasó? ¿Hay novedades?</span>
        <textarea
          rows={4}
          className="m-input"
          style={{ padding: 12, marginTop: 8, fontFamily: 'inherit', resize: 'vertical' }}
          placeholder="Ej: María avisó que recibe el lote mañana al mediodía..."
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          autoFocus
        />
      </div>

      {error && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c',
          borderRadius: 12, padding: 12, fontSize: 13, marginBottom: 12,
        }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="m-btn m-btn-outline" style={{ flex: 1 }} onClick={onClose}>
          Cancelar
        </button>
        <button
          className="m-btn m-btn-primary"
          style={{ flex: 2 }}
          disabled={enviando || !comentario.trim()}
          onClick={confirmar}
        >
          {enviando
            ? <><Loader2 className="m-spin" size={18} /> Guardando...</>
            : '+ Guardar avance'}
        </button>
      </div>
    </SheetShell>
  );
};

/* ─────── Sheet wrapper común ─────── */
const SheetShell = ({ children, onClose }) => createPortal(
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
        padding: '12px 20px 24px',
        paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
        maxHeight: '95vh', overflowY: 'auto',
      }}
    >
      <div style={{ width: 40, height: 4, background: '#cbd5e1', borderRadius: 2, margin: '0 auto 16px' }} />
      {children}
    </div>
  </div>,
  document.body
);

/* ─────── Helpers ─────── */
function fmtFechaHora(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const fecha = d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' });
    const hora = d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
    return `${fecha} · ${hora}`;
  } catch {
    return iso;
  }
}

export default MobileIncidenciasRegistro;
