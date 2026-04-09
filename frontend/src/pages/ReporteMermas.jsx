import { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
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
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { AlertTriangle, Filter, FileText, TrendingDown, Users, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '../lib/dateUtils';
import { ExportButton } from '../components/ExportButton';
import { ExportPDFButton } from '../components/ExportPDFButton';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899'];

export const ReporteMermas = () => {
  const [reporte, setReporte] = useState(null);
  const [loading, setLoading] = useState(true);
  const [personas, setPersonas] = useState([]);
  const [servicios, setServicios] = useState([]);

  // Filtros
  const [filtros, setFiltros] = useState({
    fecha_inicio: '',
    fecha_fin: '',
    persona_id: '',
    servicio_id: '',
  });

  const fetchMaestros = async () => {
    try {
      const [personasRes, serviciosRes] = await Promise.all([
        axios.get(`${API}/personas-produccion`),
        axios.get(`${API}/servicios-produccion`),
      ]);
      setPersonas(personasRes.data);
      setServicios(serviciosRes.data);
    } catch (error) {
      console.error('Error fetching maestros:', error);
    }
  };

  const fetchReporte = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtros.fecha_inicio) params.append('fecha_inicio', filtros.fecha_inicio);
      if (filtros.fecha_fin) params.append('fecha_fin', filtros.fecha_fin);
      if (filtros.persona_id) params.append('persona_id', filtros.persona_id);
      if (filtros.servicio_id) params.append('servicio_id', filtros.servicio_id);

      const response = await axios.get(`${API}/reportes/mermas?${params.toString()}`);
      setReporte(response.data);
    } catch (error) {
      toast.error('Error al cargar reporte');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMaestros();
    fetchReporte();
  }, []);

  const handleFiltrar = () => {
    fetchReporte();
  };

  const handleLimpiarFiltros = () => {
    setFiltros({
      fecha_inicio: '',
      fecha_fin: '',
      persona_id: '',
      servicio_id: '',
    });
  };

  // Columnas para PDF
  const pdfColumns = [
    { header: 'Fecha', key: 'fecha' },
    { header: 'N° Corte', key: 'n_corte' },
    { header: 'Persona', key: 'persona_nombre' },
    { header: 'Servicio', key: 'servicio_nombre' },
    { header: 'Cantidad', key: 'cantidad' },
    { header: 'Motivo', key: 'motivo' },
  ];

  // Datos formateados para PDF
  const pdfData = reporte?.mermas?.map(m => ({
    ...m,
    fecha: formatDate(m.fecha),
    n_corte: m.n_corte || '-',
    persona_nombre: m.persona_nombre || '-',
    servicio_nombre: m.servicio_nombre || '-',
  })) || [];

  const pdfSummary = reporte ? {
    'Total Registros': reporte.total_registros,
    'Total Cantidad Merma': reporte.total_cantidad,
    'Período': filtros.fecha_inicio && filtros.fecha_fin 
      ? `${filtros.fecha_inicio} al ${filtros.fecha_fin}` 
      : 'Todo el período',
  } : {};

  return (
    <div className="space-y-6" data-testid="reporte-mermas-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-red-500" />
            Reporte de Mermas
          </h2>
          <p className="text-muted-foreground">Análisis de mermas por período, persona y servicio</p>
        </div>
        <div className="flex gap-2">
          <ExportPDFButton
            title="Reporte de Mermas"
            columns={pdfColumns}
            data={pdfData}
            filename="reporte_mermas"
            summary={pdfSummary}
          />
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label>Desde</Label>
              <Input
                type="date"
                value={filtros.fecha_inicio}
                onChange={(e) => setFiltros({ ...filtros, fecha_inicio: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Hasta</Label>
              <Input
                type="date"
                value={filtros.fecha_fin}
                onChange={(e) => setFiltros({ ...filtros, fecha_fin: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Persona</Label>
              <Select 
                value={filtros.persona_id || "all"} 
                onValueChange={(v) => setFiltros({ ...filtros, persona_id: v === "all" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {personas.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Servicio</Label>
              <Select 
                value={filtros.servicio_id || "all"} 
                onValueChange={(v) => setFiltros({ ...filtros, servicio_id: v === "all" ? "" : v })}
              >
                <SelectTrigger>
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
            <div className="space-y-2 flex items-end gap-2">
              <Button onClick={handleFiltrar} className="flex-1">
                <Filter className="h-4 w-4 mr-2" />
                Filtrar
              </Button>
              <Button variant="outline" onClick={handleLimpiarFiltros}>
                Limpiar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cards de resumen */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Mermas</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{reporte?.total_registros || 0}</div>
            <p className="text-xs text-muted-foreground">registros de merma</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cantidad Total</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{reporte?.total_cantidad || 0}</div>
            <p className="text-xs text-muted-foreground">unidades perdidas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Personas Afectadas</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{reporte?.por_persona?.length || 0}</div>
            <p className="text-xs text-muted-foreground">con mermas registradas</p>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Mermas por Persona */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Mermas por Persona
            </CardTitle>
            <CardDescription>Distribución de cantidad por persona</CardDescription>
          </CardHeader>
          <CardContent>
            {reporte?.por_persona?.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={reporte.por_persona} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11 }} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Bar dataKey="value" fill="#ef4444" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                Sin datos
              </div>
            )}
          </CardContent>
        </Card>

        {/* Mermas por Servicio */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5" />
              Mermas por Servicio
            </CardTitle>
            <CardDescription>Distribución por tipo de servicio</CardDescription>
          </CardHeader>
          <CardContent>
            {reporte?.por_servicio?.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={reporte.por_servicio}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, value }) => `${name}: ${value}`}
                    labelLine={false}
                  >
                    {reporte.por_servicio.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                Sin datos
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabla de detalle */}
      <Card>
        <CardHeader>
          <CardTitle>Detalle de Mermas</CardTitle>
          <CardDescription>{reporte?.total_registros || 0} registros encontrados</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>N° Corte</TableHead>
                <TableHead>Persona</TableHead>
                <TableHead>Servicio</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead>Motivo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">Cargando...</TableCell>
                </TableRow>
              ) : reporte?.mermas?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No hay mermas registradas en este período
                  </TableCell>
                </TableRow>
              ) : (
                reporte?.mermas?.map((merma) => (
                  <TableRow key={merma.id}>
                    <TableCell>{formatDate(merma.fecha)}</TableCell>
                    <TableCell>
                      {merma.n_corte ? (
                        <Badge variant="outline">{merma.n_corte}</Badge>
                      ) : '-'}
                    </TableCell>
                    <TableCell>{merma.persona_nombre || '-'}</TableCell>
                    <TableCell>{merma.servicio_nombre || '-'}</TableCell>
                    <TableCell className="text-right font-mono text-red-600">
                      {merma.cantidad}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate" title={merma.motivo}>
                      {merma.motivo || '-'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
