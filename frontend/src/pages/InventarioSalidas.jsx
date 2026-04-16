import { useEffect, useState } from 'react';
import axios from 'axios';
import { useSaving } from '../hooks/useSaving';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Plus, Trash2, ArrowUpCircle, Link2, Layers, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { NumericInput } from '../components/ui/numeric-input';
import { SalidaRollosDialog } from '../components/SalidaRollosDialog';
import { formatDate } from '../lib/dateUtils';
import { formatCurrency } from '../lib/utils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const InventarioSalidas = () => {
  const [salidas, setSalidas] = useState([]);
  const [items, setItems] = useState([]);
  const [registros, setRegistros] = useState([]);
  const [loading, setLoading] = useState(true);
  const { saving, guard } = useSaving();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSalida, setEditingSalida] = useState(null);
  const [rollosDialogOpen, setRollosDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [rollosDisponibles, setRollosDisponibles] = useState([]);
  const [selectedRollo, setSelectedRollo] = useState(null);
  const [formData, setFormData] = useState({
    item_id: '',
    cantidad: 1,
    registro_id: '',
    rollo_id: '',
    observaciones: '',
  });

  const fetchData = async () => {
    try {
      const [salidasRes, itemsRes, registrosRes] = await Promise.all([
        axios.get(`${API}/inventario-salidas`),
        axios.get(`${API}/inventario?all=true`),
        axios.get(`${API}/registros?all=true`),
      ]);
      setSalidas(salidasRes.data);
      setItems(itemsRes.data);
      // Handle both paginated response {items: []} and plain array
      const registrosData = registrosRes.data;
      setRegistros(Array.isArray(registrosData) ? registrosData : (registrosData.items || []));
    } catch (error) {
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const resetForm = () => {
    setFormData({
      item_id: '',
      cantidad: 1,
      registro_id: '',
      rollo_id: '',
      observaciones: '',
    });
    setSelectedItem(null);
    setRollosDisponibles([]);
    setSelectedRollo(null);
  };

  const handleOpenDialog = () => {
    setEditingSalida(null);
    resetForm();
    setDialogOpen(true);
  };

  const handleOpenEdit = (salida) => {
    setEditingSalida(salida);
    setFormData({
      item_id: salida.item_id,
      cantidad: salida.cantidad,
      registro_id: salida.registro_id || '',
      rollo_id: salida.rollo_id || '',
      observaciones: salida.observaciones || '',
    });
    setDialogOpen(true);
  };

  const handleItemChange = async (itemId) => {
    const item = items.find(i => i.id === itemId);
    setSelectedItem(item);
    setSelectedRollo(null);
    setFormData({ ...formData, item_id: itemId, rollo_id: '', cantidad: 1 });
    
    // Si tiene control por rollos, cargar rollos disponibles
    if (item?.control_por_rollos) {
      try {
        const response = await axios.get(`${API}/inventario-rollos?item_id=${itemId}&activo=true`);
        setRollosDisponibles(response.data.filter(r => r.metraje_disponible > 0));
      } catch (error) {
        console.error('Error loading rollos:', error);
        setRollosDisponibles([]);
      }
    } else {
      setRollosDisponibles([]);
    }
  };

  const handleRolloChange = (rolloId) => {
    const rollo = rollosDisponibles.find(r => r.id === rolloId);
    setSelectedRollo(rollo);
    setFormData({ ...formData, rollo_id: rolloId, cantidad: 1 });
  };

  const handleSubmit = guard(async (e) => {
    e.preventDefault();
    try {
      if (editingSalida) {
        // Solo permitir editar observaciones
        await axios.put(`${API}/inventario-salidas/${editingSalida.id}`, {
          observaciones: formData.observaciones,
        });
        toast.success('Salida actualizada');
      } else {
        const payload = { ...formData };
        if (!payload.registro_id) {
          delete payload.registro_id;
        }
        if (!payload.rollo_id) {
          delete payload.rollo_id;
        }
        await axios.post(`${API}/inventario-salidas`, payload);
        toast.success('Salida registrada');
      }
      setDialogOpen(false);
      setEditingSalida(null);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response?.data?.detail : 'Error al guardar');
    }
  });

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar esta salida? Se restaurará el stock.')) return;
    try {
      await axios.delete(`${API}/inventario-salidas/${id}`);
      toast.success('Salida eliminada');
      fetchData();
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response?.data?.detail : 'Error al eliminar');
    }
  };

  return (
    <div className="space-y-6" data-testid="salidas-page">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Salidas de Inventario</h2>
          <p className="text-muted-foreground">Registro de salidas con método FIFO</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setRollosDialogOpen(true)} data-testid="btn-salida-rollos">
            <Layers className="h-4 w-4 mr-2" />
            Salida de Rollos
          </Button>
          <Button onClick={handleOpenDialog} data-testid="btn-nueva-salida">
            <Plus className="h-4 w-4 mr-2" />
            Nueva Salida
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="data-table-header">
                  <TableHead>Fecha</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Rollo</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Costo FIFO</TableHead>
                  <TableHead>Registro Vinculado</TableHead>
                  <TableHead className="w-[80px]">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      Cargando...
                    </TableCell>
                  </TableRow>
                ) : salidas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No hay salidas registradas
                    </TableCell>
                  </TableRow>
                ) : (
                  salidas.map((salida) => (
                    <TableRow key={salida.id} className="data-table-row" data-testid={`salida-row-${salida.id}`}>
                      <TableCell className="font-mono text-sm">
                        {formatDate(salida.fecha)}
                      </TableCell>
                      <TableCell className="font-mono">{salida.item_codigo}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <ArrowUpCircle className="h-4 w-4 text-red-500" />
                          {salida.item_nombre}
                        </div>
                      </TableCell>
                      <TableCell>
                        {salida.rollo_numero ? (
                          <Badge variant="outline" className="gap-1">
                            <Layers className="h-3 w-3" />
                            {salida.rollo_numero}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {salida.cantidad}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(salida.costo_total)}
                      </TableCell>
                      <TableCell>
                        {salida.registro_n_corte ? (
                          <Badge variant="outline" className="gap-1">
                            <Link2 className="h-3 w-3" />
                            Corte #{salida.registro_n_corte}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEdit(salida)}
                            title="Editar"
                            data-testid={`edit-salida-${salida.id}`}
                          >
                            <Pencil className="h-4 w-4 text-blue-500" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(salida.id)}
                            title="Eliminar"
                            data-testid={`delete-salida-${salida.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) setEditingSalida(null);
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingSalida ? 'Editar Salida' : 'Nueva Salida'}</DialogTitle>
            <DialogDescription>
              {editingSalida ? 'Modificar observaciones de la salida' : 'Registrar una salida de inventario (FIFO)'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Item *</Label>
                <Select
                  value={formData.item_id}
                  onValueChange={handleItemChange}
                  required
                >
                  <SelectTrigger data-testid="select-item">
                    <SelectValue placeholder="Seleccionar item..." />
                  </SelectTrigger>
                  <SelectContent>
                    {items.filter(i => i.categoria !== 'PT').map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        <span className="font-mono mr-2">{item.codigo}</span>
                        {item.nombre}
                        <span className="ml-2 text-muted-foreground">(Stock: {item.stock_actual})</span>
                        {item.control_por_rollos && (
                          <Badge variant="outline" className="ml-2 text-xs">Rollos</Badge>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedItem && !selectedItem.control_por_rollos && (
                  <p className="text-sm text-muted-foreground">
                    Stock disponible: <span className="font-mono font-semibold">{selectedItem.stock_actual}</span> {selectedItem.unidad_medida}
                  </p>
                )}
              </div>
              
              {/* Selector de Rollo (solo si el item tiene control por rollos) */}
              {selectedItem?.control_por_rollos && (
                <div className="space-y-2">
                  <Label>Rollo *</Label>
                  <Select
                    value={formData.rollo_id}
                    onValueChange={handleRolloChange}
                    required
                  >
                    <SelectTrigger data-testid="select-rollo">
                      <SelectValue placeholder="Seleccionar rollo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {rollosDisponibles.length === 0 ? (
                        <SelectItem value="none" disabled>No hay rollos disponibles</SelectItem>
                      ) : (
                        rollosDisponibles.map((rollo) => (
                          <SelectItem key={rollo.id} value={rollo.id}>
                            <div className="flex items-center gap-2">
                              <Layers className="h-4 w-4" />
                              <span className="font-mono font-semibold">{rollo.numero_rollo}</span>
                              <span className="text-muted-foreground">|</span>
                              <span>{rollo.tono || 'Sin tono'}</span>
                              <span className="text-muted-foreground">|</span>
                              <span className="font-mono text-green-600">{rollo.metraje_disponible?.toFixed(2)}m</span>
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {selectedRollo && (
                    <div className="p-3 bg-muted/30 rounded-lg text-sm space-y-1">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Rollo:</span>
                        <span className="font-mono font-semibold">{selectedRollo.numero_rollo}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Tono:</span>
                        <span>{selectedRollo.tono || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Ancho:</span>
                        <span className="font-mono">{selectedRollo.ancho}cm</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Disponible:</span>
                        <span className="font-mono font-semibold text-green-600">{selectedRollo.metraje_disponible?.toFixed(2)}m</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="cantidad">Cantidad ({selectedItem?.unidad_medida || 'unidad'}) *</Label>
                <NumericInput
                  id="cantidad"
                  min="0.01"
                  step="0.01"
                  max={selectedRollo?.metraje_disponible || selectedItem?.stock_actual || 999999}
                  value={formData.cantidad}
                  onChange={(e) => setFormData({ ...formData, cantidad: e.target.value })}
                  required
                  className="font-mono"
                  data-testid="input-cantidad"
                />
                {selectedRollo && (
                  <p className="text-xs text-muted-foreground">
                    Máximo disponible: {selectedRollo.metraje_disponible?.toFixed(2)}m
                  </p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label>Vincular a Registro (opcional)</Label>
                <Select
                  value={formData.registro_id || "none"}
                  onValueChange={(value) => setFormData({ ...formData, registro_id: value === "none" ? "" : value })}
                >
                  <SelectTrigger data-testid="select-registro">
                    <SelectValue placeholder="Sin vincular" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin vincular</SelectItem>
                    {registros.map((reg) => (
                      <SelectItem key={reg.id} value={reg.id}>
                        <span className="font-mono mr-2">#{reg.n_corte}</span>
                        {reg.modelo_nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Vincula esta salida a un registro de producción
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="observaciones">Observaciones</Label>
                <Textarea
                  id="observaciones"
                  value={formData.observaciones}
                  onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                  placeholder="Notas adicionales..."
                  rows={2}
                  data-testid="input-observaciones"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving} data-testid="btn-guardar-salida">
                Registrar Salida
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog para salida masiva de rollos */}
      <SalidaRollosDialog
        open={rollosDialogOpen}
        onOpenChange={setRollosDialogOpen}
        onSuccess={fetchData}
      />
    </div>
  );
};
