import { useEffect, useState } from 'react';
import axios from 'axios';
import { formatCurrency } from '../lib/utils';
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../components/ui/tabs';
import { Label } from '../components/ui/label';
import { BarChart3, Users, Cog, Filter, X, DollarSign, TrendingUp, Package } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const ReporteProductividad = () => {
  const [reporte, setReporte] = useState(null);
  const [servicios, setServicios] = useState([]);
  const [personas, setPersonas] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Filtros
  const [filtroServicio, setFiltroServicio] = useState('');
  const [filtroPersona, setFiltroPersona] = useState('');
  const [filtroFechaDesde, setFiltroFechaDesde] = useState('');
  const [filtroFechaHasta, setFiltroFechaHasta] = useState('');

  const fetchCatalogos = async () => {
    try {
      const [servRes, persRes] = await Promise.all([
        axios.get(`${API}/servicios-produccion`),
        axios.get(`${API}/personas-produccion`),
      ]);
      setServicios(servRes.data);
      setPersonas(persRes.data);
    } catch (error) {
      toast.error('Error al cargar catálogos');
    }
  };

  const fetchReporte = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtroFechaDesde) params.append('fecha_desde', filtroFechaDesde);
      if (filtroFechaHasta) params.append('fecha_hasta', filtroFechaHasta);
      if (filtroServicio) params.append('servicio_id', filtroServicio);
      if (filtroPersona) params.append('persona_id', filtroPersona);
      
      const response = await axios.get(`${API}/reportes/productividad?${params.toString()}`);
      setReporte(response.data);
    } catch (error) {
      toast.error('Error al cargar reporte');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalogos();
  }, []);

  useEffect(() => {
    fetchReporte();
  }, [filtroFechaDesde, filtroFechaHasta, filtroServicio, filtroPersona]);

  // Auto-resetear filtros si la opción seleccionada queda fuera de la cascada
  useEffect(() => {
    if (!reporte?.cascada) return;
    if (filtroServicio && !reporte.cascada.servicios_disponibles?.some(s => s.id === filtroServicio)) {
      setFiltroServicio('');
    }
    if (filtroPersona && !reporte.cascada.personas_disponibles?.some(p => p.id === filtroPersona)) {
      setFiltroPersona('');
    }
  }, [reporte?.cascada]);

  const limpiarFiltros = () => {
    setFiltroServicio('');
    setFiltroPersona('');
    setFiltroFechaDesde('');
    setFiltroFechaHasta('');
  };

  const hayFiltrosActivos = filtroServicio || filtroPersona || filtroFechaDesde || filtroFechaHasta;

  return (
    <div className="space-y-6" data-testid="reporte-productividad-page">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-6 w-6" />
            Reporte de Productividad
          </h2>
          <p className="text-muted-foreground">
            Análisis de prendas procesadas y costos de mano de obra
          </p>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filtros
            {hayFiltrosActivos && (
              <Button variant="ghost" size="sm" onClick={limpiarFiltros} className="ml-2">
                <X className="h-4 w-4 mr-1" />
                Limpiar
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Fecha Desde</Label>
              <Input
                type="date"
                value={filtroFechaDesde}
                onChange={(e) => setFiltroFechaDesde(e.target.value)}
                data-testid="filtro-fecha-desde"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Fecha Hasta</Label>
              <Input
                type="date"
                value={filtroFechaHasta}
                onChange={(e) => setFiltroFechaHasta(e.target.value)}
                data-testid="filtro-fecha-hasta"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Servicio</Label>
              <Select value={filtroServicio || 'all'} onValueChange={(val) => setFiltroServicio(val === 'all' ? '' : val)}>
                <SelectTrigger data-testid="filtro-servicio">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {/* Cascada: muestra solo servicios con datos en el período + persona seleccionada */}
                  {(reporte?.cascada?.servicios_disponibles || servicios).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {reporte?.cascada?.servicios_disponibles && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {reporte.cascada.servicios_disponibles.length} con datos
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Persona</Label>
              <Select value={filtroPersona || 'all'} onValueChange={(val) => setFiltroPersona(val === 'all' ? '' : val)}>
                <SelectTrigger data-testid="filtro-persona">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {/* Cascada: muestra solo personas con datos en el período + servicio seleccionado */}
                  {(reporte?.cascada?.personas_disponibles || personas).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {reporte?.cascada?.personas_disponibles && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {reporte.cascada.personas_disponibles.length} con datos
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resumen General */}
      {reporte && reporte.resumen && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-500/10 rounded-full">
                  <Package className="h-6 w-6 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Prendas Recibidas</p>
                  <p className="text-2xl font-bold">{(reporte.resumen.recibidas || 0).toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">de {(reporte.resumen.enviadas || 0).toLocaleString()} enviadas</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-500/10 rounded-full">
                  <DollarSign className="h-6 w-6 text-green-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Costo Total</p>
                  <p className="text-2xl font-bold">{formatCurrency(reporte.resumen.costo_total || 0)}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{reporte.resumen.movimientos || 0} mov · {reporte.resumen.registros_distintos || 0} lotes</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-rose-500/10 rounded-full">
                  <TrendingUp className="h-6 w-6 text-rose-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Diferencia (mermas)</p>
                  <p className="text-2xl font-bold text-rose-600">{(reporte.resumen.diferencia || 0).toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">prendas no recibidas</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-purple-500/10 rounded-full">
                  <Users className="h-6 w-6 text-purple-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Personas / Servicios</p>
                  <p className="text-2xl font-bold">{reporte.resumen.personas_distintas || 0} <span className="text-base text-muted-foreground">/ {reporte.resumen.servicios_distintos || 0}</span></p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">activos en el período</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs con detalle */}
      {loading ? (
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">Cargando reporte...</div>
          </CardContent>
        </Card>
      ) : reporte ? (
        <Tabs defaultValue="persona" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="persona" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Por Persona
            </TabsTrigger>
            <TabsTrigger value="servicio" className="flex items-center gap-2">
              <Cog className="h-4 w-4" />
              Por Servicio
            </TabsTrigger>
            <TabsTrigger value="detalle" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Detalle
            </TabsTrigger>
          </TabsList>

          {/* Por Persona */}
          <TabsContent value="persona">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Productividad por Persona</CardTitle>
              </CardHeader>
              <CardContent>
                {(reporte.por_persona || []).length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No hay datos para mostrar
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead>Persona / Taller</TableHead>
                          <TableHead className="text-center">Mov.</TableHead>
                          <TableHead className="text-right">Enviadas</TableHead>
                          <TableHead className="text-right">Recibidas</TableHead>
                          <TableHead className="text-right">Dif.</TableHead>
                          <TableHead className="text-center">Lotes</TableHead>
                          <TableHead className="text-center">Servicios</TableHead>
                          <TableHead className="text-right">Costo Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(reporte.por_persona || []).map((item) => (
                          <TableRow key={item.persona_id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Users className="h-4 w-4 text-muted-foreground" />
                                <div>
                                  <div className="font-medium">{item.persona_nombre}</div>
                                  {item.persona_tipo && <div className="text-[10px] text-muted-foreground">{item.persona_tipo}</div>}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-center font-mono">{item.movimientos || 0}</TableCell>
                            <TableCell className="text-right font-mono">{(item.enviadas || 0).toLocaleString()}</TableCell>
                            <TableCell className="text-right font-mono font-semibold">{(item.recibidas || 0).toLocaleString()}</TableCell>
                            <TableCell className={`text-right font-mono ${item.diferencia > 0 ? 'text-rose-600' : 'text-muted-foreground'}`}>
                              {item.diferencia > 0 ? `-${item.diferencia}` : '0'}
                            </TableCell>
                            <TableCell className="text-center font-mono text-xs">{item.registros_distintos || 0}</TableCell>
                            <TableCell className="text-center font-mono text-xs">{item.servicios_distintos || 0}</TableCell>
                            <TableCell className="text-right font-mono text-green-600 font-semibold">
                              {formatCurrency(item.costo_total || 0)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Por Servicio */}
          <TabsContent value="servicio">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Productividad por Servicio</CardTitle>
              </CardHeader>
              <CardContent>
                {(reporte.por_servicio || []).length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No hay datos para mostrar
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead>Servicio</TableHead>
                          <TableHead className="text-center">Mov.</TableHead>
                          <TableHead className="text-right">Enviadas</TableHead>
                          <TableHead className="text-right">Recibidas</TableHead>
                          <TableHead className="text-right">Dif.</TableHead>
                          <TableHead className="text-center">Lotes</TableHead>
                          <TableHead className="text-center">Personas</TableHead>
                          <TableHead className="text-right">Costo Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(reporte.por_servicio || []).map((item) => (
                          <TableRow key={item.servicio_id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Cog className="h-4 w-4 text-blue-500" />
                                <span className="font-medium">{item.servicio_nombre}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-center font-mono">{item.movimientos || 0}</TableCell>
                            <TableCell className="text-right font-mono">{(item.enviadas || 0).toLocaleString()}</TableCell>
                            <TableCell className="text-right font-mono font-semibold">{(item.recibidas || 0).toLocaleString()}</TableCell>
                            <TableCell className={`text-right font-mono ${item.diferencia > 0 ? 'text-rose-600' : 'text-muted-foreground'}`}>
                              {item.diferencia > 0 ? `-${item.diferencia}` : '0'}
                            </TableCell>
                            <TableCell className="text-center font-mono text-xs">{item.registros_distintos || 0}</TableCell>
                            <TableCell className="text-center font-mono text-xs">{item.personas_distintas || 0}</TableCell>
                            <TableCell className="text-right font-mono text-green-600 font-semibold">
                              {formatCurrency(item.costo_total || 0)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Detalle de movimientos */}
          <TabsContent value="detalle">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Detalle de movimientos ({(reporte.detalle || []).length})</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const params = new URLSearchParams();
                    if (filtroFechaDesde) params.append('fecha_desde', filtroFechaDesde);
                    if (filtroFechaHasta) params.append('fecha_hasta', filtroFechaHasta);
                    if (filtroServicio) params.append('servicio_id', filtroServicio);
                    if (filtroPersona) params.append('persona_id', filtroPersona);
                    window.open(`${API}/reportes/productividad/export?${params.toString()}`, '_blank');
                  }}
                >
                  Exportar Excel
                </Button>
              </CardHeader>
              <CardContent>
                {(reporte.detalle || []).length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No hay movimientos en el período</div>
                ) : (
                  <div className="border rounded-lg overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead>Fecha fin</TableHead>
                          <TableHead>N° Corte</TableHead>
                          <TableHead>Modelo</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Marca</TableHead>
                          <TableHead>Entalle</TableHead>
                          <TableHead>Estado</TableHead>
                          <TableHead>Servicio</TableHead>
                          <TableHead>Persona/Taller</TableHead>
                          <TableHead className="text-right">Env.</TableHead>
                          <TableHead className="text-right">Recib.</TableHead>
                          <TableHead className="text-right">Dif.</TableHead>
                          <TableHead className="text-right">Tarifa</TableHead>
                          <TableHead className="text-right">Costo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(reporte.detalle || []).map((m) => (
                          <TableRow key={m.id}>
                            <TableCell className="text-xs whitespace-nowrap">{m.fecha_fin || '-'}</TableCell>
                            <TableCell className="font-mono text-xs font-bold">{m.n_corte || '-'}</TableCell>
                            <TableCell className="text-xs font-medium">{m.modelo_nombre || '-'}</TableCell>
                            <TableCell className="text-xs">
                              {m.tipo_nombre ? <Badge variant="secondary" className="text-[10px] whitespace-nowrap">{m.tipo_nombre}</Badge> : '-'}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{m.marca_nombre || '-'}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{m.entalle_nombre || '-'}</TableCell>
                            <TableCell><Badge variant="outline" className="text-[10px] whitespace-nowrap">{m.registro_estado || '-'}</Badge></TableCell>
                            <TableCell className="text-xs whitespace-nowrap"><Cog className="inline h-3 w-3 mr-1 text-blue-500" />{m.servicio_nombre}</TableCell>
                            <TableCell className="text-xs whitespace-nowrap">{m.persona_nombre}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{m.cantidad_enviada?.toLocaleString()}</TableCell>
                            <TableCell className="text-right font-mono text-xs font-semibold">{m.cantidad_recibida?.toLocaleString()}</TableCell>
                            <TableCell className={`text-right font-mono text-xs ${m.diferencia > 0 ? 'text-rose-600 font-semibold' : 'text-muted-foreground'}`}>
                              {m.diferencia > 0 ? `-${m.diferencia}` : '0'}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs text-muted-foreground">{m.tarifa_aplicada > 0 ? formatCurrency(m.tarifa_aplicada) : '-'}</TableCell>
                            <TableCell className="text-right font-mono text-xs text-green-700 dark:text-green-400 font-semibold">{formatCurrency(m.costo_calculado)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : null}
    </div>
  );
};
