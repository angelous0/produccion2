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
import { Layers, Filter, Package } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '../lib/dateUtils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const InventarioRollos = () => {
  const [rollos, setRollos] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroItem, setFiltroItem] = useState('');
  const [filtroActivo, setFiltroActivo] = useState('true');

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtroItem && filtroItem !== 'all') params.append('item_id', filtroItem);
      if (filtroActivo && filtroActivo !== 'all') params.append('activo', filtroActivo);
      
      const [rollosRes, itemsRes] = await Promise.all([
        axios.get(`${API}/inventario-rollos?${params.toString()}`),
        axios.get(`${API}/inventario?all=true`),
      ]);
      setRollos(rollosRes.data);
      // Solo items con control por rollos
      const itemsData = Array.isArray(itemsRes.data) ? itemsRes.data : itemsRes.data.items || [];
      setItems(itemsData.filter(i => i.control_por_rollos));
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

  // Totales
  const totales = rollos.reduce((acc, r) => {
    acc.metrajeTotal += r.metraje || 0;
    acc.metrajeDisponible += r.metraje_disponible || 0;
    return acc;
  }, { metrajeTotal: 0, metrajeDisponible: 0 });

  return (
    <div className="space-y-6" data-testid="rollos-page">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Layers className="h-6 w-6" />
            Rollos de Tela
          </h2>
          <p className="text-muted-foreground">Control individual de rollos por metraje, ancho y tono</p>
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Tela</Label>
              <Select value={filtroItem} onValueChange={setFiltroItem}>
                <SelectTrigger data-testid="filtro-item">
                  <SelectValue placeholder="Todas las telas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las telas</SelectItem>
                  {items.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.codigo} - {item.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Estado</Label>
              <Select value={filtroActivo} onValueChange={setFiltroActivo}>
                <SelectTrigger data-testid="filtro-activo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Con stock disponible</SelectItem>
                  <SelectItem value="false">Agotados</SelectItem>
                  <SelectItem value="all">Todos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-end">
              <Button onClick={handleApplyFilters} data-testid="btn-aplicar-filtros">
                Aplicar Filtros
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Layers className="h-8 w-8 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Total Rollos</p>
                <p className="text-2xl font-bold">{rollos.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Package className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-sm text-muted-foreground">Metraje Total</p>
                <p className="text-2xl font-bold">{totales.metrajeTotal.toFixed(2)} m</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Package className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-sm text-muted-foreground">Disponible</p>
                <p className="text-2xl font-bold text-green-600">{totales.metrajeDisponible.toFixed(2)} m</p>
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
                  <TableHead>N° Rollo</TableHead>
                  <TableHead>Tela</TableHead>
                  <TableHead>Tono</TableHead>
                  <TableHead className="text-right">Metraje</TableHead>
                  <TableHead className="text-right">Disponible</TableHead>
                  <TableHead className="text-right">Ancho</TableHead>
                  <TableHead>Fecha Ingreso</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      Cargando...
                    </TableCell>
                  </TableRow>
                ) : rollos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No hay rollos registrados
                    </TableCell>
                  </TableRow>
                ) : (
                  rollos.map((rollo) => (
                    <TableRow key={rollo.id} className="data-table-row" data-testid={`rollo-row-${rollo.id}`}>
                      <TableCell className="font-mono font-semibold">{rollo.numero_rollo}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{rollo.item_nombre}</p>
                          <p className="text-xs text-muted-foreground font-mono">{rollo.item_codigo}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {rollo.tono ? (
                          <Badge variant="outline">{rollo.tono}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {rollo.metraje?.toFixed(2)} m
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        <span className={rollo.metraje_disponible > 0 ? 'text-green-600' : 'text-red-500'}>
                          {rollo.metraje_disponible?.toFixed(2)} m
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {rollo.ancho > 0 ? `${rollo.ancho} cm` : '-'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDate(rollo.created_at)}
                      </TableCell>
                      <TableCell>
                        {rollo.metraje_disponible > 0 ? (
                          <Badge className="bg-green-600">Disponible</Badge>
                        ) : (
                          <Badge variant="secondary">Agotado</Badge>
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

      {items.length === 0 && !loading && (
        <Card>
          <CardContent className="py-8 text-center">
            <Layers className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No hay items con control por rollos</p>
            <p className="text-sm text-muted-foreground mt-1">
              Activa "Control por Rollos" en un item de categoría Telas para usar esta función
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
