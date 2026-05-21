import React, { useEffect, useState, useMemo, useCallback } from 'react';
import axios from 'axios';
import {
  DollarSign, Lock, Search, X, Loader2, Package, Scissors, Truck, Receipt,
  FileDown, ChevronDown, ChevronRight, AlertTriangle, TrendingUp, TrendingDown,
  ExternalLink, Filter,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Button } from '../components/ui/button';
import { Switch } from '../components/ui/switch';
import { Label } from '../components/ui/label';
import { Checkbox } from '../components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { useAuth } from '../context/AuthContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => 'S/ ' + (n == null ? 0 : Number(n)).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNum = (n) => (n == null ? 0 : Number(n)).toLocaleString('es-PE');
const pct = (n) => (n == null ? '—' : `${n.toFixed(1)}%`);

// Color del margen según umbrales (verde >40, ámbar 20-40, rojo <20, gris si null)
const margenClasses = (m) => {
  if (m == null) return 'text-muted-foreground';
  if (m >= 40) return 'text-emerald-600 dark:text-emerald-400 font-semibold';
  if (m >= 20) return 'text-amber-600 dark:text-amber-400 font-semibold';
  return 'text-red-600 dark:text-red-400 font-semibold';
};

// Multi-select compacto con Popover + Checkboxes
const MultiSelectFilter = ({ label, options, selected, onChange, placeholder }) => {
  const allSelected = selected.length === 0;
  const display = allSelected
    ? placeholder || `Todos`
    : `${selected.length} seleccionado${selected.length > 1 ? 's' : ''}`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 text-xs gap-1 min-w-[140px] justify-between">
          <span className="truncate">{label}: {display}</span>
          <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2 max-h-[340px] overflow-y-auto" align="start">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold">{label}</p>
          {selected.length > 0 && (
            <button className="text-[10px] text-muted-foreground hover:text-foreground" onClick={() => onChange([])}>
              Limpiar
            </button>
          )}
        </div>
        <div className="space-y-1">
          {options.length === 0 && <p className="text-xs text-muted-foreground italic">Sin opciones</p>}
          {options.map(o => (
            <label key={o.id} className="flex items-center gap-2 text-xs py-1 px-1 rounded hover:bg-muted cursor-pointer">
              <Checkbox
                checked={selected.includes(o.id)}
                onCheckedChange={(v) => {
                  if (v) onChange([...selected, o.id]);
                  else onChange(selected.filter(x => x !== o.id));
                }}
              />
              <span className="truncate">{o.nombre}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default function CostoPorLote() {
  const navigate = useNavigate();
  const { empresaId } = useAuth();
  const [data, setData] = useState({ items: [], totales: {} });
  const [loading, setLoading] = useState(true);

  // Filtros UI
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [incluirSinCierre, setIncluirSinCierre] = useState(false);
  const [orden, setOrden] = useState('margen_asc');
  const [marcaSel, setMarcaSel] = useState([]);
  const [tipoSel, setTipoSel] = useState([]);
  const [entalleSel, setEntalleSel] = useState([]);
  const [telaSel, setTelaSel] = useState([]);

  // Catálogos
  const [marcas, setMarcas] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [entalles, setEntalles] = useState([]);
  const [telas, setTelas] = useState([]);

  // Detalle drawer
  const [detalle, setDetalle] = useState(null);
  const [detalleLoading, setDetalleLoading] = useState(false);
  const [detalleOpen, setDetalleOpen] = useState(false);
  const [expandedServicio, setExpandedServicio] = useState(null);

  // Carga catálogos una vez
  useEffect(() => {
    Promise.all([
      axios.get(`${API}/marcas`).catch(() => ({ data: [] })),
      axios.get(`${API}/tipos`).catch(() => ({ data: [] })),
      axios.get(`${API}/entalles`).catch(() => ({ data: [] })),
      axios.get(`${API}/telas`).catch(() => ({ data: [] })),
    ]).then(([rm, rt, re, rte]) => {
      const norm = (arr) => (Array.isArray(arr) ? arr : []).map(x => ({ id: x.id, nombre: x.nombre })).filter(x => x.id && x.nombre);
      setMarcas(norm(rm.data));
      setTipos(norm(rt.data));
      setEntalles(norm(re.data));
      setTelas(norm(rte.data));
    });
  }, []);

  // Fetch principal cuando cambian filtros server-side
  const fetchData = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (empresaId) params.set('empresa_id', String(empresaId));
    params.set('incluir_sin_cierre', String(incluirSinCierre));
    if (marcaSel.length > 0) params.set('marca_ids', marcaSel.join(','));
    if (tipoSel.length > 0) params.set('tipo_ids', tipoSel.join(','));
    if (entalleSel.length > 0) params.set('entalle_ids', entalleSel.join(','));
    if (telaSel.length > 0) params.set('tela_ids', telaSel.join(','));
    axios.get(`${API}/reportes-produccion/costo-lote?${params}`)
      .then(r => setData(r.data || { items: [], totales: {} }))
      .catch(() => setData({ items: [], totales: {} }))
      .finally(() => setLoading(false));
  }, [empresaId, incluirSinCierre, marcaSel, tipoSel, entalleSel, telaSel]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const abrirDetalle = (lote) => {
    setDetalleOpen(true);
    setDetalleLoading(true);
    setDetalle(null);
    setExpandedServicio(null);
    axios.get(`${API}/reportes-produccion/costo-lote/${lote.id}/detalle`)
      .then(r => setDetalle(r.data))
      .catch(() => setDetalle(null))
      .finally(() => setDetalleLoading(false));
  };

  // Filtrar client-side por búsqueda y estado + ordenar
  const items = useMemo(() => {
    let list = [...(data.items || [])];
    if (busqueda) {
      const q = busqueda.toLowerCase();
      list = list.filter(l =>
        (l.n_corte || '').toString().toLowerCase().includes(q) ||
        (l.modelo || '').toLowerCase().includes(q) ||
        (l.marca || '').toLowerCase().includes(q)
      );
    }
    if (filtroEstado) list = list.filter(l => l.estado === filtroEstado);
    if (orden === 'margen_asc') {
      list.sort((a, b) => {
        // nulls al final
        if (a.margen_bruto_pct == null && b.margen_bruto_pct == null) return 0;
        if (a.margen_bruto_pct == null) return 1;
        if (b.margen_bruto_pct == null) return -1;
        return a.margen_bruto_pct - b.margen_bruto_pct;
      });
    } else if (orden === 'margen_desc') {
      list.sort((a, b) => {
        if (a.margen_bruto_pct == null && b.margen_bruto_pct == null) return 0;
        if (a.margen_bruto_pct == null) return 1;
        if (b.margen_bruto_pct == null) return -1;
        return b.margen_bruto_pct - a.margen_bruto_pct;
      });
    } else if (orden === 'costo_desc') list.sort((a, b) => b.costo_total - a.costo_total);
    else if (orden === 'costo_asc') list.sort((a, b) => a.costo_total - b.costo_total);
    else if (orden === 'unitario_desc') list.sort((a, b) => b.costo_unitario - a.costo_unitario);
    return list;
  }, [data.items, busqueda, filtroEstado, orden]);

  // KPIs sobre items filtrados
  const kpis = useMemo(() => {
    const t = {
      costo_total: 0,
      valor_venta_total: 0,
      ganancia_total: 0,
      lotes: items.length,
      lotes_riesgo: 0,        // margen bruto <20%
      lotes_sin_precio: 0,    // sin precio vinculado
    };
    items.forEach(l => {
      t.costo_total += l.costo_total || 0;
      if (l.tiene_precio && l.valor_venta_estimado) {
        t.valor_venta_total += l.valor_venta_estimado;
        t.ganancia_total += l.valor_venta_estimado - (l.costo_total || 0);
      }
      if (l.tiene_precio && l.margen_bruto_pct != null && l.margen_bruto_pct < 20) {
        t.lotes_riesgo += 1;
      }
      if (!l.tiene_precio) {
        t.lotes_sin_precio += 1;
      }
    });
    // Margen bruto ponderado por valor de venta
    t.margen_bruto_ponderado = t.valor_venta_total > 0
      ? (t.ganancia_total / t.valor_venta_total) * 100
      : null;
    return t;
  }, [items]);

  const estados = useMemo(() => {
    const set = new Set((data.items || []).map(l => l.estado).filter(Boolean));
    return [...set].sort();
  }, [data.items]);

  const hayFiltros = busqueda || filtroEstado || marcaSel.length || tipoSel.length || entalleSel.length || telaSel.length || incluirSinCierre;
  const limpiarFiltros = () => {
    setBusqueda(''); setFiltroEstado('');
    setMarcaSel([]); setTipoSel([]); setEntalleSel([]); setTelaSel([]);
    setIncluirSinCierre(false);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <DollarSign className="h-6 w-6 text-primary" /> Análisis de Costos y Rentabilidad
        </h2>
        <p className="text-sm text-muted-foreground">Costos completos por lote (MP + Servicios + Otros + CIF) con margen contra el precio de venta de Odoo</p>
        <p className="text-[11px] text-muted-foreground mt-1 italic">
          Precios y costos incluyen IGV. Margen real ajusta el precio sin IGV para comparación contable aproximada.
        </p>
      </div>

      {/* KPIs nuevos */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card data-testid="kpi-costo-total">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Costo Total</p>
            <p className="text-xl font-bold text-blue-600 dark:text-blue-400 font-mono">{fmt(kpis.costo_total)}</p>
            <p className="text-[10px] text-muted-foreground mt-1">{kpis.lotes} lote{kpis.lotes !== 1 ? 's' : ''}</p>
          </CardContent>
        </Card>
        <Card data-testid="kpi-margen-bruto">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Margen Bruto Promedio</p>
            <p className={`text-xl font-bold font-mono ${margenClasses(kpis.margen_bruto_ponderado)}`}>
              {kpis.margen_bruto_ponderado == null ? '—' : pct(kpis.margen_bruto_ponderado)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">Ponderado por valor de venta · {fmt(kpis.valor_venta_total)} estimado</p>
          </CardContent>
        </Card>
        <Card data-testid="kpi-lotes-riesgo">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
              <TrendingDown className="h-3 w-3 text-red-500" /> Lotes con margen &lt;20%
            </p>
            <p className="text-xl font-bold text-red-600 dark:text-red-400 font-mono">{kpis.lotes_riesgo}</p>
            <p className="text-[10px] text-muted-foreground mt-1">Accionable — revisar precio o costos</p>
          </CardContent>
        </Card>
        <Card data-testid="kpi-sin-precio">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Sin precio vinculado
            </p>
            <p className="text-xl font-bold text-muted-foreground font-mono">{kpis.lotes_sin_precio}</p>
            <p className="text-[10px] text-muted-foreground mt-1">Falta vincular modelo → producto Odoo</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="rounded-lg border bg-card p-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar corte, modelo, marca..." value={busqueda} onChange={e => setBusqueda(e.target.value)} className="pl-9 h-9" />
          </div>
          <Select value={filtroEstado || 'all'} onValueChange={(v) => setFiltroEstado(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Estado: todos</SelectItem>
              {estados.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
            </SelectContent>
          </Select>
          <MultiSelectFilter label="Marca"   options={marcas}   selected={marcaSel}   onChange={setMarcaSel} />
          <MultiSelectFilter label="Tipo"    options={tipos}    selected={tipoSel}    onChange={setTipoSel} />
          <MultiSelectFilter label="Entalle" options={entalles} selected={entalleSel} onChange={setEntalleSel} />
          <MultiSelectFilter label="Tela"    options={telas}    selected={telaSel}    onChange={setTelaSel} />
          <Select value={orden} onValueChange={setOrden}>
            <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Ordenar" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="margen_asc">Peor margen primero</SelectItem>
              <SelectItem value="margen_desc">Mejor margen primero</SelectItem>
              <SelectItem value="costo_desc">Mayor costo</SelectItem>
              <SelectItem value="costo_asc">Menor costo</SelectItem>
              <SelectItem value="unitario_desc">Mayor costo/prenda</SelectItem>
            </SelectContent>
          </Select>
          {hayFiltros && (
            <Button variant="ghost" size="sm" onClick={limpiarFiltros} className="h-9 text-xs">
              <X className="h-3 w-3 mr-1" /> Limpiar
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2 pt-1 border-t">
          <Switch id="incluir-sin-cierre" checked={incluirSinCierre} onCheckedChange={setIncluirSinCierre} data-testid="toggle-incluir-sin-cierre" />
          <Label htmlFor="incluir-sin-cierre" className="text-xs cursor-pointer">
            Incluir lotes sin cierre ejecutado (costo estimado)
          </Label>
          <span className="text-[10px] text-muted-foreground ml-auto">
            {loading ? 'Cargando...' : `${data.items?.length || 0} lote${(data.items?.length || 0) !== 1 ? 's' : ''} cargado${(data.items?.length || 0) !== 1 ? 's' : ''}`}
          </span>
        </div>
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Cargando...</div>
      ) : items.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Sin datos para los filtros seleccionados</div>
      ) : (
        <div className="rounded-xl border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-2 py-2 text-left text-xs font-semibold text-muted-foreground">Corte</th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-muted-foreground">Modelo</th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-muted-foreground">Estado</th>
                <th className="px-2 py-2 text-right text-xs font-semibold text-muted-foreground">Prendas</th>
                <th className="px-2 py-2 text-right text-xs font-semibold text-muted-foreground">Costo total</th>
                <th className="px-2 py-2 text-right text-xs font-semibold text-muted-foreground">S/ prenda</th>
                <th className="px-2 py-2 text-right text-xs font-semibold text-muted-foreground">Precio s/IGV</th>
                <th className="px-2 py-2 text-right text-xs font-semibold text-muted-foreground">Precio c/IGV</th>
                <th className="px-2 py-2 text-right text-xs font-semibold text-muted-foreground">Margen</th>
              </tr>
            </thead>
            <tbody>
              {items.map((l) => (
                <tr
                  key={l.id}
                  className="border-b hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => abrirDetalle(l)}
                  data-testid={`fila-lote-${l.id}`}
                >
                  <td className="px-2 py-2 whitespace-nowrap">
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="font-bold">{l.n_corte}</span>
                      {l.cerrado
                        ? <Lock className="inline h-3 w-3 text-muted-foreground" />
                        : <Badge variant="outline" className="text-[9px] px-1 bg-amber-50 text-amber-700 border-amber-300">Cierre pendiente</Badge>
                      }
                      {l.urgente && <span className="text-red-500 text-xs font-bold">!</span>}
                      {!l.tiene_precio && (
                        <Badge variant="outline" className="text-[9px] px-1 bg-slate-100 text-slate-600 border-slate-300">Precio no vinculado</Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-muted-foreground">{l.modelo || '—'}</td>
                  <td className="px-2 py-2"><Badge variant="outline" className="text-[10px]">{l.estado || '—'}</Badge></td>
                  <td className="px-2 py-2 text-right font-mono text-xs">{fmtNum(l.cantidad_prendas)}</td>
                  <td className="px-2 py-2 text-right font-bold font-mono text-primary">{fmt(l.costo_total)}</td>
                  <td className="px-2 py-2 text-right font-mono text-emerald-600 text-xs">{fmt(l.costo_unitario)}</td>
                  <td className="px-2 py-2 text-right font-mono text-xs">{l.tiene_precio ? fmt(l.precio_sin_igv) : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-2 py-2 text-right font-mono text-xs">{l.tiene_precio ? fmt(l.precio_con_igv) : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-2 py-2 text-right">
                    {l.tiene_precio ? (
                      <div className="flex flex-col items-end">
                        <span className={`font-mono ${margenClasses(l.margen_bruto_pct)}`}>{pct(l.margen_bruto_pct)}</span>
                        <span className={`font-mono text-[10px] ${margenClasses(l.margen_real_pct)}`}>
                          real {pct(l.margen_real_pct)}
                        </span>
                      </div>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Drawer Detalle */}
      <Dialog open={detalleOpen} onOpenChange={setDetalleOpen}>
        <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
          {detalleLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : detalle ? (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <DialogTitle className="flex items-center gap-2 text-lg">
                    Corte {detalle.n_corte} — {detalle.modelo}
                    {detalle.cerrado
                      ? <Badge variant="secondary" className="text-[10px]"><Lock className="h-3 w-3 mr-1" />Cerrado</Badge>
                      : <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-300">Cierre pendiente</Badge>
                    }
                    {detalle.urgente && <Badge variant="destructive" className="text-[10px]">Urgente</Badge>}
                  </DialogTitle>
                  <div className="flex items-center gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => navigate(`/registros/editar/${detalle.registro_id}`)} className="text-xs gap-1">
                      <ExternalLink className="h-3.5 w-3.5" /> Ver corte completo
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => window.open(`${API}/reportes-produccion/costo-lote/${detalle.registro_id}/detalle-pdf`, '_blank')} className="text-xs gap-1">
                      <FileDown className="h-3.5 w-3.5" /> PDF
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{detalle.marca} · {detalle.estado} · {fmtNum(detalle.cantidad_prendas)} prendas</p>
              </DialogHeader>

              {/* Resumen 5 cards de costos */}
              <div className="grid grid-cols-5 gap-2 mt-4">
                {[
                  { label: 'MP', value: detalle.resumen.costo_mp, color: 'text-blue-600', icon: Package },
                  { label: 'Servicios', value: detalle.resumen.costo_servicios, color: 'text-violet-600', icon: Scissors },
                  { label: 'Otros', value: detalle.resumen.costo_otros, color: 'text-amber-600', icon: Receipt },
                  { label: 'CIF', value: detalle.resumen.costo_cif, color: 'text-orange-600', icon: Truck },
                  { label: 'TOTAL', value: detalle.resumen.costo_total, color: 'text-primary font-bold', icon: DollarSign },
                ].map(c => (
                  <div key={c.label} className="rounded-lg border p-2.5 text-center">
                    <c.icon className={`h-4 w-4 mx-auto mb-1 ${c.color}`} />
                    <p className="text-[10px] text-muted-foreground uppercase">{c.label}</p>
                    <p className={`text-sm font-mono font-semibold ${c.color}`}>{fmt(c.value)}</p>
                    {detalle.resumen.costo_total > 0 && (
                      <p className="text-[9px] text-muted-foreground mt-0.5">
                        {Math.round((c.value / detalle.resumen.costo_total) * 100)}%
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {/* Sección Precio + Margen */}
              <div className="mt-4 rounded-lg border bg-muted/20 p-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide mb-2 flex items-center gap-1">
                  <TrendingUp className="h-3.5 w-3.5" /> Precio y márgenes
                </h4>
                {detalle.precio?.tiene_precio ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div>
                      <p className="text-muted-foreground">Producto Odoo</p>
                      <p className="font-medium">{detalle.precio.pt_nombre || '—'}</p>
                      <p className="text-[10px] text-muted-foreground">ID {detalle.precio.pt_odoo_id}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Precio (c/IGV · s/IGV)</p>
                      <p className="font-mono font-semibold">{fmt(detalle.precio.precio_con_igv)}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">{fmt(detalle.precio.precio_sin_igv)} s/IGV</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Margen bruto</p>
                      <p className={`font-mono font-semibold ${margenClasses(detalle.precio.margen_bruto_pct)}`}>{pct(detalle.precio.margen_bruto_pct)}</p>
                      <p className={`font-mono text-[10px] ${margenClasses(detalle.precio.margen_bruto_pct)}`}>{fmt(detalle.precio.margen_bruto_soles)}/prenda</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Margen real</p>
                      <p className={`font-mono font-semibold ${margenClasses(detalle.precio.margen_real_pct)}`}>{pct(detalle.precio.margen_real_pct)}</p>
                      <p className={`font-mono text-[10px] ${margenClasses(detalle.precio.margen_real_pct)}`}>{fmt(detalle.precio.margen_real_soles)}/prenda</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    Este modelo no tiene producto Odoo vinculado. Vincula `pt_item_id` para ver márgenes.
                  </p>
                )}
              </div>

              {/* Detalle MP */}
              {detalle.detalle_mp?.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-blue-600 mb-2 flex items-center gap-1">
                    <Package className="h-3.5 w-3.5" /> Materia Prima ({detalle.detalle_mp.length})
                  </h4>
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Material</th>
                          <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Cant.</th>
                          <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Costo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalle.detalle_mp.map((m, i) => (
                          <tr key={i} className="border-t">
                            <td className="px-2 py-1.5">
                              <span className="font-medium">{m.item}</span>
                              {m.codigo && <span className="text-muted-foreground ml-1">({m.codigo})</span>}
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono">{m.cantidad}</td>
                            <td className="px-2 py-1.5 text-right font-mono font-medium">{fmt(m.costo)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-muted/40 border-t">
                        <tr>
                          <td colSpan={2} className="px-2 py-1.5 text-right font-semibold text-muted-foreground">Subtotal</td>
                          <td className="px-2 py-1.5 text-right font-mono font-bold text-blue-600">{fmt(detalle.detalle_mp.reduce((s, m) => s + m.costo, 0))}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* Detalle Servicios */}
              {detalle.detalle_servicios?.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-violet-600 mb-2 flex items-center gap-1">
                    <Scissors className="h-3.5 w-3.5" /> Servicios ({detalle.detalle_servicios.length})
                  </h4>
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Servicio</th>
                          <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Persona</th>
                          <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Env.</th>
                          <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Tarifa</th>
                          <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Costo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalle.detalle_servicios.map((s, i) => (
                          <React.Fragment key={i}>
                            <tr className="border-t">
                              <td className="px-2 py-1.5 font-medium">
                                <div className="flex items-center gap-1">
                                  {s.detalle_costos?.length > 0 && (
                                    <button onClick={() => setExpandedServicio(expandedServicio === i ? null : i)} className="p-0.5 rounded hover:bg-muted">
                                      {expandedServicio === i ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                    </button>
                                  )}
                                  {s.servicio}
                                  {s.detalle_costos?.length > 0 && <span className="text-[9px] text-violet-500 ml-1">({s.detalle_costos.length} líneas)</span>}
                                </div>
                              </td>
                              <td className="px-2 py-1.5 text-muted-foreground">{s.persona || '—'}</td>
                              <td className="px-2 py-1.5 text-right font-mono">{s.enviadas}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">{s.detalle_costos?.length > 0 ? '—' : `S/ ${s.tarifa}`}</td>
                              <td className="px-2 py-1.5 text-right font-mono font-medium">{fmt(s.costo)}</td>
                            </tr>
                            {expandedServicio === i && s.detalle_costos?.length > 0 && s.detalle_costos.map((l, j) => (
                              <tr key={`${i}-${j}`} className="bg-violet-50/50 dark:bg-violet-950/20">
                                <td className="px-2 py-1 pl-8 text-[10px] text-muted-foreground" colSpan={2}>{l.descripcion || '—'}</td>
                                <td className="px-2 py-1 text-right font-mono text-[10px]">{l.cantidad}</td>
                                <td className="px-2 py-1 text-right font-mono text-[10px] text-muted-foreground">S/ {(l.precio_unitario || 0).toFixed(2)}</td>
                                <td className="px-2 py-1 text-right font-mono text-[10px]">{fmt((l.cantidad || 0) * (l.precio_unitario || 0))}</td>
                              </tr>
                            ))}
                          </React.Fragment>
                        ))}
                      </tbody>
                      <tfoot className="bg-muted/40 border-t">
                        <tr>
                          <td colSpan={4} className="px-2 py-1.5 text-right font-semibold text-muted-foreground">Subtotal</td>
                          <td className="px-2 py-1.5 text-right font-mono font-bold text-violet-600">{fmt(detalle.detalle_servicios.reduce((s, m) => s + m.costo, 0))}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* Detalle Otros */}
              {detalle.detalle_otros?.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-600 mb-2 flex items-center gap-1">
                    <Receipt className="h-3.5 w-3.5" /> Otros Costos ({detalle.detalle_otros.length})
                  </h4>
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Descripción</th>
                          <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Proveedor</th>
                          <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Fecha</th>
                          <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Monto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalle.detalle_otros.map((o, i) => (
                          <tr key={i} className="border-t">
                            <td className="px-2 py-1.5 font-medium">{o.descripcion}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">{o.proveedor || '—'}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">{o.fecha || '—'}</td>
                            <td className="px-2 py-1.5 text-right font-mono font-medium">{fmt(o.monto)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-muted/40 border-t">
                        <tr>
                          <td colSpan={3} className="px-2 py-1.5 text-right font-semibold text-muted-foreground">Subtotal</td>
                          <td className="px-2 py-1.5 text-right font-mono font-bold text-amber-600">{fmt(detalle.detalle_otros.reduce((s, o) => s + o.monto, 0))}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {detalle.cerrado && detalle.resumen.costo_cif > 0 && (
                <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-900 p-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-orange-600 mb-1 flex items-center gap-1">
                    <Truck className="h-3.5 w-3.5" /> CIF (Costos Indirectos de Fabricación)
                  </h4>
                  <p className="text-sm font-mono font-bold text-orange-600">{fmt(detalle.resumen.costo_cif)}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Calculado al momento del cierre del lote</p>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">No se pudo cargar el detalle</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
