import React, { useEffect, useState, useMemo, useCallback } from 'react';
import axios from 'axios';
import { DollarSign, Loader2, RefreshCw, Filter, X, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => 'S/ ' + (n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNum = (n) => (n || 0).toLocaleString('es-PE');

const LINEA_COLORS = [
  { bg: 'bg-blue-600',   text: 'text-white', light: 'bg-blue-50 dark:bg-blue-950'   },
  { bg: 'bg-emerald-600', text: 'text-white', light: 'bg-emerald-50 dark:bg-emerald-950' },
  { bg: 'bg-violet-600', text: 'text-white', light: 'bg-violet-50 dark:bg-violet-950' },
  { bg: 'bg-orange-600', text: 'text-white', light: 'bg-orange-50 dark:bg-orange-950' },
  { bg: 'bg-rose-600',   text: 'text-white', light: 'bg-rose-50 dark:bg-rose-950'   },
  { bg: 'bg-teal-600',   text: 'text-white', light: 'bg-teal-50 dark:bg-teal-950'   },
];

const estadoColor = (e) => {
  const s = (e || '').toUpperCase();
  if (s === 'CERRADO' || s === 'ENTREGADO') return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
  if (s === 'EN_PROCESO' || s === 'ABIERTA') return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
  if (s === 'PARALIZADO') return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
  return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
};

export default function CostosProduccion() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lineasNegocio, setLineasNegocio] = useState([]);
  const [collapsedGrupos, setCollapsedGrupos] = useState({});

  // Filtros
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [estado, setEstado] = useState('');
  const [lineaNegocioId, setLineaNegocioId] = useState('');

  // Applied filters (only trigger fetch when user hits Buscar)
  const [applied, setApplied] = useState({});

  useEffect(() => {
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };
    axios.get(`${API}/lineas-negocio`, { headers }).then(r => setLineasNegocio(r.data || [])).catch(() => {});
  }, []);

  const fetchData = useCallback((filters) => {
    setLoading(true);
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };
    const params = {};
    if (filters.fechaDesde) params.fecha_desde = filters.fechaDesde;
    if (filters.fechaHasta) params.fecha_hasta = filters.fechaHasta;
    if (filters.estado) params.estado = filters.estado;
    if (filters.lineaNegocioId) params.linea_negocio_id = filters.lineaNegocioId;

    axios.get(`${API}/reportes-produccion/costos-produccion`, { headers, params })
      .then(r => setData(r.data || null))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const handleBuscar = () => {
    const filters = { fechaDesde, fechaHasta, estado, lineaNegocioId };
    setApplied(filters);
    fetchData(filters);
  };

  const handleLimpiar = () => {
    setFechaDesde(''); setFechaHasta(''); setEstado(''); setLineaNegocioId('');
    const filters = {};
    setApplied(filters);
    fetchData(filters);
  };

  const toggleGrupo = (id) => setCollapsedGrupos(prev => ({ ...prev, [id]: !prev[id] }));

  const hayFiltros = fechaDesde || fechaHasta || estado || lineaNegocioId;

  const { grupos, tallasKeys, serviciosKeys, materialesKeys } = useMemo(() => {
    if (!data) return { grupos: [], tallasKeys: [], serviciosKeys: [], materialesKeys: [] };
    return {
      grupos: data.grupos || [],
      tallasKeys: data.tallas_keys || [],
      serviciosKeys: data.servicios_keys || [],
      materialesKeys: data.materiales_keys || [],
    };
  }, [data]);

  // Grand totals
  const grandTotal = useMemo(() => {
    if (!grupos.length) return null;
    const t = { total_prendas: 0, costo_materiales: 0, costo_servicios: 0, costo_total: 0, tallas: {}, materiales: {}, servicios: {} };
    grupos.forEach(g => {
      t.total_prendas += g.totales.total_prendas || 0;
      t.costo_materiales += g.totales.costo_materiales || 0;
      t.costo_servicios += g.totales.costo_servicios || 0;
      t.costo_total += g.totales.costo_total || 0;
      Object.entries(g.totales.tallas || {}).forEach(([k, v]) => { t.tallas[k] = (t.tallas[k] || 0) + v; });
      Object.entries(g.totales.materiales || {}).forEach(([k, v]) => { t.materiales[k] = (t.materiales[k] || 0) + v; });
      Object.entries(g.totales.servicios || {}).forEach(([k, v]) => { t.servicios[k] = (t.servicios[k] || 0) + v; });
    });
    return t;
  }, [grupos]);

  const totalCols = 4 + tallasKeys.length + materialesKeys.length + serviciosKeys.length + 2;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-emerald-600" />
            Costos de Producción
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Desglose de costos por corte — materiales y servicios
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleBuscar} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          Actualizar
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">Desde</label>
              <Input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} className="w-36" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">Hasta</label>
              <Input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} className="w-36" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">Estado</label>
              <Select value={estado || 'todos'} onValueChange={v => setEstado(v === 'todos' ? '' : v)}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="ABIERTA">Abierta</SelectItem>
                  <SelectItem value="EN_PROCESO">En Proceso</SelectItem>
                  <SelectItem value="CERRADO">Cerrado</SelectItem>
                  <SelectItem value="ENTREGADO">Entregado</SelectItem>
                  <SelectItem value="PARALIZADO">Paralizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">Línea de Negocio</label>
              <Select value={lineaNegocioId || 'todas'} onValueChange={v => setLineaNegocioId(v === 'todas' ? '' : v)}>
                <SelectTrigger className="w-52">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  {lineasNegocio.map(ln => (
                    <SelectItem key={ln.id} value={String(ln.id)}>{ln.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleBuscar} disabled={loading} size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <Filter className="h-4 w-4 mr-1" />
                Buscar
              </Button>
              {hayFiltros && (
                <Button variant="ghost" size="sm" onClick={handleLimpiar}>
                  <X className="h-4 w-4 mr-1" />
                  Limpiar
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-40 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Cargando datos...
        </div>
      )}

      {/* Empty state */}
      {!loading && !data && (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground border rounded-lg border-dashed">
          <DollarSign className="h-10 w-10 mb-2 opacity-30" />
          <p>Aplica filtros y presiona <strong>Buscar</strong> para generar el reporte.</p>
        </div>
      )}

      {/* Table */}
      {!loading && data && grupos.length === 0 && (
        <div className="flex items-center justify-center h-32 text-muted-foreground border rounded-lg border-dashed">
          Sin registros para los filtros seleccionados.
        </div>
      )}

      {!loading && grupos.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border shadow-sm">
          <table className="text-xs w-full border-collapse">
            <thead>
              {/* Group header row (colspan labels) */}
              <tr className="bg-slate-100 dark:bg-slate-800 border-b border-border">
                <th colSpan={4} className="px-2 py-2 text-left font-semibold text-slate-700 dark:text-slate-200 border-r border-border">
                  Registro
                </th>
                {tallasKeys.length > 0 && (
                  <th colSpan={tallasKeys.length} className="px-2 py-2 text-center font-semibold text-indigo-700 dark:text-indigo-300 border-r border-border">
                    Tallas
                  </th>
                )}
                {materialesKeys.length > 0 && (
                  <th colSpan={materialesKeys.length} className="px-2 py-2 text-center font-semibold text-amber-700 dark:text-amber-300 border-r border-border">
                    Costo Materiales
                  </th>
                )}
                {serviciosKeys.length > 0 && (
                  <th colSpan={serviciosKeys.length} className="px-2 py-2 text-center font-semibold text-blue-700 dark:text-blue-300 border-r border-border">
                    Costo Servicios
                  </th>
                )}
                <th colSpan={2} className="px-2 py-2 text-center font-semibold text-emerald-700 dark:text-emerald-300">
                  Totales
                </th>
              </tr>
              {/* Column headers */}
              <tr className="bg-slate-50 dark:bg-slate-900 border-b-2 border-border sticky top-0 z-10">
                <th className="px-2 py-2 text-left font-medium whitespace-nowrap">N° Corte</th>
                <th className="px-2 py-2 text-left font-medium whitespace-nowrap">Modelo</th>
                <th className="px-2 py-2 text-center font-medium whitespace-nowrap">Estado</th>
                <th className="px-2 py-2 text-right font-medium whitespace-nowrap border-r border-border">Prendas</th>
                {tallasKeys.map(t => (
                  <th key={t} className="px-2 py-2 text-right font-medium text-indigo-700 dark:text-indigo-400 whitespace-nowrap">
                    T{t}
                  </th>
                ))}
                {tallasKeys.length > 0 && <th className="w-1 border-r border-border p-0" />}
                {materialesKeys.map(m => (
                  <th key={m} className="px-2 py-2 text-right font-medium text-amber-700 dark:text-amber-400 whitespace-nowrap max-w-[90px] truncate" title={m}>
                    {m.length > 12 ? m.slice(0, 12) + '…' : m}
                  </th>
                ))}
                {materialesKeys.length > 0 && <th className="w-1 border-r border-border p-0" />}
                {serviciosKeys.map(s => (
                  <th key={s} className="px-2 py-2 text-right font-medium text-blue-700 dark:text-blue-400 whitespace-nowrap">
                    {s}
                  </th>
                ))}
                {serviciosKeys.length > 0 && <th className="w-1 border-r border-border p-0" />}
                <th className="px-3 py-2 text-right font-bold text-emerald-700 dark:text-emerald-400 whitespace-nowrap bg-emerald-50 dark:bg-emerald-950">
                  COSTO TOTAL
                </th>
                <th className="px-2 py-2 text-right font-medium whitespace-nowrap">C/U</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map((grupo, gi) => {
                const color = LINEA_COLORS[gi % LINEA_COLORS.length];
                const collapsed = collapsedGrupos[grupo.linea_negocio_id || 0];
                const tot = grupo.totales;

                return (
                  <React.Fragment key={grupo.linea_negocio_id || 'sin'}>
                    {/* Linea negocio group header */}
                    <tr
                      className={`${color.bg} ${color.text} cursor-pointer select-none`}
                      onClick={() => toggleGrupo(grupo.linea_negocio_id || 0)}
                    >
                      <td colSpan={totalCols} className="px-3 py-2 font-bold text-sm">
                        <div className="flex items-center gap-2">
                          {collapsed
                            ? <ChevronRight className="h-4 w-4 flex-shrink-0" />
                            : <ChevronDown className="h-4 w-4 flex-shrink-0" />
                          }
                          <span>{grupo.linea_nombre}</span>
                          <Badge className="bg-white/20 text-white border-white/30 ml-1 font-normal">
                            {grupo.registros.length} cortes
                          </Badge>
                          <span className="ml-auto text-sm font-normal opacity-90">
                            {fmtNum(tot.total_prendas)} prendas · {fmt(tot.costo_total)}
                          </span>
                        </div>
                      </td>
                    </tr>

                    {/* Registro rows */}
                    {!collapsed && grupo.registros.map((reg, ri) => (
                      <tr
                        key={reg.id}
                        className={`border-b border-border hover:bg-muted/40 transition-colors ${ri % 2 === 1 ? 'bg-muted/20' : ''}`}
                      >
                        <td className="px-2 py-1.5 font-mono font-semibold whitespace-nowrap text-slate-700 dark:text-slate-300">
                          #{reg.n_corte}
                        </td>
                        <td className="px-2 py-1.5 max-w-[130px] truncate" title={reg.modelo_nombre}>
                          {reg.modelo_nombre || '—'}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${estadoColor(reg.estado_op)}`}>
                            {reg.estado_op || '—'}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-right font-medium border-r border-border">
                          {fmtNum(reg.total_prendas)}
                        </td>

                        {/* Tallas */}
                        {tallasKeys.map(t => (
                          <td key={t} className="px-2 py-1.5 text-right text-slate-600 dark:text-slate-400">
                            {reg.tallas[t] ? fmtNum(reg.tallas[t]) : <span className="text-muted-foreground/30">—</span>}
                          </td>
                        ))}
                        {tallasKeys.length > 0 && <td className="border-r border-border p-0" />}

                        {/* Materiales */}
                        {materialesKeys.map(m => (
                          <td key={m} className="px-2 py-1.5 text-right text-amber-700 dark:text-amber-400">
                            {reg.materiales[m] ? fmt(reg.materiales[m]) : <span className="text-muted-foreground/30">—</span>}
                          </td>
                        ))}
                        {materialesKeys.length > 0 && <td className="border-r border-border p-0" />}

                        {/* Servicios */}
                        {serviciosKeys.map(s => (
                          <td key={s} className="px-2 py-1.5 text-right text-blue-700 dark:text-blue-400">
                            {reg.servicios[s] ? fmt(reg.servicios[s]) : <span className="text-muted-foreground/30">—</span>}
                          </td>
                        ))}
                        {serviciosKeys.length > 0 && <td className="border-r border-border p-0" />}

                        {/* Totals */}
                        <td className="px-3 py-1.5 text-right font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/40 whitespace-nowrap">
                          {fmt(reg.costo_total)}
                        </td>
                        <td className="px-2 py-1.5 text-right text-muted-foreground whitespace-nowrap">
                          {reg.costo_unitario > 0 ? fmt(reg.costo_unitario) : '—'}
                        </td>
                      </tr>
                    ))}

                    {/* Group subtotal row */}
                    {!collapsed && (
                      <tr className={`border-b-2 border-border font-semibold text-[11px] ${color.light}`}>
                        <td colSpan={3} className="px-2 py-1.5 text-right text-muted-foreground italic">
                          Subtotal {grupo.linea_nombre}
                        </td>
                        <td className="px-2 py-1.5 text-right border-r border-border">
                          {fmtNum(tot.total_prendas)}
                        </td>
                        {tallasKeys.map(t => (
                          <td key={t} className="px-2 py-1.5 text-right text-indigo-700 dark:text-indigo-400">
                            {tot.tallas?.[t] ? fmtNum(tot.tallas[t]) : <span className="text-muted-foreground/30">—</span>}
                          </td>
                        ))}
                        {tallasKeys.length > 0 && <td className="border-r border-border p-0" />}
                        {materialesKeys.map(m => (
                          <td key={m} className="px-2 py-1.5 text-right text-amber-700 dark:text-amber-400">
                            {tot.materiales?.[m] ? fmt(tot.materiales[m]) : <span className="text-muted-foreground/30">—</span>}
                          </td>
                        ))}
                        {materialesKeys.length > 0 && <td className="border-r border-border p-0" />}
                        {serviciosKeys.map(s => (
                          <td key={s} className="px-2 py-1.5 text-right text-blue-700 dark:text-blue-400">
                            {tot.servicios?.[s] ? fmt(tot.servicios[s]) : <span className="text-muted-foreground/30">—</span>}
                          </td>
                        ))}
                        {serviciosKeys.length > 0 && <td className="border-r border-border p-0" />}
                        <td className="px-3 py-1.5 text-right text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 whitespace-nowrap">
                          {fmt(tot.costo_total)}
                        </td>
                        <td className="px-2 py-1.5 text-right text-muted-foreground">
                          {tot.total_prendas > 0 ? fmt(tot.costo_total / tot.total_prendas) : '—'}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

              {/* Grand total row */}
              {grandTotal && grupos.length > 1 && (
                <tr className="bg-slate-800 dark:bg-slate-700 text-white font-bold text-[11px] border-t-2 border-slate-600">
                  <td colSpan={3} className="px-2 py-2 text-right text-slate-300 text-sm">
                    TOTAL GENERAL
                  </td>
                  <td className="px-2 py-2 text-right border-r border-slate-600">
                    {fmtNum(grandTotal.total_prendas)}
                  </td>
                  {tallasKeys.map(t => (
                    <td key={t} className="px-2 py-2 text-right text-indigo-300">
                      {grandTotal.tallas[t] ? fmtNum(grandTotal.tallas[t]) : '—'}
                    </td>
                  ))}
                  {tallasKeys.length > 0 && <td className="border-r border-slate-600 p-0" />}
                  {materialesKeys.map(m => (
                    <td key={m} className="px-2 py-2 text-right text-amber-300">
                      {grandTotal.materiales[m] ? fmt(grandTotal.materiales[m]) : '—'}
                    </td>
                  ))}
                  {materialesKeys.length > 0 && <td className="border-r border-slate-600 p-0" />}
                  {serviciosKeys.map(s => (
                    <td key={s} className="px-2 py-2 text-right text-blue-300">
                      {grandTotal.servicios[s] ? fmt(grandTotal.servicios[s]) : '—'}
                    </td>
                  ))}
                  {serviciosKeys.length > 0 && <td className="border-r border-slate-600 p-0" />}
                  <td className="px-3 py-2 text-right text-emerald-300 bg-emerald-900/60 text-sm whitespace-nowrap">
                    {fmt(grandTotal.costo_total)}
                  </td>
                  <td className="px-2 py-2 text-right text-slate-300">
                    {grandTotal.total_prendas > 0 ? fmt(grandTotal.costo_total / grandTotal.total_prendas) : '—'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
