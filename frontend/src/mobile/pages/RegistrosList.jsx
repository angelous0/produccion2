import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Search, QrCode, Loader2, ArrowLeft, Plus, SlidersHorizontal, X } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { RegistroCard } from './Home';
import { useAuth } from '../../context/AuthContext';
import { puede, ACCIONES } from '../utils/permisos';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const PAGE_SIZE = 30;

// Estados agrupados como en el mockup v2.
const ESTADOS_ACTIVOS = ['Corte', 'Costura', 'Estampado', 'Bordado', 'Atraque', 'Lavandería', 'Acabado'];
const ESTADOS_ESPERA = ['Para Corte', 'Para Costura', 'Para Atraque', 'Para Lavandería', 'Para Acabado'];
const ESTADOS_FINAL = ['Almacén PT', 'Tienda'];
const TODOS_ESTADOS = [...ESTADOS_ACTIVOS, ...ESTADOS_ESPERA, ...ESTADOS_FINAL];

// Chips rápidos arriba (subset de los más usados).
const CHIPS_RAPIDOS = [
  { key: 'todos', label: 'Todos' },
  { key: 'urgentes', label: '⚠ Urgentes' },
  { key: 'Para Corte', label: 'Para Corte' },
  { key: 'Corte', label: 'Corte' },
  { key: 'Para Costura', label: 'Para Costura' },
  { key: 'Costura', label: 'Costura' },
  { key: 'Estampado', label: 'Estampado' },
  { key: 'Bordado', label: 'Bordado' },
  { key: 'Para Atraque', label: 'Para Atraque' },
  { key: 'Atraque', label: 'Atraque' },
  { key: 'Para Lavandería', label: 'Para Lavandería' },
  { key: 'Lavandería', label: 'Lavandería' },
  { key: 'Para Acabado', label: 'Para Acabado' },
  { key: 'Acabado', label: 'Acabado' },
  { key: 'Almacén PT', label: 'Almacén PT' },
  { key: 'Tienda', label: 'Tienda' },
];

// Estado inicial vacío de filtros avanzados.
const FILTROS_INICIALES = {
  estados: [],         // array de strings
  marca_ids: [],       // array de strings (IDs)
  tipo_ids: [],
  entalle_ids: [],
  solo_urgentes: false,
  incluir_cerrados: false,
};

const STORAGE_KEY = 'm_registros_filtros_v2';

// Lee filtros de localStorage al cargar la pantalla (sobreviven recargas).
function leerFiltrosGuardados() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return FILTROS_INICIALES;
    const obj = JSON.parse(raw);
    return { ...FILTROS_INICIALES, ...obj };
  } catch {
    return FILTROS_INICIALES;
  }
}

function guardarFiltros(filtros) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filtros));
  } catch { /* silent */ }
}

