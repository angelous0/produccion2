import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Loader2, FlaskConical, Clock, Check, X,
  AlertCircle, Send, Plus, ArrowDownToLine, AlertTriangle,
  Ruler, Eye, MessageCircle, ArrowRight, Palette, Search,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Envíos de muestra del registro (v2 — Sprint 43).
 *   GET /api/registros/:id/muestras-lavanderia
 *
 * Cubre los 4 estados:
 *   en_destino             → recién enviada, esperando
 *   devuelta               → volvió (total o parcial)
 *   paso_a_lavanderia      → estaba con Diseño, se mandó a una lavandería
 *   cerrada_en_lavanderia  → fue a Lavandería y se quedó (legacy = devuelta)
 *
 * Acciones por estado:
 *   - en_destino (lavandería): Marcar retorno
 *   - en_destino (diseño):     Devolver / → Lavandería
 *   - resto:                   sin acciones
 */
export const MobileMuestrasLavanderia = () => {
  const { id: registroId } = useParams();
  const navigate = useNavigate();

  const [registro, setRegistro] = useState(null);
  const [muestras, setMuestras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [retornoDe, setRetornoDe] = useState(null);
  const [pasarLavDe, setPasarLavDe] = useState(null);

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

  const totalEnviadas = muestras.reduce((s, m) => s + Number(m.cantidad_total || 0), 0);
  const sinVolver = muestras.filter(m => m.estado_muestra === 'en_destino').length;
  const cerradas = muestras.filter(m => ['devuelta', 'paso_a_lavanderia', 'cerrada_en_lavanderia'].includes(m.estado_muestra)).length;

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
            {registro?.modelo_nombre || registro?.modelo_manual?.nombre_modelo || 'Envíos de muestra'}
          </div>
          <div style={{
            fontSize: 11, opacity: 0.85, marginTop: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {registro?.n_corte} · Envíos de muestra
          </div>
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Botón crear */}
        <Link
          to={`/m/registros/${registroId}/nueva-muestra-lavanderia`}
          className="m-btn m-btn-primary"
          style={{ textDecoration: 'none', minHeight: 44 }}
        >
          <Plus size={18} /> Nuevo envío de muestra
        </Link>

        {muestras.length === 0 ? (
          <div className="m-card" style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>
            <FlaskConical size={36} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
            <p style={{ margin: 0, fontSize: 14 }}>
              Aún no se enviaron muestras de este corte.
            </p>
          </div>
        ) : (
          <>
            {/* Resumen */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6,
            }}>
              <ResumenKpi label="Envíos" value={muestras.length} color="#475569" />
              <ResumenKpi label="Sin volver" value={sinVolver} color="#1d4ed8" />
              <ResumenKpi label="Cerradas" value={cerradas} color="#15803d" />
            </div>
            <div style={{
              padding: 10, background: '#f8fafc', border: '1px solid #e2e8f0',
              borderRadius: 10, fontSize: 12, color: '#475569', textAlign: 'center',
            }}>
              <b>{totalEnviadas}</b> prendas movidas como muestra en total
            </div>

            <div className="m-label-xs" style={{ marginTop: 4 }}>Historial</div>

            {muestras.map(m => (
              <MuestraCard
                key={m.id}
                muestra={m}
                onMarcarRetorno={() => setRetornoDe(m)}
                onPasarLavanderia={() => setPasarLavDe(m)}
              />
            ))}
          </>
        )}
      </div>

      {retornoDe && (
        <MarcarRetornoSheet
          muestra={retornoDe}
          onClose={() => setRetornoDe(null)}
          onDone={async () => { setRetornoDe(null); await cargarMuestras(); }}
        />
      )}
      {pasarLavDe && (
        <PasarALavanderiaSheet
          muestra={pasarLavDe}
          onClose={() => setPasarLavDe(null)}
          onDone={async () => { setPasarLavDe(null); await cargarMuestras(); }}
        />
      )}
    </>
  );
};

/* ──────── Card de una muestra ──────── */

