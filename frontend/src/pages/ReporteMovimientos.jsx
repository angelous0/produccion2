import { useEffect, useState } from 'react';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Label } from '../components/ui/label';
import { 
  FileText, 
  ArrowDownCircle, 
  ArrowUpCircle, 
  RefreshCw,
  Filter,
  X,
  Link2
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '../lib/dateUtils';
import { formatCurrency } from '../lib/utils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const ReporteMovimientos = () => {
  const [movimientos, setMovimientos] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filtros
  const [filtroItem, setFiltroItem] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroFechaDesde, setFiltroFechaDesde] = useState('');
  const [filtroFechaHasta, setFiltroFechaHasta] = useState('');
  const [filtersVisible, setFiltersVisible] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Construir query params
      const params = new URLSearchParams();
      if (filtroItem) params.append('item_id', filtroItem);
      if (filtroTipo) params.append('tipo', filtroTipo);
      if (filtroFechaDesde) params.append('fecha_desde', filtroFechaDesde);
      if (filtroFechaHasta) params.append('fecha_hasta', filtroFechaHasta);
      
      const [movimientosRes, itemsRes] = await Promise.allSettled([
        axios.get(`${API}/inventario-movimientos?${params.toString()}`),
        axios.get(`${API}/inventario?all=true`),
      ]);
      if (movimientosRes.status === 'fulfilled') {
        const movData = Array.isArray(movimientosRes.value.data) ? movimientosRes.value.data : movimientosRes.value.data.items || [];
        setMovimientos(movData);
      } else {
        toast.error('Error al cargar movimientos');
      }
      if (itemsRes.status === 'fulfilled') {
        const itemsData = Array.isArray(itemsRes.value.data) ? itemsRes.value.data : itemsRes.value.data.items || [];
        setItems(itemsData);
      }
    } catch (error) {
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleApplyFilters = () => {
    fetchData();
  };

  const handleClearFilters = () => {
    setFiltroItem('');
    setFiltroTipo('');
    setFiltroFechaDesde('');
    setFiltroFechaHasta('');
    setTimeout(fetchData, 0);
  };

  const getTipoIcon = (tipo) => {
    switch (tipo) {
      case 'ingreso':
        return <ArrowDownCircle className="h-4 w-4 text-green-600" />;
      case 'salida':
        return <ArrowUpCircle className="h-4 w-4 text-red-500" />;
      case 'ajuste_entrada':
        return <RefreshCw className="h-4 w-4 text-blue-500" />;
      case 'ajuste_salida':
        return <RefreshCw className="h-4 w-4 text-orange-500" />;
      default:
        return null;
    }
  };

  const getTipoBadge = (tipo) => {
    switch (tipo) {
      case 'ingreso':
        return <Badge className="bg-green-600">Ingreso</Badge>;
      case 'salida':
        return <Badge variant="destructive">Salida</Badge>;
      case 'ajuste_entrada':
        return <Badge className="bg-blue-500">Ajuste +</Badge>;
      case 'ajuste_salida':
        return <Badge className="bg-orange-500">Ajuste -</Badge>;
      default:
        return <Badge>{tipo}</Badge>;
    }
  };

  // Totales
  const totales = movimientos.reduce((acc, m) => {
    acc.entradas += m.cantidad > 0 ? m.cantidad : 0;
    acc.salidas += m.cantidad < 0 ? Math.abs(m.cantidad) : 0;
    acc.costoTotal += m.costo_total || 0;
    return acc;
  }, { entradas: 0, salidas: 0, costoTotal: 0 });

  const hasFilters = filtroItem || filtroTipo || filtroFechaDesde || filtroFechaHasta;

  return (
    <div className="space-y-6" data-testid="reporte-movimientos-page">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="h-6 w-6" />
            Reporte de Movimientos
          </h2>
          <p className="text-muted-foreground">Historial de todos los movimientos de inventario</p>
        </div>
        <Button 
          variant="outline" 
          onClick={() => setFiltersVisible(!filtersVisible)}
          data-testid="btn-toggle-filters"
        >
          <Filter className="h-4 w-4 mr-2" />
          Filtros
          {hasFilters && <Badge variant="secondary" className="ml-2">{[filtroItem, filtroTipo, filtroFechaDesde, filtroFechaHasta].filter(Boolean).length}</Badge>}
        </Button>
      </div>

      {/* Panel de filtros */}
      {filtersVisible && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Filtros</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Item</Label>
                <Select value={filtroItem || "all"} onValueChange={(v) => setFiltroItem(v === "all" ? "" : v)}>
                  <SelectTrigger data-testid="filtro-item">
                    <SelectValue placeholder="Todos los items" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los items</SelectItem>
                    {items.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.codigo} - {item.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={filtroTipo || "all"} onValueChange={(v) => setFiltroTipo(v === "all" ? "" : v)}>
                  <SelectTrigger data-testid="filtro-tipo">
                    <SelectValue placeholder="Todos los tipos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los tipos</SelectItem>
                    <SelectItem value="ingreso">Ingresos</SelectItem>
                    <SelectItem value="salida">Salidas</SelectItem>
                    <SelectItem value="ajuste">Ajustes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Fecha Desde</Label>
                <Input
                  type="date"
                  value={filtroFechaDesde}
                  onChange={(e) => setFiltroFechaDesde(e.target.value)}
                  data-testid="filtro-fecha-desde"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Fecha Hasta</Label>
                <Input
                  type="date"
                  value={filtroFechaHasta}
                  onChange={(e) => setFiltroFechaHasta(e.target.value)}
                  data-testid="filtro-fecha-hasta"
                />
              </div>
            </div>
            
            <div className="flex gap-2 mt-4">
              <Button onClick={handleApplyFilters} data-testid="btn-aplicar-filtros">
                Aplicar Filtros
              </Button>
              <Button variant="outline" onClick={handleClearFilters} data-testid="btn-limpiar-filtros">
                <X className="h-4 w-4 mr-1" />
                Limpiar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <ArrowDownCircle className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-sm text-muted-foreground">Total Entradas</p>
                <p className="text-2xl font-bold text-green-600">+{totales.entradas.toLocaleString('es-PE', { maximumFractionDigits: 2 })}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <ArrowUpCircle className="h-8 w-8 text-red-500" />
              <div>
                <p className="text-sm text-muted-foreground">Total Salidas</p>
                <p className="text-2xl font-bold text-red-500">-{totales.salidas.toLocaleString('es-PE', { maximumFractionDigits: 2 })}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Movimientos</p>
                <p className="text-2xl font-bold">{movimientos.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabla */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="data-table-header">
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Costo Unit.</TableHead>
                  <TableHead className="text-right">Costo Total</TableHead>
                  <TableHead>Referencia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      Cargando...
                    </TableCell>
                  </TableRow>
                ) : movimientos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No hay movimientos registrados
                    </TableCell>
                  </TableRow>
                ) : (
                  movimientos.map((mov) => (
                    <TableRow key={mov.id} className="data-table-row" data-testid={`mov-row-${mov.id}`}>
                      <TableCell className="font-mono text-sm">
                        {formatDate(mov.fecha)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getTipoIcon(mov.tipo)}
                          {getTipoBadge(mov.tipo)}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono">{mov.item_codigo}</TableCell>
                      <TableCell>{mov.item_nombre}</TableCell>
                      <TableCell className={`text-right font-mono font-semibold ${mov.cantidad >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {mov.cantidad >= 0 ? '+' : ''}{mov.cantidad}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {mov.costo_unitario > 0 ? formatCurrency(mov.costo_unitario) : '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {mov.costo_total > 0 ? formatCurrency(mov.costo_total) : '-'}
                      </TableCell>
                      <TableCell>
                        {mov.registro_n_corte ? (
                          <Badge variant="outline" className="gap-1">
                            <Link2 className="h-3 w-3" />
                            #{mov.registro_n_corte}
                          </Badge>
                        ) : mov.documento ? (
                          <span className="text-sm text-muted-foreground">{mov.documento}</span>
                        ) : mov.observaciones ? (
                          <span className="text-sm text-muted-foreground truncate max-w-[200px] block">{mov.observaciones}</span>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