export const MobileRegistrosList = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const puedeCrear = puede(user, ACCIONES.CREAR_CORTE);

  // Datos
  const [registros, setRegistros] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // UI
  const [search, setSearch] = useState('');
  const [searchDeb, setSearchDeb] = useState('');
  const [error, setError] = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  // Filtros (persisten en localStorage)
  const [filtros, setFiltros] = useState(leerFiltrosGuardados);

  // Catálogos para el sheet (se cargan una vez)
  const [marcas, setMarcas] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [entalles, setEntalles] = useState([]);

  // Cargar catálogos al montar
  useEffect(() => {
    (async () => {
      try {
        const [m, t, e] = await Promise.all([
          axios.get(`${API}/marcas`).catch(() => ({ data: [] })),
          axios.get(`${API}/tipos`).catch(() => ({ data: [] })),
          axios.get(`${API}/entalles`).catch(() => ({ data: [] })),
        ]);
        setMarcas(Array.isArray(m.data) ? m.data : (m.data?.items || []));
        setTipos(Array.isArray(t.data) ? t.data : (t.data?.items || []));
        setEntalles(Array.isArray(e.data) ? e.data : (e.data?.items || []));
      } catch { /* silent */ }
    })();
  }, []);

  // Guardar filtros cuando cambian
  useEffect(() => {
    guardarFiltros(filtros);
  }, [filtros]);

  // Debounce buscador
  useEffect(() => {
    const t = setTimeout(() => setSearchDeb(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Cantidad de filtros activos (para badge del botón)
  const cantFiltrosActivos = useMemo(() => {
    let n = 0;
    if (filtros.estados.length > 0) n++;
    if (filtros.marca_ids.length > 0) n++;
    if (filtros.tipo_ids.length > 0) n++;
    if (filtros.entalle_ids.length > 0) n++;
    if (filtros.solo_urgentes) n++;
    if (filtros.incluir_cerrados) n++;
    return n;
  }, [filtros]);

  // Construye params para la query al backend
  const buildParams = useCallback((nextOffset) => {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(nextOffset),
    });
    if (searchDeb) params.set('search', searchDeb);

    // Estados (multi)
    if (filtros.estados.length > 0) {
      params.set('estados', filtros.estados.join(','));
    }

    // Modelo
    if (filtros.marca_ids.length > 0) params.set('marca_id', filtros.marca_ids.join(','));
    if (filtros.tipo_ids.length > 0) params.set('tipo_id', filtros.tipo_ids.join(','));
    if (filtros.entalle_ids.length > 0) params.set('entalle_id', filtros.entalle_ids.join(','));

    // No excluimos Tienda por default — el backend tiene default "Tienda" pero al
    // pasar string vacío sobrescribimos. Si el usuario filtra "incluir cerrados",
    // tampoco excluimos.
    if (filtros.incluir_cerrados) {
      params.set('excluir_estados', '');
    } else {
      // Excluimos solo CERRADA/ANULADA, no Tienda (para que se vean).
      params.set('excluir_estados', 'CERRADA,ANULADA');
    }

    return params;
  }, [searchDeb, filtros]);

  // Cargar primera página (cuando cambia filtro o búsqueda)
  useEffect(() => {
    const fetchPrimera = async () => {
      setLoading(true);
      setOffset(0);
      setError(null);
      try {
        const params = buildParams(0);
        const res = await axios.get(`${API}/registros?${params}`);
        let items = res.data?.items || res.data || [];
        const totalReal = typeof res.data?.total === 'number' ? res.data.total : items.length;
        // Solo urgentes — el backend no tiene flag específico todavía, filtramos client-side
        if (filtros.solo_urgentes) {
          items = items.filter(r => r.urgente);
        }
        setRegistros(items);
        setTotal(filtros.solo_urgentes ? items.length : totalReal);
      } catch (e) {
        setRegistros([]);
        setTotal(0);
        const status = e?.response?.status;
        const detail = e?.response?.data?.detail;
        if (status === 403) {
          setError({
            status,
            message: typeof detail === 'string'
              ? detail
              : 'Tu usuario no tiene permiso para ver registros.',
          });
        } else if (status === 401) {
          setError({ status, message: 'Tu sesión expiró. Cerrá sesión y volvé a entrar.' });
        } else {
          setError({
            status: status || 'red',
            message: typeof detail === 'string'
              ? detail
              : (status ? `Error ${status} al cargar registros` : 'No se pudo conectar con el servidor'),
          });
        }
      } finally {
        setLoading(false);
      }
    };
    fetchPrimera();
  }, [searchDeb, filtros, buildParams]);

  // Cargar más
  const cargarMas = useCallback(async () => {
    if (loadingMore || loading) return;
    if (registros.length >= total) return;
    setLoadingMore(true);
    const nextOffset = registros.length;
    try {
      const params = buildParams(nextOffset);
      const res = await axios.get(`${API}/registros?${params}`);
      let items = res.data?.items || res.data || [];
      if (filtros.solo_urgentes) items = items.filter(r => r.urgente);
      setRegistros(prev => [...prev, ...items]);
      setOffset(nextOffset);
    } catch { /* keep list */ } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, loading, registros.length, total, buildParams, filtros]);

  // Infinite scroll
  const sentinelRef = useRef(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) cargarMas(); },
      { rootMargin: '120px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [cargarMas]);

  const hayMas = registros.length < total;

  // ─── Toggle de chip rápido arriba ─────────────────────────────────────────
  // 'todos' resetea estados. 'urgentes' togglea solo_urgentes. Cualquier estado
  // togglea esa entrada en el array filtros.estados.
  const onChipRapido = (key) => {
    if (key === 'todos') {
      setFiltros(f => ({ ...f, estados: [], solo_urgentes: false }));
      return;
    }
    if (key === 'urgentes') {
      setFiltros(f => ({ ...f, solo_urgentes: !f.solo_urgentes }));
      return;
    }
    // Es un estado: toggle único (chip rápido reemplaza el array)
    setFiltros(f => {
      const yaEsta = f.estados.length === 1 && f.estados[0] === key;
      return { ...f, estados: yaEsta ? [] : [key] };
    });
  };

  const chipActivo = (key) => {
    if (key === 'todos') return filtros.estados.length === 0 && !filtros.solo_urgentes;
    if (key === 'urgentes') return filtros.solo_urgentes;
    return filtros.estados.length === 1 && filtros.estados[0] === key;
  };

  const limpiarTodo = () => setFiltros(FILTROS_INICIALES);

  // ─── Quitar un grupo de filtros activos (desde chip removible) ────────────
  const quitarGrupo = (grupo) => {
    setFiltros(f => {
      const next = { ...f };
      if (grupo === 'estados') next.estados = [];
      if (grupo === 'marca') next.marca_ids = [];
      if (grupo === 'tipo') next.tipo_ids = [];
      if (grupo === 'entalle') next.entalle_ids = [];
      if (grupo === 'urgentes') next.solo_urgentes = false;
      if (grupo === 'cerrados') next.incluir_cerrados = false;
      return next;
    });
  };

  // ─── Build de chips activos para mostrar arriba ───────────────────────────
  const chipsActivos = useMemo(() => {
    const arr = [];
    if (filtros.estados.length > 0) arr.push({ key: 'estados', label: `Estados · ${filtros.estados.length}` });
    if (filtros.marca_ids.length > 0) arr.push({ key: 'marca', label: `Marca · ${filtros.marca_ids.length}` });
    if (filtros.tipo_ids.length > 0) arr.push({ key: 'tipo', label: `Tipo · ${filtros.tipo_ids.length}` });
    if (filtros.entalle_ids.length > 0) arr.push({ key: 'entalle', label: `Entalle · ${filtros.entalle_ids.length}` });
    if (filtros.solo_urgentes) arr.push({ key: 'urgentes', label: '⚠ Urgentes' });
    if (filtros.incluir_cerrados) arr.push({ key: 'cerrados', label: '+ Cerrados' });
    return arr;
  }, [filtros]);

  return (
    <>
      {/* Header */}
      <div className="m-header">
        <button className="m-h-icon" onClick={() => navigate(-1)} aria-label="Volver">
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, opacity: 0.8 }}>Producción</div>
          <div style={{ fontWeight: 600 }}>
            Registros · {loading ? '…' : `${registros.length} de ${total}`}
          </div>
        </div>
        <button
          className="m-h-icon"
          onClick={() => navigate('/m/escanear')}
          aria-label="Escanear corte"
          title="Escanear QR del corte"
        >
          <QrCode size={18} />
        </button>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Buscador + botón Filtros */}
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={18} style={{
              position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
              color: '#94a3b8', pointerEvents: 'none',
            }} />
            <input
              className="m-input"
              style={{ paddingLeft: 40 }}
              placeholder="CORTE-001, Polo, Hoodie..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            onClick={() => setShowFilters(true)}
            style={{
              position: 'relative',
              padding: '0 12px', minHeight: 44,
              border: cantFiltrosActivos > 0 ? '1px solid var(--m-brand)' : '1px solid #d1d5db',
              background: cantFiltrosActivos > 0 ? 'var(--m-brand)' : 'white',
              color: cantFiltrosActivos > 0 ? 'white' : '#0f172a',
              borderRadius: 12, fontSize: 13, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
            }}
            aria-label="Abrir filtros"
          >
            <SlidersHorizontal size={16} />
            Filtros
            {cantFiltrosActivos > 0 && (
              <span style={{
                position: 'absolute', top: -6, right: -6,
                background: '#ef4444', color: 'white',
                fontSize: 9, fontWeight: 700,
                borderRadius: 999, minWidth: 18, height: 18, padding: '0 4px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '2px solid var(--m-brand)',
              }}>
                {cantFiltrosActivos}
              </span>
            )}
          </button>
        </div>

        {/* Chips activos (si los hay) */}
        {chipsActivos.length > 0 && (
          <div style={{
            display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center',
          }}>
            {chipsActivos.map(c => (
              <span
                key={c.key}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '4px 6px 4px 10px', borderRadius: 999,
                  background: 'var(--m-brand-soft)', color: 'var(--m-brand)',
                  border: '1px solid var(--m-brand)',
                  fontSize: 11, fontWeight: 600,
                }}
              >
                {c.label}
                <button
                  onClick={() => quitarGrupo(c.key)}
                  style={{
                    background: 'transparent', border: 0, cursor: 'pointer',
                    color: 'var(--m-brand)', padding: 0,
                    fontSize: 16, lineHeight: 1, fontWeight: 700,
                  }}
                  aria-label="Quitar filtro"
                >
                  ×
                </button>
              </span>
            ))}
            <button
              onClick={limpiarTodo}
              style={{
                background: 'transparent', border: 0, cursor: 'pointer',
                color: '#dc2626', fontSize: 11, fontWeight: 700, marginLeft: 4,
              }}
            >
              Limpiar
            </button>
          </div>
        )}

        {/* Chips rápidos de estado (scroll horizontal) */}
        <div style={{
          display: 'flex', gap: 8, overflowX: 'auto',
          paddingBottom: 4, WebkitOverflowScrolling: 'touch',
        }}>
          {CHIPS_RAPIDOS.map(f => (
            <button
              key={f.key}
              className={`m-chip ${chipActivo(f.key) ? 'active' : ''}`}
              style={{ fontSize: 12, minHeight: 36, padding: '6px 12px', flexShrink: 0 }}
              onClick={() => onChipRapido(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Banner de error */}
        {error && (
          <div style={{
            background: error.status === 403 ? '#fef3c7' : '#fee2e2',
            border: `1px solid ${error.status === 403 ? '#fcd34d' : '#fca5a5'}`,
            color: error.status === 403 ? '#92400e' : '#b91c1c',
            borderRadius: 12, padding: 12, fontSize: 13,
            display: 'flex', gap: 10, alignItems: 'flex-start',
          }}>
            <span style={{ fontWeight: 700 }}>
              {error.status === 403 ? '⚠' : error.status === 401 ? '🔒' : '❌'}
            </span>
            <div style={{ flex: 1 }}>
              <strong>{error.message}</strong>
              {error.status === 403 && (
                <div style={{ fontSize: 11, marginTop: 4, opacity: 0.85 }}>
                  Pide a un admin que actualice tus permisos (registros.ver).
                </div>
              )}
            </div>
          </div>
        )}

        {/* Lista */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40, color: '#64748b' }}>
            <Loader2 className="m-spin" size={24} />
          </div>
        ) : registros.length === 0 ? (
          <div className="m-card" style={{ textAlign: 'center', color: '#64748b', padding: 24 }}>
            <p style={{ fontSize: 14, margin: 0 }}>
              {searchDeb
                ? `Sin resultados para "${searchDeb}"`
                : cantFiltrosActivos > 0
                  ? 'Ningún registro coincide con los filtros'
                  : 'No hay registros'}
            </p>
            {cantFiltrosActivos > 0 && (
              <button
                onClick={limpiarTodo}
                style={{
                  marginTop: 12, background: 'transparent', border: 0,
                  color: 'var(--m-brand)', fontWeight: 700, fontSize: 12, cursor: 'pointer',
                }}
              >
                Limpiar filtros
              </button>
            )}
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {registros.map(r => <RegistroCard key={r.id} registro={r} />)}
            </div>

            {hayMas && (
              <>
                <div ref={sentinelRef} style={{ height: 1 }} />
                <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
                  {loadingMore ? (
                    <Loader2 className="m-spin" size={20} style={{ color: '#94a3b8' }} />
                  ) : (
                    <button
                      onClick={cargarMas}
                      style={{
                        background: 'transparent', border: 0, cursor: 'pointer',
                        color: 'var(--m-brand)', fontSize: 12, fontWeight: 700,
                      }}
                    >
                      Cargar más ↓
                    </button>
                  )}
                </div>
              </>
            )}
            {!hayMas && registros.length > 0 && (
              <div style={{
                textAlign: 'center', fontSize: 10, color: '#94a3b8',
                fontStyle: 'italic', padding: 12,
              }}>
                Mostrando {registros.length} resultado{registros.length !== 1 ? 's' : ''}
                {cantFiltrosActivos > 0 ? ' con los filtros activos' : ''}
              </div>
            )}
          </>
        )}
      </div>

      {/* FAB */}
      {puedeCrear && (
        <Link
          to="/m/registros/nuevo"
          style={{
            position: 'fixed', right: 18, bottom: 78, zIndex: 40,
            width: 56, height: 56, borderRadius: '50%',
            background: 'var(--m-brand)', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 20px -4px rgba(15, 118, 110, 0.5)',
            textDecoration: 'none',
          }}
        >
          <Plus size={26} strokeWidth={2.6} />
        </Link>
      )}

      {/* Sheet de filtros */}
      {showFilters && (
        <FiltrosSheet
          filtros={filtros}
          marcas={marcas}
          tipos={tipos}
          entalles={entalles}
          onClose={() => setShowFilters(false)}
          onApply={(nuevos) => {
            setFiltros(nuevos);
            setShowFilters(false);
          }}
          onLimpiar={() => {
            setFiltros(FILTROS_INICIALES);
            setShowFilters(false);
          }}
        />
      )}
    </>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   Sheet de filtros avanzados (v2 — estados primero, sin línea de negocio)
   ═══════════════════════════════════════════════════════════════════════════ */
const FiltrosSheet = ({ filtros, marcas, tipos, entalles, onClose, onApply, onLimpiar }) => {
  // Estado local del sheet (solo se aplica al confirmar)
  const [local, setLocal] = useState(filtros);

  // Toggle helper para arrays
  const toggleEn = (campo, valor) => {
    setLocal(f => {
      const arr = f[campo] || [];
      return {
        ...f,
        [campo]: arr.includes(valor) ? arr.filter(v => v !== valor) : [...arr, valor],
      };
    });
  };

  const ChipSel = ({ activo, onClick, children }) => (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
        background: activo ? 'var(--m-brand)' : 'white',
        color: activo ? 'white' : '#0f172a',
        border: activo ? '1px solid var(--m-brand)' : '1px solid #e5e7eb',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );

  return (
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
          maxHeight: '94vh', display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Handle + header */}
        <div style={{ padding: '10px 16px 12px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
          <div style={{ width: 40, height: 4, background: '#cbd5e1', borderRadius: 2, margin: '0 auto 10px' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Filtros</div>
            <button
              onClick={onLimpiar}
              style={{
                background: 'transparent', border: 0,
                color: 'var(--m-brand)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >
              Limpiar todo
            </button>
          </div>
        </div>

        {/* Scroll */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ESTADOS (PRIMERO — lo más importante) */}
          <div>
            <div style={{
              fontSize: 11, fontWeight: 700, color: 'var(--m-brand)',
              textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8,
            }}>
              Estados
            </div>

            <div style={{
              fontSize: 9, color: '#94a3b8', fontWeight: 700,
              textTransform: 'uppercase', marginBottom: 6, marginTop: 4,
            }}>
              Activos · etapas con movimiento
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {ESTADOS_ACTIVOS.map(est => (
                <ChipSel key={est} activo={local.estados.includes(est)} onClick={() => toggleEn('estados', est)}>
                  {est}
                </ChipSel>
              ))}
            </div>

            <div style={{
              fontSize: 9, color: '#94a3b8', fontWeight: 700,
              textTransform: 'uppercase', marginBottom: 6,
            }}>
              De espera
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {ESTADOS_ESPERA.map(est => (
                <ChipSel key={est} activo={local.estados.includes(est)} onClick={() => toggleEn('estados', est)}>
                  {est}
                </ChipSel>
              ))}
            </div>

            <div style={{
              fontSize: 9, color: '#94a3b8', fontWeight: 700,
              textTransform: 'uppercase', marginBottom: 6,
            }}>
              Final
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {ESTADOS_FINAL.map(est => (
                <ChipSel key={est} activo={local.estados.includes(est)} onClick={() => toggleEn('estados', est)}>
                  {est}
                </ChipSel>
              ))}
            </div>
          </div>

          {/* MARCA */}
          <div>
            <div style={{
              fontSize: 11, fontWeight: 700, color: '#475569',
              textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8,
            }}>
              Marca {marcas.length > 0 && <span style={{ color: '#94a3b8', fontWeight: 400, textTransform: 'none' }}>({marcas.length})</span>}
            </div>
            {marcas.length === 0 ? (
              <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>
                Cargando catálogo…
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {marcas.map(m => (
                  <ChipSel
                    key={m.id}
                    activo={local.marca_ids.includes(String(m.id))}
                    onClick={() => toggleEn('marca_ids', String(m.id))}
                  >
                    {m.nombre}
                  </ChipSel>
                ))}
              </div>
            )}
          </div>

          {/* TIPO */}
          <div>
            <div style={{
              fontSize: 11, fontWeight: 700, color: '#475569',
              textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8,
            }}>
              Tipo {tipos.length > 0 && <span style={{ color: '#94a3b8', fontWeight: 400, textTransform: 'none' }}>({tipos.length})</span>}
            </div>
            {tipos.length === 0 ? (
              <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>
                Cargando catálogo…
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {tipos.map(t => (
                  <ChipSel
                    key={t.id}
                    activo={local.tipo_ids.includes(String(t.id))}
                    onClick={() => toggleEn('tipo_ids', String(t.id))}
                  >
                    {t.nombre}
                  </ChipSel>
                ))}
              </div>
            )}
          </div>

          {/* ENTALLE */}
          <div>
            <div style={{
              fontSize: 11, fontWeight: 700, color: '#475569',
              textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8,
            }}>
              Entalle {entalles.length > 0 && <span style={{ color: '#94a3b8', fontWeight: 400, textTransform: 'none' }}>({entalles.length})</span>}
            </div>
            {entalles.length === 0 ? (
              <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>
                Cargando catálogo…
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {entalles.map(e => (
                  <ChipSel
                    key={e.id}
                    activo={local.entalle_ids.includes(String(e.id))}
                    onClick={() => toggleEn('entalle_ids', String(e.id))}
                  >
                    {e.nombre}
                  </ChipSel>
                ))}
              </div>
            )}
          </div>

          {/* Toggles */}
          <div style={{ background: '#f8fafc', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Toggle
              label="⚠ Solo urgentes"
              sub="Filtrar por bandera de urgencia"
              activo={local.solo_urgentes}
              onChange={() => setLocal(f => ({ ...f, solo_urgentes: !f.solo_urgentes }))}
            />
            <Toggle
              label="Incluir cerrados/anulados"
              sub="Mostrar también los inactivos"
              activo={local.incluir_cerrados}
              onChange={() => setLocal(f => ({ ...f, incluir_cerrados: !f.incluir_cerrados }))}
            />
          </div>
        </div>

        {/* Footer fijo */}
        <div style={{
          padding: 14, borderTop: '1px solid #f1f5f9', flexShrink: 0,
          display: 'flex', gap: 10,
        }}>
          <button
            onClick={onClose}
            className="m-btn m-btn-outline"
            style={{ flex: 1 }}
          >
            <X size={16} /> Cancelar
          </button>
          <button
            onClick={() => onApply(local)}
            className="m-btn m-btn-primary"
            style={{ flex: 1.5 }}
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
};

const Toggle = ({ label, sub, activo, onChange }) => (
  <label
    onClick={onChange}
    style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      cursor: 'pointer',
    }}
  >
    <div>
      <div style={{ fontSize: 12, fontWeight: 600 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: '#64748b' }}>{sub}</div>}
    </div>
    <div style={{
      width: 40, height: 22, borderRadius: 999,
      background: activo ? 'var(--m-brand)' : '#cbd5e1',
      position: 'relative', transition: 'background .2s',
    }}>
      <div style={{
        position: 'absolute',
        left: activo ? 'calc(100% - 20px)' : 2,
        top: 2,
        width: 18, height: 18, borderRadius: '50%',
        background: 'white',
        transition: 'left .2s',
      }} />
    </div>
  </label>
);

export default MobileRegistrosList;
