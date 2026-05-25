import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, ArrowRight, Loader2, Search, Check, AlertTriangle,
  Package, CheckCircle2,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Descarga MP — wizard de 3 pasos:
 *   1) Elegir material del BOM
 *   2) Elegir rollos (solo si control_por_rollos) o ingresar cantidad
 *   3) Confirmar y enviar
 */
export const MobileDescargaMP = () => {
  const { id: registroId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectItemId = searchParams.get('item_id'); // deep-link desde Materiales

  const [step, setStep] = useState(1);
  const [registro, setRegistro] = useState(null);
  const [materiales, setMateriales] = useState([]);
  const [loadingInicial, setLoadingInicial] = useState(true);
  const [itemSeleccionado, setItemSeleccionado] = useState(null);
  const [rollosSel, setRollosSel] = useState({}); // { rollo_id: { metraje, completo } }
  const [cantidadDirecta, setCantidadDirecta] = useState(0); // para items sin rollos
  const [observaciones, setObservaciones] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [exitoData, setExitoData] = useState(null);
  const [error, setError] = useState('');

  // 1) Cargar registro + materiales del BOM
  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [regRes, matRes] = await Promise.all([
          axios.get(`${API}/registros/${registroId}`),
          axios.get(`${API}/registros/${registroId}/materiales`).catch(() => ({ data: {} })),
        ]);
        setRegistro(regRes.data);
        const reqLines = matRes.data?.requerimiento || matRes.data?.lineas || [];
        const salidas = matRes.data?.salidas || [];
        const disp = matRes.data?.disponibilidad || {};
        // Construir vista por item: agrupamos requerimientos por item
        const porItem = {};
        reqLines.forEach(l => {
          const k = l.item_id;
          if (!porItem[k]) {
            porItem[k] = {
              item_id: k,
              item_codigo: l.item_codigo,
              item_nombre: l.item_nombre,
              item_unidad: l.item_unidad || 'u',
              control_por_rollos: !!l.control_por_rollos,
              requerido: 0,
              descargado: 0,
              stock_actual: l.stock_actual ?? 0,
              disponible: disp[k]?.disponible ?? l.stock_actual ?? 0,
            };
          }
          porItem[k].requerido += Number(l.cantidad_requerida || 0);
        });
        salidas.forEach(s => {
          const k = s.item_id;
          if (porItem[k]) porItem[k].descargado += Number(s.cantidad || 0);
        });
        setMateriales(Object.values(porItem));
      } catch (e) {
        setError('No se pudo cargar el registro.');
      } finally {
        setLoadingInicial(false);
      }
    };
    fetchAll();
  }, [registroId]);

  /* ─────── Total de prendas del corte ─────── */
  const totalPrendas = useMemo(() => {
    if (!registro) return 0;
    const t = registro.tallas;
    if (Array.isArray(t)) {
      return t.reduce((sum, x) => sum + (Number(x?.cantidad) || 0), 0);
    }
    if (t && typeof t === 'object') {
      return Object.values(t).reduce((sum, n) => sum + (Number(n) || 0), 0);
    }
    // Fallback: parsear la curva tipo "15/30/35/20"
    if (typeof registro.curva === 'string') {
      return registro.curva.split('/').reduce((s, n) => s + (Number(n) || 0), 0);
    }
    return 0;
  }, [registro]);

  /* ─────── Deep-link: si vino con ?item_id=X, saltamos al paso 2 ─────── */
  useEffect(() => {
    if (loadingInicial || !preselectItemId || itemSeleccionado) return;
    const found = materiales.find(m => m.item_id === preselectItemId);
    if (found) {
      elegirItem(found);
      return;
    }
    // Si no está en el BOM, lo buscamos en inventario y lo adaptamos
    axios.get(`${API}/inventario/${preselectItemId}`)
      .then(res => {
        const raw = res.data;
        if (!raw) return;
        const adaptado = {
          item_id: raw.id,
          item_codigo: raw.codigo,
          item_nombre: raw.nombre,
          item_unidad: raw.unidad_medida || 'u',
          control_por_rollos: !!raw.control_por_rollos,
          requerido: 0,
          descargado: 0,
          stock_actual: Number(raw.stock_actual || 0),
          fuera_de_bom: true,
        };
        elegirItem(adaptado);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingInicial, preselectItemId, materiales]);

  /* ─────── Paso 1: elegir item ─────── */
  const elegirItem = (item) => {
    setItemSeleccionado(item);
    setRollosSel({});
    // Default inteligente:
    //  - Si tiene requerido (está en BOM): cantidad = pendiente del BOM
    //  - Si NO está en BOM y es avío (no rollos): sugerimos total de prendas del corte
    //  - Si NO está en BOM y es tela: 0 (el operario elige rollos)
    let defaultQty = Math.max(0, item.requerido - item.descargado);
    if (item.fuera_de_bom && !item.control_por_rollos && totalPrendas > 0) {
      defaultQty = Math.min(totalPrendas, Number(item.stock_actual) || totalPrendas);
    }
    setCantidadDirecta(defaultQty);
    setStep(2);
  };

  /* ─────── Paso 2 → Paso 3 ─────── */
  const irAConfirmar = () => {
    setError('');
    setStep(3);
  };

  /* ─────── Paso 3: confirmar descarga ─────── */
  const confirmar = async () => {
    if (!itemSeleccionado) return;
    setEnviando(true);
    setError('');
    try {
      if (itemSeleccionado.control_por_rollos) {
        // Crear una salida por cada rollo seleccionado
        const arr = Object.entries(rollosSel).filter(([, v]) => v.metraje > 0);
        if (arr.length === 0) throw new Error('Selecciona al menos un rollo');
        const resultados = [];
        for (const [rolloId, v] of arr) {
          const res = await axios.post(`${API}/inventario-salidas`, {
            item_id: itemSeleccionado.item_id,
            cantidad: Number(v.metraje),
            rollo_id: rolloId,
            registro_id: registroId,
            observaciones: observaciones.trim() || undefined,
          });
          resultados.push(res.data);
        }
        setExitoData({
          total: arr.reduce((s, [, v]) => s + Number(v.metraje), 0),
          unidad: itemSeleccionado.item_unidad,
          rollos: arr.length,
          item: itemSeleccionado,
        });
      } else {
        if (cantidadDirecta <= 0) throw new Error('Cantidad debe ser mayor a 0');
        const res = await axios.post(`${API}/inventario-salidas`, {
          item_id: itemSeleccionado.item_id,
          cantidad: Number(cantidadDirecta),
          registro_id: registroId,
          observaciones: observaciones.trim() || undefined,
        });
        setExitoData({
          total: Number(cantidadDirecta),
          unidad: itemSeleccionado.item_unidad,
          rollos: 0,
          item: itemSeleccionado,
        });
      }
    } catch (e) {
      const detail = e?.response?.data?.detail || e?.message || 'Error al descargar';
      setError(typeof detail === 'string' ? detail : 'Error al descargar');
    } finally {
      setEnviando(false);
    }
  };

  /* ─────── Render ─────── */
  if (loadingInicial) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>
        <Loader2 className="m-spin" size={32} style={{ margin: '0 auto' }} />
      </div>
    );
  }

  if (exitoData) {
    return <PantallaExito data={exitoData} registroId={registroId} onNueva={() => {
      setExitoData(null); setRollosSel({}); setItemSeleccionado(null); setStep(1); setObservaciones('');
    }} />;
  }

  const ratioPendiente = (m) => Math.max(0, m.requerido - m.descargado);

  return (
    <>
      <div className="m-header">
        <button className="m-h-icon" onClick={() => step === 1 ? navigate(-1) : setStep(step - 1)}>
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {registro?.modelo_nombre || registro?.modelo_manual?.nombre_modelo || 'Descargar MP'}
          </div>
          <div style={{
            fontSize: 11, opacity: 0.85, marginTop: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {registro?.n_corte}
            {registro?.estado && <> · {registro.estado}</>}
            {' · '}
            {step === 1 ? 'Descarga MP · ¿qué material?'
              : step === 2 ? `Descarga MP · ${itemSeleccionado?.control_por_rollos ? 'rollos' : 'cantidad'}`
              : 'Descarga MP · confirmar'}
          </div>
        </div>
      </div>

      {/* Dots progreso */}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', padding: 12 }}>
        {[1, 2, 3].map(n => (
          <div key={n} style={{
            width: step === n ? 24 : 8, height: 8, borderRadius: 4,
            background: step >= n ? '#0f766e' : '#cbd5e1',
            transition: 'width .2s',
          }} />
        ))}
      </div>

      <div style={{ padding: '0 16px 16px', flex: 1 }}>
        {step === 1 && (
          <Step1Material
            materiales={materiales}
            onElegir={elegirItem}
            lineaNegocioId={registro?.linea_negocio_id}
            lineaNegocioNombre={registro?.linea_negocio_nombre}
          />
        )}
        {step === 2 && itemSeleccionado && (
          <Step2Cantidad
            item={itemSeleccionado}
            metaRestante={ratioPendiente(itemSeleccionado)}
            totalPrendas={totalPrendas}
            rollosSel={rollosSel}
            setRollosSel={setRollosSel}
            cantidadDirecta={cantidadDirecta}
            setCantidadDirecta={setCantidadDirecta}
            onContinuar={irAConfirmar}
          />
        )}
        {step === 3 && itemSeleccionado && (
          <Step3Confirmar
            registro={registro}
            item={itemSeleccionado}
            rollosSel={rollosSel}
            cantidadDirecta={cantidadDirecta}
            observaciones={observaciones}
            setObservaciones={setObservaciones}
            onConfirmar={confirmar}
            enviando={enviando}
            error={error}
          />
        )}
      </div>
    </>
  );
};

/* ═════════════════════════════════ STEP 1 ═════════════════════════════════ */
const Step1Material = ({ materiales, onElegir, lineaNegocioId, lineaNegocioNombre }) => {
  const [q, setQ] = useState('');
  const [modo, setModo] = useState('bom'); // 'bom' | 'todos'
  const [soloMiLinea, setSoloMiLinea] = useState(!!lineaNegocioId); // por defecto: ON si el registro tiene línea
  const [inventario, setInventario] = useState([]);
  const [cargandoInv, setCargandoInv] = useState(false);

  // Carga lazy del inventario completo cuando cambia el modo o el filtro de línea
  useEffect(() => {
    if (modo !== 'todos') return;
    setCargandoInv(true);
    const params = new URLSearchParams({ all: 'true' });
    if (soloMiLinea && lineaNegocioId) {
      params.set('linea_negocio_id', String(lineaNegocioId));
    }
    axios.get(`${API}/inventario?${params}`)
      .then(res => {
        const items = Array.isArray(res.data) ? res.data : (res.data?.items || []);
        setInventario(items.filter(i => i.categoria !== 'PT'));
      })
      .catch(() => setInventario([]))
      .finally(() => setCargandoInv(false));
  }, [modo, soloMiLinea, lineaNegocioId]);

  // Items del BOM por id, para resaltar "ya está en BOM" cuando estás en modo Todos
  const bomIds = useMemo(() => new Set(materiales.map(m => m.item_id)), [materiales]);

  // Lista efectiva según modo
  const lista = modo === 'bom' ? materiales : inventario;

  const filtradas = useMemo(() => {
    const base = lista;
    if (!q.trim()) return base;
    const s = q.toLowerCase();
    return base.filter(m =>
      ((m.item_codigo || m.codigo) || '').toLowerCase().includes(s) ||
      ((m.item_nombre || m.nombre) || '').toLowerCase().includes(s)
    );
  }, [lista, q]);

  // Adapta un item del inventario al shape que espera Step2 (item_id, item_codigo, item_nombre, ...)
  const adaptarItem = (raw) => {
    if (raw.item_id) return raw; // ya es del BOM, viene normalizado
    return {
      item_id: raw.id,
      item_codigo: raw.codigo,
      item_nombre: raw.nombre,
      item_unidad: raw.unidad_medida || 'u',
      control_por_rollos: !!raw.control_por_rollos,
      requerido: 0,           // sin meta de BOM
      descargado: 0,
      stock_actual: Number(raw.stock_actual || 0),
      fuera_de_bom: true,
    };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ position: 'relative' }}>
        <Search size={18} style={{
          position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
          color: '#94a3b8',
        }} />
        <input
          className="m-input"
          style={{ paddingLeft: 40 }}
          placeholder="Buscar material..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {/* Toggle BOM / Todos */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className={`m-chip ${modo === 'bom' ? 'active' : ''}`}
          style={{ fontSize: 12, minHeight: 36, padding: '6px 12px', flex: 1, justifyContent: 'center' }}
          onClick={() => setModo('bom')}
        >
          Del BOM ({materiales.length})
        </button>
        <button
          className={`m-chip ${modo === 'todos' ? 'active' : ''}`}
          style={{ fontSize: 12, minHeight: 36, padding: '6px 12px', flex: 1, justifyContent: 'center' }}
          onClick={() => setModo('todos')}
        >
          Todo el inventario{inventario.length > 0 ? ` (${inventario.length})` : ''}
        </button>
      </div>

      {modo === 'todos' && (
        <>
          <div style={{
            background: '#fef3c7', border: '1px solid #fcd34d',
            color: '#92400e', borderRadius: 12, padding: '8px 12px',
            fontSize: 12, display: 'flex', alignItems: 'flex-start', gap: 8,
          }}>
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              Estás descargando un material <strong>fuera del BOM</strong>. Queda registrado igual y se vincula al corte.
            </span>
          </div>

          {/* Filtro de línea de negocio */}
          {lineaNegocioId && (
            <label style={{
              background: 'white', border: '1px solid #e5e7eb', borderRadius: 12,
              padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10,
              cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={soloMiLinea}
                onChange={(e) => setSoloMiLinea(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: '#0f766e' }}
              />
              <div style={{ flex: 1, fontSize: 13 }}>
                <div style={{ fontWeight: 600 }}>
                  Solo materiales de {lineaNegocioNombre || 'mi línea'}
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  {soloMiLinea
                    ? 'Filtrado por la línea del corte + materiales globales'
                    : 'Mostrando todo el inventario sin filtrar'}
                </div>
              </div>
            </label>
          )}
        </>
      )}

      {/* Estado vacío del BOM */}
      {modo === 'bom' && materiales.length === 0 && (
        <div className="m-card" style={{ textAlign: 'center', padding: 24, color: '#64748b' }}>
          <Package size={36} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
          <p style={{ margin: 0, fontSize: 13 }}>
            Este registro no tiene requerimiento de MP definido.<br/>
            Usa <strong>Todo el inventario</strong> para descargar manualmente.
          </p>
        </div>
      )}

      {/* Loading inventario */}
      {modo === 'todos' && cargandoInv && (
        <div style={{ textAlign: 'center', padding: 24, color: '#64748b' }}>
          <Loader2 className="m-spin" size={24} />
        </div>
      )}

      {/* Lista de items */}
      {filtradas.map(raw => {
        const m = adaptarItem(raw);
        const pendiente = Math.max(0, m.requerido - m.descargado);
        const completo = m.requerido > 0 && pendiente === 0;
        const enBom = bomIds.has(m.item_id);

        return (
          <button
            key={m.item_id}
            className="m-card m-card-tap"
            disabled={completo}
            onClick={() => onElegir(m)}
            style={{
              border: completo ? '1px solid #86efac' : '1px solid #e5e7eb',
              background: completo ? '#f0fdf4' : 'white',
              opacity: completo ? 0.75 : 1,
              cursor: completo ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 10,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontFamily: 'ui-monospace, monospace', fontSize: 10, color: '#64748b',
              }}>
                <span>{m.item_codigo}</span>
                {modo === 'todos' && enBom && (
                  <span className="m-pill m-pill-blue" style={{ fontSize: 9, padding: '1px 6px' }}>EN BOM</span>
                )}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{m.item_nombre}</div>
              <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>
                {m.requerido > 0 ? (
                  <>
                    Requiere <strong>{fmtNum(m.requerido)} {m.item_unidad}</strong>
                    {' · '}Descargado <strong>{fmtNum(m.descargado)} {m.item_unidad}</strong>
                    {' · '}Stock <strong>{fmtNum(m.stock_actual)}</strong>
                  </>
                ) : (
                  <>
                    Stock disponible <strong>{fmtNum(m.stock_actual)} {m.item_unidad}</strong>
                    {m.control_por_rollos ? ' · control por rollos' : ''}
                  </>
                )}
              </div>
            </div>
            {completo ? (
              <span className="m-pill m-pill-green"><Check size={10} /> Completo</span>
            ) : m.requerido > 0 ? (
              <span className="m-pill m-pill-amber">Faltan {fmtNum(pendiente)}</span>
            ) : (
              <span className="m-pill m-pill-gray">Manual</span>
            )}
          </button>
        );
      })}

      {modo === 'todos' && !cargandoInv && filtradas.length === 0 && (
        <div className="m-card" style={{ textAlign: 'center', padding: 24, color: '#64748b' }}>
          <p style={{ margin: 0, fontSize: 13 }}>
            {q ? `Sin resultados para "${q}"` : 'No hay materiales en inventario'}
          </p>
        </div>
      )}
    </div>
  );
};

/* ═════════════════════════════════ STEP 2 ═════════════════════════════════ */
const Step2Cantidad = ({ item, metaRestante, totalPrendas, rollosSel, setRollosSel, cantidadDirecta, setCantidadDirecta, onContinuar }) => {
  // Caso A: con rollos
  if (item.control_por_rollos) {
    return <Step2Rollos item={item} metaRestante={metaRestante} rollosSel={rollosSel} setRollosSel={setRollosSel} onContinuar={onContinuar} />;
  }

  // Caso B: sin rollos (avíos), input simple
  const stockActual = item.stock_actual || 0;
  const excede = cantidadDirecta > stockActual;
  const sugerirPrendas = item.fuera_de_bom && totalPrendas > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="m-card">
        <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#64748b' }}>{item.item_codigo}</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}>{item.item_nombre}</div>
        <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>
          {item.requerido > 0 ? (
            <>
              Requerido restante: <strong>{fmtNum(metaRestante)} {item.item_unidad}</strong>
              {' · '}Stock: <strong>{fmtNum(stockActual)} {item.item_unidad}</strong>
            </>
          ) : (
            <>
              Stock disponible: <strong>{fmtNum(stockActual)} {item.item_unidad}</strong>
              {totalPrendas > 0 && (
                <>{' · '}Corte de <strong>{totalPrendas} prendas</strong></>
              )}
            </>
          )}
        </div>
      </div>

      <div>
        <span className="m-label-xs">Cantidad a descargar</span>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          marginTop: 8, justifyContent: 'center',
        }}>
          <button
            className="m-btn m-btn-outline"
            style={{ width: 48, padding: 0, fontSize: 22 }}
            onClick={() => setCantidadDirecta(Math.max(0, Number(cantidadDirecta) - 1))}
          >−</button>
          <input
            className="m-input"
            type="number"
            value={cantidadDirecta}
            onChange={(e) => setCantidadDirecta(Number(e.target.value) || 0)}
            style={{
              maxWidth: 120, textAlign: 'center',
              fontSize: 22, fontWeight: 700,
              ...(excede ? { borderColor: '#dc2626', color: '#dc2626' } : {}),
            }}
          />
          <button
            className="m-btn m-btn-outline"
            style={{ width: 48, padding: 0, fontSize: 22 }}
            onClick={() => setCantidadDirecta(Number(cantidadDirecta) + 1)}
          >+</button>
        </div>
        <div style={{ textAlign: 'center', marginTop: 8, fontSize: 12, color: '#64748b' }}>
          {item.item_unidad}
        </div>

        {/* Atajos rápidos cuando es avío fuera de BOM */}
        {sugerirPrendas && (
          <div style={{
            display: 'flex', gap: 6, justifyContent: 'center',
            flexWrap: 'wrap', marginTop: 10,
          }}>
            <span style={{ fontSize: 11, color: '#64748b', marginRight: 4, alignSelf: 'center' }}>
              Sugerido:
            </span>
            <button
              className={`m-chip ${cantidadDirecta === totalPrendas ? 'active' : ''}`}
              style={{ fontSize: 12, minHeight: 32, padding: '4px 10px' }}
              onClick={() => setCantidadDirecta(Math.min(totalPrendas, stockActual))}
            >
              {totalPrendas} (1 por prenda)
            </button>
            <button
              className="m-chip"
              style={{ fontSize: 12, minHeight: 32, padding: '4px 10px' }}
              onClick={() => setCantidadDirecta(Math.min(totalPrendas * 2, stockActual))}
            >
              {totalPrendas * 2} (2 por prenda)
            </button>
          </div>
        )}

        {excede && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fca5a5',
            color: '#b91c1c', borderRadius: 12, padding: '10px 14px',
            fontSize: 13, marginTop: 12,
          }}>
            La cantidad excede el stock disponible.
          </div>
        )}
      </div>

      <div style={{ position: 'sticky', bottom: 0, background: 'white', padding: '12px 0', marginTop: 'auto' }}>
        <button
          className="m-btn m-btn-primary"
          style={{ width: '100%' }}
          disabled={cantidadDirecta <= 0 || excede}
          onClick={onContinuar}
        >
          Continuar
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
};

