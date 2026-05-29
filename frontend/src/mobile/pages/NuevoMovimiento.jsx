import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Loader2, Check, AlertTriangle, ChevronDown,
  CheckCircle2, User, DollarSign, Lock, ArrowRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { serviciosPermitidos } from '../utils/permisos';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Normaliza un nombre de servicio a la clave canónica usada en permisos.
 * "Costura", "COSTURA", "Lavandería" → "costura", "costura", "lavanderia"
 */
function normalizarNombreServicio(nombre) {
  if (!nombre) return '';
  return String(nombre)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // sin acentos
    .trim();
}

/**
 * Crear nuevo movimiento de producción.
 * POST /api/movimientos-produccion
 *  { registro_id, servicio_id, persona_id, cantidad_enviada, cantidad_recibida,
 *    fecha_inicio, fecha_esperada_movimiento, observaciones, tarifa_aplicada }
 */
export const MobileNuevoMovimiento = () => {
  const { id: registroId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Servicios que ESTE usuario puede crear según su rol (lista de claves canónicas).
  const serviciosUsuario = useMemo(() => serviciosPermitidos(user), [user]);
  const puedeCrearAlgunMovimiento = serviciosUsuario.length > 0;

  const [registro, setRegistro] = useState(null);
  const [servicios, setServicios] = useState([]);
  const [personas, setPersonas] = useState([]);
  const [movimientosPrevios, setMovimientosPrevios] = useState([]);
  const [loadingInicial, setLoadingInicial] = useState(true);

  // form
  const [servicioId, setServicioId] = useState('');
  const [personaId, setPersonaId] = useState('');
  const [fechaInicio, setFechaInicio] = useState(hoyISO());
  const [diasPlazo, setDiasPlazo] = useState(''); // vacío = sin fecha esperada
  // Fecha esperada calculada a partir de fechaInicio + diasPlazo (derivada, no editable directo)
  const fechaEsperada = diasPlazo ? masDiasDesde(fechaInicio, Number(diasPlazo)) : '';
  const [cantidadEnviada, setCantidadEnviada] = useState(0);
  const [observaciones, setObservaciones] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState(null);
  const [showPicker, setShowPicker] = useState(false); // bottom sheet de persona
  // Tarifa override (si el usuario quiere modificarla puntualmente)
  const [tarifaOverride, setTarifaOverride] = useState(null); // null = usar la sugerida
  const [editandoTarifa, setEditandoTarifa] = useState(false);

  // Sprint 44b: para sugerir cambio de estado tras crear el movimiento
  const [estadosDisponibles, setEstadosDisponibles] = useState(null);

  // 1) Cargar todo lo necesario
  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [regRes, servRes, persRes, movRes, estRes] = await Promise.all([
          axios.get(`${API}/registros/${registroId}`),
          axios.get(`${API}/servicios-produccion`).catch(() => ({ data: [] })),
          axios.get(`${API}/personas-produccion`).catch(() => ({ data: [] })),
          axios.get(`${API}/movimientos-produccion?registro_id=${registroId}&limit=200`).catch(() => ({ data: { items: [] } })),
          axios.get(`${API}/registros/${registroId}/estados-disponibles`).catch(() => ({ data: null })),
        ]);
        setRegistro(regRes.data);
        setEstadosDisponibles(estRes.data || null);
        setServicios(Array.isArray(servRes.data) ? servRes.data : (servRes.data?.items || []));
        setPersonas(Array.isArray(persRes.data) ? persRes.data : (persRes.data?.items || []));
        const movs = movRes.data?.items || movRes.data || [];
        setMovimientosPrevios(Array.isArray(movs) ? movs : []);

        // Default cantidad: cantidad efectiva del último movimiento, o total prendas
        const totalPzs = totalPrendasDe(regRes.data);
        const ultimo = (Array.isArray(movs) ? movs : [])
          .filter(m => Number(m.cantidad_recibida ?? m.cantidad ?? 0) > 0)
          .sort((a, b) => (b.fecha_fin || b.fecha_inicio || '').localeCompare(a.fecha_fin || a.fecha_inicio || ''))[0];
        const cantEfectiva = ultimo
          ? Number(ultimo.cantidad_recibida ?? ultimo.cantidad ?? 0)
          : totalPzs;
        setCantidadEnviada(cantEfectiva);
      } catch (e) {
        setError('No se pudo cargar la información');
      } finally {
        setLoadingInicial(false);
      }
    };
    fetchAll();
  }, [registroId]);

  // Servicios ya cerrados en este registro (fecha_fin presente)
  const serviciosCerrados = useMemo(() => {
    const ids = new Set();
    movimientosPrevios.forEach(m => {
      if (m.fecha_fin && m.servicio_id) ids.add(m.servicio_id);
    });
    return ids;
  }, [movimientosPrevios]);

  // Servicios que el USUARIO puede crear según su rol.
  // Si es admin, ve todos. Si no, filtramos por nombre canónico.
  const serviciosVisibles = useMemo(() => {
    if (user?.rol === 'admin') return servicios;
    return servicios.filter(s => {
      const canon = normalizarNombreServicio(s.nombre);
      return serviciosUsuario.includes(canon);
    });
  }, [servicios, serviciosUsuario, user]);

  // Personas que ofrecen el servicio seleccionado
  const personasFiltradas = useMemo(() => {
    if (!servicioId) return personas;
    return personas.filter(p => {
      let srv = p.servicios;
      if (typeof srv === 'string') {
        try { srv = JSON.parse(srv); } catch { srv = []; }
      }
      if (!Array.isArray(srv)) return false;
      return srv.some(s => {
        const sid = typeof s === 'string' ? s : s?.servicio_id;
        return sid === servicioId;
      });
    });
  }, [servicioId, personas]);

  const servicioActual = useMemo(
    () => servicios.find(s => s.id === servicioId),
    [servicios, servicioId]
  );
  const personaActual = useMemo(
    () => personas.find(p => p.id === personaId),
    [personas, personaId]
  );

  // Tarifa: del array servicios[] de la persona, busca la que coincide con servicio_id
  const tarifaSugerida = useMemo(() => {
    if (!personaActual || !servicioId) return null;
    let srv = personaActual.servicios;
    if (typeof srv === 'string') {
      try { srv = JSON.parse(srv); } catch { srv = []; }
    }
    if (!Array.isArray(srv)) return null;
    const match = srv.find(s => (typeof s === 'object' && s?.servicio_id === servicioId));
    if (match && typeof match.tarifa === 'number') return match.tarifa;
    // fallback: tarifa base del servicio
    return Number(servicioActual?.tarifa || 0);
  }, [personaActual, servicioId, servicioActual]);

  // Tarifa final = override si se editó, sino la sugerida
  const tarifaFinal = tarifaOverride !== null ? Number(tarifaOverride) : tarifaSugerida;

  const costoEstimado = useMemo(() => {
    if (!tarifaFinal) return 0;
    return Number(cantidadEnviada) * Number(tarifaFinal);
  }, [tarifaFinal, cantidadEnviada]);

  // Cuando cambia la persona/servicio, reseteamos override (vuelve a la sugerida)
  useEffect(() => {
    setTarifaOverride(null);
    setEditandoTarifa(false);
  }, [personaId, servicioId]);

  // Cuando cambia el servicio, limpia la persona si ya no aplica
  useEffect(() => {
    if (!personaId) return;
    if (!personasFiltradas.find(p => p.id === personaId)) {
      setPersonaId('');
    }
  }, [personasFiltradas, personaId]);

  const onGuardar = async () => {
    setError('');
    if (!servicioId) { setError('Selecciona un servicio'); return; }
    if (!personaId)  { setError('Selecciona la persona o taller'); return; }
    if (Number(cantidadEnviada) <= 0) { setError('Cantidad enviada debe ser mayor a 0'); return; }

    setEnviando(true);
    try {
      const body = {
        registro_id: registroId,
        servicio_id: servicioId,
        persona_id: personaId,
        cantidad_enviada: Number(cantidadEnviada),
        cantidad_recibida: 0,
        fecha_inicio: fechaInicio,
        observaciones: observaciones.trim(),
        tarifa_aplicada: Number(tarifaFinal || 0),
      };
      if (fechaEsperada) body.fecha_esperada_movimiento = fechaEsperada;
      const res = await axios.post(`${API}/movimientos-produccion`, body);

      // Sprint 44b: sugerir cambio de estado si el siguiente directo de la ruta
      // coincide con el servicio del movimiento recién creado.
      // Caso típico: estás "Para Lavandería" → creás movimiento de Lavandería →
      // sugerimos pasar a "Lavandería" (estado de proceso).
      let sugerenciaEstado = null;
      const sigDir = estadosDisponibles?.siguientes_directos || [];
      const matchSugerencia = sigDir.find(e =>
        e.servicio_id === servicioId &&
        // es estado de proceso (no "Para X")
        !/^para\s+/i.test(e.nombre || '')
      );
      if (matchSugerencia) sugerenciaEstado = matchSugerencia.nombre;

      setExito({
        movimiento: res.data,
        servicio: servicioActual,
        persona: personaActual,
        cantidad: Number(cantidadEnviada),
        costo: costoEstimado,
        sugerenciaEstado,
        estadoActualPrev: registro?.estado || null,
      });
    } catch (e) {
      const detail = e?.response?.data?.detail || 'Error al crear movimiento';
      setError(typeof detail === 'string' ? detail : 'Error al crear movimiento');
    } finally {
      setEnviando(false);
    }
  };

  if (loadingInicial) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>
        <Loader2 className="m-spin" size={32} style={{ margin: '0 auto' }} />
      </div>
    );
  }

  if (exito) {
    return <ExitoMov data={exito} registroId={registroId} onNuevo={() => {
      setExito(null);
      setServicioId('');
      setPersonaId('');
      setCantidadEnviada(totalPrendasDe(registro));
      setObservaciones('');
    }} />;
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
            {registro?.modelo_nombre || registro?.modelo_manual?.nombre_modelo || 'Nuevo movimiento'}
          </div>
          <div style={{
            fontSize: 11, opacity: 0.85, marginTop: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {registro?.n_corte}
            {registro?.estado && <> · {registro.estado}</>}
            {' · Nuevo movimiento'}
          </div>
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Bloqueo si el usuario no puede crear ningún tipo de movimiento */}
        {!puedeCrearAlgunMovimiento && (
          <div className="m-card" style={{
            background: '#fef3c7', border: '1px solid #fcd34d',
            color: '#92400e', padding: 16, textAlign: 'center',
          }}>
            <Lock size={28} style={{ margin: '0 auto 8px' }} />
            <div style={{ fontWeight: 700, fontSize: 14 }}>Sin permiso para crear movimientos</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              Tu rol ({user?.rol || 'sin rol'}) no permite crear movimientos en este sistema.
            </div>
          </div>
        )}

        {/* Servicio */}
        <div style={{ opacity: puedeCrearAlgunMovimiento ? 1 : 0.5, pointerEvents: puedeCrearAlgunMovimiento ? 'auto' : 'none' }}>
          <span className="m-label-xs">Servicio</span>
          <div style={{
            display: 'flex', gap: 6, overflowX: 'auto',
            paddingBottom: 4, marginTop: 8,
            WebkitOverflowScrolling: 'touch',
          }}>
            {serviciosVisibles.map(s => {
              const cerrado = serviciosCerrados.has(s.id);
              const activo = servicioId === s.id;
              return (
                <button
                  key={s.id}
                  className={`m-chip ${activo ? 'active' : ''}`}
                  style={{
                    fontSize: 12, minHeight: 36, padding: '6px 12px',
                    ...(cerrado && !activo ? { opacity: 0.55 } : {}),
                  }}
                  onClick={() => setServicioId(s.id)}
                >
                  {cerrado && <Check size={12} />}
                  {s.nombre}
                </button>
              );
            })}
          </div>
          {servicioActual && (
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
              Tarifa base: <strong>S/. {Number(servicioActual.tarifa || 0).toFixed(2)}</strong> / prenda
              {serviciosCerrados.has(servicioActual.id) && (
                <> · <span style={{ color: '#0f766e' }}>Ya tiene movimiento cerrado en este servicio</span></>
              )}
            </div>
          )}
        </div>

        {/* Persona / Taller */}
        <div>
          <span className="m-label-xs">Taller / Persona</span>
          <button
            className="m-input"
            disabled={!servicioId}
            onClick={() => setShowPicker(true)}
            style={{
              marginTop: 6, textAlign: 'left',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 8,
              opacity: !servicioId ? 0.6 : 1,
              cursor: !servicioId ? 'not-allowed' : 'pointer',
              background: 'white',
            }}
          >
            {personaActual ? (
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{personaActual.nombre}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  {personaActual.tipo}
                  {tarifaSugerida != null && <> · S/. {Number(tarifaSugerida).toFixed(2)}</>}
                </div>
              </div>
            ) : (
              <span style={{ color: '#94a3b8' }}>
                {servicioId ? 'Selecciona persona o taller' : 'Primero elige un servicio'}
              </span>
            )}
            <ChevronDown size={18} style={{ color: '#94a3b8' }} />
          </button>
        </div>

        {/* Tarifa editable (opcional) */}
        {personaId && tarifaSugerida != null && (
          <div className="m-card" style={{ padding: 12 }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>Tarifa por prenda</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  {tarifaOverride !== null
                    ? <>Sugerida <s>S/. {Number(tarifaSugerida).toFixed(2)}</s></>
                    : 'Auto-asignada según persona + servicio'}
                </div>
              </div>
              {editandoTarifa ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 12, color: '#64748b' }}>S/.</span>
                  <input
                    type="number" step="0.01" min="0"
                    autoFocus
                    value={tarifaOverride ?? tarifaSugerida}
                    onChange={(e) => setTarifaOverride(e.target.value)}
                    onBlur={() => {
                      const n = Number(tarifaOverride);
                      if (!isFinite(n) || n < 0) setTarifaOverride(null);
                      else if (Number(tarifaOverride) === Number(tarifaSugerida)) setTarifaOverride(null);
                      setEditandoTarifa(false);
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                    style={{
                      width: 90, fontFamily: 'ui-monospace, monospace',
                      fontSize: 16, fontWeight: 700, textAlign: 'right',
                      border: '1px solid var(--m-brand)', borderRadius: 8, padding: '6px 8px',
                      outline: 'none',
                    }}
                  />
                </div>
              ) : (
                <button
                  onClick={() => setEditandoTarifa(true)}
                  style={{
                    background: tarifaOverride !== null ? '#fef3c7' : '#f1f5f9',
                    border: '1px solid', borderColor: tarifaOverride !== null ? '#fcd34d' : '#e5e7eb',
                    borderRadius: 8, padding: '8px 12px',
                    fontFamily: 'ui-monospace, monospace', fontWeight: 700, fontSize: 16,
                    color: tarifaOverride !== null ? '#92400e' : '#0f172a',
                    cursor: 'pointer',
                  }}
                >
                  S/. {Number(tarifaFinal || 0).toFixed(2)}
                </button>
              )}
            </div>
            {tarifaOverride !== null && Number(tarifaOverride) !== Number(tarifaSugerida) && (
              <button
                onClick={() => { setTarifaOverride(null); setEditandoTarifa(false); }}
                style={{
                  background: 'transparent', border: 0,
                  fontSize: 11, color: 'var(--m-brand)',
                  marginTop: 6, fontWeight: 600, cursor: 'pointer', padding: 0,
                }}
              >
                Volver a la tarifa sugerida
              </button>
            )}
          </div>
        )}

        {/* Fechas */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <span className="m-label-xs">F. inicio</span>
            <input
              type="date" className="m-input"
              style={{ marginTop: 6 }}
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
            />
          </div>
          <div>
            <span className="m-label-xs">Plazo · días (opcional)</span>
            <input
              type="number" className="m-input"
              style={{ marginTop: 6, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}
              min="0"
              placeholder="—"
              value={diasPlazo}
              onChange={(e) => {
                const v = e.target.value;
                // Permite vacío o enteros >= 0
                if (v === '' || /^\d+$/.test(v)) setDiasPlazo(v);
              }}
            />
          </div>
        </div>

        {/* Preview de fecha esperada calculada */}
        {fechaEsperada && (
          <div style={{
            background: '#f1f5f9', borderRadius: 12,
            padding: '8px 12px', fontSize: 12, color: '#475569',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginTop: -8,
          }}>
            <span>
              Termina <strong style={{ color: '#0f172a' }}>en {diasPlazo} {Number(diasPlazo) === 1 ? 'día' : 'días'}</strong>
            </span>
            <span style={{ fontFamily: 'ui-monospace, monospace', color: '#0f766e', fontWeight: 600 }}>
              {fmtFechaCorta(fechaEsperada)}
            </span>
          </div>
        )}

        {/* Cantidad enviada */}
        <div>
          <span className="m-label-xs">Cantidad enviada</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, justifyContent: 'center' }}>
            <button
              className="m-btn m-btn-outline"
              style={{ width: 48, padding: 0, fontSize: 22 }}
              onClick={() => setCantidadEnviada(Math.max(0, Number(cantidadEnviada) - 1))}
            >−</button>
            <input
              className="m-input" type="number"
              value={cantidadEnviada}
              onChange={(e) => setCantidadEnviada(Number(e.target.value) || 0)}
              style={{ maxWidth: 120, textAlign: 'center', fontSize: 22, fontWeight: 700 }}
            />
            <button
              className="m-btn m-btn-outline"
              style={{ width: 48, padding: 0, fontSize: 22 }}
              onClick={() => setCantidadEnviada(Number(cantidadEnviada) + 1)}
            >+</button>
          </div>
          {costoEstimado > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              marginTop: 10, fontSize: 12, color: '#64748b',
            }}>
              <DollarSign size={12} />
              Costo estimado:&nbsp;
              <strong style={{ color: 'var(--m-brand)', fontFamily: 'ui-monospace, monospace' }}>
                S/. {costoEstimado.toFixed(2)}
              </strong>
            </div>
          )}
        </div>

        {/* Aviso sobre cantidad recibida */}
        <div style={{
          background: '#fef3c7', border: '1px solid #fcd34d',
          color: '#92400e', borderRadius: 12, padding: '10px 12px',
          fontSize: 12, display: 'flex', alignItems: 'flex-start', gap: 8,
        }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            La <strong>cantidad recibida</strong> y la <strong>merma</strong> se registran cuando
            {personaActual ? ` ${personaActual.nombre}` : ' la persona'} devuelva el lote.
          </span>
        </div>

        {/* Observaciones */}
        <div>
          <span className="m-label-xs">Observaciones</span>
          <textarea
            rows={2}
            className="m-input"
            style={{ padding: 12, marginTop: 6, fontFamily: 'inherit', resize: 'vertical' }}
            placeholder="Notas para el taller..."
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
          />
        </div>

        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fca5a5',
            color: '#b91c1c', borderRadius: 12, padding: 12, fontSize: 13,
            display: 'flex', alignItems: 'flex-start', gap: 8,
          }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Botones */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="m-btn m-btn-outline" style={{ flex: 1 }} onClick={() => navigate(-1)}>
            Cancelar
          </button>
          <button
            className="m-btn m-btn-primary"
            style={{ flex: 2 }}
            disabled={enviando || !servicioId || !personaId || Number(cantidadEnviada) <= 0}
            onClick={onGuardar}
          >
            {enviando
              ? <><Loader2 className="m-spin" size={18} /> Guardando...</>
              : <><Check size={18} /> Guardar movimiento</>}
          </button>
        </div>
      </div>

      {showPicker && (
        <PersonaPicker
          personas={personasFiltradas}
          servicioId={servicioId}
          servicios={servicios}
          onElegir={(p) => { setPersonaId(p.id); setShowPicker(false); }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </>
  );
};

/* ───────── Bottom sheet de selección de persona ───────── */
const PersonaPicker = ({ personas, servicioId, onElegir, onClose }) => {
  const [q, setQ] = useState('');
  const filtradas = personas.filter(p =>
    !q.trim() || (p.nombre || '').toLowerCase().includes(q.toLowerCase())
  );

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
        <div style={{
          width: 40, height: 4, background: '#cbd5e1', borderRadius: 2,
          margin: '0 auto 12px',
        }} />
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
          Elegir taller / persona
        </div>
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 12 }}>
          {personas.length === 0
            ? 'No hay personas registradas para este servicio.'
            : `${personas.length} disponible${personas.length !== 1 ? 's' : ''} para este servicio`}
        </div>

        {personas.length > 5 && (
          <input
            className="m-input"
            placeholder="Buscar..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ marginBottom: 10 }}
          />
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtradas.map(p => {
            let srv = p.servicios;
            if (typeof srv === 'string') { try { srv = JSON.parse(srv); } catch { srv = []; } }
            const match = (srv || []).find(s => (typeof s === 'object' && s?.servicio_id === servicioId));
            const tarifa = match?.tarifa;
            return (
              <button
                key={p.id}
                onClick={() => onElegir(p)}
                className="m-card m-card-tap"
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12 }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: '#f1f5f9', color: '#475569',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: 13, flexShrink: 0,
                }}>
                  {(p.nombre || '?').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{p.nombre}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    {p.tipo}
                    {p.telefono && ` · ${p.telefono}`}
                  </div>
                </div>
                {tarifa != null && (
                  <span style={{
                    fontFamily: 'ui-monospace, monospace', fontWeight: 700,
                    fontSize: 13, color: 'var(--m-brand)',
                  }}>
                    S/. {Number(tarifa).toFixed(2)}
                  </span>
                )}
              </button>
            );
          })}
          {filtradas.length === 0 && (
            <div style={{ textAlign: 'center', color: '#64748b', padding: 16, fontSize: 13 }}>
              Sin resultados
            </div>
          )}
        </div>

        <button
          className="m-btn m-btn-outline"
          onClick={onClose}
          style={{ width: '100%', marginTop: 12 }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
};

