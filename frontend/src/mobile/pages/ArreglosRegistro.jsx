import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Loader2, Plus, Package, Clock, AlertCircle,
  Check, AlertTriangle, AlertOctagon, DollarSign, CheckCircle2,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Lista de arreglos del registro.
 * GET /api/fallados/tablero?registro_id=X
 *
 * Acciones por arreglo (solo si tiene arreglo_id):
 *  - Recibir entrega → bottom sheet (SERVICIO o TELA según tipo_arreglo)
 *  - Prórroga       → bottom sheet (solo si vencido/por_vencer)
 *
 * "Sin asignar" se muestra como info (no tiene arreglo_id).
 */
export const MobileArreglosRegistro = () => {
  const { id: registroId } = useParams();
  const navigate = useNavigate();

  const [registro, setRegistro] = useState(null);
  const [tablero, setTablero] = useState(null);
  const [loading, setLoading] = useState(true);

  // Bottom sheets activos
  const [recibir, setRecibir] = useState(null);   // arreglo a recibir
  // Prórroga: ahora navega a /m/registros/:id/arreglos/:arregloId/prorroga (pantalla full)

  const fetchTablero = async () => {
    try {
      const res = await axios.get(`${API}/fallados/tablero?registro_id=${registroId}`);
      setTablero(res.data || null);
    } catch {
      setTablero(null);
    }
  };

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [regRes] = await Promise.all([
          axios.get(`${API}/registros/${registroId}`),
          fetchTablero(),
        ]);
        setRegistro(regRes.data);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [registroId]);

  // KPIs
  const kpis = tablero?.kpis || {};
  const grupos = tablero?.grupos || {};

  // Total general
  const totalDetectados = useMemo(() => {
    const todos = [
      ...(grupos.vencidos || []),
      ...(grupos.por_vencer || []),
      ...(grupos.en_proceso || []),
      ...(grupos.resueltos_hoy || []),
    ];
    return todos.reduce((s, a) => s + Number(a.cantidad || 0), 0)
      + (grupos.sin_asignar || []).reduce((s, a) => s + Number(a.pendiente_sin_asignar || 0), 0);
  }, [grupos]);

  const totalRecuperados = useMemo(() => {
    const todos = [
      ...(grupos.vencidos || []),
      ...(grupos.por_vencer || []),
      ...(grupos.en_proceso || []),
      ...(grupos.resueltos_hoy || []),
    ];
    return todos.reduce((s, a) => s + Number(a.cantidad_recuperada || 0), 0);
  }, [grupos]);

  const totalPendientes = useMemo(() => {
    const todos = [
      ...(grupos.vencidos || []),
      ...(grupos.por_vencer || []),
      ...(grupos.en_proceso || []),
    ];
    return todos.reduce((s, a) => s + Number(a.pendiente || 0), 0)
      + (grupos.sin_asignar || []).reduce((s, a) => s + Number(a.pendiente_sin_asignar || 0), 0);
  }, [grupos]);

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
            {registro?.modelo_nombre || registro?.modelo_manual?.nombre_modelo || 'Arreglos'}
          </div>
          <div style={{
            fontSize: 11, opacity: 0.85, marginTop: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {registro?.n_corte}
            {registro?.estado && <> · {registro.estado}</>}
            {' · Arreglos'}
          </div>
        </div>
      </div>

      {/* KPIs en grid 2x2 */}
      <div style={{
        padding: 16, background: '#f1f5f9',
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
      }}>
        <KPICard color="#a855f7" textColor="#7e22ce" num={kpis.sin_asignar?.n_arreglos ?? 0}
          label="Sin asignar" sub={`${kpis.sin_asignar?.prendas ?? 0} pzs`} />
        <KPICard color="#ef4444" textColor="#b91c1c" num={kpis.vencidos?.n_arreglos ?? 0}
          label="Vencidos" sub={`${kpis.vencidos?.prendas ?? 0} pzs`} />
        <KPICard color="#f59e0b" textColor="#b45309" num={kpis.por_vencer?.n_arreglos ?? 0}
          label="Por vencer" sub={`${kpis.por_vencer?.prendas ?? 0} pzs`} />
        <KPICard color="#3b82f6" textColor="#1d4ed8" num={kpis.en_proceso?.n_arreglos ?? 0}
          label="En proceso" sub={`${kpis.en_proceso?.prendas ?? 0} pzs`} />
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Link
          to={`/m/registros/${registroId}/nuevo-fallado`}
          className="m-btn m-btn-primary"
          style={{ textDecoration: 'none' }}
        >
          <Plus size={18} /> Marcar fallado
        </Link>

        {/* Vencidos */}
        <GrupoArreglos
          titulo="🔴 Vencido"
          color="#b91c1c"
          arreglos={grupos.vencidos || []}
          onRecibir={(a) => setRecibir(a)}
          onProrrogar={(a) => navigate(`/m/registros/${registroId}/arreglos/${a.arreglo_id}/prorroga`)}
          variante="vencido"
        />

        {/* Por vencer */}
        <GrupoArreglos
          titulo="🟡 Por vencer"
          color="#b45309"
          arreglos={grupos.por_vencer || []}
          onRecibir={(a) => setRecibir(a)}
          onProrrogar={(a) => navigate(`/m/registros/${registroId}/arreglos/${a.arreglo_id}/prorroga`)}
          variante="por_vencer"
        />

        {/* En proceso */}
        <GrupoArreglos
          titulo="🔵 En proceso"
          color="#1d4ed8"
          arreglos={grupos.en_proceso || []}
          onRecibir={(a) => setRecibir(a)}
          onProrrogar={null}
          variante="en_proceso"
        />

        {/* Sin asignar (TELA pura sin arreglo) */}
        {(grupos.sin_asignar || []).length > 0 && (
          <GrupoSinAsignar items={grupos.sin_asignar} registroId={registroId} />
        )}

        {/* Empty state */}
        {(grupos.vencidos?.length || 0) +
         (grupos.por_vencer?.length || 0) +
         (grupos.en_proceso?.length || 0) +
         (grupos.sin_asignar?.length || 0) === 0 && (
          <div className="m-card" style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>
            <Package size={36} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
            <p style={{ margin: 0, fontSize: 14 }}>
              No hay arreglos activos en este corte.<br/>
              Toca <strong>Marcar fallado</strong> para crear el primero.
            </p>
          </div>
        )}

        {/* Totales al pie */}
        {totalDetectados > 0 && (
          <div className="m-card" style={{
            background: '#f1f5f9',
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
            textAlign: 'center',
          }}>
            <div>
              <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.04em' }}>Detectados</div>
              <div style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, fontSize: 18, marginTop: 4 }}>{totalDetectados}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.04em' }}>Recuperados</div>
              <div style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, fontSize: 18, color: '#15803d', marginTop: 4 }}>{totalRecuperados}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.04em' }}>Pendientes</div>
              <div style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, fontSize: 18, color: '#b91c1c', marginTop: 4 }}>{totalPendientes}</div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom sheets */}
      {recibir && (
        <RecibirEntregaSheet
          arreglo={recibir}
          onClose={() => setRecibir(null)}
          onGuardado={async () => { setRecibir(null); await fetchTablero(); }}
        />
      )}
      {/* Prórroga ahora vive en pantalla full: /m/registros/:id/arreglos/:arregloId/prorroga */}
    </>
  );
};