/* ─── Sub-paso 2: rollos ─── */
const Step2Rollos = ({ item, metaRestante, rollosSel, setRollosSel, onContinuar }) => {
  const [rollos, setRollos] = useState([]);
  const [cargandoR, setCargandoR] = useState(true);

  useEffect(() => {
    const fetchR = async () => {
      setCargandoR(true);
      try {
        const res = await axios.get(`${API}/inventario-rollos?item_id=${item.item_id}&activo=true`);
        setRollos((res.data || []).filter(r => Number(r.metraje_disponible || 0) > 0));
      } catch {
        setRollos([]);
      } finally { setCargandoR(false); }
    };
    fetchR();
  }, [item.item_id]);

  const toggleRollo = (rollo) => {
    setRollosSel(prev => {
      if (prev[rollo.id]) {
        const { [rollo.id]: _, ...rest } = prev;
        return rest;
      }
      return {
        ...prev,
        [rollo.id]: {
          metraje: Number(rollo.metraje_disponible),
          completo: true,
          rollo,
        },
      };
    });
  };

  const toggleParcial = (rolloId) => {
    setRollosSel(prev => {
      const v = prev[rolloId];
      if (!v) return prev;
      return {
        ...prev,
        [rolloId]: { ...v, completo: !v.completo, metraje: !v.completo ? Number(v.rollo.metraje_disponible) : 0 },
      };
    });
  };

  const setMetrajeParcial = (rolloId, val) => {
    setRollosSel(prev => {
      const v = prev[rolloId];
      if (!v) return prev;
      const n = Number(val) || 0;
      const max = Number(v.rollo.metraje_disponible);
      return { ...prev, [rolloId]: { ...v, metraje: Math.min(Math.max(0, n), max) } };
    });
  };

  const seleccionados = Object.values(rollosSel).filter(v => v.metraje > 0);
  const totalSel = seleccionados.reduce((s, v) => s + v.metraje, 0);
  const diff = metaRestante - totalSel;

  if (cargandoR) {
    return <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}><Loader2 className="m-spin" size={24} /></div>;
  }

  if (rollos.length === 0) {
    return (
      <div className="m-card" style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>
        <Package size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
        <p style={{ margin: 0, fontSize: 14 }}>No hay rollos disponibles para este material.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, color: '#64748b' }}>
        Meta: <strong>{fmtNum(metaRestante)} {item.item_unidad}</strong> · {rollos.length} rollos disponibles
      </div>

      {rollos.map(r => {
        const sel = rollosSel[r.id];
        const isSel = !!sel;
        return (
          <div key={r.id} className="m-card" style={{
            border: isSel ? '2px solid #0f766e' : '1px solid #e5e7eb',
            background: isSel ? '#f0fdfa' : 'white',
          }}>
            <button
              onClick={() => toggleRollo(r)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                background: 'transparent', border: 0, cursor: 'pointer', textAlign: 'left',
              }}
            >
              <div style={{
                width: 22, height: 22, borderRadius: 6,
                border: isSel ? '2px solid #0f766e' : '2px solid #cbd5e1',
                background: isSel ? '#0f766e' : 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {isSel && <Check size={14} color="white" />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13 }}>
                    {r.numero_rollo || r.id.slice(0, 6)}
                  </span>
                  {r.tono && <span className="m-pill m-pill-gray">Tono {r.tono}</span>}
                  {r.ancho && <span style={{ fontSize: 11, color: '#64748b' }}>{r.ancho} cm</span>}
                </div>
                <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>
                  Disponible: <strong>{fmtNum(r.metraje_disponible)} {item.item_unidad}</strong>
                </div>
              </div>
              <span style={{
                fontFamily: 'monospace', fontWeight: 700, fontSize: 14,
                color: isSel ? '#0f766e' : '#94a3b8',
              }}>
                {fmtNum(sel?.metraje ?? r.metraje_disponible)} {item.item_unidad}
              </span>
            </button>

            {isSel && (
              <div style={{
                marginTop: 10, padding: 8, background: 'rgba(255,255,255,0.5)',
                borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10,
                flexWrap: 'wrap',
              }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569' }}>
                  <input
                    type="checkbox"
                    checked={sel.completo}
                    onChange={() => toggleParcial(r.id)}
                    style={{ width: 16, height: 16, accentColor: '#0f766e' }}
                  />
                  Rollo completo
                </label>
                {!sel.completo && (
                  <input
                    type="number"
                    step="0.01"
                    value={sel.metraje}
                    onChange={(e) => setMetrajeParcial(r.id, e.target.value)}
                    style={{
                      width: 100, fontFamily: 'monospace', fontSize: 14,
                      border: '1px solid #d1d5db', borderRadius: 8, padding: '6px 10px',
                      textAlign: 'center',
                    }}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Footer pegado abajo dentro del scroll */}
      <div style={{ position: 'sticky', bottom: 0, background: 'white', padding: '12px 0', marginTop: 12 }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 8, fontSize: 13,
        }}>
          <span style={{ color: '#64748b' }}>
            {seleccionados.length} rollos · meta {fmtNum(metaRestante)}
          </span>
          <span style={{
            fontFamily: 'monospace', fontWeight: 700, fontSize: 16,
            color: '#0f766e',
          }}>
            {fmtNum(totalSel)} {item.item_unidad}
          </span>
        </div>
        {diff > 0 && totalSel > 0 && (
          <div style={{
            background: '#fef3c7', border: '1px solid #fcd34d',
            color: '#92400e', borderRadius: 12, padding: '8px 12px',
            fontSize: 12, marginBottom: 8,
          }}>
            Faltan <strong>{fmtNum(diff)} {item.item_unidad}</strong> para cubrir la meta.
          </div>
        )}
        <button
          className="m-btn m-btn-primary"
          style={{ width: '100%' }}
          disabled={seleccionados.length === 0}
          onClick={onContinuar}
        >
          Confirmar descarga
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
};

/* ═════════════════════════════════ STEP 3 ═════════════════════════════════ */
const Step3Confirmar = ({ registro, item, rollosSel, cantidadDirecta, observaciones, setObservaciones, onConfirmar, enviando, error }) => {
  const seleccionados = Object.values(rollosSel).filter(v => v.metraje > 0);
  const totalSel = item.control_por_rollos
    ? seleccionados.reduce((s, v) => s + v.metraje, 0)
    : cantidadDirecta;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="m-card">
        <span className="m-label-xs">Registro</span>
        <div style={{ fontWeight: 600, marginTop: 2 }}>
          {registro?.n_corte} · {registro?.modelo_nombre || '—'}
        </div>
      </div>
      <div className="m-card">
        <span className="m-label-xs">Material</span>
        <div style={{ fontWeight: 600, marginTop: 2 }}>
          {item.item_codigo} · {item.item_nombre}
        </div>
      </div>

      {item.control_por_rollos ? (
        <div className="m-card" style={{ padding: 0 }}>
          {seleccionados.map((v, i) => (
            <div key={v.rollo.id} style={{
              padding: 12, display: 'flex', justifyContent: 'space-between',
              borderBottom: i < seleccionados.length - 1 ? '1px solid #f1f5f9' : 'none',
            }}>
              <div>
                <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13 }}>
                  {v.rollo.numero_rollo || v.rollo.id.slice(0, 6)}
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  {v.completo ? 'Rollo completo' : 'Parcial'}
                </div>
              </div>
              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0f766e' }}>
                {fmtNum(v.metraje)} {item.item_unidad}
              </span>
            </div>
          ))}
          <div style={{
            padding: 12, background: '#f8fafc',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            borderTop: '1px solid #e5e7eb',
          }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Total a descargar</span>
            <span style={{
              fontFamily: 'monospace', fontWeight: 700, fontSize: 18, color: '#0f766e',
            }}>{fmtNum(totalSel)} {item.item_unidad}</span>
          </div>
        </div>
      ) : (
        <div className="m-card" style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'var(--m-brand-soft)', borderColor: '#99f6e4',
        }}>
          <span style={{ fontWeight: 600 }}>Cantidad a descargar</span>
          <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 20, color: '#0f766e' }}>
            {fmtNum(totalSel)} {item.item_unidad}
          </span>
        </div>
      )}

      <div>
        <span className="m-label-xs">Observaciones (opcional)</span>
        <textarea
          className="m-input"
          rows={2}
          style={{ padding: 12, marginTop: 6, fontFamily: 'inherit', resize: 'vertical' }}
          placeholder="Ej: corte para tallas M-L..."
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

      <div style={{ position: 'sticky', bottom: 0, background: 'white', padding: '12px 0', marginTop: 'auto' }}>
        <button
          className="m-btn m-btn-primary"
          style={{ width: '100%' }}
          onClick={onConfirmar}
          disabled={enviando}
        >
          {enviando
            ? <><Loader2 className="m-spin" size={18} /> Procesando...</>
            : <><Check size={18} /> Confirmar descarga</>}
        </button>
      </div>
    </div>
  );
};

