import { useEffect, useState, useMemo, useCallback, Fragment } from 'react';
import axios from 'axios';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { Label } from '../components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '../components/ui/dialog';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Settings2, ChevronRight,
  ExternalLink, Eye, EyeOff, MoveLeft, MoveRight,
  Merge, X, Palette, ArrowDownWideNarrow, ArrowUpWideNarrow,
} from 'lucide-react';

import { formatDate } from '../lib/dateUtils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const STORAGE_KEY = 'matriz-produccion-prefs';
const COL_WIDTHS_KEY = 'matriz-produccion-col-widths';
const VISTA_MODO_KEY = 'matriz-produccion-vista-modo';
const DEFAULT_COL_WIDTHS = { __item: 280, __hilo: 90, __total: 80 };
const MIN_COL_WIDTH = 50;

// Calcula para cada fila qué celdas pintar y con qué rowSpan en cada nivel.
// Asume que las filas ya vienen ordenadas por los niveles.
function computeJerarquiaSpans(filas, levels) {
  const spans = filas.map(() => ({}));
  levels.forEach((_, levelIdx) => {
    const composite = (row) =>
      levels.slice(0, levelIdx + 1).map(l => (row[l] || '__null__')).join('||');
    let i = 0;
    while (i < filas.length) {
      const key = composite(filas[i]);
      let j = i + 1;
      while (j < filas.length && composite(filas[j]) === key) j++;
      spans[i][levels[levelIdx]] = j - i;
      for (let k = i + 1; k < j; k++) spans[k][levels[levelIdx]] = 0;
      i = j;
    }
  });
  return spans;
}
function isOverdue(val) {
  if (!val) return false;
  try { return new Date(val) < new Date(); } catch { return false; }
}

// ── Persistencia ──────────────────────────────────────────────
const getPrefsScope = (rutaId) => rutaId || '__global__';

function readPrefsStore() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!raw) return { version: 2, scopes: {} };
    if (raw.scopes) return { version: 2, scopes: raw.scopes };
    const scope = getPrefsScope(raw.ruta);
    const prefs = { visible: raw.visible, order: raw.order, merged: raw.merged };
    return { version: 2, scopes: { [scope]: prefs, __global__: prefs } };
  } catch {
    return { version: 2, scopes: {} };
  }
}

function loadPrefs(scope) {
  const store = readPrefsStore();
  return store.scopes[scope] || store.scopes.__global__ || null;
}