/* ──────── KPI Card ──────── */
const KPICard = ({ color, textColor, num, label, sub }) => (
  <div style={{
    background: 'white', borderRadius: 12, padding: 12,
    borderLeft: `4px solid ${color}`,
    display: 'flex', flexDirection: 'column', gap: 4,
  }}>
    <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1, color: textColor }}>{num}</div>
    <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.04em' }}>{label}</div>
    <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'ui-monospace, monospace' }}>{sub}</div>
  </div>
);

/* ──────── Grupo de arreglos ──────── */
const GrupoArreglos = ({ titulo, color, arreglos, onRecibir, onProrrogar, variante }) => {
  if (arreglos.length === 0) return null;
  return (
    <>
      <div className="m-label-xs" style={{ color, marginTop: 4 }}>{titulo}</div>
      {arreglos.map(a => (
        <ArregloCard
          key={a.arreglo_id}
          a={a}
          variante={variante}
          onRecibir={() => onRecibir(a)}
          onProrrogar={onProrrogar ? () => onProrrogar(a) : null}
        />
      ))}
    </>
  );
};

/* ──────── Card de un arreglo ──────── */
const ArregloCard = ({ a, variante, onRecibir, onProrrogar }) => {
  const cfg = {
    vencido:    { border: '#fca5a5', bg: '#fef2f2', headerColor: '#b91c1c', badge: '#dc2626' },
    por_vencer: { border: '#fcd34d', bg: '#fffbeb', headerColor: '#b45309', badge: '#f59e0b' },
    en_proceso: { border: '#e5e7eb', bg: 'white',   headerColor: '#1d4ed8', badge: '#3b82f6' },
  }[variante];

  const fechaTexto = useMemo(() => {
    if (variante === 'vencido') {
      const dias = diasDesde(a.fecha_limite);
      return `Vencido hace ${Math.abs(dias)} día${Math.abs(dias) !== 1 ? 's' : ''} · ${fmtFechaCorta(a.fecha_limite)}`;
    }
    if (variante === 'por_vencer') {
      const dias = diasHasta(a.fecha_limite);
      return dias === 0 ? `Vence hoy · ${fmtFechaCorta(a.fecha_limite)}`
        : dias === 1 ? `Vence mañana · ${fmtFechaCorta(a.fecha_limite)}`
        : `Vence en ${dias} días · ${fmtFechaCorta(a.fecha_limite)}`;
    }
    return `En proceso · vence ${fmtFechaCorta(a.fecha_limite)}`;
  }, [variante, a.fecha_limite]);

  return (
    <div
      className="m-card"
      style={{ borderColor: cfg.border, background: cfg.bg }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: 10, color: cfg.headerColor, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '.04em',
          }}>
            {fechaTexto}
          </div>
          <div style={{ fontWeight: 700, fontSize: 14, marginTop: 4 }}>
            {a.persona || '—'}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
            {a.servicio}
            {a.tipo_arreglo === 'tela' && ' · TELA interno'}
          </div>
          {(a.cobrado || a.marcado_para_cobro) && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              marginTop: 6, padding: '2px 8px', borderRadius: 999,
              fontSize: 10, fontWeight: 700, letterSpacing: '.02em',
              background: a.cobrado ? '#dcfce7' : '#fef3c7',
              color: a.cobrado ? '#15803d' : '#92400e',
              border: `1px solid ${a.cobrado ? '#86efac' : '#fcd34d'}`,
            }}>
              {a.cobrado
                ? <><CheckCircle2 size={11} /> COBRADO</>
                : <><DollarSign size={11} /> MARCADO P/ COBRO</>}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <span style={{
            fontSize: 11, color: 'white', fontWeight: 700,
            padding: '3px 8px', borderRadius: 4, background: cfg.badge,
          }}>
            {a.cantidad_recuperada || 0}/{a.cantidad || 0}
          </span>
          {(a.num_prorrogas || 0) > 0 && (
            <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 4 }}>
              +{a.num_prorrogas} prórroga{a.num_prorrogas !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          className="m-btn m-btn-primary"
          style={{ flex: 1, minHeight: 42, fontSize: 13 }}
          onClick={onRecibir}
        >
          📦 Recibir entrega
        </button>
        {onProrrogar && (a.num_prorrogas || 0) < 2 && (
          <button
            className="m-btn"
            style={{
              minHeight: 42, padding: '0 14px', fontSize: 13,
              background: '#fef3c7', color: '#92400e', fontWeight: 700,
            }}
            onClick={onProrrogar}
          >
            ⏱ Prórroga
          </button>
        )}
      </div>
    </div>
  );
};

