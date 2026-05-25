import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Loader2, Save, AlertTriangle, Package,
  Plus, AlertCircle, Lock, Check, X, Info,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Cargar/editar tallas del corte — versión rediseñada (Sprint 18).
 *
 *  GET  /api/registros/:id/tallas    → tallas activas del modelo + cantidades
 *  GET  /api/tallas-catalogo         → catálogo global (S, M, L, 26, 28, 30...)
 *  POST /api/registros/:id/tallas    → upsert; el backend ahora auto-agrega
 *                                       al modelo cualquier talla del catálogo
 *                                       global que aún no esté.
 *
 * El operario puede:
 *  - Editar cantidades de las tallas que el modelo ya tiene activas.
 *  - Agregar tallas nuevas desde el catálogo global → quedan activas en el modelo.
 *  - Ver porcentajes y un gráfico de barras de la distribución en vivo.
 */
export const MobileEditarTallas = () => {
  const { id: registroId } = useParams();
  const navigate = useNavigate();

  const [registro, setRegistro] = useState(null);
  const [tallasModelo, setTallasModelo] = useState([]); // [{talla_id, talla_nombre, cantidad_real, talla_orden}]
  const [catalogo, setCatalogo] = useState([]);          // [{id, nombre, orden}]
  const [cantidades, setCantidades] = useState({});      // talla_id -> n
  const [extras, setExtras] = useState({});              // talla_id (no en modelo) -> {nombre, orden}
  const [picker, setPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [regRes, tallasRes, catRes] = await Promise.all([
          axios.get(`${API}/registros/${registroId}`),
          axios.get(`${API}/registros/${registroId}/tallas`),
          axios.get(`${API}/tallas-catalogo`).catch(() => ({ data: [] })),
        ]);
        const reg = regRes.data;
        setRegistro(reg);
        const cat = Array.isArray(catRes.data) ? catRes.data : [];
        setCatalogo(cat);

        const tablaTallas = tallasRes.data?.tallas || [];
        const tieneTablaConCantidades = tablaTallas.some(t => Number(t.cantidad_real) > 0);

        // Caso 1: la tabla normalizada tiene datos → usarla
        if (tieneTablaConCantidades) {
          setTallasModelo(tablaTallas);
          const map = {};
          for (const t of tablaTallas) {
            map[t.talla_id] = Number(t.cantidad_real || 0);
          }
          setCantidades(map);
        } else {
          // Caso 2: tabla vacía pero el JSONB del registro tiene cantidades.
          // Prepoblamos desde ahí para que al guardar se "oficialicen".
          const jsonb = parseTallasJsonb(reg?.tallas);
          if (jsonb.length > 0) {
            // Mapear contra catálogo global para conseguir orden y validar
            const map = {};
            const extrasInit = {};
            const tallasIniciales = [];
            const tallasDelModeloMap = new Map(tablaTallas.map(t => [t.talla_id, t]));

            for (const t of jsonb) {
              const tid = t.talla_id;
              if (!tid) continue;
              const cant = Number(t.cantidad || 0);
              map[tid] = cant;
              // Si la talla está en la respuesta del modelo (aunque con 0), usarla
              if (tallasDelModeloMap.has(tid)) {
                tallasIniciales.push(tallasDelModeloMap.get(tid));
              } else {
                // Si está en el catálogo global, marcarla como "extra" (se auto-activará al guardar)
                const enCatalogo = cat.find(c => c.id === tid);
                if (enCatalogo) {
                  extrasInit[tid] = {
                    nombre: enCatalogo.nombre,
                    orden: enCatalogo.orden || 99,
                  };
                } else {
                  // Talla huérfana (no está en catálogo global): la marcamos como extra
                  // con el nombre del JSONB, pero al guardar el backend la rechazará.
                  // Usuario tendrá que crearla en catálogo global desde web.
                  extrasInit[tid] = {
                    nombre: t.talla_nombre || tid,
                    orden: 99,
                  };
                }
              }
            }
            setTallasModelo(tablaTallas);
            setExtras(extrasInit);
            setCantidades(map);
          } else {
            // Caso 3: ni tabla ni JSONB tienen tallas → empezamos desde cero
            setTallasModelo(tablaTallas);
          }
        }
      } catch (e) {
        setError(e?.response?.data?.detail || 'Error cargando las tallas');
      } finally {
        setLoading(false);
      }
    })();
  }, [registroId]);

  const cerrado = registro?.estado === 'CERRADA';
  const anulado = registro?.estado === 'ANULADA';
  const bloqueado = cerrado || anulado;

  // Lista combinada: tallas del modelo + extras agregadas en esta sesión
  const tallasMostradas = useMemo(() => {
    const m = tallasModelo.map(t => ({
      talla_id: t.talla_id,
      talla_nombre: t.talla_nombre,
      orden: t.talla_orden || 99,
      esExtra: false,
    }));
    for (const [tid, info] of Object.entries(extras)) {
      m.push({
        talla_id: tid,
        talla_nombre: info.nombre,
        orden: info.orden || 99,
        esExtra: true,
      });
    }
    return m.sort((a, b) => a.orden - b.orden);
  }, [tallasModelo, extras]);

  const total = useMemo(
    () => Object.values(cantidades).reduce((s, n) => s + Number(n || 0), 0),
    [cantidades],
  );
  const maxCant = useMemo(
    () => Math.max(1, ...Object.values(cantidades).map(n => Number(n) || 0)),
    [cantidades],
  );

  const setCant = (talla_id, n) => {
    const v = Math.max(0, Math.floor(Number(n) || 0));
    setCantidades(prev => ({ ...prev, [talla_id]: v }));
  };

  const agregarDelCatalogo = (talla) => {
    // Si ya está en el modelo o en extras, no hago nada
    if (cantidades[talla.id] !== undefined) return;
    setExtras(prev => ({
      ...prev,
      [talla.id]: { nombre: talla.nombre, orden: talla.orden },
    }));
    setCantidades(prev => ({ ...prev, [talla.id]: 0 }));
    setPicker(false);
  };

  const quitarExtra = (talla_id) => {
    setExtras(prev => {
      const next = { ...prev };
      delete next[talla_id];
      return next;
    });
    setCantidades(prev => {
      const next = { ...prev };
      delete next[talla_id];
      return next;
    });
  };

  const guardar = async () => {
    setError('');
    setGuardando(true);
    try {
      const body = {
        tallas: tallasMostradas.map(t => ({
          talla_id: t.talla_id,
          cantidad_real: Number(cantidades[t.talla_id] || 0),
        })),
      };
      await axios.post(`${API}/registros/${registroId}/tallas`, body);
      navigate(-1);
    } catch (e) {
      const det = e?.response?.data?.detail || 'Error al guardar las tallas';
      setError(typeof det === 'string' ? det : String(det));
    } finally {
      setGuardando(false);
    }
  };

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
          <div style={{
            fontSize: 11, opacity: 0.85,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {registro?.n_corte} · {registro?.modelo_nombre || registro?.modelo_manual?.nombre_modelo || '—'}
          </div>
          <div style={{ fontWeight: 600, fontSize: 16, lineHeight: 1.2 }}>
            Editar tallas
          </div>
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Bloqueo si CERRADA / ANULADA */}
        {bloqueado && (
          <div style={{
            background: cerrado ? '#dcfce7' : '#fee2e2',
            border: `1px solid ${cerrado ? '#86efac' : '#fca5a5'}`,
            color: cerrado ? '#15803d' : '#b91c1c',
            borderRadius: 12, padding: 12, fontSize: 12,
            display: 'flex', gap: 10, alignItems: 'flex-start',
          }}>
            <Lock size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>OP {registro.estado}. Las tallas son solo lectura.</span>
          </div>
        )}

        {/* Aviso de impacto */}
        {!bloqueado && (
          <div style={{
            background: '#fffbeb', border: '1px solid #fcd34d',
            borderRadius: 12, padding: 12, fontSize: 12, color: '#92400e',
            display: 'flex', gap: 10, alignItems: 'flex-start',
            lineHeight: 1.5,
          }}>
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              Cambiar tallas <strong>recalcula la matriz Talla×Color</strong> y
              el requerimiento de materia prima. El cambio queda registrado
              en auditoría.
            </span>
          </div>
        )}

        {/* Cards grandes por talla */}
        <div style={{
          background: 'white', border: '1px solid #e5e7eb',
          borderRadius: 16, overflow: 'hidden',
        }}>
          {tallasMostradas.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
              <Package size={28} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
              <p style={{ margin: 0, fontSize: 13 }}>
                Aún no hay tallas. Toca <strong>Agregar talla</strong> abajo.
              </p>
            </div>
          ) : (
            tallasMostradas.map((t, i) => {
              const val = Number(cantidades[t.talla_id] || 0);
              const pct = total > 0 ? (val / total) * 100 : 0;
              return (
                <div key={t.talla_id} style={{
                  padding: '14px 14px',
                  borderBottom: i < tallasMostradas.length - 1 ? '1px solid #f1f5f9' : 'none',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  {/* Badge cuadrado con el nombre */}
                  <div style={{
                    width: 48, height: 48, borderRadius: 10,
                    background: 'var(--m-brand-soft)', color: 'var(--m-brand)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: 16, flexShrink: 0,
                  }}>
                    {t.talla_nombre}
                  </div>

                  {/* Etiqueta + extra */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 14, fontWeight: 600, color: '#0f172a',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      Talla {t.talla_nombre}
                      {t.esExtra && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, letterSpacing: '.04em',
                          padding: '2px 6px', borderRadius: 999,
                          background: '#dbeafe', color: '#1d4ed8',
                          textTransform: 'uppercase',
                        }}>
                          nueva
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                      {pct > 0 ? `${pct.toFixed(1)}%` : 'sin asignar'}
                    </div>
                  </div>

                  {/* Stepper */}
                  <div style={{
                    display: 'inline-flex', alignItems: 'stretch',
                    border: '1px solid #d1d5db', borderRadius: 10, overflow: 'hidden',
                  }}>
                    <button
                      onClick={() => setCant(t.talla_id, val - 1)}
                      disabled={bloqueado || val <= 0}
                      style={{
                        width: 38, height: 40, fontSize: 20, fontWeight: 700,
                        background: '#f8fafc', border: 0,
                        cursor: bloqueado ? 'not-allowed' : 'pointer',
                        opacity: bloqueado ? 0.5 : 1,
                      }}
                    >−</button>
                    <input
                      type="number" min={0} value={val}
                      onChange={(e) => setCant(t.talla_id, e.target.value)}
                      disabled={bloqueado}
                      style={{
                        width: 56, textAlign: 'center', fontSize: 16, fontWeight: 700,
                        border: 'none', outline: 'none',
                        fontVariantNumeric: 'tabular-nums',
                        background: 'transparent',
                      }}
                    />
                    <button
                      onClick={() => setCant(t.talla_id, val + 1)}
                      disabled={bloqueado}
                      style={{
                        width: 38, height: 40, fontSize: 20, fontWeight: 700,
                        background: '#f8fafc', border: 0,
                        cursor: bloqueado ? 'not-allowed' : 'pointer',
                        opacity: bloqueado ? 0.5 : 1,
                      }}
                    >+</button>
                  </div>

                  {/* Quitar (sólo extras) */}
                  {t.esExtra && !bloqueado && (
                    <button
                      onClick={() => quitarExtra(t.talla_id)}
                      style={{
                        width: 30, height: 30, borderRadius: '50%',
                        background: '#fef2f2', color: '#b91c1c', border: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', flexShrink: 0,
                      }}
                      aria-label="Quitar talla"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Agregar talla del catálogo */}
        {!bloqueado && (
          <button
            onClick={() => setPicker(true)}
            style={{
              width: '100%', padding: '12px', borderRadius: 12,
              background: 'transparent', border: '2px dashed #cbd5e1',
              color: '#64748b', fontSize: 13, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 6, cursor: 'pointer',
            }}
          >
            <Plus size={16} /> Agregar talla
            <span style={{ color: '#94a3b8', fontWeight: 500, marginLeft: 4 }}>
              (XS · XXL · …)
            </span>
          </button>
        )}

        {/* Curva visual: barras simples */}
        {tallasMostradas.length > 0 && total > 0 && (
          <div>
            <div className="m-label-xs" style={{ marginBottom: 8 }}>
              Curva visual
            </div>
            <div style={{
              background: 'white', border: '1px solid #e5e7eb',
              borderRadius: 12, padding: '14px 12px 10px',
            }}>
              <div style={{
                display: 'flex', alignItems: 'flex-end',
                height: 80, gap: 8, paddingBottom: 6,
                borderBottom: '1px solid #f1f5f9',
              }}>
                {tallasMostradas.map(t => {
                  const v = Number(cantidades[t.talla_id] || 0);
                  const altura = maxCant > 0 ? (v / maxCant) * 100 : 0;
                  return (
                    <div
                      key={t.talla_id}
                      style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end' }}
                      title={`${t.talla_nombre}: ${v}`}
                    >
                      <div style={{
                        width: '100%', height: `${altura}%`,
                        background: v > 0 ? 'var(--m-brand)' : '#e2e8f0',
                        borderRadius: '6px 6px 0 0',
                        transition: 'height 200ms',
                        minHeight: v > 0 ? 4 : 2,
                      }} />
                    </div>
                  );
                })}
              </div>
              <div style={{
                display: 'flex', gap: 8, marginTop: 6,
              }}>
                {tallasMostradas.map(t => (
                  <div key={t.talla_id} style={{
                    flex: 1, textAlign: 'center', fontSize: 10,
                    color: '#64748b', fontWeight: 700,
                  }}>
                    {t.talla_nombre}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Total tras cambios */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          padding: '12px 4px',
        }}>
          <span style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>
            Total tras cambios
          </span>
          <span style={{
            fontFamily: 'ui-monospace, monospace', fontWeight: 800,
            fontSize: 22, color: 'var(--m-brand)',
          }}>
            {total.toLocaleString('es-PE')} pzs
          </span>
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
          disabled={guardando || bloqueado || tallasMostradas.length === 0}
          onClick={guardar}
          style={{ flex: 2, minHeight: 48 }}
        >
          {guardando
            ? <><Loader2 className="m-spin" size={18} /> Guardando...</>
            : bloqueado
              ? <><Lock size={18} /> Solo lectura</>
              : <><Save size={18} /> Guardar tallas</>}
        </button>
      </div>

      {/* Picker de catálogo global */}
      {picker && (
        <PickerCatalogo
          catalogo={catalogo}
          yaUsadas={new Set(tallasMostradas.map(t => t.talla_id))}
          onPick={agregarDelCatalogo}
          onClose={() => setPicker(false)}
        />
      )}
    </div>
  );
};

/* ──────── Helper: leer tallas del JSONB legacy ──────── */
function parseTallasJsonb(t) {
  if (!t) return [];
  if (typeof t === 'string') {
    try { t = JSON.parse(t); } catch { return []; }
  }
  if (Array.isArray(t)) {
    return t
      .filter(Boolean)
      .map(item => ({
        talla_id: item.talla_id || null,
        talla_nombre: item.talla_nombre || item.nombre || '',
        cantidad: Number(item.cantidad ?? item.cantidad_real ?? 0),
      }))
      .filter(x => x.talla_id && x.cantidad > 0);
  }
  return [];
}

/* ──────── Picker bottom sheet ──────── */

// Orden lógico para tallas alfabéticas
const ORDEN_LETRAS = ['XXXS', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '2XL', '3XL', '4XL', '5XL'];

function ordenarTallas(lista) {
  // Separa en alfabéticas vs numéricas y devuelve dos listas ordenadas.
  const letras = [];
  const numeros = [];
  const otras = [];
  for (const t of lista) {
    const n = String(t.nombre || '').trim().toUpperCase();
    if (/^[0-9]+(\.[0-9]+)?$/.test(n)) {
      numeros.push(t);
    } else if (ORDEN_LETRAS.includes(n) || /^[A-Z]{1,5}$/.test(n)) {
      letras.push(t);
    } else {
      otras.push(t);
    }
  }
  // Ordenar alfabéticas por la posición en ORDEN_LETRAS (las desconocidas al final)
  letras.sort((a, b) => {
    const ia = ORDEN_LETRAS.indexOf(String(a.nombre).toUpperCase());
    const ib = ORDEN_LETRAS.indexOf(String(b.nombre).toUpperCase());
    if (ia === -1 && ib === -1) return String(a.nombre).localeCompare(b.nombre);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  // Ordenar numéricas por valor ascendente
  numeros.sort((a, b) => Number(a.nombre) - Number(b.nombre));
  // Otras por nombre
  otras.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
  return { letras, numeros, otras };
}

const PickerCatalogo = ({ catalogo, yaUsadas, onPick, onClose }) => {
  const [q, setQ] = useState('');
  const grupos = useMemo(() => {
    const s = q.trim().toLowerCase();
    const filtradas = catalogo
      .filter(c => !yaUsadas.has(c.id))
      .filter(c => !s || String(c.nombre || '').toLowerCase().includes(s));
    return ordenarTallas(filtradas);
  }, [catalogo, q, yaUsadas]);

  const totalDisponibles = grupos.letras.length + grupos.numeros.length + grupos.otras.length;

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
          padding: '12px 16px 20px', maxHeight: '75vh',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ width: 40, height: 4, background: '#cbd5e1', borderRadius: 2, margin: '0 auto 12px' }} />
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
          Agregar talla
        </div>
        <div style={{
          fontSize: 11, color: '#64748b', marginBottom: 12, lineHeight: 1.5,
          display: 'flex', gap: 6, alignItems: 'flex-start',
        }}>
          <Info size={12} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            Si esta talla aún no estaba activa en el modelo, se activa
            automáticamente al guardar.
          </span>
        </div>

        <input
          className="m-input" autoFocus
          placeholder="Buscar talla..."
          value={q} onChange={(e) => setQ(e.target.value)}
          style={{ fontSize: 14, marginBottom: 10 }}
        />

        <div style={{
          flex: 1, overflowY: 'auto', background: '#f8fafc',
          borderRadius: 8, maxHeight: '50vh',
        }}>
          {totalDisponibles === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              {catalogo.length === 0
                ? 'No hay tallas en el catálogo global. Créalas primero desde web.'
                : 'No quedan tallas para agregar.'}
            </div>
          ) : (
            <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {grupos.letras.length > 0 && (
                <SeccionTallas titulo="Alfabéticas" tallas={grupos.letras} onPick={onPick} />
              )}
              {grupos.numeros.length > 0 && (
                <SeccionTallas titulo="Numéricas" tallas={grupos.numeros} onPick={onPick} />
              )}
              {grupos.otras.length > 0 && (
                <SeccionTallas titulo="Otras" tallas={grupos.otras} onPick={onPick} />
              )}
            </div>
          )}
        </div>

        <button onClick={onClose} className="m-btn m-btn-outline" style={{ marginTop: 10, minHeight: 44 }}>
          Cerrar
        </button>
      </div>
    </div>
  );
};

/* ──────── Sección dentro del picker (letras / números / otras) ──────── */
const SeccionTallas = ({ titulo, tallas, onPick }) => (
  <div>
    <div style={{
      fontSize: 10, fontWeight: 700, color: '#64748b',
      textTransform: 'uppercase', letterSpacing: '.04em',
      marginBottom: 6, padding: '0 2px',
    }}>
      {titulo}
    </div>
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(68px, 1fr))',
      gap: 8,
    }}>
      {tallas.map(c => (
        <button
          key={c.id}
          onClick={() => onPick(c)}
          style={{
            padding: '12px 4px', borderRadius: 10,
            background: 'white', border: '1px solid #e5e7eb',
            cursor: 'pointer', textAlign: 'center',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
          }}
        >
          <span style={{
            fontSize: 16, fontWeight: 800, color: 'var(--m-brand)',
          }}>
            {c.nombre}
          </span>
          <Plus size={12} style={{ color: 'var(--m-brand)' }} />
        </button>
      ))}
    </div>
  </div>
);

export default MobileEditarTallas;