const MuestraCard = ({ muestra, onMarcarRetorno, onPasarLavanderia }) => {
  const destinoTipo = muestra.destino_tipo || 'lavanderia';
  const estado = muestra.estado_muestra || (muestra.fecha_retorno ? 'devuelta' : 'en_destino');
  const dest = destinoCfg(destinoTipo);
  const estCfg = estadoMuestraCfg(estado);
  const EstIcon = estCfg.Icon;

  const personaNombre = muestra.persona_nombre || muestra.lavanderia_nombre || null;
  const cantTotal = Number(muestra.cantidad_total || 0);
  const cantDev = muestra.cantidad_devuelta != null ? Number(muestra.cantidad_devuelta) : null;
  const faltantes = (estado === 'devuelta' && cantDev != null && cantDev < cantTotal)
    ? cantTotal - cantDev
    : 0;

  const enDestino = estado === 'en_destino';
  const accionesLav = destinoTipo === 'lavanderia' && enDestino;
  const accionesDis = destinoTipo === 'diseno' && enDestino;

  return (
    <div className="m-card" style={{
      borderLeft: `4px solid ${dest.color}`,
      paddingLeft: 12,
    }}>
      {/* Fila 1: persona + estado */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: dest.color, color: 'white',
            fontWeight: 700, fontSize: 11,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            {iniciales(personaNombre)}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              fontWeight: 700, fontSize: 13.5, color: '#0f172a',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {personaNombre || (destinoTipo === 'lavanderia' ? 'Sin lavandería' : 'Sin persona')}
              <span style={{
                marginLeft: 6, fontSize: 9, fontWeight: 700,
                padding: '1px 6px', borderRadius: 999,
                background: dest.softBg, color: dest.color,
                textTransform: 'uppercase', letterSpacing: '.02em',
              }}>
                {dest.label}
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
              Enviada · {fmtFecha(muestra.fecha_envio)}
            </div>
          </div>
        </div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          fontSize: 9, fontWeight: 700, padding: '3px 7px',
          borderRadius: 999, letterSpacing: '.02em',
          background: estCfg.bg, color: estCfg.fg,
          textTransform: 'uppercase', flexShrink: 0,
        }}>
          {EstIcon && <EstIcon size={10} />}
          {estCfg.label}
        </span>
      </div>

      {/* Fila 2: cantidad / motivo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap', fontSize: 12 }}>
        {estado === 'devuelta' && cantDev != null ? (
          <>
            <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 800, fontSize: 14, color: '#15803d' }}>
              {cantDev} / {cantTotal}
            </span>
            <span style={{ color: '#64748b' }}>vueltas</span>
            {faltantes > 0 && (
              <span style={{
                padding: '2px 7px', borderRadius: 999,
                background: '#fef3c7', color: '#92400e',
                fontSize: 10, fontWeight: 700,
              }}>
                {faltantes} no dev.
              </span>
            )}
          </>
        ) : (
          <>
            <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 800, fontSize: 14 }}>
              {cantTotal}
            </span>
            <span style={{ color: '#64748b' }}>prenda{cantTotal !== 1 ? 's' : ''}</span>
          </>
        )}

        {/* Motivo de Diseño (chip) */}
        {destinoTipo === 'diseno' && muestra.motivo_diseno && enDestino && (
          <span style={{
            padding: '2px 7px', borderRadius: 999,
            background: dest.softBg, color: dest.color,
            fontSize: 10, fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', gap: 3,
            marginLeft: 'auto',
          }}>
            {motivoIcon(muestra.motivo_diseno)}
            {motivoLabel(muestra.motivo_diseno)}
          </span>
        )}
      </div>

      {/* Pasó a lavandería: a quién */}
      {estado === 'paso_a_lavanderia' && (
        <div style={{
          marginTop: 8, padding: 8, background: '#f3e8ff', borderRadius: 8,
          fontSize: 11, color: '#5b21b6',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <ArrowRight size={12} />
          <span>
            Pasó a <b>{muestra.lavanderia_posterior_nombre || 'una lavandería'}</b>
            {muestra.fecha_paso_lavanderia ? ` el ${fmtFecha(muestra.fecha_paso_lavanderia)}` : ''}
          </span>
        </div>
      )}

      {/* Observaciones no devuelto */}
      {muestra.obs_no_devuelto && (
        <div style={{
          marginTop: 8, padding: 8, background: '#fffbeb', borderRadius: 8,
          fontSize: 11, color: '#854d0e', fontStyle: 'italic',
        }}>
          "{muestra.obs_no_devuelto}"
        </div>
      )}

      {/* Colores (solo si los hay) */}
      {Array.isArray(muestra.colores) && muestra.colores.length > 0 && (
        <div style={{
          marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <div style={{
            fontSize: 9, color: '#64748b', textTransform: 'uppercase',
            fontWeight: 700, letterSpacing: '.04em',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <Palette size={10} /> Colores
          </div>
          {muestra.colores.map(c => {
            const dec = decisionCfg(c.decision);
            const DecIcon = dec.Icon;
            return (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
              }}>
                <span style={{ flex: 1, minWidth: 0, color: '#0f172a', fontWeight: 600 }}>
                  {c.color_nombre || '—'}
                </span>
                <span style={{
                  fontFamily: 'ui-monospace, monospace',
                  color: '#475569', fontWeight: 600,
                }}>
                  {Number(c.cantidad || 0)} pzs
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

      {/* Observación general */}
      {muestra.observaciones && (
        <div style={{
          marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9',
          fontSize: 12, color: '#475569', fontStyle: 'italic',
        }}>
          "{muestra.observaciones}"
        </div>
      )}

      {/* Acciones por estado/destino */}
      {accionesLav && (
        <button
          onClick={onMarcarRetorno}
          className="m-btn m-btn-outline"
          style={{
            width: '100%', marginTop: 10,
            borderColor: 'var(--m-brand)', color: 'var(--m-brand)',
            minHeight: 40, fontSize: 13,
          }}
        >
          <ArrowDownToLine size={14} /> Marcar retorno
        </button>
      )}
      {accionesDis && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <button
            onClick={onMarcarRetorno}
            className="m-btn"
            style={{
              flex: 1, background: '#10b981', color: 'white',
              borderColor: '#10b981', minHeight: 40, fontSize: 12, fontWeight: 700,
            }}
          >
            Devolver
          </button>
          <button
            onClick={onPasarLavanderia}
            className="m-btn"
            style={{
              flex: 1, background: '#0f766e', color: 'white',
              borderColor: '#0f766e', minHeight: 40, fontSize: 12, fontWeight: 700,
            }}
          >
            <ArrowRight size={12} /> Lavandería
          </button>
        </div>
      )}
    </div>
  );
};

/* ──────── Sheet: Marcar retorno (con parcial) ──────── */

const MarcarRetornoSheet = ({ muestra, onClose, onDone }) => {
  const cantTotal = Number(muestra.cantidad_total || 0);
  const [fechaRetorno, setFechaRetorno] = useState(hoyISO());
  const [todoVuelve, setTodoVuelve] = useState(true);
  const [cantidadDevuelta, setCantidadDevuelta] = useState(cantTotal);
  const [observaciones, setObservaciones] = useState('');
  const [obsNoDevuelto, setObsNoDevuelto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const cantDevNum = Number(cantidadDevuelta) || 0;
  const faltantes = cantTotal - cantDevNum;
  const destinoTipo = muestra.destino_tipo || 'lavanderia';

  const confirmar = async () => {
    setError('');
    if (!fechaRetorno) return setError('Indica la fecha de retorno');
    if (!todoVuelve) {
      if (cantDevNum < 0) return setError('La cantidad devuelta no puede ser negativa');
      if (cantDevNum > cantTotal) return setError(`No pueden volver más de las ${cantTotal} enviadas`);
    }
    setEnviando(true);
    try {
      const body = {
        fecha_retorno: fechaRetorno,
        observaciones: observaciones.trim() || undefined,
      };
      if (!todoVuelve) {
        body.cantidad_devuelta = cantDevNum;
        body.obs_no_devuelto = obsNoDevuelto.trim() || undefined;
      }
      await axios.put(`${API}/muestras-lavanderia/${muestra.id}/retorno`, body);
      onDone();
    } catch (e) {
      const det = e?.response?.data?.detail || 'Error al marcar el retorno';
      setError(typeof det === 'string' ? det : String(det));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <SheetShell onClose={onClose}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 17 }}>Marcar retorno</div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
          {destinoTipo === 'diseno' ? 'De' : 'Envío a'} {muestra.persona_nombre || muestra.lavanderia_nombre || '—'} · {cantTotal} prendas
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <span className="m-label-xs">Fecha de retorno</span>
        <input
          type="date"
          className="m-input"
          value={fechaRetorno}
          onChange={(e) => setFechaRetorno(e.target.value)}
          style={{ marginTop: 6, fontSize: 14 }}
        />
      </div>

      <div style={{ marginBottom: 14 }}>
        <span className="m-label-xs">¿Volvieron todas?</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 6 }}>
          <button
            onClick={() => { setTodoVuelve(true); setCantidadDevuelta(cantTotal); }}
            style={{
              padding: 10, borderRadius: 10,
              background: todoVuelve ? '#dcfce7' : 'white',
              border: todoVuelve ? '2px solid #15803d' : '1px solid #e5e7eb',
              color: todoVuelve ? '#14532d' : '#475569',
              fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}
          >
            Sí, las {cantTotal}
          </button>
          <button
            onClick={() => setTodoVuelve(false)}
            style={{
              padding: 10, borderRadius: 10,
              background: !todoVuelve ? '#fef3c7' : 'white',
              border: !todoVuelve ? '2px solid #b45309' : '1px solid #e5e7eb',
              color: !todoVuelve ? '#78350f' : '#475569',
              fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}
          >
            No, parcial
          </button>
        </div>
      </div>

      {!todoVuelve && (
        <div style={{
          background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10,
          padding: 12, marginBottom: 14,
        }}>
          <span className="m-label-xs" style={{ color: '#92400e' }}>
            ¿Cuántas volvieron?
          </span>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginTop: 8,
          }}>
            <input
              type="number"
              value={cantidadDevuelta}
              onChange={(e) => setCantidadDevuelta(e.target.value)}
              min="0"
              max={cantTotal}
              style={{
                width: 80, padding: '8px 10px', textAlign: 'right',
                background: 'white', border: '1px solid #fcd34d', borderRadius: 8,
                fontSize: 16, fontWeight: 800,
                fontVariantNumeric: 'tabular-nums',
              }}
            />
            <span style={{ fontSize: 13, color: '#854d0e' }}>de {cantTotal}</span>
            {faltantes > 0 && (
              <span style={{
                marginLeft: 'auto', padding: '3px 8px', borderRadius: 999,
                background: '#fde68a', color: '#92400e',
                fontSize: 10, fontWeight: 700,
              }}>
                {faltantes} no devueltas
              </span>
            )}
          </div>
          <input
            type="text"
            className="m-input"
            placeholder="¿Por qué no volvieron todas? (opcional)"
            value={obsNoDevuelto}
            onChange={(e) => setObsNoDevuelto(e.target.value)}
            style={{ background: 'white', marginTop: 8, fontSize: 12 }}
          />
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <span className="m-label-xs">Observación general (opcional)</span>
        <textarea
          rows={2}
          className="m-input"
          placeholder="Algo importante para el seguimiento..."
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          style={{ padding: 12, marginTop: 6, fontFamily: 'inherit', resize: 'vertical' }}
        />
      </div>

      {error && <ErrorBox error={error} />}

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="m-btn m-btn-outline" style={{ flex: 1 }} onClick={onClose}>
          Cancelar
        </button>
        <button
          className="m-btn"
          style={{
            flex: 1.5, background: '#10b981', color: 'white', borderColor: '#10b981',
          }}
          disabled={enviando}
          onClick={confirmar}
        >
          {enviando
            ? <><Loader2 className="m-spin" size={16} /> Guardando...</>
            : <><Check size={16} /> Confirmar retorno · {cantDevNum} pzs</>}
        </button>
      </div>
    </SheetShell>
  );
};

/* ──────── Sheet: Pasar a Lavandería (desde Diseño) ──────── */

const PasarALavanderiaSheet = ({ muestra, onClose, onDone }) => {
  const [lavanderias, setLavanderias] = useState([]);
  const [lavId, setLavId] = useState('');
  const [fecha, setFecha] = useState(hoyISO());
  const [obs, setObs] = useState('');
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  const lavFiltradas = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return lavanderias;
    return lavanderias.filter(l =>
      String(l.nombre || '').toLowerCase().includes(s)
    );
  }, [lavanderias, q]);

  useEffect(() => {
    (async () => {
      try {
        const r = await axios.get(`${API}/muestras-lavanderia/lavanderias`);
        setLavanderias(Array.isArray(r.data) ? r.data : []);
      } catch {
        setLavanderias([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const cantTotal = Number(muestra.cantidad_total || 0);

  const confirmar = async () => {
    setError('');
    if (!lavId) return setError('Elegí la lavandería destino');
    if (!fecha) return setError('Indica la fecha en que pasó');
    setEnviando(true);
    try {
      await axios.put(`${API}/muestras-lavanderia/${muestra.id}/pasar-a-lavanderia`, {
        persona_lavanderia_id: lavId,
        fecha_paso_lavanderia: fecha,
        observaciones: obs.trim() || undefined,
      });
      onDone();
    } catch (e) {
      const det = e?.response?.data?.detail || 'Error al pasar a lavandería';
      setError(typeof det === 'string' ? det : String(det));
    } finally {
      setEnviando(false);
    }
  };

  const lavSel = lavanderias.find(l => l.id === lavId);

  return (
    <SheetShell onClose={onClose}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 17 }}>Pasar a Lavandería</div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, lineHeight: 1.5 }}>
          {muestra.persona_nombre || 'Diseño'} las pasa a una lavandería.
          Ya no volverán al corte.
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <span className="m-label-xs">¿A qué lavandería?</span>
        {loading ? (
          <div style={{ padding: 12, textAlign: 'center' }}>
            <Loader2 className="m-spin" size={20} style={{ color: '#94a3b8' }} />
          </div>
        ) : lavanderias.length === 0 ? (
          <div style={{
            padding: 10, background: '#fef2f2', border: '1px solid #fca5a5',
            borderRadius: 8, fontSize: 11, color: '#b91c1c', marginTop: 6,
          }}>
            No hay lavanderías configuradas. Agregá una primero desde el catálogo web.
          </div>
        ) : (
          <>
            {/* Buscador (solo si hay más de 4) */}
            {lavanderias.length > 4 && (
              <div style={{ position: 'relative', marginTop: 6 }}>
                <Search size={14} style={{
                  position: 'absolute', left: 10, top: '50%',
                  transform: 'translateY(-50%)', color: '#94a3b8',
                  pointerEvents: 'none',
                }} />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={`Buscar (${lavanderias.length})...`}
                  style={{
                    width: '100%', padding: '8px 30px 8px 30px',
                    background: '#f8fafc', border: '1px solid #e5e7eb',
                    borderRadius: 8, fontSize: 13, outline: 'none',
                  }}
                />
                {q && (
                  <button
                    type="button"
                    onClick={() => setQ('')}
                    style={{
                      position: 'absolute', right: 8, top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'transparent', border: 0, cursor: 'pointer',
                      color: '#94a3b8', padding: 2,
                    }}
                    aria-label="Limpiar"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            )}

            <div style={{
              display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8,
              maxHeight: 280, overflowY: 'auto',
            }}>
              {lavFiltradas.length === 0 ? (
                <div style={{
                  padding: 14, fontSize: 12, color: '#94a3b8', textAlign: 'center',
                }}>
                  Sin coincidencias para "{q}"
                </div>
              ) : (
                lavFiltradas.map(l => (
                  <button
                    key={l.id}
                    onClick={() => setLavId(l.id)}
                    style={{
                      padding: 10, borderRadius: 10,
                      background: lavId === l.id ? 'var(--m-brand-soft)' : 'white',
                      border: lavId === l.id ? '2px solid var(--m-brand)' : '1px solid #e5e7eb',
                      cursor: 'pointer', textAlign: 'left',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: 'var(--m-brand)', color: 'white',
                      fontWeight: 700, fontSize: 10,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {iniciales(l.nombre)}
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{l.nombre}</div>
                    {lavId === l.id && <Check size={16} style={{ color: 'var(--m-brand)' }} />}
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>

      <div style={{ marginBottom: 14 }}>
        <span className="m-label-xs">Fecha en que pasó</span>
        <input
          type="date"
          className="m-input"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          style={{ marginTop: 6, fontSize: 14 }}
        />
      </div>

      <div style={{ marginBottom: 14 }}>
        <span className="m-label-xs">Observación (opcional)</span>
        <textarea
          rows={2}
          className="m-input"
          placeholder="Algún detalle para la lavandería..."
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          style={{ padding: 12, marginTop: 6, fontFamily: 'inherit', resize: 'vertical' }}
        />
      </div>

      {lavSel && (
        <div style={{
          background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8,
          padding: 10, fontSize: 11, color: '#475569', marginBottom: 12,
        }}>
          <b>Resumen:</b> Las {cantTotal} prendas dejarán de aparecer como
          "con {muestra.persona_nombre || 'Diseño'}" y se contarán como
          <b> enviadas a {lavSel.nombre}</b>.
        </div>
      )}

      <div style={{
        background: 'var(--m-brand-soft)', border: '1px solid #99f6e4', borderRadius: 8,
        padding: 10, fontSize: 11, color: '#115e59', marginBottom: 14,
        display: 'flex', gap: 6, alignItems: 'flex-start',
      }}>
        <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Después de confirmar vas a poder <b>agregar los colores que pidió Diseño</b> a la lavandería desde la pantalla web.
        </span>
      </div>

      {error && <ErrorBox error={error} />}

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="m-btn m-btn-outline" style={{ flex: 1 }} onClick={onClose}>
          Cancelar
        </button>
        <button
          className="m-btn m-btn-primary"
          style={{ flex: 1.5 }}
          disabled={enviando || !lavId}
          onClick={confirmar}
        >
          {enviando
            ? <><Loader2 className="m-spin" size={16} /> Guardando...</>
            : <><ArrowRight size={16} /> Pasar {cantTotal} prendas</>}
        </button>
      </div>
    </SheetShell>
  );
};

/* ──────── Helpers ──────── */

const SheetShell = ({ children, onClose }) => (
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
      {children}
    </div>
  </div>
);

const ErrorBox = ({ error }) => (
  <div style={{
    background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c',
    borderRadius: 12, padding: 12, fontSize: 13,
    display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12,
  }}>
    <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
    <span>{error}</span>
  </div>
);

const ResumenKpi = ({ label, value, color }) => (
  <div style={{
    background: 'white', border: '1px solid #e5e7eb', borderRadius: 10,
    padding: 8, textAlign: 'center',
  }}>
    <div style={{
      fontSize: 18, fontWeight: 800, color,
      fontFamily: 'ui-monospace, monospace', lineHeight: 1.1,
    }}>{value}</div>
    <div style={{
      fontSize: 9, color: '#64748b', fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '.04em', marginTop: 2,
    }}>{label}</div>
  </div>
);

function destinoCfg(tipo) {
  if (tipo === 'diseno') {
    return { label: 'Diseño', color: '#7c3aed', softBg: '#f3e8ff' };
  }
  return { label: 'Lavandería', color: '#0f766e', softBg: '#f0fdfa' };
}

function estadoMuestraCfg(estado) {
  if (estado === 'devuelta')
    return { label: 'Devuelta', bg: '#dcfce7', fg: '#15803d', Icon: Check };
  if (estado === 'paso_a_lavanderia')
    return { label: '→ Lavandería', bg: '#f3e8ff', fg: '#7c3aed', Icon: ArrowRight };
  if (estado === 'cerrada_en_lavanderia')
    return { label: 'Cerrada', bg: '#ccfbf1', fg: '#115e59', Icon: Check };
  if (estado === 'en_destino')
    return { label: 'En destino', bg: '#dbeafe', fg: '#1d4ed8', Icon: Clock };
  return { label: estado || 'Sin estado', bg: '#f1f5f9', fg: '#475569', Icon: null };
}

function motivoLabel(m) {
  if (m === 'medidas') return 'Medidas';
  if (m === 'evaluacion') return 'Evaluación';
  if (m === 'consulta') return 'Consulta';
  return m || '—';
}
function motivoIcon(m) {
  if (m === 'medidas')    return <Ruler size={10} />;
  if (m === 'evaluacion') return <Eye size={10} />;
  if (m === 'consulta')   return <MessageCircle size={10} />;
  return null;
}

function decisionCfg(decision) {
  if (decision === 'aprobado')  return { label: 'OK',   bg: '#dcfce7', fg: '#15803d', Icon: Check };
  if (decision === 'rechazado') return { label: 'No',   bg: '#fee2e2', fg: '#b91c1c', Icon: X };
  return { label: 'Pend.', bg: '#dbeafe', fg: '#1d4ed8', Icon: Clock };
}

function iniciales(nombre) {
  if (!nombre) return '—';
  return String(nombre)
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(s => s[0])
    .join('')
    .toUpperCase();
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

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export default MobileMuestrasLavanderia;
