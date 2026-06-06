import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Loader2, Check, Calendar, User, DollarSign,
  AlertTriangle, Trash2, CheckCircle2, TrendingUp, History, ChevronRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

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
  const { user } = useAuth();

  const [registro, setRegistro] = useState(null);
  const [mov, setMov] = useState(null);
  const [servicios, setServicios] = useState([]);
  const [loading, setLoading] = useState(true);

  // Historial de avances (Sprint 41-historial)
  const [historial, setHistorial] = useState([]);
  const [borrando, setBorrando] = useState(null); // id del registro en proceso

  // bottom sheets
  const [showCerrar, setShowCerrar] = useState(false);
  const [sugerenciaCierre, setSugerenciaCierre] = useState(null); // Sprint 44b
  const [showAvance, setShowAvance] = useState(false);
  const [showEliminar, setShowEliminar] = useState(false);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [regRes, movRes, srvRes, histRes] = await Promise.all([
          axios.get(`${API}/registros/${registroId}`),
          axios.get(`${API}/movimientos-produccion?registro_id=${registroId}&limit=200`),
          axios.get(`${API}/servicios-produccion`).catch(() => ({ data: [] })),
          axios.get(`${API}/reportes-produccion/costura/avance-historial/${movId}`).catch(() => ({ data: [] })),
        ]);
        setRegistro(regRes.data);
        const items = movRes.data?.items || movRes.data || [];
        const found = (Array.isArray(items) ? items : []).find(m => m.id === movId);
        setMov(found || null);
        setServicios(Array.isArray(srvRes.data) ? srvRes.data : (srvRes.data?.items || []));
        setHistorial(Array.isArray(histRes.data) ? histRes.data : []);
      } catch {
        setMov(null);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [registroId, movId]);

  // Refresca solo el historial (tras reportar o borrar)
  const refreshHistorial = async () => {
    try {
      const res = await axios.get(
        `${API}/reportes-produccion/costura/avance-historial/${movId}`
      );
      setHistorial(Array.isArray(res.data) ? res.data : []);
    } catch { /* no-op */ }
  };

  // Borrar una entrada del historial (solo el autor o admin)
  const borrarHistorialEntry = async (entry) => {
    const ok = window.confirm(
      `¿Borrar el reporte de ${entry.avance_porcentaje}% del ${fmtFechaCorta(entry.fecha)}? ` +
      `El avance actual se recalculará tomando el último reporte que quede.`
    );
    if (!ok) return;
    setBorrando(entry.id);
    try {
      await axios.delete(`${API}/reportes-produccion/costura/avance-historial/${entry.id}`);
      // Recargamos historial y también el movimiento (el avance % puede haber cambiado)
      await Promise.all([refreshHistorial(), refreshMov()]);
    } catch (e) {
      window.alert(e?.response?.data?.detail || 'No se pudo borrar el reporte');
    } finally {
      setBorrando(null);
    }
  };

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
            {/* Botón "Reportar avance" pegado al card de avance — separado
                visualmente del bloque de acciones de "Cerrar/Eliminar" para
                evitar clicks accidentales (Opción B). */}
            <button
              className="m-btn m-btn-outline"
              style={{ borderColor: 'var(--m-brand)', color: 'var(--m-brand)', marginTop: 10, width: '100%' }}
              onClick={() => setShowAvance(true)}
            >
              <TrendingUp size={18} />
              Reportar avance
            </button>
          </div>
        )}

        {/* Historial de avances — Lista compacta (Opción B) */}
        {usaAvance && historial.length > 0 && (
          <HistorialAvancesCard
            historial={historial}
            user={user}
            borrando={borrando}
            onBorrar={borrarHistorialEntry}
          />
        )}

        {/* Acciones */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {/* Cerrar (solo si está en curso). Si el servicio usa avance %,
              solo se habilita cuando avance == 100% — evita cerrar con
              avance desactualizado o por click accidental cerca de
              "Reportar avance" (Opción A combinada con B). */}
          {enProgreso && (() => {
            const pct = Number(mov.avance_porcentaje) || 0;
            const bloqueado = usaAvance && pct < 100;
            return (
              <button
                className="m-btn m-btn-primary"
                onClick={() => { if (!bloqueado) setShowCerrar(true); }}
                disabled={bloqueado}
                title={bloqueado ? `Reportá 100% antes de cerrar (avance actual: ${pct}%)` : ''}
                style={bloqueado ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
              >
                <CheckCircle2 size={18} />
                {bloqueado ? `Cerrar movimiento (falta ${100 - pct}%)` : 'Cerrar movimiento'}
              </button>
            );
          })()}

          {/* Eliminar (abre sheet con confirmación "escribir ELIMINAR") */}
          <button
            className="m-btn m-btn-outline"
            style={{ borderColor: '#fca5a5', color: '#b91c1c' }}
            onClick={() => setShowEliminar(true)}
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
            // Sprint 44b: tras cerrar, sugerir cambio de estado si aplica
            try {
              const r = await axios.get(`${API}/registros/${mov.registro_id}/estados-disponibles`);
              const sigDir = r.data?.siguientes_directos || [];
              // Buscar el "Para X" del siguiente servicio (después del servicio cerrado)
              const sigPara = sigDir.find(e => /^para\s+/i.test(e.nombre || ''));
              if (sigPara) {
                setSugerenciaCierre({
                  estadoActual: r.data?.estado_actual,
                  estadoSugerido: sigPara.nombre,
                });
              }
            } catch {}
          }}
        />
      )}

      {/* Sprint 44b: sheet de sugerencia tras cerrar movimiento */}
      {sugerenciaCierre && (
        <SugerirCambioEstadoSheet
          registroId={mov.registro_id}
          estadoActual={sugerenciaCierre.estadoActual}
          estadoSugerido={sugerenciaCierre.estadoSugerido}
          onClose={() => setSugerenciaCierre(null)}
          onAplicado={async () => {
            setSugerenciaCierre(null);
            await refreshMov();
          }}
        />
      )}

      {showEliminar && (
        <EliminarMovSheet
          mov={mov}
          onClose={() => setShowEliminar(false)}
          onEliminado={() => navigate(-1)}
        />
      )}

      {showAvance && (
        <AvanceMovSheet
          mov={mov}
          onClose={() => setShowAvance(false)}
          onGuardado={async () => {
            setShowAvance(false);
            // Refrescar tanto el movimiento (avance_porcentaje) como el historial
            await Promise.all([refreshMov(), refreshHistorial()]);
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

  return createPortal(
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
          padding: '8px 16px 20px',
          paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
          maxHeight: '90vh', overflowY: 'auto',
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
    </div>,
    document.body
  );
};

/* ─────── Bottom sheet: confirmar eliminación (escribir ELIMINAR) ─────── */
const EliminarMovSheet = ({ mov, onClose, onEliminado }) => {
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const PALABRA = 'ELIMINAR';
  const coincide = texto.trim().toUpperCase() === PALABRA;

  const confirmar = async () => {
    if (!coincide) return;
    setEnviando(true);
    setError('');
    try {
      await axios.delete(`${API}/movimientos-produccion/${mov.id}`);
      onEliminado();
    } catch (e) {
      const detail = e?.response?.data?.detail || 'Error al eliminar';
      setError(typeof detail === 'string' ? detail : 'Error al eliminar');
      setEnviando(false);
    }
  };

  return createPortal(
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
          padding: '8px 16px 20px',
          paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
          maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        <div style={{
          width: 40, height: 4, background: '#cbd5e1', borderRadius: 2,
          margin: '0 auto 12px',
        }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Trash2 size={20} style={{ color: '#dc2626' }} />
          <div style={{ fontSize: 16, fontWeight: 700, color: '#dc2626' }}>
            Eliminar movimiento
          </div>
        </div>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>
          {mov.servicio_nombre} · {mov.persona_nombre || 'sin persona'}
        </div>

        {/* Banner advertencia */}
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
          padding: 12, marginBottom: 14, fontSize: 13, color: '#7f1d1d',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>⚠️ Acción irreversible</div>
          Esto borrará el movimiento permanentemente, incluyendo:
          <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
            <li>El registro de cantidades enviada/recibida</li>
            <li>El historial de avances reportados</li>
            <li>Cualquier costo calculado asociado</li>
          </ul>
        </div>

        {/* Input para escribir ELIMINAR */}
        <div style={{ marginBottom: 14 }}>
          <span className="m-label-xs">
            Para confirmar, escribí <strong style={{ color: '#dc2626' }}>{PALABRA}</strong> abajo:
          </span>
          <input
            type="text"
            className="m-input"
            placeholder={PALABRA}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            autoFocus
            style={{
              marginTop: 6,
              borderColor: coincide ? '#22c55e' : (texto ? '#fca5a5' : undefined),
              fontFamily: 'ui-monospace, monospace',
              letterSpacing: 1,
            }}
          />
        </div>

        {error && (
          <div style={{ color: '#b91c1c', fontSize: 12, marginBottom: 10 }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="m-btn m-btn-outline" style={{ flex: 1 }} onClick={onClose}>
            Cancelar
          </button>
          <button
            className="m-btn"
            style={{
              flex: 2,
              background: coincide ? '#dc2626' : '#fca5a5',
              color: 'white',
              cursor: coincide && !enviando ? 'pointer' : 'not-allowed',
            }}
            disabled={!coincide || enviando}
            onClick={confirmar}
          >
            {enviando
              ? <><Loader2 className="m-spin" size={18} /> Eliminando...</>
              : <><Trash2 size={18} /> Eliminar definitivo</>}
          </button>
        </div>
      </div>
    </div>,
    document.body
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

  return createPortal(
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
          padding: '8px 16px 20px',
          paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
          maxHeight: '85vh', overflowY: 'auto',
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
    </div>,
    document.body
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

/* ─────────────────────────────────────────────────────────────────────────
   Historial de avances · Lista compacta (Opción B)
   ─────────────────────────────────────────────────────────────────────────
   Muestra cada reporte como fila: % grande monospace + autor + fecha relativa.
   El botón borrar solo aparece si el usuario actual es admin o el autor del
   reporte. El backend recalcula el avance_porcentaje del movimiento al borrar.
   ───────────────────────────────────────────────────────────────────────── */
const HistorialAvancesCard = ({ historial, user, borrando, onBorrar }) => {
  // El historial viene del backend en orden ASC (más viejo primero).
  // Para mostrarlo lo invertimos: el más reciente arriba.
  const entradas = useMemo(() => [...historial].reverse(), [historial]);
  const miNombre = (user?.nombre_completo || user?.username || '').toLowerCase();
  const esAdmin = user?.rol === 'admin';

  return (
    <div>
      <div className="m-label-xs" style={{
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
      }}>
        <History size={11} />
        Historial de avances ({historial.length})
      </div>

      <div className="m-card" style={{ padding: 0, overflow: 'hidden' }}>
        {entradas.map((e, i) => {
          const usuario = (e.usuario || '').toLowerCase();
          const puedeBorrar = esAdmin || (usuario && usuario === miNombre);
          const esUltimo = i === 0; // el más reciente
          return (
            <div
              key={e.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: 12,
                borderBottom: i < entradas.length - 1 ? '1px solid #f1f5f9' : 0,
              }}
            >
              <span style={{
                fontFamily: 'ui-monospace, monospace',
                fontWeight: 700, fontSize: 15,
                color: esUltimo ? 'var(--m-brand)' : '#475569',
                minWidth: 44,
              }}>
                {e.avance_porcentaje}%
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a' }}>
                  {e.usuario || 'Sin usuario'}
                </div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>
                  {fmtFechaRelativa(e.fecha)}
                </div>
              </div>
              {puedeBorrar ? (
                <button
                  onClick={() => onBorrar(e)}
                  disabled={borrando === e.id}
                  aria-label="Borrar reporte"
                  style={{
                    padding: 6, background: 'transparent', border: 0,
                    color: '#dc2626', borderRadius: 6,
                    cursor: borrando === e.id ? 'wait' : 'pointer',
                    opacity: borrando === e.id ? 0.5 : 1,
                  }}
                >
                  {borrando === e.id
                    ? <Loader2 className="m-spin" size={14} />
                    : <Trash2 size={15} />}
                </button>
              ) : (
                <div style={{ width: 28 }} />
              )}
            </div>
          );
        })}
      </div>

      <div style={{
        fontSize: 10, color: '#94a3b8', fontStyle: 'italic',
        textAlign: 'center', marginTop: 6,
      }}>
        Solo podés borrar tus propios reportes
        {esAdmin && ' (admin puede borrar todos)'}
      </div>
    </div>
  );
};

/**
 * Convierte una fecha ISO a algo legible:
 *  - "hace 10 min" si < 1h
 *  - "hoy 14:30" si es hoy
 *  - "ayer 16:00" si es ayer
 *  - "25 may 9:00" si es de este año
 *  - "25/05/2024" si es de otro año
 */
function fmtFechaRelativa(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const ahora = new Date();
  const diffMs = ahora - d;
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);

  if (diffMin < 1) return 'hace segundos';
  if (diffMin < 60) return `hace ${diffMin} min`;

  // Mismo día calendario
  const esHoy = d.toDateString() === ahora.toDateString();
  const ayer = new Date(ahora);
  ayer.setDate(ahora.getDate() - 1);
  const esAyer = d.toDateString() === ayer.toDateString();
  const hora = d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });

  if (esHoy) return diffH < 6 ? `hace ${diffH} h` : `hoy ${hora}`;
  if (esAyer) return `ayer ${hora}`;

  // Mismo año
  const mismoAnio = d.getFullYear() === ahora.getFullYear();
  if (mismoAnio) {
    const dia = d.getDate();
    const mes = d.toLocaleString('es-PE', { month: 'short' }).replace('.', '');
    return `${dia} ${mes} ${hora}`;
  }
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Formato corto de fecha para el confirm de borrar.
 *  "25/05 16:30"
 */
function fmtFechaCorta(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm} ${hh}:${min}`;
}

/* ─────── Sprint 44b: sugerir cambio de estado tras cerrar movimiento ─────── */
const SugerirCambioEstadoSheet = ({ registroId, estadoActual, estadoSugerido, onClose, onAplicado }) => {
  const [aplicando, setAplicando] = useState(false);
  const [error, setError] = useState('');

  const aplicar = async () => {
    setAplicando(true);
    setError('');
    try {
      const r = await axios.get(`${API}/registros/${registroId}`);
      const reg = r.data;
      await axios.put(`${API}/registros/${registroId}`, { ...reg, estado: estadoSugerido });
      onAplicado();
    } catch (e) {
      const det = e?.response?.data?.detail;
      setError(typeof det === 'string' ? det : 'No se pudo cambiar el estado');
    } finally {
      setAplicando(false);
    }
  };

  return createPortal(
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
          padding: '12px 20px 20px',
          paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div style={{
          width: 40, height: 4, background: '#cbd5e1', borderRadius: 2,
          margin: '0 auto 12px',
        }} />

        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%',
            background: 'var(--m-brand-soft)', color: 'var(--m-brand)',
            margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Check size={24} />
          </div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Movimiento cerrado</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
            ¿También avanzás el estado del corte?
          </div>
        </div>

        <div className="m-card" style={{
          background: '#f8fafc', padding: 12, marginBottom: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          fontSize: 13,
        }}>
          <span style={{ color: '#64748b' }}>{estadoActual || '—'}</span>
          <ChevronRight size={14} style={{ color: '#94a3b8' }} />
          <strong style={{ color: 'var(--m-brand)' }}>{estadoSugerido}</strong>
        </div>

        {error && (
          <div style={{
            background: '#fef2f2', color: '#b91c1c', border: '1px solid #fca5a5',
            borderRadius: 10, padding: 10, fontSize: 12, marginBottom: 10,
            display: 'flex', gap: 8, alignItems: 'flex-start',
          }}>
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} className="m-btn m-btn-outline" style={{ flex: 1 }}>
            No, dejarlo así
          </button>
          <button
            onClick={aplicar}
            disabled={aplicando}
            className="m-btn m-btn-primary"
            style={{ flex: 1.5 }}
          >
            {aplicando
              ? <><Loader2 className="m-spin" size={16} /> Aplicando…</>
              : <><Check size={16} /> Sí, avanzar</>}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default MobileMovimientoDetalle;