/* ──────── Sin asignar (TELA sin arreglo formal) ──────── */
const GrupoSinAsignar = ({ items, registroId }) => (
  <>
    <div className="m-label-xs" style={{ color: '#7e22ce', marginTop: 4 }}>🟣 Sin asignar · TELA</div>
    {items.map((it, i) => (
      <div key={i} className="m-card" style={{ borderColor: '#d8b4fe', background: '#faf5ff' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              fontSize: 10, color: '#7e22ce', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '.04em',
            }}>
              TELA · arreglo interno
            </div>
            <div style={{ fontWeight: 700, fontSize: 14, marginTop: 4 }}>
              {Number(it.pendiente_sin_asignar || 0)} pzs detectadas
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
              Estado EVALUANDO · falta crear arreglo formal
            </div>
          </div>
        </div>
        <Link
          to={`/m/registros/${registroId}/nuevo-fallado`}
          className="m-btn m-btn-outline"
          style={{
            marginTop: 10, width: '100%', textDecoration: 'none',
            borderColor: '#a855f7', color: '#7e22ce', minHeight: 40, fontSize: 13,
          }}
        >
          <AlertCircle size={14} /> Revisar / asignar
        </Link>
      </div>
    ))}
  </>
);

/* ═════════════════════ BOTTOM SHEET: RECIBIR ENTREGA ═════════════════════ */
const RecibirEntregaSheet = ({ arreglo, onClose, onGuardado }) => {
  const esServicio = arreglo.tipo_arreglo === 'servicio' || !!arreglo.servicio;
  const pendiente = Number(arreglo.pendiente || 0);
  const enviada   = Number(arreglo.cantidad || 0);
  const recibido  = Number(arreglo.cantidad_recuperada || 0);
  const liq       = Number(arreglo.cantidad_liquidacion || 0);
  const merma     = Number(arreglo.cantidad_merma || 0);

  const [cantOk, setCantOk] = useState(0);
  const [cantLiquidacion, setCantLiquidacion] = useState(0);
  const [cantLqLeve, setCantLqLeve] = useState(0);
  const [cantLqGrave, setCantLqGrave] = useState(0);
  const [cantNoDevuelto, setCantNoDevuelto] = useState(0);
  const [enviarFacturacion, setEnviarFacturacion] = useState(false);
  const [observacion, setObservacion] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const totalIngresado = esServicio
    ? cantOk + cantLiquidacion + cantNoDevuelto
    : cantOk + cantLqLeve + cantLqGrave + cantNoDevuelto;
  const excede = totalIngresado > pendiente;

  const confirmar = async () => {
    setError('');
    if (totalIngresado === 0) {
      setError('Indica al menos una cantidad mayor a 0');
      return;
    }
    if (excede) {
      setError(`La entrega excede el saldo pendiente (${pendiente})`);
      return;
    }
    setEnviando(true);
    try {
      const body = {
        cant_ok: cantOk,
        cant_no_devuelto: cantNoDevuelto,
        observacion: observacion.trim() || undefined,
      };
      if (esServicio) {
        body.cant_liquidacion = cantLiquidacion;
        body.enviar_a_facturacion = enviarFacturacion && cantLiquidacion > 0;
      } else {
        body.cant_lq_leve = cantLqLeve;
        body.cant_lq_grave = cantLqGrave;
      }
      await axios.post(`${API}/arreglos/${arreglo.arreglo_id}/entregas`, body);
      onGuardado();
    } catch (e) {
      const detail = e?.response?.data?.detail || 'Error al registrar entrega';
      setError(typeof detail === 'string' ? detail : 'Error al registrar entrega');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <SheetShell onClose={onClose}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 17 }}>
          Recibir entrega{!esServicio && ' · TELA'}
        </div>
        <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
          {esServicio
            ? `${arreglo.persona || '—'} · ${arreglo.servicio || '—'}`
            : 'Arreglo interno · sin proveedor'}
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'ui-monospace, monospace', marginTop: 2 }}>
          {arreglo.n_corte}
        </div>
      </div>

      {/* Resumen */}
      <div className="m-card" style={{ background: '#f8fafc', padding: 14, marginBottom: 20 }}>
        {esServicio && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: '#64748b' }}>Enviadas</span>
              <strong style={{ fontFamily: 'ui-monospace, monospace' }}>{enviada}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 6 }}>
              <span style={{ color: '#64748b' }}>Ya recibidas</span>
              <strong style={{ fontFamily: 'ui-monospace, monospace' }}>{recibido}</strong>
            </div>
          </>
        )}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          paddingTop: esServicio ? 10 : 0, marginTop: esServicio ? 8 : 0,
          borderTop: esServicio ? '1px solid #e2e8f0' : 'none',
          fontSize: 14,
        }}>
          <span style={{ fontWeight: 600 }}>Pendiente</span>
          <strong style={{ fontFamily: 'ui-monospace, monospace', color: '#b91c1c' }}>{pendiente}</strong>
        </div>
      </div>

      {/* Steppers */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <StepperRow label="✓ OK (a almacén)" labelColor="#15803d" border="#86efac"
          value={cantOk} onChange={setCantOk} sub="prendas listas" />

        {esServicio ? (
          <StepperRow label="⚠ A liquidación" labelColor="#b45309" border="#fcd34d"
            value={cantLiquidacion} onChange={setCantLiquidacion} sub="prendas con defecto" />
        ) : (
          <>
            <StepperRow label="⚠ LQ Leve" labelColor="#b45309" border="#fcd34d"
              value={cantLqLeve} onChange={setCantLqLeve} sub="defecto menor · descontado" />
            <StepperRow label="⚠⚠ LQ Grave" labelColor="#c2410c" border="#fdba74"
              value={cantLqGrave} onChange={setCantLqGrave} sub="defecto serio · mayor descuento" />
          </>
        )}

        <StepperRow label="✗ No devuelto" labelColor="#64748b" border="#d1d5db"
          value={cantNoDevuelto} onChange={setCantNoDevuelto} sub="se perdieron" />
      </div>

      {/* Checkbox facturación (solo SERVICIO con liquidación > 0) */}
      {esServicio && cantLiquidacion > 0 && (
        <label className="m-card" style={{
          display: 'flex', alignItems: 'flex-start', gap: 12, padding: 14,
          background: '#fef3c7', borderColor: '#fcd34d',
          marginTop: 20, cursor: 'pointer',
        }}>
          <input
            type="checkbox"
            checked={enviarFacturacion}
            onChange={(e) => setEnviarFacturacion(e.target.checked)}
            style={{ width: 22, height: 22, marginTop: 2, accentColor: '#b45309' }}
          />
          <div style={{ fontSize: 12 }}>
            <div style={{ fontWeight: 700, color: '#92400e', fontSize: 13 }}>Enviar a facturación</div>
            <div style={{ color: '#92400e', opacity: 0.85, marginTop: 4, lineHeight: 1.4 }}>
              Marca el arreglo para cobrar a <strong>{arreglo.persona}</strong> la liquidación de
              <strong> {cantLiquidacion} prenda{cantLiquidacion !== 1 ? 's' : ''}</strong>.
              Aparece después en "Marcados para cobro".
            </div>
          </div>
        </label>
      )}

      {/* Aviso TELA */}
      {!esServicio && (
        <div style={{
          background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 12,
          padding: 12, marginTop: 20, display: 'flex', gap: 10,
          fontSize: 12, color: '#475569', lineHeight: 1.5,
        }}>
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            El arreglo de TELA <strong>no usa facturación</strong> (es interno).
            Las LQ van directo al stock de liquidación.
          </span>
        </div>
      )}

      {/* Observación */}
      <div style={{ marginTop: 20 }}>
        <span className="m-label-xs">Observación (opcional)</span>
        <input
          className="m-input"
          style={{ marginTop: 8, fontSize: 14 }}
          placeholder="Ej: 1 pza con costura desviada..."
          value={observacion}
          onChange={(e) => setObservacion(e.target.value)}
        />
      </div>

      {error && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c',
          borderRadius: 12, padding: 12, fontSize: 13,
          display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 12,
        }}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}

      <button
        className="m-btn m-btn-primary"
        style={{ width: '100%', marginTop: 20 }}
        disabled={enviando || totalIngresado === 0 || excede}
        onClick={confirmar}
      >
        {enviando
          ? <><Loader2 className="m-spin" size={18} /> Registrando...</>
          : <><Check size={18} /> Registrar entrega</>}
      </button>
    </SheetShell>
  );
};

