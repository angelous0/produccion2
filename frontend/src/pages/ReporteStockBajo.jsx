import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { Label } from '../components/ui/label';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '../components/ui/tooltip';
import {
  AlertTriangle, PackageX, Package, EyeOff, Eye, RefreshCw, ArrowDown,
} from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const ReporteStockBajo = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modo, setModo] = useState('fisico');
  const [mostrarIgnorados, setMostrarIgnorados] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ modo });
      if (mostrarIgnorados) params.set('incluir_ignorados', 'true');
      const res = await axios.get(`${API}/inventario/alertas-stock?${params.toString()}`);
      setData(res.data);
    } catch (error) {
      toast.error('Error al cargar alertas de stock');
    } finally {
      setLoading(false);
    }
  }, [modo, mostrarIgnorados]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleIgnorar = async (itemId) => {
    try {
      const res = await axios.put(`${API}/inventario/${itemId}/ignorar-alerta`);
      toast.success(res.data.ignorar_alerta_stock ? 'Item ignorado de alertas' : 'Item restaurado a alertas');
      fetchData();
    } catch (error) {
      toast.error('Error al actualizar');
    }
  };

  const sinStock = data?.sin_stock || 0;
  const stockBajo = data?.stock_bajo || 0;
  const total = data?.total || 0;

  return (
    <div className="space-y-4" data-testid="reporte-stock-bajo">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Alertas de Stock</h2>
          <p className="text-muted-foreground">
            Items de materia prima con stock por debajo del minimo configurado
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} data-testid="btn-refresh-stock">
          <RefreshCw className="h-4 w-4 mr-2" /> Actualizar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className={sinStock > 0 ? 'border-red-500/50 bg-red-500/5' : ''}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Sin Stock</CardTitle>
            <PackageX className="h-5 w-5 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600" data-testid="kpi-sin-stock">{sinStock}</div>
            <p className="text-xs text-muted-foreground mt-1">Items agotados</p>
          </CardContent>
        </Card>
        <Card className={stockBajo > 0 ? 'border-yellow-500/50 bg-yellow-500/5' : ''}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Stock Bajo</CardTitle>
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600" data-testid="kpi-stock-bajo">{stockBajo}</div>
            <p className="text-xs text-muted-foreground mt-1">Por debajo del minimo</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Alertas</CardTitle>
            <Package className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="kpi-total-alertas">{total}</div>
            <p className="text-xs text-muted-foreground mt-1">Items que requieren atencion</p>
          </CardContent>
        </Card>
      </div>

      {/* Controles con tabs Activos / Ignorados */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-1.5 rounded-lg border p-1 bg-muted/30">
          <button
            onClick={() => setMostrarIgnorados(false)}
            className={"px-4 py-1.5 text-sm font-medium rounded-md transition-all " + (!mostrarIgnorados ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}
            data-testid="tab-activos-stock"
          >
            Activos
            {!mostrarIgnorados && <span className="ml-1.5 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-bold">{total}</span>}
          </button>
          <button
            onClick={() => setMostrarIgnorados(true)}
            className={"px-4 py-1.5 text-sm font-medium rounded-md transition-all " + (mostrarIgnorados ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}
            data-testid="tab-ignorados-stock"
          >
            Ignorados
          </button>
        </div>
        <Select value={modo} onValueChange={setModo}>
          <SelectTrigger className="w-[200px] h-9" data-testid="select-modo-stock">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fisico">Stock Fisico</SelectItem>
            <SelectItem value="disponible">Stock Disponible (- reservas)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabla */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="data-table-header">
                  <TableHead>Item</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Unidad</TableHead>
                  <TableHead className="text-right">Stock Actual</TableHead>
                  <TableHead className="text-right">Reservado</TableHead>
                  <TableHead className="text-right">Disponible</TableHead>
                  <TableHead className="text-right">Stock Min</TableHead>
                  <TableHead className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <ArrowDown className="h-3 w-3" /> Faltante
                    </div>
                  </TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-[60px] text-center">Ignorar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8">Cargando...</TableCell>
                  </TableRow>
                ) : !data?.items?.length ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <Package className="h-10 w-10 text-green-500" />
                        <p className="font-medium text-green-600">Sin alertas de stock</p>
                        <p className="text-sm">
                          Todos los items con stock minimo configurado estan OK.
                          {!mostrarIgnorados && ' Activa "Mostrar items ignorados" para ver los archivados.'}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  data.items.map((item) => (
                    <TableRow
                      key={item.id}
                      className={`${item.ignorar_alerta_stock ? 'opacity-50' : ''} ${item.estado_stock === 'SIN_STOCK' ? 'bg-red-500/5' : 'bg-yellow-500/5'}`}
                      data-testid={`alerta-row-${item.id}`}
                    >
                      <TableCell>
                        <div>
                          <span className="font-medium text-sm">{item.nombre}</span>
                          <span className="block text-xs text-muted-foreground font-mono">{item.codigo}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{item.categoria}</Badge>
                      </TableCell>
                      <TableCell className="capitalize text-sm">{item.unidad_medida}</TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        <span className={item.stock_actual <= 0 ? 'text-red-600' : ''}>{item.stock_actual}</span>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {item.total_reservado > 0 ? (
                          <span className="text-orange-500">{item.total_reservado}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        <span className={item.stock_disponible <= item.stock_minimo ? 'text-red-500' : 'text-green-600'}>
                          {item.stock_disponible}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">{item.stock_minimo}</TableCell>
                      <TableCell className="text-right font-mono font-bold text-red-600" data-testid={`faltante-${item.id}`}>
                        {item.faltante > 0 ? `-${item.faltante}` : '0'}
                      </TableCell>
                      <TableCell>
                        {item.estado_stock === 'SIN_STOCK' ? (
                          <Badge variant="destructive" className="gap-1">
                            <PackageX className="h-3 w-3" /> Sin stock
                          </Badge>
                        ) : (
                          <Badge className="bg-yellow-500 gap-1">
                            <AlertTriangle className="h-3 w-3" /> Bajo
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => toggleIgnorar(item.id)}
                                data-testid={`btn-ignorar-${item.id}`}
                              >
                                {item.ignorar_alerta_stock ? (
                                  <Eye className="h-4 w-4 text-green-600" />
                                ) : (
                                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {item.ignorar_alerta_stock ? 'Restaurar alerta' : 'Ignorar este item (no me interesa)'}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Nota informativa */}
      <p className="text-xs text-muted-foreground text-center">
        Solo se muestran items con stock minimo configurado {'>'} 0. Para configurar el stock minimo, edita cada item desde Inventario.
      </p>
    </div>
  );
};
