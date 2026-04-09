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
  Merge, X, Palette,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const STORAGE_KEY = 'matriz-produccion-prefs';

// ── Formato fecha dd-mm-yy ────────────────────────────────────
function fmtDate(val) {
  if (!val) return '-';
  try {
    const d = new Date(val);
    if (isNaN(d)) return val;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    return `${dd}-${mm}-${yy}`;
  } catch { return val; }
}
function isOverdue(val) {
  if (!val) return false;
  try { return new Date(val) < new Date(); } catch { return false; }
}

// ── Persistencia ──────────────────────────────────────────────
function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null; } catch { return null; }
}
function savePrefs(p) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch {}
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
                      {fmtDate(d.fecha_entrega)}
                    </td>
                    <td className="p-2 text-center font-mono whitespace-nowrap">{fmtDate(d.fecha_inicio_prod)}</td>
                    <td className="p-2 text-center font-mono">{d.dias_proceso > 0 ? `${d.dias_proceso}d` : '-'}</td>
                    <td className="p-2 whitespace-nowrap">
                      {d.ult_mov_servicio ? (
                        <span>{d.ult_mov_servicio} <span className="text-muted-foreground">({fmtDate(d.ult_mov_fecha)})</span></span>
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
  const [visibleCols, setVisibleCols] = useState(null);
  const [colOrder, setColOrder] = useState(null);
  const [mergedCols, setMergedCols] = useState({}); // { targetCol: [absorbed1, absorbed2] }

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
        const saved = loadPrefs();
        if (saved && saved.ruta === (filters.ruta_id || '__global__')) {
          const sv = saved.visible?.filter(c => apiCols.includes(c));
          const so = saved.order?.filter(c => apiCols.includes(c));
          const miss = apiCols.filter(c => !so?.includes(c));
          setVisibleCols(sv?.length ? sv : apiCols);
          setColOrder(so?.length ? [...so, ...miss] : apiCols);
          setMergedCols(saved.merged || {});
        } else {
          setVisibleCols(apiCols);
          setColOrder(apiCols);
          setMergedCols({});
        }
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [filters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Guardar prefs ───────────────────────────────────────────
  useEffect(() => {
    if (visibleCols && colOrder) {
      savePrefs({
        ruta: filters.ruta_id || '__global__',
        visible: visibleCols,
        order: colOrder,
        merged: mergedCols,
      });
    }
  }, [visibleCols, colOrder, mergedCols, filters.ruta_id]);

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

  const totalVal = (total) => total ? (metrica === 'prendas' ? total.prendas : total.registros) : 0;

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

  // ── Handlers ────────────────────────────────────────────────
  const setFilter = (k, v) => { setFilters(p => ({ ...p, [k]: v })); };
  const clearFilters = () => {
    setFilters({ ruta_id: '', marca_id: '', tipo_id: '', entalle_id: '', tela_id: '', hilo_id: '', modelo_id: '', estado: '', solo_atrasados: false, solo_activos: true, solo_fraccionados: false });
  };
  const toggleCol = (c) => setVisibleCols(p => p?.includes(c) ? p.filter(x => x !== c) : [...(p || []), c]);
  const moveCol = (c, dir) => {
    setColOrder(p => {
      if (!p) return p;
      const i = p.indexOf(c);
      const j = dir === 'left' ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= p.length) return p;
      const a = [...p]; [a[i], a[j]] = [a[j], a[i]]; return a;
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
      return next;
    });
    setMergeSelection([]);
    setMergeMode(false);
  };
  const undoMerge = (target) => {
    setMergedCols(prev => {
      const next = { ...prev };
      delete next[target];
      return next;
    });
  };
  const undoAllMerges = () => { setMergedCols({}); setMergeSelection([]); setMergeMode(false); };

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
              <Badge variant="outline">{data.filas.length} items</Badge>
              <Badge variant="outline">{data.total_general.registros} reg</Badge>
              <Badge variant="outline">{data.total_general.prendas.toLocaleString()} prn</Badge>
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
                    <Button variant="ghost" size="sm" className="text-xs h-6" onClick={() => setVisibleCols(allCols)}>Todas</Button>
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
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse" data-testid="matriz-table">
                <thead>
                  <tr className="bg-muted/60">
                    <th className="text-left p-2.5 font-semibold sticky left-0 bg-muted/60 z-10 min-w-[280px] border-r">Item</th>
                    <th className="text-left p-2.5 font-semibold sticky left-[280px] bg-muted/60 z-10 min-w-[90px] border-r">Hilo</th>
                    {effectiveCols.map(col => (
                      <th key={col} className="text-center p-2.5 font-medium min-w-[70px] border-r whitespace-nowrap">
                        <div>{col}</div>
                        {mergedCols[col]?.length > 0 && (
                          <div className="text-[9px] text-muted-foreground font-normal">+{mergedCols[col].join(', ')}</div>
                        )}
                      </th>
                    ))}
                    <th className="text-center p-2.5 font-semibold min-w-[80px] bg-muted/40">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.filas.map((fila, idx) => {
                    const key = `${fila.marca}-${fila.tipo}-${fila.entalle}-${fila.tela}-${fila.hilo}`;
                    return (
                      <tr key={key} className="border-b hover:bg-muted/20 transition-colors" data-testid={`fila-${idx}`}>
                        <td className="p-2.5 sticky left-0 bg-background z-10 border-r">
                          <button
                            className="flex items-center gap-1.5 text-left w-full group hover:text-primary transition-colors"
                            onClick={() => openModal(fila, null)}
                            data-testid={`item-click-${idx}`}
                          >
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 group-hover:text-primary" />
                            <span className="font-medium truncate">{fila.item}</span>
                          </button>
                        </td>
                        <td className="p-2.5 sticky left-[280px] bg-background z-10 border-r text-muted-foreground">{fila.hilo}</td>
                        {effectiveCols.map(col => {
                          const val = cellVal(fila.celdas, col);
                          return (
                            <td key={col} className="text-center p-2.5 border-r">
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
                        <td className="text-center p-2.5 font-mono font-bold bg-muted/20">
                          <button
                            className="hover:text-primary hover:underline transition-colors cursor-pointer"
                            onClick={() => openModal(fila, null)}
                            data-testid={`total-${idx}`}
                          >
                            {totalVal(fila.total).toLocaleString()}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/40 font-semibold border-t-2">
                    <td className="p-2.5 sticky left-0 bg-muted/40 z-10 border-r" colSpan={2}>TOTALES</td>
                    {effectiveCols.map(col => {
                      const val = colTotal(col);
                      return (
                        <td key={col} className={`text-center p-2.5 font-mono border-r ${val > 0 ? '' : 'text-muted-foreground/40'}`}>
                          {val > 0 ? val.toLocaleString() : '-'}
                        </td>
                      );
                    })}
                    <td className="text-center p-2.5 font-mono font-bold bg-muted/30">
                      {totalVal(data.total_general).toLocaleString()}
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
