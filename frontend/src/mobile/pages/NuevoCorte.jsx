import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Loader2, Save, Search, ChevronDown, AlertTriangle,
  Info, Check, X, Plus, AlertOctagon, Package, Lock,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { puede, ACCIONES } from '../utils/permisos';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Crear corte desde móvil — solo supervisor/admin.
 *
 * Form único (Opción 1 del mockup v3):
 *  - Línea de negocio (selector)
 *  - Modelo: del catálogo (search) o manual (cascada marca → tipo → entalle → tela → hilo)
 *  - N° de corte (opcional; se asignará al pasar a costura)
 *  - Curva (texto)
 *  - Fecha de entrega
 *  - Urgente
 *  - Observaciones
 *
 * Las tallas con cantidades NO se piden aquí — se cargan después de cortar.
 * POST /api/registros
 */
export const MobileNuevoCorte = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const puedeCrear = puede(user, ACCIONES.CREAR_CORTE);

  // Catálogos
  const [lineas, setLineas] = useState([]);
  const [modelos, setModelos] = useState([]);
  const [marcas, setMarcas] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [entalles, setEntalles] = useState([]);
  const [telas, setTelas] = useState([]);
  const [hilos, setHilos] = useState([]);
  const [hilosEspecificos, setHilosEspecificos] = useState([]);
  // Flags para saber si el catálogo viene de fallback (sin filtro de cascada)
  const [tiposFallback, setTiposFallback] = useState(false);
  const [entallesFallback, setEntallesFallback] = useState(false);
  const [telasFallback, setTelasFallback] = useState(false);
  const [hilosFallback, setHilosFallback] = useState(false);
  const [loading, setLoading] = useState(true);

  // Estado del formulario
  const [modo, setModo] = useState('catalogo'); // 'catalogo' | 'manual'
  const [lineaNegocioId, setLineaNegocioId] = useState(null);
  const [modeloId, setModeloId] = useState(null);
  const [modeloSel, setModeloSel] = useState(null);
  const [busquedaModelo, setBusquedaModelo] = useState('');
  const [busquedaModeloDeb, setBusquedaModeloDeb] = useState('');
  const [buscadorFocus, setBuscadorFocus] = useState(false);

  // Modo manual
  const [nombreModeloManual, setNombreModeloManual] = useState('');
  const [marca, setMarca] = useState(null);       // { id, nombre, esLibre? }
  const [tipo, setTipo] = useState(null);
  const [entalle, setEntalle] = useState(null);
  const [tela, setTela] = useState(null);
  const [hilo, setHilo] = useState(null);
  const [hiloEspecifico, setHiloEspecifico] = useState(null); // aplica en catálogo y manual

  // Otros campos
  const [nCorte, setNCorte] = useState('');
  const [curva, setCurva] = useState('');
  const [fechaEntrega, setFechaEntrega] = useState('');
  const [urgente, setUrgente] = useState(false);
  const [observaciones, setObservaciones] = useState('');

  // Picker bottom sheet
  const [picker, setPicker] = useState(null); // 'linea' | 'marca' | 'tipo' | ...
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  // Cargar líneas + marcas al montar (catálogos raíz, sin dependencias)
  useEffect(() => {
    (async () => {
      try {
        const [lin, mar, hesp] = await Promise.all([
          axios.get(`${API}/lineas-negocio`).catch((e) => { console.error('lineas-negocio:', e); return { data: [] }; }),
          axios.get(`${API}/marcas`).catch((e) => { console.error('marcas:', e); return { data: [] }; }),
          axios.get(`${API}/hilos-especificos`).catch((e) => { console.error('hilos-especificos:', e); return { data: [] }; }),
        ]);
        setLineas(Array.isArray(lin.data) ? lin.data : (lin.data?.items || []));
        setMarcas(Array.isArray(mar.data) ? mar.data : (mar.data?.items || []));
        // hilos-especificos: aceptar array directo o {items: [...]}
        const hespList = Array.isArray(hesp.data) ? hesp.data : (hesp.data?.items || []);
        setHilosEspecificos(hespList);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Helper: fetch con filtro de cascada; si viene vacío, cae al catálogo completo
  // (porque puede pasar que el catálogo no tenga aún configurada la relación).
  const fetchConFallback = async (urlFiltrada, urlCompleta) => {
    try {
      const r1 = await axios.get(urlFiltrada);
      const lista = Array.isArray(r1.data) ? r1.data : [];
      if (lista.length > 0) return { lista, fallback: false };
    } catch { /* ignore */ }
    try {
      const r2 = await axios.get(urlCompleta);
      const lista = Array.isArray(r2.data) ? r2.data : [];
      return { lista, fallback: true };
    } catch {
      return { lista: [], fallback: false };
    }
  };

  // Cascada: tipos filtrados por marca
  useEffect(() => {
    if (!marca || marca.esLibre) { setTipos([]); setTiposFallback(false); return; }
    (async () => {
      const { lista, fallback } = await fetchConFallback(
        `${API}/tipos?marca_id=${marca.id}`,
        `${API}/tipos`,
      );
      setTipos(lista);
      setTiposFallback(fallback);
    })();
  }, [marca]);

  // Cascada: entalles filtrados por tipo
  useEffect(() => {
    if (!tipo || tipo.esLibre) { setEntalles([]); setEntallesFallback(false); return; }
    (async () => {
      const { lista, fallback } = await fetchConFallback(
        `${API}/entalles?tipo_id=${tipo.id}`,
        `${API}/entalles`,
      );
      setEntalles(lista);
      setEntallesFallback(fallback);
    })();
  }, [tipo]);

  // Cascada: telas filtradas por entalle
  useEffect(() => {
    if (!entalle || entalle.esLibre) { setTelas([]); setTelasFallback(false); return; }
    (async () => {
      const { lista, fallback } = await fetchConFallback(
        `${API}/telas?entalle_id=${entalle.id}`,
        `${API}/telas`,
      );
      setTelas(lista);
      setTelasFallback(fallback);
    })();
  }, [entalle]);

  // Cascada: hilos filtrados por tela
  useEffect(() => {
    if (!tela || tela.esLibre) { setHilos([]); setHilosFallback(false); return; }
    (async () => {
      const { lista, fallback } = await fetchConFallback(
        `${API}/hilos?tela_id=${tela.id}`,
        `${API}/hilos`,
      );
      setHilos(lista);
      setHilosFallback(fallback);
    })();
  }, [tela]);

  // Debounce búsqueda de modelos
  useEffect(() => {
    const t = setTimeout(() => setBusquedaModeloDeb(busquedaModelo), 300);
    return () => clearTimeout(t);
  }, [busquedaModelo]);

  // Buscar modelos cuando cambia búsqueda o línea
  useEffect(() => {
    if (modo !== 'catalogo') return;
    (async () => {
      try {
        const params = new URLSearchParams({ limit: '30' });
        if (busquedaModeloDeb) params.set('search', busquedaModeloDeb);
        const res = await axios.get(`${API}/modelos?${params}`);
        const items = res.data?.items || res.data || [];
        // Filtrar client-side por línea de negocio si aplica
        const filtrados = lineaNegocioId
          ? items.filter(m => !m.linea_negocio_id || Number(m.linea_negocio_id) === Number(lineaNegocioId))
          : items;
        setModelos(filtrados);
      } catch {
        setModelos([]);
      }
    })();
  }, [modo, busquedaModeloDeb, lineaNegocioId]);

  // Resolver línea de negocio seleccionada
  const lineaNombre = useMemo(() => {
    const l = lineas.find(x => Number(x.id) === Number(lineaNegocioId));
    return l ? l.nombre : null;
  }, [lineas, lineaNegocioId]);

  const formularioValido = useMemo(() => {
    if (!lineaNegocioId) return false;
    if (modo === 'catalogo') return !!modeloId;
    return !!nombreModeloManual.trim();
  }, [lineaNegocioId, modo, modeloId, nombreModeloManual]);

  if (!puedeCrear) {
    return (
      <>
        <div className="m-header">
          <button className="m-h-icon" onClick={() => navigate(-1)} aria-label="Volver">
            <ArrowLeft size={18} />
          </button>
          <div style={{ flex: 1, fontWeight: 600 }}>Crear corte</div>
        </div>
        <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
          <Lock size={36} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
          <p style={{ fontSize: 14 }}>
            Solo supervisores / administradores pueden crear cortes.<br/>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>
              Pide a tu jefe de planta que lo haga.
            </span>
          </p>
        </div>
      </>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>
        <Loader2 className="m-spin" size={32} style={{ margin: '0 auto' }} />
      </div>
    );
  }

  const seleccionarModelo = (m) => {
    setModeloId(m.id);
    setModeloSel(m);
  };

  const limpiarModelo = () => {
    setModeloId(null);
    setModeloSel(null);
  };

  const enviar = async () => {
    setError('');
    if (!lineaNegocioId) return setError('Elige una línea de negocio.');
    if (modo === 'catalogo' && !modeloId) return setError('Elige un modelo del catálogo o cambia a Manual.');
    if (modo === 'manual' && !nombreModeloManual.trim()) return setError('Escribe el nombre del modelo manual.');

    // n_corte: si está vacío, generar un placeholder único
    const nCorteFinal = nCorte.trim() || `PEND-${Date.now().toString(36).toUpperCase()}`;

    const body = {
      n_corte: nCorteFinal,
      curva: curva.trim(),
      estado: 'Para Corte',
      urgente,
      empresa_id: 7,
      linea_negocio_id: Number(lineaNegocioId),
      observaciones: observaciones.trim() || null,
      fecha_entrega_final: fechaEntrega || null,
      hilo_especifico_id: hiloEspecifico?.id || null,
      tallas: [],
      distribucion_colores: [],
    };

    if (modo === 'catalogo') {
      body.modelo_id = modeloId;
    } else {
      // Manual
      body.modelo_manual = {
        nombre_modelo: nombreModeloManual.trim(),
        marca_id: marca && !marca.esLibre ? marca.id : null,
        marca_texto: marca?.esLibre ? marca.nombre : null,
        tipo_id: tipo && !tipo.esLibre ? tipo.id : null,
        tipo_texto: tipo?.esLibre ? tipo.nombre : null,
        entalle_id: entalle && !entalle.esLibre ? entalle.id : null,
        entalle_texto: entalle?.esLibre ? entalle.nombre : null,
        tela_id: tela && !tela.esLibre ? tela.id : null,
        tela_texto: tela?.esLibre ? tela.nombre : null,
        hilo_id: hilo && !hilo.esLibre ? hilo.id : null,
        hilo_texto: hilo?.esLibre ? hilo.nombre : null,
      };
    }

    setEnviando(true);
    try {
      const res = await axios.post(`${API}/registros`, body);
      const nuevoId = res.data?.id;
      if (nuevoId) {
        navigate(`/m/registros/${nuevoId}`, { replace: true });
      } else {
        navigate('/m/registros', { replace: true });
      }
    } catch (e) {
      const det = e?.response?.data?.detail || 'Error al crear el corte';
      setError(typeof det === 'string' ? det : JSON.stringify(det));
    } finally {
      setEnviando(false);
    }
  };

  // ──────── render ────────

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100vh', overflow: 'hidden',
    }}>
      <div className="m-header" style={{ flexShrink: 0 }}>
        <button className="m-h-icon" onClick={() => navigate(-1)} aria-label="Volver">
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, opacity: 0.85 }}>Nuevo corte</div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>Crear corte</div>
        </div>
      </div>

      <div style={{
        flex: 1, overflowY: 'auto',
        padding: 14, display: 'flex', flexDirection: 'column', gap: 16,
      }}>

        {/* Línea de negocio */}
        <div>
          <Label>Línea de negocio</Label>
          <CascadeBtn
            value={lineaNombre}
            placeholder="Elige línea..."
            onClick={() => setPicker('linea')}
          />
        </div>

        {/* Modelo: catálogo vs manual */}
        <div>
          <Label>Modelo</Label>
          <Segmented
            value={modo}
            options={[
              { value: 'catalogo', label: 'Del catálogo' },
              { value: 'manual', label: 'Manual' },
            ]}
            onChange={(v) => {
              setModo(v);
              limpiarModelo();
            }}
            style={{ marginBottom: 10 }}
          />

          {modo === 'catalogo' ? (
            <>
              {modeloSel ? (
                <div style={{
                  padding: 12, background: 'var(--m-brand-soft)',
                  borderRadius: 10, display: 'flex', gap: 10,
                  alignItems: 'flex-start',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: 700, color: 'var(--m-brand)', fontSize: 13,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {modeloSel.nombre}
                    </div>
                    <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>
                      {[modeloSel.marca_nombre, modeloSel.tela_nombre, modeloSel.entalle_nombre]
                        .filter(Boolean).join(' · ') || 'Sin detalle'}
                    </div>
                  </div>
                  <button
                    onClick={limpiarModelo}
                    style={{
                      background: 'white', border: 0, borderRadius: '50%',
                      width: 26, height: 26, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#64748b',
                    }}
                    aria-label="Cambiar"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ position: 'relative' }}>
                    <Search size={14} style={{
                      position: 'absolute', left: 12, top: '50%',
                      transform: 'translateY(-50%)', color: '#94a3b8',
                    }} />
                    <input
                      className="m-input"
                      placeholder="Buscar modelo..."
                      value={busquedaModelo}
                      onChange={(e) => setBusquedaModelo(e.target.value)}
                      onFocus={() => setBuscadorFocus(true)}
                      onBlur={() => {
                        // Pequeño delay para que el click en la lista alcance a registrarse
                        setTimeout(() => setBuscadorFocus(false), 150);
                      }}
                      style={{ paddingLeft: 34, fontSize: 14 }}
                    />
                  </div>
                  {(buscadorFocus || busquedaModelo) && modelos.length > 0 && (
                    <div style={{
                      marginTop: 8, background: 'white',
                      border: '1px solid #e5e7eb', borderRadius: 10,
                      maxHeight: 200, overflowY: 'auto',
                    }}>
                      {modelos.map(m => (
                        <button
                          key={m.id}
                          onClick={() => seleccionarModelo(m)}
                          style={{
                            width: '100%', padding: '10px 12px',
                            background: 'transparent', border: 0,
                            borderBottom: '1px solid #f1f5f9',
                            textAlign: 'left', cursor: 'pointer',
                          }}
                        >
                          <div style={{
                            fontSize: 13, fontWeight: 600, color: '#0f172a',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {m.nombre}
                          </div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>
                            {[m.marca_nombre, m.tela_nombre].filter(Boolean).join(' · ')}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {(buscadorFocus || busquedaModelo) && modelos.length === 0 && busquedaModeloDeb && (
                    <div style={{
                      marginTop: 8, padding: 12, fontSize: 12,
                      color: '#94a3b8', textAlign: 'center',
                      background: 'white', borderRadius: 10,
                      border: '1px solid #e5e7eb',
                    }}>
                      Sin resultados. ¿Probar modo <strong>Manual</strong>?
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            // MODO MANUAL — Cascada
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Aviso */}
              <div style={{
                background: '#fffbeb', border: '1px solid #fcd34d',
                borderRadius: 10, padding: 10, fontSize: 11, color: '#92400e',
                display: 'flex', gap: 8, alignItems: 'flex-start', lineHeight: 1.5,
              }}>
                <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>
                  Modelo <strong>manual</strong>. Los campos en cascada filtran del
                  catálogo. Si no encuentras lo que buscas, usa "Escribir nuevo".
                </span>
              </div>

              {/* Nombre */}
              <div>
                <Label>Nombre del modelo</Label>
                <input
                  className="m-input"
                  placeholder="Ej: Pantalón Slim Indigo"
                  value={nombreModeloManual}
                  onChange={(e) => setNombreModeloManual(e.target.value)}
                  style={{ fontSize: 14 }}
                />
              </div>

              <div>
                <Label>Marca</Label>
                <CascadeBtn
                  value={marca?.nombre}
                  placeholder="Elegir marca..."
                  onClick={() => setPicker('marca')}
                />
              </div>

              <div>
                <Label sub={marca ? `filtrado por ${marca.nombre}` : null}>Tipo</Label>
                <CascadeBtn
                  value={tipo?.nombre}
                  placeholder="Elegir tipo..."
                  onClick={() => setPicker('tipo')}
                  disabled={!marca}
                />
              </div>

              <div>
                <Label sub={tipo ? `filtrado por ${tipo.nombre}` : null}>Entalle</Label>
                <CascadeBtn
                  value={entalle?.nombre}
                  placeholder="Elegir entalle..."
                  onClick={() => setPicker('entalle')}
                  disabled={!tipo}
                />
              </div>

              <div>
                <Label sub={entalle ? `filtrada por ${entalle.nombre}` : 'requiere entalle'}>Tela</Label>
                <CascadeBtn
                  value={tela?.nombre}
                  placeholder={entalle ? 'Elegir tela...' : '— sin entalle aún —'}
                  onClick={() => setPicker('tela')}
                  disabled={!entalle}
                />
              </div>

              <div>
                <Label sub={tela ? null : 'requiere tela'}>Hilo</Label>
                <CascadeBtn
                  value={hilo?.nombre}
                  placeholder={tela ? 'Elegir hilo (opcional)...' : '— sin tela aún —'}
                  onClick={() => setPicker('hilo')}
                  disabled={!tela}
                />
              </div>
            </div>
          )}
        </div>

        {/* Hilo específico (aplica a catálogo y manual, opcional) */}
        <div>
          <Label sub="opcional">Hilo específico</Label>
          <CascadeBtn
            value={hiloEspecifico?.nombre}
            placeholder="Elegir hilo específico..."
            onClick={() => setPicker('hiloEspecifico')}
          />
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
            Tono o código exacto del hilo (ej. "24/2 Color Beige Element").
          </div>
        </div>

        {/* N° de corte */}
        <div>
          <Label sub="opcional">N° de corte</Label>
          <input
            className="m-input"
            placeholder="Se asignará al pasar a costura"
            value={nCorte}
            onChange={(e) => setNCorte(e.target.value)}
            style={{ fontSize: 14 }}
          />
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
            Lo asignas cuando el corte físico esté listo.
          </div>
        </div>

        {/* Curva */}
        <div>
          <Label>Curva</Label>
          <input
            className="m-input"
            placeholder="Ej: 2-4-3-2-1"
            value={curva}
            onChange={(e) => setCurva(e.target.value)}
            style={{ fontSize: 14 }}
          />
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
            Patrón teórico (talla 1 - talla 2 - ...).
          </div>
        </div>

        {/* Aviso tallas */}
        <div style={{
          background: '#dbeafe', border: '1px solid #93c5fd',
          borderRadius: 10, padding: 10, fontSize: 11, color: '#1d4ed8',
          display: 'flex', gap: 8, alignItems: 'flex-start', lineHeight: 1.5,
        }}>
          <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            <strong>Las cantidades por talla se cargan después de cortar.</strong>
            Al crear, solo defines la curva teórica.
          </span>
        </div>

        {/* Fecha entrega */}
        <div>
          <Label>Fecha de entrega</Label>
          <input
            type="date"
            className="m-input"
            value={fechaEntrega}
            onChange={(e) => setFechaEntrega(e.target.value)}
            style={{ fontSize: 14 }}
          />
        </div>

        {/* Urgente */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: 12, background: 'white', border: '1px solid #e5e7eb', borderRadius: 12,
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Urgente</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>Prioridad alta en cola</div>
          </div>
          <Switch on={urgente} onClick={() => setUrgente(!urgente)} />
        </div>

        {/* Observaciones */}
        <div>
          <Label>Observaciones</Label>
          <textarea
            className="m-input"
            rows={2}
            placeholder="Notas internas (opcional)..."
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            style={{ padding: 10, fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }}
          />
        </div>

        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c',
            borderRadius: 10, padding: 10, fontSize: 12,
            display: 'flex', gap: 8, alignItems: 'flex-start',
          }}>
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Footer fijo */}
      <div style={{
        flexShrink: 0, background: 'white',
        borderTop: '1px solid #e5e7eb', padding: '10px 12px',
        display: 'flex', gap: 8,
      }}>
        <button
          onClick={() => navigate(-1)}
          className="m-btn m-btn-outline"
          style={{ flex: 1, minHeight: 46, borderColor: '#cbd5e1', color: '#475569' }}
        >
          Cancelar
        </button>
        <button
          className="m-btn m-btn-primary"
          disabled={enviando || !formularioValido}
          onClick={enviar}
          style={{ flex: 2, minHeight: 46 }}
        >
          {enviando
            ? <><Loader2 className="m-spin" size={16} /> Creando...</>
            : <><Save size={16} /> Crear corte</>}
        </button>
      </div>

      {/* Pickers */}
      {picker === 'linea' && (
        <PickerSheet
          titulo="Línea de negocio"
          items={lineas.map(l => ({ id: l.id, nombre: l.nombre }))}
          permitirNuevo={false}
          onPick={(it) => { setLineaNegocioId(it.id); setPicker(null); limpiarModelo(); }}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === 'marca' && (
        <PickerSheet
          titulo="Marca"
          items={marcas.map(m => ({ id: m.id, nombre: m.nombre }))}
          permitirNuevo
          tipoNombre="marca"
          onPick={(it) => {
            setMarca(it);
            // Reset cascada hacia abajo
            setTipo(null); setEntalle(null); setTela(null); setHilo(null);
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === 'tipo' && (
        <PickerSheet
          titulo={`Tipo${marca ? ` · ${marca.nombre}` : ''}`}
          items={tipos.map(t => ({ id: t.id, nombre: t.nombre }))}
          permitirNuevo
          tipoNombre="tipo"
          fallbackAviso={tiposFallback ? `No hay tipos configurados para "${marca?.nombre}". Mostrando todos.` : null}
          onPick={(it) => {
            setTipo(it);
            setEntalle(null); setTela(null); setHilo(null);
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === 'entalle' && (
        <PickerSheet
          titulo={`Entalle${tipo ? ` · ${tipo.nombre}` : ''}`}
          items={entalles.map(e => ({ id: e.id, nombre: e.nombre }))}
          permitirNuevo
          tipoNombre="entalle"
          fallbackAviso={entallesFallback ? `No hay entalles configurados para "${tipo?.nombre}". Mostrando todos.` : null}
          onPick={(it) => {
            setEntalle(it);
            setTela(null); setHilo(null);
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === 'tela' && (
        <PickerSheet
          titulo={`Tela${entalle ? ` · ${entalle.nombre}` : ''}`}
          items={telas.map(t => ({ id: t.id, nombre: t.nombre }))}
          permitirNuevo
          tipoNombre="tela"
          fallbackAviso={telasFallback ? `No hay telas configuradas para "${entalle?.nombre}". Mostrando todas.` : null}
          onPick={(it) => {
            setTela(it);
            setHilo(null);
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === 'hilo' && (
        <PickerSheet
          titulo={`Hilo${tela ? ` · ${tela.nombre}` : ''}`}
          items={hilos.map(h => ({ id: h.id, nombre: h.nombre }))}
          permitirNuevo
          tipoNombre="hilo"
          fallbackAviso={hilosFallback ? `No hay hilos configurados para "${tela?.nombre}". Mostrando todos.` : null}
          onPick={(it) => { setHilo(it); setPicker(null); }}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === 'hiloEspecifico' && (
        <PickerSheet
          titulo="Hilo específico"
          items={hilosEspecificos.map(h => {
            const partes = [h.codigo, h.nombre, h.color].filter(Boolean);
            const label = partes.length > 0
              ? partes.join(' · ')
              : (h.nombre || h.codigo || h.color || `Hilo ${String(h.id).slice(0, 6)}`);
            return { id: h.id, nombre: label };
          })}
          permitirNuevo={false}
          fallbackAviso={hilosEspecificos.length === 0
            ? 'El catálogo de hilos específicos está vacío. Créalos desde web (Catálogos → Hilos Específicos).'
            : null}
          onPick={(it) => { setHiloEspecifico(it); setPicker(null); }}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
};

/* ──────── Sub-componentes ──────── */

const Label = ({ children, sub }) => (
  <div style={{
    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
    marginBottom: 6,
  }}>
    <span style={{
      fontSize: 11, fontWeight: 700, color: '#64748b',
      textTransform: 'uppercase', letterSpacing: '.04em',
    }}>
      {children}
    </span>
    {sub && (
      <span style={{ fontSize: 10, color: '#94a3b8' }}>{sub}</span>
    )}
  </div>
);

const CascadeBtn = ({ value, placeholder, onClick, disabled = false }) => (
  <button
    onClick={disabled ? undefined : onClick}
    disabled={disabled}
    style={{
      width: '100%', padding: '10px 12px',
      background: disabled ? '#f8fafc' : 'white',
      border: `1px solid ${disabled ? '#f1f5f9' : '#d1d5db'}`,
      borderRadius: 10, minHeight: 48,
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      cursor: disabled ? 'not-allowed' : 'pointer',
      fontSize: 14, textAlign: 'left',
    }}
  >
    <span style={{
      fontWeight: value ? 600 : 400,
      color: disabled ? '#cbd5e1' : (value ? '#0f172a' : '#94a3b8'),
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    }}>
      {value || placeholder}
    </span>
    <ChevronDown size={14} style={{ color: disabled ? '#e2e8f0' : '#cbd5e1', flexShrink: 0 }} />
  </button>
);

const Segmented = ({ value, options, onChange, style }) => (
  <div style={{
    display: 'inline-flex', background: '#f1f5f9',
    borderRadius: 10, padding: 3, gap: 2, width: '100%',
    ...style,
  }}>
    {options.map(o => (
      <button
        key={o.value}
        onClick={() => onChange(o.value)}
        style={{
          flex: 1, padding: '8px 10px', border: 0,
          background: value === o.value ? 'white' : 'transparent',
          borderRadius: 8, fontSize: 13, fontWeight: 700,
          color: value === o.value ? 'var(--m-brand)' : '#64748b',
          boxShadow: value === o.value ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          cursor: 'pointer',
        }}
      >
        {o.label}
      </button>
    ))}
  </div>
);

const Switch = ({ on, onClick }) => (
  <button
    onClick={onClick}
    aria-pressed={on}
    style={{
      width: 38, height: 22, borderRadius: 999,
      background: on ? 'var(--m-brand)' : '#cbd5e1',
      position: 'relative', cursor: 'pointer', flexShrink: 0,
      border: 0, padding: 0,
    }}
  >
    <span style={{
      position: 'absolute', top: 3, left: on ? 19 : 3,
      width: 16, height: 16, borderRadius: '50%', background: 'white',
      transition: 'left 200ms',
    }} />
  </button>
);

/* ──────── Picker bottom sheet ──────── */
const PickerSheet = ({ titulo, items, permitirNuevo, tipoNombre = 'opción', fallbackAviso = null, onPick, onClose }) => {
  const [q, setQ] = useState('');
  const [escribiendoNuevo, setEscribiendoNuevo] = useState(false);
  const [nuevoTexto, setNuevoTexto] = useState('');

  const filtrados = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(it => String(it.nombre || '').toLowerCase().includes(s));
  }, [items, q]);

  if (escribiendoNuevo) {
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
            padding: '12px 16px 24px',
            paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
          }}
        >
          <div style={{ width: 40, height: 4, background: '#cbd5e1', borderRadius: 2, margin: '0 auto 12px' }} />
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
            Nueva {tipoNombre} (no en catálogo)
          </div>
          <div style={{
            background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e',
            padding: 10, borderRadius: 8, fontSize: 11, marginBottom: 12,
            lineHeight: 1.5,
          }}>
            Quedará como texto libre en este corte. <strong>No se agrega al catálogo global</strong>; eso se hace desde web.
          </div>
          <input
            className="m-input"
            autoFocus
            placeholder={`Nombre de la ${tipoNombre}`}
            value={nuevoTexto}
            onChange={(e) => setNuevoTexto(e.target.value)}
            style={{ fontSize: 15, marginBottom: 12 }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setEscribiendoNuevo(false)}
              className="m-btn m-btn-outline"
              style={{ flex: 1, minHeight: 44, borderColor: '#cbd5e1', color: '#475569' }}
            >
              Volver
            </button>
            <button
              onClick={() => {
                if (!nuevoTexto.trim()) return;
                onPick({ id: null, nombre: nuevoTexto.trim(), esLibre: true });
              }}
              className="m-btn m-btn-primary"
              disabled={!nuevoTexto.trim()}
              style={{ flex: 1.5, minHeight: 44 }}
            >
              <Check size={14} /> Usar "{nuevoTexto.trim() || '...'}"
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  }

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
          padding: '12px 16px 20px', maxHeight: '75vh',
          paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ width: 40, height: 4, background: '#cbd5e1', borderRadius: 2, margin: '0 auto 12px' }} />
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 10 }}>{titulo}</div>
        {fallbackAviso && (
          <div style={{
            background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e',
            borderRadius: 8, padding: 10, fontSize: 11, lineHeight: 1.5,
            marginBottom: 10, display: 'flex', gap: 8, alignItems: 'flex-start',
          }}>
            <Info size={12} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{fallbackAviso}</span>
          </div>
        )}
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <Search size={14} style={{
            position: 'absolute', left: 10, top: '50%',
            transform: 'translateY(-50%)', color: '#94a3b8',
          }} />
          <input
            className="m-input" autoFocus
            placeholder="Buscar..."
            value={q} onChange={(e) => setQ(e.target.value)}
            style={{ paddingLeft: 32, fontSize: 14 }}
          />
        </div>
        <div style={{
          flex: 1, overflowY: 'auto', background: '#f8fafc',
          borderRadius: 8, maxHeight: '50vh',
        }}>
          {filtrados.length === 0 && !permitirNuevo && (
            <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              Sin opciones.
            </div>
          )}
          {filtrados.map(it => (
            <button
              key={it.id}
              onClick={() => onPick({ id: it.id, nombre: it.nombre, esLibre: false })}
              style={{
                width: '100%', padding: '12px 14px',
                background: 'transparent', border: 0,
                borderBottom: '1px solid #f1f5f9',
                textAlign: 'left', cursor: 'pointer',
                fontSize: 14, fontWeight: 600, color: '#0f172a',
              }}
            >
              {it.nombre}
            </button>
          ))}
          {permitirNuevo && (
            <button
              onClick={() => setEscribiendoNuevo(true)}
              style={{
                width: '100%', padding: '12px 14px',
                background: 'transparent', border: 0,
                textAlign: 'left', cursor: 'pointer',
                fontSize: 14, fontWeight: 700, color: 'var(--m-brand)',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <Plus size={14} /> Escribir {tipoNombre} nueva...
            </button>
          )}
        </div>
        <button
          onClick={onClose}
          className="m-btn m-btn-outline"
          style={{ marginTop: 10, minHeight: 44 }}
        >
          Cerrar
        </button>
      </div>
    </div>,
    document.body
  );
};

export default MobileNuevoCorte;
