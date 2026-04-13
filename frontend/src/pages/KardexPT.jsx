import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Separator } from '../components/ui/separator';
import { formatDate } from '../lib/dateUtils';
import {
  BookOpen, ArrowDownCircle, ArrowUpCircle, ArrowLeftRight,
  PlusCircle, MinusCircle, Search, ChevronLeft, ChevronRight, Loader2, Filter
} from 'lucide-react';
import { formatNumber } from '../lib/utils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const TIPO_CONFIG = {
  INGRESO_PRODUCCION: { label: 'Ingreso Prod.', className: 'bg-emerald-100 text-emerald-800 border-emerald-300', icon: ArrowDownCircle },
  SALIDA_VENTA: { label: 'Venta', className: 'bg-blue-100 text-blue-800 border-blue-300', icon: ArrowUpCircle },
  AJUSTE_POSITIVO: { label: 'Ajuste +', className: 'bg-teal-100 text-teal-800 border-teal-300', icon: PlusCircle },
  AJUSTE_NEGATIVO: { label: 'Ajuste -', className: 'bg-red-100 text-red-800 border-red-300', icon: MinusCircle },
  TRANSFERENCIA: { label: 'Transferencia', className: 'bg-purple-100 text-purple-800 border-purple-300', icon: ArrowLeftRight },
  OTRO: { label: 'Otro', className: 'bg-gray-100 text-gray-700 border-gray-300', icon: Filter },
};

const TipoBadge = ({ tipo }) => {
  const c = TIPO_CONFIG[tipo] || TIPO_CONFIG.OTRO;
  const Icon = c.icon;
  return (
    <Badge variant="outline" className={`${c.className} text-[10px] font-medium gap-1 whitespace-nowrap`}>
      <Icon className="h-3 w-3" /> {c.label}
    </Badge>
  );
};


