import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Separator } from './ui/separator';
import { Textarea } from './ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from './ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from './ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import {
  AlertTriangle, Clock, CheckCircle2, XCircle, ArrowRight,
  Package, Wrench, Trash2, Plus, Pencil, ChevronDown, ChevronUp,
  ArrowUpCircle, Shield, Timer, CircleDot,
} from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const fmtDate = (d) => {
  if (!d) return '-';
  const s = String(d).slice(0, 10);
  const [y, m, dd] = s.split('-');
  return `${dd}-${m}-${y?.slice(2)}`;
};

const BalanceCard = ({ label, value, color = 'default', sub }) => {
  const colors = {
    default: 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800',
    primary: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800',
    danger: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800',
    warning: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800',
    success: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800',
  };
  return (
    <div className={`rounded-lg border p-3 text-center ${colors[color] || colors.default}`} data-testid={`balance-${label.toLowerCase().replace(/\s/g, '-')}`}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{label}</p>
      <p className="text-lg font-bold font-mono">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
};

const EventoIcon = ({ tipo }) => {
  const map = {
    MOVIMIENTO: <ArrowRight className="h-4 w-4 text-blue-500" />,
    MERMA: <AlertTriangle className="h-4 w-4 text-amber-500" />,
    FALLADO: <XCircle className="h-4 w-4 text-red-500" />,
    ARREGLO: <Wrench className="h-4 w-4 text-violet-500" />,
    DIVISION: <Package className="h-4 w-4 text-cyan-500" />,
  };
  return map[tipo] || <CircleDot className="h-4 w-4 text-muted-foreground" />;
};

const EventoBadge = ({ tipo }) => {
  const map = {
    MOVIMIENTO: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    MERMA: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    FALLADO: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    ARREGLO: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
    DIVISION: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${map[tipo] || ''}`}>
      <EventoIcon tipo={tipo} />
      {tipo}
    </span>
  );
};

export const TrazabilidadPanel = ({ registroId, servicios = [], personas = [] }) => {
  const [balance, setBalance] = useState(null);
  const [timeline, setTimeline] = useState(null);
  const [fallados, setFallados] = useState([]);
  const [arreglos, setArreglos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('balance');

  // Dialogs
  const [falladoDialogOpen, setFalladoDialogOpen] = useState(false);
  const [editingFalladoId, setEditingFalladoId] = useState(null);
  const [arregloDialogOpen, setArregloDialogOpen] = useState(false);
  const [editArregloDialogOpen, setEditArregloDialogOpen] = useState(false);
  const [cierreArregloDialogOpen, setCierreArregloDialogOpen] = useState(false);
  const [liquidacionDialogOpen, setLiquidacionDialogOpen] = useState(false);
  const [selectedFallado, setSelectedFallado] = useState(null);
  const [selectedArreglo, setSelectedArreglo] = useState(null);

  const [editArregloForm, setEditArregloForm] = useState({
    cantidad_enviada: 0, tipo: 'ARREGLO_EXTERNO', servicio_destino_id: '',
    persona_destino_id: '', fecha_envio: '', motivo: '', observaciones: '',
  });

  const [liquidacionForm, setLiquidacionForm] = useState({
    cantidad: 0, destino: 'LIQUIDACION', motivo: '',
  });

  const [falladoForm, setFalladoForm] = useState({
    cantidad_detectada: 0,
    cantidad_reparable: 0,
    cantidad_no_reparable: 0,
    destino_no_reparable: 'PENDIENTE',
    motivo_no_reparable: '',
    servicio_detectado_id: '',
    fecha_deteccion: '',
    observaciones: '',
  });

  const [arregloForm, setArregloForm] = useState({
    cantidad_enviada: 0,
    tipo: 'ARREGLO_EXTERNO',
    servicio_destino_id: '',
    persona_destino_id: '',
    fecha_envio: '',
    motivo: '',
    observaciones: '',
  });

  const [cierreForm, setCierreForm] = useState({
    cantidad_resuelta: 0,
    cantidad_no_resuelta: 0,
    resultado_final: 'BUENO',
    motivo_no_resuelta: '',
    fecha_retorno: '',
    observaciones: '',
  });

  const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

  const fetchAll = useCallback(async () => {
    if (!registroId) return;
    setLoading(true);
    try {
      const hdrs = { Authorization: `Bearer ${localStorage.getItem('token')}` };
      const results = await Promise.allSettled([
        axios.get(`${API}/registros/${registroId}/resumen-cantidades`, { headers: hdrs }),
        axios.get(`${API}/registros/${registroId}/trazabilidad-completa`, { headers: hdrs }),
        axios.get(`${API}/fallados?registro_id=${registroId}`, { headers: hdrs }),
        axios.get(`${API}/arreglos?registro_id=${registroId}`, { headers: hdrs }),
      ]);
      if (results[0].status === 'fulfilled') setBalance(results[0].value.data);
      if (results[1].status === 'fulfilled') setTimeline(results[1].value.data);
      if (results[2].status === 'fulfilled') setFallados(results[2].value.data);
      if (results[3].status === 'fulfilled') setArreglos(results[3].value.data);
    } catch (err) {
      console.error('Error fetching trazabilidad:', err);
    } finally {
      setLoading(false);
    }
  }, [registroId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ========== Handlers ==========
  const handleSaveFallado = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const payload = {
        registro_id: registroId,
        ...falladoForm,
        motivo: falladoForm.motivo_no_reparable || '',
        servicio_detectado_id: falladoForm.servicio_detectado_id || null,
      };
      delete payload.motivo_no_reparable;
      if (editingFalladoId) {
        await axios.put(`${API}/fallados/${editingFalladoId}`, payload, { headers: getHeaders() });
        toast.success('Fallado actualizado');
      } else {
        await axios.post(`${API}/fallados`, payload, { headers: getHeaders() });
        toast.success('Fallado registrado');
      }
      setFalladoDialogOpen(false);
      setEditingFalladoId(null);
      resetFalladoForm();
      fetchAll();
    } catch (err) {
      toast.error(typeof err.response?.data?.detail === 'string' ? err.response?.data?.detail : 'Error al guardar fallado');
    } finally {
      setSaving(false);
    }
  };

  const openEditFallado = (f) => {
    setEditingFalladoId(f.id);
    setFalladoForm({
      cantidad_detectada: f.cantidad_detectada || 0,
      cantidad_reparable: f.cantidad_reparable || 0,
      cantidad_no_reparable: f.cantidad_no_reparable || 0,
      destino_no_reparable: f.destino_no_reparable || 'PENDIENTE',
      motivo_no_reparable: f.motivo || '',
      servicio_detectado_id: f.servicio_detectado_id || '',
      fecha_deteccion: f.fecha_deteccion ? String(f.fecha_deteccion).slice(0, 10) : '',
      observaciones: f.observaciones || '',
    });
    setFalladoDialogOpen(true);
  };

  const handleDeleteFallado = async (id) => {
    if (!window.confirm('Eliminar este registro de fallado?')) return;
    try {
      await axios.delete(`${API}/fallados/${id}`, { headers: getHeaders() });
      toast.success('Fallado eliminado');
      fetchAll();
    } catch (err) {
      toast.error('Error al eliminar');
    }
  };

  const handleCreateArreglo = async () => {
    if (!selectedFallado || saving) return;
    setSaving(true);
    try {
      await axios.post(`${API}/arreglos`, {
        fallado_id: selectedFallado.id,
        registro_id: registroId,
        ...arregloForm,
        servicio_destino_id: arregloForm.servicio_destino_id || null,
        persona_destino_id: arregloForm.persona_destino_id || null,
      }, { headers: getHeaders() });
      toast.success('Arreglo creado');
      setArregloDialogOpen(false);
      resetArregloForm();
      fetchAll();
    } catch (err) {
      toast.error(typeof err.response?.data?.detail === 'string' ? err.response?.data?.detail : 'Error al crear arreglo');
    } finally {
      setSaving(false);
    }
  };

  const handleCerrarArreglo = async () => {
    if (!selectedArreglo || saving) return;
    setSaving(true);
    try {
      await axios.put(`${API}/arreglos/${selectedArreglo.id}/cerrar`, cierreForm, { headers: getHeaders() });
      toast.success('Arreglo cerrado');
      setCierreArregloDialogOpen(false);
      fetchAll();
    } catch (err) {
      toast.error(typeof err.response?.data?.detail === 'string' ? err.response?.data?.detail : 'Error al cerrar arreglo');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteArreglo = async (id) => {
    if (!window.confirm('Eliminar este arreglo?')) return;
    try {
      await axios.delete(`${API}/arreglos/${id}`, { headers: getHeaders() });
      toast.success('Arreglo eliminado');
      fetchAll();
    } catch (err) {
      toast.error('Error al eliminar');
    }
  };

  const openEditArreglo = (a) => {
    setSelectedArreglo(a);
    setEditArregloForm({
      cantidad_enviada: a.cantidad_enviada || 0,
      tipo: a.tipo || 'ARREGLO_EXTERNO',
      servicio_destino_id: a.servicio_destino_id || '',
      persona_destino_id: a.persona_destino_id || '',
      fecha_envio: a.fecha_envio ? String(a.fecha_envio).slice(0, 10) : '',
      motivo: a.motivo || '',
      observaciones: a.observaciones || '',
    });
    setEditArregloDialogOpen(true);
  };

  const handleUpdateArreglo = async () => {
    if (!selectedArreglo || saving) return;
    setSaving(true);
    try {
      await axios.put(`${API}/arreglos/${selectedArreglo.id}`, {
        ...editArregloForm,
        servicio_destino_id: editArregloForm.servicio_destino_id || null,
        persona_destino_id: editArregloForm.persona_destino_id || null,
      }, { headers: getHeaders() });
      toast.success('Arreglo actualizado');
      setEditArregloDialogOpen(false);
      fetchAll();
    } catch (err) {
      toast.error(typeof err.response?.data?.detail === 'string' ? err.response?.data?.detail : 'Error al actualizar arreglo');
    } finally {
      setSaving(false);
    }
  };

  const openLiquidacionDialog = (fallado) => {
    setSelectedFallado(fallado);
    setLiquidacionForm({ cantidad: 0, destino: 'LIQUIDACION', motivo: '' });
    setLiquidacionDialogOpen(true);
  };

  const handleLiquidacionDirecta = async () => {
    if (!selectedFallado || saving) return;
    setSaving(true);
    try {
      await axios.post(`${API}/liquidacion-directa`, {
        fallado_id: selectedFallado.id,
        registro_id: registroId,
        ...liquidacionForm,
      }, { headers: getHeaders() });
      toast.success('Liquidacion registrada');
      setLiquidacionDialogOpen(false);
      fetchAll();
    } catch (err) {
      toast.error(typeof err.response?.data?.detail === 'string' ? err.response?.data?.detail : 'Error al registrar liquidacion');
    } finally {
      setSaving(false);
    }
  };

  const resetFalladoForm = () => setFalladoForm({
    cantidad_detectada: 0, cantidad_reparable: 0, cantidad_no_reparable: 0,
    destino_no_reparable: 'PENDIENTE', motivo_no_reparable: '', servicio_detectado_id: '',
    fecha_deteccion: '', observaciones: '',
  });

  const todayStr = new Date().toISOString().slice(0, 10);

  const resetArregloForm = () => setArregloForm({
    cantidad_enviada: 0, tipo: 'ARREGLO_EXTERNO', servicio_destino_id: '',
    persona_destino_id: '', fecha_envio: todayStr, motivo: '', observaciones: '',
  });

  const openArregloDialog = (fallado) => {
    setSelectedFallado(fallado);
    resetArregloForm();
    setArregloDialogOpen(true);
  };

  const personasFiltradasArreglo = arregloForm.servicio_destino_id
    ? personas.filter(p => {
        const enDetalle = (p.servicios_detalle || []).some(s => s.servicio_id === arregloForm.servicio_destino_id);
        const enServicios = (p.servicios || []).some(s => s.servicio_id === arregloForm.servicio_destino_id);
        const enIds = (p.servicio_ids || []).includes(arregloForm.servicio_destino_id);
        return enDetalle || enServicios || enIds;
      })
    : personas;

  const openCierreDialog = (arreglo) => {
    setSelectedArreglo(arreglo);
    setCierreForm({
      cantidad_resuelta: arreglo.cantidad_enviada, cantidad_no_resuelta: 0,
      resultado_final: 'LIQUIDACION', motivo_no_resuelta: '', fecha_retorno: todayStr, observaciones: '',
    });
    setCierreArregloDialogOpen(true);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Cargando trazabilidad...
        </CardContent>
      </Card>
    );
  }

  const eventos = timeline?.eventos || [];
  const mermas = eventos.filter(e => e.tipo_evento === 'MERMA');
  const divisiones = eventos.filter(e => e.tipo_evento === 'DIVISION');

  return (
    <div className="space-y-4" data-testid="trazabilidad-panel">
      {/* Alertas */}
      {balance?.alertas?.length > 0 && (
        <div className="space-y-2">
          {balance.alertas.map((a, i) => (
            <div key={i} className={`flex items-center gap-2 p-3 rounded-lg border text-sm ${
              a.tipo === 'VENCIDO' ? 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300' :
              a.tipo === 'MERMA' ? 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300' :
              'bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-950/30 dark:border-orange-800 dark:text-orange-300'
            }`} data-testid={`alerta-${a.tipo.toLowerCase()}`}>
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {a.mensaje}
            </div>
          ))}
        </div>
      )}

      {/* Balance del Lote */}
      {balance && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4 text-blue-500" />
                Balance del Lote
              </CardTitle>
              <Badge variant="outline" className="font-mono text-xs">{balance.cantidad_inicial} prendas</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">

            {/* Progreso de ruta de producción */}
            {timeline?.eventos && (() => {
              const movimientos = timeline.eventos.filter(e => e.tipo_evento === 'MOVIMIENTO');
              const serviciosCompletados = new Set(movimientos.filter(m => m.fecha_fin).map(m => m.servicio));
              const serviciosEnCurso = new Set(movimientos.filter(m => !m.fecha_fin).map(m => m.servicio));
              const todosServicios = [...new Set(movimientos.map(m => m.servicio))].filter(Boolean);
              if (todosServicios.length === 0) return null;
              const completados = serviciosCompletados.size;
              const total = todosServicios.length;
              const pctRuta = total > 0 ? Math.round((completados / total) * 100) : 0;
              return (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-muted-foreground font-medium">Avance de ruta</span>
                    <span className="text-xs font-mono font-semibold">{completados}/{total} etapas ({pctRuta}%)</span>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {todosServicios.map((s, i) => {
                      const done = serviciosCompletados.has(s);
                      const active = serviciosEnCurso.has(s);
                      return (
                        <div key={i} className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border
                          ${done ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : active ? 'bg-blue-50 border-blue-300 text-blue-700 animate-pulse' : 'bg-muted border-transparent text-muted-foreground'}`}>
                          {done ? <CheckCircle2 className="h-2.5 w-2.5" /> : active ? <Clock className="h-2.5 w-2.5" /> : <CircleDot className="h-2.5 w-2.5 opacity-40" />}
                          {s}
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full overflow-hidden bg-muted">
                    <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pctRuta}%` }} />
                  </div>
                </div>
              );
            })()}

            {/* Barra de distribución de cantidades */}
            {balance.cantidad_inicial > 0 && (() => {
              const total = balance.cantidad_inicial;
              const segments = [
                { val: balance.en_produccion || 0, color: 'bg-blue-500', label: 'En producción' },
                { val: balance.fallados_en_arreglo || 0, color: 'bg-violet-500', label: 'En arreglo' },
                { val: balance.fallados_reparados || 0, color: 'bg-emerald-500', label: 'Reparados' },
                { val: (balance.liquidacion || 0) + (balance.segunda || 0) + (balance.descarte || 0), color: 'bg-rose-500', label: 'Liquidados' },
                { val: balance.fallados_sin_asignar || 0, color: 'bg-orange-400', label: 'Sin asignar' },
                { val: balance.mermas || 0, color: 'bg-amber-500', label: 'Mermas' },
                { val: balance.divididos || 0, color: 'bg-cyan-500', label: 'Divididos' },
              ].filter(s => s.val > 0);
              const tieneNovedades = segments.length > 1 || (segments.length === 1 && segments[0].label !== 'En producción');
              return (
                <div>
                  <div className="flex h-2.5 rounded-full overflow-hidden border">
                    {segments.map((s, i) => (
                      <div key={i} className={`${s.color} transition-all`} style={{ width: `${(s.val / total) * 100}%` }} title={`${s.label}: ${s.val}`} />
                    ))}
                  </div>
                  {tieneNovedades && (
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
                      {segments.map((s, i) => (
                        <span key={i} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <span className={`inline-block w-2 h-2 rounded-sm ${s.color}`} />
                          {s.label}: <span className="font-mono font-semibold">{s.val}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Grid de métricas principales */}
            <div className="grid grid-cols-5 gap-2">
              <div className="text-center p-2 rounded-md bg-blue-50 border border-blue-100">
                <div className="text-lg font-bold font-mono text-blue-700">{balance.en_produccion}</div>
                <div className="text-[10px] text-blue-600 font-medium">En producción</div>
              </div>
              <div className={`text-center p-2 rounded-md ${balance.mermas > 0 ? 'bg-amber-50 border border-amber-100' : 'bg-muted/50 border border-transparent'}`}>
                <div className={`text-lg font-bold font-mono ${balance.mermas > 0 ? 'text-amber-700' : 'text-muted-foreground'}`}>{balance.mermas || 0}</div>
                <div className={`text-[10px] font-medium ${balance.mermas > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>Mermas</div>
              </div>
              <div className={`text-center p-2 rounded-md ${balance.fallados_total > 0 ? 'bg-red-50 border border-red-100' : 'bg-muted/50 border border-transparent'}`}>
                <div className={`text-lg font-bold font-mono ${balance.fallados_total > 0 ? 'text-red-700' : 'text-muted-foreground'}`}>{balance.fallados_total || 0}</div>
                <div className={`text-[10px] font-medium ${balance.fallados_total > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>Fallados</div>
              </div>
              {(() => {
                const totalLiquidados = (balance.liquidacion || 0) + (balance.segunda || 0) + (balance.descarte || 0);
                return (
                  <div className={`text-center p-2 rounded-md ${totalLiquidados > 0 ? 'bg-rose-50 border border-rose-100' : 'bg-muted/50 border border-transparent'}`}>
                    <div className={`text-lg font-bold font-mono ${totalLiquidados > 0 ? 'text-rose-700' : 'text-muted-foreground'}`}>{totalLiquidados}</div>
                    <div className={`text-[10px] font-medium ${totalLiquidados > 0 ? 'text-rose-600' : 'text-muted-foreground'}`}>Liquidados</div>
                  </div>
                );
              })()}
              <div className={`text-center p-2 rounded-md ${balance.divididos > 0 ? 'bg-cyan-50 border border-cyan-100' : 'bg-muted/50 border border-transparent'}`}>
                <div className={`text-lg font-bold font-mono ${balance.divididos > 0 ? 'text-cyan-700' : 'text-muted-foreground'}`}>{balance.divididos || 0}</div>
                <div className={`text-[10px] font-medium ${balance.divididos > 0 ? 'text-cyan-600' : 'text-muted-foreground'}`}>Divididos</div>
              </div>
            </div>

            {/* Desglose de fallados (solo si hay) */}
            {balance.fallados_total > 0 && (
              <div className="bg-muted/30 rounded-md p-2 space-y-1">
                <span className="text-xs font-semibold text-muted-foreground">Desglose fallados</span>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                  {balance.fallados_en_arreglo > 0 && (
                    <div className="flex justify-between">
                      <span className="text-violet-600">En arreglo{balance.arreglos_vencidos > 0 ? ` (${balance.arreglos_vencidos} venc.)` : ''}</span>
                      <span className="font-mono font-semibold">{balance.fallados_en_arreglo}</span>
                    </div>
                  )}
                  {balance.fallados_reparados > 0 && (
                    <div className="flex justify-between">
                      <span className="text-emerald-600">Reparados</span>
                      <span className="font-mono font-semibold">{balance.fallados_reparados}</span>
                    </div>
                  )}
                  {balance.liquidacion > 0 && (
                    <div className="flex justify-between"><span>Liquidación</span><span className="font-mono font-semibold">{balance.liquidacion}</span></div>
                  )}
                  {balance.segunda > 0 && (
                    <div className="flex justify-between"><span>Segunda</span><span className="font-mono font-semibold">{balance.segunda}</span></div>
                  )}
                  {balance.descarte > 0 && (
                    <div className="flex justify-between"><span>Descarte</span><span className="font-mono font-semibold">{balance.descarte}</span></div>
                  )}
                  {balance.fallados_sin_asignar > 0 && (
                    <div className="flex justify-between text-orange-600 font-medium">
                      <span>Sin asignar</span><span className="font-mono font-semibold">{balance.fallados_sin_asignar}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Alertas */}
            {balance.alertas?.length > 0 && (
              <div className="space-y-1">
                {balance.alertas.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 px-2 py-1 rounded-md bg-destructive/10 text-destructive text-xs">
                    <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                    {a.mensaje}
                  </div>
                ))}
              </div>
            )}

            {/* Padre / Hijos */}
            {(balance.padre || balance.hijos?.length > 0) && (
              <div className="pt-2 border-t">
                <div className="flex flex-wrap gap-2 text-xs">
                  {balance.padre && (
                    <Badge variant="outline" className="gap-1">
                      <ArrowUpCircle className="h-3 w-3" /> Padre: {balance.padre.n_corte}
                    </Badge>
                  )}
                  {balance.hijos?.map(h => (
                    <Badge key={h.id} variant="outline" className="gap-1">
                      <Package className="h-3 w-3" /> {h.n_corte}: {h.prendas}p ({h.estado})
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Verificación de suma */}
            {(() => {
              const suma = (balance.en_produccion || 0) + (balance.fallados_total || 0) - (balance.fallados_reparados || 0) + (balance.mermas || 0) + (balance.divididos || 0);
              const cuadra = suma === balance.cantidad_inicial;
              if (cuadra) return null;
              return (
                <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-destructive/10 text-destructive text-xs font-mono">
                  <AlertTriangle className="h-3 w-3" />
                  Descuadre: {suma} ≠ {balance.cantidad_inicial}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full flex flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="balance" className="text-xs">Timeline</TabsTrigger>
          <TabsTrigger value="fallados" className="text-xs">
            Fallados {fallados.length > 0 && <Badge variant="destructive" className="ml-1 h-4 px-1 text-[10px]">{fallados.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="arreglos" className="text-xs">
            Arreglos {arreglos.length > 0 && <Badge className="ml-1 h-4 px-1 text-[10px] bg-violet-600">{arreglos.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="mermas" className="text-xs">
            Diferencias {mermas.length > 0 && <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px]">{mermas.length}</Badge>}
          </TabsTrigger>
          {divisiones.length > 0 && (
            <TabsTrigger value="divisiones" className="text-xs">Divisiones</TabsTrigger>
          )}
        </TabsList>

        {/* Timeline Tab */}
        <TabsContent value="balance">
          <Card>
            <CardContent className="pt-4">
              {eventos.length > 0 ? (
                <div className="space-y-2">
                  {eventos.map((ev, i) => (
                    <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg border bg-card hover:bg-muted/30 transition-colors" data-testid={`evento-${i}`}>
                      <div className="mt-0.5"><EventoIcon tipo={ev.tipo_evento} /></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <EventoBadge tipo={ev.tipo_evento} />
                          <span className="text-xs text-muted-foreground font-mono">{fmtDate(ev.fecha)}</span>
                        </div>
                        <div className="mt-1 text-sm">
                          {ev.tipo_evento === 'MOVIMIENTO' && (
                            <span>{ev.servicio} {ev.persona ? `(${ev.persona})` : ''} - Env: {ev.cantidad_enviada}, Rec: {ev.cantidad_recibida}{ev.diferencia > 0 ? `, Dif: -${ev.diferencia}` : ''}</span>
                          )}
                          {ev.tipo_evento === 'MERMA' && (
                            <span>-{ev.cantidad} prendas {ev.motivo ? `- ${ev.motivo}` : ''} {ev.servicio ? `en ${ev.servicio}` : ''}</span>
                          )}
                          {ev.tipo_evento === 'FALLADO' && (
                            <span>{ev.cantidad_detectada} detectados ({ev.cantidad_reparable}R / {ev.cantidad_no_reparable}NR) {ev.motivo ? `- ${ev.motivo}` : ''} - {ev.estado}</span>
                          )}
                          {ev.tipo_evento === 'ARREGLO' && (
                            <span>{ev.tipo}: {ev.cantidad_enviada} env. {ev.servicio ? `a ${ev.servicio}` : ''} {ev.persona ? `(${ev.persona})` : ''} - {ev.estado}{ev.vencido ? ' VENCIDO' : ''}</span>
                          )}
                          {ev.tipo_evento === 'DIVISION' && (
                            <span>Lote hijo: {ev.hijo_n_corte} ({ev.hijo_prendas} prendas) - {ev.hijo_estado}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  <Clock className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Sin eventos registrados</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Fallados Tab */}
        <TabsContent value="fallados">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm">Productos Fallados</CardTitle>
              <Button size="sm" type="button" onClick={() => { setEditingFalladoId(null); resetFalladoForm(); setFalladoDialogOpen(true); }} data-testid="btn-nuevo-fallado">
                <Plus className="h-3.5 w-3.5 mr-1" /> Registrar Fallado
              </Button>
            </CardHeader>
            <CardContent>
              {fallados.length > 0 ? (
                <div className="space-y-3">
                  {fallados.map(f => {
                    const arreglosDeFallado = arreglos.filter(a => a.fallado_id === f.id);
                    return (
                      <div key={f.id} className="rounded-lg border p-3 space-y-2" data-testid={`fallado-${f.id}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <XCircle className="h-4 w-4 text-red-500" />
                            <span className="font-medium text-sm">{f.cantidad_detectada} fallados</span>
                            <Badge variant={f.estado === 'CERRADO' ? 'default' : f.estado === 'EN_PROCESO' ? 'secondary' : 'destructive'} className="text-[10px]">
                              {f.estado}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditFallado(f)}
                              title="Editar fallado" data-testid={`btn-edit-fallado-${f.id}`}>
                              <Pencil className="h-3.5 w-3.5 text-blue-500" />
                            </Button>
                            <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => openArregloDialog(f)}
                              title="Enviar a arreglo" data-testid={`btn-arreglo-${f.id}`}>
                              <Wrench className="h-3.5 w-3.5 text-violet-500" />
                            </Button>
                            <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => openLiquidacionDialog(f)}
                              title="Liquidar directo" data-testid={`btn-liquidar-${f.id}`}>
                              <ArrowRight className="h-3.5 w-3.5 text-red-500" />
                            </Button>
                            <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDeleteFallado(f.id)} data-testid={`btn-del-fallado-${f.id}`}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                          <div><span className="text-muted-foreground">Reparables:</span> <span className="font-medium">{f.cantidad_reparable}</span></div>
                          <div><span className="text-muted-foreground">No Reparables:</span> <span className="font-medium">{f.cantidad_no_reparable}</span></div>
                          <div><span className="text-muted-foreground">Destino NR:</span> <span className="font-medium">{f.destino_no_reparable}</span></div>
                          <div><span className="text-muted-foreground">Fecha:</span> <span className="font-mono">{fmtDate(f.fecha_deteccion)}</span></div>
                        </div>
                        {f.motivo && <p className="text-xs text-muted-foreground">Motivo NR: {f.motivo}</p>}
                        {f.servicio_detectado_nombre && <p className="text-xs text-muted-foreground">Detectado en: {f.servicio_detectado_nombre}</p>}

                        {/* Arreglos anidados */}
                        {arreglosDeFallado.length > 0 && (
                          <div className="pl-4 border-l-2 border-violet-200 dark:border-violet-800 space-y-2 mt-2">
                            {arreglosDeFallado.map(a => (
                              <div key={a.id} className={`rounded border p-2 text-xs ${a.vencido ? 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800' : 'bg-violet-50/50 dark:bg-violet-950/10'}`} data-testid={`arreglo-${a.id}`}>
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Wrench className="h-3 w-3 text-violet-500" />
                                    <span className="font-medium">{a.tipo}</span>
                                    <Badge variant={a.estado === 'RESUELTO' ? 'default' : 'secondary'} className="text-[9px] h-4">
                                      {a.estado}{a.vencido ? ' - VENCIDO' : ''}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    {a.estado === 'PENDIENTE' && (
                                      <>
                                        <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => openEditArreglo(a)} title="Editar arreglo" data-testid={`btn-edit-arreglo-${a.id}`}>
                                          <Pencil className="h-3 w-3 text-blue-500" />
                                        </Button>
                                        <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => openCierreDialog(a)} title="Cerrar arreglo" data-testid={`btn-cerrar-arreglo-${a.id}`}>
                                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                                        </Button>
                                      </>
                                    )}
                                    <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleDeleteArreglo(a.id)} data-testid={`btn-del-arreglo-${a.id}`}>
                                      <Trash2 className="h-3 w-3 text-destructive" />
                                    </Button>
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 mt-1">
                                  <span>Enviadas: {a.cantidad_enviada}</span>
                                  {a.estado === 'RESUELTO' && <span>Resueltas: {a.cantidad_resuelta}</span>}
                                  {a.estado === 'RESUELTO' && <span>No resueltas: {a.cantidad_no_resuelta}</span>}
                                  <span>Envio: {fmtDate(a.fecha_envio)}</span>
                                  <span>Limite: {fmtDate(a.fecha_limite)}</span>
                                  {a.fecha_retorno && <span>Retorno: {fmtDate(a.fecha_retorno)}</span>}
                                  {a.servicio_destino_nombre && <span>Serv: {a.servicio_destino_nombre}</span>}
                                  {a.persona_destino_nombre && <span>Pers: {a.persona_destino_nombre}</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Sin productos fallados</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Arreglos Tab */}
        <TabsContent value="arreglos">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Arreglos</CardTitle>
            </CardHeader>
            <CardContent>
              {arreglos.length > 0 ? (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="text-xs">Tipo</TableHead>
                        <TableHead className="text-xs">Servicio/Persona</TableHead>
                        <TableHead className="text-xs text-center">Env.</TableHead>
                        <TableHead className="text-xs text-center">Res.</TableHead>
                        <TableHead className="text-xs text-center">Envio</TableHead>
                        <TableHead className="text-xs text-center">Limite</TableHead>
                        <TableHead className="text-xs text-center">Estado</TableHead>
                        <TableHead className="text-xs text-right">Acc.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {arreglos.map(a => (
                        <TableRow key={a.id} className={a.vencido ? 'bg-red-50 dark:bg-red-950/10' : ''} data-testid={`arreglo-row-${a.id}`}>
                          <TableCell className="text-xs font-medium">{a.tipo}</TableCell>
                          <TableCell className="text-xs">{a.servicio_destino_nombre || a.persona_destino_nombre || '-'}</TableCell>
                          <TableCell className="text-xs text-center font-mono">{a.cantidad_enviada}</TableCell>
                          <TableCell className="text-xs text-center font-mono">{a.estado === 'RESUELTO' ? a.cantidad_resuelta : '-'}</TableCell>
                          <TableCell className="text-xs text-center font-mono">{fmtDate(a.fecha_envio)}</TableCell>
                          <TableCell className={`text-xs text-center font-mono ${a.vencido ? 'text-red-600 font-semibold' : ''}`}>{fmtDate(a.fecha_limite)}</TableCell>
                          <TableCell className="text-xs text-center">
                            <Badge variant={a.estado === 'RESUELTO' ? 'default' : a.vencido ? 'destructive' : 'secondary'} className="text-[10px]">
                              {a.estado}{a.vencido ? ' VENC.' : ''}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {a.estado === 'PENDIENTE' && (
                                <>
                                  <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditArreglo(a)} title="Editar" data-testid={`btn-edit-arreglo-tbl-${a.id}`}>
                                    <Pencil className="h-3.5 w-3.5 text-blue-500" />
                                  </Button>
                                  <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => openCierreDialog(a)} data-testid={`btn-cerrar-arreglo-tbl-${a.id}`}>
                                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                                  </Button>
                                </>
                              )}
                              <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDeleteArreglo(a.id)} data-testid={`btn-del-arreglo-tbl-${a.id}`}>
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  <Wrench className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Sin arreglos registrados</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Mermas / Diferencias Tab */}
        <TabsContent value="mermas">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Diferencias / Mermas de Proceso</CardTitle>
            </CardHeader>
            <CardContent>
              {mermas.length > 0 ? (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="text-xs">Fecha</TableHead>
                        <TableHead className="text-xs">Servicio</TableHead>
                        <TableHead className="text-xs text-center">Cantidad</TableHead>
                        <TableHead className="text-xs">Motivo</TableHead>
                        <TableHead className="text-xs">Tipo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mermas.map((m, i) => (
                        <TableRow key={i} data-testid={`merma-row-${i}`}>
                          <TableCell className="text-xs font-mono">{fmtDate(m.fecha)}</TableCell>
                          <TableCell className="text-xs">{m.servicio || '-'}</TableCell>
                          <TableCell className="text-xs text-center font-mono font-semibold text-amber-600">-{m.cantidad}</TableCell>
                          <TableCell className="text-xs">{m.motivo || '-'}</TableCell>
                          <TableCell className="text-xs"><Badge variant="outline" className="text-[10px]">{m.tipo || 'FALTANTE'}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Sin diferencias registradas</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Divisiones Tab */}
        {divisiones.length > 0 && (
          <TabsContent value="divisiones">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Lotes Derivados (Divisiones)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="text-xs">Lote Hijo</TableHead>
                        <TableHead className="text-xs text-center">Prendas</TableHead>
                        <TableHead className="text-xs text-center">Estado</TableHead>
                        <TableHead className="text-xs">Fecha</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {divisiones.map((d, i) => (
                        <TableRow key={i} data-testid={`division-row-${i}`}>
                          <TableCell className="text-xs font-medium">{d.hijo_n_corte}</TableCell>
                          <TableCell className="text-xs text-center font-mono">{d.hijo_prendas}</TableCell>
                          <TableCell className="text-xs text-center"><Badge variant="outline" className="text-[10px]">{d.hijo_estado}</Badge></TableCell>
                          <TableCell className="text-xs font-mono">{fmtDate(d.fecha)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* ========== DIALOGS ========== */}

      {/* Dialog: Nuevo/Editar Fallado */}
      <Dialog open={falladoDialogOpen} onOpenChange={v => { if (!v) setEditingFalladoId(null); setFalladoDialogOpen(v); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingFalladoId ? 'Editar Fallado' : 'Registrar Productos Fallados'}</DialogTitle>
            <DialogDescription>Indica la cantidad detectada y clasifica en reparables / no reparables.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Detectados *</Label>
                <Input type="number" min="1" value={falladoForm.cantidad_detectada}
                  onChange={e => setFalladoForm(p => ({ ...p, cantidad_detectada: parseInt(e.target.value) || 0 }))}
                  data-testid="input-fallado-detectados" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Reparables</Label>
                <Input type="number" min="0" value={falladoForm.cantidad_reparable}
                  onChange={e => setFalladoForm(p => ({ ...p, cantidad_reparable: parseInt(e.target.value) || 0 }))}
                  data-testid="input-fallado-reparables" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">No Reparables</Label>
                <Input type="number" min="0" value={falladoForm.cantidad_no_reparable}
                  onChange={e => setFalladoForm(p => ({ ...p, cantidad_no_reparable: parseInt(e.target.value) || 0 }))}
                  data-testid="input-fallado-no-reparables" />
              </div>
            </div>
            {falladoForm.cantidad_no_reparable > 0 && (
              <div className="space-y-1">
                <Label className="text-xs">Destino No Reparables</Label>
                <Select value={falladoForm.destino_no_reparable} onValueChange={v => setFalladoForm(p => ({ ...p, destino_no_reparable: v }))}>
                  <SelectTrigger data-testid="select-destino-nr"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PENDIENTE">Pendiente</SelectItem>
                    <SelectItem value="LIQUIDACION">Liquidacion</SelectItem>
                    <SelectItem value="SEGUNDA">Segunda</SelectItem>
                    <SelectItem value="DESCARTE">Descarte</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Servicio donde se detecto</Label>
              <Select value={falladoForm.servicio_detectado_id} onValueChange={v => setFalladoForm(p => ({ ...p, servicio_detectado_id: v }))}>
                <SelectTrigger data-testid="select-servicio-fallado"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {servicios.map(s => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Fecha deteccion</Label>
              <Input type="date" value={falladoForm.fecha_deteccion}
                onChange={e => setFalladoForm(p => ({ ...p, fecha_deteccion: e.target.value }))}
                data-testid="input-fallado-fecha" />
            </div>
            {falladoForm.cantidad_no_reparable > 0 && (
              <div className="space-y-1">
                <Label className="text-xs">Motivo no reparables</Label>
                <Input value={falladoForm.motivo_no_reparable} onChange={e => setFalladoForm(p => ({ ...p, motivo_no_reparable: e.target.value }))}
                  placeholder="Ej: Manchas irreparables, tela rota..." data-testid="input-fallado-motivo" />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Observaciones</Label>
              <Textarea value={falladoForm.observaciones} onChange={e => setFalladoForm(p => ({ ...p, observaciones: e.target.value }))}
                rows={2} data-testid="input-fallado-obs" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setEditingFalladoId(null); setFalladoDialogOpen(false); }}>Cancelar</Button>
            <Button type="button" onClick={handleSaveFallado}
              disabled={saving || falladoForm.cantidad_detectada < 1 || (falladoForm.cantidad_reparable + falladoForm.cantidad_no_reparable) > falladoForm.cantidad_detectada}
              data-testid="btn-guardar-fallado">
              {saving ? 'Guardando...' : editingFalladoId ? 'Guardar Cambios' : 'Registrar Fallado'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Nuevo Arreglo */}
      <Dialog open={arregloDialogOpen} onOpenChange={setArregloDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Enviar a Arreglo</DialogTitle>
            <DialogDescription>
              Fallado: {selectedFallado?.cantidad_detectada} detectados ({selectedFallado?.cantidad_reparable} reparables)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Cantidad a enviar *</Label>
                <Input type="number" min="1" value={arregloForm.cantidad_enviada}
                  onChange={e => setArregloForm(p => ({ ...p, cantidad_enviada: parseInt(e.target.value) || 0 }))}
                  data-testid="input-arreglo-cantidad" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tipo</Label>
                <Select value={arregloForm.tipo} onValueChange={v => setArregloForm(p => ({ ...p, tipo: v }))}>
                  <SelectTrigger data-testid="select-arreglo-tipo"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ARREGLO_INTERNO">Interno</SelectItem>
                    <SelectItem value="ARREGLO_EXTERNO">Externo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Servicio destino</Label>
              <Select value={arregloForm.servicio_destino_id} onValueChange={v => setArregloForm(p => ({ ...p, servicio_destino_id: v, persona_destino_id: '' }))}>
                <SelectTrigger data-testid="select-arreglo-servicio"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {servicios.map(s => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Persona destino</Label>
              <Select value={arregloForm.persona_destino_id} onValueChange={v => setArregloForm(p => ({ ...p, persona_destino_id: v }))}>
                <SelectTrigger data-testid="select-arreglo-persona"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {personasFiltradasArreglo.length === 0 ? (
                    <SelectItem value="_none" disabled>Sin personas para este servicio</SelectItem>
                  ) : (
                    personasFiltradasArreglo.map(p => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)
                  )}
                </SelectContent>
              </Select>
              {arregloForm.servicio_destino_id && personasFiltradasArreglo.length === 0 && (
                <p className="text-[10px] text-amber-600">No hay personas asignadas a este servicio</p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Fecha envio</Label>
              <Input type="date" value={arregloForm.fecha_envio}
                onChange={e => setArregloForm(p => ({ ...p, fecha_envio: e.target.value }))}
                data-testid="input-arreglo-fecha" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Motivo del arreglo</Label>
              <Input value={arregloForm.motivo} onChange={e => setArregloForm(p => ({ ...p, motivo: e.target.value }))}
                placeholder="Ej: Costura torcida, ojal desalineado..." data-testid="input-arreglo-motivo" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Observaciones</Label>
              <Textarea value={arregloForm.observaciones} onChange={e => setArregloForm(p => ({ ...p, observaciones: e.target.value }))}
                rows={2} data-testid="input-arreglo-obs" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setArregloDialogOpen(false)}>Cancelar</Button>
            <Button type="button" onClick={handleCreateArreglo} disabled={saving || arregloForm.cantidad_enviada < 1} data-testid="btn-guardar-arreglo">
              {saving ? 'Guardando...' : 'Crear Arreglo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Cerrar Arreglo */}
      <Dialog open={cierreArregloDialogOpen} onOpenChange={setCierreArregloDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cerrar Arreglo</DialogTitle>
            <DialogDescription>
              Prendas enviadas: <span className="font-semibold">{selectedArreglo?.cantidad_enviada}</span>. Indica cuantas se resolvieron y el destino de las que no.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Resueltas (vuelven a produccion)</Label>
                <Input type="number" min="0" value={cierreForm.cantidad_resuelta}
                  onChange={e => {
                    const val = parseInt(e.target.value) || 0;
                    setCierreForm(p => ({ ...p, cantidad_resuelta: val, cantidad_no_resuelta: Math.max(0, (selectedArreglo?.cantidad_enviada || 0) - val) }));
                  }}
                  data-testid="input-cierre-resueltas" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">No resueltas</Label>
                <Input type="number" min="0" value={cierreForm.cantidad_no_resuelta}
                  onChange={e => {
                    const val = parseInt(e.target.value) || 0;
                    setCierreForm(p => ({ ...p, cantidad_no_resuelta: val, cantidad_resuelta: Math.max(0, (selectedArreglo?.cantidad_enviada || 0) - val) }));
                  }}
                  data-testid="input-cierre-no-resueltas" />
              </div>
            </div>

            {/* Balance visual */}
            {selectedArreglo && (
              <div className={`text-xs p-2 rounded border ${
                (cierreForm.cantidad_resuelta + cierreForm.cantidad_no_resuelta) === selectedArreglo.cantidad_enviada
                  ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-950/20 dark:border-green-800 dark:text-green-400'
                  : 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-400'
              }`}>
                {cierreForm.cantidad_resuelta} resueltas + {cierreForm.cantidad_no_resuelta} no resueltas = {cierreForm.cantidad_resuelta + cierreForm.cantidad_no_resuelta} / {selectedArreglo.cantidad_enviada} enviadas
              </div>
            )}

            {/* Destino de no resueltas - solo si hay */}
            {cierreForm.cantidad_no_resuelta > 0 && (
              <div className="space-y-2 p-3 rounded-lg border border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/10">
                <Label className="text-xs font-semibold text-red-700 dark:text-red-400">Destino de las {cierreForm.cantidad_no_resuelta} no resueltas</Label>
                <Select value={cierreForm.resultado_final} onValueChange={v => setCierreForm(p => ({ ...p, resultado_final: v }))}>
                  <SelectTrigger data-testid="select-cierre-resultado"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LIQUIDACION">Liquidacion</SelectItem>
                    <SelectItem value="SEGUNDA">Segunda</SelectItem>
                    <SelectItem value="DESCARTE">Descarte</SelectItem>
                  </SelectContent>
                </Select>
                <Input value={cierreForm.motivo_no_resuelta} onChange={e => setCierreForm(p => ({ ...p, motivo_no_resuelta: e.target.value }))}
                  placeholder="Motivo: ej. No se pudo reparar costura..." className="text-xs" data-testid="input-cierre-motivo" />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Fecha retorno</Label>
              <Input type="date" value={cierreForm.fecha_retorno}
                onChange={e => setCierreForm(p => ({ ...p, fecha_retorno: e.target.value }))}
                data-testid="input-cierre-fecha" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Observaciones</Label>
              <Textarea value={cierreForm.observaciones} onChange={e => setCierreForm(p => ({ ...p, observaciones: e.target.value }))}
                rows={2} data-testid="input-cierre-obs" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCierreArregloDialogOpen(false)}>Cancelar</Button>
            <Button type="button" onClick={handleCerrarArreglo}
              disabled={saving || (cierreForm.cantidad_resuelta + cierreForm.cantidad_no_resuelta) > (selectedArreglo?.cantidad_enviada || 0)}
              data-testid="btn-confirmar-cierre-arreglo">
              {saving ? 'Guardando...' : 'Cerrar Arreglo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Editar Arreglo */}
      <Dialog open={editArregloDialogOpen} onOpenChange={setEditArregloDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Arreglo</DialogTitle>
            <DialogDescription>Modifica los datos del arreglo antes de cerrarlo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Cantidad enviada</Label>
                <Input type="number" min="1" value={editArregloForm.cantidad_enviada}
                  onChange={e => setEditArregloForm(p => ({ ...p, cantidad_enviada: parseInt(e.target.value) || 0 }))}
                  data-testid="input-edit-arreglo-cantidad" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tipo</Label>
                <Select value={editArregloForm.tipo} onValueChange={v => setEditArregloForm(p => ({ ...p, tipo: v }))}>
                  <SelectTrigger data-testid="select-edit-arreglo-tipo"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ARREGLO_INTERNO">Interno</SelectItem>
                    <SelectItem value="ARREGLO_EXTERNO">Externo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Servicio destino</Label>
              <Select value={editArregloForm.servicio_destino_id} onValueChange={v => setEditArregloForm(p => ({ ...p, servicio_destino_id: v, persona_destino_id: '' }))}>
                <SelectTrigger data-testid="select-edit-arreglo-servicio"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {servicios.map(s => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Persona destino</Label>
              <Select value={editArregloForm.persona_destino_id} onValueChange={v => setEditArregloForm(p => ({ ...p, persona_destino_id: v }))}>
                <SelectTrigger data-testid="select-edit-arreglo-persona"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {(editArregloForm.servicio_destino_id
                    ? personas.filter(p => {
                        const enDetalle = (p.servicios_detalle || []).some(s => s.servicio_id === editArregloForm.servicio_destino_id);
                        const enServicios = (p.servicios || []).some(s => s.servicio_id === editArregloForm.servicio_destino_id);
                        const enIds = (p.servicio_ids || []).includes(editArregloForm.servicio_destino_id);
                        return enDetalle || enServicios || enIds;
                      })
                    : personas
                  ).map(p => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Fecha envio</Label>
              <Input type="date" value={editArregloForm.fecha_envio}
                onChange={e => setEditArregloForm(p => ({ ...p, fecha_envio: e.target.value }))}
                data-testid="input-edit-arreglo-fecha" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Motivo del arreglo</Label>
              <Input value={editArregloForm.motivo} onChange={e => setEditArregloForm(p => ({ ...p, motivo: e.target.value }))}
                placeholder="Ej: Costura torcida..." data-testid="input-edit-arreglo-motivo" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Observaciones</Label>
              <Textarea value={editArregloForm.observaciones} onChange={e => setEditArregloForm(p => ({ ...p, observaciones: e.target.value }))}
                rows={2} data-testid="input-edit-arreglo-obs" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditArregloDialogOpen(false)}>Cancelar</Button>
            <Button type="button" onClick={handleUpdateArreglo} disabled={saving || editArregloForm.cantidad_enviada < 1}
              data-testid="btn-guardar-edit-arreglo">
              {saving ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Liquidación Directa */}
      <Dialog open={liquidacionDialogOpen} onOpenChange={setLiquidacionDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Liquidacion Directa</DialogTitle>
            <DialogDescription>
              Enviar prendas directamente a liquidacion/segunda/descarte sin pasar por arreglo.
              Fallado: {selectedFallado?.cantidad_detectada} detectados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">Cantidad a liquidar</Label>
              <Input type="number" min="1" value={liquidacionForm.cantidad}
                onChange={e => setLiquidacionForm(p => ({ ...p, cantidad: parseInt(e.target.value) || 0 }))}
                data-testid="input-liquidacion-cantidad" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Destino</Label>
              <Select value={liquidacionForm.destino} onValueChange={v => setLiquidacionForm(p => ({ ...p, destino: v }))}>
                <SelectTrigger data-testid="select-liquidacion-destino"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="LIQUIDACION">Liquidacion</SelectItem>
                  <SelectItem value="SEGUNDA">Segunda</SelectItem>
                  <SelectItem value="DESCARTE">Descarte</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Motivo</Label>
              <Input value={liquidacionForm.motivo} onChange={e => setLiquidacionForm(p => ({ ...p, motivo: e.target.value }))}
                placeholder="Ej: Manchas irreparables..." data-testid="input-liquidacion-motivo" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setLiquidacionDialogOpen(false)}>Cancelar</Button>
            <Button type="button" onClick={handleLiquidacionDirecta} disabled={saving || liquidacionForm.cantidad < 1}
              data-testid="btn-confirmar-liquidacion">
              {saving ? 'Guardando...' : 'Confirmar Liquidacion'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
