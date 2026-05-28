import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Loader2, Send, Plus, Trash2,
  AlertTriangle, FlaskConical, Check, X, Info, ChevronDown,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { puede, ACCIONES } from '../utils/permisos';
import { PantallaBloqueada } from '../components/PantallaBloqueada';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Nueva muestra a lavandería.
 *
 * Reglas de colores:
 *   1. GET /reportes-produccion/registro-colores/:id → marca/tipo/entalle/hilo.
 *   2. GET /colores-catalogo?marca_id&tipo_id&entalle_id&hilo_id&solo_regla=true
 *      → paleta válida según las reglas configuradas en web.
 *   3. Si vacío, fallback con incluir_todos=true (catálogo abierto + aviso).
 *
 * El operario sólo elige entre la paleta válida. Si quiere uno fuera, el
 * mismo dropdown lo deja escribir pero avisa que ese color no pertenece a
 * la regla del producto.
 *
 * Destino se fija siempre a 'lavanderia' (sin campo visible).
 */
export const MobileNuevaMuestraLavanderia = () => {
  const { id: registroId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const puedeCrearMuestra = puede(user, ACCIONES.CREAR_MUESTRA_LAVANDERIA);

  const [registro, setRegistro] = useState(null);
  const [lavanderias, setLavanderias] = useState([]);
  const [paleta, setPaleta] = useState([]);  // colores permitidos por la regla
  const [reglaSource, setReglaSource] = useState(null); // null | 'tipo' | 'marca_tipo' | etc.
  const [reglaNombre, setReglaNombre] = useState(null);
  const [loading, setLoading] = useState(true);

  const [fechaEnvio, setFechaEnvio] = useState(hoyISO());
  const [lavanderiaId, setLavanderiaId] = useState('');
  const [observaciones, setObservaciones] = useState('');
  // Cada línea: { color_id, color_nombre, cantidad, observaciones_envio }
  const [lineas, setLineas] = useState([
    { color_id: null, color_nombre: '', cantidad: 5, observaciones_envio: '' },
  ]);

  const [picker, setPicker] = useState(null); // índice de la línea cuyo picker está abierto
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [regRes, lavRes, regColRes] = await Promise.all([
          axios.get(`${API}/registros/${registroId}`),
          axios.get(`${API}/muestras-lavanderia/lavanderias`).catch(() => ({ data: [] })),
          axios.get(`${API}/reportes-produccion/registro-colores/${registroId}`)
            .catch(() => ({ data: null })),
        ]);
        setRegistro(regRes.data);
        setLavanderias(Array.isArray(lavRes.data) ? lavRes.data : []);

        // Resolver paleta de colores aplicable según la regla
        const ctx = regColRes.data;
        if (ctx) {
          const params = new URLSearchParams();
          if (ctx.marca_id)   params.set('marca_id',   ctx.marca_id);
          if (ctx.tipo_id)    params.set('tipo_id',    ctx.tipo_id);
          if (ctx.entalle_id) params.set('entalle_id', ctx.entalle_id);
          if (ctx.hilo_id)    params.set('hilo_id',    ctx.hilo_id);

          let cols = [];
          let src = null;
          let nombre = null;
          try {
            const pSolo = new URLSearchParams(params);
            pSolo.set('solo_regla', 'true');
            const r1 = await axios.get(`${API}/colores-catalogo?${pSolo}`);
            cols = Array.isArray(r1.data) ? r1.data : [];
            if (cols.length > 0) {
              src = cols[0].regla_color_source || 'regla';
              nombre = cols[0].regla_color_nombre || null;
            }
          } catch { cols = []; }

          if (cols.length === 0) {
            // Fallback: catálogo completo (sin filtro de regla)
            try {
              const r2 = await axios.get(`${API}/colores-catalogo`);
              cols = Array.isArray(r2.data) ? r2.data : [];
              src = null;
            } catch { cols = []; }
          }
          setPaleta(cols);
          setReglaSource(src);
          setReglaNombre(nombre);
        }
      } catch {
        setRegistro(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [registroId]);

  const totalPzs = useMemo(
    () => lineas.reduce((s, l) => s + Number(l.cantidad || 0), 0),
    [lineas],
  );
  const hayCantidad = lineas.some(l => Number(l.cantidad) > 0 && l.color_nombre.trim());

  // Manejo de líneas
  const setLinea = (idx, patch) =>
    setLineas(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));
  const addLinea = () =>
    setLineas(prev => [...prev, { color_id: null, color_nombre: '', cantidad: 5, observaciones_envio: '' }]);
  const quitarLinea = (idx) =>
    setLineas(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);

  const pickColor = (idx, color) => {
    setLinea(idx, { color_id: color.id, color_nombre: color.nombre });
    setPicker(null);
  };

  const colorFueraDeRegla = (nombre) => {
    if (!reglaSource) return false; // no hay regla → todo vale
    if (!nombre || !nombre.trim()) return false;
    const ok = paleta.some(p =>
      String(p.nombre || '').trim().toLowerCase() === nombre.trim().toLowerCase()
    );
    return !ok;
  };

  const enviar = async () => {
    setError('');
    if (!fechaEnvio) return setError('Indica la fecha de envío');
    const validas = lineas.filter(l => l.color_nombre.trim() && Number(l.cantidad) > 0);
    if (validas.length === 0) return setError('Agrega al menos un color con cantidad mayor a 0');

    setEnviando(true);
    try {
      await axios.post(`${API}/registros/${registroId}/muestras-lavanderia`, {
        fecha_envio: fechaEnvio,
        destino: 'lavanderia',  // siempre
        observaciones: observaciones.trim() || undefined,
        persona_lavanderia_id: lavanderiaId || undefined,
        colores: validas.map(l => ({
          color_id: l.color_id || undefined,
          color_nombre: l.color_nombre.trim(),
          cantidad: Number(l.cantidad),
          observaciones_envio: l.observaciones_envio.trim() || undefined,
        })),
      });
      navigate(-1);
    } catch (e) {
      const det = e?.response?.data?.detail || 'Error al crear la muestra';
      setError(typeof det === 'string' ? det : String(det));
    } finally {
      setEnviando(false);
    }
  };

  if (!puedeCrearMuestra) {
    return <PantallaBloqueada titulo="Nueva muestra" mensaje="Tu rol no permite crear muestras a lavandería." />;
  }

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>
        <Loader2 className="m-spin" size={32} style={{ margin: '0 auto' }} />
      </div>
    );
  }

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
          <div style={{ fontSize: 11, opacity: 0.85 }}>
            Muestra · {registro?.n_corte}
          </div>
          <div style={{
            fontWeight: 600, fontSize: 16, lineHeight: 1.2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            Nueva muestra
          </div>
        </div>
      </div>

      <div style={{
        flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        {/* Fecha */}
        <div>
          <span className="m-label-xs">Fecha de envío</span>
          <input
            type="date"
            className="m-input"
            value={fechaEnvio}
            onChange={(e) => setFechaEnvio(e.target.value)}
            style={{ marginTop: 8, fontSize: 15 }}
          />
        </div>

        {/* Lavandería */}
        <div>
          <span className="m-label-xs">Lavandería</span>
          <select
            className="m-input"
            value={lavanderiaId}
            onChange={(e) => setLavanderiaId(e.target.value)}
            style={{ marginTop: 8, fontSize: 15 }}
          >
            <option value="">— Sin asignar —</option>
            {lavanderias.map(l => (
              <option key={l.id} value={l.id}>{l.nombre}</option>
            ))}
          </select>
          {lavanderias.length === 0 && (
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
              No hay proveedores de lavandería configurados.
            </div>
          )}
        </div>

        {/* Aviso regla de colores */}
        {reglaSource && (
          <div style={{
            background: 'var(--m-brand-soft)', borderRadius: 12,
            padding: 10, display: 'flex', gap: 10, alignItems: 'flex-start',
            fontSize: 11, color: 'var(--m-brand)', lineHeight: 1.5,
          }}>
            <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              Paleta limitada por la regla
              {reglaNombre ? <strong> "{reglaNombre}"</strong> : ' del producto'}.
              Se sugieren {paleta.length} colores compatibles.
            </span>
          </div>
        )}
        {!reglaSource && paleta.length > 0 && (
          <div style={{
            background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 12,
            padding: 10, display: 'flex', gap: 10, alignItems: 'flex-start',
            fontSize: 11, color: '#92400e', lineHeight: 1.5,
          }}>
            <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              No hay regla de colores configurada para este producto;
              mostrando todo el catálogo.
            </span>
          </div>
        )}

        {/* Colores a probar */}
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 8,
          }}>
            <span className="m-label-xs">Colores a probar</span>
            <span style={{
              fontSize: 11, fontWeight: 700, color: 'var(--m-brand)',
            }}>
              Total: {totalPzs} pzs
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {lineas.map((l, idx) => {
              const fuera = colorFueraDeRegla(l.color_nombre);
              return (
                <div
                  key={idx}
                  style={{
                    background: 'white', border: '1px solid #e5e7eb',
                    borderRadius: 12, padding: 12, position: 'relative',
                    ...(fuera && { borderColor: '#fcd34d' }),
                  }}
                >
                  {/* Quitar */}
                  {lineas.length > 1 && (
                    <button
                      onClick={() => quitarLinea(idx)}
                      style={{
                        position: 'absolute', top: 6, right: 6,
                        width: 26, height: 26, borderRadius: '50%',
                        background: '#f1f5f9', border: 0, color: '#64748b',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                      aria-label="Quitar color"
                    >
                      <X size={14} />
                    </button>
                  )}

                  {/* Nombre del color + cantidad */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                    <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                      <button
                        onClick={() => setPicker(picker === idx ? null : idx)}
                        style={{
                          width: '100%', padding: '10px 32px 10px 12px',
                          background: 'white', border: '1px solid #d1d5db',
                          borderRadius: 10, fontSize: 14, fontWeight: 600,
                          textAlign: 'left', cursor: 'pointer',
                          color: l.color_nombre ? '#0f172a' : '#94a3b8',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}
                      >
                        {l.color_nombre || 'Elegir color...'}
                      </button>
                      <ChevronDown size={14} style={{
                        position: 'absolute', right: 10, top: '50%',
                        transform: 'translateY(-50%)', color: '#94a3b8',
                        pointerEvents: 'none',
                      }} />
                    </div>

                    <div style={{
                      display: 'inline-flex', alignItems: 'stretch',
                      border: '1px solid #d1d5db', borderRadius: 10, overflow: 'hidden',
                    }}>
                      <button
                        onClick={() => setLinea(idx, { cantidad: Math.max(0, Number(l.cantidad) - 1) })}
                        style={btnStep}
                      >−</button>
                      <input
                        type="number"
                        value={l.cantidad}
                        onChange={(e) => setLinea(idx, { cantidad: Math.max(0, Number(e.target.value) || 0) })}
                        style={inputStep}
                      />
                      <button
                        onClick={() => setLinea(idx, { cantidad: Number(l.cantidad) + 1 })}
                        style={btnStep}
                      >+</button>
                    </div>
                  </div>

                  {/* Observación del envío */}
                  <input
                    className="m-input"
                    style={{ marginTop: 8, fontSize: 13 }}
                    placeholder="Observaciones del envío (opcional)"
                    value={l.observaciones_envio}
                    onChange={(e) => setLinea(idx, { observaciones_envio: e.target.value })}
                  />

                  {/* Aviso color fuera de regla */}
                  {fuera && (
                    <div style={{
                      marginTop: 8, padding: 8,
                      background: '#fffbeb', borderRadius: 8,
                      fontSize: 11, color: '#92400e',
                      display: 'flex', gap: 6, alignItems: 'flex-start',
                    }}>
                      <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
                      <span>
                        Este color no está en la regla del producto. Se guardará
                        igual pero confirma con tu supervisor.
                      </span>
                    </div>
                  )}

                  {/* Picker de colores (desplegable de la card) */}
                  {picker === idx && (
                    <ColorPicker
                      paleta={paleta}
                      seleccionado={l.color_id}
                      yaUsados={lineas
                        .filter((x, i) => i !== idx && x.color_id)
                        .map(x => x.color_id)}
                      onPick={(c) => pickColor(idx, c)}
                      onClose={() => setPicker(null)}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Agregar color */}
          <button
            onClick={addLinea}
            style={{
              width: '100%', marginTop: 10,
              padding: '12px', borderRadius: 12,
              background: 'transparent', border: '2px dashed #cbd5e1',
              color: '#64748b', fontSize: 13, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 6, cursor: 'pointer',
            }}
          >
            <Plus size={16} /> Agregar color
          </button>
        </div>

        {/* Observaciones generales */}
        <div>
          <span className="m-label-xs">Observaciones generales</span>
          <textarea
            rows={2}
            className="m-input"
            placeholder="Ej: Cliente quiere ver 3 tonos de negro..."
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            style={{ padding: 12, marginTop: 8, fontFamily: 'inherit', resize: 'vertical' }}
          />
        </div>

        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c',
            borderRadius: 12, padding: 12, fontSize: 13,
            display: 'flex', alignItems: 'flex-start', gap: 8,
          }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Footer fijo */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'white', borderTop: '1px solid #e5e7eb',
        padding: '10px 16px',
        display: 'flex', gap: 10, zIndex: 50,
      }}>
        <button
          onClick={() => navigate(-1)}
          className="m-btn m-btn-outline"
          style={{ flex: 1, borderColor: '#cbd5e1', color: '#475569', minHeight: 48 }}
        >
          Cancelar
        </button>
        <button
          className="m-btn m-btn-primary"
          disabled={enviando || !hayCantidad}
          onClick={enviar}
          style={{ flex: 2, minHeight: 48 }}
        >
          {enviando
            ? <><Loader2 className="m-spin" size={18} /> Enviando...</>
            : <><Send size={18} /> Enviar muestra ({totalPzs} pzs)</>}
        </button>
      </div>
    </div>
  );
};

/* ──────── Picker de colores ──────── */
const ColorPicker = ({ paleta, seleccionado, yaUsados, onPick, onClose }) => {
  const [q, setQ] = useState('');
  const filtrados = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return paleta;
    return paleta.filter(c =>
      String(c.nombre || '').toLowerCase().includes(s) ||
      String(c.color_general_nombre || '').toLowerCase().includes(s)
    );
  }, [paleta, q]);

  return (
    <div style={{
      marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9',
    }}>
      <input
        className="m-input"
        autoFocus
        placeholder="Buscar color..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ fontSize: 13 }}
      />
      <div style={{
        marginTop: 8, maxHeight: 220, overflowY: 'auto',
        background: '#f8fafc', borderRadius: 8,
      }}>
        {filtrados.length === 0 ? (
          <div style={{ padding: 14, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
            Sin coincidencias
          </div>
        ) : (
          filtrados.map(c => {
            const usado = yaUsados.includes(c.id);
            const activo = c.id === seleccionado;
            return (
              <button
                key={c.id}
                onClick={() => onPick(c)}
                disabled={usado && !activo}
                style={{
                  width: '100%', padding: '10px 12px',
                  background: activo ? 'var(--m-brand-soft)' : 'transparent',
                  border: 0, textAlign: 'left', cursor: usado && !activo ? 'not-allowed' : 'pointer',
                  fontSize: 13, fontWeight: 600,
                  color: usado && !activo ? '#cbd5e1' : '#0f172a',
                  display: 'flex', alignItems: 'center', gap: 8,
                  borderBottom: '1px solid #f1f5f9',
                }}
              >
                {c.codigo_hex && (
                  <span style={{
                    width: 14, height: 14, borderRadius: 4,
                    background: c.codigo_hex, border: '1px solid #e5e7eb',
                    flexShrink: 0,
                  }} />
                )}
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.nombre}
                </span>
                {usado && <span style={{ fontSize: 10, color: '#94a3b8' }}>usado</span>}
                {activo && <Check size={14} style={{ color: 'var(--m-brand)' }} />}
              </button>
            );
          })
        )}
      </div>
      <button
        onClick={onClose}
        className="m-btn m-btn-outline"
        style={{ marginTop: 8, width: '100%', minHeight: 36, fontSize: 12 }}
      >
        Cerrar
      </button>
    </div>
  );
};

const btnStep = {
  width: 38, height: 42, fontSize: 18, fontWeight: 700,
  background: '#f8fafc', border: 0, cursor: 'pointer',
};
const inputStep = {
  width: 52, textAlign: 'center', fontSize: 15, fontWeight: 700,
  border: 'none', outline: 'none', fontVariantNumeric: 'tabular-nums',
};

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export default MobileNuevaMuestraLavanderia;
