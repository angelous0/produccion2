import { useEffect, useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Loader2, DollarSign, FileText, ChevronRight, Check, X,
  AlertTriangle, Receipt, Ban, Calendar, User, Package, Send,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { puede, ACCIONES } from '../utils/permisos';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Cobro de arreglos a proveedores (mockup 34 + 35).
 *
 * Endpoints:
 *   GET  /api/fallados-control?solo_vencidos=true → arreglos con estado_cobro
 *   POST /api/notas-cobro                          → crear nota
 *   GET  /api/notas-cobro                          → listar notas
 *   GET  /api/notas-cobro/:id                      → detalle
 *   POST /api/notas-cobro/:id/anular               → anular
 *   POST /api/arreglos/:id/desmarcar-cobro         → desmarcar
 */
export const MobileCobroArreglos = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const esAdmin = puede(user, ACCIONES.GENERAR_NOTA_COBRO);

  const [tab, setTab] = useState('por_cobrar'); // 'por_cobrar' | 'notas'
  const [arreglos, setArreglos] = useState([]);
  const [notas, setNotas] = useState([]);
  const [loading, setLoading] = useState(true);

  // Para generar nota: selección de arreglos
  const [seleccion, setSeleccion] = useState(new Set());
  const [sheetGenerar, setSheetGenerar] = useState(false);
  const [observacion, setObservacion] = useState('');
  const [enviandoNota, setEnviandoNota] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState('');

  // Para detalle de nota expandida
  const [notaExpandida, setNotaExpandida] = useState(null);
  const [notaDetalle, setNotaDetalle] = useState(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [arrRes, notasRes] = await Promise.all([
        axios.get(`${API}/fallados-control?solo_vencidos=true`),
        axios.get(`${API}/notas-cobro`),
      ]);
      const todasFilas = arrRes.data || [];
      // Solo arreglos individuales (tipo ARREGLO) y solo los marcados o cobrados con persona
      const marcados = todasFilas.filter(f =>
        f.tipo_fila === 'ARREGLO' && f.estado_cobro === 'marcado'
      );
      setArreglos(marcados);
      setNotas(Array.isArray(notasRes.data) ? notasRes.data : []);
    } catch {
      setArreglos([]);
      setNotas([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Agrupar marcados por proveedor (persona_id)
  const gruposPorProveedor = useMemo(() => {
    const m = new Map();
    for (const a of arreglos) {
      const key = a.persona_id || `__sin__${a.servicio_id || 'x'}`;
      const nombre = a.persona || a.servicio || 'Sin proveedor';
      if (!m.has(key)) {
        m.set(key, {
          id: key,
          proveedor: nombre,
          servicio: a.servicio,
          items: [],
          totalPzs: 0,
        });
      }
      const g = m.get(key);
      g.items.push(a);
      g.totalPzs += Number(a.liquidacion || 0); // cobramos lo que fue a liquidación
    }
    return Array.from(m.values()).sort((a, b) => b.totalPzs - a.totalPzs);
  }, [arreglos]);

  // Helpers de selección
  const toggleArreglo = (id) => {
    setSeleccion(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleGrupo = (grupo) => {
    const ids = grupo.items.map(a => a.arreglo_id);
    const todos = ids.every(id => seleccion.has(id));
    setSeleccion(prev => {
      const next = new Set(prev);
      if (todos) ids.forEach(id => next.delete(id));
      else ids.forEach(id => next.add(id));
      return next;
    });
  };

  // Cuando hay selección, derivar info para el sheet
  const seleccionInfo = useMemo(() => {
    const items = arreglos.filter(a => seleccion.has(a.arreglo_id));
    const proveedores = new Set();
    let totalPzs = 0;
    for (const it of items) {
      if (it.persona_id) proveedores.add(it.persona_id);
      totalPzs += Number(it.liquidacion || 0);
    }
    return {
      items,
      proveedoresUnicos: proveedores.size,
      proveedor: items[0]?.persona || items[0]?.servicio || '—',
      proveedor_id: items[0]?.persona_id || null,
      totalPzs,
    };
  }, [seleccion, arreglos]);

  const generarNota = async () => {
    setErrorEnvio('');
    if (seleccion.size === 0) return setErrorEnvio('Selecciona al menos un arreglo.');
    setEnviandoNota(true);
    try {
      const body = {
        arreglo_ids: Array.from(seleccion),
        observacion: observacion.trim() || null,
      };
      // Si hay un solo proveedor único, el backend lo deduce. Si hay varios, mandamos texto.
      if (seleccionInfo.proveedoresUnicos > 1) {
        body.proveedor_nombre = `Mixto (${seleccionInfo.proveedoresUnicos} proveedores)`;
      }
      await axios.post(`${API}/notas-cobro`, body);
      setSheetGenerar(false);
      setSeleccion(new Set());
      setObservacion('');
      await cargar();
      setTab('notas');
    } catch (e) {
      const det = e?.response?.data?.detail || 'Error al generar la nota';
      setErrorEnvio(typeof det === 'string' ? det : String(det));
    } finally {
      setEnviandoNota(false);
    }
  };

  const desmarcar = async (arregloId) => {
    if (!window.confirm('¿Desmarcar este arreglo del cobro?')) return;
    try {
      await axios.post(`${API}/arreglos/${arregloId}/desmarcar-cobro`);
      await cargar();
    } catch { /* silent */ }
  };

  const verDetalleNota = async (nota) => {
    if (notaExpandida === nota.id) {
      setNotaExpandida(null);
      setNotaDetalle(null);
      return;
    }
    setNotaExpandida(nota.id);
    setCargandoDetalle(true);
    try {
      const res = await axios.get(`${API}/notas-cobro/${nota.id}`);
      setNotaDetalle(res.data);
    } catch {
      setNotaDetalle(null);
    } finally {
      setCargandoDetalle(false);
    }
  };

  const anularNota = async (nota) => {
    const motivo = window.prompt(`Motivo para anular la nota ${nota.numero}:`);
    if (motivo === null) return;
    try {
      await axios.post(`${API}/notas-cobro/${nota.id}/anular`, { motivo: motivo || null });
      await cargar();
      setNotaExpandida(null);
    } catch (e) {
      window.alert(e?.response?.data?.detail || 'No se pudo anular');
    }
  };

  if (!esAdmin) {
    return (
      <>
        <div className="m-header">
          <button className="m-h-icon" onClick={() => navigate(-1)}><ArrowLeft size={18} /></button>
          <div style={{ flex: 1, fontWeight: 600 }}>Cobro</div>
        </div>
        <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
          <p style={{ fontSize: 14 }}>Solo admin / supervisor puede gestionar cobros.</p>
        </div>
      </>
    );
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      minHeight: '100vh',
      paddingBottom: tab === 'por_cobrar' && seleccion.size > 0 ? 90 : 0,
    }}>
      <div className="m-header">
        <button className="m-h-icon" onClick={() => navigate(-1)} aria-label="Volver">
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, opacity: 0.85 }}>Calidad</div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>Cobro de arreglos</div>
        </div>
      </div>

      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Tabs */}
        <div style={{
          display: 'flex', background: '#f1f5f9',
          borderRadius: 12, padding: 3, gap: 2,
        }}>
          <TabBtn activo={tab === 'por_cobrar'} onClick={() => setTab('por_cobrar')}>
            Por cobrar
            <Badge n={arreglos.length} activo={tab === 'por_cobrar'} />
          </TabBtn>
          <TabBtn activo={tab === 'notas'} onClick={() => setTab('notas')}>
            Notas
            <Badge n={notas.filter(n => n.estado === 'activa').length} activo={tab === 'notas'} />
          </TabBtn>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <Loader2 className="m-spin" size={24} style={{ color: '#94a3b8' }} />
          </div>
        ) : tab === 'por_cobrar' ? (
          // ───── TAB: Por cobrar ─────
          gruposPorProveedor.length === 0 ? (
            <Empty
              icon={<DollarSign size={32} />}
              titulo="Sin arreglos marcados"
              texto="Marca arreglos desde el flujo de recepción para que aparezcan aquí."
            />
          ) : (
            <>
              {gruposPorProveedor.map(g => {
                const ids = g.items.map(a => a.arreglo_id);
                const todosSel = ids.every(id => seleccion.has(id));
                return (
                  <div key={g.id} className="m-card" style={{ padding: 0, overflow: 'hidden' }}>
                    <button
                      onClick={() => toggleGrupo(g)}
                      style={{
                        width: '100%', padding: 12,
                        background: todosSel ? 'var(--m-brand-soft)' : 'white',
                        border: 0, borderBottom: '1px solid #f1f5f9',
                        display: 'flex', alignItems: 'center', gap: 10,
                        cursor: 'pointer', textAlign: 'left',
                      }}
                    >
                      <div style={{
                        width: 22, height: 22, borderRadius: 5,
                        border: `2px solid ${todosSel ? 'var(--m-brand)' : '#cbd5e1'}`,
                        background: todosSel ? 'var(--m-brand)' : 'white',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        {todosSel && <Check size={14} color="white" />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {g.proveedor}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                          {g.items.length} arreglo{g.items.length !== 1 ? 's' : ''}
                          {g.servicio ? ` · ${g.servicio}` : ''}
                        </div>
                      </div>
                      <div style={{
                        textAlign: 'right', flexShrink: 0,
                      }}>
                        <div style={{
                          fontFamily: 'ui-monospace, monospace', fontWeight: 700,
                          fontSize: 16, color: 'var(--m-brand)',
                        }}>
                          {g.totalPzs}
                        </div>
                        <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>
                          pzs
                        </div>
                      </div>
                    </button>

                    {/* Items del grupo */}
                    {g.items.map(a => {
                      const sel = seleccion.has(a.arreglo_id);
                      return (
                        <div
                          key={a.arreglo_id}
                          style={{
                            padding: '10px 12px 10px 36px',
                            display: 'flex', alignItems: 'center', gap: 10,
                            borderBottom: '1px solid #f8fafc',
                            background: sel ? '#f0fdfa' : 'transparent',
                          }}
                        >
                          <button
                            onClick={() => toggleArreglo(a.arreglo_id)}
                            style={{
                              width: 18, height: 18, borderRadius: 4,
                              border: `2px solid ${sel ? 'var(--m-brand)' : '#cbd5e1'}`,
                              background: sel ? 'var(--m-brand)' : 'white',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              cursor: 'pointer', flexShrink: 0,
                            }}
                          >
                            {sel && <Check size={11} color="white" />}
                          </button>
                          <Link
                            to={`/m/registros/${a.registro_id}`}
                            style={{
                              flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit',
                            }}
                          >
                            <div style={{
                              fontSize: 12, fontWeight: 600,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {a.n_corte} · {a.modelo || '—'}
                            </div>
                            <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>
                              {a.liquidacion} pzs liq · vence {a.fecha_limite || '—'}
                              {a.motivo_marcado ? ` · ${a.motivo_marcado}` : ''}
                            </div>
                          </Link>
                          <button
                            onClick={() => desmarcar(a.arreglo_id)}
                            style={{
                              background: 'transparent', border: 0, color: '#94a3b8',
                              cursor: 'pointer', padding: 4,
                            }}
                            aria-label="Desmarcar"
                            title="Desmarcar del cobro"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </>
          )
        ) : (
          // ───── TAB: Notas ─────
          notas.length === 0 ? (
            <Empty
              icon={<FileText size={32} />}
              titulo="Sin notas de cobro"
              texto="Las notas que generes aparecerán acá."
            />
          ) : (
            notas.map(n => (
              <div key={n.id} className="m-card" style={{ padding: 0, overflow: 'hidden' }}>
                <button
                  onClick={() => verDetalleNota(n)}
                  style={{
                    width: '100%', padding: 12,
                    background: 'transparent', border: 0,
                    display: 'flex', alignItems: 'center', gap: 10,
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: 8,
                    background: n.estado === 'anulada' ? '#fee2e2' : '#dbeafe',
                    color: n.estado === 'anulada' ? '#b91c1c' : '#1d4ed8',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {n.estado === 'anulada' ? <Ban size={16} /> : <Receipt size={16} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                    }}>
                      <strong style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13 }}>
                        {n.numero}
                      </strong>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                        background: n.estado === 'anulada' ? '#fee2e2' : '#dcfce7',
                        color: n.estado === 'anulada' ? '#b91c1c' : '#15803d',
                        textTransform: 'uppercase',
                      }}>
                        {n.estado}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {n.proveedor_nombre} · {n.total_lotes} lote{n.total_lotes !== 1 ? 's' : ''} · {n.total_pzs} pzs
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                      {n.fecha} · por {n.created_by_nombre || '—'}
                    </div>
                  </div>
                  {notaExpandida === n.id
                    ? <ChevronUp size={18} style={{ color: '#cbd5e1' }} />
                    : <ChevronDown size={18} style={{ color: '#cbd5e1' }} />}
                </button>

                {notaExpandida === n.id && (
                  <div style={{ borderTop: '1px solid #f1f5f9', padding: 12 }}>
                    {cargandoDetalle ? (
                      <div style={{ padding: 12, textAlign: 'center' }}>
                        <Loader2 className="m-spin" size={20} style={{ color: '#94a3b8' }} />
                      </div>
                    ) : notaDetalle?.lotes?.length > 0 ? (
                      <>
                        <div className="m-label-xs" style={{ marginBottom: 6 }}>
                          Lotes incluidos
                        </div>
                        <div style={{
                          background: '#f8fafc', borderRadius: 8, overflow: 'hidden',
                          marginBottom: 10,
                        }}>
                          {notaDetalle.lotes.map(lt => (
                            <Link
                              key={lt.id}
                              to={`/m/registros/${lt.registro_id || ''}`}
                              style={{
                                display: 'block', padding: '8px 12px',
                                borderBottom: '1px solid #f1f5f9',
                                textDecoration: 'none', color: 'inherit',
                              }}
                            >
                              <div style={{ fontSize: 12, fontWeight: 600 }}>
                                {lt.n_corte} · {lt.modelo || '—'}
                              </div>
                              <div style={{ fontSize: 10, color: '#64748b' }}>
                                {lt.arreglo_cantidad} pzs · {lt.servicio_nombre || '—'} · {lt.persona_nombre || '—'}
                              </div>
                            </Link>
                          ))}
                        </div>
                        {notaDetalle.observacion && (
                          <div style={{
                            background: '#f1f5f9', borderRadius: 8, padding: 8,
                            fontSize: 11, color: '#475569', marginBottom: 10,
                          }}>
                            <strong>Observación: </strong>{notaDetalle.observacion}
                          </div>
                        )}
                        {n.estado === 'activa' && (
                          <button
                            onClick={() => anularNota(n)}
                            className="m-btn m-btn-outline"
                            style={{
                              width: '100%', minHeight: 38, fontSize: 12,
                              borderColor: '#fca5a5', color: '#b91c1c',
                            }}
                          >
                            <Ban size={14} /> Anular nota
                          </button>
                        )}
                      </>
                    ) : (
                      <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: 8 }}>
                        Sin lotes en esta nota.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )
        )}
      </div>

      {/* Footer fijo cuando hay selección en tab Por cobrar */}
      {tab === 'por_cobrar' && seleccion.size > 0 && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: 'white', borderTop: '1px solid #e5e7eb',
          padding: '10px 14px', zIndex: 50,
          display: 'flex', gap: 10, alignItems: 'center',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>
              {seleccion.size} seleccionado{seleccion.size !== 1 ? 's' : ''}
            </div>
            <div style={{ fontSize: 11, color: '#64748b' }}>
              {seleccionInfo.totalPzs} pzs · {seleccionInfo.proveedoresUnicos === 1
                ? seleccionInfo.proveedor
                : `${seleccionInfo.proveedoresUnicos} proveedores`}
            </div>
          </div>
          <button
            onClick={() => setSheetGenerar(true)}
            className="m-btn m-btn-primary"
            style={{ minHeight: 44, padding: '0 16px' }}
          >
            <Receipt size={16} /> Generar nota
          </button>
        </div>
      )}

      {/* Bottom sheet: confirmar generación de nota */}
      {sheetGenerar && createPortal(
        <div
          onClick={() => setSheetGenerar(false)}
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
              maxHeight: '90vh',
              display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{ width: 40, height: 4, background: '#cbd5e1', borderRadius: 2, margin: '0 auto 12px' }} />

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 17 }}>Generar nota de cobro</div>
              <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                {seleccion.size} arreglo{seleccion.size !== 1 ? 's' : ''}
                {' · '}{seleccionInfo.totalPzs} pzs
              </div>
            </div>

            {/* Resumen */}
            <div className="m-card" style={{ background: '#f8fafc', padding: 12, marginBottom: 14 }}>
              <Row icon={<User size={14} />} label="Proveedor" value={
                seleccionInfo.proveedoresUnicos === 1
                  ? seleccionInfo.proveedor
                  : `Mixto (${seleccionInfo.proveedoresUnicos} proveedores)`
              } />
              <Row icon={<Package size={14} />} label="Total piezas" value={`${seleccionInfo.totalPzs} pzs`} />
              <Row icon={<Calendar size={14} />} label="Fecha" value={new Date().toLocaleDateString('es-PE')} />
            </div>

            <div>
              <span className="m-label-xs">Observación (opcional)</span>
              <textarea
                rows={2}
                className="m-input"
                style={{ padding: 10, marginTop: 8, fontFamily: 'inherit', resize: 'vertical' }}
                placeholder="Notas sobre el cobro..."
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
              />
            </div>

            {errorEnvio && (
              <div style={{
                marginTop: 10,
                background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c',
                borderRadius: 10, padding: 10, fontSize: 12,
                display: 'flex', gap: 8, alignItems: 'flex-start',
              }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{errorEnvio}</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button
                onClick={() => setSheetGenerar(false)}
                className="m-btn m-btn-outline"
                style={{ flex: 1, minHeight: 46 }}
              >
                Cancelar
              </button>
              <button
                onClick={generarNota}
                disabled={enviandoNota}
                className="m-btn m-btn-primary"
                style={{ flex: 1.5, minHeight: 46 }}
              >
                {enviandoNota
                  ? <><Loader2 className="m-spin" size={16} /> Generando...</>
                  : <><Send size={16} /> Generar nota</>}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

/* ──────── Sub-componentes ──────── */
const TabBtn = ({ activo, onClick, children }) => (
  <button
    onClick={onClick}
    style={{
      flex: 1, padding: '8px 10px', border: 0,
      background: activo ? 'white' : 'transparent',
      borderRadius: 8, fontSize: 13, fontWeight: 700,
      color: activo ? 'var(--m-brand)' : '#64748b',
      boxShadow: activo ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
      cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    }}
  >
    {children}
  </button>
);

const Badge = ({ n, activo }) => (
  <span style={{
    background: activo ? 'rgba(15,118,110,0.12)' : '#e5e7eb',
    color: activo ? 'var(--m-brand)' : '#64748b',
    padding: '1px 7px', borderRadius: 999,
    fontSize: 11, fontWeight: 700,
  }}>{n}</span>
);

const Empty = ({ icon, titulo, texto }) => (
  <div className="m-card" style={{
    textAlign: 'center', color: '#64748b', padding: 32,
  }}>
    <div style={{ margin: '0 auto 8px', opacity: 0.3 }}>{icon}</div>
    <div style={{ fontSize: 14, fontWeight: 600 }}>{titulo}</div>
    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{texto}</div>
  </div>
);

const Row = ({ icon, label, value }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '6px 0', fontSize: 13,
  }}>
    <span style={{ color: '#94a3b8' }}>{icon}</span>
    <span style={{ flex: 1, color: '#64748b' }}>{label}</span>
    <strong style={{ color: '#0f172a' }}>{value}</strong>
  </div>
);

export default MobileCobroArreglos;
