import { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Loader2, Search, QrCode, ChevronRight, Package,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const LS_RECIENTES = 'm_envios_muestra_recientes';

/**
 * Selector de corte (paso 0 del flujo "Nuevo envío de muestra" desde Home).
 *
 * 2 vías:
 *   - Escanear QR del corte: navega a /m/escanear con un return_to que indica
 *     que después de leer debe ir a /m/registros/:id/nueva-muestra-lavanderia.
 *   - Búsqueda manual con autocomplete contra GET /registros?search=...
 *
 * También muestra "cortes recientes" guardados en localStorage (los últimos
 * 5 cortes en los que Diana creó muestras).
 *
 * Cuando se elige un corte, se navega a la pantalla normal de "Nueva muestra"
 * con el registro ya preseleccionado.
 */
export const MobileSeleccionarCorteMuestra = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [searchDeb, setSearchDeb] = useState('');
  const [resultados, setResultados] = useState([]);
  const [loading, setLoading] = useState(false);
  const [recientes, setRecientes] = useState([]);

  // Cargar recientes
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_RECIENTES);
      if (raw) setRecientes(JSON.parse(raw).slice(0, 6));
    } catch {}
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setSearchDeb(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const buscar = useCallback(async () => {
    if (!searchDeb) { setResultados([]); return; }
    setLoading(true);
    try {
      const r = await axios.get(`${API}/registros?search=${encodeURIComponent(searchDeb)}&limit=12`);
      setResultados(Array.isArray(r.data?.items) ? r.data.items : Array.isArray(r.data) ? r.data : []);
    } catch {
      setResultados([]);
    } finally {
      setLoading(false);
    }
  }, [searchDeb]);

  useEffect(() => { buscar(); }, [buscar]);

  const elegirCorte = (r) => {
    // Guardar en recientes (deduplicado, máximo 6)
    try {
      const item = {
        id: r.id,
        n_corte: r.n_corte,
        modelo_nombre: r.modelo_nombre || r.modelo_manual?.nombre_modelo || '',
      };
      const existentes = recientes.filter(x => x.id !== r.id);
      const nuevos = [item, ...existentes].slice(0, 6);
      localStorage.setItem(LS_RECIENTES, JSON.stringify(nuevos));
    } catch {}
    navigate(`/m/registros/${r.id}/nueva-muestra-lavanderia`);
  };

  return (
    <>
      <div className="m-header">
        <button className="m-h-icon" onClick={() => navigate(-1)} aria-label="Volver">
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, opacity: 0.85 }}>Nuevo envío de muestra</div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>¿De qué corte salen?</div>
        </div>
      </div>

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Pasos */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          justifyContent: 'center', marginBottom: 2,
        }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: '#7c3aed' }}>CORTE</span>
          <span style={{ width: 18, height: 1, background: '#cbd5e1' }} />
          <span style={{ fontSize: 10, color: '#94a3b8' }}>DESTINO</span>
          <span style={{ width: 18, height: 1, background: '#cbd5e1' }} />
          <span style={{ fontSize: 10, color: '#94a3b8' }}>CANTIDAD</span>
        </div>

        {/* Botón Escanear QR */}
        <Link
          to="/m/escanear?return_to=/m/envios-muestra/seleccionar-corte"
          className="m-btn m-btn-primary"
          style={{
            textDecoration: 'none', minHeight: 48, fontWeight: 700,
            background: '#0f766e', borderColor: '#0f766e',
          }}
        >
          <QrCode size={18} /> Escanear QR del corte
        </Link>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, color: '#94a3b8', fontSize: 11,
          fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em',
          margin: '4px 0',
        }}>
          <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
          o buscarlo
          <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
        </div>

        {/* Buscador */}
        <div style={{ position: 'relative' }}>
          <Search size={16} style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            color: '#94a3b8',
          }} />
          <input
            className="m-input"
            style={{ paddingLeft: 36 }}
            placeholder="Nº de corte o nombre de modelo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        {/* Resultados o recientes */}
        {searchDeb ? (
          <>
            <div className="m-label-xs">Resultados</div>
            {loading ? (
              <div style={{ padding: 30, textAlign: 'center' }}>
                <Loader2 className="m-spin" size={20} style={{ color: '#94a3b8' }} />
              </div>
            ) : resultados.length === 0 ? (
              <div className="m-card" style={{
                textAlign: 'center', color: '#94a3b8', padding: 20, fontSize: 13,
              }}>
                Sin resultados para "{searchDeb}"
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {resultados.map(r => (
                  <CorteRow key={r.id} r={r} onClick={() => elegirCorte(r)} />
                ))}
              </div>
            )}
          </>
        ) : recientes.length > 0 ? (
          <>
            <div className="m-label-xs">Cortes recientes</div>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6,
            }}>
              {recientes.map(r => (
                <button
                  key={r.id}
                  onClick={() => elegirCorte(r)}
                  style={{
                    background: 'white', border: '1px solid #e5e7eb',
                    borderRadius: 10, padding: 8, textAlign: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{
                    fontFamily: 'ui-monospace, monospace', fontWeight: 800,
                    fontSize: 12,
                  }}>
                    {r.n_corte}
                  </div>
                  <div style={{
                    fontSize: 9, color: '#64748b', marginTop: 3,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {r.modelo_nombre || '—'}
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="m-card" style={{
            textAlign: 'center', color: '#94a3b8', padding: 24, fontSize: 12,
          }}>
            Escribí el número de corte o tocá "Escanear QR".
          </div>
        )}
      </div>
    </>
  );
};

const CorteRow = ({ r, onClick }) => {
  const modelo = r.modelo_nombre || r.modelo_manual?.nombre_modelo || '—';
  const estado = r.estado || '';
  return (
    <button
      onClick={onClick}
      className="m-card"
      style={{
        textAlign: 'left', cursor: 'pointer', padding: 10,
        display: 'flex', alignItems: 'center', gap: 10,
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 8,
        background: '#f3e8ff', color: '#7c3aed',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Package size={16} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{
            fontFamily: 'ui-monospace, monospace', fontWeight: 800, fontSize: 13,
          }}>
            {r.n_corte}
          </span>
          {estado && (
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '1px 5px',
              borderRadius: 999, background: '#f1f5f9', color: '#475569',
              textTransform: 'uppercase',
            }}>
              {estado}
            </span>
          )}
        </div>
        <div style={{
          fontSize: 12, color: '#0f172a', marginTop: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {modelo}
        </div>
      </div>
      <ChevronRight size={16} color="#94a3b8" />
    </button>
  );
};

export default MobileSeleccionarCorteMuestra;
