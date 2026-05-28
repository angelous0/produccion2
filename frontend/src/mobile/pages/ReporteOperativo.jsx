import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Loader2, Search, Users, Filter, AlertTriangle, Package,
  ChevronRight, ChevronDown, RefreshCw, ListChecks, FileWarning, Clock,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const LS_KEY = 'm_reporte_operativo_v1';

const DEFAULT_FILTROS = {
  servicio: 'Costura',
  vista: 'agrupado',     // 'agrupado' | 'plano'
  terminados: 'en_curso',// 'en_curso' | 'todos'
  riesgo: '__all__',     // __all__ | vencido | critico | atencion | normal
  tipoPersona: '__all__',// __all__ | INTERNO | EXTERNO
  conIncidencias: false,
  sinActualizar: false,
};

// Los nombres de servicios coinciden con prod_servicios_produccion.nombre
// (canónico SIN TILDES). Si el usuario quiere ver "Lavandería" con tilde
// en el chip, cambiar solo el label visible, no el filtro.
const SERVICIOS = ['Costura', 'Estampado', 'Bordado', 'Acabado', 'Lavanderia'];

const RIESGO_COLOR = {
  vencido:  { bg: '#27272a', text: '#fff',    border: '#27272a', dot: '#27272a' },
  critico:  { bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5', dot: '#ef4444' },
  atencion: { bg: '#fef3c7', text: '#b45309', border: '#fcd34d', dot: '#f59e0b' },
  normal:   { bg: '#dcfce7', text: '#15803d', border: '#86efac', dot: '#22c55e' },
};

const cargarFiltros = () => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_FILTROS;
    return { ...DEFAULT_FILTROS, ...JSON.parse(raw) };
  } catch { return DEFAULT_FILTROS; }
};

