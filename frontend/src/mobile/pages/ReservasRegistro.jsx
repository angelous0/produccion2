import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Loader2, Package, AlertTriangle, Ban,
  ChevronUp, ChevronDown, BookmarkCheck, Check, Plus, X, Layers,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { puede, ACCIONES } from '../utils/permisos';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Reservas de MP del registro (mockup 46).
 *
 *   GET    /api/registros/:id/reservas → cabeceras + líneas
 *   DELETE /api/reservas/:reserva_id   → anular reserva completa
 *
 * Estados de reserva: ACTIVA · ANULADA · CERRADA.
 */
export const MobileReservasRegistro = () => {
  const { id: registroId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const puedeAnular = puede(user, ACCIONES.ANULAR_RESERVA);
  const puedeReservar = puede(user, ACCIONES.RESERVAR_MP);
  const puedeGenerar = puede(user, ACCIONES.GENERAR_REQUERIMIENTO);

  const [registro, setRegistro] = useState(null);
  const [reservas, setReservas] = useState([]);
  const [materiales, setMateriales] = useState(null); // requerimiento + rollos
  const [expandida, setExpandida] = useState(null);
  const [loading, setLoading] = useState(true);
  const [anulando, setAnulando] = useState(null);
  const [formAbierto, setFormAbierto] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [errorGen, setErrorGen] = useState('');

  const cargar = async () => {
    setLoading(true);
    try {
      const [regRes, resRes, matRes] = await Promise.all([
        axios.get(`${API}/registros/${registroId}`),
        axios.get(`${API}/registros/${registroId}/reservas`),
        axios.get(`${API}/registros/${registroId}/materiales`).catch(() => null),
      ]);
      setRegistro(regRes.data);
      setReservas(resRes.data?.reservas || []);
      setMateriales(matRes?.data || null);
    } catch {
      setReservas([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [registroId]);

  // KPIs
  const kpis = useMemo(() => {
    let activas = 0, anuladas = 0;
    let totalLineas = 0, totalReservado = 0, totalLiberado = 0, totalActivo = 0;
    for (const r of reservas) {
      if (r.estado === 'ACTIVA') activas++;
      else if (r.estado === 'ANULADA') anuladas++;
      for (const l of (r.lineas || [])) {
        totalLineas++;
        totalReservado += Number(l.cantidad_reservada || 0);
        totalLiberado += Number(l.cantidad_liberada || 0);
        totalActivo += Number(l.cantidad_activa || 0);
      }
    }
    return { activas, anuladas, totalLineas, totalReservado, totalLiberado, totalActivo };
  }, [reservas]);

  // Pendientes por reservar (del requerimiento del BOM)
  const pendientes = useMemo(() => {
    const lns = materiales?.lineas || [];
    return lns
      .map(l => {
        const req = Number(l.cantidad_requerida || 0);
        const res = Number(l.cantidad_reservada || 0);
        const pend = Math.max(0, req - res);
        return { ...l, pendiente: pend };
      })
      .filter(l => l.pendiente > 0);
  }, [materiales]);

  const anularReserva = async (reserva) => {
    if (!window.confirm(`¿Anular la reserva del ${fmtFecha(reserva.fecha)}? Esto libera todo lo reservado activo.`)) return;
    setAnulando(reserva.id);
    try {
      await axios.delete(`${API}/reservas/${reserva.id}`);
      await cargar();
    } catch (e) {
      window.alert(e?.response?.data?.detail || 'No se pudo anular la reserva');
    } finally {
      setAnulando(null);
    }
  };

  /**
   * Explota el BOM del modelo y crea las líneas de prod_registro_requerimiento_mp.
   * El backend auto-selecciona el mejor BOM (APROBADO > BORRADOR, versión más reciente).
   * Errores frecuentes:
   *   · "Ingresa cantidades reales por talla antes de generar el requerimiento"
   *   · "El modelo no tiene BOM definido"
   */
  const generarRequerimiento = async () => {
    setErrorGen('');
    setGenerando(true);
    try {
      await axios.post(`${API}/registros/${registroId}/generar-requerimiento`);
      await cargar();
    } catch (e) {
      const det = e?.response?.data?.detail;
      setErrorGen(typeof det === 'string' ? det : 'No se pudo generar el requerimiento');
    } finally {
      setGenerando(false);
    }
  };

  // ¿El corte ya tiene requerimiento explotado?
  const tieneRequerimiento = Boolean(materiales?.tiene_requerimiento);

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
          <div style={{
            fontWeight: 600, fontSize: 15, lineHeight: 1.2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {registro?.modelo_nombre || registro?.modelo_manual?.nombre_modelo || 'Reservas'}
          </div>
          <div style={{
            fontSize: 11, opacity: 0.85, marginTop: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {registro?.n_corte} · Reservas de MP
          </div>
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* CASO A: corte sin requerimiento explotado del BOM */}
        {!tieneRequerimiento && (
          <div className="m-card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
              <Layers size={20} style={{ color: 'var(--m-brand)', flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Generar requerimiento del BOM</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, lineHeight: 1.4 }}>
                  El corte aún no tiene la lista de materiales calculada. Al generarla, el sistema
                  toma el BOM aprobado del modelo y explota cuánto se necesita de cada material según
                  las tallas. Después podrás reservar todo con 1 toque.
                </div>
              </div>
            </div>

            {errorGen && (
              <div style={{
                background: '#fef2f2', color: '#b91c1c',
                border: '1px solid #fca5a5', borderRadius: 10,
                padding: 10, fontSize: 12, marginBottom: 10,
                display: 'flex', gap: 8, alignItems: 'flex-start',
              }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{errorGen}</span>
              </div>
            )}

            {puedeGenerar ? (
              <button
                onClick={generarRequerimiento}
                disabled={generando}
                className="m-btn m-btn-primary"
                style={{ width: '100%', justifyContent: 'center', gap: 6 }}
              >
                {generando
                  ? <><Loader2 className="m-spin" size={16} /> Generando…</>
                  : <><Layers size={16} /> Generar requerimiento</>}
              </button>
            ) : (
              <div style={{
                background: '#f8fafc', color: '#64748b',
                borderRadius: 10, padding: 10, fontSize: 12, textAlign: 'center',
              }}>
                Pide a un admin o supervisor de inventario que lo genere.
              </div>
            )}
          </div>
        )}

        {/* Botón Reservar pendiente — visible si hay requerimiento + pendiente + permiso */}
        {tieneRequerimiento && puedeReservar && pendientes.length > 0 && (
          <button
            onClick={() => setFormAbierto(true)}
            className="m-btn m-btn-primary"
            style={{ width: '100%', justifyContent: 'center', gap: 6 }}
          >
            <Plus size={18} />
            Reservar pendiente · {pendientes.length} ítem{pendientes.length !== 1 ? 's' : ''}
          </button>
        )}

        {reservas.length === 0 ? (
          tieneRequerimiento ? (
            <div className="m-card" style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>
              <BookmarkCheck size={36} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <p style={{ margin: 0, fontSize: 14 }}>
                Este corte aún no tiene reservas de MP.
              </p>
              {pendientes.length > 0 ? (
                <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
                  Hay {pendientes.length} ítem{pendientes.length !== 1 ? 's' : ''} pendiente{pendientes.length !== 1 ? 's' : ''} de reservar.
                  {puedeReservar ? ' Tocá el botón de arriba.' : ' Pide a un admin que las reserve.'}
                </p>
              ) : (
                <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
                  Nada pendiente · el requerimiento está completo o ya consumido.
                </p>
              )}
            </div>
          ) : null
        ) : (
          <>
            {/* KPIs */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
              padding: 12, background: 'var(--m-brand-soft)', borderRadius: 12,
              textAlign: 'center',
            }}>
              <Kpi label="Activas" value={kpis.activas} fg="var(--m-brand)" />
              <Kpi label="Reservado" value={fmtCant(kpis.totalActivo)} fg="#0f172a" mono />
              <Kpi label="Liberado" value={fmtCant(kpis.totalLiberado)} fg="#64748b" mono />
            </div>

            <div className="m-label-xs" style={{ marginTop: 4 }}>
              Reservas ({reservas.length})
            </div>

            {reservas.map(r => (
              <ReservaCard
                key={r.id}
                reserva={r}
                expandida={expandida === r.id}
                onToggle={() => setExpandida(expandida === r.id ? null : r.id)}
                onAnular={() => anularReserva(r)}
                anulando={anulando === r.id}
                puedeAnular={puedeAnular}
              />
            ))}
          </>
        )}
      </div>

      {/* Sheet de creación de reservas */}
      {formAbierto && (
        <CrearReservaSheet
          registroId={registroId}
          pendientes={pendientes}
          onClose={() => setFormAbierto(false)}
          onCreated={async () => {
            setFormAbierto(false);
            await cargar();
          }}
        />
      )}
    </>
  );
};

/* ──────── Card de una reserva ──────── */
const ReservaCard = ({ reserva, expandida, onToggle, onAnular, anulando, puedeAnular }) => {
  const estado = reserva.estado || 'ACTIVA';
  const cfg = estadoCfg(estado);
  const totalActivo = (reserva.lineas || []).reduce(
    (s, l) => s + Number(l.cantidad_activa || 0), 0
  );

  return (
    <div className="m-card" style={{ padding: 0, overflow: 'hidden' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', padding: 12,
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'transparent', border: 0,
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: cfg.bg, color: cfg.fg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          {estado === 'ANULADA' ? <Ban size={16} /> : <BookmarkCheck size={16} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
          }}>
            <strong style={{ fontSize: 13 }}>{fmtFecha(reserva.fecha)}</strong>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
              background: cfg.bg, color: cfg.fg,
              textTransform: 'uppercase', letterSpacing: '.02em',
            }}>
              {estado}
            </span>
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
            {(reserva.lineas?.length || 0)} línea{reserva.lineas?.length !== 1 ? 's' : ''}
            {totalActivo > 0 && (
              <> · <strong style={{ color: 'var(--m-brand)', fontFamily: 'ui-monospace, monospace' }}>
                {fmtCant(totalActivo)}
              </strong> activo</>
            )}
          </div>
          {reserva.observaciones && !expandida && (
            <div style={{
              fontSize: 10, color: '#94a3b8', marginTop: 2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              "{reserva.observaciones}"
            </div>
          )}
        </div>
        {expandida ? <ChevronUp size={18} style={{ color: '#cbd5e1' }} />
                   : <ChevronDown size={18} style={{ color: '#cbd5e1' }} />}
      </button>

      {expandida && (
        <div style={{ borderTop: '1px solid #f1f5f9' }}>
          {reserva.observaciones && (
            <div style={{
              padding: 12, background: '#f8fafc',
              fontSize: 12, color: '#475569', fontStyle: 'italic',
              borderBottom: '1px solid #f1f5f9',
            }}>
              "{reserva.observaciones}"
            </div>
          )}

          {(reserva.lineas || []).length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
              Sin líneas en esta reserva.
            </div>
          ) : (
            (reserva.lineas || []).map((l, i) => (
              <LineaReserva key={l.id || i} linea={l} />
            ))
          )}

          {estado === 'ACTIVA' && puedeAnular && (
            <div style={{ padding: 10 }}>
              <button
                onClick={(e) => { e.stopPropagation(); onAnular(); }}
                disabled={anulando}
                className="m-btn m-btn-outline"
                style={{
                  width: '100%', minHeight: 40, fontSize: 12,
                  borderColor: '#fca5a5', color: '#b91c1c',
                }}
              >
                {anulando
                  ? <><Loader2 className="m-spin" size={14} /> Anulando...</>
                  : <><Ban size={14} /> Anular reserva</>}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ──────── Una línea de reserva ──────── */
const LineaReserva = ({ linea }) => {
  const activa = Number(linea.cantidad_activa || 0);
  const liberada = Number(linea.cantidad_liberada || 0);
  const reservada = Number(linea.cantidad_reservada || 0);
  const pctLiberado = reservada > 0 ? (liberada / reservada) * 100 : 0;

  return (
    <div style={{
      padding: 12, borderBottom: '1px solid #f8fafc',
      display: 'flex', gap: 10, alignItems: 'flex-start',
    }}>
      <Package size={16} style={{ color: '#94a3b8', flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 600,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {linea.item_nombre || '—'}
        </div>
        {linea.item_codigo && (
          <div style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'ui-monospace, monospace' }}>
            {linea.item_codigo}
            {linea.talla_nombre ? ` · Talla ${linea.talla_nombre}` : ''}
          </div>
        )}
        <div style={{
          marginTop: 6, fontSize: 11,
          display: 'flex', gap: 12, flexWrap: 'wrap',
        }}>
          <span style={{ color: '#64748b' }}>
            Reservado: <strong style={{ color: '#0f172a', fontFamily: 'ui-monospace, monospace' }}>
              {fmtCant(reservada)}
            </strong> {linea.item_unidad || ''}
          </span>
          {liberada > 0 && (
            <span style={{ color: '#15803d' }}>
              <Check size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> Liberado: <strong style={{ fontFamily: 'ui-monospace, monospace' }}>
                {fmtCant(liberada)}
              </strong>
            </span>
          )}
        </div>
        {activa > 0 && reservada > 0 && (
          <div style={{
            marginTop: 6, height: 5, background: '#f1f5f9',
            borderRadius: 999, overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', width: `${Math.min(100, pctLiberado)}%`,
              background: '#15803d',
            }} />
          </div>
        )}
      </div>
      <div style={{
        textAlign: 'right', flexShrink: 0,
      }}>
        <div style={{
          fontFamily: 'ui-monospace, monospace',
          fontWeight: 700, fontSize: 14,
          color: activa > 0 ? 'var(--m-brand)' : '#94a3b8',
        }}>
          {fmtCant(activa)}
        </div>
        <div style={{
          fontSize: 9, color: '#94a3b8', fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '.04em',
        }}>
          activo
        </div>
      </div>
    </div>
  );
};

const Kpi = ({ label, value, fg, mono = false }) => (
  <div>
    <div style={{
      fontSize: 20, fontWeight: 800, color: fg,
      fontFamily: mono ? 'ui-monospace, monospace' : 'inherit', lineHeight: 1.1,
    }}>{value}</div>
    <div style={{
      fontSize: 10, color: '#64748b', fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '.04em', marginTop: 2,
    }}>{label}</div>
  </div>
);

function estadoCfg(estado) {
  switch (estado) {
    case 'ACTIVA':  return { bg: 'var(--m-brand-soft)', fg: 'var(--m-brand)' };
    case 'ANULADA': return { bg: '#fee2e2',             fg: '#b91c1c' };
    case 'CERRADA': return { bg: '#dcfce7',             fg: '#15803d' };
    default:        return { bg: '#f1f5f9',             fg: '#475569' };
  }
}

function fmtCant(n) {
  const v = Number(n || 0);
  return v.toLocaleString('es-PE', { maximumFractionDigits: 2 });
}

function fmtFecha(iso) {
  if (!iso) return '—';
  const s = String(iso).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  }
  return s;
}

/* ═══════════════════════════════════════════════════════════════════════
   Sheet · Crear reserva — todo pre-marcado, FIFO para rollos
   ─────────────────────────────────────────────────────────────────────
   Cada línea pendiente arranca incluida (incluida=true) con la cantidad
   pendiente sugerida. Para items control_por_rollos se seleccionan los
   rollos más antiguos hasta cubrir la cantidad. El usuario puede:
     · toggle de inclusión por línea
     · ajustar cantidad con stepper
     · cambiar selección de rollos
   POST /api/registros/:id/reservas con lineas = [{ item_id, talla_id, cantidad }]
   ═══════════════════════════════════════════════════════════════════════ */
const CrearReservaSheet = ({ registroId, pendientes, onClose, onCreated }) => {
  const [lineas, setLineas] = useState(() => inicializarLineas(pendientes));
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const incluidas = lineas.filter(l => l.incluida && Number(l.cantidad) > 0);
  const totalItems = incluidas.length;

  const toggleIncluida = (idx) => {
    setLineas(prev => prev.map((l, i) => i === idx ? { ...l, incluida: !l.incluida } : l));
  };

  const setCantidad = (idx, valor) => {
    setLineas(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      const max = Number(l.pendiente_max || l.cantidad);
      const n = Math.max(0, Math.min(Number(valor) || 0, max));
      return { ...l, cantidad: n };
    }));
  };

  const enviar = async () => {
    if (incluidas.length === 0) return;
    setError('');
    setEnviando(true);
    try {
      const payload = {
        lineas: incluidas.map(l => ({
          item_id: l.item_id,
          talla_id: l.talla_id || null,
          cantidad: Number(l.cantidad),
        })),
      };
      await axios.post(`${API}/registros/${registroId}/reservas`, payload);
      onCreated();
    } catch (e) {
      const det = e?.response?.data?.detail;
      if (det?.errores && Array.isArray(det.errores)) {
        setError(det.errores.join(' · '));
      } else {
        setError(typeof det === 'string' ? det : 'No se pudo crear la reserva');
      }
    } finally {
      setEnviando(false);
    }
  };

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        zIndex: 100, display: 'flex', alignItems: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white', width: '100%',
          borderTopLeftRadius: 20, borderTopRightRadius: 20,
          maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Handle + header */}
        <div style={{ padding: '10px 20px 0' }}>
          <div style={{ width: 40, height: 4, background: '#cbd5e1', borderRadius: 2, margin: '0 auto 10px' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Reservar MP pendiente</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                Todo está pre-marcado · ajustá si querés
              </div>
            </div>
            <button onClick={onClose} style={{
              background: 'transparent', border: 0, padding: 4, cursor: 'pointer', color: '#94a3b8',
            }}><X size={20} /></button>
          </div>
        </div>

        {/* Lista de líneas */}
        <div style={{
          flex: 1, overflowY: 'auto',
          padding: '12px 20px 20px',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {lineas.map((l, idx) => (
            <LineaPendiente
              key={`${l.item_id}-${l.talla_id || 'null'}`}
              linea={l}
              onToggle={() => toggleIncluida(idx)}
              onCantidad={(v) => setCantidad(idx, v)}
            />
          ))}

          {lineas.length === 0 && (
            <div style={{
              padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13,
            }}>
              No hay materiales pendientes de reservar.
            </div>
          )}
        </div>

        {/* Footer fijo */}
        <div style={{
          padding: '12px 20px 20px',
          paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
          borderTop: '1px solid #f1f5f9',
          background: 'white',
        }}>
          {error && (
            <div style={{
              background: '#fef2f2', color: '#b91c1c',
              border: '1px solid #fca5a5', borderRadius: 10,
              padding: 10, fontSize: 12, marginBottom: 10,
              display: 'flex', gap: 8, alignItems: 'flex-start',
            }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}

          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 10, fontSize: 13,
          }}>
            <span style={{ color: '#64748b' }}>Reservar</span>
            <strong style={{ color: 'var(--m-brand)' }}>
              {totalItems} ítem{totalItems !== 1 ? 's' : ''}
            </strong>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} className="m-btn m-btn-outline" style={{ flex: 1 }}>
              Cancelar
            </button>
            <button
              onClick={enviar}
              disabled={enviando || totalItems === 0}
              className="m-btn m-btn-primary"
              style={{ flex: 1.5 }}
            >
              {enviando
                ? <><Loader2 className="m-spin" size={16} /> Reservando…</>
                : <><Check size={16} /> Confirmar reserva</>}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

const LineaPendiente = ({ linea, onToggle, onCantidad }) => {
  const usaRollos = linea.control_por_rollos;
  const cantidad = Number(linea.cantidad || 0);
  const max = Number(linea.pendiente_max || 0);

  return (
    <div style={{
      background: linea.incluida ? 'white' : '#f8fafc',
      border: `1px solid ${linea.incluida ? 'var(--m-brand)' : '#e2e8f0'}`,
      borderRadius: 12,
      padding: 12,
      opacity: linea.incluida ? 1 : 0.6,
    }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <button
          onClick={onToggle}
          style={{
            width: 22, height: 22, borderRadius: 6,
            border: `2px solid ${linea.incluida ? 'var(--m-brand)' : '#cbd5e1'}`,
            background: linea.incluida ? 'var(--m-brand)' : 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, cursor: 'pointer', padding: 0,
          }}
        >
          {linea.incluida && <Check size={14} color="white" strokeWidth={3} />}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 600, fontSize: 13,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {linea.item_nombre || '—'}
          </div>
          <div style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'ui-monospace, monospace' }}>
            {linea.item_codigo}
            {linea.talla_nombre ? ` · Talla ${linea.talla_nombre}` : ''}
            {usaRollos && <span style={{ marginLeft: 6, color: '#0f766e' }}>· por rollos</span>}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
            Pendiente <strong style={{ fontFamily: 'ui-monospace, monospace', color: '#0f172a' }}>
              {fmtCant(max)}
            </strong> {linea.item_unidad || ''}
            {' · '}
            Disponible <strong style={{ fontFamily: 'ui-monospace, monospace', color: '#15803d' }}>
              {fmtCant(linea.disponible)}
            </strong>
          </div>
        </div>
      </div>

      {linea.incluida && (
        <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Cantidad</span>
          <input
            type="number"
            value={cantidad}
            onChange={(e) => onCantidad(e.target.value)}
            min={0}
            max={max}
            step={0.1}
            style={{
              flex: 1, minHeight: 36, padding: '0 10px',
              border: '1px solid #d1d5db', borderRadius: 8,
              fontFamily: 'ui-monospace, monospace', textAlign: 'right',
              fontSize: 14, fontWeight: 600,
            }}
          />
          <button
            onClick={() => onCantidad(max)}
            style={{
              background: 'var(--m-brand-soft)', color: 'var(--m-brand)',
              border: 0, borderRadius: 8, padding: '0 10px', height: 36,
              fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Todo
          </button>
        </div>
      )}

      {linea.incluida && usaRollos && cantidad > Number(linea.disponible || 0) && (
        <div style={{
          marginTop: 8, padding: '6px 10px',
          background: '#fef3c7', color: '#92400e',
          borderRadius: 8, fontSize: 11,
          display: 'flex', gap: 6, alignItems: 'center',
        }}>
          <AlertTriangle size={12} />
          Excede el disponible · el backend rechazará la línea.
        </div>
      )}
    </div>
  );
};

/**
 * Convierte el array de pendientes del BOM en el estado inicial del form.
 * Cada línea: incluida=true por defecto, cantidad = pendiente exacto.
 */
function inicializarLineas(pendientes) {
  return pendientes.map(p => ({
    item_id: p.item_id,
    talla_id: p.talla_id,
    item_nombre: p.item_nombre,
    item_codigo: p.item_codigo,
    item_unidad: p.item_unidad,
    talla_nombre: p.talla_nombre,
    control_por_rollos: p.control_por_rollos,
    pendiente_max: Number(p.pendiente || 0),
    disponible: Number(p.disponible || 0),
    cantidad: Math.min(Number(p.pendiente || 0), Number(p.disponible || 0)),
    incluida: Number(p.disponible || 0) > 0,
  }));
}

export default MobileReservasRegistro;
