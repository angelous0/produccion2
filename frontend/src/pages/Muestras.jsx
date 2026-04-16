import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Plus, FlaskConical, RefreshCw, ChevronRight, Trash2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
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

const ESTADO_CFG = {
  PENDIENTE:   { label: 'Pendiente',   cls: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300' },
  EN_REVISION: { label: 'En Revisión', cls: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300' },
  APROBADA:    { label: 'Aprobada',    cls: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300' },
  RECHAZADA:   { label: 'Rechazada',   cls: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300' },
  CANCELADA:   { label: 'Cancelada',   cls: 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400' },
};

const EMPTY_FORM = {
  descripcion: '',
  fecha_envio: new Date().toISOString().slice(0, 10),
  modelo_nombre: '',
  linea_negocio_id: '',
  observaciones: '',
};

const EMPTY_MAT = { item_id: '', cantidad: '' };

export const Muestras = () => {
  const navigate = useNavigate();
  const [muestras, setMuestras] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [allItems, setAllItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [lineas, setLineas] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [materiales, setMateriales] = useState([]);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroCliente, setFiltroCliente] = useState('');
  const { saving, guard } = useSaving();
  const LIMIT = 50;

  const fetchCatalogos = useCallback(async () => {
    try {
      const [itemsRes, lineasRes] = await Promise.all([
        axios.get(`${API}/inventario?all=true`),
        axios.get(`${API}/lineas-negocio`).catch(() => ({ data: [] })),
      ]);
      const itemsData = Array.isArray(itemsRes.data) ? itemsRes.data : (itemsRes.data?.items || []);
      setAllItems(itemsData);
      setFilteredItems(itemsData.filter(i => i.categoria !== 'PT'));
      setLineas(Array.isArray(lineasRes.data) ? lineasRes.data : (lineasRes.data?.items || []));
    } catch { /* silencioso */ }
  }, []);

  // Filtra los items de materiales según la línea de negocio seleccionada
  const handleLineaChange = useCallback(async (lineaId) => {
    setForm(f => ({ ...f, linea_negocio_id: lineaId === 'none' ? '' : lineaId }));
    // Limpiar materiales al cambiar línea para evitar items inválidos
    setMateriales([]);
    if (!lineaId || lineaId === 'none') {
      setFilteredItems(allItems.filter(i => i.categoria !== 'PT'));
      return;
    }
    try {
      const res = await axios.get(`${API}/inventario?all=true&linea_negocio_id=${lineaId}`);
      const data = Array.isArray(res.data) ? res.data : (res.data?.items || []);
      setFilteredItems(data.filter(i => i.categoria !== 'PT'));
    } catch {
      setFilteredItems(allItems.filter(i => i.categoria !== 'PT'));
    }
  }, [allItems]);

  const fetchMuestras = useCallback(async (p = 0) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: LIMIT, offset: p * LIMIT });
      if (filtroEstado) params.set('estado', filtroEstado);
      if (filtroCliente.trim()) params.set('cliente', filtroCliente.trim());
      const res = await axios.get(`${API}/muestras?${params}`);
      setMuestras(res.data?.items || []);
      setTotal(res.data?.total || 0);
    } catch {
      toast.error('Error al cargar muestras');
    } finally {
      setLoading(false);
    }
  }, [filtroEstado, filtroCliente]);

  useEffect(() => { fetchCatalogos(); }, [fetchCatalogos]);
  useEffect(() => { setPage(0); fetchMuestras(0); }, [filtroEstado]);
  useEffect(() => { fetchMuestras(page); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const openDialog = () => {
    setForm(EMPTY_FORM);
    setMateriales([]);
    setFilteredItems(allItems.filter(i => i.categoria !== 'PT'));
    setDialogOpen(true);
  };

  const addMaterial = () => setMateriales(m => [...m, { ...EMPTY_MAT }]);
  const removeMaterial = (idx) => setMateriales(m => m.filter((_, i) => i !== idx));
  const updateMaterial = (idx, field, val) => {
    setMateriales(m => m.map((mat, i) => i === idx ? { ...mat, [field]: val } : mat));
  };

  const handleSubmit = guard(async (e) => {
    e.preventDefault();
    if (!form.linea_negocio_id) { toast.error('Selecciona una línea de negocio'); return; }
    for (const mat of materiales) {
      if (!mat.item_id) { toast.error('Todos los materiales deben tener item seleccionado'); return; }
      if (!parseFloat(mat.cantidad) || parseFloat(mat.cantidad) <= 0) {
        toast.error('La cantidad de cada material debe ser mayor a 0'); return;
      }
    }
    try {
      await axios.post(`${API}/muestras`, {
        cliente: form.descripcion?.trim() || null,
        fecha_envio: form.fecha_envio || undefined,
        modelo_nombre: form.modelo_nombre || null,
        linea_negocio_id: parseInt(form.linea_negocio_id),
        observaciones: form.observaciones || null,
        materiales: materiales.map(m => ({
          item_id: m.item_id,
          cantidad: parseFloat(m.cantidad),
          observaciones: m.observaciones || null,
        })),
      });
      toast.success('Muestra creada');
      setDialogOpen(false);
      fetchMuestras(page);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al crear muestra');
    }
  });

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('¿Eliminar esta muestra? Se restaurará el stock de materiales.')) return;
    try {
      await axios.delete(`${API}/muestras/${id}`);
      toast.success('Muestra eliminada');
      fetchMuestras(page);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al eliminar');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FlaskConical className="h-6 w-6 text-primary" /> Muestras
          </h2>
          <p className="text-sm text-muted-foreground">
            Gestión de muestras enviadas a clientes con seguimiento de estado y costos
          </p>
        </div>
        <Button onClick={openDialog}>
          <Plus className="h-4 w-4 mr-2" /> Nueva Muestra
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap items-center">
        <button onClick={() => setFiltroEstado('')}
          className={`px-3 py-1.5 text-xs rounded-md border font-medium transition-colors ${!filtroEstado ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted border-border'}`}>
          Todas
        </button>
        {Object.entries(ESTADO_CFG).map(([key, cfg]) => (
          <button key={key} onClick={() => setFiltroEstado(key)}
            className={`px-3 py-1.5 text-xs rounded-md border font-medium transition-colors ${filtroEstado === key ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted border-border'}`}>
            {cfg.label}
          </button>
        ))}
        <div className="ml-auto flex gap-2 items-center">
          <Input
            placeholder="Buscar descripción..."
            value={filtroCliente}
            onChange={e => setFiltroCliente(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && fetchMuestras(0)}
            className="h-8 text-sm w-44"
          />
          <button onClick={() => fetchMuestras(page)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border hover:bg-muted transition-colors text-muted-foreground">
            <RefreshCw className="h-3.5 w-3.5" /> Actualizar
          </button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="data-table-header">
                  <TableHead>Código</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Fecha Envío</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Costo Total</TableHead>
                  <TableHead className="text-right">Materiales</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                      <RefreshCw className="h-4 w-4 animate-spin inline mr-2" /> Cargando...
                    </TableCell>
                  </TableRow>
                ) : muestras.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                      <FlaskConical className="h-8 w-8 opacity-20 mx-auto mb-2" />
                      No hay muestras registradas
                    </TableCell>
                  </TableRow>
                ) : (
                  muestras.map(m => {
                    const estadoCfg = ESTADO_CFG[m.estado] || ESTADO_CFG.PENDIENTE;
                    return (
                      <TableRow
                        key={m.id}
                        className="data-table-row cursor-pointer"
                        onClick={() => navigate(`/muestras/${m.id}`)}
                      >
                        <TableCell className="font-mono text-sm font-semibold">{m.codigo}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{m.cliente || <span className="italic">Sin descripción</span>}</TableCell>
                        <TableCell className="font-mono text-sm">{formatDate(m.fecha_envio)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{m.modelo_nombre || '-'}</TableCell>
                        <TableCell>
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${estadoCfg.cls}`}>
                            {estadoCfg.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(m.costo_calculado || m.costo_total || 0)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{m.num_materiales || 0}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" onClick={e => handleDelete(m.id, e)} title="Eliminar">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
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

      {total > LIMIT && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-muted-foreground">{total} muestras</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>Anterior</Button>
            <span className="px-3 py-1.5 text-xs text-muted-foreground">Pág {page + 1} / {Math.ceil(total / LIMIT)}</span>
            <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={(page + 1) * LIMIT >= total}>Siguiente</Button>
          </div>
        </div>
      )}

      {/* Dialog nueva muestra */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva Muestra</DialogTitle>
            <DialogDescription>Registra una muestra con sus materiales y costo FIFO</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">

                {/* Línea de Negocio PRIMERO y OBLIGATORIA */}
                <div className="space-y-2 col-span-2">
                  <Label>
                    Línea de Negocio <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={form.linea_negocio_id || 'none'}
                    onValueChange={handleLineaChange}
                  >
                    <SelectTrigger className={!form.linea_negocio_id ? 'border-destructive/50' : ''}>
                      <SelectValue placeholder="Selecciona una línea de negocio..." />
                    </SelectTrigger>
                    <SelectContent>
                      {lineas.map(l => <SelectItem key={l.id} value={String(l.id)}>{l.nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {!form.linea_negocio_id && (
                    <p className="text-xs text-muted-foreground">Requerido — filtra los materiales disponibles</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Fecha de Envío</Label>
                  <Input
                    type="date"
                    value={form.fecha_envio}
                    onChange={e => setForm(f => ({ ...f, fecha_envio: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Modelo / Referencia</Label>
                  <Input
                    value={form.modelo_nombre}
                    onChange={e => setForm(f => ({ ...f, modelo_nombre: e.target.value }))}
                    placeholder="Nombre del modelo..."
                  />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Observaciones</Label>
                  <Textarea
                    value={form.observaciones}
                    onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))}
                    placeholder="Notas sobre la muestra..."
                    rows={2}
                  />
                </div>
              </div>

              {/* Materiales */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <Label className="text-sm font-semibold">Materiales</Label>
                    {form.linea_negocio_id && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({filteredItems.length} items disponibles en esta línea)
                      </span>
                    )}
                  </div>
                  <Button
                    type="button" variant="outline" size="sm"
                    onClick={addMaterial}
                    disabled={!form.linea_negocio_id}
                    title={!form.linea_negocio_id ? 'Selecciona una línea de negocio primero' : ''}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Agregar
                  </Button>
                </div>
                {!form.linea_negocio_id ? (
                  <p className="text-xs text-muted-foreground py-3 text-center border rounded-lg border-dashed">
                    Selecciona una línea de negocio para agregar materiales
                  </p>
                ) : materiales.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-3 text-center border rounded-lg border-dashed">
                    Sin materiales. Opcional — agrega items para calcular costo FIFO.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {materiales.map((mat, idx) => {
                      const itemSel = filteredItems.find(i => i.id === mat.item_id);
                      return (
                        <div key={idx} className="grid grid-cols-[1fr_100px_32px] gap-2 items-start">
                          <Select value={mat.item_id || 'none'} onValueChange={v => updateMaterial(idx, 'item_id', v === 'none' ? '' : v)}>
                            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Seleccionar item..." /></SelectTrigger>
                            <SelectContent>
                              {filteredItems.map(i => (
                                <SelectItem key={i.id} value={i.id}>
                                  <span className="font-mono mr-1 text-muted-foreground text-xs">{i.codigo}</span> {i.nombre}
                                  <span className="ml-1 text-xs text-muted-foreground">({i.stock_actual} {i.unidad_medida})</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <NumericInput
                            min="0.01"
                            step="0.01"
                            max={itemSel?.stock_actual || undefined}
                            value={mat.cantidad}
                            onChange={e => updateMaterial(idx, 'cantidad', e.target.value)}
                            placeholder="Cantidad"
                            className="h-8 text-sm font-mono"
                          />
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeMaterial(idx)} className="h-8 w-8">
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Guardando...' : 'Crear Muestra'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Muestras;
