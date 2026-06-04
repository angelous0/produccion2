import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Loader2, Save, Plus, X, AlertTriangle,
  Lock, Info, FlaskConical, ChevronUp, ChevronDown, Search, Calculator,
  Copy, Check, ArrowLeftRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { puede, ACCIONES } from '../utils/permisos';
import { formatColorName } from '../../lib/utils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Asignar colores (matriz talla × color) — mobile, fiel al mockup operario.
 *
 * Endpoints:
 *   GET  /reportes-produccion/registro-colores/:id
 *   GET  /colores-catalogo?marca_id&tipo_id&entalle_id&hilo_id&solo_regla=true
 *   PUT  /reportes-produccion/registro-colores/:id
 *   PUT  /reportes-produccion/registro-colores/:id/aprobar
 *   POST /reportes-produccion/registro-colores/aplicar-bulk
 *   GET  /registros/:id/muestras-lavanderia    (sólo para chip "Muestras N")
 *
 * Sólo hay una matriz por registro → esta pantalla actúa también como vista.
 */
export const MobileEditarMatrizColores = () => {
  const { id: registroId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  // esAdmin acá significa "puede aprobar/desaprobar matriz" — solo admin tiene ese permiso.
  // Editar la matriz (mientras no esté aprobada) lo puede hacer también supervisor_acabado.
  const esAdmin = puede(user, ACCIONES.APROBAR_MATRIZ_COLORES);
  const puedeEditarMatriz = puede(user, ACCIONES.EDITAR_MATRIZ_COLORES) || esAdmin;

  const [ctx, setCtx] = useState(null);
  const [paleta, setPaleta] = useState([]);
  const [reglaSource, setReglaSource] = useState(null);
  const [reglaNombre, setReglaNombre] = useState(null);
  const [muestrasCount, setMuestrasCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filas: { color_id, color_nombre, codigo_hex, peso, cantidades: {talla_id: n} }
  const [filas, setFilas] = useState([]);

  const [picker, setPicker] = useState(false);
  // Swap: índice de la fila cuyo color se está cambiando. null = no swap.
  // Reusa el mismo ColorPickerSheet que "Agregar color" pero con onPick distinto:
  // en vez de agregar fila nueva, reemplaza el color de la fila en swapIdx
  // manteniendo peso + cantidades por talla.
  const [swapIdx, setSwapIdx] = useState(null);
  const [aplicarOpen, setAplicarOpen] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aprobando, setAprobando] = useState(false);
  const [desaprobando, setDesaprobando] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [ctxRes, muestrasRes] = await Promise.all([
          axios.get(`${API}/reportes-produccion/registro-colores/${registroId}`),
          axios.get(`${API}/registros/${registroId}/muestras-lavanderia`).catch(() => ({ data: [] })),
        ]);
        const d = ctxRes.data;
        setCtx(d);
        setMuestrasCount(Array.isArray(muestrasRes.data) ? muestrasRes.data.length : 0);

        // Paleta por regla
        const params = new URLSearchParams();
        if (d.marca_id)   params.set('marca_id',   d.marca_id);
        if (d.tipo_id)    params.set('tipo_id',    d.tipo_id);
        if (d.entalle_id) params.set('entalle_id', d.entalle_id);
        if (d.hilo_id)    params.set('hilo_id',    d.hilo_id);

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
          try {
            const r2 = await axios.get(`${API}/colores-catalogo`);
            cols = Array.isArray(r2.data) ? r2.data : [];
          } catch { cols = []; }
        }
        setPaleta(cols);
        setReglaSource(src);
        setReglaNombre(nombre);

        // Filas desde distribucion_actual
        const inicial = (d.distribucion_actual || []).reduce((acc, talla) => {
          for (const c of (talla.colores || [])) {
            const key = c.color_id || c.color_nombre;
            if (!acc[key]) {
              acc[key] = {
                color_id: c.color_id,
                color_nombre: c.color_nombre || '—',
                codigo_hex: null,
                peso: 1,
                cantidades: {},
              };
            }
            acc[key].cantidades[talla.talla_id] = Number(c.cantidad || 0);
          }
          return acc;
        }, {});
        for (const f of Object.values(inicial)) {
          const p = cols.find(c => c.id === f.color_id);
          if (p) f.codigo_hex = p.codigo_hex;
        }
        setFilas(Object.values(inicial));
      } catch (e) {
        setError(e?.response?.data?.detail || 'Error cargando el registro');
      } finally {
        setLoading(false);
      }
    })();
  }, [registroId]);

  const tallas = ctx?.tallas || [];
  const aprobados = ctx?.colores_aprobados;
  const bloqueado = aprobados && !esAdmin;

  // Cálculos
  const totalesPorTalla = useMemo(() => {
    const m = {};
    for (const t of tallas) m[t.talla_id] = 0;
    for (const f of filas) {
      for (const [tid, n] of Object.entries(f.cantidades)) {
        m[tid] = (m[tid] || 0) + Number(n || 0);
      }
    }
    return m;
  }, [filas, tallas]);

  const totalTope = useMemo(
    () => tallas.reduce((s, t) => s + Number(t.cantidad_total || 0), 0),
    [tallas],
  );
  const totalAsignado = useMemo(
    () => Object.values(totalesPorTalla).reduce((s, n) => s + n, 0),
    [totalesPorTalla],
  );

  const algunaExcede = useMemo(() => tallas.some(t =>
    (totalesPorTalla[t.talla_id] || 0) > Number(t.cantidad_total || 0)
  ), [totalesPorTalla, tallas]);
  const listoParaGuardar = !algunaExcede && filas.length > 0 && totalAsignado > 0;
  const completoPorTalla = (t) =>
    (totalesPorTalla[t.talla_id] || 0) === Number(t.cantidad_total || 0)
    && Number(t.cantidad_total) > 0;

  // Helpers de filas
  const setCantidad = (idx, talla_id, valor) => {
    setFilas(prev => prev.map((f, i) =>
      i === idx ? { ...f, cantidades: { ...f.cantidades, [talla_id]: Math.max(0, Number(valor) || 0) } } : f
    ));
  };
  const setPeso = (idx, valor) => {
    const n = Math.max(0, Number(valor) || 0);
    setFilas(prev => prev.map((f, i) => i === idx ? { ...f, peso: n } : f));
  };
  const moverFila = (idx, dir) => {
    setFilas(prev => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };
  const quitarFila = (idx) => setFilas(prev => prev.filter((_, i) => i !== idx));
  const agregarColor = (color) => {
    if (filas.some(f => f.color_id === color.id)) return;
    setFilas(prev => [...prev, {
      color_id: color.id,
      color_nombre: color.nombre,
      codigo_hex: color.codigo_hex,
      peso: 1,
      cantidades: {},
    }]);
    setPicker(false);
  };
  // Swap: cambia el color de la fila `idx` por uno nuevo del catálogo,
  // manteniendo intactos peso y cantidades por talla. El picker ya filtra
  // los colores ya usados (yaUsados) → no se puede swap a uno duplicado.
  const swapColorFila = (color) => {
    if (swapIdx === null) return;
    if (filas.some(f => f.color_id === color.id)) {
      setSwapIdx(null);
      return; // Defensa extra: el picker ya lo filtra, pero por las dudas
    }
    setFilas(prev => prev.map((f, i) => i === swapIdx
      ? { ...f, color_id: color.id, color_nombre: color.nombre, codigo_hex: color.codigo_hex }
      : f
    ));
    setSwapIdx(null);
  };

  /** Prorratea cada talla entre las filas según pesos (Hamilton). */
  const prorratear = () => {
    const colores = filas.filter(f => Number(f.peso || 0) > 0);
    if (colores.length === 0) return;
    const sumaPesos = colores.reduce((s, f) => s + Number(f.peso || 0), 0);
    if (sumaPesos <= 0) return;

    const nuevaCantPorFila = new Map(filas.map(f => [f, { ...f.cantidades }]));
    // Resetear sólo los colores con peso > 0 (los que tengan peso 0 dejan sus números)
    for (const f of colores) {
      const nuevo = {};
      for (const t of tallas) nuevo[t.talla_id] = 0;
      nuevaCantPorFila.set(f, nuevo);
    }

    for (const t of tallas) {
      const total = Number(t.cantidad_total || 0);
      if (total <= 0) continue;
      const exactos = colores.map(f => total * Number(f.peso) / sumaPesos);
      const base = exactos.map(v => Math.floor(v));
      let resto = total - base.reduce((s, n) => s + n, 0);
      const ordenDecimal = exactos
        .map((v, i) => ({ i, dec: v - Math.floor(v) }))
        .sort((a, b) => b.dec - a.dec);
      let k = 0;
      while (resto > 0) {
        base[ordenDecimal[k % ordenDecimal.length].i] += 1;
        resto--; k++;
      }
      colores.forEach((f, i) => {
        nuevaCantPorFila.get(f)[t.talla_id] = base[i];
      });
    }

    setFilas(prev => prev.map(f => ({ ...f, cantidades: nuevaCantPorFila.get(f) || f.cantidades })));
    setMensaje('Cantidades prorrateadas según pesos.');
    setTimeout(() => setMensaje(''), 2500);
  };

  const construirDistribucion = () => tallas.map(t => ({
    talla_id: t.talla_id,
    talla_nombre: t.talla_nombre,
    cantidad_total: Number(t.cantidad_total || 0),
    colores: filas
      .map(f => ({
        color_id: f.color_id,
        color_nombre: f.color_nombre,
        cantidad: Number(f.cantidades[t.talla_id] || 0),
      }))
      .filter(c => c.cantidad > 0),
  }));

  const guardar = async () => {
    setError(''); setMensaje('');
    if (algunaExcede) return setError('Hay tallas donde la suma excede el tope. Corrige antes de guardar.');
    if (filas.length === 0) return setError('Agrega al menos un color.');
    setGuardando(true);
    try {
      await axios.put(
        `${API}/reportes-produccion/registro-colores/${registroId}`,
        { distribucion: construirDistribucion() },
      );
      navigate(-1);
    } catch (e) {
      const det = e?.response?.data?.detail || 'Error al guardar la matriz';
      setError(typeof det === 'string' ? det : String(det));
    } finally {
      setGuardando(false);
    }
  };

  const desaprobar = async () => {
    if (!window.confirm('¿Desaprobar la matriz? Volverá a estar editable.')) return;
    setError(''); setMensaje('');
    setDesaprobando(true);
    try {
      await axios.put(
        `${API}/reportes-produccion/registro-colores/${registroId}/desaprobar`,
      );
      // Recargar el contexto para reflejar el cambio en pantalla
      const ctxRes = await axios.get(`${API}/reportes-produccion/registro-colores/${registroId}`);
      setCtx(ctxRes.data);
      setMensaje('Matriz desaprobada. Ahora se puede editar.');
      setTimeout(() => setMensaje(''), 3000);
    } catch (e) {
      const det = e?.response?.data?.detail || 'Error al desaprobar';
      setError(typeof det === 'string' ? det : String(det));
    } finally {
      setDesaprobando(false);
    }
  };

  const aprobar = async () => {
    if (!window.confirm('¿Aprobar la matriz? Sólo admin podrá editarla después.')) return;
    setError(''); setMensaje('');
    if (algunaExcede || filas.length === 0) return setError('La matriz no está lista para aprobar.');
    setAprobando(true);
    try {
      // Primero guardar lo actual, luego aprobar
      await axios.put(
        `${API}/reportes-produccion/registro-colores/${registroId}`,
        { distribucion: construirDistribucion() },
      );
      await axios.put(
        `${API}/reportes-produccion/registro-colores/${registroId}/aprobar`,
      );
      navigate(-1);
    } catch (e) {
      const det = e?.response?.data?.detail || 'Error al aprobar la matriz';
      setError(typeof det === 'string' ? det : String(det));
    } finally {
      setAprobando(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>
        <Loader2 className="m-spin" size={32} style={{ margin: '0 auto' }} />
      </div>
    );
  }

  if (!ctx) {
    return (
      <>
        <div className="m-header">
          <button className="m-h-icon" onClick={() => navigate(-1)}><ArrowLeft size={18} /></button>
          <div style={{ flex: 1, fontWeight: 600 }}>Matriz no disponible</div>
        </div>
        <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
          {error || 'No se pudo cargar el registro.'}
        </div>
      </>
    );
  }

  if (tallas.length === 0) {
    return (
      <>
        <div className="m-header">
          <button className="m-h-icon" onClick={() => navigate(-1)}><ArrowLeft size={18} /></button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, opacity: 0.85 }}>{ctx.n_corte}</div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>Asignar colores</div>
          </div>
        </div>
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="m-card" style={{
            background: '#fffbeb', borderColor: '#fcd34d',
            padding: 16, color: '#92400e',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                <strong>Primero carga las tallas del corte.</strong><br/>
                La matriz necesita saber cuántas prendas hay por talla
                para repartirlas por color.
              </div>
            </div>
          </div>
          <Link
            to={`/m/registros/${registroId}/tallas/editar`}
            className="m-btn m-btn-primary"
            style={{ textDecoration: 'none', minHeight: 48 }}
          >
            <Plus size={18} /> Cargar tallas
          </Link>
          <Link
            to={`/m/registros/${registroId}`}
            className="m-btn m-btn-outline"
            style={{
              textDecoration: 'none', minHeight: 44,
              borderColor: '#cbd5e1', color: '#64748b',
            }}
          >
            Volver al registro
          </Link>
        </div>
      </>
    );
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      minHeight: '100vh', paddingBottom: 90,
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
            {ctx.n_corte} · {ctx.modelo_nombre || '—'}
          </div>
          <div style={{ fontWeight: 600, fontSize: 16, lineHeight: 1.2 }}>
            Asignar colores
          </div>
        </div>
        <Link
          to={`/m/registros/${registroId}/muestras-lavanderia`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 999,
            background: 'rgba(255,255,255,0.15)', color: 'white',
            textDecoration: 'none', fontSize: 12, fontWeight: 700,
            flexShrink: 0,
          }}
        >
          <FlaskConical size={14} /> Muestras {muestrasCount}
        </Link>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Barra "Total asignado" */}
        <div style={{
          background: 'white', border: '1px solid #e5e7eb',
          borderRadius: 12, padding: 14,
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            marginBottom: 8,
          }}>
            <span style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>
              Total asignado
            </span>
            <span style={{
              fontFamily: 'ui-monospace, monospace', fontWeight: 800, fontSize: 16,
              color: totalAsignado === totalTope ? 'var(--m-brand)'
                   : totalAsignado > totalTope ? '#b91c1c' : '#0f172a',
            }}>
              {totalAsignado} / {totalTope} pzs
            </span>
          </div>
          <div style={{
            height: 8, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, totalTope > 0 ? (totalAsignado / totalTope) * 100 : 0)}%`,
              background: algunaExcede ? '#dc2626'
                         : totalAsignado === totalTope ? 'var(--m-brand)' : '#2dd4bf',
              transition: 'width 200ms',
            }} />
          </div>
        </div>

        {/* Aviso aprobado */}
        {aprobados && (
          <div style={{
            background: '#dcfce7', border: '1px solid #86efac', color: '#15803d',
            borderRadius: 12, padding: 12, fontSize: 12,
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <Lock size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                <strong>Matriz aprobada</strong>
                {ctx.colores_aprobados_por ? ` por ${ctx.colores_aprobados_por}` : ''}.
                {bloqueado ? ' Solo admin puede modificar.' : ' Puedes editarla (eres admin).'}
              </span>
            </div>
            {esAdmin && (
              <button
                onClick={desaprobar}
                disabled={desaprobando}
                className="m-btn m-btn-outline"
                style={{
                  borderColor: '#86efac', color: '#15803d',
                  minHeight: 36, fontSize: 12, fontWeight: 700,
                }}
              >
                {desaprobando
                  ? <><Loader2 className="m-spin" size={14} /> Desaprobando...</>
                  : <><Lock size={13} /> Desaprobar matriz</>}
              </button>
            )}
          </div>
        )}

        {/* Aviso regla */}
        {reglaSource && (
          <div style={{
            background: 'var(--m-brand-soft)', borderRadius: 12,
            padding: 10, display: 'flex', gap: 10, alignItems: 'flex-start',
            fontSize: 11, color: 'var(--m-brand)', lineHeight: 1.5,
          }}>
            <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              Paleta de {paleta.length} colores
              {reglaNombre ? <> · regla <strong>{reglaNombre}</strong></> : ''}.
            </span>
          </div>
        )}

        {/* Tabla matriz */}
        <div>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 6,
          }}>
            <span className="m-label-xs">Distribución</span>
            {tallas.length > 3 && (
              <span style={{ fontSize: 10, color: '#94a3b8' }}>
                desliza horizontal →
              </span>
            )}
          </div>

          <div style={{
            background: 'white', border: '1px solid #e5e7eb',
            borderRadius: 12, overflow: 'hidden',
          }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{
                borderCollapse: 'collapse', minWidth: '100%',
                fontSize: 13, fontFamily: 'inherit',
              }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={thColor}>Color</th>
                    <th style={thProp}>
                      <div>Prop.</div>
                      <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 500 }}>peso</div>
                    </th>
                    {tallas.map(t => (
                      <th key={t.talla_id} style={thTalla}>
                        <div style={{ fontWeight: 800 }}>{t.talla_nombre}</div>
                        <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 500 }}>
                          tope {t.cantidad_total}
                        </div>
                      </th>
                    ))}
                    {!bloqueado && <th style={{ ...thTalla, width: 32 }} />}
                  </tr>
                </thead>
                <tbody>
                  {filas.length === 0 ? (
                    <tr>
                      <td colSpan={2 + tallas.length + (bloqueado ? 0 : 1)}
                        style={{
                          padding: 24, textAlign: 'center',
                          fontSize: 12, color: '#94a3b8',
                        }}>
                        Sin colores asignados todavía. Toca <strong>Agregar color</strong> abajo.
                      </td>
                    </tr>
                  ) : (
                    filas.map((f, idx) => (
                      <tr key={f.color_id || idx} style={{ borderTop: '1px solid #f1f5f9' }}>
                        <td style={tdColor}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {f.codigo_hex && (
                              <span style={{
                                width: 12, height: 12, borderRadius: 3,
                                background: f.codigo_hex, border: '1px solid #e5e7eb', flexShrink: 0,
                              }} />
                            )}
                            <span style={{
                              fontWeight: 600,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              maxWidth: 120,
                            }} title={formatColorName(f.color_nombre)}>
                              {formatColorName(f.color_nombre)}
                            </span>
                            {!bloqueado && (
                              <button
                                onClick={() => setSwapIdx(idx)}
                                style={{
                                  background: 'var(--m-brand-soft)', border: 0,
                                  borderRadius: 6, padding: 4, cursor: 'pointer',
                                  color: 'var(--m-brand)', display: 'flex',
                                  alignItems: 'center', justifyContent: 'center',
                                  marginLeft: 4,
                                }}
                                title="Cambiar este color por otro"
                                aria-label="Cambiar color"
                              >
                                <ArrowLeftRight size={12} />
                              </button>
                            )}
                            {!bloqueado && (
                              <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 'auto' }}>
                                <button
                                  onClick={() => moverFila(idx, -1)}
                                  disabled={idx === 0}
                                  style={btnArrow}
                                  aria-label="Subir"
                                >
                                  <ChevronUp size={11} />
                                </button>
                                <button
                                  onClick={() => moverFila(idx, +1)}
                                  disabled={idx === filas.length - 1}
                                  style={btnArrow}
                                  aria-label="Bajar"
                                >
                                  <ChevronDown size={11} />
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                        <td style={tdInput}>
                          <input
                            type="number" step="0.5" min={0}
                            value={f.peso}
                            onChange={(e) => setPeso(idx, e.target.value)}
                            disabled={bloqueado}
                            style={inputCelda}
                          />
                        </td>
                        {tallas.map(t => {
                          const val = Number(f.cantidades[t.talla_id] || 0);
                          const tope = Number(t.cantidad_total || 0);
                          const sumaTalla = totalesPorTalla[t.talla_id] || 0;
                          const exc = sumaTalla > tope;
                          return (
                            <td key={t.talla_id} style={tdInput}>
                              <input
                                type="number" min={0} value={val}
                                onChange={(e) => setCantidad(idx, t.talla_id, e.target.value)}
                                disabled={bloqueado}
                                style={{
                                  ...inputCelda,
                                  background: exc ? '#fef2f2' : 'var(--m-brand-soft)',
                                  borderColor: exc ? '#fca5a5' : '#a7f3d0',
                                  color: exc ? '#b91c1c' : '#0f172a',
                                }}
                              />
                            </td>
                          );
                        })}
                        {!bloqueado && (
                          <td style={{ ...tdInput, padding: 4 }}>
                            <button
                              onClick={() => quitarFila(idx)}
                              style={{
                                background: 'transparent', border: 0, color: '#94a3b8',
                                cursor: 'pointer', padding: 4,
                              }}
                              aria-label="Quitar color"
                            >
                              <X size={14} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}

                  {/* Fila Usado / Total */}
                  {filas.length > 0 && (
                    <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                      <td style={{
                        ...tdColor, fontWeight: 700, color: '#475569',
                      }}>
                        Usado / Total
                      </td>
                      <td style={{ ...tdInput, color: '#cbd5e1' }}>—</td>
                      {tallas.map(t => {
                        const usado = totalesPorTalla[t.talla_id] || 0;
                        const tope = Number(t.cantidad_total || 0);
                        const exc = usado > tope;
                        const compl = completoPorTalla(t);
                        return (
                          <td key={t.talla_id} style={{
                            ...tdInput,
                            padding: '6px 4px',
                            color: exc ? '#b91c1c' : compl ? 'var(--m-brand)' : '#475569',
                            fontWeight: 700,
                            fontFamily: 'ui-monospace, monospace',
                            fontSize: 12,
                          }}>
                            {usado}/{tope}
                            <div style={{
                              fontSize: 9, fontWeight: 600, opacity: 0.8,
                              textTransform: 'lowercase',
                            }}>
                              {compl ? 'completo' : exc ? 'excede' : ''}
                            </div>
                          </td>
                        );
                      })}
                      {!bloqueado && <td style={tdInput} />}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Botones de acción */}
        {!bloqueado && (
          <>
            <button
              onClick={() => setPicker(true)}
              style={btnGhost}
            >
              <Plus size={16} /> Agregar color
            </button>

            <button
              onClick={prorratear}
              disabled={filas.length === 0}
              style={{
                ...btnGhost,
                background: 'var(--m-brand-soft)',
                borderColor: '#5eead4',
                color: 'var(--m-brand)',
              }}
            >
              <Calculator size={16} /> Prorratear según proporciones
            </button>

            <button
              onClick={() => setAplicarOpen(true)}
              disabled={filas.length === 0}
              style={btnGhost}
            >
              <Copy size={16} /> Aplicar a otros cortes
            </button>

            <div style={{
              fontSize: 11, color: '#64748b', lineHeight: 1.5, fontStyle: 'italic',
              marginTop: 2,
            }}>
              Tip: cambia <strong>Prop.</strong> (peso 1 = igual, 0.5 = mitad, 2 = doble) y
              toca <strong>Prorratear</strong> para recalcular automáticamente.
            </div>
          </>
        )}

        {/* Mensajes */}
        {mensaje && (
          <div style={{
            background: '#dcfce7', border: '1px solid #86efac', color: '#15803d',
            borderRadius: 12, padding: 10, fontSize: 12,
            display: 'flex', gap: 8, alignItems: 'center',
          }}>
            <Check size={14} /> {mensaje}
          </div>
        )}
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
        padding: '8px 16px 12px', zIndex: 50,
      }}>
        {/* Status */}
        <div style={{
          fontSize: 12, fontWeight: 700, marginBottom: 8, textAlign: 'left',
          color: listoParaGuardar ? 'var(--m-brand)' : '#94a3b8',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {listoParaGuardar
            ? <><Check size={14} /> Listo para guardar</>
            : algunaExcede
              ? <><AlertTriangle size={14} style={{ color: '#b91c1c' }} /> <span style={{ color: '#b91c1c' }}>Algunas tallas exceden el tope</span></>
              : <>Aún no completas la distribución</>
          }
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          {!aprobados && !bloqueado && (
            <button
              onClick={aprobar}
              className="m-btn m-btn-outline"
              disabled={!listoParaGuardar || aprobando || guardando}
              style={{
                flex: 1, minHeight: 48,
                borderColor: 'var(--m-brand)', color: 'var(--m-brand)',
              }}
            >
              {aprobando
                ? <><Loader2 className="m-spin" size={16} /> Aprobando...</>
                : <><Check size={16} /> Aprobar</>}
            </button>
          )}
          {!bloqueado && (
            <button
              className="m-btn m-btn-primary"
              disabled={guardando || aprobando || !listoParaGuardar}
              onClick={guardar}
              style={{ flex: 2, minHeight: 48 }}
            >
              {guardando
                ? <><Loader2 className="m-spin" size={18} /> Guardando...</>
                : <><Save size={18} /> Guardar</>}
            </button>
          )}
          {bloqueado && (
            <button
              onClick={() => navigate(-1)}
              className="m-btn m-btn-outline"
              style={{ flex: 1, minHeight: 48, borderColor: '#cbd5e1', color: '#64748b' }}
            >
              <Lock size={16} /> Solo lectura · Volver
            </button>
          )}
        </div>
        {!aprobados && !bloqueado && (
          <div style={{
            fontSize: 10, color: '#94a3b8', textAlign: 'center', marginTop: 6,
          }}>
            <strong>Aprobar</strong> bloquea la matriz · solo admin podrá editarla después.
          </div>
        )}
      </div>

      {/* Picker de colores — modo AGREGAR fila nueva */}
      {picker && (
        <ColorPickerSheet
          paleta={paleta}
          yaUsados={filas.map(f => f.color_id).filter(Boolean)}
          onPick={agregarColor}
          onClose={() => setPicker(false)}
        />
      )}

      {/* Picker de colores — modo SWAP (cambiar color de fila existente).
          Reusa el mismo sheet; el título cambia para no confundir al usuario. */}
      {swapIdx !== null && (
        <ColorPickerSheet
          paleta={paleta}
          // Excluye los ya usados pero permite mantener el actual visible no es
          // necesario (no aporta nada elegirse a sí mismo); lo filtramos también.
          yaUsados={filas.map(f => f.color_id).filter(Boolean)}
          onPick={swapColorFila}
          onClose={() => setSwapIdx(null)}
          titulo={`Cambiar color de "${formatColorName(filas[swapIdx]?.color_nombre || '')}"`}
          ctaLabel="Cambiar"
        />
      )}

      {/* Aplicar a otros cortes */}
      {aplicarOpen && (
        <AplicarOtrosCortesSheet
          registroIdActual={registroId}
          colores={filas.filter(f => Number(f.peso) > 0).map(f => ({
            color_id: f.color_id,
            color_nombre: f.color_nombre,
            peso: Number(f.peso) || 1,
          }))}
          onClose={() => setAplicarOpen(false)}
          onDone={(msg) => {
            setAplicarOpen(false);
            setMensaje(msg);
            setTimeout(() => setMensaje(''), 4000);
          }}
        />
      )}
    </div>
  );
};

/* ──────── Picker de colores ──────── */
// Props opcionales `titulo` y `ctaLabel` para reusar el mismo sheet en
// "Agregar color" y "Cambiar color de fila X" sin duplicar el componente.
const ColorPickerSheet = ({ paleta, yaUsados, onPick, onClose, titulo = 'Agregar color', ctaLabel }) => {
  const [q, setQ] = useState('');
  const disponibles = useMemo(() => {
    const s = q.trim().toLowerCase();
    return paleta.filter(c => {
      if (yaUsados.includes(c.id)) return false;
      if (!s) return true;
      return String(c.nombre || '').toLowerCase().includes(s) ||
        String(c.color_general_nombre || '').toLowerCase().includes(s);
    });
  }, [paleta, q, yaUsados]);

  return (
    <SheetShell onClose={onClose}>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 10 }}>
        {titulo}
      </div>
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <Search size={14} style={{
          position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
          color: '#94a3b8',
        }} />
        <input
          className="m-input" autoFocus
          placeholder="Buscar color..."
          value={q} onChange={(e) => setQ(e.target.value)}
          style={{ paddingLeft: 32, fontSize: 14 }}
        />
      </div>
      <div style={{
        flex: 1, overflowY: 'auto', background: '#f8fafc',
        borderRadius: 8, maxHeight: '50vh',
      }}>
        {disponibles.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
            {paleta.length === 0
              ? 'No hay colores configurados para este producto.'
              : 'Todos los colores ya están agregados o sin coincidencias.'}
          </div>
        ) : (
          disponibles.map(c => (
            <button
              key={c.id}
              onClick={() => onPick(c)}
              style={{
                width: '100%', padding: '12px 14px',
                background: 'transparent', border: 0,
                borderBottom: '1px solid #f1f5f9',
                textAlign: 'left', cursor: 'pointer',
                fontSize: 14, fontWeight: 600, color: '#0f172a',
                display: 'flex', alignItems: 'center', gap: 10,
              }}
            >
              {c.codigo_hex && (
                <span style={{
                  width: 18, height: 18, borderRadius: 5,
                  background: c.codigo_hex, border: '1px solid #e5e7eb', flexShrink: 0,
                }} />
              )}
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {formatColorName(c.nombre)}
              </span>
              {ctaLabel === 'Cambiar'
                ? <ArrowLeftRight size={16} style={{ color: 'var(--m-brand)' }} />
                : <Plus size={16} style={{ color: 'var(--m-brand)' }} />}
            </button>
          ))
        )}
      </div>
      <button onClick={onClose} className="m-btn m-btn-outline" style={{ marginTop: 10, minHeight: 44 }}>
        Cerrar
      </button>
    </SheetShell>
  );
};

/* ──────── Aplicar a otros cortes ──────── */
const AplicarOtrosCortesSheet = ({ registroIdActual, colores, onClose, onDone }) => {
  const [cortes, setCortes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [q, setQ] = useState('');
  const [seleccion, setSeleccion] = useState(new Set());
  const [enviando, setEnviando] = useState(false);
  const [errLocal, setErrLocal] = useState('');

  useEffect(() => {
    (async () => {
      try {
        // Cortes activos (excluye cerrados, anulados, tienda); hasta 50
        const res = await axios.get(`${API}/registros?limit=50&excluir_estados=CERRADA,ANULADA,Tienda`);
        const items = res.data?.items || res.data || [];
        setCortes(items.filter(r => r.id !== registroIdActual));
      } catch {
        setCortes([]);
      } finally {
        setCargando(false);
      }
    })();
  }, [registroIdActual]);

  const filtrados = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return cortes;
    return cortes.filter(r =>
      String(r.n_corte || '').toLowerCase().includes(s) ||
      String(r.modelo_nombre || r.modelo_manual?.nombre_modelo || '').toLowerCase().includes(s)
    );
  }, [cortes, q]);

  const toggle = (id) => {
    setSeleccion(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const aplicar = async () => {
    setErrLocal('');
    if (seleccion.size === 0) return setErrLocal('Selecciona al menos un corte destino.');
    if (colores.length === 0) return setErrLocal('No hay colores con peso > 0 para aplicar.');
    if (!window.confirm(`¿Aplicar este patrón de colores a ${seleccion.size} corte${seleccion.size !== 1 ? 's' : ''}? Reemplazará su distribución actual.`)) return;
    setEnviando(true);
    try {
      const res = await axios.post(
        `${API}/reportes-produccion/registro-colores/aplicar-bulk`,
        { registro_ids: Array.from(seleccion), colores },
      );
      onDone(`Aplicado a ${res.data?.actualizados || 0} de ${seleccion.size} cortes.`);
    } catch (e) {
      const det = e?.response?.data?.detail || 'Error aplicando a otros cortes';
      setErrLocal(typeof det === 'string' ? det : String(det));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <SheetShell onClose={onClose}>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
        Aplicar a otros cortes
      </div>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12, lineHeight: 1.5 }}>
        Usa los pesos actuales para repartir las cantidades en los cortes destino.
        <strong> Reemplaza</strong> la distribución que tengan ahora.
      </div>

      <div style={{ position: 'relative', marginBottom: 10 }}>
        <Search size={14} style={{
          position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
          color: '#94a3b8',
        }} />
        <input
          className="m-input"
          placeholder="Buscar corte o modelo..."
          value={q} onChange={(e) => setQ(e.target.value)}
          style={{ paddingLeft: 32, fontSize: 14 }}
        />
      </div>

      <div style={{
        flex: 1, overflowY: 'auto', background: '#f8fafc',
        borderRadius: 8, maxHeight: '40vh', marginBottom: 10,
      }}>
        {cargando ? (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <Loader2 className="m-spin" size={20} style={{ color: '#94a3b8' }} />
          </div>
        ) : filtrados.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
            No hay cortes activos para aplicar.
          </div>
        ) : (
          filtrados.map(r => {
            const sel = seleccion.has(r.id);
            return (
              <button
                key={r.id}
                onClick={() => toggle(r.id)}
                style={{
                  width: '100%', padding: '10px 14px',
                  background: sel ? 'var(--m-brand-soft)' : 'transparent',
                  border: 0, borderBottom: '1px solid #f1f5f9',
                  textAlign: 'left', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}
              >
                <span style={{
                  width: 20, height: 20, borderRadius: 4,
                  border: `2px solid ${sel ? 'var(--m-brand)' : '#cbd5e1'}`,
                  background: sel ? 'var(--m-brand)' : 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {sel && <Check size={12} color="white" />}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: 'ui-monospace, monospace', fontWeight: 700, fontSize: 13,
                  }}>
                    {r.n_corte}
                  </div>
                  <div style={{
                    fontSize: 11, color: '#64748b',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {r.modelo_nombre || r.modelo_manual?.nombre_modelo || '—'}
                    {r.estado ? ` · ${r.estado}` : ''}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {errLocal && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c',
          borderRadius: 12, padding: 10, fontSize: 12, marginBottom: 10,
        }}>{errLocal}</div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="m-btn m-btn-outline" style={{ flex: 1 }} onClick={onClose}>
          Cancelar
        </button>
        <button
          className="m-btn m-btn-primary"
          style={{ flex: 1.6 }}
          disabled={enviando || seleccion.size === 0}
          onClick={aplicar}
        >
          {enviando
            ? <><Loader2 className="m-spin" size={16} /> Aplicando...</>
            : <><Copy size={16} /> Aplicar a {seleccion.size}</>}
        </button>
      </div>
    </SheetShell>
  );
};

/* ──────── Shell de bottom sheet ──────── */
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
        padding: '12px 16px 20px', maxHeight: '85vh',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{ width: 40, height: 4, background: '#cbd5e1', borderRadius: 2, margin: '0 auto 12px' }} />
      {children}
    </div>
  </div>
);

/* ──────── Estilos ──────── */
const thColor = {
  position: 'sticky', left: 0, zIndex: 1,
  background: '#f8fafc', padding: '10px 12px', textAlign: 'left',
  fontWeight: 700, color: '#475569', fontSize: 11,
  textTransform: 'uppercase', letterSpacing: '.04em',
  borderRight: '1px solid #e2e8f0',
  minWidth: 130,
};
const thProp = {
  padding: '8px 6px', textAlign: 'center',
  fontWeight: 700, color: '#475569', fontSize: 11,
  textTransform: 'uppercase', letterSpacing: '.04em',
  minWidth: 56,
};
const thTalla = {
  padding: '8px 6px', textAlign: 'center',
  color: '#475569', fontSize: 11,
  textTransform: 'uppercase', letterSpacing: '.04em',
  minWidth: 56,
};
const tdColor = {
  position: 'sticky', left: 0, zIndex: 1,
  background: 'white', padding: '8px 12px',
  borderRight: '1px solid #f1f5f9',
};
const tdInput = {
  padding: '6px 4px', textAlign: 'center',
};
const inputCelda = {
  width: 46, height: 36, borderRadius: 8,
  border: '1px solid #e5e7eb', textAlign: 'center',
  fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
  outline: 'none', background: 'white',
};
const btnArrow = {
  width: 18, height: 16, background: 'transparent',
  border: 0, color: '#cbd5e1', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const btnGhost = {
  width: '100%', padding: '12px',
  background: 'white', border: '1px solid #e5e7eb',
  borderRadius: 999, color: '#475569',
  fontSize: 13, fontWeight: 700,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  cursor: 'pointer',
};

export default MobileEditarMatrizColores;
