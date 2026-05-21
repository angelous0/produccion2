import { Fragment, useEffect, useMemo, useState } from 'react';
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
  AlertCircle, ChevronDown, ChevronRight, Search,
  Loader2, ExternalLink, Package, FileWarning, Link2, Link2Off,
} from 'lucide-react';
import { formatDate } from '../lib/dateUtils';
import { getStatusClass } from '../lib/utils';
import { VincularOdooDialog } from '../components/VincularOdooDialog';
import { BalanceChip, BalancePanel } from '../components/BalanceConciliacion';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Marca por defecto al abrir el reporte: la mayoría del pendiente típicamente
// está en Element Premium, así que arrancamos filtrando por esa.
const MARCA_DEFAULT = 'ELEMENT PREMIUM';

export const ConciliacionPendiente = () => {
  const navigate = useNavigate();
  const [data, setData] = useState({ por_producto: [], sin_distribucion: [], resumen: null });
  const [loading, setLoading] = useState(true);

  // Filtros
  const [marcaOdoo, setMarcaOdoo]     = useState(MARCA_DEFAULT);
  const [incluirTienda, setIncluirTienda] = useState(true);
  const [search, setSearch]           = useState('');

  // Catálogo de marcas Odoo (lo derivamos del listado de templates).
  // Lo cacheamos para el filtro.
  const [marcasOdoo, setMarcasOdoo] = useState([]);

  // Drill-down: qué template está expandido
  const [expandedTemplate, setExpandedTemplate] = useState(null);
  // Drill-down de segundo nivel: qué CORTE está expandido (muestra BalancePanel).
  const [expandedCorte, setExpandedCorte] = useState(null);

  // Modal vinculación Odoo — controlado por item (null = cerrado).
  const [vincularItem, setVincularItem] = useState(null);

  // Cargar marcas Odoo (una vez)
  useEffect(() => {
    axios.get(`${API}/odoo/product-templates`, { params: { limit: 100 } })
      .then(r => {
        const set = new Set();
        (r.data || []).forEach(t => { if (t.marca) set.add(t.marca); });
        setMarcasOdoo(Array.from(set).sort());
      })
      .catch(() => setMarcasOdoo([]));
  }, []);

  // Fetch principal (extraído para poder refrescar tras guardar el modal).
  const fetchData = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (marcaOdoo) params.set('marca_odoo', marcaOdoo);
    params.set('incluir_tienda', String(incluirTienda));
    return axios.get(`${API}/reportes-produccion/conciliacion-pendiente?${params}`)
      .then(r => setData(r.data || { por_producto: [], sin_distribucion: [], resumen: null }))
      .catch(() => setData({ por_producto: [], sin_distribucion: [], resumen: null }))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [marcaOdoo, incluirTienda]);

  // Filtro client-side por búsqueda (sobre nombre del producto o n_corte sin
  // distribución).
  const productosFiltrados = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return data.por_producto;
    return data.por_producto.filter(p =>
      (p.producto_nombre || '').toLowerCase().includes(term) ||
      (p.producto_marca || '').toLowerCase().includes(term) ||
      p.cortes.some(c => (c.n_corte || '').toLowerCase().includes(term))
    );
  }, [data.por_producto, search]);

  const sinDistribFiltrados = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return data.sin_distribucion;
    return data.sin_distribucion.filter(c =>
      (c.n_corte || '').toLowerCase().includes(term) ||
      (c.modelo || '').toLowerCase().includes(term)
    );
  }, [data.sin_distribucion, search]);

  const toggleProducto = (templateId) => {
    setExpandedTemplate(prev => prev === templateId ? null : templateId);
  };

  return (
    <div className="space-y-4" data-testid="conciliacion-pendiente">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <AlertCircle className="h-7 w-7 text-amber-600" />
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Conciliación Pendiente</h1>
          <p className="text-sm text-muted-foreground">
            Productos en Almacén PT / Tienda que aún no se han ingresado completamente a Odoo,
            agrupados por producto. Incluye también los cortes que aún no tienen Distribución Esperada.
          </p>
        </div>
      </div>

      {/* Filtros + resumen */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Marca Odoo</Label>
              <Select value={marcaOdoo || '_all'} onValueChange={v => setMarcaOdoo(v === '_all' ? '' : v)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Todas</SelectItem>
                  {marcasOdoo.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Buscar</Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Producto, n° corte, modelo…"
                  className="pl-7 h-9 text-xs"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Switch checked={incluirTienda} onCheckedChange={setIncluirTienda} id="sw-tienda-cp" />
              <Label htmlFor="sw-tienda-cp" className="text-xs cursor-pointer">
                Incluir cortes en Tienda
              </Label>
            </div>
          </div>

          {/* Resumen agregado */}
          {data.resumen && (
            <div className="mt-3 pt-3 border-t flex items-center gap-3 flex-wrap text-[11px]">
              <Badge variant="outline" className="gap-1 text-[10px] border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900">
                <Package className="h-3 w-3" />
                Productos pendientes: <strong>{data.resumen.productos_pendientes}</strong>
              </Badge>
              <Badge variant="outline" className="gap-1 text-[10px] border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900">
                <AlertCircle className="h-3 w-3" />
                Prendas por ingresar: <strong>{Math.round(data.resumen.prendas_pendientes).toLocaleString()}</strong>
              </Badge>
              <Badge variant="outline" className="gap-1 text-[10px]">
                Cortes afectados: <strong>{data.resumen.cortes_afectados}</strong>
              </Badge>
              {data.resumen.cortes_sin_distribucion > 0 && (
                <Badge variant="outline" className="gap-1 text-[10px] border-rose-300 bg-rose-50 text-rose-800 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900">
                  <FileWarning className="h-3 w-3" />
                  Cortes sin distribución: <strong>{data.resumen.cortes_sin_distribucion}</strong>
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* === Sección 1: Productos con conciliación pendiente === */}
      <Card>
        <CardContent className="p-0">
          <div className="px-4 pt-3 pb-2 border-b flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Package className="h-4 w-4 text-amber-600" />
              Productos con conciliación pendiente
              <span className="text-xs text-muted-foreground font-normal">
                ({productosFiltrados.length})
              </span>
            </h2>
            <p className="text-[11px] text-muted-foreground hidden sm:block">
              Click en un producto para ver en qué cortes está pendiente
            </p>
          </div>
          {loading ? (
            <div className="flex items-center justify-center gap-2 h-32 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
            </div>
          ) : productosFiltrados.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              {search
                ? 'Sin resultados para tu búsqueda'
                : 'Todo conciliado, no hay productos pendientes con los filtros actuales'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]"></TableHead>
                    <TableHead>Producto Odoo</TableHead>
                    <TableHead>Marca</TableHead>
                    <TableHead className="text-center w-[80px]">Cortes</TableHead>
                    <TableHead className="text-right w-[100px]">Esperado</TableHead>
                    <TableHead className="text-right w-[100px]">Ingresado</TableHead>
                    <TableHead className="text-right w-[110px]">Pendiente</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productosFiltrados.map(p => {
                    const isExp = expandedTemplate === p.template_id;
                    return (
                      <Fragment key={p.template_id}>
                        <TableRow
                          className="hover:bg-muted/30 cursor-pointer"
                          onClick={() => toggleProducto(p.template_id)}
                        >
                          <TableCell>
                            {isExp
                              ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                          </TableCell>
                          <TableCell className="font-medium">
                            {p.producto_nombre}
                            <span className="text-muted-foreground text-[11px] ml-1">
                              (#{p.template_id})
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {p.producto_marca || '—'}
                          </TableCell>
                          <TableCell className="text-center font-mono">
                            {p.cortes.length}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {Math.round(p.esperado).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {Math.round(p.ingresado).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold text-amber-700 dark:text-amber-400">
                            {Math.round(p.pendiente).toLocaleString()}
                          </TableCell>
                        </TableRow>
                        {/* Drill-down: cortes específicos donde este producto está pendiente */}
                        {isExp && (
                          <TableRow className="bg-muted/30">
                            <TableCell colSpan={7} className="p-0">
                              <div className="px-6 py-3">
                                <div className="rounded-md border bg-background overflow-hidden">
                                  <table className="w-full text-xs">
                                    <thead className="bg-muted/60">
                                      <tr>
                                        <th className="w-[28px]"></th>
                                        <th className="text-left p-2 font-medium w-[100px]">N° Corte</th>
                                        <th className="text-left p-2 font-medium">Modelo</th>
                                        <th className="text-left p-2 font-medium w-[120px]">Estado</th>
                                        <th className="text-right p-2 font-medium w-[70px]">Esp.</th>
                                        <th className="text-right p-2 font-medium w-[70px]">Ing.</th>
                                        <th className="text-right p-2 font-medium w-[80px]">Pendiente</th>
                                        <th className="text-left p-2 font-medium w-[180px]" title="Click en un corte para ver detalle">Causa</th>
                                        <th className="text-center p-2 font-medium w-[40px]" title="Editar Distribución Esperada">Odoo</th>
                                        <th className="w-[40px]"></th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {p.cortes.map(c => {
                                        const isCorteExp = expandedCorte === c.registro_id;
                                        const hasBalance = c.balance && c.balance.pendiente_total > 0;
                                        return (
                                        <Fragment key={c.registro_id}>
                                        <tr
                                          className="border-t hover:bg-muted/40 cursor-pointer"
                                          onClick={() => setExpandedCorte(isCorteExp ? null : c.registro_id)}
                                        >
                                          <td className="p-1 text-center">
                                            {hasBalance && (
                                              isCorteExp
                                                ? <ChevronDown className="h-3 w-3 text-muted-foreground inline" />
                                                : <ChevronRight className="h-3 w-3 text-muted-foreground inline" />
                                            )}
                                          </td>
                                          <td className="p-2 font-mono font-semibold">{c.n_corte || '—'}</td>
                                          <td className="p-2">{c.modelo || '—'}</td>
                                          <td className="p-2">
                                            <Badge className={`text-[10px] px-1.5 ${getStatusClass(c.estado)}`}>
                                              {c.estado}
                                            </Badge>
                                          </td>
                                          <td className="p-2 text-right font-mono text-[11px]">{Math.round(c.esperado).toLocaleString()}</td>
                                          <td className="p-2 text-right font-mono text-[11px]">{Math.round(c.ingresado).toLocaleString()}</td>
                                          <td className="p-2 text-right font-mono font-semibold text-amber-700 dark:text-amber-400">
                                            {Math.round(c.pendiente).toLocaleString()}
                                          </td>
                                          <td className="p-2">
                                            <BalanceChip balance={c.balance} pendiente={c.pendiente} />
                                          </td>
                                          <td className="p-2 text-center">
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                // El corte ya tiene distribución (sale en "por producto"),
                                                // entonces vinculado_odoo=true para mostrar "Eliminar todas".
                                                setVincularItem({
                                                  id:     c.registro_id,
                                                  n_corte: c.n_corte,
                                                  modelo:  c.modelo,
                                                  marca:   p.producto_marca,
                                                  tipo:    '',
                                                  vinculado_odoo: true,
                                                });
                                              }}
                                              className="inline-flex items-center justify-center h-6 w-6 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                                              title="Editar Distribución Esperada"
                                            >
                                              <Link2 className="h-3 w-3" />
                                            </button>
                                          </td>
                                          <td className="p-2 text-right">
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-6 w-6"
                                              onClick={(e) => { e.stopPropagation(); navigate(`/registros/editar/${c.registro_id}`); }}
                                              title="Abrir corte"
                                            >
                                              <ExternalLink className="h-3 w-3" />
                                            </Button>
                                          </td>
                                        </tr>
                                        {isCorteExp && hasBalance && (
                                          <tr className="border-t bg-muted/20">
                                            <td colSpan={10} className="p-2">
                                              <BalancePanel
                                                balance={c.balance}
                                                pendiente={c.balance.pendiente_total}
                                                onVerCorte={() => navigate(`/registros/editar/${c.registro_id}`)}
                                                onAjustarOdoo={() => setVincularItem({
                                                  id:     c.registro_id,
                                                  n_corte: c.n_corte,
                                                  modelo:  c.modelo,
                                                  marca:   p.producto_marca,
                                                  tipo:    '',
                                                  vinculado_odoo: true,
                                                })}
                                              />
                                            </td>
                                          </tr>
                                        )}
                                        </Fragment>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
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

      {/* === Sección 2: Cortes sin Distribución Esperada === */}
      <Card>
        <CardContent className="p-0">
          <div className="px-4 pt-3 pb-2 border-b flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <FileWarning className="h-4 w-4 text-rose-600" />
              Cortes en Almacén PT / Tienda sin Distribución Esperada
              <span className="text-xs text-muted-foreground font-normal">
                ({sinDistribFiltrados.length})
              </span>
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Estos cortes no se pueden conciliar aún. Abrir cada uno y agregar líneas en "Distribución Esperada".
            </p>
          </div>
          {loading ? null : sinDistribFiltrados.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {search
                ? 'Sin resultados para tu búsqueda'
                : 'Todos los cortes en Almacén PT / Tienda tienen Distribución Esperada'}
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
                    <TableHead className="w-[120px]">Estado</TableHead>
                    <TableHead className="text-right w-[90px]">Prendas</TableHead>
                    <TableHead className="w-[120px]">Creado</TableHead>
                    <TableHead className="text-center w-[80px]" title="Crear Distribución Esperada">Vincular Odoo</TableHead>
                    <TableHead className="w-[40px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sinDistribFiltrados.map(c => (
                    <TableRow
                      key={c.registro_id}
                      className="hover:bg-muted/30 cursor-pointer"
                      onClick={() => navigate(`/registros/editar/${c.registro_id}`)}
                    >
                      <TableCell className="font-mono font-semibold">{c.n_corte || '—'}</TableCell>
                      <TableCell className="truncate max-w-[220px]" title={c.modelo}>{c.modelo || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.marca || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.tipo || '—'}</TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] px-1.5 ${getStatusClass(c.estado)}`}>
                          {c.estado}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">{c.prendas.toLocaleString()}</TableCell>
                      <TableCell className="text-xs">{formatDate(c.fecha_creacion)}</TableCell>
                      <TableCell className="text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            // No tiene distribución → vinculado_odoo=false (no muestra "Eliminar todas")
                            setVincularItem({
                              id:      c.registro_id,
                              n_corte: c.n_corte,
                              modelo:  c.modelo,
                              marca:   c.marca,
                              tipo:    c.tipo,
                              vinculado_odoo: false,
                            });
                          }}
                          className="inline-flex items-center justify-center h-7 w-7 rounded text-amber-700 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30 dark:hover:bg-amber-950/60 dark:text-amber-400"
                          title="Crear Distribución Esperada para este corte"
                          data-testid={`btn-vincular-sin-${c.n_corte || c.registro_id}`}
                        >
                          <Link2Off className="h-3.5 w-3.5" />
                        </button>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => { e.stopPropagation(); navigate(`/registros/editar/${c.registro_id}`); }}
                          title="Abrir corte"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de Distribución Esperada — reutilizado del ReporteCortes. */}
      <VincularOdooDialog
        item={vincularItem}
        onClose={() => setVincularItem(null)}
        onSaved={() => { setVincularItem(null); fetchData(); }}
        onCleared={() => { setVincularItem(null); fetchData(); }}
      />
    </div>
  );
};

export default ConciliacionPendiente;
