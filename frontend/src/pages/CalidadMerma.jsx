import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
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
import { AlertTriangle, Filter, Trash2, RefreshCw, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '../lib/dateUtils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const CalidadMerma = () => {
  const navigate = useNavigate();
  const [mermas, setMermas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [registros, setRegistros] = useState([]);
  const [servicios, setServicios] = useState([]);
  const [personas, setPersonas] = useState([]);

  // Filtros
  const [filtroRegistro, setFiltroRegistro] = useState('');
  const [filtroServicio, setFiltroServicio] = useState('');
  const [filtroPersona, setFiltroPersona] = useState('');

  const fetchData = async () => {
    try {
      const [mermasRes, registrosRes, serviciosRes, personasRes] = await Promise.all([
        axios.get(`${API}/mermas`),
        axios.get(`${API}/registros?all=true`),
        axios.get(`${API}/servicios-produccion`),
        axios.get(`${API}/personas-produccion`),
      ]);
      setMermas(mermasRes.data);
      // Handle both paginated response {items: []} and plain array
      const registrosData = registrosRes.data;
      setRegistros(Array.isArray(registrosData) ? registrosData : (registrosData.items || []));
      setServicios(serviciosRes.data);
      setPersonas(personasRes.data);
    } catch (error) {
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este registro de merma?')) return;
    try {
      await axios.delete(`${API}/mermas/${id}`);
      toast.success('Merma eliminada');
      fetchData();
    } catch (error) {
      toast.error('Error al eliminar');
    }
  };

  const limpiarFiltros = () => {
    setFiltroRegistro('');
    setFiltroServicio('');
    setFiltroPersona('');
  };

  // Filtrar mermas
  const mermasFiltradas = mermas.filter(m => {
    if (filtroRegistro && m.registro_id !== filtroRegistro) return false;
    if (filtroServicio && m.servicio_id !== filtroServicio) return false;
    if (filtroPersona && m.persona_id !== filtroPersona) return false;
    return true;
  });

  // Calcular totales
  const totalMerma = mermasFiltradas.reduce((sum, m) => sum + (m.cantidad || 0), 0);

  if (loading) {
    return <div className="flex justify-center p-8">Cargando...</div>;
  }

  return (
    <div className="space-y-6" data-testid="calidad-merma-page">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-orange-500" />
            Calidad / Merma
          </h1>
          <p className="text-muted-foreground">
            Registro de diferencias entre cantidad enviada y recibida
          </p>
        </div>
        <Button variant="outline" onClick={fetchData}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Actualizar
        </Button>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Registros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mermasFiltradas.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Prendas Perdidas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{totalMerma}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Servicios Afectados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(mermasFiltradas.map(m => m.servicio_id)).size}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Registro</Label>
              <Select value={filtroRegistro} onValueChange={setFiltroRegistro}>
                <SelectTrigger data-testid="filtro-registro">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {registros.map(r => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.modelo_nombre} - {r.n_corte}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Servicio</Label>
              <Select value={filtroServicio} onValueChange={setFiltroServicio}>
                <SelectTrigger data-testid="filtro-servicio">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {servicios.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Persona</Label>
              <Select value={filtroPersona} onValueChange={setFiltroPersona}>
                <SelectTrigger data-testid="filtro-persona">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {personas.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={limpiarFiltros} className="w-full">
                Limpiar Filtros
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabla de mermas */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Fecha</TableHead>
                <TableHead>Registro</TableHead>
                <TableHead>Servicio</TableHead>
                <TableHead>Persona</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead className="w-[80px]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mermasFiltradas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {mermas.length === 0 
                      ? 'No hay registros de merma. Se crean automáticamente cuando hay diferencia entre cantidad enviada y recibida.'
                      : 'No hay resultados con los filtros aplicados'
                    }
                  </TableCell>
                </TableRow>
              ) : (
                mermasFiltradas.map((merma) => (
                  <TableRow key={merma.id} data-testid={`merma-row-${merma.id}`}>
                    <TableCell className="font-mono text-sm">
                      {formatDate(merma.fecha || merma.created_at)}
                    </TableCell>
                    <TableCell>
                      {merma.registro_id ? (
                        <Button
                          variant="link"
                          className="p-0 h-auto font-medium text-primary hover:underline"
                          onClick={() => navigate(`/registros/editar/${merma.registro_id}`)}
                          data-testid={`ver-registro-${merma.id}`}
                        >
                          {merma.registro_n_corte || 'Ver registro'}
                          <ExternalLink className="h-3 w-3 ml-1" />
                        </Button>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{merma.servicio_nombre || '-'}</Badge>
                    </TableCell>
                    <TableCell>{merma.persona_nombre || '-'}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="destructive" className="font-mono">
                        -{merma.cantidad}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      {merma.motivo || '-'}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(merma.id)}
                        data-testid={`delete-merma-${merma.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
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
