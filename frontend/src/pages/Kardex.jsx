import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '../components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '../components/ui/command';
import { Label } from '../components/ui/label';
import { Separator } from '../components/ui/separator';
import { 
  BookOpen, Package, ArrowDownCircle, ArrowUpCircle, RefreshCw,
  TrendingUp, TrendingDown, Minus, FileSpreadsheet, FileText,
  Loader2, ChevronsUpDown, Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '../lib/dateUtils';
import { cn, formatCurrency } from '../lib/utils';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const Kardex = () => {
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [kardexData, setKardexData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingItems, setLoadingItems] = useState(true);
  const [itemPopoverOpen, setItemPopoverOpen] = useState(false);
  const [excluirMigracion, setExcluirMigracion] = useState(false);

  const fetchItems = async () => {
    try {
      const response = await axios.get(`${API}/inventario?all=true`);
      const data = Array.isArray(response.data) ? response.data : response.data.items || [];
      setItems(data);
    } catch (error) {
      toast.error('Error al cargar items');
    } finally {
      setLoadingItems(false);
    }
  };

  const fetchKardex = async (itemId, excluir = excluirMigracion) => {
    if (!itemId) {
      setKardexData(null);
      return;
    }

    setLoading(true);
    try {
      const params = excluir ? '?excluir_migracion=true' : '';
      const response = await axios.get(`${API}/inventario-kardex/${itemId}${params}`);
      setKardexData(response.data);
    } catch (error) {
      toast.error('Error al cargar kardex');
      setKardexData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  // Auto-seleccionar el primer item si no hay ninguno seleccionado
  useEffect(() => {
    if (items.length > 0 && !selectedItemId) {
      const params = new URLSearchParams(window.location.search);
      const itemParam = params.get('item');
      if (!itemParam) setSelectedItemId(items[0].id);
    }
  }, [items]);

  // Pre-seleccionar item desde query param (?item=id)
  useEffect(() => {
    const itemParam = searchParams.get('item');
    if (itemParam && items.length > 0 && !selectedItemId) {
      const found = items.find(i => i.id === itemParam);
      if (found) setSelectedItemId(itemParam);
    }
  }, [searchParams, items, selectedItemId]);

  useEffect(() => {
    if (selectedItemId) {
      fetchKardex(selectedItemId, excluirMigracion);
    }
  }, [selectedItemId, excluirMigracion]);

  const getTipoIcon = (tipo) => {
    if (tipo === 'ingreso' || tipo === 'ajuste_entrada') {
      return <ArrowDownCircle className="h-4 w-4 text-green-600" />;
    } else if (tipo === 'salida' || tipo === 'ajuste_salida') {
      return <ArrowUpCircle className="h-4 w-4 text-red-500" />;
    }
    return <RefreshCw className="h-4 w-4 text-blue-500" />;
  };

  const getTipoBadge = (tipo) => {
    const labels = {
      'ingreso': 'Ingreso',
      'salida': 'Salida',
      'ajuste_entrada': 'Ajuste +',
      'ajuste_salida': 'Ajuste -'
    };
    const label = labels[tipo] || tipo;
    
    if (tipo === 'ingreso') {
      return <Badge className="bg-green-600">{label}</Badge>;
    } else if (tipo === 'salida') {
      return <Badge variant="destructive">{label}</Badge>;
    } else if (tipo === 'ajuste_entrada') {
      return <Badge className="bg-blue-500">{label}</Badge>;
    } else if (tipo === 'ajuste_salida') {
      return <Badge className="bg-orange-500">{label}</Badge>;
    }
    return <Badge>{label}</Badge>;
  };

  // Calcular totales - el backend devuelve cantidad (positiva/negativa) y tipo
  const totales = kardexData?.movimientos?.reduce((acc, m) => {
    if (m.tipo === 'ingreso') {
      acc.entradas += Math.abs(m.cantidad || 0);
      acc.costoEntradas += m.costo_total || 0;
    } else if (m.tipo === 'salida' || m.tipo === 'ajuste_salida') {
      acc.salidas += Math.abs(m.cantidad || 0);
      acc.costoSalidas += m.costo_total || 0;
    } else if (m.tipo === 'ajuste_entrada') {
      acc.entradas += Math.abs(m.cantidad || 0);
    }
    return acc;
  }, { entradas: 0, salidas: 0, costoEntradas: 0, costoSalidas: 0 }) || { entradas: 0, salidas: 0, costoEntradas: 0, costoSalidas: 0 };

  return (
    <div className="space-y-6" data-testid="kardex-page">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BookOpen className="h-6 w-6" />
            Kardex de Inventario
          </h2>
          <p className="text-muted-foreground">Historial detallado de movimientos por item</p>
        </div>
      </div>

      {/* Selector de Item */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Seleccionar Item</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[280px] max-w-lg">
            <Label className="mb-2 block">Item de Inventario</Label>
            <Popover open={itemPopoverOpen} onOpenChange={setItemPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between font-normal"
                  disabled={loadingItems}
                  data-testid="combobox-item-kardex"
                >
                  {loadingItems ? (
                    <span className="text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Cargando items...</span>
                  ) : selectedItemId ? (
                    <span className="truncate">
                      <span className="font-mono mr-2">{items.find(i => i.id === selectedItemId)?.codigo}</span>
                      {items.find(i => i.id === selectedItemId)?.nombre}
                      <span className="ml-2 text-muted-foreground text-xs">(Stock: {items.find(i => i.id === selectedItemId)?.stock_actual})</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Buscar item...</span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[500px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar por nombre o codigo..." data-testid="search-item-kardex" />
                  <CommandList>
                    <CommandEmpty>Sin resultados</CommandEmpty>
                    <CommandGroup className="max-h-[280px] overflow-auto">
                      {items.map((item) => (
                        <CommandItem
                          key={item.id}
                          value={`${item.codigo} ${item.nombre}`}
                          onSelect={() => {
                            setSelectedItemId(item.id);
                            setItemPopoverOpen(false);
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", selectedItemId === item.id ? "opacity-100" : "opacity-0")} />
                          <span className="font-mono text-xs mr-2 text-muted-foreground">{item.codigo}</span>
                          <span className="truncate flex-1">{item.nombre}</span>
                          <span className="text-xs text-muted-foreground ml-2">Stock: {item.stock_actual}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex items-center gap-2 pb-0.5">
            <input
              type="checkbox"
              id="excluir-migracion"
              checked={excluirMigracion}
              onChange={(e) => setExcluirMigracion(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 accent-primary cursor-pointer"
            />
            <label htmlFor="excluir-migracion" className="text-sm cursor-pointer select-none">
              Ocultar movimientos de carga inicial
            </label>
          </div>
          </div>
        </CardContent>
      </Card>

      {/* Contenido del Kardex */}
      {loading ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Cargando kardex...
          </CardContent>
        </Card>
      ) : kardexData ? (
        <>
          {/* Info del Item */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-primary/10 rounded-lg">
                  <Package className="h-8 w-8 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm text-muted-foreground">{kardexData.item.codigo}</span>
                    <Badge variant="outline">{kardexData.item.unidad_medida}</Badge>
                  </div>
                  <h3 className="text-xl font-semibold">{kardexData.item.nombre}</h3>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Stock Actual</p>
                  <p className="text-3xl font-bold text-primary">{kardexData.item.stock_actual}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Resumen */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <TrendingUp className="h-6 w-6 text-green-600" />
                  <div>
                    <p className="text-sm text-muted-foreground">Total Entradas</p>
                    <p className="text-xl font-bold text-green-600">+{totales.entradas}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <TrendingDown className="h-6 w-6 text-red-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">Total Salidas</p>
                    <p className="text-xl font-bold text-red-500">-{totales.salidas}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <ArrowDownCircle className="h-6 w-6 text-green-600" />
                  <div>
                    <p className="text-sm text-muted-foreground">Costo Entradas</p>
                    <p className="text-lg font-bold">{formatCurrency(totales.costoEntradas)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <ArrowUpCircle className="h-6 w-6 text-red-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">Costo Salidas</p>
                    <p className="text-lg font-bold">{formatCurrency(totales.costoSalidas)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Package className="h-6 w-6 text-primary" />
                  <div>
                    <p className="text-sm text-muted-foreground">Valorizado</p>
                    <p className="text-lg font-bold text-primary">{formatCurrency(kardexData.valorizado || 0)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabla Kardex */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Movimientos</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="data-table-header">
                      <TableHead>Fecha</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Documento</TableHead>
                      <TableHead className="text-right">Entrada</TableHead>
                      <TableHead className="text-right">Salida</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                      <TableHead className="text-right">Costo Unit.</TableHead>
                      <TableHead className="text-right">Costo Total</TableHead>
                      <TableHead className="text-right">Saldo Valor.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {kardexData.movimientos.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                          No hay movimientos registrados
                        </TableCell>
                      </TableRow>
                    ) : (
                      kardexData.movimientos.map((mov, index) => (
                        <TableRow key={mov.id || index} className="data-table-row" data-testid={`kardex-row-${index}`}>
                          <TableCell className="font-mono text-sm">
                            {formatDate(mov.fecha)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getTipoIcon(mov.tipo)}
                              {getTipoBadge(mov.tipo)}
                            </div>
                          </TableCell>
                          <TableCell>
                            {mov.documento || (
                              <span className="text-muted-foreground text-sm truncate max-w-[150px] block">
                                {mov.observaciones || '-'}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {(mov.tipo === 'ingreso' || mov.tipo === 'ajuste_entrada') ? (
                              <span className="text-green-600 font-semibold">+{Math.abs(mov.cantidad)}</span>
                            ) : (
                              <Minus className="h-4 w-4 text-muted-foreground mx-auto" />
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {(mov.tipo === 'salida' || mov.tipo === 'ajuste_salida') ? (
                              <span className="text-red-500 font-semibold">-{Math.abs(mov.cantidad)}</span>
                            ) : (
                              <Minus className="h-4 w-4 text-muted-foreground mx-auto" />
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold bg-muted/30">
                            <span className={parseFloat(mov.saldo) < 0 ? 'text-red-500' : ''}>{mov.saldo}</span>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {mov.costo_unitario > 0 ? formatCurrency(mov.costo_unitario) : '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {mov.costo_total > 0 ? formatCurrency(mov.costo_total) : '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold text-primary bg-primary/5">
                            {mov.saldo_valorizado != null ? formatCurrency(mov.saldo_valorizado) : '-'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : selectedItemId ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Error al cargar el kardex
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">Selecciona un item para ver su kardex</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