function savePrefs(scope, prefs) {
  try {
    const store = readPrefsStore();
    store.scopes[scope] = prefs;
    store.scopes.__global__ = prefs;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {}
}

// ── FilterSelect ──────────────────────────────────────────────
const FilterSelect = ({ label, value, onChange, options, testId }) => (
  <div className="flex flex-col gap-1">
    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
    <Select value={value || '_all'} onValueChange={v => onChange(v === '_all' ? '' : v)}>
      <SelectTrigger className="h-8 text-xs w-[150px]" data-testid={testId}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="_all">Todos</SelectItem>
        {options.map(o => <SelectItem key={o.id} value={o.id}>{o.nombre}</SelectItem>)}
      </SelectContent>
    </Select>
  </div>
);

// ── Tabla de colores agregada ──────────────────────────────────
const ColoresTable = ({ registros }) => {
  const coloresData = useMemo(() => {
    const map = {}; // color -> { color_general, cantidad, registros: Set }
    (registros || []).forEach(reg => {
      (reg.colores || []).forEach(c => {
        const key = c.color;
        if (!key) return;
        if (!map[key]) map[key] = { color: key, color_general: c.color_general || '', cantidad: 0, regs: new Set() };
        map[key].cantidad += c.cantidad || 0;
        map[key].regs.add(reg.id);
      });
    });
    // Convertir a array y agrupar por color_general
    const arr = Object.values(map).map(v => ({ ...v, registros: v.regs.size }));
    arr.sort((a, b) => (a.color_general || '').localeCompare(b.color_general || '') || a.color.localeCompare(b.color));
    return arr;
  }, [registros]);

  // Agrupar por color_general para mostrar subtotales
  const grupos = useMemo(() => {
    const g = {};
    coloresData.forEach(c => {
      const cg = c.color_general || 'Sin grupo';
      if (!g[cg]) g[cg] = { colores: [], totalCantidad: 0, totalRegistros: new Set() };
      g[cg].colores.push(c);
      g[cg].totalCantidad += c.cantidad;
      // Unir registros de los sub-colores del grupo
    });
    // Recalcular registros unicos por grupo
    (registros || []).forEach(reg => {
      const regGenerales = new Set();
      (reg.colores || []).forEach(c => regGenerales.add(c.color_general || 'Sin grupo'));
      regGenerales.forEach(cg => { if (g[cg]) g[cg].totalRegistros.add(reg.id); });
    });
    return Object.entries(g).map(([nombre, v]) => ({ nombre, ...v, totalRegistros: v.totalRegistros.size }));
  }, [coloresData, registros]);

  const grandTotal = coloresData.reduce((s, c) => s + c.cantidad, 0);

  if (coloresData.length === 0) return <div className="p-6 text-center text-muted-foreground text-sm">Sin colores registrados</div>;

  return (
    <table className="w-full text-xs border-collapse">
      <thead className="sticky top-0 z-10">
        <tr className="bg-muted/80 backdrop-blur">
          <th className="text-left p-2.5 font-semibold border-b min-w-[140px]">Color General</th>
          <th className="text-left p-2.5 font-semibold border-b min-w-[160px]">Color</th>
          <th className="text-center p-2.5 font-semibold border-b min-w-[100px]">Registros</th>
          <th className="text-right p-2.5 font-semibold border-b min-w-[120px]">Cantidad Total</th>
        </tr>
      </thead>
      <tbody>
        {grupos.map((grupo) => (
          <Fragment key={grupo.nombre}>
            {/* Fila de grupo */}
            <tr className="bg-muted/30 border-b">
              <td className="p-2.5 font-semibold" colSpan={2}>
                <div className="flex items-center gap-2">
                  <Palette className="h-3.5 w-3.5 text-primary" />
                  {grupo.nombre}
                </div>
              </td>
              <td className="p-2.5 text-center font-semibold">{grupo.totalRegistros}</td>
              <td className="p-2.5 text-right font-mono font-semibold">{grupo.totalCantidad.toLocaleString()}</td>
            </tr>
            {/* Filas de colores individuales */}
            {grupo.colores.map(c => (
              <tr key={c.color} className="border-b hover:bg-muted/10">
                <td className="p-2.5 pl-8 text-muted-foreground">↳</td>
                <td className="p-2.5">{c.color}</td>
                <td className="p-2.5 text-center font-mono">{c.registros}</td>
                <td className="p-2.5 text-right font-mono">{c.cantidad.toLocaleString()}</td>
              </tr>
            ))}
          </Fragment>
        ))}
      </tbody>
      <tfoot>
        <tr className="bg-muted/40 font-semibold border-t-2">
          <td className="p-2.5" colSpan={2}>TOTAL</td>
          <td className="p-2.5 text-center font-mono">{(registros || []).filter(r => r.colores?.length > 0).length}</td>
          <td className="p-2.5 text-right font-mono">{grandTotal.toLocaleString()}</td>
        </tr>
      </tfoot>
    </table>
  );
};

// ── DetalleModal (tabla tipo Excel) ────────────────────────────
const DetalleModal = ({ open, onClose, registros, titulo, navigate }) => {
  const [vista, setVista] = useState('registros');

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); setVista('registros'); } }}>
      <DialogContent className="max-w-[98vw] w-[98vw] max-h-[90vh] overflow-hidden p-0" data-testid="detalle-modal">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="text-base">{titulo}</DialogTitle>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{(registros || []).length} registros</p>
            <div className="flex bg-muted rounded-lg p-0.5">
              <button
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${vista === 'registros' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => setVista('registros')}
                data-testid="vista-registros"
              >Registros</button>
              <button
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${vista === 'colores' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => setVista('colores')}
                data-testid="vista-colores"
              >
                <Palette className="h-3 w-3" />
                Colores
              </button>
            </div>
          </div>
        </DialogHeader>
        <div className="overflow-auto max-h-[calc(90vh-100px)] px-1 pb-2">
          {vista === 'colores' ? (
            <ColoresTable registros={registros} />
          ) : (
            <table className="w-full text-xs border-collapse min-w-[900px]">
              <thead className="sticky top-0 z-10">
                <tr className="bg-muted/80 backdrop-blur">
                  <th className="text-left p-2 font-semibold border-b whitespace-nowrap">Corte</th>
                  <th className="text-left p-2 font-semibold border-b whitespace-nowrap">Estado</th>
                  <th className="text-left p-2 font-semibold border-b whitespace-nowrap">Modelo</th>
                  <th className="text-right p-2 font-semibold border-b whitespace-nowrap">Prendas</th>
                  <th className="text-left p-2 font-semibold border-b whitespace-nowrap">Curva</th>
                  <th className="text-left p-2 font-semibold border-b whitespace-nowrap">Hilo Esp.</th>
                  <th className="text-left p-2 font-semibold border-b whitespace-nowrap">Ruta</th>
                  <th className="text-center p-2 font-semibold border-b whitespace-nowrap">Entrega</th>
                  <th className="text-center p-2 font-semibold border-b whitespace-nowrap">Inicio Prod.</th>
                  <th className="text-center p-2 font-semibold border-b whitespace-nowrap">Días</th>
                  <th className="text-left p-2 font-semibold border-b whitespace-nowrap">Últ. Mov</th>
                  <th className="text-right p-2 font-semibold border-b whitespace-nowrap">Dif.</th>
                  <th className="text-center p-2 font-semibold border-b whitespace-nowrap">Info</th>
                  <th className="text-center p-2 font-semibold border-b whitespace-nowrap">Acción</th>
                </tr>
              </thead>
              <tbody>
                {(registros || []).map(d => (
                  <tr key={d.id} className="border-b hover:bg-muted/30 transition-colors" data-testid={`modal-reg-${d.n_corte}`}>
                    <td className="p-2 font-mono font-semibold whitespace-nowrap">{d.n_corte}</td>
                    <td className="p-2"><Badge variant="outline" className="text-[10px] px-1">{d.estado}</Badge></td>
                    <td className="p-2 whitespace-nowrap">{d.modelo}</td>
                    <td className="p-2 text-right font-mono">{d.prendas.toLocaleString()}</td>
                    <td className="p-2 font-mono text-muted-foreground whitespace-nowrap">{d.curva || '-'}</td>
                    <td className="p-2 whitespace-nowrap">{d.hilo_especifico || '-'}</td>
                    <td className="p-2 text-muted-foreground whitespace-nowrap">{d.ruta || '-'}</td>
                    <td className={`p-2 text-center font-mono whitespace-nowrap ${isOverdue(d.fecha_entrega) ? 'text-destructive font-semibold' : ''}`}>
                      {formatDate(d.fecha_entrega)}
                    </td>
                    <td className="p-2 text-center font-mono whitespace-nowrap">{formatDate(d.fecha_inicio_prod)}</td>
                    <td className="p-2 text-center font-mono">{d.dias_proceso > 0 ? `${d.dias_proceso}d` : '-'}</td>
                    <td className="p-2 whitespace-nowrap">
                      {d.ult_mov_servicio ? (
                        <span>{d.ult_mov_servicio} <span className="text-muted-foreground">({formatDate(d.ult_mov_fecha)})</span></span>
                      ) : '-'}
                    </td>
                    <td className="p-2 text-right font-mono">
                      {d.diferencia_acumulada > 0 ? <span className="text-destructive">{d.diferencia_acumulada}</span> : '-'}
                    </td>
                    <td className="p-2 text-center whitespace-nowrap">
                      {d.urgente && <Badge variant="destructive" className="text-[9px] px-1 mr-0.5">URG</Badge>}
                      {d.es_hijo && <Badge variant="secondary" className="text-[9px] px-1">DIV</Badge>}
                    </td>
                    <td className="p-2 text-center whitespace-nowrap">
                      <div className="flex justify-center gap-0.5">
                        <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5" onClick={() => { onClose(); navigate(`/reportes/trazabilidad/${d.id}`); }}>
                          Traza
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { onClose(); navigate(`/registros/editar/${d.id}`); }}>
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(!registros || registros.length === 0) && (
                  <tr><td colSpan={14} className="p-6 text-center text-muted-foreground">Sin registros</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ── Componente principal ──────────────────────────────────────
export const MatrizProduccion = () => {
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    ruta_id: '', marca_id: '', tipo_id: '', entalle_id: '',
    tela_id: '', hilo_id: '', modelo_id: '', estado: '',
    solo_atrasados: false, solo_activos: true, solo_fraccionados: false,
  });
  const [metrica, setMetrica] = useState('registros');
  // Vista 'plana' (item plano por fila) o 'jerarquica' (Marca/Tipo/Entalle/Tela/Hilo con merge vertical)
  const [vistaModo, setVistaModoState] = useState(() => {
    try { return localStorage.getItem(VISTA_MODO_KEY) || 'plana'; } catch { return 'plana'; }
  });
  const setVistaModo = (m) => {
    setVistaModoState(m);
    try { localStorage.setItem(VISTA_MODO_KEY, m); } catch {}
  };
  const [visibleCols, setVisibleCols] = useState(null);
  const [colOrder, setColOrder] = useState(null);
  const [mergedCols, setMergedCols] = useState({}); // { targetCol: [absorbed1, absorbed2] }
  const [totalSort, setTotalSort] = useState('desc'); // desc | asc
  const prefsScope = getPrefsScope(filters.ruta_id);

  // ── Anchos de columna redimensionables (persistidos) ───────────
  const [colWidths, setColWidths] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COL_WIDTHS_KEY));
      return { ...DEFAULT_COL_WIDTHS, ...(saved || {}) };
    } catch { return { ...DEFAULT_COL_WIDTHS }; }
  });

  const getColWidth = (key) => colWidths[key] || (key === '__item' ? 280 : key === '__hilo' ? 90 : key === '__total' ? 80 : 70);

  const startResize = (e, key) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = getColWidth(key);
    const onMove = (ev) => {
      const delta = ev.clientX - startX;
      const newW = Math.max(MIN_COL_WIDTH, startW + delta);
      setColWidths(prev => ({ ...prev, [key]: newW }));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setColWidths(prev => {
        try { localStorage.setItem(COL_WIDTHS_KEY, JSON.stringify(prev)); } catch {}
        return prev;
      });
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Fusión UI state
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSelection, setMergeSelection] = useState([]);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalRegistros, setModalRegistros] = useState([]);
  const [modalTitulo, setModalTitulo] = useState('');

  // ── Fetch ───────────────────────────────────────────────────
  const fetchData = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== '' && v !== false) params.append(k, String(v));
    });
    axios.get(`${API}/reportes-produccion/matriz?${params}`)
      .then(res => {
        setData(res.data);
        const apiCols = res.data.columnas || [];
        const saved = loadPrefs(prefsScope);
        if (saved) {
          const sv = saved.visible?.filter(c => apiCols.includes(c));
          const so = saved.order?.filter(c => apiCols.includes(c));
          const miss = apiCols.filter(c => !so?.includes(c));
          const validMerged = Object.fromEntries(
            Object.entries(saved.merged || {})
              .filter(([target]) => apiCols.includes(target))
              .map(([target, cols]) => [
                target,
                (cols || []).filter(c => apiCols.includes(c)),
              ])
              .filter(([, cols]) => cols.length > 0)
          );
          setVisibleCols(sv?.length ? [...sv, ...miss] : apiCols);
          setColOrder(so?.length ? [...so, ...miss] : apiCols);
          setMergedCols(validMerged);
        } else {
          setVisibleCols(apiCols);
          setColOrder(apiCols);
          setMergedCols({});
        }
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [filters, prefsScope]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Guardar prefs ───────────────────────────────────────────
  useEffect(() => {
    if (visibleCols && colOrder) {
      savePrefs(prefsScope, {
        visible: visibleCols,
        order: colOrder,
        merged: mergedCols,
      });
    }
  }, [visibleCols, colOrder, mergedCols, prefsScope]);

  // ── Columnas efectivas (post-merge) ─────────────────────────
  const allCols = data?.columnas || [];
  const absorbedSet = useMemo(() => {
    const s = new Set();
    Object.values(mergedCols).forEach(arr => arr.forEach(c => s.add(c)));
    return s;
  }, [mergedCols]);

  const effectiveCols = useMemo(() => {
    if (!colOrder || !visibleCols) return allCols.filter(c => !absorbedSet.has(c));
    return colOrder.filter(c => visibleCols.includes(c) && !absorbedSet.has(c));
  }, [colOrder, visibleCols, allCols, absorbedSet]);

  // ── Valor de celda con merge ────────────────────────────────
  const cellVal = useCallback((celdas, col) => {
    let reg = 0, prn = 0;
    const cols = [col, ...(mergedCols[col] || [])];
    cols.forEach(c => {
      const v = celdas?.[c];
      if (v) { reg += v.registros; prn += v.prendas; }
    });
    return metrica === 'prendas' ? prn : reg;
  }, [metrica, mergedCols]);

  const totalVal = useCallback((total) => total ? (metrica === 'prendas' ? total.prendas : total.registros) : 0, [metrica]);

  // ── Totales con merge ───────────────────────────────────────
  const colTotal = useCallback((col) => {
    const cols = [col, ...(mergedCols[col] || [])];
    let reg = 0, prn = 0;
    cols.forEach(c => {
      const t = data?.totales_columna?.[c];
      if (t) { reg += t.registros; prn += t.prendas; }
    });
    return metrica === 'prendas' ? prn : reg;
  }, [data, metrica, mergedCols]);

  // ── Total de fila considerando SOLO las columnas visibles ────────────
  // Cuando el usuario oculta una columna (ej: "Tienda"), los registros que
  // están en ese estado no se cuentan en el total de fila ni en el total
  // general — la "vista" es la fuente de verdad.
  const filaTotalVisible = useCallback((fila) => {
    let reg = 0, prn = 0;
    effectiveCols.forEach(col => {
      const cols = [col, ...(mergedCols[col] || [])];
      cols.forEach(c => {
        const v = fila.celdas?.[c];
        if (v) { reg += v.registros; prn += v.prendas; }
      });
    });
    return metrica === 'prendas' ? prn : reg;
  }, [effectiveCols, mergedCols, metrica]);

  // ── Estadísticas globales sobre lo VISIBLE (badges + total general) ──
  const statsVisibles = useMemo(() => {
    if (!data?.filas) return { items: 0, registros: 0, prendas: 0 };
    let registros = 0, prendas = 0;
    let itemsConVisible = 0;
    data.filas.forEach(fila => {
      let filaTieneVisible = false;
      effectiveCols.forEach(col => {
        const cols = [col, ...(mergedCols[col] || [])];
        cols.forEach(c => {
          const v = fila.celdas?.[c];
          if (v) {
            registros += v.registros;
            prendas += v.prendas;
            filaTieneVisible = true;
          }
        });
      });
      if (filaTieneVisible) itemsConVisible += 1;
    });
    return { items: itemsConVisible, registros, prendas };
  }, [data, effectiveCols, mergedCols]);

  // Total general según métrica seleccionada (registros o prendas), sobre lo visible.
  const totalGeneralVisible = metrica === 'prendas' ? statsVisibles.prendas : statsVisibles.registros;
  const hayColumnasOcultas = (allCols.length - effectiveCols.length - Object.values(mergedCols).flat().length) > 0;

  const persistColumnPrefs = useCallback((next = {}) => {
    savePrefs(prefsScope, {
      visible: next.visible ?? visibleCols ?? [],
      order: next.order ?? colOrder ?? [],
      merged: next.merged ?? mergedCols ?? {},
    });
  }, [prefsScope, visibleCols, colOrder, mergedCols]);

  // Filas ordenadas para vista jerárquica: agrupadas por Marca → Tipo → Entalle → Tela → Hilo.
  // Devuelve además el spans precalculado para los rowSpan de cada nivel.
  const filasJerarquia = useMemo(() => {
    const sorted = [...(data?.filas || [])].sort((a, b) =>
      (a.marca || '').localeCompare(b.marca || '')
      || (a.tipo || '').localeCompare(b.tipo || '')
      || (a.entalle || '').localeCompare(b.entalle || '')
      || (a.tela || '').localeCompare(b.tela || '')
      || (a.hilo || '').localeCompare(b.hilo || '')
    );
    const spans = computeJerarquiaSpans(sorted, ['marca', 'tipo', 'entalle', 'tela']);
    return { filas: sorted, spans };
  }, [data]);

  const filasOrdenadas = useMemo(() => {
    const filas = data?.filas || [];
    if (totalSort === 'none') return filas;

    const groups = new Map();
    filas.forEach((fila, index) => {
      const itemKey = fila.item || `${fila.marca}-${fila.tipo}-${fila.entalle}-${fila.tela}`;
      if (!groups.has(itemKey)) {
        groups.set(itemKey, { itemKey, index, total: 0, filas: [] });
      }
      const group = groups.get(itemKey);
      // Ordenamos por el TOTAL VISIBLE (no el absoluto), así si el usuario
      // oculta columnas, el ranking refleja la vista actual.
      const value = filaTotalVisible(fila);
      group.total += value;
      group.filas.push({ fila, index, value });
    });

    const direction = totalSort === 'desc' ? -1 : 1;
    return Array.from(groups.values())
      .sort((a, b) => {
        const byTotal = (a.total - b.total) * direction;
        if (byTotal !== 0) return byTotal;
        return a.itemKey.localeCompare(b.itemKey);
      })
      .flatMap(group => group.filas
        .sort((a, b) => {
          const byTotal = (a.value - b.value) * direction;
          if (byTotal !== 0) return byTotal;
          return (a.fila.hilo || '').localeCompare(b.fila.hilo || '') || a.index - b.index;
        })
        .map(({ fila }) => fila));
  }, [data, totalSort, filaTotalVisible]);

  // ── Handlers ────────────────────────────────────────────────
  const setFilter = (k, v) => { setFilters(p => ({ ...p, [k]: v })); };
  const clearFilters = () => {
    setFilters({ ruta_id: '', marca_id: '', tipo_id: '', entalle_id: '', tela_id: '', hilo_id: '', modelo_id: '', estado: '', solo_atrasados: false, solo_activos: true, solo_fraccionados: false });
  };
  const showAllColumns = () => {
    setVisibleCols(allCols);
    persistColumnPrefs({ visible: allCols });
  };
  const toggleCol = (c) => setVisibleCols(p => {
    const next = p?.includes(c) ? p.filter(x => x !== c) : [...(p || []), c];
    persistColumnPrefs({ visible: next });
    return next;
  });
  const moveCol = (c, dir) => {
    setColOrder(p => {
      if (!p) return p;
      const i = p.indexOf(c);
      const j = dir === 'left' ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= p.length) return p;
      const a = [...p]; [a[i], a[j]] = [a[j], a[i]];
      persistColumnPrefs({ order: a });
      return a;
    });
  };

  // ── Fusión de columnas ──────────────────────────────────────
  const toggleMergeSelect = (col) => {
    setMergeSelection(prev =>
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    );
  };
  const applyMerge = () => {
    if (mergeSelection.length < 2) return;
    const target = mergeSelection[0]; // primera seleccionada es la que absorbe
    const absorbed = mergeSelection.slice(1);
    setMergedCols(prev => {
      const next = { ...prev };
      // Si el target ya tenía absorbidas, agregar las nuevas
      next[target] = [...(next[target] || []), ...absorbed];
      // Si alguna absorbida era target de otra fusión, mover sus absorbidas al nuevo target
      absorbed.forEach(a => {
        if (next[a]) {
          next[target] = [...next[target], ...next[a]];
          delete next[a];
        }
      });
      persistColumnPrefs({ merged: next });
      return next;
    });
    setMergeSelection([]);
    setMergeMode(false);
  };
  const undoMerge = (target) => {
    setMergedCols(prev => {
      const next = { ...prev };
      delete next[target];
      persistColumnPrefs({ merged: next });
      return next;
    });
  };
  const undoAllMerges = () => {
    setMergedCols({});
    persistColumnPrefs({ merged: {} });
    setMergeSelection([]);
    setMergeMode(false);
  };

  // ── Modal: abrir con registros filtrados ────────────────────
  const openModal = (fila, col) => {
    let regs = fila.detalle || [];
    let titulo = fila.item;
    if (col) {
      // Celda específica: filtrar por estado, incluyendo columnas absorbidas
      const cols = [col, ...(mergedCols[col] || [])];
      regs = regs.filter(r => cols.includes(r.estado));
      titulo = `${fila.item} → ${col}${mergedCols[col]?.length ? ` (+${mergedCols[col].join(', ')})` : ''}`;
    }
    setModalRegistros(regs);
    setModalTitulo(titulo);
    setModalOpen(true);
  };

  const hasActiveFilters = Object.entries(filters).some(([k, v]) => k === 'solo_activos' ? !v : v !== '' && v !== false);
  const hasMerges = Object.keys(mergedCols).length > 0;
  const filtrosDisp = data?.filtros_disponibles || {};

  return (
    <div className="space-y-3" data-testid="matriz-produccion">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/reportes/dashboard')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Matriz de Producción</h2>
          <p className="text-muted-foreground text-sm">Click en una celda o fila para ver detalle completo</p>
        </div>
      </div>

      {/* ── Filtros ──────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap gap-3 items-end">
            <FilterSelect label="Ruta" value={filters.ruta_id} onChange={v => setFilter('ruta_id', v)} options={filtrosDisp.rutas || []} testId="filter-ruta" />
            <FilterSelect label="Marca" value={filters.marca_id} onChange={v => setFilter('marca_id', v)} options={filtrosDisp.marcas || []} testId="filter-marca" />
            <FilterSelect label="Tipo" value={filters.tipo_id} onChange={v => setFilter('tipo_id', v)} options={filtrosDisp.tipos || []} testId="filter-tipo" />
            <FilterSelect label="Entalle" value={filters.entalle_id} onChange={v => setFilter('entalle_id', v)} options={filtrosDisp.entalles || []} testId="filter-entalle" />
            <FilterSelect label="Tela" value={filters.tela_id} onChange={v => setFilter('tela_id', v)} options={filtrosDisp.telas || []} testId="filter-tela" />
            <FilterSelect label="Hilo" value={filters.hilo_id} onChange={v => setFilter('hilo_id', v)} options={filtrosDisp.hilos || []} testId="filter-hilo" />
            <FilterSelect label="Modelo" value={filters.modelo_id} onChange={v => setFilter('modelo_id', v)} options={filtrosDisp.modelos || []} testId="filter-modelo" />
          </div>
          <div className="flex flex-wrap gap-4 mt-3 items-center">
            <div className="flex items-center gap-2">
              <Switch id="solo-activos" checked={filters.solo_activos} onCheckedChange={v => setFilter('solo_activos', v)} />
              <Label htmlFor="solo-activos" className="text-xs">Solo activos</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="solo-atrasados" checked={filters.solo_atrasados} onCheckedChange={v => setFilter('solo_atrasados', v)} />
              <Label htmlFor="solo-atrasados" className="text-xs">Solo atrasados</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="solo-fraccionados" checked={filters.solo_fraccionados} onCheckedChange={v => setFilter('solo_fraccionados', v)} />
              <Label htmlFor="solo-fraccionados" className="text-xs">Solo fraccionados</Label>
            </div>
            {hasActiveFilters && (
              <Button variant="outline" size="sm" className="text-xs h-7" onClick={clearFilters}>Limpiar filtros</Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Toolbar ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {/* Métrica */}
          <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5" data-testid="metrica-toggle">
            <button className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${metrica === 'registros' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`} onClick={() => setMetrica('registros')} data-testid="metrica-registros">Registros</button>
            <button className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${metrica === 'prendas' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`} onClick={() => setMetrica('prendas')} data-testid="metrica-prendas">Prendas</button>
          </div>

          {/* Vista: plana / jerárquica */}
          <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5" data-testid="vista-toggle">
            <button
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${vistaModo === 'plana' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setVistaModo('plana')}
              data-testid="vista-plana"
              title="Una fila por item · hilo"
            >
              Lista plana
            </button>
            <button
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${vistaModo === 'jerarquica' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setVistaModo('jerarquica')}
              data-testid="vista-jerarquica"
              title="Agrupado por Marca / Tipo / Entalle / Tela (estilo árbol)"
            >
              Agrupada
            </button>
          </div>

          {/* Merges activos */}
          {hasMerges && (
            <div className="flex items-center gap-1">
              {Object.entries(mergedCols).map(([target, absorbed]) => (
                <Badge key={target} variant="secondary" className="gap-1 text-[10px] pr-0.5">
                  <Merge className="h-2.5 w-2.5" />
                  {target} +{absorbed.length}
                  <button className="ml-0.5 p-0.5 hover:bg-muted rounded" onClick={() => undoMerge(target)} data-testid={`undo-merge-${target}`}>
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {data && !loading && (
            <div className="flex gap-1.5 text-xs">
              <Badge variant="outline" title={hayColumnasOcultas ? `Sobre las ${effectiveCols.length} columnas visibles. Total general: ${data.filas.length} items` : ''}>
                {statsVisibles.items} items
              </Badge>
              <Badge variant="outline" title={hayColumnasOcultas ? `Sobre las ${effectiveCols.length} columnas visibles. Total general: ${data.total_general.registros} reg` : ''}>
                {statsVisibles.registros.toLocaleString()} reg
              </Badge>
              <Badge variant="outline" title={hayColumnasOcultas ? `Sobre las ${effectiveCols.length} columnas visibles. Total general: ${data.total_general.prendas.toLocaleString()} prn` : ''}>
                {statsVisibles.prendas.toLocaleString()} prn
              </Badge>
              {hayColumnasOcultas && (
                <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50" title="Hay columnas ocultas — los totales reflejan solo las visibles">
                  filtrado
                </Badge>
              )}
            </div>
          )}
          <Badge variant="secondary" className="text-xs">{effectiveCols.length}/{allCols.length} col</Badge>

          {/* Config columnas */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="text-xs h-8 gap-1" data-testid="btn-config-columnas">
                <Settings2 className="h-3.5 w-3.5" /> Columnas
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 max-h-[420px] overflow-y-auto" align="end">
              <div className="space-y-1">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">Configurar columnas</p>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="text-xs h-6" onClick={showAllColumns}>Todas</Button>
                    {hasMerges && <Button variant="ghost" size="sm" className="text-xs h-6 text-destructive" onClick={undoAllMerges}>Deshacer fusiones</Button>}
                  </div>
                </div>

                {/* Modo fusión */}
                <div className="border rounded-md p-2 mb-2 bg-muted/30">
                  {!mergeMode ? (
                    <Button variant="outline" size="sm" className="w-full text-xs h-7 gap-1" onClick={() => setMergeMode(true)} data-testid="btn-start-merge">
                      <Merge className="h-3 w-3" /> Fusionar columnas
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-[10px] text-muted-foreground">Selecciona 2+ columnas. La primera será la que absorbe a las demás.</p>
                      <div className="flex flex-wrap gap-1">
                        {allCols.filter(c => !absorbedSet.has(c)).map(c => (
                          <button
                            key={c}
                            className={`px-2 py-1 rounded text-[10px] border transition-colors ${mergeSelection.includes(c) ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'}`}
                            onClick={() => toggleMergeSelect(c)}
                            data-testid={`merge-sel-${c}`}
                          >
                            {mergeSelection.indexOf(c) === 0 && '★ '}{c}
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" className="text-xs h-6 flex-1" disabled={mergeSelection.length < 2} onClick={applyMerge} data-testid="btn-apply-merge">
                          Fusionar ({mergeSelection.length})
                        </Button>
                        <Button variant="ghost" size="sm" className="text-xs h-6" onClick={() => { setMergeMode(false); setMergeSelection([]); }}>
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Lista de columnas */}
                {(colOrder || allCols).filter(c => !absorbedSet.has(c)).map((col, idx) => {
                  const isVisible = visibleCols?.includes(col);
                  const hasMerge = mergedCols[col]?.length > 0;
                  return (
                    <div key={col} className="flex items-center gap-1.5 py-1 px-1 rounded hover:bg-muted/50 group">
                      <button className="flex-1 text-left text-xs flex items-center gap-1.5" onClick={() => toggleCol(col)} data-testid={`col-toggle-${col}`}>
                        {isVisible ? <Eye className="h-3 w-3 text-primary" /> : <EyeOff className="h-3 w-3 text-muted-foreground" />}
                        <span className={isVisible ? '' : 'text-muted-foreground line-through'}>{col}</span>
                        {hasMerge && <Badge variant="secondary" className="text-[9px] px-1">+{mergedCols[col].length}</Badge>}
                      </button>
                      <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="p-0.5 hover:bg-muted rounded" onClick={() => moveCol(col, 'left')} title="Mover izq"><MoveLeft className="h-3 w-3" /></button>
                        <button className="p-0.5 hover:bg-muted rounded" onClick={() => moveCol(col, 'right')} title="Mover der"><MoveRight className="h-3 w-3" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* ── Matriz ───────────────────────────────────────────── */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Cargando matriz...</div>
          ) : !data || data.filas.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Sin datos para los filtros seleccionados</div>
          ) : (
            <div className="max-h-[calc(100vh-330px)] min-h-[320px] overflow-auto">
              <table className="w-full text-xs border-collapse" data-testid="matriz-table">
                <thead>
                  <tr className="bg-muted/60">
                    {vistaModo === 'jerarquica' ? (
                      <>
                        <th className="text-left p-2 font-semibold sticky top-0 bg-muted z-30 border-r border-b" style={{ width: 130, minWidth: 130 }}>Marca</th>
                        <th className="text-left p-2 font-semibold sticky top-0 bg-muted z-30 border-r border-b" style={{ width: 90, minWidth: 90 }}>Tipo</th>
                        <th className="text-left p-2 font-semibold sticky top-0 bg-muted z-30 border-r border-b" style={{ width: 110, minWidth: 110 }}>Entalle</th>
                        <th className="text-left p-2 font-semibold sticky top-0 bg-muted z-30 border-r border-b" style={{ width: 100, minWidth: 100 }}>Tela</th>
                        <th className="text-left p-2 font-semibold sticky top-0 bg-muted z-30 border-r border-b" style={{ width: 80, minWidth: 80 }}>Hilo</th>
                      </>
                    ) : (
                      <>
                        <th
                          className="text-left p-2.5 font-semibold sticky top-0 left-0 bg-muted z-30 border-r border-b shadow-sm relative"
                          style={{ width: getColWidth('__item'), minWidth: getColWidth('__item'), maxWidth: getColWidth('__item') }}
                        >
                          Item
                          <div
                            className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-primary/40 active:bg-primary/60"
                            onMouseDown={e => startResize(e, '__item')}
                            title="Arrastra para redimensionar"
                          />
                        </th>
                        <th
                          className="text-left p-2.5 font-semibold sticky top-0 bg-muted z-30 border-r border-b shadow-sm relative"
                          style={{ left: getColWidth('__item'), width: getColWidth('__hilo'), minWidth: getColWidth('__hilo'), maxWidth: getColWidth('__hilo') }}
                        >
                          Hilo
                          <div
                            className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-primary/40 active:bg-primary/60"
                            onMouseDown={e => startResize(e, '__hilo')}
                          />
                        </th>
                      </>
                    )}
                    {effectiveCols.map(col => {
                      const w = getColWidth(col);
                      // Auto-ajuste del tamaño de letra según ancho
                      const fontSize = w < 60 ? '9px' : w < 80 ? '10px' : w < 100 ? '11px' : '12px';
                      return (
                        <th
                          key={col}
                          className="text-center p-1.5 font-medium sticky top-0 bg-muted z-20 border-r border-b shadow-sm relative align-middle"
                          style={{ width: w, minWidth: w, maxWidth: w }}
                        >
                          <div
                            className="leading-tight break-words"
                            style={{
                              fontSize,
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              wordBreak: 'break-word',
                            }}
                            title={col}
                          >
                            {col}
                          </div>
                          {mergedCols[col]?.length > 0 && (
                            <div className="text-[9px] text-muted-foreground font-normal truncate" title={mergedCols[col].join(', ')}>+{mergedCols[col].join(', ')}</div>
                          )}
                          <div
                            className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-primary/40 active:bg-primary/60"
                            onMouseDown={e => startResize(e, col)}
                          />
                        </th>
                      );
                    })}
                    <th
                      className="text-center p-2.5 font-semibold sticky top-0 bg-muted z-20 border-b shadow-sm relative"
                      style={{ width: getColWidth('__total'), minWidth: getColWidth('__total'), maxWidth: getColWidth('__total') }}
                    >
                      <button
                        type="button"
                        className="mx-auto inline-flex items-center justify-center gap-1 rounded px-1.5 py-1 text-[11px] uppercase tracking-wider hover:bg-background/70"
                        onClick={() => setTotalSort(prev => prev === 'desc' ? 'asc' : 'desc')}
                        title="Ordenar por total manteniendo juntos los hilos del mismo item"
                        data-testid="sort-total"
                      >
                        Total
                        {totalSort === 'asc' ? (
                          <ArrowUpWideNarrow className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowDownWideNarrow className={`h-3.5 w-3.5 ${totalSort === 'none' ? 'opacity-45' : ''}`} />
                        )}
                      </button>
                      <div
                        className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-primary/40 active:bg-primary/60"
                        onMouseDown={e => startResize(e, '__total')}
                      />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(vistaModo === 'jerarquica' ? filasJerarquia.filas : filasOrdenadas).map((fila, idx) => {
                    const key = `${fila.marca}-${fila.tipo}-${fila.entalle}-${fila.tela}-${fila.hilo}`;
                    const spans = vistaModo === 'jerarquica' ? (filasJerarquia.spans[idx] || {}) : null;
                    return (
                      <tr key={key} className="border-b hover:bg-muted/20 transition-colors" data-testid={`fila-${idx}`}>
                        {vistaModo === 'jerarquica' ? (
                          <>
                            {spans.marca > 0 && (
                              <td className="p-2 align-top border-r font-medium bg-background" style={{ width: 130, minWidth: 130 }} rowSpan={spans.marca}>
                                {fila.marca || '—'}
                              </td>
                            )}
                            {spans.tipo > 0 && (
                              <td className="p-2 align-top border-r bg-background" style={{ width: 90, minWidth: 90 }} rowSpan={spans.tipo}>
                                {fila.tipo || '—'}
                              </td>
                            )}
                            {spans.entalle > 0 && (
                              <td className="p-2 align-top border-r bg-background" style={{ width: 110, minWidth: 110 }} rowSpan={spans.entalle}>
                                {fila.entalle || '—'}
                              </td>
                            )}
                            {spans.tela > 0 && (
                              <td className="p-2 align-top border-r bg-background" style={{ width: 100, minWidth: 100 }} rowSpan={spans.tela}>
                                {fila.tela || '—'}
                              </td>
                            )}
                            <td className="p-2 border-r text-muted-foreground" style={{ width: 80, minWidth: 80 }}>
                              {fila.hilo || '—'}
                            </td>
                          </>
                        ) : (
                          <>
                            <td
                              className="p-2.5 sticky left-0 bg-background z-10 border-r"
                              style={{ width: getColWidth('__item'), minWidth: getColWidth('__item'), maxWidth: getColWidth('__item') }}
                            >
                              <button
                                className="flex items-center gap-1.5 text-left w-full group hover:text-primary transition-colors"
                                onClick={() => openModal(fila, null)}
                                data-testid={`item-click-${idx}`}
                              >
                                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 group-hover:text-primary" />
                                <span className="font-medium truncate">{fila.item}</span>
                              </button>
                            </td>
                            <td
                              className="p-2.5 sticky bg-background z-10 border-r text-muted-foreground truncate"
                              style={{ left: getColWidth('__item'), width: getColWidth('__hilo'), minWidth: getColWidth('__hilo'), maxWidth: getColWidth('__hilo') }}
                            >
                              {fila.hilo}
                            </td>
                          </>
                        )}
                        {effectiveCols.map(col => {
                          const val = cellVal(fila.celdas, col);
                          return (
                            <td
                              key={col}
                              className="text-center p-2.5 border-r"
                              style={{ width: getColWidth(col), minWidth: getColWidth(col), maxWidth: getColWidth(col) }}
                            >
                              {val > 0 ? (
                                <button
                                  className="font-mono font-medium hover:text-primary hover:underline transition-colors cursor-pointer"
                                  onClick={() => openModal(fila, col)}
                                  data-testid={`cell-${idx}-${col}`}
                                >
                                  {val.toLocaleString()}
                                </button>
                              ) : (
                                <span className="text-muted-foreground/40">-</span>
                              )}
                            </td>
                          );
                        })}
                        <td
                          className="text-center p-2.5 font-mono font-bold bg-muted/20"
                          style={{ width: getColWidth('__total'), minWidth: getColWidth('__total'), maxWidth: getColWidth('__total') }}
                        >
                          <button
                            className="hover:text-primary hover:underline transition-colors cursor-pointer"
                            onClick={() => openModal(fila, null)}
                            data-testid={`total-${idx}`}
                            title={hayColumnasOcultas ? `Total visible. Total absoluto: ${totalVal(fila.total).toLocaleString()}` : ''}
                          >
                            {filaTotalVisible(fila).toLocaleString()}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/40 font-semibold border-t-2">
                    <td
                      className="p-2.5 sticky left-0 bg-muted/40 z-10 border-r"
                      colSpan={vistaModo === 'jerarquica' ? 5 : 2}
                      style={{ minWidth: vistaModo === 'jerarquica' ? 510 : (getColWidth('__item') + getColWidth('__hilo')) }}
                    >
                      TOTALES
                    </td>
                    {effectiveCols.map(col => {
                      const val = colTotal(col);
                      return (
                        <td
                          key={col}
                          className={`text-center p-2.5 font-mono border-r ${val > 0 ? '' : 'text-muted-foreground/40'}`}
                          style={{ width: getColWidth(col), minWidth: getColWidth(col), maxWidth: getColWidth(col) }}
                        >
                          {val > 0 ? val.toLocaleString() : '-'}
                        </td>
                      );
                    })}
                    <td
                      className="text-center p-2.5 font-mono font-bold bg-muted/30"
                      style={{ width: getColWidth('__total'), minWidth: getColWidth('__total'), maxWidth: getColWidth('__total') }}
                      title={hayColumnasOcultas ? `Total de columnas visibles. Total absoluto: ${totalVal(data.total_general).toLocaleString()}` : ''}
                    >
                      {totalGeneralVisible.toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Modal de detalle ─────────────────────────────────── */}
      <DetalleModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        registros={modalRegistros}
        titulo={modalTitulo}
        navigate={navigate}
      />
    </div>
  );
};
