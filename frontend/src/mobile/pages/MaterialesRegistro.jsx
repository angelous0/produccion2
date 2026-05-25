import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Loader2, Package, Check, ArrowDownToLine,
  PackageOpen, Plus,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const FILTROS = [
  { key: 'todos',     label: 'Todos' },
  { key: 'faltantes', label: 'Faltantes' },
  { key: 'completos', label: 'Completos' },
  { key: 'telas',     label: 'Telas' },
  { key: 'avios',     label: 'Avíos' },
];

export const MobileMaterialesRegistro = () => {
  const { id: registroId } = useParams();
  const navigate = useNavigate();

  const [registro, setRegistro] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('todos');

  // Cargar registro + materiales
  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [regRes, matRes] = await Promise.all([
          axios.get(`${API}/registros/${registroId}`),
          axios.get(`${API}/registros/${registroId}/materiales`),
        ]);
        setRegistro(regRes.data);
        setData(matRes.data);
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [registroId]);

  // Agrupar líneas del BOM por item_id (puede haber una línea por talla)
  const materialesAgrupados = useMemo(() => {
    const lineas = data?.lineas || [];
    const map = {};
    for (const l of lineas) {
      const k = l.item_id;
      if (!map[k]) {
        map[k] = {
          item_id: k,
          item_codigo: l.item_codigo,
          item_nombre: l.item_nombre,
          item_unidad: l.item_unidad || 'u',
          control_por_rollos: !!l.control_por_rollos,
          stock_actual: Number(l.stock_actual || 0),
          requerido: 0,
          reservado: 0,
          consumido: 0,
        };
      }
      map[k].requerido  += Number(l.cantidad_requerida || 0);
      map[k].reservado  += Number(l.cantidad_reservada || 0);
      map[k].consumido  += Number(l.cantidad_consumida || 0);
    }
    return Object.values(map).map(m => ({
      ...m,
      pendiente: Math.max(0, m.requerido - m.consumido),
      completo:  m.requerido > 0 && m.consumido >= m.requerido,
      // si está descargado más de lo requerido (caso raro), también completo
    }));
  }, [data]);

  // Filtros
  const filtrados = useMemo(() => {
    return materialesAgrupados.filter(m => {
      if (filtro === 'faltantes') return !m.completo;
      if (filtro === 'completos') return m.completo;
      if (filtro === 'telas')     return m.control_por_rollos;
      if (filtro === 'avios')     return !m.control_por_rollos;
      return true;
    });
  }, [materialesAgrupados, filtro]);

  // Métricas globales
  const totalReq = materialesAgrupados.reduce((s, m) => s + m.requerido, 0);
  const totalCon = materialesAgrupados.reduce((s, m) => s + m.consumido, 0);
  const completos = materialesAgrupados.filter(m => m.completo).length;
  const total = materialesAgrupados.length;
  const avancePct = totalReq > 0 ? Math.min(100, Math.round((totalCon / totalReq) * 100)) : 0;

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>
        <Loader2 className="m-spin" size={32} style={{ margin: '0 auto' }} />
      </div>
    );
  }

  return (
    <>
      <div className="m-header">
        <button className="m-h-icon" onClick={() => navigate(-1)} aria-label="Volver">
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {registro?.modelo_nombre || registro?.modelo_manual?.nombre_modelo || '—'}
          </div>
          <div style={{
            fontSize: 11, opacity: 0.85, marginTop: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {registro?.n_corte}
            {registro?.estado && <> · {registro.estado}</>}
            {' · Materiales'}
          </div>
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Resumen / avance global */}
        {total > 0 && (
          <div className="m-card" style={{ background: '#f8fafc' }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              fontSize: 12, marginBottom: 8,
            }}>
              <span style={{ color: '#64748b' }}>Avance global</span>
              <span style={{
                fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: 'var(--m-brand)',
              }}>
                {avancePct}% · {completos} de {total} completos
              </span>
            </div>
            <div style={{ height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                width: `${avancePct}%`, height: '100%',
                background: 'var(--m-brand)', transition: 'width .3s',
              }} />
            </div>
          </div>
        )}

        {/* Chips de filtro */}
        {total > 0 && (
          <div style={{
            display: 'flex', gap: 8, overflowX: 'auto',
            paddingBottom: 4, WebkitOverflowScrolling: 'touch',
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
        )}

        {/* Empty state */}
        {total === 0 && (
          <div className="m-card" style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>
            <Package size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
            <p style={{ margin: '0 0 12px', fontSize: 14 }}>
              Este registro no tiene requerimiento de MP definido.
            </p>
            <Link
              to={`/m/registros/${registroId}/descarga-mp`}
              className="m-btn m-btn-primary"
              style={{ textDecoration: 'none', display: 'inline-flex', maxWidth: 240, margin: '0 auto' }}
            >
              <Plus size={16} /> Descargar manualmente
            </Link>
          </div>
        )}

        {/* Cards por material */}
        {filtrados.map(m => (
          <MaterialCard key={m.item_id} m={m} registroId={registroId} />
        ))}

        {/* Filtrados vacío */}
        {total > 0 && filtrados.length === 0 && (
          <div className="m-card" style={{ textAlign: 'center', padding: 24, color: '#64748b' }}>
            <p style={{ margin: 0, fontSize: 13 }}>No hay materiales para este filtro</p>
          </div>
        )}

        {/* Salidas registradas */}
        {(data?.salidas?.length || 0) > 0 && (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              marginTop: 8, marginBottom: 4,
            }}>
              <PackageOpen size={14} style={{ color: '#64748b' }} />
              <span className="m-label-xs">Últimas salidas ({data.salidas.length})</span>
            </div>
            <div className="m-card" style={{ padding: 0 }}>
              {data.salidas.slice(0, 10).map((s, i) => (
                <div key={s.id || i} style={{
                  padding: 12,
                  borderBottom: i < Math.min(data.salidas.length, 10) - 1 ? '1px solid #f1f5f9' : 'none',
                  display: 'flex', justifyContent: 'space-between', gap: 10,
                  fontSize: 12,
                }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{
                      fontFamily: 'ui-monospace, monospace', fontSize: 10, color: '#64748b',
                    }}>{s.item_codigo}</div>
                    <div style={{
                      fontSize: 13, fontWeight: 500,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{s.item_nombre}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{
                      fontFamily: 'ui-monospace, monospace', fontWeight: 700,
                      color: 'var(--m-brand)', fontSize: 13,
                    }}>
                      {fmtNum(s.cantidad)} {s.item_unidad}
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>{fmtFecha(s.fecha)}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* CTA descargar manual (siempre, abajo) */}
        {total > 0 && (
          <Link
            to={`/m/registros/${registroId}/descarga-mp`}
            className="m-btn m-btn-outline"
            style={{
              textDecoration: 'none', borderStyle: 'dashed',
              color: 'var(--m-brand)', borderColor: 'var(--m-brand)',
              marginTop: 4,
            }}
          >
            <Plus size={16} /> Descargar otro material
          </Link>
        )}
      </div>
    </>
  );
};

/* ───────── Card de un material ───────── */
const MaterialCard = ({ m, registroId }) => {
  const pct = m.requerido > 0
    ? Math.min(100, Math.round((m.consumido / m.requerido) * 100))
    : 0;

  return (
    <div
      className="m-card"
      style={{
        borderColor: m.completo ? '#86efac' : '#fcd34d',
        background:  m.completo ? '#f0fdf4' : '#fffbeb',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontFamily: 'ui-monospace, monospace', fontSize: 10, color: '#64748b',
          }}>{m.item_codigo}</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{m.item_nombre}</div>
        </div>
        {m.completo ? (
          <span className="m-pill m-pill-green"><Check size={10} /> Completo</span>
        ) : (
          <span className="m-pill m-pill-amber">
            Faltan {fmtNum(m.pendiente)} {m.item_unidad}
          </span>
        )}
      </div>

      {/* Detalle de cantidades */}
      <div style={{
        marginTop: 10, paddingTop: 10,
        borderTop: `1px solid ${m.completo ? '#bbf7d0' : '#fde68a'}`,
        fontSize: 12, color: '#475569',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Requerido (BOM)</span>
          <strong style={{ fontFamily: 'ui-monospace, monospace' }}>
            {fmtNum(m.requerido)} {m.item_unidad}
          </strong>
        </div>
        {m.reservado > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
            <span>Reservado</span>
            <strong style={{ fontFamily: 'ui-monospace, monospace' }}>
              {fmtNum(m.reservado)} {m.item_unidad}
            </strong>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
          <span>Descargado</span>
          <strong style={{
            fontFamily: 'ui-monospace, monospace',
            color: '#15803d',
          }}>
            {fmtNum(m.consumido)} {m.item_unidad}
          </strong>
        </div>
      </div>

      {/* Barra mini de avance */}
      <div style={{ marginTop: 8 }}>
        <div style={{ height: 4, background: '#e2e8f0', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            width: `${pct}%`, height: '100%',
            background: m.completo ? '#22c55e' : '#f59e0b',
            transition: 'width .3s',
          }} />
        </div>
      </div>

      {/* CTA descargar */}
      {!m.completo && m.stock_actual > 0 && (
        <Link
          to={`/m/registros/${registroId}/descarga-mp?item_id=${m.item_id}`}
          className="m-btn m-btn-primary"
          style={{
            marginTop: 10, width: '100%',
            textDecoration: 'none', fontSize: 14, minHeight: 40,
          }}
        >
          <ArrowDownToLine size={16} />
          Descargar {fmtNum(m.pendiente)} faltantes
        </Link>
      )}
      {!m.completo && m.stock_actual <= 0 && (
        <div style={{
          marginTop: 10, padding: '8px 12px',
          background: '#fef2f2', border: '1px solid #fca5a5',
          color: '#b91c1c', borderRadius: 8, fontSize: 12,
        }}>
          Sin stock disponible · ingresa MP primero
        </div>
      )}
    </div>
  );
};

/* ─── Helpers ─── */
function fmtNum(n) {
  const v = Number(n) || 0;
  return v % 1 === 0 ? v.toString() : v.toFixed(2);
}
function fmtFecha(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' });
}

export default MobileMaterialesRegistro;
