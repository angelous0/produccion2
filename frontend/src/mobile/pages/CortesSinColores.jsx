import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Loader2, AlertTriangle, ChevronRight, Filter, X,
  Palette, AlertOctagon,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Cortes que están desde "Para Lavandería" en adelante pero aún no tienen
 * matriz de colores aprobada.
 *
 * Para los cortes en Lavandería muestra en qué lavandería están
 * (último movimiento abierto de servicio Lavandería).
 *
 * Pensado para que Diana abra desde Home y vaya directo a asignar colores.
 *
 * Endpoint: GET /api/cortes/pendientes-colores
 *   ?estado_matriz=incompleta|sin_matriz|parcial|aprobada|todas
 *   ?lavanderia_id=<persona_id>
 *   ?marca_id=<id>
 *   ?solo_urgentes=true
 */
export const MobileCortesSinColores = () => {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ items: [], kpis: {} });
  const [error, setError] = useState(null);

  // Filtros
  const [estadoMatriz, setEstadoMatriz] = useState('incompleta'); // chip superior
  const [estadosCorte, setEstadosCorte] = useState([]); // chips de estados (vacío = todos)
  const [marcasSel, setMarcasSel] = useState([]); // multi
  const [lavanderiasSel, setLavanderiasSel] = useState([]); // multi (persona_id)
  const [soloUrgentes, setSoloUrgentes] = useState(false);
  const [filtrosAbierto, setFiltrosAbierto] = useState(false);

  // Fetch
  useEffect(() => {
    let cancel = false;
    setLoading(true);
    const params = new URLSearchParams();
    params.set('estado_matriz', estadoMatriz);
    if (soloUrgentes) params.set('solo_urgentes', 'true');
    if (estadosCorte.length === 1) params.set('estados', estadosCorte[0]);
    if (estadosCorte.length > 1) params.set('estados', estadosCorte.join(','));
    // marca_id y lavanderia_id solo soportan uno en backend → si hay 1 lo mandamos,
    // si hay varios filtramos en cliente.
    axios.get(`${API}/cortes/pendientes-colores?${params.toString()}`)
      .then(res => {
        if (cancel) return;
        setData(res.data || { items: [], kpis: {} });
        setError(null);
      })
      .catch(err => {
        if (cancel) return;
        setError(err.response?.data?.detail || err.message || 'Error al cargar');
      })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [estadoMatriz, soloUrgentes, estadosCorte]);

  // Items filtrados en cliente por marca/lavandería
  const items = useMemo(() => {
    return (data.items || []).filter(it => {
      if (marcasSel.length > 0 && !marcasSel.includes(it.marca_nombre)) return false;
      if (lavanderiasSel.length > 0) {
        const lav = it.lavanderia?.persona_id;
        if (!lav || !lavanderiasSel.includes(lav)) return false;
      }
      return true;
    });
  }, [data.items, marcasSel, lavanderiasSel]);

  // Catálogos derivados para chips de filtros
  const marcasDisponibles = useMemo(() => {
    const counts = {};
    (data.items || []).forEach(it => {
      const m = it.marca_nombre || '—';
      counts[m] = (counts[m] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [data.items]);

  const lavanderiasDisponibles = useMemo(() => {
    const counts = {};
    (data.items || []).forEach(it => {
      const lav = it.lavanderia;
      if (!lav?.persona_id) return;
      const key = lav.persona_id;
      if (!counts[key]) counts[key] = { id: key, nombre: lav.persona_nombre, count: 0 };
      counts[key].count += 1;
    });
    return Object.values(counts).sort((a, b) => b.count - a.count);
  }, [data.items]);

  const estadosDisponibles = useMemo(() => {
    const counts = {};
    (data.items || []).forEach(it => {
      const e = it.estado || '—';
      counts[e] = (counts[e] || 0) + 1;
    });
    // Orden lógico de pipeline para mejor lectura
    const ORDEN = [
      'Para Lavanderia', 'Lavanderia', 'Muestra Lavanderia',
      'Para Acabado', 'Acabado', 'Almacen PT', 'Tienda',
    ];
    return Object.entries(counts).sort((a, b) => {
      const ia = ORDEN.indexOf(a[0]);
      const ib = ORDEN.indexOf(b[0]);
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [data.items]);

  const totalFiltrosActivos =
    (marcasSel.length > 0 ? 1 : 0) +
    (lavanderiasSel.length > 0 ? 1 : 0) +
    (soloUrgentes ? 1 : 0) +
    (estadosCorte.length > 0 ? 1 : 0);

  const limpiarFiltros = () => {
    setMarcasSel([]);
    setLavanderiasSel([]);
    setSoloUrgentes(false);
    setEstadosCorte([]);
  };

  return (
    <div style={{ paddingBottom: 80 }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
        color: 'white', padding: '14px 16px',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <button onClick={() => navigate(-1)} style={{
          background: 'transparent', border: 0, color: 'white', padding: 4, cursor: 'pointer',
        }}>
          <ArrowLeft size={20} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, opacity: 0.85 }}>Reporte</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Cortes sin colores</div>
        </div>
        <button
          onClick={() => setFiltrosAbierto(true)}
          style={{
            position: 'relative',
            background: 'rgba(255,255,255,0.15)',
            border: 0, color: 'white', padding: '6px 10px', borderRadius: 8,
            display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Filter size={14} /> Filtros
          {totalFiltrosActivos > 0 && (
            <span style={{
              position: 'absolute', top: -4, right: -4,
              background: '#facc15', color: '#78350f', fontSize: 9, fontWeight: 800,
              width: 16, height: 16, borderRadius: 999,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{totalFiltrosActivos}</span>
          )}
        </button>
      </div>

      {/* KPIs */}
      <div style={{ padding: 12, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
        <KpiCard
          value={data.kpis?.total || 0}
          label="Pendientes"
          color="#0f766e"
        />
        <KpiCard
          value={data.kpis?.en_lavanderia || 0}
          label="En lavandería"
          color="#7c3aed"
        />
        <KpiCard
          value={data.kpis?.acabado_o_mas || 0}
          label="Acabado o +"
          color="#dc2626"
        />
      </div>

      {/* Chips estado matriz */}
      <div style={{ padding: '4px 12px', display: 'flex', gap: 6, overflowX: 'auto', whiteSpace: 'nowrap' }}>
        <Chip
          active={estadoMatriz === 'incompleta'}
          onClick={() => setEstadoMatriz('incompleta')}
        >
          Incompletas
        </Chip>
        <Chip
          active={estadoMatriz === 'sin_matriz'}
          onClick={() => setEstadoMatriz('sin_matriz')}
        >
          Sin matriz
        </Chip>
        <Chip
          active={estadoMatriz === 'parcial'}
          onClick={() => setEstadoMatriz('parcial')}
        >
          Parciales
        </Chip>
        <Chip
          active={estadoMatriz === 'todas'}
          onClick={() => setEstadoMatriz('todas')}
        >
          Todas
        </Chip>
      </div>

      {/* Chips por estado del corte */}
      {estadosDisponibles.length > 0 && (
        <div style={{ padding: '8px 12px 0', display: 'flex', gap: 6, overflowX: 'auto', whiteSpace: 'nowrap' }}>
          {estadosDisponibles.map(([est, count]) => {
            const sel = estadosCorte.includes(est);
            return (
              <Chip
                key={est}
                active={sel}
                onClick={() => {
                  if (sel) setEstadosCorte(estadosCorte.filter(e => e !== est));
                  else setEstadosCorte([...estadosCorte, est]);
                }}
              >
                {est} <span style={{ opacity: 0.6 }}>({count})</span>
              </Chip>
            );
          })}
        </div>
      )}

      {/* Body */}
      <div style={{ padding: 12 }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <Loader2 className="m-spin" size={32} style={{ color: '#0f766e' }} />
          </div>
        ) : error ? (
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b',
            padding: 12, borderRadius: 12, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <AlertTriangle size={16} /> {error}
          </div>
        ) : items.length === 0 ? (
          <EmptyState totalRaw={data.items?.length || 0} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map(it => (
              <CorteCard key={it.id} item={it} />
            ))}
          </div>
        )}
      </div>

      {/* Sheet de filtros */}
      {filtrosAbierto && (
        <FiltrosSheet
          onClose={() => setFiltrosAbierto(false)}
          marcasDisponibles={marcasDisponibles}
          marcasSel={marcasSel}
          setMarcasSel={setMarcasSel}
          lavanderiasDisponibles={lavanderiasDisponibles}
          lavanderiasSel={lavanderiasSel}
          setLavanderiasSel={setLavanderiasSel}
          soloUrgentes={soloUrgentes}
          setSoloUrgentes={setSoloUrgentes}
          onLimpiar={limpiarFiltros}
          totalActivos={totalFiltrosActivos}
        />
      )}
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════
//   Card de corte
// ════════════════════════════════════════════════════════════════════════════
const CorteCard = ({ item }) => {
  const urgente = !!item.urgente;
  const lav = item.lavanderia;
  const estadoMatriz = item.estado_matriz;
  const tieneAlgoAsignado = (item.total_asignado || 0) > 0;

  return (
    <Link
      to={`/m/registros/${item.id}/matriz-colores`}
      className="m-card"
      style={{
        display: 'block', textDecoration: 'none', color: 'inherit',
        padding: 12,
        ...(urgente ? { borderLeft: '3px solid #ef4444' } : {}),
      }}
    >
      {/* Línea 1: chips */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        {urgente && (
          <span style={{
            background: '#fee2e2', color: '#b91c1c',
            fontSize: 9, fontWeight: 700, padding: '2px 6px',
            borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 2,
          }}>
            <AlertOctagon size={9} /> URG
          </span>
        )}
        {item.estado && (
          <span style={{
            background: '#f1f5f9', color: '#475569',
            fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 999,
            textTransform: 'uppercase',
          }}>{item.estado}</span>
        )}
        <BadgeMatriz estado={estadoMatriz} />
      </div>

      {/* Línea 2: modelo */}
      <div style={{
        fontWeight: 600, fontSize: 14, lineHeight: 1.2,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {item.modelo_nombre || '—'}
      </div>

      {/* Línea 3: n_corte · piezas · marca */}
      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ fontFamily: 'ui-monospace, monospace' }}>{item.n_corte}</span>
        <span>·</span>
        <span>{Number(item.total_prendas || 0)} pzs</span>
        {item.marca_nombre && (
          <>
            <span>·</span>
            <span>{item.marca_nombre}</span>
          </>
        )}
      </div>

      {/* Línea 4: lavandería actual (si aplica) */}
      {lav?.persona_nombre && (
        <div style={{
          marginTop: 6, fontSize: 11, color: '#7c3aed',
          background: '#f5f3ff', padding: '4px 8px', borderRadius: 8,
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
          🧼 En <b>{lav.persona_nombre}</b>
        </div>
      )}

      {/* Línea 5: resumen de matriz */}
      <div style={{
        marginTop: 8, padding: 8, background: '#f8fafc', borderRadius: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
            Matriz
          </div>
          {tieneAlgoAsignado ? (
            <div style={{ fontSize: 12, marginTop: 2 }}>
              <b>{item.n_colores_asignados}</b> color{item.n_colores_asignados !== 1 ? 'es' : ''} ·{' '}
              <b>{item.total_asignado}</b>/{item.total_prendas} pzs
              {' '}
              <span style={{ color: '#64748b' }}>({item.cobertura_pct || 0}%)</span>
            </div>
          ) : (
            <div style={{ fontSize: 12, marginTop: 2, color: '#dc2626', fontWeight: 600 }}>
              Sin asignar
            </div>
          )}
          {item.resumen_colores?.length > 0 && (
            <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
              {item.resumen_colores.map((c, i) => (
                <span key={i} style={{
                  fontSize: 10, padding: '1px 6px', background: 'white',
                  border: '1px solid #e2e8f0', borderRadius: 999,
                }}>
                  {c.nombre} <b>{c.cantidad}</b>
                </span>
              ))}
            </div>
          )}
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          color: '#0f766e', fontSize: 12, fontWeight: 700,
        }}>
          <Palette size={14} /> Asignar
          <ChevronRight size={14} />
        </div>
      </div>
    </Link>
  );
};

// ════════════════════════════════════════════════════════════════════════════
//   Badge según estado de la matriz
// ════════════════════════════════════════════════════════════════════════════
const BadgeMatriz = ({ estado }) => {
  if (estado === 'sin_matriz') {
    return (
      <span style={{
        background: '#fee2e2', color: '#991b1b',
        fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 999,
      }}>SIN MATRIZ</span>
    );
  }
  if (estado === 'parcial') {
    return (
      <span style={{
        background: '#fef3c7', color: '#92400e',
        fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 999,
      }}>PARCIAL</span>
    );
  }
  if (estado === 'aprobada') {
    return (
      <span style={{
        background: '#dcfce7', color: '#166534',
        fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 999,
      }}>APROBADA</span>
    );
  }
  return null;
};

// ════════════════════════════════════════════════════════════════════════════
//   Auxiliares
// ════════════════════════════════════════════════════════════════════════════
const Chip = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    style={{
      background: active ? '#0f766e' : 'white',
      color: active ? 'white' : '#334155',
      border: `1px solid ${active ? '#0f766e' : '#e2e8f0'}`,
      borderRadius: 999, padding: '6px 12px',
      fontSize: 12, fontWeight: 600, cursor: 'pointer',
      flexShrink: 0,
    }}
  >
    {children}
  </button>
);

const KpiCard = ({ value, label, color }) => (
  <div className="m-card" style={{ padding: 10, textAlign: 'center' }}>
    <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: 'ui-monospace, monospace', lineHeight: 1 }}>
      {value}
    </div>
    <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginTop: 2 }}>
      {label}
    </div>
  </div>
);

const EmptyState = ({ totalRaw }) => (
  <div style={{
    background: 'white', border: '1px solid #e2e8f0', borderRadius: 12,
    padding: 24, textAlign: 'center',
  }}>
    <div style={{ fontSize: 32, marginBottom: 8 }}>🎨</div>
    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
      {totalRaw === 0 ? 'No hay cortes pendientes' : 'No hay cortes con los filtros actuales'}
    </div>
    <div style={{ fontSize: 12, color: '#64748b' }}>
      {totalRaw === 0
        ? 'Todos los cortes desde Lavandería en adelante ya tienen su matriz.'
        : 'Probá quitando algún filtro para ver más resultados.'}
    </div>
  </div>
);

// ════════════════════════════════════════════════════════════════════════════
//   Sheet de filtros (lavandería + marca + urgente)
// ════════════════════════════════════════════════════════════════════════════
const FiltrosSheet = ({
  onClose, marcasDisponibles, marcasSel, setMarcasSel,
  lavanderiasDisponibles, lavanderiasSel, setLavanderiasSel,
  soloUrgentes, setSoloUrgentes, onLimpiar, totalActivos,
}) => {
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
        display: 'flex', alignItems: 'flex-end', zIndex: 50,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'white', width: '100%',
          borderTopLeftRadius: 20, borderTopRightRadius: 20,
          maxHeight: '85vh', overflowY: 'auto',
          padding: 16,
          paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Filtros</div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 0, padding: 4, cursor: 'pointer', color: '#64748b' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Urgentes */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 12px', background: '#f8fafc', borderRadius: 10, marginBottom: 16,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Solo urgentes</div>
          <button
            onClick={() => setSoloUrgentes(!soloUrgentes)}
            style={{
              width: 44, height: 24,
              background: soloUrgentes ? '#dc2626' : '#cbd5e1',
              borderRadius: 999, border: 0, position: 'relative', cursor: 'pointer',
              transition: 'background 0.15s',
            }}
          >
            <div style={{
              position: 'absolute', top: 2, left: soloUrgentes ? 22 : 2,
              width: 20, height: 20, borderRadius: '50%', background: 'white',
              transition: 'left 0.15s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }} />
          </button>
        </div>

        {/* Lavanderías */}
        {lavanderiasDisponibles.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
              color: '#64748b', marginBottom: 6, letterSpacing: '0.04em',
            }}>
              Lavandería ({lavanderiasSel.length} sel.)
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {lavanderiasDisponibles.map(lav => {
                const sel = lavanderiasSel.includes(lav.id);
                return (
                  <button
                    key={lav.id}
                    onClick={() => {
                      if (sel) setLavanderiasSel(lavanderiasSel.filter(x => x !== lav.id));
                      else setLavanderiasSel([...lavanderiasSel, lav.id]);
                    }}
                    style={{
                      background: sel ? '#7c3aed' : 'white',
                      color: sel ? 'white' : '#334155',
                      border: `1px solid ${sel ? '#7c3aed' : '#e2e8f0'}`,
                      borderRadius: 999, padding: '6px 10px',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    🧼 {lav.nombre} <span style={{ opacity: 0.7 }}>({lav.count})</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Marcas */}
        {marcasDisponibles.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
              color: '#64748b', marginBottom: 6, letterSpacing: '0.04em',
            }}>
              Marca ({marcasSel.length} sel.)
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {marcasDisponibles.map(([marca, count]) => {
                const sel = marcasSel.includes(marca);
                return (
                  <button
                    key={marca}
                    onClick={() => {
                      if (sel) setMarcasSel(marcasSel.filter(x => x !== marca));
                      else setMarcasSel([...marcasSel, marca]);
                    }}
                    style={{
                      background: sel ? '#0f766e' : 'white',
                      color: sel ? 'white' : '#334155',
                      border: `1px solid ${sel ? '#0f766e' : '#e2e8f0'}`,
                      borderRadius: 999, padding: '6px 10px',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    {marca} <span style={{ opacity: 0.7 }}>({count})</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8, marginTop: 16 }}>
          <button
            onClick={() => { onLimpiar(); }}
            disabled={totalActivos === 0}
            style={{
              padding: '10px', borderRadius: 12,
              background: 'white', border: '1px solid #e2e8f0',
              color: totalActivos === 0 ? '#cbd5e1' : '#334155',
              fontWeight: 600, fontSize: 13,
              cursor: totalActivos === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            Limpiar ({totalActivos})
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '10px', borderRadius: 12,
              background: '#0f766e', border: 0, color: 'white',
              fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default MobileCortesSinColores;
