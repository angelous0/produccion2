import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, Loader2, List, Package, AlertCircle, Pencil, Plus } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Lista de tallas del registro.
 *   GET /api/registros/:id/tallas
 * Response: { tallas: [{talla_id, talla_nombre, cantidad_real, cantidad_modelo}], total_cantidad }
 *
 * Pantalla de consulta: el operario solo ve la curva del corte, no la edita.
 */
export const MobileTallasRegistro = () => {
  const { id: registroId } = useParams();
  const navigate = useNavigate();

  const [registro, setRegistro] = useState(null);
  const [tallas, setTallas] = useState([]);
  const [total, setTotal] = useState(0);
  const [fuente, setFuente] = useState('tabla'); // 'tabla' | 'jsonb' | 'curva'
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [regRes, tallasRes] = await Promise.all([
          axios.get(`${API}/registros/${registroId}`),
          axios.get(`${API}/registros/${registroId}/tallas`).catch(() => ({ data: { tallas: [] } })),
        ]);
        const reg = regRes.data;
        setRegistro(reg);

        // 1) Fuente principal: tabla prod_registro_tallas
        const tablaTallas = tallasRes.data?.tallas || [];
        if (tablaTallas.length > 0) {
          setTallas(tablaTallas);
          setTotal(Number(tallasRes.data?.total_cantidad || 0));
          setFuente('tabla');
        } else {
          // 2) Fallback: jsonb registro.tallas (puede ser array u objeto)
          const fromJsonb = parseTallasJsonb(reg?.tallas);
          if (fromJsonb.length > 0) {
            setTallas(fromJsonb);
            setTotal(fromJsonb.reduce((s, t) => s + Number(t.cantidad_real || 0), 0));
            setFuente('jsonb');
          } else {
            // 3) Último fallback: derivar tallas vacías del patrón "curva"
            // (no inventamos cantidades; mostramos los "buckets" de la curva)
            const fromCurva = parseCurva(reg?.curva);
            if (fromCurva.length > 0) {
              setTallas(fromCurva);
              setTotal(fromCurva.reduce((s, t) => s + Number(t.cantidad_real || 0), 0));
              setFuente('curva');
            } else {
              setTallas([]);
              setTotal(0);
            }
          }
        }
      } catch {
        setTallas([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [registroId]);

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
          <div style={{
            fontWeight: 600, fontSize: 15, lineHeight: 1.2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {registro?.modelo_nombre || registro?.modelo_manual?.nombre_modelo || 'Tallas'}
          </div>
          <div style={{
            fontSize: 11, opacity: 0.85, marginTop: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {registro?.n_corte}
            {registro?.curva ? ` · Curva ${registro.curva}` : ''}
            {' · Tallas'}
          </div>
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {tallas.length === 0 ? (
          <>
            <div className="m-card" style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>
              <List size={36} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <p style={{ margin: 0, fontSize: 14 }}>Este corte no tiene tallas registradas.</p>
            </div>
            <Link
              to={`/m/registros/${registroId}/tallas/editar`}
              className="m-btn m-btn-primary"
              style={{ textDecoration: 'none', minHeight: 44 }}
            >
              <Plus size={18} /> Cargar tallas
            </Link>
          </>
        ) : (
          <>
            {/* Totales arriba */}
            <div className="m-card" style={{
              background: 'var(--m-brand-soft)', borderColor: 'transparent',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: 'white', color: 'var(--m-brand)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Package size={22} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  Total prendas
                </div>
                <div style={{
                  fontSize: 22, fontWeight: 800, color: 'var(--m-brand)',
                  fontFamily: 'ui-monospace, monospace', lineHeight: 1.1,
                }}>
                  {total.toLocaleString('es-PE')}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                  {tallas.length} talla{tallas.length !== 1 ? 's' : ''}
                </div>
              </div>
            </div>


            {/* Grid de chips por talla */}
            <div className="m-label-xs" style={{ marginTop: 4 }}>Distribución</div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))',
              gap: 8,
            }}>
              {tallas.map(t => (
                <div
                  key={t.talla_id || t.talla_nombre}
                  style={{
                    background: 'white', border: '1px solid #e5e7eb',
                    borderRadius: 12, padding: '10px 8px', textAlign: 'center',
                  }}
                >
                  <div style={{
                    fontSize: 11, color: '#64748b', fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '.05em',
                  }}>
                    {t.talla_nombre}
                  </div>
                  <div style={{
                    fontSize: 20, fontWeight: 800, marginTop: 4,
                    fontFamily: 'ui-monospace, monospace', color: '#0f172a',
                  }}>
                    {Number(t.cantidad_real || 0)}
                  </div>
                  {Number(t.cantidad_modelo || 0) > 0
                    && Number(t.cantidad_modelo) !== Number(t.cantidad_real) && (
                    <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>
                      teor. {Number(t.cantidad_modelo)}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <Link
              to={`/m/registros/${registroId}/tallas/editar`}
              className="m-btn m-btn-outline"
              style={{
                textDecoration: 'none', minHeight: 44,
                borderColor: 'var(--m-brand)', color: 'var(--m-brand)',
                marginTop: 4,
              }}
            >
              <Pencil size={16} /> Editar tallas
            </Link>
          </>
        )}
      </div>
    </>
  );
};

/* ─── Helpers de fallback ─── */

/**
 * registro.tallas viene del JSONB de prod_registros. Puede ser:
 *  - array: [{ talla_id?, talla_nombre|nombre, cantidad }]
 *  - objeto: { S: 10, M: 20, L: 15 } (clave talla, valor cantidad)
 *  - null / undefined
 *
 * Lo normalizamos al shape que usa la pantalla:
 *  { talla_id, talla_nombre, cantidad_real, cantidad_modelo }
 */
function parseTallasJsonb(t) {
  if (!t) return [];

  // Si viene string (caso raro), intentar parse JSON
  if (typeof t === 'string') {
    try { t = JSON.parse(t); } catch { return []; }
  }

  if (Array.isArray(t)) {
    return t
      .filter(Boolean)
      .map((item, idx) => ({
        talla_id: item.talla_id || `idx-${idx}`,
        talla_nombre: item.talla_nombre || item.nombre || item.talla || `T${idx + 1}`,
        cantidad_real: Number(item.cantidad ?? item.cantidad_real ?? 0),
        cantidad_modelo: Number(item.cantidad_modelo ?? item.cantidad ?? 0),
      }))
      .filter(x => x.cantidad_real > 0 || x.cantidad_modelo > 0);
  }

  if (typeof t === 'object') {
    return Object.entries(t)
      .map(([talla, cantidad], idx) => ({
        talla_id: `key-${idx}`,
        talla_nombre: talla,
        cantidad_real: Number(cantidad) || 0,
        cantidad_modelo: 0,
      }))
      .filter(x => x.cantidad_real > 0);
  }

  return [];
}

/**
 * Curva tipo "2-3-3-2-1" → tallas anónimas con esas cantidades
 * (T1, T2, T3...). No sabemos los nombres reales sin la carga, pero al menos
 * mostramos la forma de la curva.
 */
function parseCurva(curva) {
  if (!curva || typeof curva !== 'string') return [];
  const partes = curva.split(/[-/\s,]+/).map(s => Number(s.trim())).filter(n => !isNaN(n) && n >= 0);
  if (partes.length === 0) return [];
  return partes.map((c, i) => ({
    talla_id: `curva-${i}`,
    talla_nombre: `T${i + 1}`,
    cantidad_real: c,
    cantidad_modelo: 0,
  }));
}

export default MobileTallasRegistro;