/* ═════════════════════ BOTTOM SHEET: PRÓRROGA ═════════════════════ */
const ProrrogaSheet = ({ arreglo, onClose, onGuardado }) => {
  const [dias, setDias] = useState(3);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const fechaActual = arreglo.fecha_limite;
  const fechaOriginal = arreglo.fecha_limite_original || arreglo.fecha_limite;
  const usadas = Number(arreglo.num_prorrogas || 0);
  const restantes = 2 - usadas;
  const vencido = fechaActual && new Date(fechaActual) < startOfToday();
  const nuevaFecha = useMemo(() => sumarDias(fechaActual || hoyISO(), dias), [fechaActual, dias]);

  const confirmar = async () => {
    setError('');
    if (dias < 1 || dias > 14) {
      setError('Días debe estar entre 1 y 14');
      return;
    }
    if (restantes <= 0) {
      setError('Este arreglo ya alcanzó el máximo de 2 prórrogas');
      return;
    }
    setEnviando(true);
    try {
      await axios.post(`${API}/arreglos/${arreglo.arreglo_id}/prorroga`, {
        dias,
        motivo: motivo.trim() || undefined,
      });
      onGuardado();
    } catch (e) {
      const detail = e?.response?.data?.detail || 'Error al otorgar prórroga';
      setError(typeof detail === 'string' ? detail : 'Error al otorgar prórroga');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <SheetShell onClose={onClose}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 17 }}>Otorgar prórroga</div>
        <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
          {arreglo.persona || '—'} · {arreglo.servicio || 'Costura'}
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'ui-monospace, monospace', marginTop: 2 }}>
          {arreglo.n_corte} · {arreglo.pendiente} pendientes
        </div>
      </div>

      {/* Histórico */}
      <div className="m-card" style={{ background: '#f8fafc', padding: 14, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <span style={{ color: '#64748b' }}>Fecha original</span>
          <span style={{ fontFamily: 'ui-monospace, monospace' }}>{fmtFechaLarga(fechaOriginal)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 6 }}>
          <span style={{ color: '#64748b' }}>Fecha límite actual</span>
          <span style={{
            fontFamily: 'ui-monospace, monospace',
            color: vencido ? '#b91c1c' : '#0f172a',
            fontWeight: vencido ? 700 : 500,
          }}>
            {fmtFechaCorta(fechaActual)}{vencido && ' (vencido)'}
          </span>
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          paddingTop: 10, marginTop: 10, borderTop: '1px solid #e2e8f0', fontSize: 13,
        }}>
          <span style={{ color: '#64748b' }}>Prórrogas usadas</span>
          <strong>{usadas} / 2</strong>
        </div>
      </div>

      {/* Días */}
      <div style={{ marginBottom: 20 }}>
        <span className="m-label-xs">Días adicionales (1 a 14)</span>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14, marginTop: 12, justifyContent: 'center',
        }}>
          <div style={{
            display: 'inline-flex', alignItems: 'stretch',
            border: '1px solid #d1d5db', borderRadius: 12, overflow: 'hidden',
            background: 'white',
          }}>
            <button
              onClick={() => setDias(Math.max(1, dias - 1))}
              style={{ width: 48, height: 48, fontSize: 22, fontWeight: 600, background: '#f8fafc', border: 0, cursor: 'pointer' }}
            >−</button>
            <input
              value={dias}
              onChange={(e) => {
                const n = Math.max(1, Math.min(14, Number(e.target.value) || 1));
                setDias(n);
              }}
              style={{
                width: 80, textAlign: 'center', fontSize: 20, fontWeight: 700,
                border: 'none', outline: 'none', fontVariantNumeric: 'tabular-nums',
              }}
            />
            <button
              onClick={() => setDias(Math.min(14, dias + 1))}
              style={{ width: 48, height: 48, fontSize: 22, fontWeight: 600, background: '#f8fafc', border: 0, cursor: 'pointer' }}
            >+</button>
          </div>
          <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.4 }}>
            → nueva fecha<br/>
            <strong style={{ fontFamily: 'ui-monospace, monospace', color: 'var(--m-brand)', fontSize: 14 }}>
              {fmtFechaLarga(nuevaFecha)}
            </strong>
          </div>
        </div>
      </div>

      {/* Atajos */}
      <div style={{ marginBottom: 24 }}>
        <span className="m-label-xs">Atajos</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 8 }}>
          {[1, 3, 7, 14].map(n => (
            <button
              key={n}
              className={`m-chip ${dias === n ? 'active' : ''}`}
              style={{ fontSize: 13, minHeight: 40, padding: '6px 0', justifyContent: 'center' }}
              onClick={() => setDias(n)}
            >+{n}d</button>
          ))}
        </div>
      </div>

      {/* Motivo */}
      <div style={{ marginBottom: 20 }}>
        <span className="m-label-xs">Motivo (opcional)</span>
        <textarea
          rows={2}
          className="m-input"
          style={{ padding: 12, marginTop: 8, fontFamily: 'inherit', resize: 'vertical' }}
          placeholder="Ej: María avisó que terminará el miércoles..."
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />
      </div>

      {error && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c',
          borderRadius: 12, padding: 12, fontSize: 13, marginBottom: 12,
        }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="m-btn m-btn-outline" style={{ flex: 1 }} onClick={onClose}>Cancelar</button>
        <button
          className="m-btn m-btn-primary"
          style={{ flex: 2 }}
          disabled={enviando || restantes <= 0}
          onClick={confirmar}
        >
          {enviando
            ? <><Loader2 className="m-spin" size={18} /> Otorgando...</>
            : 'Otorgar prórroga'}
        </button>
      </div>

      <div style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', marginTop: 14 }}>
        Solo admin / supervisor_acabado puede dar prórroga.
      </div>
    </SheetShell>
  );
};

