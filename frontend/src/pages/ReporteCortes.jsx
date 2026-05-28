import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Switch } from '../components/ui/switch';
import { Label } from '../components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import {
  Scissors, Search, Loader2, ExternalLink, AlertTriangle, Link2, Link2Off,
  CheckCircle2, CircleDashed, AlertCircle, MinusCircle, ChevronDown, ChevronRight,
} from 'lucide-react';
import { formatDate } from '../lib/dateUtils';
import { getStatusClass } from '../lib/utils';
import { VincularOdooDialog } from '../components/VincularOdooDialog';
import { BalancePanel } from '../components/BalanceConciliacion';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Marca por defecto al abrir el reporte. Coincide con el nombre del catálogo.
const MARCA_DEFAULT_NOMBRE = 'Element Premium';

// Configuración visual del badge de conciliación (estados Almacén PT / Tienda).
// 'completo' = ingresado >= esperado en todas las líneas
// 'parcial'  = algunas líneas ingresadas / no llega al total
// 'pendiente' = nada ingresado todavía
// 'sin_distribucion' = el corte ya está en Almacén PT/Tienda pero no tiene
//                      Distribución Esperada (hay que crearla primero).
const CONC_CONFIG = {
  completo: {
    label: 'Completo',
    Icon: CheckCircle2,
    cls: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900',
  },
  parcial: {
    label: 'Parcial',
    Icon: CircleDashed,
    cls: 'border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900',
  },
  pendiente: {
    label: 'Pendiente',
    Icon: AlertCircle,
    cls: 'border-rose-300 bg-rose-50 text-rose-800 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900',
  },
  sin_distribucion: {
    label: 'Sin distribución',
    Icon: MinusCircle,
    cls: 'border-slate-300 bg-slate-50 text-slate-700 dark:bg-slate-950/30 dark:text-slate-400 dark:border-slate-800',
  },
};

