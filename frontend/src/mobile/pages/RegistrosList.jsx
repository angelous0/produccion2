import { useEffect, useState, useRef, useCallback } from 'react';
import axios from 'axios';
import { Search, QrCode, Loader2, ArrowLeft, Plus } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { RegistroCard } from './Home';
import { useAuth } from '../../context/AuthContext';
import { puede, ACCIONES } from '../utils/permisos';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const PAGE_SIZE = 30;

const FILTROS = [
  { key: 'todos', label: 'Todos' },
  { key: 'urgentes', label: 'Urgentes', soloUrgentes: true },
  { key: 'para_corte', label: 'Para Corte', estados: 'Para Corte' },
  { key: 'costura', label: 'Costura', estados: 'Costura' },
  { key: 'estampado', label: 'Estampado', estados: 'Estampado' },
  { key: 'bordado', label: 'Bordado', estados: 'Bordado' },
  { key: 'lavanderia', label: 'Lavandería', estados: 'Lavandería' },
  { key: 'acabado', label: 'Acabado', estados: 'Acabado' },
];

export const MobileRegistrosList = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const puedeCrear = puede(user, ACCIONES.CREAR_CORTE);
  const [registros, setRegistros] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [searchDeb, setSearchDeb] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [error, setError] = useState(null); // { status, message }

  // Debounce buscador
  useEffect(() => {
    const t = setTimeout(() => setSearchDeb(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Construye params para la query
  const buildParams = useCallback((nextOffset) => {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(nextOffset),
    });
    if (searchDeb) params.set('search', searchDeb);
    const filtroObj = FILTROS.find(f => f.key === filtro);
    if (filtroObj?.estados) params.set('estados', filtroObj.estados);
    return params;
  }, [searchDeb, filtro]);

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
        const filtroObj = FILTROS.find(f => f.key === filtro);
        if (filtroObj?.soloUrgentes) items = items.filter(r => r.urgente);
        setRegistros(items);
        setTotal(filtroObj?.soloUrgentes ? items.length : totalReal);
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
  }, [searchDeb, filtro, buildParams]);

  // Cargar más (siguiente página)
  const cargarMas = useCallback(async () => {
    if (loadingMore || loading) return;
    if (registros.length >= total) return;

    setLoadingMore(true);
    const nextOffset = registros.length;
    try {
      const params = buildParams(nextOffset);
      const res = await axios.get(`${API}/registros?${params}`);
      let items = res.data?.items || res.data || [];
      const filtroObj = FILTROS.find(f => f.key === filtro);
      if (filtroObj?.soloUrgentes) items = items.filter(r => r.urgente);
      setRegistros(prev => [...prev, ...items]);
      setOffset(nextOffset);
    } catch {
      // mantener lista actual
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, loading, registros.length, total, buildParams, filtro]);

  // Infinite scroll: auto-cargar cuando el sentinel entra en viewport
  const sentinelRef = useRef(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) cargarMas();
      },
      { rootMargin: '120px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [cargarMas]);

  const hayMas = registros.length < total;

  return (
    <>
      {/* Header con back + título */}
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
        {/* Buscador */}
        <div style={{ position: 'relative' }}>
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

        {/* Chips de filtro (scroll horizontal) */}
        <div style={{
          display: 'flex', gap: 8, overflowX: 'auto',
          paddingBottom: 4,
          WebkitOverflowScrolling: 'touch',
        }}>
          {FILTROS.map(f => (
            <button
              key={f.key}
              className={`m-chip ${filtro === f.key ? 'active' : ''}`}
              style={{ fontSize: 12, minHeight: 36, padding: '6px 12px' }}
              onClick={() => setFiltro(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Banner de error (403, 401, red) */}
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
              {searchDeb ? `Sin resultados para "${searchDeb}"` : 'No hay registros para este filtro'}
            </p>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {registros.map(r => <RegistroCard key={r.id} registro={r} />)}
            </div>

            {/* Sentinel + botón "Cargar más" */}
            {hayMas && (
              <>
                <button
                  className="m-btn m-btn-outline"
                  onClick={cargarMas}
                  disabled={loadingMore}
                  style={{ marginTop: 8 }}
                >
                  {loadingMore
                    ? <><Loader2 className="m-spin" size={16} /> Cargando...</>
                    : `Cargar ${Math.min(PAGE_SIZE, total - registros.length)} más`}
                </button>
                {/* Sentinel para infinite scroll automático */}
                <div ref={sentinelRef} style={{ height: 1 }} />
              </>
            )}

            {/* Indicador final */}
            {!hayMas && registros.length > 0 && (
              <div style={{
                textAlign: 'center', padding: '12px 8px',
                fontSize: 12, color: '#94a3b8',
              }}>
                {total === 1 ? 'Único registro' : `Has llegado al final · ${total} registros`}
              </div>
            )}
          </>
        )}
      </div>

      {/* FAB: Nuevo corte (solo admin/supervisor) */}
      {puedeCrear && (
        <Link
          to="/m/registros/nuevo"
          aria-label="Crear nuevo corte"
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
    </>
  );
};

export default MobileRegistrosList;