/* ═════════════════════════════════ ÉXITO ═════════════════════════════════ */
const PantallaExito = ({ data, registroId, onNueva }) => (
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
    <div style={{ fontSize: 20, fontWeight: 700 }}>Salida registrada</div>
    <div style={{ fontSize: 14, color: '#475569', marginTop: 4, maxWidth: 280 }}>
      {fmtNum(data.total)} {data.unidad} de {data.item.item_nombre} descargados al registro
    </div>

    <div className="m-card" style={{ width: '100%', maxWidth: 320, marginTop: 24, textAlign: 'left' }}>
      {data.rollos > 0 && (
        <Row k="Rollos" v={data.rollos} />
      )}
      <Row k="Material" v={`${data.item.item_codigo} · ${data.item.item_nombre}`} small />
      <Row k="Cantidad" v={`${fmtNum(data.total)} ${data.unidad}`} mono />
    </div>

    <div style={{ width: '100%', maxWidth: 320, marginTop: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Link to={`/m/registros/${registroId}`} className="m-btn m-btn-primary" style={{ textDecoration: 'none' }}>
        Volver al registro
      </Link>
      <button className="m-btn m-btn-outline" onClick={onNueva}>
        Nueva descarga
      </button>
    </div>
  </div>
);

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

function fmtNum(n) {
  const v = Number(n) || 0;
  return v % 1 === 0 ? v.toString() : v.toFixed(2);
}

export default MobileDescargaMP;