const ConciliacionBadge = ({ conc, expandable, expanded, onToggle }) => {
  if (!conc) return <span className="text-[10px] text-muted-foreground/40">—</span>;
  const cfg = CONC_CONFIG[conc.estado] || CONC_CONFIG.sin_distribucion;
  const { Icon } = cfg;
  const tooltip = [
    `Esperado: ${Math.round(conc.esperado).toLocaleString()}`,
    `Ingresado: ${Math.round(conc.ingresado).toLocaleString()}`,
    `Pendiente: ${Math.round(conc.pendiente).toLocaleString()}`,
    conc.lineas_total > 0
      ? `Líneas: ${conc.lineas_completas}/${conc.lineas_total} completas`
      : null,
    expandable ? 'Click para ver detalle por producto' : null,
  ].filter(Boolean).join(' · ');

  // Si es expandible (tiene distribución), el badge mismo es clickable y
  // muestra un chevron. Si no, es solo informativo.
  const Wrapper = expandable ? 'button' : 'div';
  const wrapperProps = expandable
    ? {
        type: 'button',
        onClick: (e) => { e.stopPropagation(); onToggle?.(); },
        className: 'inline-flex flex-col items-start gap-0.5 text-left hover:bg-muted/40 rounded px-0.5 -mx-0.5',
      }
    : { className: 'inline-flex flex-col items-start gap-0.5' };

  return (
    <Wrapper {...wrapperProps} title={tooltip}>
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border ${cfg.cls}`}>
        <Icon className="h-3 w-3" />
        {cfg.label}
        {expandable && (
          expanded
            ? <ChevronDown className="h-2.5 w-2.5 ml-0.5" />
            : <ChevronRight className="h-2.5 w-2.5 ml-0.5" />
        )}
      </span>
      {conc.pendiente > 0 && (
        <span className="text-[10px] font-mono text-amber-700 dark:text-amber-400">
          faltan {Math.round(conc.pendiente).toLocaleString()}
        </span>
      )}
    </Wrapper>
  );
};

export const ReporteCortes = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Catálogos
  const [marcas, setMarcas]   = useState([]);
  const [tipos, setTipos]     = useState([]);
  const [entalles, setEntalles] = useState([]);
  const [telas, setTelas]     = useState([]);

  // Filtros
  const [marcaId, setMarcaId]     = useState('');     // se setea al cargar marcas
  const [tipoId, setTipoId]       = useState('');
  const [entalleId, setEntalleId] = useState('');
  const [telaId, setTelaId]       = useState('');
  const [estado, setEstado]       = useState('');
  const [incluirTienda, setIncluirTienda] = useState(true);
  const [soloPendientesConciliar, setSoloPendientesConciliar] = useState(false);
  const [search, setSearch]       = useState('');

  // Resumen de conciliación (lo devuelve el backend en cada respuesta)
  const [resumenConc, setResumenConc] = useState(null);

  // Expand inline de un corte para ver su conciliación detallada por producto.
  // expandedId: id del corte expandido (null = ninguno)
  // detalleCache: { [registroId]: { lineas: [...], loading: false, error: null } }
  const [expandedId, setExpandedId] = useState(null);
  const [detalleCache, setDetalleCache] = useState({});

  const toggleExpand = useCallback(async (id) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    // Si ya está cacheado, no refetch.
    if (detalleCache[id] && !detalleCache[id].error) return;
    setDetalleCache(prev => ({ ...prev, [id]: { loading: true, lineas: [] } }));
    try {
      const r = await axios.get(`${API}/registros/${id}/conciliacion-odoo`);
      setDetalleCache(prev => ({
        ...prev,
        [id]: {
          loading: false,
          lineas: r.data?.detalle || [],
          total_esperado: r.data?.total_esperado || 0,
          total_ingresado: r.data?.total_ingresado || 0,
          // Balance de diagnóstico (descomposición del pendiente por causa).
          balance: r.data?.balance || null,
        },
      }));
    } catch (e) {
      setDetalleCache(prev => ({
        ...prev,
        [id]: { loading: false, lineas: [], error: e?.response?.data?.detail || 'Error al cargar detalle' },
      }));
    }
  }, [expandedId, detalleCache]);

  // Modal vinculación Odoo — el componente VincularOdooDialog maneja todo
  // el estado interno (lineas, picker, etc). Aquí solo guardamos qué corte
  // está abierto en el modal (null = cerrado).
  const [vincularItem, setVincularItem] = useState(null);

  // Cargar catálogos al montar + setear marca default
  useEffect(() => {
    Promise.all([
      axios.get(`${API}/marcas`).then(r => r.data || []).catch(() => []),
      axios.get(`${API}/tipos`).then(r => r.data || []).catch(() => []),
      axios.get(`${API}/entalles`).then(r => r.data || []).catch(() => []),
      axios.get(`${API}/telas`).then(r => r.data || []).catch(() => []),
    ]).then(([ms, ts, es, tes]) => {
      setMarcas(ms);
      setTipos(ts);
      setEntalles(es);
      setTelas(tes);
      // Setear marca default = Element Premium si está en el catálogo
      const def = ms.find(m => (m.nombre || '').toLowerCase() === MARCA_DEFAULT_NOMBRE.toLowerCase());
      if (def) setMarcaId(def.id);
    });
  }, []);

  // Fetch principal: usado por el useEffect y también después de guardar/limpiar
  // la Distribución Esperada para refrescar la conciliación.
  const fetchCortes = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (marcaId)   params.set('marca_id',   marcaId);
    if (tipoId)    params.set('tipo_id',    tipoId);
    if (entalleId) params.set('entalle_id', entalleId);
    if (telaId)    params.set('tela_id',    telaId);
    if (estado)    params.set('estado',     estado);
    params.set('incluir_tienda', String(incluirTienda));
    if (soloPendientesConciliar) params.set('solo_pendientes_conciliar', 'true');
    params.set('limit', '1000');

    return axios.get(`${API}/reportes-produccion/cortes-listado?${params}`)
      .then(r => {
        setItems(r.data.items || []);
        setTotal(r.data.total || 0);
        setResumenConc(r.data.resumen_conciliacion || null);
      })
      .catch(() => { setItems([]); setTotal(0); setResumenConc(null); })
      .finally(() => setLoading(false));
  }, [marcaId, tipoId, entalleId, telaId, estado, incluirTienda, soloPendientesConciliar]);

  // Refetch cada vez que cambia un filtro (excepto search que es client-side)
  useEffect(() => { fetchCortes(); }, [fetchCortes]);

  // Filtro de búsqueda client-side (rápido sobre lo ya cargado)
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter(i =>
      (i.n_corte || '').toLowerCase().includes(term) ||
      (i.modelo || '').toLowerCase().includes(term)
    );
  }, [items, search]);

  // Estados únicos para el dropdown de filtro
  const estadosUnicos = useMemo(() => {
    const set = new Set(items.map(i => i.estado).filter(Boolean));
    return Array.from(set).sort();
  }, [items]);

  // Resumen por estado
  const porEstado = useMemo(() => {
    const acc = {};
    filtered.forEach(i => { acc[i.estado] = (acc[i.estado] || 0) + 1; });
    return Object.entries(acc).sort(([, a], [, b]) => b - a);
  }, [filtered]);

  // Detecta huecos en el correlativo por año.
  // Formato n_corte: "NNN" (año actual implícito) o "NNN-YYYY" (años anteriores).
  // Calculamos sobre `filtered` (respeta los filtros aplicados).
  const gapsPorAnio = useMemo(() => {
    const porAnio = {};  // { 2026: Set<int>, 2025: Set<int>, ... }
    filtered.forEach(i => {
      const nc = (i.n_corte || '').trim();
      if (!nc) return;
      let num = null, anio = null;
      const matchSufijo = nc.match(/^(\d+)-(\d{4})$/);
      const matchSimple = nc.match(/^(\d+)$/);
      if (matchSufijo) {
        num = parseInt(matchSufijo[1], 10);
        anio = parseInt(matchSufijo[2], 10);
      } else if (matchSimple) {
        num = parseInt(matchSimple[1], 10);
        // Año implícito = año de fecha_creacion
        if (i.fecha_creacion) {
          anio = new Date(i.fecha_creacion).getFullYear();
        } else {
          anio = new Date().getFullYear();
        }
      }
      if (num == null || anio == null) return;
      if (!porAnio[anio]) porAnio[anio] = new Set();
      porAnio[anio].add(num);
    });

    // Para cada año, calcula los gaps en el rango [min, max].
    // Solo alertamos para años >= 2026 (los gaps de años anteriores son
    // históricos y ya no son accionables).
    // Ojo: si el filtro está activo (ej. marca=Element Premium), los gaps
    // pueden ser de otra marca — se muestran igual para alertar.
    const ANIO_MINIMO_ALERTA = 2026;
    const resultado = [];
    Object.entries(porAnio).forEach(([anioStr, set]) => {
      const anio = parseInt(anioStr, 10);
      if (anio < ANIO_MINIMO_ALERTA) return;
      if (set.size < 2) return;
      const min = Math.min(...set), max = Math.max(...set);
      const gaps = [];
      for (let n = min; n <= max; n++) {
        if (!set.has(n)) gaps.push(n);
      }
      if (gaps.length > 0) {
        resultado.push({ anio, min, max, total: set.size, gaps });
      }
    });
    return resultado.sort((a, b) => b.anio - a.anio);
  }, [filtered]);

  // Abre el modal de vinculación Odoo para un corte. El componente
  // VincularOdooDialog se encarga del resto (lineas, picker, guardar, limpiar).
  const abrirVincular = (item) => setVincularItem(item);

  // Al guardar o limpiar la distribución, expira el caché del detalle
  // (drill-down) y refetch del listado para que el badge se actualice.
  const onDistribucionCambio = (item) => {
    if (item?.id) {
      setDetalleCache(prev => {
        const { [item.id]: _, ...rest } = prev;
        return rest;
      });
    }
    fetchCortes();
  };

  return (
    <div className="space-y-4" data-testid="reporte-cortes">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Scissors className="h-7 w-7 text-primary" />
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Reporte de Cortes</h1>
          <p className="text-sm text-muted-foreground">
            Listado completo de cortes registrados — ordenados del más nuevo al más antiguo.
          </p>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Marca</Label>
              <Select value={marcaId || '_all'} onValueChange={v => setMarcaId(v === '_all' ? '' : v)}>
                <SelectTrigger className="h-9 text-xs" data-testid="filter-marca">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Todas</SelectItem>
                  {marcas.map(m => <SelectItem key={m.id} value={m.id}>{m.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Tipo</Label>
              <Select value={tipoId || '_all'} onValueChange={v => setTipoId(v === '_all' ? '' : v)}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Todos</SelectItem>
                  {tipos.map(t => <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Entalle</Label>
              <Select value={entalleId || '_all'} onValueChange={v => setEntalleId(v === '_all' ? '' : v)}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Todos</SelectItem>
                  {entalles.map(e => <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Tela</Label>
              <Select value={telaId || '_all'} onValueChange={v => setTelaId(v === '_all' ? '' : v)}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Todas</SelectItem>
                  {telas.map(t => <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Estado</Label>
              <Select value={estado || '_all'} onValueChange={v => setEstado(v === '_all' ? '' : v)}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Todos</SelectItem>
                  {estadosUnicos.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Buscar n° corte / modelo</Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Ej. 077, KINSLEY…"
                  className="pl-7 h-9 text-xs"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between mt-3 pt-3 border-t flex-wrap gap-2">
            <div className="flex items-center gap-4 text-xs flex-wrap">
              <div className="flex items-center gap-2">
                <Switch checked={incluirTienda} onCheckedChange={setIncluirTienda} id="sw-tienda" />
                <Label htmlFor="sw-tienda" className="text-xs cursor-pointer">
                  Incluir cortes en estado "Tienda"
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={soloPendientesConciliar}
                  onCheckedChange={setSoloPendientesConciliar}
                  id="sw-conc"
                />
                <Label htmlFor="sw-conc" className="text-xs cursor-pointer flex items-center gap-1">
                  <AlertCircle className="h-3 w-3 text-amber-600" />
                  Solo pendientes de conciliar (Almacén PT/Tienda)
                </Label>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              Mostrando <strong>{filtered.length}</strong> de <strong>{total}</strong> cortes
              {marcaId && marcas.find(m => m.id === marcaId) && (
                <span> · filtrado por <strong>{marcas.find(m => m.id === marcaId).nombre}</strong></span>
              )}
            </div>
          </div>

          {/* Resumen de conciliación (solo si hay cortes en Almacén PT / Tienda) */}
          {resumenConc && resumenConc.total_en_estados > 0 && (
            <div className="mt-3 rounded-md border bg-muted/30 px-3 py-2 flex items-center gap-3 flex-wrap text-[11px]">
              <span className="font-semibold text-muted-foreground uppercase text-[10px]">
                Conciliación Almacén PT / Tienda:
              </span>
              <Badge variant="outline" className="gap-1 text-[10px] border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900">
                <CheckCircle2 className="h-3 w-3" />
                Completos: <strong>{resumenConc.completos}</strong>
              </Badge>
              <Badge variant="outline" className="gap-1 text-[10px] border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900">
                <CircleDashed className="h-3 w-3" />
                Parciales: <strong>{resumenConc.parciales}</strong>
              </Badge>
              <Badge variant="outline" className="gap-1 text-[10px] border-rose-300 bg-rose-50 text-rose-800 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900">
                <AlertCircle className="h-3 w-3" />
                Pendientes: <strong>{resumenConc.pendientes}</strong>
              </Badge>
              {resumenConc.sin_distribucion > 0 && (
                <Badge variant="outline" className="gap-1 text-[10px] border-slate-300 bg-slate-50 text-slate-700 dark:bg-slate-950/30 dark:text-slate-400 dark:border-slate-800">
                  <MinusCircle className="h-3 w-3" />
                  Sin distribución: <strong>{resumenConc.sin_distribucion}</strong>
                </Badge>
              )}
              {resumenConc.prendas_pendientes > 0 && (
                <span className="ml-auto text-muted-foreground">
                  Prendas por ingresar a Odoo: <strong className="text-amber-700 dark:text-amber-400 font-mono">{Math.round(resumenConc.prendas_pendientes).toLocaleString()}</strong>
                </span>
              )}
            </div>
          )}

          {/* Banner de gaps en correlativo */}
          {gapsPorAnio.length > 0 && (
            <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-2.5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                    Hay números de corte faltantes en el correlativo
                  </p>
                  <p className="text-[10px] text-amber-700/80 dark:text-amber-400/80 mt-0.5 leading-snug">
                    Estos números no aparecen en la secuencia (con los filtros actuales).
                    Verifica si fueron eliminados, asignados a otra marca, o necesitan crearse.
                  </p>
                  <div className="mt-2 space-y-1">
                    {gapsPorAnio.map(g => (
                      <div key={g.anio} className="text-[11px] text-amber-900 dark:text-amber-200">
                        <strong>{g.anio}</strong> · rango {g.min}–{g.max} · faltan{' '}
                        <strong>{g.gaps.length}</strong> número{g.gaps.length === 1 ? '' : 's'}:{' '}
                        <span className="font-mono">
                          {g.gaps.length <= 25
                            ? g.gaps.join(', ')
                            : g.gaps.slice(0, 25).join(', ') + ` … y ${g.gaps.length - 25} más`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {porEstado.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {porEstado.map(([est, n]) => (
                <Badge
                  key={est}
                  variant="outline"
                  className={`text-[10px] cursor-pointer ${estado === est ? 'border-primary text-primary' : ''}`}
                  onClick={() => setEstado(estado === est ? '' : est)}
                >
                  {est}: {n}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 h-40 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando cortes...
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              Sin cortes para los filtros seleccionados
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">N° Corte</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead>Marca</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Entalle</TableHead>
                    <TableHead>Tela</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Prendas</TableHead>
                    <TableHead>Creado</TableHead>
                    <TableHead className="text-center w-[60px]" title="Vinculado a Odoo">Odoo</TableHead>
                    <TableHead className="w-[140px]" title="Solo aplica a cortes en Almacén PT / Tienda">Conciliación</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(i => {
                    // Es expandible si tiene conciliación (siempre). Incluso
                    // "Sin distribución" muestra el resumen de fallados, recuperados
                    // y pendientes que viene en `balance`.
                    const expandable = !!i.conciliacion;
                    const isExpanded = expandedId === i.id;
                    const detalle = detalleCache[i.id];
                    return (
                    <Fragment key={i.id}>
                    <TableRow
                      className="hover:bg-muted/30 cursor-pointer"
                      onClick={() => navigate(`/registros/editar/${i.id}`)}
                      data-testid={`fila-${i.n_corte}`}
                    >
                      <TableCell className="font-mono font-semibold">
                        <div className="flex items-center gap-1">
                          {i.urgente && <AlertTriangle className="h-3 w-3 text-destructive" title="Urgente" />}
                          {i.n_corte}
                        </div>
                      </TableCell>
                      <TableCell className="truncate max-w-[200px]" title={i.modelo}>{i.modelo || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{i.marca || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{i.tipo || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{i.entalle || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{i.tela || '—'}</TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] px-1.5 ${getStatusClass(i.estado)}`}>
                          {i.estado}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">{i.prendas.toLocaleString()}</TableCell>
                      <TableCell className="text-xs">{formatDate(i.fecha_creacion)}</TableCell>
                      <TableCell className="text-center">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); abrirVincular(i); }}
                          className={`inline-flex items-center justify-center h-7 w-7 rounded transition-colors ${
                            i.vinculado_odoo
                              ? 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                              : 'text-muted-foreground/60 hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-950/30'
                          }`}
                          title={i.vinculado_odoo ? 'Vinculado a Odoo (click para cambiar)' : 'Sin vincular (click para vincular)'}
                          data-testid={`btn-vincular-${i.n_corte || i.id}`}
                        >
                          {i.vinculado_odoo
                            ? <Link2 className="h-3.5 w-3.5" />
                            : <Link2Off className="h-3.5 w-3.5" />}
                        </button>
                      </TableCell>
                      <TableCell>
                        <ConciliacionBadge
                          conc={i.conciliacion}
                          expandable={expandable}
                          expanded={isExpanded}
                          onToggle={() => toggleExpand(i.id)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => { e.stopPropagation(); navigate(`/registros/editar/${i.id}`); }}
                          title="Abrir corte"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                    {/* Fila expandida: detalle de conciliación por producto */}
                    {isExpanded && (
                      <TableRow className="bg-muted/30 hover:bg-muted/40">
                        <TableCell colSpan={12} className="p-0">
                          <div className="px-6 py-3 space-y-3">
                            <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                              Detalle de conciliación · corte {i.n_corte || '(sin número)'}
                            </div>
                            {detalle?.loading ? (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando detalle…
                              </div>
                            ) : detalle?.error ? (
                              <div className="text-xs text-rose-600">{detalle.error}</div>
                            ) : (
                            <>
                            {/* Resumen de fallados / recuperados / pendientes
                                — siempre, aunque el corte no tenga distribución
                                Odoo o esté ya conciliado al 100%. */}
                            {detalle?.balance && (
                              <BalancePanel
                                balance={detalle.balance}
                                pendiente={detalle.balance.pendiente_total}
                                onVerCorte={() => navigate(`/registros/editar/${i.id}`)}
                                onAjustarOdoo={() => abrirVincular(i)}
                              />
                            )}
                            {detalle?.lineas?.length === 0 ? (
                              <div className="text-xs text-muted-foreground italic mt-2">
                                {i.conciliacion?.estado === 'sin_distribucion'
                                  ? 'Este corte aún no tiene Distribución Esperada. Vinculalo a Odoo para ver el detalle por producto.'
                                  : 'Sin líneas'}
                              </div>
                            ) : (
                              <div className="rounded-md border bg-background overflow-hidden">
                                <table className="w-full text-xs">
                                  <thead className="bg-muted/60">
                                    <tr>
                                      <th className="text-left p-2 font-medium">Producto Odoo</th>
                                      <th className="text-left p-2 font-medium w-[120px]">Marca</th>
                                      <th className="text-right p-2 font-medium w-[90px]">Esperado</th>
                                      <th className="text-right p-2 font-medium w-[90px]">Ingresado</th>
                                      <th className="text-right p-2 font-medium w-[90px]">Pendiente</th>
                                      <th className="text-center p-2 font-medium w-[110px]">Estado</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {detalle?.lineas?.map((l, idx) => {
                                      const est = (l.estado || '').toLowerCase();
                                      const cfgKey = est === 'completo' ? 'completo'
                                        : est === 'parcial' ? 'parcial'
                                        : 'pendiente';
                                      const lineCfg = CONC_CONFIG[cfgKey];
                                      const LIcon = lineCfg.Icon;
                                      const pend = Number(l.pendiente) || 0;
                                      return (
                                        <tr key={idx} className="border-t">
                                          <td className="p-2 font-medium">
                                            {l.producto_nombre || `Template #${l.product_template_id_odoo}`}
                                            <span className="text-muted-foreground ml-1">(#{l.product_template_id_odoo})</span>
                                          </td>
                                          <td className="p-2 text-muted-foreground text-[11px]">
                                            {l.producto_marca || '—'}
                                          </td>
                                          <td className="p-2 text-right font-mono">{Math.round(l.esperado).toLocaleString()}</td>
                                          <td className="p-2 text-right font-mono">{Math.round(l.ingresado).toLocaleString()}</td>
                                          <td className={`p-2 text-right font-mono ${pend > 0 ? 'text-amber-700 dark:text-amber-400 font-semibold' : ''}`}>
                                            {Math.round(pend).toLocaleString()}
                                          </td>
                                          <td className="p-2 text-center">
                                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border ${lineCfg.cls}`}>
                                              <LIcon className="h-3 w-3" />
                                              {lineCfg.label}
                                            </span>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                            </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    </Fragment>
                  );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Distribución Esperada — reutilizable. */}
      <VincularOdooDialog
        item={vincularItem}
        onClose={() => setVincularItem(null)}
        onSaved={onDistribucionCambio}
        onCleared={onDistribucionCambio}
      />
    </div>
  );
};

export default ReporteCortes;
