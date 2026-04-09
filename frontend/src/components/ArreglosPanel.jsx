import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from './ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from './ui/dialog';
import {
  AlertTriangle, CheckCircle2, Clock, Plus, Pencil, Trash2, Wrench, Package, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const fmtDate = (d) => {
  if (!d) return '-';
  const s = String(d).slice(0, 10);
  const [y, m, dd] = s.split('-');
  return `${dd}/${m}/${y}`;
};

const estadoBadge = (estado) => {
  const map = {
    EN_ARREGLO: { cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200', icon: <Clock className="h-3 w-3" /> },
    PARCIAL: { cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200', icon: <Wrench className="h-3 w-3" /> },
    COMPLETADO: { cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200', icon: <CheckCircle2 className="h-3 w-3" /> },
    VENCIDO: { cls: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-200', icon: <AlertTriangle className="h-3 w-3" /> },
  };
  const { cls, icon } = map[estado] || map.EN_ARREGLO;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cls}`}>
      {icon} {estado}
    </span>
  );
};

export const ArreglosPanel = ({ registroId, servicios = [], personas = [] }) => {
  const [resumen, setResumen] = useState(null);
  const [fallados, setFallados] = useState([]);
  const [arreglos, setArreglos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Dialogs
  const [falladoDialogOpen, setFalladoDialogOpen] = useState(false);
  const [editingFalladoId, setEditingFalladoId] = useState(null);
  const [arregloDialogOpen, setArregloDialogOpen] = useState(false);
  const [resolucionDialogOpen, setResolucionDialogOpen] = useState(false);
  const [selectedArreglo, setSelectedArreglo] = useState(null);

  const [falladoForm, setFalladoForm] = useState({ cantidad_detectada: '', fecha_deteccion: '', observacion: '' });
  const [arregloForm, setArregloForm] = useState({ cantidad: '', servicio_id: '', persona_id: '', fecha_envio: '', observacion: '' });
  const [resolucionForm, setResolucionForm] = useState({ cantidad_recuperada: 0, cantidad_liquidacion: 0, cantidad_merma: 0 });

  const hdrs = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

  const fetchAll = useCallback(async () => {
    if (!registroId) return;
    setLoading(true);
    try {
      const [r1, r2, r3] = await Promise.allSettled([
        axios.get(`${API}/registros/${registroId}/resumen-cantidades`, { headers: hdrs() }),
        axios.get(`${API}/fallados?registro_id=${registroId}`, { headers: hdrs() }),
        axios.get(`${API}/registros/${registroId}/arreglos`, { headers: hdrs() }),
      ]);
      if (r1.status === 'fulfilled') setResumen(r1.value.data);
      if (r2.status === 'fulfilled') setFallados(r2.value.data);
      if (r3.status === 'fulfilled') setArreglos(r3.value.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [registroId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Personas filtradas por servicio seleccionado
  const personasFiltradas = arregloForm.servicio_id
    ? personas.filter(p => {
        const enDetalle = (p.servicios_detalle || []).some(s => s.servicio_id === arregloForm.servicio_id);
        const enServicios = (p.servicios || []).some(s => s.servicio_id === arregloForm.servicio_id);
        const enIds = (p.servicio_ids || []).includes(arregloForm.servicio_id);
        return enDetalle || enServicios || enIds;
      })
    : personas;

  // ===== FALLADOS =====
  const handleSaveFallado = async () => {
    if (saving) return;
    const cant = parseInt(falladoForm.cantidad_detectada) || 0;
    if (cant <= 0) { toast.error('La cantidad debe ser mayor a 0'); return; }
    setSaving(true);
    try {
      const payload = { registro_id: registroId, cantidad_detectada: cant, fecha_deteccion: falladoForm.fecha_deteccion || undefined, observacion: falladoForm.observacion };
      if (editingFalladoId) {
        await axios.put(`${API}/fallados/${editingFalladoId}`, payload, { headers: hdrs() });
        toast.success('Fallado actualizado');
      } else {
        await axios.post(`${API}/fallados`, payload, { headers: hdrs() });
        toast.success('Fallado registrado');
      }
      setFalladoDialogOpen(false);
      setEditingFalladoId(null);
      fetchAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFallado = async (id) => {
    if (!window.confirm('Eliminar este registro de fallado?')) return;
    try {
      await axios.delete(`${API}/fallados/${id}`, { headers: hdrs() });
      toast.success('Fallado eliminado');
      fetchAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al eliminar');
    }
  };

  // ===== ARREGLOS =====
  const handleSaveArreglo = async () => {
    if (saving) return;
    const cant = parseInt(arregloForm.cantidad) || 0;
    if (cant <= 0) { toast.error('La cantidad debe ser mayor a 0'); return; }
    setSaving(true);
    try {
      await axios.post(`${API}/registros/${registroId}/arreglos`, {
        cantidad: cant,
        servicio_id: arregloForm.servicio_id || null,
        persona_id: arregloForm.persona_id || null,
        fecha_envio: arregloForm.fecha_envio || undefined,
        observacion: arregloForm.observacion,
      }, { headers: hdrs() });
      toast.success('Envio a arreglo creado');
      setArregloDialogOpen(false);
      fetchAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al crear arreglo');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveResolucion = async () => {
    if (saving || !selectedArreglo) return;
    setSaving(true);
    try {
      await axios.put(`${API}/arreglos/${selectedArreglo.id}`, {
        cantidad_recuperada: parseInt(resolucionForm.cantidad_recuperada) || 0,
        cantidad_liquidacion: parseInt(resolucionForm.cantidad_liquidacion) || 0,
        cantidad_merma: parseInt(resolucionForm.cantidad_merma) || 0,
      }, { headers: hdrs() });
      toast.success('Resolucion guardada');
      setResolucionDialogOpen(false);
      setSelectedArreglo(null);
      fetchAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al guardar resolucion');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteArreglo = async (id) => {
    if (!window.confirm('Eliminar este arreglo?')) return;
    try {
      await axios.delete(`${API}/arreglos/${id}`, { headers: hdrs() });
      toast.success('Arreglo eliminado');
      fetchAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al eliminar');
    }
  };

  const openResolucion = (arreglo) => {
    setSelectedArreglo(arreglo);
    setResolucionForm({
      cantidad_recuperada: arreglo.cantidad_recuperada || 0,
      cantidad_liquidacion: arreglo.cantidad_liquidacion || 0,
      cantidad_merma: arreglo.cantidad_merma || 0,
    });
    setResolucionDialogOpen(true);
  };

  // Calculo de resolucion
  const resTotal = (parseInt(resolucionForm.cantidad_recuperada) || 0) + (parseInt(resolucionForm.cantidad_liquidacion) || 0) + (parseInt(resolucionForm.cantidad_merma) || 0);
  const resCantidad = selectedArreglo ? selectedArreglo.cantidad : 0;
  const resExcede = resTotal > resCantidad;
  const resFalta = resTotal < resCantidad;

  if (loading) return <div className="flex items-center justify-center py-12 text-muted-foreground">Cargando trazabilidad...</div>;

  const r = resumen || {};
  const falladoPendiente = r.fallado_pendiente || 0;

  return (
    <div className="space-y-4" data-testid="arreglos-panel">
      {/* BLOQUE 1: RESUMEN */}
      <Card data-testid="bloque-resumen">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Package className="h-4 w-4" /> Resumen del Lote
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <MetricCard label="Total Producido" value={r.total_producido || 0} color="zinc" />
            <MetricCard label="Normal (Bueno)" value={r.normal || 0} color="emerald" />
            <MetricCard label="Fallado Pendiente" value={falladoPendiente} color={falladoPendiente > 0 ? 'amber' : 'zinc'} />
            <MetricCard label="Recuperado" value={r.recuperado || 0} color="blue" />
            <MetricCard label="Liquidacion" value={r.liquidacion || 0} color="orange" />
            <MetricCard label="Merma" value={(r.merma || 0) + (r.merma_arreglos || 0)} color={(r.merma || 0) + (r.merma_arreglos || 0) > 0 ? 'red' : 'zinc'} />
          </div>
          {/* Alertas */}
          {r.alertas && r.alertas.length > 0 && (
            <div className="mt-3 space-y-1">
              {r.alertas.map((a, i) => (
                <div key={i} className={`flex items-center gap-2 text-xs px-2 py-1 rounded ${
                  a.tipo === 'VENCIDO' ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400' :
                  a.tipo === 'MERMA' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400' :
                  'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400'
                }`} data-testid={`alerta-${a.tipo.toLowerCase()}`}>
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  {a.mensaje}
                </div>
              ))}
            </div>
          )}
          {/* Ecuacion */}
          <div className={`mt-3 text-[11px] font-mono px-3 py-1.5 rounded border ${r.ecuacion_valida ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400' : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950/20 dark:text-red-400'}`} data-testid="ecuacion">
            {r.normal || 0} + {r.recuperado || 0} + {r.liquidacion || 0} + {(r.merma || 0) + (r.merma_arreglos || 0)} + {falladoPendiente}{r.divididos > 0 ? ` + ${r.divididos}` : ''} = {r.total_producido || 0}
            {r.ecuacion_valida ? ' OK' : ' ERROR'}
          </div>
        </CardContent>
      </Card>

      {/* BLOQUE FALLADOS */}
      <Card data-testid="bloque-fallados">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-500" /> Deteccion de Fallados
              {fallados.length > 0 && <Badge variant="secondary" className="text-[10px]">{r.total_fallados || 0} prendas</Badge>}
            </CardTitle>
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setEditingFalladoId(null); setFalladoForm({ cantidad_detectada: '', fecha_deteccion: '', observacion: '' }); setFalladoDialogOpen(true); }} data-testid="btn-nuevo-fallado">
              <Plus className="h-3 w-3 mr-1" /> Registrar Fallado
            </Button>
          </div>
        </CardHeader>
        {fallados.length > 0 && (
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow><TableHead className="text-xs">Cantidad</TableHead><TableHead className="text-xs">Fecha</TableHead><TableHead className="text-xs">Observacion</TableHead><TableHead className="text-xs w-20">Accion</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {fallados.map(f => (
                  <TableRow key={f.id}>
                    <TableCell className="font-mono font-semibold">{f.cantidad_detectada}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(f.fecha_deteccion)}</TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate">{f.observacion || '-'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setEditingFalladoId(f.id); setFalladoForm({ cantidad_detectada: f.cantidad_detectada, fecha_deteccion: f.fecha_deteccion?.slice(0,10) || '', observacion: f.observacion || '' }); setFalladoDialogOpen(true); }} data-testid={`btn-edit-fallado-${f.id}`}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-red-500 hover:text-red-700" onClick={() => handleDeleteFallado(f.id)} data-testid={`btn-delete-fallado-${f.id}`}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>

      {/* BLOQUE 2: ENVIOS A ARREGLO */}
      <Card data-testid="bloque-arreglos">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Wrench className="h-4 w-4 text-violet-500" /> Envios a Arreglo
              {arreglos.length > 0 && <Badge variant="secondary" className="text-[10px]">{arreglos.length} envios</Badge>}
            </CardTitle>
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={falladoPendiente <= 0} onClick={() => { setArregloForm({ cantidad: '', servicio_id: '', persona_id: '', fecha_envio: '', observacion: '' }); setArregloDialogOpen(true); }} data-testid="btn-nuevo-arreglo">
              <Plus className="h-3 w-3 mr-1" /> Nuevo Envio
              {falladoPendiente > 0 && <span className="ml-1 text-[10px] text-muted-foreground">({falladoPendiente} disp.)</span>}
            </Button>
          </div>
        </CardHeader>
        {arreglos.length > 0 && (
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Cant.</TableHead>
                  <TableHead className="text-xs">Servicio</TableHead>
                  <TableHead className="text-xs">Persona</TableHead>
                  <TableHead className="text-xs">Envio</TableHead>
                  <TableHead className="text-xs">Limite</TableHead>
                  <TableHead className="text-xs">Estado</TableHead>
                  <TableHead className="text-xs">Resolucion</TableHead>
                  <TableHead className="text-xs w-20">Accion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {arreglos.map(a => {
                  const rec = a.cantidad_recuperada || 0;
                  const liq = a.cantidad_liquidacion || 0;
                  const mer = a.cantidad_merma || 0;
                  const total = rec + liq + mer;
                  const pct = a.cantidad > 0 ? Math.round(total / a.cantidad * 100) : 0;
                  return (
                    <TableRow key={a.id} className={a.estado === 'VENCIDO' ? 'bg-red-50/50 dark:bg-red-950/10' : ''}>
                      <TableCell className="font-mono font-semibold">{a.cantidad}</TableCell>
                      <TableCell className="text-xs">{a.servicio_nombre || '-'}</TableCell>
                      <TableCell className="text-xs">{a.persona_nombre || '-'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fmtDate(a.fecha_envio)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fmtDate(a.fecha_limite)}</TableCell>
                      <TableCell>{estadoBadge(a.estado)}</TableCell>
                      <TableCell>
                        <div className="text-[10px] space-y-0.5">
                          {total > 0 ? (
                            <>
                              <div className="flex gap-2">
                                {rec > 0 && <span className="text-emerald-600">Rec:{rec}</span>}
                                {liq > 0 && <span className="text-orange-600">Liq:{liq}</span>}
                                {mer > 0 && <span className="text-red-600">Mer:{mer}</span>}
                              </div>
                              <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-1">
                                <div className={`h-1 rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                              </div>
                            </>
                          ) : (
                            <span className="text-muted-foreground">Sin resolver</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {a.estado !== 'COMPLETADO' && (
                            <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-blue-500" onClick={() => openResolucion(a)} data-testid={`btn-resolver-${a.id}`} title="Resolver">
                              <Wrench className="h-3 w-3" />
                            </Button>
                          )}
                          {a.estado !== 'COMPLETADO' && (
                            <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-red-500 hover:text-red-700" onClick={() => handleDeleteArreglo(a.id)} data-testid={`btn-delete-arreglo-${a.id}`}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                          {a.estado === 'COMPLETADO' && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        )}
        {arreglos.length === 0 && (r.total_fallados || 0) > 0 && (
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground text-center py-4">No hay envios a arreglo. Usa "Nuevo Envio" para asignar prendas falladas.</p>
          </CardContent>
        )}
      </Card>

      {/* DIALOG: Fallado */}
      <Dialog open={falladoDialogOpen} onOpenChange={setFalladoDialogOpen}>
        <DialogContent className="max-w-sm" data-testid="dialog-fallado">
          <DialogHeader>
            <DialogTitle className="text-sm">{editingFalladoId ? 'Editar Fallado' : 'Registrar Fallado'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Cantidad Detectada *</Label>
              <Input type="number" min={1} value={falladoForm.cantidad_detectada} onChange={e => setFalladoForm({ ...falladoForm, cantidad_detectada: e.target.value })} data-testid="input-fallado-cantidad" />
            </div>
            <div>
              <Label className="text-xs">Fecha Deteccion</Label>
              <Input type="date" value={falladoForm.fecha_deteccion} onChange={e => setFalladoForm({ ...falladoForm, fecha_deteccion: e.target.value })} data-testid="input-fallado-fecha" />
            </div>
            <div>
              <Label className="text-xs">Observacion</Label>
              <Input value={falladoForm.observacion} onChange={e => setFalladoForm({ ...falladoForm, observacion: e.target.value })} placeholder="Motivo o detalle..." data-testid="input-fallado-obs" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setFalladoDialogOpen(false)}>Cancelar</Button>
            <Button type="button" size="sm" onClick={handleSaveFallado} disabled={saving} data-testid="btn-guardar-fallado">{saving ? 'Guardando...' : 'Guardar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG: Nuevo Arreglo */}
      <Dialog open={arregloDialogOpen} onOpenChange={setArregloDialogOpen}>
        <DialogContent className="max-w-sm" data-testid="dialog-arreglo">
          <DialogHeader>
            <DialogTitle className="text-sm">Nuevo Envio a Arreglo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Cantidad * <span className="text-muted-foreground">(max: {falladoPendiente})</span></Label>
              <Input type="number" min={1} max={falladoPendiente} value={arregloForm.cantidad} onChange={e => setArregloForm({ ...arregloForm, cantidad: e.target.value })} data-testid="input-arreglo-cantidad" />
            </div>
            <div>
              <Label className="text-xs">Servicio</Label>
              <Select value={arregloForm.servicio_id || '_none'} onValueChange={v => setArregloForm({ ...arregloForm, servicio_id: v === '_none' ? '' : v, persona_id: '' })}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-arreglo-servicio"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Sin servicio</SelectItem>
                  {servicios.map(s => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Persona</Label>
              <Select value={arregloForm.persona_id || '_none'} onValueChange={v => setArregloForm({ ...arregloForm, persona_id: v === '_none' ? '' : v })}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-arreglo-persona"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Sin persona</SelectItem>
                  {personasFiltradas.map(p => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Fecha Envio</Label>
              <Input type="date" value={arregloForm.fecha_envio} onChange={e => setArregloForm({ ...arregloForm, fecha_envio: e.target.value })} data-testid="input-arreglo-fecha" />
            </div>
            <div>
              <Label className="text-xs">Observacion</Label>
              <Input value={arregloForm.observacion} onChange={e => setArregloForm({ ...arregloForm, observacion: e.target.value })} placeholder="Detalle..." data-testid="input-arreglo-obs" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setArregloDialogOpen(false)}>Cancelar</Button>
            <Button type="button" size="sm" onClick={handleSaveArreglo} disabled={saving} data-testid="btn-guardar-arreglo">{saving ? 'Guardando...' : 'Crear Envio'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG: Resolucion */}
      <Dialog open={resolucionDialogOpen} onOpenChange={setResolucionDialogOpen}>
        <DialogContent className="max-w-sm" data-testid="dialog-resolucion">
          <DialogHeader>
            <DialogTitle className="text-sm">Resolucion del Arreglo ({resCantidad} prendas)</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-emerald-600">Recuperado</Label>
              <Input type="number" min={0} max={resCantidad} value={resolucionForm.cantidad_recuperada} onChange={e => setResolucionForm({ ...resolucionForm, cantidad_recuperada: e.target.value })} data-testid="input-res-recuperado" />
            </div>
            <div>
              <Label className="text-xs text-orange-600">Liquidacion</Label>
              <Input type="number" min={0} max={resCantidad} value={resolucionForm.cantidad_liquidacion} onChange={e => setResolucionForm({ ...resolucionForm, cantidad_liquidacion: e.target.value })} data-testid="input-res-liquidacion" />
            </div>
            <div>
              <Label className="text-xs text-red-600">Merma</Label>
              <Input type="number" min={0} max={resCantidad} value={resolucionForm.cantidad_merma} onChange={e => setResolucionForm({ ...resolucionForm, cantidad_merma: e.target.value })} data-testid="input-res-merma" />
            </div>
            {/* Barra de progreso */}
            <div className="pt-1">
              <div className="flex justify-between text-[10px] mb-1">
                <span>Asignado: {resTotal} / {resCantidad}</span>
                <span className={resExcede ? 'text-red-600 font-semibold' : resFalta ? 'text-amber-600' : 'text-emerald-600 font-semibold'}>
                  {resExcede ? 'EXCEDE' : resFalta ? `Faltan ${resCantidad - resTotal}` : 'COMPLETO'}
                </span>
              </div>
              <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-2">
                <div className={`h-2 rounded-full transition-all ${resExcede ? 'bg-red-500' : resTotal === resCantidad ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(Math.round(resTotal / Math.max(resCantidad, 1) * 100), 100)}%` }} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setResolucionDialogOpen(false)}>Cancelar</Button>
            <Button type="button" size="sm" onClick={handleSaveResolucion} disabled={saving || resExcede} data-testid="btn-guardar-resolucion">{saving ? 'Guardando...' : 'Guardar Resolucion'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const MetricCard = ({ label, value, color = 'zinc' }) => {
  const colorMap = {
    zinc: 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800',
    emerald: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800',
    amber: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800',
    red: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800',
    blue: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800',
    orange: 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800',
  };
  return (
    <div className={`rounded-lg border p-2 text-center ${colorMap[color] || colorMap.zinc}`} data-testid={`metric-${label.toLowerCase().replace(/\s/g, '-')}`}>
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground truncate">{label}</p>
      <p className="text-lg font-bold font-mono">{value}</p>
    </div>
  );
};
