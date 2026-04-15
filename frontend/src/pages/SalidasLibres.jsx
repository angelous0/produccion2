import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Plus, Trash2, PackageX, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import { NumericInput } from '../components/ui/numeric-input';
import { formatDate } from '../lib/dateUtils';
import { formatCurrency } from '../lib/utils';
import { useSaving } from '../hooks/useSaving';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const TIPO_LABELS = {
  MERMA: { label: 'Merma', cls: 'bg-red-100 text-red-700 border-red-200' },
  MUESTRA: { label: 'Muestra', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  DAÑO: { label: 'Daño', cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  USO_INTERNO: { label: 'Uso Interno', cls: 'bg-purple-100 text-purple-700 border-purple-200' },
  DEVOLUCION: { label: 'Devolución', cls: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  AJUSTE: { label: 'Ajuste', cls: 'bg-gray-100 text-gray-700 border-gray-200' },
  OTRO: { label: 'Otro', cls: 'bg-muted text-muted-foreground border-border' },
};

const TIPOS = Object.keys(TIPO_LABELS);

const EMPTY_FORM = {
  item_id: '',
  cantidad: '',
  tipo_salida: 'MERMA',
  motivo: '',
  destino: '',
  fecha: new Date().toISOString().slice(0, 10),
  linea_negocio_id: '',
  observaciones: '',
};

export const SalidasLibres = () => {
  const [salidas, setSalidas] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [lineas, setLineas] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedItem, setSelectedItem] = useState(null);
  const [filtroTipo, setFiltroTipo] = useState('');
  const { saving, guard } = useSaving();
  const LIMIT = 50;

  const fetchItems = useCallback(async () => {
    try {
      const [itemsRes, lineasRes] = await Promise.all([
        axios.get(`${API}/inventario?all=true`),
        axios.get(`${API}/lineas-negocio`).catch(() => ({ data: [] })),
      ]);
      setItems(Array.isArray(itemsRes.data) ? itemsRes.data : (itemsRes.data?.items || []));
      setLineas(Array.isArray(lineasRes.data) ? lineasRes.data : (lineasRes.data?.items || []));
    } catch {
      // silencioso
    }
  }, []);

  const fetchSalidas = useCallback(async (p = 0) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: LIMIT, offset: p * LIMIT });
      if (filtroTipo) params.set('tipo_salida', filtroTipo);
      const res = await axios.get(`${API}/salidas-libres?${params}`);
      setSalidas(res.data?.items || []);
      setTotal(res.data?.total || 0);
    } catch {
      toast.error('Error al cargar salidas libres');
    } finally {
      setLoading(false);
    }
  }, [filtroTipo]);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  useEffect(() => { setPage(0); fetchSalidas(0); }, [filtroTipo]);
  useEffect(() => { fetchSalidas(page); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const openDialog = () => {
    setForm(EMPTY_FORM);
    setSelectedItem(null);
    setDialogOpen(true);
  };

  const handleItemChange = (id) => {
    const item = items.find(i => i.id === id);
    setSelectedItem(item || null);
    setForm(f => ({ ...f, item_id: id, cantidad: '' }));
  };

  const handleSubmit = guard(async (e) => {
    e.preventDefault();
    if (!form.item_id) { toast.error('Selecciona un item'); return; }
    const qty = parseFloat(form.cantidad);
    if (!qty || qty <= 0) { toast.error('Cantidad debe ser mayor a 0'); return; }
    try {
      await axios.post(`${API}/salidas-libres`, {
        item_id: form.item_id,
        cantidad: qty,
        tipo_salida: form.tipo_salida,
        motivo: form.motivo || null,
        destino: form.destino || null,
        fecha: form.fecha || undefined,
        linea_negocio_id: form.linea_negocio_id ? parseInt(form.linea_negocio_id) : null,
        observaciones: form.observaciones || null,
      });
      toast.success('Salida libre registrada');
      setDialogOpen(false);
      fetchSalidas(page);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al registrar');
    }
  });

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar esta salida? Se restaurará el stock.')) return;
    try {
      await axios.delete(`${API}/salidas-libres/${id}`);
      toast.success('Salida eliminada, stock restaurado');
      fetchSalidas(page);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al eliminar');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <PackageX className="h-6 w-6 text-primary" /> Salidas Libres
          </h2>
          <p className="text-sm text-muted-foreground">
            Salidas de inventario sin vincular a un registro de producción (mermas, muestras, daños, uso interno)
          </p>
        </div>
        <Button onClick={openDialog}>
          <Plus className="h-4 w-4 mr-2" /> Nueva Salida
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap items-center">
        <button
          onClick={() => setFiltroTipo('')}
          className={`px-3 py-1.5 text-xs rounded-md border font-medium transition-colors ${!filtroTipo ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted border-border'}`}
        >
          Todos
        </button>
        {TIPOS.map(t => (
          <button key={t} onClick={() => setFiltroTipo(t)}
            className={`px-3 py-1.5 text-xs rounded-md border font-medium transition-colors ${filtroTipo === t ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted border-border'}`}
          >
            {TIPO_LABELS[t].label}
          </button>
        ))}
        <button onClick={() => fetchSalidas(page)} className="ml-auto flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border hover:bg-muted transition-colors text-muted-foreground">
          <RefreshCw className="h-3.5 w-3.5" /> Actualizar
        </button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="data-table-header">
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Costo FIFO</TableHead>
                  <TableHead>Motivo / Destino</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                      <RefreshCw className="h-4 w-4 animate-spin inline mr-2" /> Cargando...
                    </TableCell>
                  </TableRow>
                ) : salidas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                      <PackageX className="h-8 w-8 opacity-20 mx-auto mb-2" />
                      No hay salidas registradas
                    </TableCell>
                  </TableRow>
                ) : (
                  salidas.map(s => {
                    const tipoCfg = TIPO_LABELS[s.tipo_salida] || TIPO_LABELS.OTRO;
                    return (
                      <TableRow key={s.id} className="data-table-row">
                        <TableCell className="font-mono text-sm">{formatDate(s.fecha)}</TableCell>
                        <TableCell>
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${tipoCfg.cls}`}>
                            {tipoCfg.label}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium text-sm">{s.item_nombre}</span>
                            <span className="text-xs font-mono text-muted-foreground">{s.item_codigo}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {s.cantidad} <span className="text-xs text-muted-foreground">{s.unidad_medida}</span>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(s.costo_total)}
                          {s.en_migracion && (
                            <Badge variant="outline" className="ml-1 text-[9px] text-yellow-700 border-yellow-300 bg-yellow-50">mig</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {s.motivo && <div className="text-foreground">{s.motivo}</div>}
                          {s.destino && <div className="text-xs text-muted-foreground">{s.destino}</div>}
                          {!s.motivo && !s.destino && <span className="text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{s.usuario || '-'}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(s.id)} title="Eliminar">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Paginación */}
      {total > LIMIT && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-muted-foreground">{total} registros</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
              Anterior
            </Button>
            <span className="px-3 py-1.5 text-xs text-muted-foreground">Pág {page + 1} / {Math.ceil(total / LIMIT)}</span>
            <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={(page + 1) * LIMIT >= total}>
              Siguiente
            </Button>
          </div>
        </div>
      )}

      {/* Dialog nueva salida */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva Salida Libre</DialogTitle>
            <DialogDescription>Registra una salida sin vincular a un corte de producción</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              {/* Tipo */}
              <div className="space-y-2">
                <Label>Tipo de Salida *</Label>
                <Select value={form.tipo_salida} onValueChange={v => setForm(f => ({ ...f, tipo_salida: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPOS.map(t => (
                      <SelectItem key={t} value={t}>{TIPO_LABELS[t].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Item */}
              <div className="space-y-2">
                <Label>Item *</Label>
                <Select value={form.item_id} onValueChange={handleItemChange}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar item..." /></SelectTrigger>
                  <SelectContent>
                    {items.filter(i => i.categoria !== 'PT').map(i => (
                      <SelectItem key={i.id} value={i.id}>
                        <span className="font-mono mr-2 text-muted-foreground">{i.codigo}</span>
                        {i.nombre}
                        <span className="ml-2 text-xs text-muted-foreground">(Stock: {i.stock_actual} {i.unidad_medida})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Cantidad */}
              <div className="space-y-2">
                <Label>Cantidad ({selectedItem?.unidad_medida || 'unidad'}) *</Label>
                <NumericInput
                  min="0.01"
                  step="0.01"
                  max={selectedItem?.stock_actual || undefined}
                  value={form.cantidad}
                  onChange={e => setForm(f => ({ ...f, cantidad: e.target.value }))}
                  className="font-mono"
                  required
                />
                {selectedItem && (
                  <p className="text-xs text-muted-foreground">
                    Stock disponible: <span className="font-semibold font-mono">{selectedItem.stock_actual}</span> {selectedItem.unidad_medida}
                  </p>
                )}
              </div>

              {/* Fecha */}
              <div className="space-y-2">
                <Label>Fecha</Label>
                <Input
                  type="date"
                  value={form.fecha}
                  onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                />
              </div>

              {/* Motivo */}
              <div className="space-y-2">
                <Label>Motivo</Label>
                <Input
                  value={form.motivo}
                  onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))}
                  placeholder="Descripción del motivo..."
                />
              </div>

              {/* Destino */}
              <div className="space-y-2">
                <Label>Destino</Label>
                <Input
                  value={form.destino}
                  onChange={e => setForm(f => ({ ...f, destino: e.target.value }))}
                  placeholder="Destino o destinatario..."
                />
              </div>

              {/* Línea de negocio */}
              {lineas.length > 0 && (
                <div className="space-y-2">
                  <Label>Línea de Negocio</Label>
                  <Select
                    value={form.linea_negocio_id || 'none'}
                    onValueChange={v => setForm(f => ({ ...f, linea_negocio_id: v === 'none' ? '' : v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin asignar</SelectItem>
                      {lineas.map(l => (
                        <SelectItem key={l.id} value={String(l.id)}>{l.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Observaciones */}
              <div className="space-y-2">
                <Label>Observaciones</Label>
                <Textarea
                  value={form.observaciones}
                  onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))}
                  placeholder="Notas adicionales..."
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Guardando...' : 'Registrar Salida'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SalidasLibres;