/* ───────── Pantalla éxito ───────── */
const ExitoMov = ({ data, registroId, onNuevo }) => {
  const [aplicando, setAplicando] = useState(false);
  const [aplicado, setAplicado] = useState(false);
  const navigate = useNavigate();

  // Sprint 44b: aplicar sugerencia de cambio de estado en 1 toque
  const aplicarCambioEstado = async () => {
    if (!data.sugerenciaEstado) return;
    setAplicando(true);
    try {
      // Recargamos el registro fresco antes de hacer PUT (otros campos no se pierden)
      const regRes = await axios.get(`${API}/registros/${registroId}`);
      const reg = regRes.data;
      await axios.put(`${API}/registros/${registroId}`, {
        ...reg,
        estado: data.sugerenciaEstado,
      });
      setAplicado(true);
    } catch {
      // Si falla, dejamos el botón disponible para reintentar
    } finally {
      setAplicando(false);
    }
  };

  return (
    <div style={{
      minHeight: '100%', display: 'flex', flexDirection: 'column',
      background: 'linear-gradient(180deg, var(--m-brand-soft) 0%, white 100%)',
      padding: 32, textAlign: 'center', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 96, height: 96, borderRadius: '50%', background: 'white',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 10px 30px -10px rgba(15,118,110,.4)', marginBottom: 16,
      }}>
        <CheckCircle2 size={56} style={{ color: '#0f766e' }} />
      </div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>Movimiento creado</div>
      <div style={{ fontSize: 14, color: '#475569', marginTop: 4, maxWidth: 280 }}>
        {data.cantidad} prendas enviadas a {data.persona?.nombre} para <strong>{data.servicio?.nombre}</strong>
      </div>

      <div className="m-card" style={{ width: '100%', maxWidth: 320, marginTop: 24, textAlign: 'left' }}>
        <Row k="Servicio" v={data.servicio?.nombre || '—'} />
        <Row k="Persona / Taller" v={data.persona?.nombre || '—'} small />
        <Row k="Enviadas" v={data.cantidad} mono />
        {data.costo > 0 && (
          <Row k="Costo estimado" v={`S/. ${data.costo.toFixed(2)}`} mono />
        )}
      </div>

      {/* Sprint 44b: sugerencia de cambio de estado */}
      {data.sugerenciaEstado && !aplicado && (
        <div className="m-card" style={{
          width: '100%', maxWidth: 320, marginTop: 16,
          background: '#fffbeb', border: '1px solid #fde68a',
          padding: 14, textAlign: 'left',
        }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <ArrowRight size={18} style={{ color: '#b45309', flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#92400e' }}>
                ¿También avanzar el estado?
              </div>
              <div style={{ fontSize: 11, color: '#78350f', marginTop: 4, lineHeight: 1.5 }}>
                El corte está en <strong>{data.estadoActualPrev || '—'}</strong> y acabás de crear el movimiento.
                Sugerencia: pasar a <strong>{data.sugerenciaEstado}</strong>.
              </div>
              <button
                onClick={aplicarCambioEstado}
                disabled={aplicando}
                className="m-btn"
                style={{
                  marginTop: 10, background: '#b45309', color: 'white',
                  borderColor: '#b45309', width: '100%', minHeight: 38, fontSize: 13,
                }}
              >
                {aplicando
                  ? <><Loader2 className="m-spin" size={14} /> Aplicando…</>
                  : <><ArrowRight size={14} /> Avanzar a {data.sugerenciaEstado}</>}
              </button>
            </div>
          </div>
        </div>
      )}
      {data.sugerenciaEstado && aplicado && (
        <div className="m-card" style={{
          width: '100%', maxWidth: 320, marginTop: 16,
          background: '#dcfce7', border: '1px solid #86efac',
          padding: 12, textAlign: 'left',
          display: 'flex', gap: 10, alignItems: 'center',
        }}>
          <CheckCircle2 size={18} style={{ color: '#15803d', flexShrink: 0 }} />
          <div style={{ fontSize: 12, color: '#14532d' }}>
            Listo. Estado del corte ahora es <strong>{data.sugerenciaEstado}</strong>.
          </div>
        </div>
      )}

      <div style={{ width: '100%', maxWidth: 320, marginTop: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Link to={`/m/registros/${registroId}`} className="m-btn m-btn-primary" style={{ textDecoration: 'none' }}>
          Volver al registro
        </Link>
        <button className="m-btn m-btn-outline" onClick={onNuevo}>
          Crear otro movimiento
        </button>
      </div>
    </div>
  );
};

const Row = ({ k, v, mono = false, small = false }) => (
  <div style={{
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '6px 0', fontSize: small ? 12 : 14,
  }}>
    <span style={{ color: '#64748b' }}>{k}</span>
    <span style={{
      fontWeight: 600,
      fontFamily: mono ? 'ui-monospace, monospace' : 'inherit',
      textAlign: 'right',
      maxWidth: '60%',
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    }}>{v}</span>
  </div>
);

/* ───────── Helpers ───────── */
function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}
function masDiasDesde(fechaISO, n) {
  // Sumamos en UTC para evitar desfases por zona horaria al pasar a ISO
  const [y, m, d] = (fechaISO || hoyISO()).split('-').map(Number);
  const date = new Date(Date.UTC(y, (m - 1), d));
  date.setUTCDate(date.getUTCDate() + (Number(n) || 0));
  return date.toISOString().slice(0, 10);
}
function fmtFechaCorta(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function totalPrendasDe(registro) {
  if (!registro) return 0;
  const t = registro.tallas;
  if (Array.isArray(t)) {
    return t.reduce((sum, x) => sum + (Number(x?.cantidad) || 0), 0);
  }
  if (t && typeof t === 'object') {
    return Object.values(t).reduce((sum, n) => sum + (Number(n) || 0), 0);
  }
  if (typeof registro.curva === 'string') {
    return registro.curva.split('/').reduce((s, n) => s + (Number(n) || 0), 0);
  }
  return 0;
}

export default MobileNuevoMovimiento;
