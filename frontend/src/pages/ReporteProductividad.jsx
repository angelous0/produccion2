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
      if (filtroFechaDesde) params.append('fecha_inicio', filtroFechaDesde);
      if (filtroFechaHasta) params.append('fecha_fin', filtroFechaHasta);
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

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
    }).format(value || 0);
  };

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
              <Select value={filtroServicio} onValueChange={(val) => setFiltroServicio(val === 'all' ? '' : val)}>
                <SelectTrigger data-testid="filtro-servicio">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {servicios.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Persona</Label>
              <Select value={filtroPersona} onValueChange={(val) => setFiltroPersona(val === 'all' ? '' : val)}>
                <SelectTrigger data-testid="filtro-persona">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {personas.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resumen General */}
      {reporte && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-500/10 rounded-full">
                  <Package className="h-6 w-6 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Prendas</p>
                  <p className="text-2xl font-bold">
                    {(reporte.por_persona || []).reduce((sum, p) => sum + (p.total_cantidad || 0), 0).toLocaleString()}
                  </p>
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
                  <p className="text-sm text-muted-foreground">Costo Total Mano de Obra</p>
                  <p className="text-2xl font-bold">
                    {formatCurrency((reporte.por_persona || []).reduce((sum, p) => sum + (p.total_costo || 0), 0))}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-purple-500/10 rounded-full">
                  <TrendingUp className="h-6 w-6 text-purple-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Movimientos</p>
                  <p className="text-2xl font-bold">{(reporte.total_movimientos || 0).toLocaleString()}</p>
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
                          <TableHead>Persona</TableHead>
                          <TableHead className="text-center">Movimientos</TableHead>
                          <TableHead className="text-right">Cantidad Prendas</TableHead>
                          <TableHead className="text-right">Costo Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(reporte.por_persona || []).map((item) => (
                          <TableRow key={item.persona_id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Users className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium">{item.persona_nombre}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-center font-mono">
                              {item.movimientos || 0}
                            </TableCell>
                            <TableCell className="text-right font-mono font-semibold">
                              {(item.total_cantidad || 0).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right font-mono text-green-600 font-semibold">
                              {formatCurrency(item.total_costo || 0)}
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
                          <TableHead className="text-right">Tarifa</TableHead>
                          <TableHead className="text-center">Movimientos</TableHead>
                          <TableHead className="text-right">Cantidad Prendas</TableHead>
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
                            <TableCell className="text-right font-mono text-muted-foreground">
                              {(item.tarifa || 0) > 0 ? formatCurrency(item.tarifa) : '-'}
                            </TableCell>
                            <TableCell className="text-center font-mono">
                              {item.movimientos || 0}
                            </TableCell>
                            <TableCell className="text-right font-mono font-semibold">
                              {(item.total_cantidad || 0).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right font-mono text-green-600 font-semibold">
                              {formatCurrency(item.total_costo || 0)}
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

          {/* Detalle Persona-Servicio */}
          <TabsContent value="detalle">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Detalle Persona - Servicio</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  Este reporte detallado estará disponible próximamente
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : null}
    </div>
  );
};
