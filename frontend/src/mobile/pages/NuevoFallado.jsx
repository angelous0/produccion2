import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Loader2, AlertTriangle, AlertOctagon, Check,
  CheckCircle2, ChevronDown, Send, Layers,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Marcar fallado del corte.
 * POST /api/cortes/:registro_id/fallado-con-asignacion
 *
 *  - causa = 'Tela'  → solo crea prod_fallados (arreglo interno)
 *  - causa != 'Tela' → exige servicio_id + persona_id + fecha_limite
 *                       crea prod_fallados + prod_registro_arreglos
 *
 * El chip de causa se mapea automáticamente al servicio que coincide por nombre.
 */
const CAUSAS = [
  { key: 'Costura',   match: 'costura',   color: '#1d4ed8', bg: '#dbeafe' },
  { key: 'Tela',      match: null,        color: '#15803d', bg: '#dcfce7' },
  { key: 'Lavado',    match: 'lavand',    color: '#b45309', bg: '#fef3c7' },
  { key: 'Estampado', match: 'estampado', color: '#7e22ce', bg: '#f3e8ff' },
  { key: 'Otro',      match: null,        color: '#475569', bg: '#e5e7eb' },
];

export const MobileNuevoFallado = () => {
  const { id: registroId } = useParams();
  const navigate = useNavigate();

  const [registro, setRegistro] = useState(null);
  const [servicios, setServicios] = useState([]);
  const [personas, setPersonas] = useState([]);
  const [movimientosPrevios, setMovimientosPrevios] = useState([]);
  const [personaTouched, setPersonaTouched] = useState(false); // si el usuario eligió manualmente
  const [loadingInicial, setLoadingInicial] = useState(true);

  // form
  const [cantidad, setCantidad] = useState(1);
  const [causa, setCausa] = useState(''); // 'Costura' | 'Tela' | ...
  const [servicioId, setServicioId] = useState(''); // se autoselecciona al elegir causa
  const [personaId, setPersonaId] = useState('');
  const [fechaLimite, setFechaLimite] = useState(masDiasISO(3));
  const [observacion, setObservacion] = useState('');

  const [showPicker, setShowPicker] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState(null);

  // Cargar registro + servicios + personas + movimientos previos del corte
  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [regRes, srvRes, persRes, movRes] = await Promise.all([
          axios.get(`${API}/registros/${registroId}`),
          axios.get(`${API}/servicios-produccion`).catch(() => ({ data: [] })),
          axios.get(`${API}/personas-produccion`).catch(() => ({ data: [] })),
          axios.get(`${API}/movimientos-produccion?registro_id=${registroId}&limit=200`).catch(() => ({ data: { items: [] } })),
        ]);
        setRegistro(regRes.data);
        setServicios(Array.isArray(srvRes.data) ? srvRes.data : (srvRes.data?.items || []));
        setPersonas(Array.isArray(persRes.data) ? persRes.data : (persRes.data?.items || []));
        const movs = movRes.data?.items || movRes.data || [];
        setMovimientosPrevios(Array.isArray(movs) ? movs : []);
      } catch {
        // no-op
      } finally {
        setLoadingInicial(false);
      }
    };
    fetchAll();
  }, [registroId]);

  const totalPrendas = useMemo(() => totalPrendasDe(registro), [registro]);
  const esTela = (causa || '').toLowerCase() === 'tela';

  // Al elegir causa, auto-seleccionamos el servicio que coincide por nombre.
  // Cualquier cambio de causa resetea la marca "personaTouched" para volver
  // a autocompletar la persona desde el historial.
  useEffect(() => {
    setPersonaTouched(false);
    if (!causa || esTela) {
      setServicioId('');
      setPersonaId('');
      return;
    }
    const cfg = CAUSAS.find(c => c.key === causa);
    if (cfg?.match && servicios.length > 0) {
      const match = servicios.find(s => (s.nombre || '').toLowerCase().includes(cfg.match));
      if (match) {
        setServicioId(match.id);
        return;
      }
    }
    // Para "Otro" o si no encuentra, deja al usuario elegir manualmente
    setServicioId('');
  }, [causa, esTela, servicios]);

  // Cuando cambia el servicio, sugerimos la última persona que trabajó ese
  // servicio en este corte (solo si el operario no eligió manualmente).
  useEffect(() => {
    if (!servicioId || personaTouched || esTela) return;
    // Ordenar movimientos del servicio por fecha más reciente
    const delServicio = movimientosPrevios
      .filter(m => m.servicio_id === servicioId && m.persona_id)
      .sort((a, b) => {
        const da = a.fecha_fin || a.fecha_inicio || a.created_at || '';
        const db = b.fecha_fin || b.fecha_inicio || b.created_at || '';
        return db.localeCompare(da);
      });
    const ultimo = delServicio[0];
    if (ultimo?.persona_id) {
      setPersonaId(ultimo.persona_id);
    } else {
      // Si no hay historial para este servicio, limpiar selección previa
      setPersonaId('');
    }
  }, [servicioId, movimientosPrevios, personaTouched, esTela]);

  // Personas filtradas por servicio
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

  // Si cambia el servicio y la persona ya no califica, la limpiamos
  useEffect(() => {
    if (!personaId) return;
    if (!personasFiltradas.find(p => p.id === personaId)) {
      setPersonaId('');
    }
  }, [personasFiltradas, personaId]);

  const personaActual = useMemo(
    () => personas.find(p => p.id === personaId),
    [personas, personaId]
  );
  const servicioActual = useMemo(
    () => servicios.find(s => s.id === servicioId),
    [servicios, servicioId]
  );

  const onGuardar = async () => {
    setError('');
    if (!causa) { setError('Selecciona una causa'); return; }
    if (cantidad <= 0) { setError('La cantidad debe ser mayor a 0'); return; }
    if (!esTela) {
      if (!servicioId) { setError('Selecciona el servicio destino'); return; }
      if (!personaId)  { setError('Selecciona la persona o taller'); return; }
      if (!fechaLimite) { setError('Selecciona la fecha límite'); return; }
    }

    setEnviando(true);
    try {
      const body = {
        cantidad: Number(cantidad),
        causa,
        observacion: observacion.trim() || undefined,
      };
      if (!esTela) {
        body.persona_id = personaId;
        body.servicio_id = servicioId;
        body.fecha_limite = fechaLimite;
      }
      const res = await axios.post(
        `${API}/cortes/${registroId}/fallado-con-asignacion`,
        body
      );
      setExito({
        data: res.data,
        causa, cantidad: Number(cantidad),
        persona: personaActual, servicio: servicioActual,
        fechaLimite: esTela ? null : fechaLimite,
      });
    } catch (e) {
      const detail = e?.response?.data?.detail || 'Error al marcar fallado';
      setError(typeof detail === 'string' ? detail : 'Error al marcar fallado');
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

  if (exito) return <ExitoFallado {...exito} registroId={registroId} />;

  return (
    <>
      <div className="m-header">
        <button className="m-h-icon" onClick={() => navigate(-1)}>
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
            {registro?.n_corte}
            {registro?.estado && <> · {registro.estado}</>}
            {' · Marcar fallado'}
          </div>
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Cantidad fallada */}
        <div>
          <span className="m-label-xs">Cantidad fallada</span>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginTop: 8, justifyContent: 'center',
          }}>
            <button
              className="m-btn m-btn-outline"
              style={{ width: 48, padding: 0, fontSize: 22 }}
              onClick={() => setCantidad(Math.max(1, Number(cantidad) - 1))}
            >−</button>
            <input
              type="number" className="m-input"
              value={cantidad}
              onChange={(e) => setCantidad(Math.max(0, Number(e.target.value) || 0))}
              style={{ maxWidth: 120, textAlign: 'center', fontSize: 22, fontWeight: 700 }}
            />
            <button
              className="m-btn m-btn-outline"
              style={{ width: 48, padding: 0, fontSize: 22 }}
              onClick={() => setCantidad(Number(cantidad) + 1)}
            >+</button>
          </div>
          {totalPrendas > 0 && (
            <div style={{ textAlign: 'center', fontSize: 12, color: '#64748b', marginTop: 6 }}>
              de <strong>{totalPrendas} prendas</strong> del corte
            </div>
          )}
        </div>

        {/* Causa */}
        <div>
          <span className="m-label-xs">Causa *</span>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6,
            marginTop: 8,
          }}>
            {CAUSAS.map(c => {
              const activo = causa === c.key;
              return (
                <button
                  key={c.key}
                  onClick={() => setCausa(c.key)}
                  style={{
                    minHeight: 48, padding: '8px 10px',
                    borderRadius: 12, fontSize: 14, fontWeight: 600,
                    cursor: 'pointer', textAlign: 'center',
                    border: activo ? `2px solid ${c.color}` : '1px solid #d1d5db',
                    background: activo ? c.bg : 'white',
                    color: activo ? c.color : '#0f172a',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  {activo && <Check size={14} />}
                  {c.key}
                </button>
              );
            })}
          </div>
        </div>

        {/* Caso TELA */}
        {esTela && (
          <div style={{
            background: '#ecfdf5', border: '2px solid #6ee7b7',
            borderRadius: 12, padding: 12,
            display: 'flex', alignItems: 'flex-start', gap: 10,
          }}>
            <Layers size={18} style={{ color: '#15803d', flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 13, color: '#065f46' }}>
              <div style={{ fontWeight: 700 }}>No requiere asignar</div>
              <div style={{ marginTop: 2 }}>
                Defecto de tela base. Queda en arreglo interno con estado <code>EVALUANDO</code>.
                Tu equipo de acabado lo trabaja directamente sin enviar a proveedor.
              </div>
            </div>
          </div>
        )}

        {/* Caso SERVICIO: asignación obligatoria */}
        {causa && !esTela && (
          <div style={{
            background: '#eff6ff', border: '2px solid #93c5fd',
            borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <Send size={16} style={{ color: '#1d4ed8' }} />
              <strong style={{ color: '#1e3a8a' }}>Enviar a arreglo</strong>
              <span style={{
                marginLeft: 'auto', fontSize: 9, fontWeight: 700,
                background: '#fee2e2', color: '#b91c1c',
                padding: '1px 6px', borderRadius: 4,
              }}>OBLIGATORIO</span>
            </div>

            {/* Persona / Taller */}
            <div>
              <label style={{
                fontSize: 11, fontWeight: 600, color: '#1e3a8a',
                textTransform: 'uppercase', letterSpacing: '.04em',
              }}>
                ¿A quién se lo das?
              </label>
              <button
                disabled={!servicioId}
                onClick={() => setShowPicker(true)}
                style={{
                  width: '100%', marginTop: 4,
                  minHeight: 48, padding: '8px 12px',
                  border: '1px solid #93c5fd', borderRadius: 10,
                  background: 'white', textAlign: 'left',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  cursor: !servicioId ? 'not-allowed' : 'pointer',
                  opacity: !servicioId ? 0.6 : 1,
                }}
              >
                {personaActual ? (
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontWeight: 600, fontSize: 14,
                      display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                    }}>
                      {personaActual.nombre}
                      {!personaTouched && (
                        <span style={{
                          fontSize: 9, fontWeight: 700,
                          background: '#dbeafe', color: '#1e40af',
                          padding: '1px 6px', borderRadius: 4,
                          textTransform: 'uppercase', letterSpacing: '.04em',
                        }}>SUGERIDA</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>
                      {personaActual.tipo}
                      {servicioActual && <> · {servicioActual.nombre}</>}
                      {!personaTouched && <> · último movimiento de este servicio</>}
                    </div>
                  </div>
                ) : (
                  <span style={{ color: '#94a3b8', fontSize: 13 }}>
                    {servicioId ? 'Selecciona persona' : (causa === 'Otro' ? 'Selecciona primero un servicio abajo' : 'Sin personal para esta causa')}
                  </span>
                )}
                <ChevronDown size={18} style={{ color: '#94a3b8' }} />
              </button>
            </div>

            {/* Servicio (solo visible si causa = Otro o no se autoseleccionó) */}
            {(causa === 'Otro' || !servicioId) && (
              <div>
                <label style={{
                  fontSize: 11, fontWeight: 600, color: '#1e3a8a',
                  textTransform: 'uppercase', letterSpacing: '.04em',
                }}>
                  Servicio destino
                </label>
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginTop: 4, paddingBottom: 4 }}>
                  {servicios.map(s => (
                    <button
                      key={s.id}
                      className={`m-chip ${servicioId === s.id ? 'active' : ''}`}
                      style={{ fontSize: 12, minHeight: 36, padding: '6px 12px' }}
                      onClick={() => setServicioId(s.id)}
                    >
                      {s.nombre}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Fecha límite */}
            <div>
              <label style={{
                fontSize: 11, fontWeight: 600, color: '#1e3a8a',
                textTransform: 'uppercase', letterSpacing: '.04em',
              }}>
                Fecha límite
              </label>
              <input
                type="date" className="m-input"
                style={{ marginTop: 4, borderColor: '#93c5fd' }}
                value={fechaLimite}
                min={hoyISO()}
                onChange={(e) => setFechaLimite(e.target.value)}
              />
              <div style={{ fontSize: 11, color: '#1e40af', marginTop: 4 }}>
                Precargada a <strong>+3 días</strong> · ajusta si es necesario.
              </div>
            </div>
          </div>
        )}

        {/* Observación */}
        <div>
          <span className="m-label-xs">Observación (opcional)</span>
          <textarea
            rows={3}
            className="m-input"
            style={{ padding: 12, marginTop: 6, fontFamily: 'inherit', resize: 'vertical' }}
            placeholder={esTela
              ? 'Ej: mancha persistente en tela, no se quita...'
              : 'Detalle del defecto a corregir...'}
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
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

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button className="m-btn m-btn-outline" style={{ flex: 1 }} onClick={() => navigate(-1)}>
            Cancelar
          </button>
          <button
            className="m-btn"
            style={{
              flex: 2,
              background: esTela ? '#15803d' : 'var(--m-brand)',
              color: 'white',
              opacity: enviando ? 0.7 : 1,
            }}
            disabled={enviando || !causa}
            onClick={onGuardar}
          >
            {enviando
              ? <><Loader2 className="m-spin" size={18} /> Guardando...</>
              : esTela
                ? <><AlertOctagon size={18} /> Guardar fallado</>
                : <><Send size={18} /> Enviar a {personaActual?.nombre || 'arreglo'}</>}
          </button>
        </div>
      </div>

      {showPicker && (
        <PersonaPicker
          personas={personasFiltradas}
          servicioId={servicioId}
          onElegir={(p) => {
            setPersonaId(p.id);
            setPersonaTouched(true); // marca como elección manual
            setShowPicker(false);
          }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </>
  );
};

/* ─────── Bottom sheet selector persona ─────── */
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
        <div style={{ width: 40, height: 4, background: '#cbd5e1', borderRadius: 2, margin: '0 auto 12px' }} />
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
          Elegir taller / persona
        </div>
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 12 }}>
          {personas.length === 0
            ? 'No hay personal registrado para este servicio.'
            : `${personas.length} disponible${personas.length !== 1 ? 's' : ''}`}
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
        <button className="m-btn m-btn-outline" onClick={onClose} style={{ width: '100%', marginTop: 12 }}>
          Cancelar
        </button>
      </div>
    </div>
  );
};

/* ─────── Pantalla éxito ─────── */
const ExitoFallado = ({ data, causa, cantidad, persona, servicio, fechaLimite, registroId }) => {
  const esTela = (causa || '').toLowerCase() === 'tela';
  return (
    <div style={{
      minHeight: '100%', display: 'flex', flexDirection: 'column',
      background: esTela
        ? 'linear-gradient(180deg, #f0fdf4 0%, white 100%)'
        : 'linear-gradient(180deg, #eff6ff 0%, white 100%)',
      padding: 32, textAlign: 'center', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 96, height: 96, borderRadius: '50%', background: 'white',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: esTela
          ? '0 10px 30px -10px rgba(21, 128, 61, .4)'
          : '0 10px 30px -10px rgba(29, 78, 216, .4)',
        marginBottom: 16,
      }}>
        <CheckCircle2 size={56} style={{ color: esTela ? '#15803d' : '#1d4ed8' }} />
      </div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>
        {esTela ? 'Fallado registrado' : `Enviado a ${persona?.nombre || 'arreglo'}`}
      </div>
      <div style={{ fontSize: 14, color: '#475569', marginTop: 4, maxWidth: 280 }}>
        {esTela
          ? `${cantidad} prendas en arreglo interno (TELA). Tu equipo lo trabaja.`
          : `${cantidad} prendas con causa ${causa}. Plazo: ${fmtFechaCorta(fechaLimite)}.`}
      </div>

      <div className="m-card" style={{ width: '100%', maxWidth: 320, marginTop: 24, textAlign: 'left' }}>
        <Row k="Causa" v={causa} />
        <Row k="Cantidad" v={cantidad} mono />
        {!esTela && servicio && <Row k="Servicio" v={servicio.nombre} small />}
        {!esTela && persona && <Row k="Asignado a" v={persona.nombre} small />}
        {!esTela && fechaLimite && <Row k="Fecha límite" v={fmtFechaCorta(fechaLimite)} mono />}
        {data.arreglo_id && (
          <Row k="ID arreglo" v={data.arreglo_id.slice(0, 8)} small mono />
        )}
      </div>

      <div style={{ width: '100%', maxWidth: 320, marginTop: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Link to={`/m/registros/${registroId}`} className="m-btn m-btn-primary" style={{ textDecoration: 'none' }}>
          Volver al registro
        </Link>
      </div>
    </div>
  );
};

const Row = ({ k, v, mono = false, small = false }) => (
  <div style={{
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '6px 0', fontSize: small ? 12 : 13, gap: 8,
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

/* ─────── Helpers ─────── */
function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}
function masDiasISO(n) {
  const [y, m, d] = hoyISO().split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}
function fmtFechaCorta(iso) {
  if (!iso) return '—';
  const s = String(iso);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  return s;
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

export default MobileNuevoFallado;