/* ═════════════════════ Helpers ═════════════════════ */
const SheetShell = ({ children, onClose }) => createPortal(
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
        padding: '12px 20px 24px',
        paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
        maxHeight: '95vh', overflowY: 'auto',
      }}
    >
      <div style={{ width: 40, height: 4, background: '#cbd5e1', borderRadius: 2, margin: '0 auto 16px' }} />
      {children}
    </div>
  </div>,
  document.body
);

const StepperRow = ({ label, labelColor, border, value, onChange, sub }) => (
  <div>
    <span className="m-label-xs" style={{ color: labelColor }}>{label}</span>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
      <div style={{
        display: 'inline-flex', alignItems: 'stretch',
        border: `1px solid ${border}`, borderRadius: 12, overflow: 'hidden',
        background: 'white',
      }}>
        <button
          onClick={() => onChange(Math.max(0, Number(value) - 1))}
          style={{ width: 48, height: 48, fontSize: 22, fontWeight: 600, background: '#f8fafc', border: 0, cursor: 'pointer' }}
        >−</button>
        <input
          type="number" value={value}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          style={{
            width: 80, textAlign: 'center', fontSize: 18, fontWeight: 600,
            border: 'none', outline: 'none', fontVariantNumeric: 'tabular-nums',
          }}
        />
        <button
          onClick={() => onChange(Number(value) + 1)}
          style={{ width: 48, height: 48, fontSize: 22, fontWeight: 600, background: '#f8fafc', border: 0, cursor: 'pointer' }}
        >+</button>
      </div>
      {sub && <span style={{ fontSize: 11, color: '#64748b' }}>{sub}</span>}
    </div>
  </div>
);

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}
function startOfToday() {
  const [y, m, d] = hoyISO().split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function sumarDias(fechaISO, n) {
  const [y, m, d] = (fechaISO || hoyISO()).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + Number(n || 0));
  return date.toISOString().slice(0, 10);
}
function diasHasta(fechaISO) {
  if (!fechaISO) return 0;
  const [y, m, d] = String(fechaISO).slice(0, 10).split('-').map(Number);
  const target = Date.UTC(y, m - 1, d);
  const today = startOfToday().getTime();
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}
function diasDesde(fechaISO) {
  return -diasHasta(fechaISO);
}
function fmtFechaCorta(iso) {
  if (!iso) return '—';
  const s = String(iso);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split('-');
    return `${d}/${m}`;
  }
  return s;
}
function fmtFechaLarga(iso) {
  if (!iso) return '—';
  const s = String(iso);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  return s;
}

export default MobileArreglosRegistro;