export const MobileReporteOperativo = () => {
  const navigate = useNavigate();
  const [filtros, setFiltros] = useState(cargarFiltros);
  const [search, setSearch] = useState('');
  const [searchDeb, setSearchDeb] = useState('');
  const [data, setData] = useState({ kpis: {}, items: [] });
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [expand, setExpand] = useState({}); // persona_id → bool

  // Persistir filtros
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(filtros)); } catch {}
  }, [filtros]);

  // Debounce búsqueda
  useEffect(() => {
    const t = setTimeout(() => setSearchDeb(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch
  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        servicio_nombre: filtros.servicio,
        incluir_terminados: filtros.terminados === 'todos' ? 'true' : 'false',
      });
      if (filtros.riesgo !== '__all__') params.set('riesgo', filtros.riesgo);
      if (filtros.conIncidencias) params.set('con_incidencias', 'true');
      if (filtros.sinActualizar) params.set('sin_actualizar', 'true');
      const res = await axios.get(`${API}/reportes-produccion/costura?${params}`);
      setData(res.data || { kpis: {}, items: [] });
    } catch (e) {
      setData({ kpis: {}, items: [] });
    } finally {
      setLoading(false);
    }
  }, [filtros.servicio, filtros.terminados, filtros.riesgo, filtros.conIncidencias, filtros.sinActualizar]);

  useEffect(() => { cargar(); }, [cargar]);

  // Filtrar por búsqueda + tipo persona (en cliente)
  const items = useMemo(() => {
    let arr = data.items || [];
    if (filtros.tipoPersona !== '__all__') {
      arr = arr.filter(i => i.persona_tipo === filtros.tipoPersona);
    }
    if (searchDeb) {
      const q = searchDeb.toLowerCase();
      arr = arr.filter(i =>
        (i.n_corte || '').toLowerCase().includes(q) ||
        (i.modelo_nombre || '').toLowerCase().includes(q) ||
        (i.tipo_nombre || '').toLowerCase().includes(q) ||
        (i.entalle_nombre || '').toLowerCase().includes(q) ||
        (i.tela_nombre || '').toLowerCase().includes(q) ||
        (i.persona_nombre || '').toLowerCase().includes(q)
      );
    }
    return arr;
  }, [data.items, filtros.tipoPersona, searchDeb]);

  // Agrupar por persona
  const grupos = useMemo(() => {
    const map = {};
    for (const it of items) {
      const pid = it.persona_id;
      if (!map[pid]) {
        map[pid] = {
          persona_id: pid,
          persona_nombre: it.persona_nombre,
          persona_tipo: it.persona_tipo,
          items: [],
          total_prendas: 0,
          total_vencidos: 0,
          total_criticos: 0,
          total_atencion: 0,
          total_incidencias: 0,
          avance_sum: 0,
          avance_count: 0,
        };
      }
      const g = map[pid];
      g.items.push(it);
      g.total_prendas += it.cantidad_enviada || 0;
      if (it.nivel_riesgo === 'vencido')  g.total_vencidos++;
      if (it.nivel_riesgo === 'critico')  g.total_criticos++;
      if (it.nivel_riesgo === 'atencion') g.total_atencion++;
      g.total_incidencias += it.incidencias_abiertas || 0;
      if (it.avance_porcentaje != null) { g.avance_sum += it.avance_porcentaje; g.avance_count++; }
    }
    const arr = Object.values(map).sort((a, b) =>
      (b.total_vencidos + b.total_criticos) - (a.total_vencidos + a.total_criticos) ||
      a.persona_nombre.localeCompare(b.persona_nombre)
    );
    for (const g of arr) {
      g.items.sort((a, b) => {
        const orden = { vencido: 0, critico: 1, atencion: 2, normal: 3 };
        return (orden[a.nivel_riesgo] ?? 4) - (orden[b.nivel_riesgo] ?? 4);
      });
      g.avance_prom = g.avance_count ? Math.round(g.avance_sum / g.avance_count) : null;
    }
    return arr;
  }, [items]);

  // Lista plana ordenada por riesgo
  const planos = useMemo(() => {
    const orden = { vencido: 0, critico: 1, atencion: 2, normal: 3 };
    return [...items].sort((a, b) =>
      (orden[a.nivel_riesgo] ?? 4) - (orden[b.nivel_riesgo] ?? 4) ||
      (b.dias_transcurridos ?? -1) - (a.dias_transcurridos ?? -1)
    );
  }, [items]);

  const kpis = data.kpis || {};
  const totalFiltrosActivos =
    (filtros.riesgo !== '__all__' ? 1 : 0) +
    (filtros.tipoPersona !== '__all__' ? 1 : 0) +
    (filtros.terminados !== 'en_curso' ? 1 : 0) +
    (filtros.conIncidencias ? 1 : 0) +
    (filtros.sinActualizar ? 1 : 0);

  return (
    <>
      <div className="m-header">
        <button className="m-h-icon" onClick={() => navigate(-1)} aria-label="Volver">
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, opacity: 0.85 }}>Reporte Operativo</div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>
            {filtros.servicio}
            {!loading && filtros.vista === 'agrupado' && ` · ${grupos.length} personas`}
            {!loading && filtros.vista === 'plano' && ` · ${items.length} cortes`}
          </div>
        </div>
        <button className="m-h-icon" onClick={cargar} aria-label="Recargar">
          <RefreshCw size={18} />
        </button>
      </div>

      {/* Chips de servicio · sticky */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 5,
        background: '#fff', borderBottom: '1px solid #e5e7eb',
        padding: '10px 12px 8px',
      }}>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
          {SERVICIOS.map(s => (
            <button
              key={s}
              onClick={() => setFiltros(f => ({ ...f, servicio: s }))}
              className={`m-chip ${filtros.servicio === s ? 'active' : ''}`}
              style={{ fontSize: 12, minHeight: 32, whiteSpace: 'nowrap' }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* KPIs · 4+3 · los KPIs accionables filtran al tocar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          <Kpi value={kpis.costureros_activos || 0} label="Personas" />
          <Kpi value={kpis.registros_activos || 0} label="Registros" />
          <Kpi
            value={kpis.registros_vencidos || 0}
            label="Vencidos"
            dark={(kpis.registros_vencidos || 0) > 0}
            active={filtros.riesgo === 'vencido'}
            onClick={() => setFiltros(f => ({ ...f, riesgo: f.riesgo === 'vencido' ? '__all__' : 'vencido' }))}
          />
          <Kpi
            value={kpis.registros_criticos || 0}
            label="Críticos"
            danger={(kpis.registros_criticos || 0) > 0}
            active={filtros.riesgo === 'critico'}
            onClick={() => setFiltros(f => ({ ...f, riesgo: f.riesgo === 'critico' ? '__all__' : 'critico' }))}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          <Kpi
            value={kpis.registros_sin_actualizar || 0}
            label="Sin actual."
            warn={(kpis.registros_sin_actualizar || 0) > 0}
            active={filtros.sinActualizar}
            onClick={() => setFiltros(f => ({ ...f, sinActualizar: !f.sinActualizar }))}
          />
          <Kpi
            value={kpis.incidencias_abiertas || 0}
            label="Incidencias"
            orange={(kpis.incidencias_abiertas || 0) > 0}
            active={filtros.conIncidencias}
            onClick={() => setFiltros(f => ({ ...f, conIncidencias: !f.conIncidencias }))}
          />
          <Kpi value={(kpis.total_prendas || 0).toLocaleString()} label="Prendas" />
        </div>

        {/* Toggles + Filtros */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <ToggleSlider
            value={filtros.terminados}
            options={[{ k: 'en_curso', l: 'En curso' }, { k: 'todos', l: 'Todos' }]}
            onChange={(v) => setFiltros(f => ({ ...f, terminados: v }))}
            flex
          />
          <ToggleSlider
            value={filtros.vista}
            options={[{ k: 'agrupado', l: '👥' }, { k: 'plano', l: '≡' }]}
            onChange={(v) => setFiltros(f => ({ ...f, vista: v }))}
          />
          <button
            onClick={() => setSheetOpen(true)}
            className="m-btn"
            style={{ position: 'relative', fontSize: 11, padding: '6px 10px', minHeight: 32, display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <Filter size={14} />
            Filtros
            {totalFiltrosActivos > 0 && (
              <span style={{
                position: 'absolute', top: -6, right: -6,
                background: '#ef4444', color: '#fff', fontSize: 9, fontWeight: 700,
                borderRadius: 999, width: 16, height: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{totalFiltrosActivos}</span>
            )}
          </button>
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
            placeholder="Buscar persona, corte, modelo…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Contenido */}
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <Loader2 className="m-spin" size={24} style={{ color: '#94a3b8' }} />
          </div>
        ) : items.length === 0 ? (
          <EmptyState filtros={filtros} searchDeb={searchDeb} />
        ) : filtros.vista === 'agrupado' ? (
          <ListaAgrupada
            grupos={grupos}
            expand={expand}
            setExpand={setExpand}
            servicio={filtros.servicio}
            onNavigateCorte={(it) => navigate(`/m/registros/${it.registro_id}/movimientos/${it.movimiento_id}`)}
            onNavigateRegistro={(it) => navigate(`/m/registros/${it.registro_id}`)}
            onNuevaInc={(it) => navigate(`/m/registros/${it.registro_id}/nueva-incidencia`)}
          />
        ) : (
          <ListaPlana
            items={planos}
            onNavigateCorte={(it) => navigate(`/m/registros/${it.registro_id}/movimientos/${it.movimiento_id}`)}
          />
        )}
      </div>

      {/* Bottom sheet de filtros */}
      {sheetOpen && (
        <FiltrosSheet
          filtros={filtros}
          setFiltros={setFiltros}
          totalCortes={items.length}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </>
  );
};

/* ──────────────────── Sub-componentes ──────────────────── */

const Kpi = ({ value, label, dark, danger, warn, orange, onClick, active }) => {
  let bg = '#fff', color = '#0f172a', border = '#e5e7eb', labelColor = '#64748b';
  if (dark)   { bg = '#18181b'; color = '#fff';    border = '#18181b'; labelColor = '#a1a1aa'; }
  if (danger) { bg = '#fef2f2'; color = '#b91c1c'; border = '#fecaca'; labelColor = '#b91c1c'; }
  if (warn)   { bg = '#fef3c7'; color = '#b45309'; border = '#fcd34d'; labelColor = '#b45309'; }
  if (orange) { bg = '#ffedd5'; color = '#c2410c'; border = '#fdba74'; labelColor = '#c2410c'; }

  const clickable = !!onClick;

  const content = (
    <>
      <div style={{
        fontFamily: 'ui-monospace, monospace', fontWeight: 800,
        fontSize: 16, lineHeight: 1, color,
      }}>
        {value}
      </div>
      <div style={{
        fontSize: 8.5, color: labelColor, textTransform: 'uppercase',
        fontWeight: 700, letterSpacing: '.03em', marginTop: 4,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
      }}>
        {label}
        {active && (
          <span style={{
            display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
            background: dark ? '#fff' : '#0f766e',
          }} />
        )}
      </div>
    </>
  );

  const baseStyle = {
    background: bg,
    border: active ? '2px solid #0f766e' : `1px solid ${border}`,
    borderRadius: 10,
    padding: active ? '6px 3px' : '7px 4px',
    textAlign: 'center',
    boxShadow: active ? '0 0 0 3px rgba(15,118,110,.15)' : 'none',
    transition: 'box-shadow .15s',
  };

  if (!clickable) {
    return <div style={baseStyle}>{content}</div>;
  }

  return (
    <button
      onClick={onClick}
      type="button"
      style={{
        ...baseStyle,
        cursor: 'pointer',
        font: 'inherit',
        WebkitAppearance: 'none',
        appearance: 'none',
      }}
    >
      {content}
    </button>
  );
};

const ToggleSlider = ({ value, options, onChange, flex }) => (
  <div style={{
    display: 'flex', background: '#e2e8f0', borderRadius: 8, padding: 2,
    fontSize: 11, fontWeight: 600, ...(flex ? { flex: 1 } : {}),
  }}>
    {options.map(o => (
      <button
        key={o.k}
        onClick={() => onChange(o.k)}
        style={{
          flex: 1, padding: '4px 8px', borderRadius: 6, border: 'none',
          cursor: 'pointer',
          background: value === o.k ? '#fff' : 'transparent',
          color: value === o.k ? '#0f172a' : '#64748b',
          boxShadow: value === o.k ? '0 1px 2px rgba(0,0,0,.06)' : 'none',
        }}
      >
        {o.l}
      </button>
    ))}
  </div>
);

const EmptyState = ({ filtros, searchDeb }) => (
  <div className="m-card" style={{ textAlign: 'center', color: '#64748b', padding: 30 }}>
    <ListChecks size={32} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
    <p style={{ fontSize: 13, margin: 0, fontWeight: 600 }}>
      {searchDeb ? `Sin resultados para "${searchDeb}"` : `Sin actividad en ${filtros.servicio}`}
    </p>
    <p style={{ fontSize: 11, margin: '6px 0 0', color: '#94a3b8' }}>
      Cambia el servicio o ajustá los filtros.
    </p>
  </div>
);

/* ──────────────────── Lista agrupada por persona ──────────────────── */

const ListaAgrupada = ({ grupos, expand, setExpand, servicio, onNavigateCorte, onNavigateRegistro, onNuevaInc }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{
        fontSize: 10, color: '#64748b', textTransform: 'uppercase',
        fontWeight: 700, letterSpacing: '.04em', padding: '0 4px',
      }}>
        Personas · ordenadas por riesgo
      </div>
      {grupos.map(g => {
        const isOpen = !!expand[g.persona_id];
        const conRiesgo = g.total_vencidos + g.total_criticos + g.total_atencion;
        return (
          <div key={g.persona_id} className="m-card" style={{ padding: 0, overflow: 'hidden' }}>
            <button
              onClick={() => setExpand(e => ({ ...e, [g.persona_id]: !e[g.persona_id] }))}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: 12, background: 'transparent', border: 'none',
                cursor: 'pointer', textAlign: 'left',
              }}
            >
              <PersonaAvatar nombre={g.persona_nombre} tieneRiesgo={conRiesgo > 0} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>
                    {g.persona_nombre}
                  </span>
                  <span className={`m-pill ${g.persona_tipo === 'INTERNO' ? 'm-pill-blue' : 'm-pill-gray'}`} style={{ fontSize: 9 }}>
                    {g.persona_tipo === 'INTERNO' ? 'INT' : 'EXT'}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                  {g.items.length} corte{g.items.length === 1 ? '' : 's'} · {g.total_prendas} prendas
                  {g.avance_prom != null && ` · ${g.avance_prom}% prom.`}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                  {g.total_vencidos > 0 && (
                    <span className="m-pill" style={{ background: '#18181b', color: '#fff', fontSize: 9 }}>
                      {g.total_vencidos} venc.
                    </span>
                  )}
                  {g.total_criticos > 0 && (
                    <span className="m-pill m-pill-red" style={{ fontSize: 9 }}>
                      {g.total_criticos} crít.
                    </span>
                  )}
                  {g.total_atencion > 0 && (
                    <span className="m-pill m-pill-amber" style={{ fontSize: 9 }}>
                      {g.total_atencion} atn.
                    </span>
                  )}
                  {g.total_incidencias > 0 && (
                    <span className="m-pill" style={{ background: '#ffedd5', color: '#c2410c', fontSize: 9 }}>
                      {g.total_incidencias} inc.
                    </span>
                  )}
                  {conRiesgo === 0 && g.total_incidencias === 0 && (
                    <span className="m-pill m-pill-green" style={{ fontSize: 9 }}>Al día</span>
                  )}
                </div>
              </div>
              {isOpen ? <ChevronDown size={16} color="#94a3b8" /> : <ChevronRight size={16} color="#94a3b8" />}
            </button>

            {isOpen && (
              <div style={{
                borderTop: '1px solid #f1f5f9',
                background: '#f8fafc',
                padding: 10,
                display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                {g.items.map(it => (
                  <CorteCard
                    key={it.movimiento_id}
                    it={it}
                    servicio={servicio}
                    onNavigateCorte={() => onNavigateCorte(it)}
                    onNavigateRegistro={() => onNavigateRegistro(it)}
                    onNuevaInc={() => onNuevaInc(it)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const PersonaAvatar = ({ nombre, tieneRiesgo }) => {
  const ini = (nombre || '?').split(' ').filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase();
  return (
    <div style={{
      width: 36, height: 36, borderRadius: '50%',
      background: tieneRiesgo ? '#18181b' : '#0f766e',
      color: '#fff', fontWeight: 700, fontSize: 13,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      {ini}
    </div>
  );
};

/* ──────────────────── Card de un corte ──────────────────── */

const CorteCard = ({ it, servicio, onNavigateCorte, onNavigateRegistro, onNuevaInc }) => {
  const riesgo = it.nivel_riesgo || 'normal';
  const color = RIESGO_COLOR[riesgo];
  const avance = it.avance_porcentaje ?? 0;
  const inc = it.incidencias_abiertas || 0;
  const plazo = it.fecha_esperada && it.fecha_inicio
    ? Math.round((new Date(it.fecha_esperada + 'T00:00:00') - new Date(it.fecha_inicio + 'T00:00:00')) / 86400000)
    : null;

  // Estado del corte: ¿está en Costura?
  // Saliendo de Costura hay 2 caminos posibles → mostramos 2 botones de salida
  const esCostura = (servicio || '').toLowerCase() === 'costura';
  const listo = avance >= 100;
  const bloqueado = listo && inc > 0;

  return (
    <div
      style={{
        background: '#fff',
        borderLeft: `4px solid ${color.dot}`,
        border: '1px solid #e5e7eb',
        borderLeftColor: color.dot,
        borderRadius: 10,
        padding: 10,
        ...(listo && !bloqueado ? { boxShadow: '0 0 0 1px #d1fae5' } : {}),
      }}
    >
      {/* Cabecera: corte + badges + cantidad */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
            <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 800, fontSize: 14 }}>
              {it.n_corte}
            </span>
            <span style={{
              padding: '2px 6px', borderRadius: 999, fontSize: 9, fontWeight: 700,
              background: color.bg, color: color.text, border: `1px solid ${color.border}`,
              textTransform: 'uppercase', letterSpacing: '.03em',
            }}>
              {listo ? (bloqueado ? 'Atención' : 'Listo') : riesgo}
            </span>
            {inc > 0 && (
              <span className="m-pill m-pill-red" style={{ fontSize: 9 }}>{inc} INC.</span>
            )}
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {it.modelo_nombre || '—'}
          </div>
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>
            {[it.tipo_nombre, it.entalle_nombre, it.tela_nombre].filter(Boolean).join(' · ')}
          </div>
        </div>
        <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
          {(it.cantidad_enviada || 0).toLocaleString()} prd
        </span>
      </div>

      {/* Barra de avance */}
      <div style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', marginBottom: 2 }}>
          <span>Avance</span>
          <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: '#0f172a' }}>{avance}%</span>
        </div>
        <div style={{ height: 6, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${Math.min(100, Math.max(0, avance))}%`,
            background: color.dot,
          }} />
        </div>
      </div>

      {/* Datos clave */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 8, fontSize: 11 }}>
        <DatoCelda label="Días" value={it.dias_transcurridos != null ? `${it.dias_transcurridos}${plazo ? ` / ${plazo}d` : ''}` : '—'} bold={riesgo === 'vencido'} />
        <DatoCelda label="Sin actual." value={it.dias_sin_actualizar != null ? `${it.dias_sin_actualizar}d` : '—'} warn={(it.dias_sin_actualizar || 0) >= 3} />
        <DatoCelda label="Inc." value={inc > 0 ? `${inc} ab.` : '0'} danger={inc > 0} />
      </div>

      {/* Mensaje de bloqueo si 100% con incidencia */}
      {bloqueado && (
        <div style={{
          marginTop: 8, padding: '6px 8px', borderRadius: 6,
          background: '#fef3c7', border: '1px solid #fcd34d',
          color: '#92400e', fontSize: 11,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <AlertTriangle size={14} />
          <span>Resolvé la incidencia para pasar al siguiente servicio</span>
        </div>
      )}

      {/* Acciones primarias */}
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button
          onClick={onNavigateCorte}
          className="m-btn"
          style={{ flex: 1, fontSize: 11, padding: '6px 8px', minHeight: 30, background: '#0f766e', color: '#fff', borderColor: '#0f766e' }}
        >
          {listo && !bloqueado ? 'Cerrar mov.' : 'Avance'}
        </button>
        <button
          onClick={onNuevaInc}
          className="m-btn"
          style={{ flex: 1, fontSize: 11, padding: '6px 8px', minHeight: 30, background: '#fff', color: '#b91c1c', borderColor: '#fca5a5' }}
        >
          + Inc.
        </button>
        <button
          onClick={onNavigateRegistro}
          className="m-btn"
          style={{ fontSize: 11, padding: '6px 10px', minHeight: 30, background: '#fff', borderColor: '#cbd5e1' }}
          aria-label="Más"
        >
          ⋯
        </button>
      </div>

      {/* Salidas posibles · solo si está en Costura (2 caminos) */}
      {esCostura && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <button
            onClick={onNavigateRegistro}
            disabled={bloqueado}
            className="m-btn"
            style={{
              flex: 1, fontSize: 11, padding: '6px 8px', minHeight: 30,
              ...(listo && !bloqueado
                ? { background: '#059669', color: '#fff', borderColor: '#059669', fontWeight: 700 }
                : { background: '#fff', color: '#0f172a', borderColor: '#cbd5e1' }),
              ...(bloqueado ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
            }}
          >
            → Atraque
          </button>
          <button
            onClick={onNavigateRegistro}
            disabled={bloqueado}
            className="m-btn"
            style={{
              flex: 1, fontSize: 11, padding: '6px 8px', minHeight: 30,
              ...(listo && !bloqueado
                ? { background: '#059669', color: '#fff', borderColor: '#059669', fontWeight: 700 }
                : { background: '#fff', color: '#0f172a', borderColor: '#cbd5e1' }),
              ...(bloqueado ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
            }}
          >
            → Lavandería
          </button>
        </div>
      )}
    </div>
  );
};

const DatoCelda = ({ label, value, bold, warn, danger }) => {
  let color = '#0f172a', bg = '#f1f5f9';
  if (warn)   { color = '#b45309'; }
  if (danger) { color = '#b91c1c'; bg = '#fef2f2'; }
  return (
    <div style={{ background: bg, borderRadius: 6, padding: '4px 6px' }}>
      <div style={{ fontSize: 8.5, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
      <div style={{ fontFamily: 'ui-monospace, monospace', fontWeight: bold ? 800 : 700, color, fontSize: 11 }}>
        {value}
      </div>
    </div>
  );
};

/* ──────────────────── Lista plana ordenada por riesgo ──────────────────── */

const ListaPlana = ({ items, onNavigateCorte }) => {
  // Agrupar por nivel para encabezados de sección
  const secciones = useMemo(() => {
    const map = { vencido: [], critico: [], atencion: [], normal: [] };
    for (const it of items) {
      (map[it.nivel_riesgo] || map.normal).push(it);
    }
    return [
      { key: 'vencido',  label: 'Vencidos',  color: '#27272a', items: map.vencido },
      { key: 'critico',  label: 'Críticos',  color: '#ef4444', items: map.critico },
      { key: 'atencion', label: 'Atención',  color: '#f59e0b', items: map.atencion },
      { key: 'normal',   label: 'Normal',    color: '#22c55e', items: map.normal },
    ].filter(s => s.items.length > 0);
  }, [items]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {secciones.map(s => (
        <div key={s.key}>
          <div style={{
            fontSize: 10, color: s.color, textTransform: 'uppercase',
            fontWeight: 800, letterSpacing: '.04em', padding: '4px 4px 6px',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: s.color }} />
            {s.label} · {s.items.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {s.items.map(it => (
              <button
                key={it.movimiento_id}
                onClick={() => onNavigateCorte(it)}
                className="m-card"
                style={{
                  textAlign: 'left', padding: 10,
                  border: `1px solid ${RIESGO_COLOR[it.nivel_riesgo]?.border || '#e5e7eb'}`,
                  cursor: 'pointer', background: '#fff',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    padding: '2px 6px', borderRadius: 6, fontSize: 10, fontWeight: 800,
                    background: RIESGO_COLOR[it.nivel_riesgo]?.bg,
                    color: RIESGO_COLOR[it.nivel_riesgo]?.text,
                    minWidth: 22, textAlign: 'center',
                  }}>
                    {s.label[0]}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                      <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 800, fontSize: 13 }}>
                        {it.n_corte}
                      </span>
                      <span style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                        · {it.modelo_nombre}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {it.persona_nombre} · {(it.cantidad_enviada || 0).toLocaleString()} prd
                      {it.dias_transcurridos != null && ` · ${it.dias_transcurridos}d`}
                      {it.avance_porcentaje != null && ` · ${it.avance_porcentaje}%`}
                    </div>
                  </div>
                  <ChevronRight size={14} color="#94a3b8" />
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

/* ──────────────────── Bottom sheet de filtros ──────────────────── */

const FiltrosSheet = ({ filtros, setFiltros, totalCortes, onClose }) => {
  const [local, setLocal] = useState(filtros);
  const aplicar = () => { setFiltros(local); onClose(); };
  const limpiar = () => {
    const reset = { ...local, riesgo: '__all__', tipoPersona: '__all__', terminados: 'en_curso', conIncidencias: false, sinActualizar: false };
    setLocal(reset);
  };

  const RIESGOS = [
    { k: '__all__',  l: 'Todos' },
    { k: 'vencido',  l: 'Vencidos' },
    { k: 'critico',  l: 'Críticos' },
    { k: 'atencion', l: 'Atención' },
    { k: 'normal',   l: 'Normal' },
  ];

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)',
      display: 'flex', alignItems: 'flex-end', zIndex: 100,
    }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', background: '#fff',
          borderTopLeftRadius: 16, borderTopRightRadius: 16,
          maxHeight: '85vh', overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 999, background: '#cbd5e1' }} />
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Filtros</div>
            <button
              onClick={limpiar}
              style={{
                background: 'none', border: 'none', color: '#0f766e',
                fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              Limpiar
            </button>
          </div>

          <SeccionFiltro label="Riesgo">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {RIESGOS.map(r => (
                <button
                  key={r.k}
                  onClick={() => setLocal({ ...local, riesgo: r.k })}
                  className={`m-chip ${local.riesgo === r.k ? 'active' : ''}`}
                  style={{ fontSize: 12, minHeight: 32 }}
                >
                  {r.l}
                </button>
              ))}
            </div>
          </SeccionFiltro>

          <SeccionFiltro label="Tipo de persona">
            <div style={{ display: 'flex', gap: 6 }}>
              {[{ k: '__all__', l: 'Todos' }, { k: 'INTERNO', l: 'Internos' }, { k: 'EXTERNO', l: 'Externos' }].map(t => (
                <button
                  key={t.k}
                  onClick={() => setLocal({ ...local, tipoPersona: t.k })}
                  className={`m-chip ${local.tipoPersona === t.k ? 'active' : ''}`}
                  style={{ fontSize: 12, minHeight: 32 }}
                >
                  {t.l}
                </button>
              ))}
            </div>
          </SeccionFiltro>

          <SeccionFiltro label="Estado del corte">
            <div style={{ display: 'flex', gap: 6 }}>
              {[{ k: 'en_curso', l: 'En curso' }, { k: 'todos', l: 'Incluir terminados' }].map(t => (
                <button
                  key={t.k}
                  onClick={() => setLocal({ ...local, terminados: t.k })}
                  className={`m-chip ${local.terminados === t.k ? 'active' : ''}`}
                  style={{ fontSize: 12, minHeight: 32 }}
                >
                  {t.l}
                </button>
              ))}
            </div>
          </SeccionFiltro>

          <SeccionFiltro label="Otros">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Checkbox
                checked={local.conIncidencias}
                onChange={(v) => setLocal({ ...local, conIncidencias: v })}
                label="Solo con incidencias abiertas"
              />
              <Checkbox
                checked={local.sinActualizar}
                onChange={(v) => setLocal({ ...local, sinActualizar: v })}
                label="Sin actualizar ≥ 3 días"
              />
            </div>
          </SeccionFiltro>

          <button
            onClick={aplicar}
            className="m-btn"
            style={{
              width: '100%', marginTop: 20, fontSize: 13, fontWeight: 700,
              background: '#0f766e', color: '#fff', borderColor: '#0f766e',
              padding: '10px 12px', minHeight: 44,
            }}
          >
            Aplicar filtros · {totalCortes} corte{totalCortes === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  );
};

const SeccionFiltro = ({ label, children }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{
      fontSize: 10, color: '#64748b', textTransform: 'uppercase',
      fontWeight: 700, letterSpacing: '.04em', marginBottom: 6,
    }}>
      {label}
    </div>
    {children}
  </div>
);

const Checkbox = ({ checked, onChange, label }) => (
  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      style={{ width: 16, height: 16, accentColor: '#0f766e' }}
    />
    {label}
  </label>
);

export default MobileReporteOperativo;