export const KardexPT = () => {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [saldoConfiable, setSaldoConfiable] = useState(true);
  const pageSize = 50;

  // Filtros
  const [filtros, setFiltros] = useState(null);
  const [searchProducto, setSearchProducto] = useState('');
  const [productTmplId, setProductTmplId] = useState('');
  const [tipoMov, setTipoMov] = useState('');
  const [companyKey, setCompanyKey] = useState('');
  const [locationId, setLocationId] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [productoOptions, setProductoOptions] = useState([]);

  // Resumen
  const [resumen, setResumen] = useState(null);

  const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };

  // Cargar filtros disponibles
  useEffect(() => {
    axios.get(`${API}/kardex-pt/filtros`, { headers })
      .then(r => setFiltros(r.data)).catch(() => {});
  // eslint-disable-next-line
  }, []);

  // Buscar productos
  useEffect(() => {
    if (!searchProducto || searchProducto.length < 2) { setProductoOptions([]); return; }
    const timer = setTimeout(() => {
      axios.get(`${API}/odoo/product-templates?search=${encodeURIComponent(searchProducto)}&limit=15`, { headers })
        .then(r => setProductoOptions(r.data)).catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  // eslint-disable-next-line
  }, [searchProducto]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page);
      params.set('page_size', pageSize);
      if (productTmplId) params.set('product_tmpl_id', productTmplId);
      if (tipoMov) params.set('tipo_movimiento', tipoMov);
      if (companyKey) params.set('company_key', companyKey);
      if (locationId) params.set('location_id', locationId);
      if (fechaDesde) params.set('fecha_desde', fechaDesde);
      if (fechaHasta) params.set('fecha_hasta', fechaHasta);

      const [kardexRes, resumenRes] = await Promise.all([
        axios.get(`${API}/kardex-pt?${params}`, { headers }),
        axios.get(`${API}/kardex-pt/resumen`, { headers }),
      ]);
      setItems(kardexRes.data.items);
      setTotal(kardexRes.data.total);
      setSaldoConfiable(kardexRes.data.saldo_confiable);
      setResumen(resumenRes.data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line
  }, [page, productTmplId, tipoMov, companyKey, locationId, fechaDesde, fechaHasta]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalPages = Math.ceil(total / pageSize);

  const clearFilters = () => {
    setProductTmplId(''); setTipoMov(''); setCompanyKey('');
    setLocationId(''); setFechaDesde(''); setFechaHasta('');
    setSearchProducto(''); setPage(1);
  };

  return (
    <div className="space-y-4" data-testid="kardex-pt-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-slate-600" />
          <h1 className="text-lg font-bold text-slate-800">Kardex Producto Terminado</h1>
        </div>
      </div>

      {/* Resumen global */}
      {resumen && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="kardex-resumen">
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Total Entradas</div>
              <div className="text-2xl font-bold text-emerald-600" data-testid="total-entradas">
                {formatNumber(resumen.totales.entradas, 0)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Total Salidas</div>
              <div className="text-2xl font-bold text-blue-600" data-testid="total-salidas">
                {formatNumber(resumen.totales.salidas, 0)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Saldo Global</div>
              <div className={`text-2xl font-bold ${resumen.totales.saldo >= 0 ? 'text-slate-800' : 'text-red-600'}`}
                data-testid="saldo-global">
                {formatNumber(resumen.totales.saldo, 0)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {/* Producto */}
            <div className="relative col-span-2 sm:col-span-1">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar producto..."
                value={searchProducto}
                onChange={e => { setSearchProducto(e.target.value); if (!e.target.value) setProductTmplId(''); }}
                className="pl-7 h-9 text-xs"
                data-testid="filtro-producto"
              />
              {productoOptions.length > 0 && searchProducto.length >= 2 && !productTmplId && (
                <div className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
                  {productoOptions.map(p => (
                    <button key={p.odoo_id} type="button"
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100 border-b last:border-0"
                      onClick={() => { setProductTmplId(String(p.odoo_id)); setSearchProducto(p.name); setProductoOptions([]); setPage(1); }}>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-[10px] text-muted-foreground">{p.marca} | ID: {p.odoo_id}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Tipo movimiento */}
            <Select value={tipoMov} onValueChange={v => { setTipoMov(v === 'all' ? '' : v); setPage(1); }}>
              <SelectTrigger className="h-9 text-xs" data-testid="filtro-tipo">
                <SelectValue placeholder="Tipo mov." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">Todos los tipos</SelectItem>
                {filtros?.tipos_movimiento?.map(t => (
                  <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Company */}
            <Select value={companyKey} onValueChange={v => { setCompanyKey(v === 'all' ? '' : v); setPage(1); }}>
              <SelectTrigger className="h-9 text-xs" data-testid="filtro-company">
                <SelectValue placeholder="Empresa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">Todas</SelectItem>
                {filtros?.company_keys?.map(c => (
                  <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Ubicacion */}
            <Select value={locationId} onValueChange={v => { setLocationId(v === 'all' ? '' : v); setPage(1); }}>
              <SelectTrigger className="h-9 text-xs" data-testid="filtro-ubicacion">
                <SelectValue placeholder="Ubicacion" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">Todas</SelectItem>
                {filtros?.ubicaciones?.map(u => (
                  <SelectItem key={u.id} value={String(u.id)} className="text-xs">{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Fecha desde */}
            <Input type="date" value={fechaDesde}
              onChange={e => { setFechaDesde(e.target.value); setPage(1); }}
              className="h-9 text-xs" data-testid="filtro-fecha-desde" />

            {/* Fecha hasta */}
            <Input type="date" value={fechaHasta}
              onChange={e => { setFechaHasta(e.target.value); setPage(1); }}
              className="h-9 text-xs" data-testid="filtro-fecha-hasta" />
          </div>
          {(productTmplId || tipoMov || companyKey || locationId || fechaDesde || fechaHasta) && (
            <div className="mt-2 flex justify-end">
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters}
                className="h-7 text-xs text-muted-foreground" data-testid="btn-limpiar-filtros">
                Limpiar filtros
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabla Kardex */}
      <Card>
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">
              Movimientos <span className="text-muted-foreground font-normal">({total})</span>
            </CardTitle>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              Pag {page}/{totalPages || 1}
              <Button type="button" variant="outline" size="icon" className="h-7 w-7"
                disabled={page <= 1} onClick={() => setPage(p => p - 1)} data-testid="btn-prev">
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="outline" size="icon" className="h-7 w-7"
                disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} data-testid="btn-next">
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 px-0 pb-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Sin movimientos</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs" data-testid="tabla-kardex">
                <thead>
                  <tr className="border-b bg-slate-50/80">
                    <th className="py-2 px-3 text-left font-medium text-muted-foreground">Fecha</th>
                    <th className="py-2 px-3 text-left font-medium text-muted-foreground">Producto</th>
                    <th className="py-2 px-3 text-left font-medium text-muted-foreground">Tipo</th>
                    <th className="py-2 px-3 text-right font-medium text-emerald-600">Entrada</th>
                    <th className="py-2 px-3 text-right font-medium text-blue-600">Salida</th>
                    {saldoConfiable && (
                      <th className="py-2 px-3 text-right font-medium text-muted-foreground">Saldo</th>
                    )}
                    <th className="py-2 px-3 text-left font-medium text-muted-foreground hidden lg:table-cell">Referencia</th>
                    <th className="py-2 px-3 text-left font-medium text-muted-foreground hidden xl:table-cell">Origen / Destino</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={`${item.odoo_id}-${i}`} className="border-b last:border-0 hover:bg-slate-50/50"
                      data-testid={`kardex-row-${i}`}>
                      <td className="py-2 px-3 whitespace-nowrap">{formatDate(item.fecha)}</td>
                      <td className="py-2 px-3">
                        <div className="font-medium">{item.producto_nombre}</div>
                        <div className="text-[10px] text-muted-foreground">{item.producto_marca}</div>
                      </td>
                      <td className="py-2 px-3"><TipoBadge tipo={item.tipo_movimiento} /></td>
                      <td className="py-2 px-3 text-right font-medium text-emerald-600">
                        {item.entrada > 0 ? formatNumber(item.entrada, 0) : '-'}
                      </td>
                      <td className="py-2 px-3 text-right font-medium text-blue-600">
                        {item.salida > 0 ? formatNumber(item.salida, 0) : '-'}
                      </td>
                      {saldoConfiable && (
                        <td className={`py-2 px-3 text-right font-bold ${item.saldo_acumulado != null && item.saldo_acumulado >= 0 ? '' : 'text-red-600'}`}>
                          {item.saldo_acumulado != null ? formatNumber(item.saldo_acumulado, 0) : '-'}
                        </td>
                      )}
                      <td className="py-2 px-3 text-muted-foreground hidden lg:table-cell truncate max-w-[150px]">
                        {item.referencia || '-'}
                      </td>
                      <td className="py-2 px-3 text-[10px] text-muted-foreground hidden xl:table-cell">
                        <div className="truncate max-w-[200px]">{item.location_from?.split('/').pop()}</div>
                        <div className="truncate max-w-[200px]">{item.location_to?.split('/').pop()}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resumen por producto */}
      {resumen && resumen.productos.length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-semibold">
              Saldo por Producto <span className="text-muted-foreground font-normal">({resumen.productos.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-0 pb-2">
            <div className="overflow-x-auto">
              <table className="w-full text-xs" data-testid="tabla-resumen-producto">
                <thead>
                  <tr className="border-b bg-slate-50/80">
                    <th className="py-2 px-3 text-left font-medium text-muted-foreground">Producto</th>
                    <th className="py-2 px-3 text-right font-medium text-emerald-600">Entradas</th>
                    <th className="py-2 px-3 text-right font-medium text-blue-600">Salidas</th>
                    <th className="py-2 px-3 text-right font-medium">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {resumen.productos.map((p, i) => (
                    <tr key={p.product_tmpl_id} className="border-b last:border-0 hover:bg-slate-50/50 cursor-pointer"
                      onClick={() => { setProductTmplId(String(p.product_tmpl_id)); setSearchProducto(p.producto_nombre); setPage(1); }}
                      data-testid={`resumen-row-${i}`}>
                      <td className="py-1.5 px-3">
                        <div className="font-medium">{p.producto_nombre}</div>
                        <div className="text-[10px] text-muted-foreground">{p.producto_marca}</div>
                      </td>
                      <td className="py-1.5 px-3 text-right font-medium text-emerald-600">{formatNumber(p.total_entradas, 0)}</td>
                      <td className="py-1.5 px-3 text-right font-medium text-blue-600">{formatNumber(p.total_salidas, 0)}</td>
                      <td className={`py-1.5 px-3 text-right font-bold ${p.saldo >= 0 ? '' : 'text-red-600'}`}>
                        {formatNumber(p.saldo, 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default KardexPT;
