import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import {
  FlaskConical, ArrowLeft, Clock, Package, ChevronDown,
  CheckCircle2, XCircle, RotateCcw, Loader2,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import { formatDate, formatDateTime } from '../lib/dateUtils';
import { formatCurrency } from '../lib/utils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ESTADO_CFG = {
  PENDIENTE:   { label: 'Pendiente',   cls: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300', icon: Clock },
  EN_REVISION: { label: 'En Revisión', cls: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300',    icon: RotateCcw },
  APROBADA:    { label: 'Aprobada',    cls: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300', icon: CheckCircle2 },
  RECHAZADA:   { label: 'Rechazada',   cls: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300',           icon: XCircle },
  CANCELADA:   { label: 'Cancelada',   cls: 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400',      icon: XCircle },
};

const ESTADOS_SIGUIENTES = {
  PENDIENTE:   ['EN_REVISION', 'APROBADA', 'RECHAZADA', 'CANCELADA'],
  EN_REVISION: ['APROBADA', 'RECHAZADA', 'CANCELADA'],
  APROBADA:    ['CANCELADA'],
  RECHAZADA:   ['PENDIENTE', 'CANCELADA'],
  CANCELADA:   ['PENDIENTE'],
};

export const MuestraDetalle = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [muestra, setMuestra] = useState(null);
  const [loading, setLoading] = useState(true);
  const [estadoDialog, setEstadoDialog] = useState(false);
  const [nuevoEstado, setNuevoEstado] = useState('');
  const [comentario, setComentario] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchMuestra = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/muestras/${id}`);
      setMuestra(res.data);
    } catch {
      toast.error('No se pudo cargar la muestra');
      navigate('/muestras');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMuestra(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const openEstadoDialog = () => {
    const siguientes = ESTADOS_SIGUIENTES[muestra?.estado] || [];
    setNuevoEstado(siguientes[0] || '');
    setComentario('');
    setEstadoDialog(true);
  };

  const handleCambiarEstado = async () => {
    if (!nuevoEstado) return;
    setSaving(true);
    try {
      await axios.put(`${API}/muestras/${id}/estado`, {
        estado: nuevoEstado,
        comentario: comentario || null,
      });
      toast.success(`Estado cambiado a ${ESTADO_CFG[nuevoEstado]?.label}`);
      setEstadoDialog(false);
      fetchMuestra();
    } catch (err) {
      const d = err.response?.data?.detail;
      toast.error(typeof d === 'string' ? d : 'Error al cambiar estado');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Cargando muestra...
      </div>
    );
  }

  if (!muestra) return null;

  const estadoCfg = ESTADO_CFG[muestra.estado] || ESTADO_CFG.PENDIENTE;
  const EstadoIcon = estadoCfg.icon;
  const siguientes = ESTADOS_SIGUIENTES[muestra.estado] || [];
  const costoTotal = (muestra.materiales || []).reduce((s, m) => s + (m.costo_total || 0), 0);

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/muestras')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <FlaskConical className="h-6 w-6 text-primary" />
              {muestra.codigo}
            </h2>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${estadoCfg.cls}`}>
              <EstadoIcon className="h-3.5 w-3.5" />
              {estadoCfg.label}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {muestra.linea_negocio_nombre && <span className="font-semibold text-foreground">{muestra.linea_negocio_nombre}</span>}
            {muestra.cliente && <> · <span>{muestra.cliente}</span></>}
          </p>
        </div>
        {siguientes.length > 0 && (
          <Button onClick={openEstadoDialog} variant="outline" className="flex-shrink-0">
            <ChevronDown className="h-4 w-4 mr-2" /> Cambiar Estado
          </Button>
        )}
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Fecha Envío', value: formatDate(muestra.fecha_envio) || '-' },
          { label: 'Modelo', value: muestra.modelo_nombre || '-' },
          { label: 'Creado por', value: muestra.usuario_creador || '-' },
          { label: 'Costo Total', value: formatCurrency(costoTotal), mono: true },
        ].map(card => (
          <div key={card.label} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">{card.label}</p>
            <p className={`text-sm font-semibold ${card.mono ? 'font-mono' : ''}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {muestra.observaciones && (
        <div className="rounded-xl border bg-muted/30 p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Observaciones</p>
          <p className="text-sm">{muestra.observaciones}</p>
        </div>
      )}

      {/* Materiales */}
      <div>
        <h3 className="text-base font-semibold flex items-center gap-2 mb-3">
          <Package className="h-4 w-4 text-muted-foreground" /> Materiales
        </h3>
        {(muestra.materiales || []).length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            Sin materiales registrados
          </div>
        ) : (
          <div className="rounded-xl border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="data-table-header">
                  <TableHead>Código</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Costo Unit.</TableHead>
                  <TableHead className="text-right">Costo Total</TableHead>
                  <TableHead>Notas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {muestra.materiales.map(mat => (
                  <TableRow key={mat.id} className="data-table-row">
                    <TableCell className="font-mono text-sm">{mat.item_codigo}</TableCell>
                    <TableCell className="font-medium">{mat.item_nombre}</TableCell>
                    <TableCell className="text-right font-mono">
                      {mat.cantidad} <span className="text-xs text-muted-foreground">{mat.unidad_medida}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(mat.costo_unitario)}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {formatCurrency(mat.costo_total)}
                      {mat.en_migracion && (
                        <Badge variant="outline" className="ml-1 text-[9px] text-yellow-700 border-yellow-300 bg-yellow-50">mig</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{mat.observaciones || '-'}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={4} className="text-right text-sm font-semibold text-muted-foreground pr-3">Total</TableCell>
                  <TableCell className="text-right font-mono font-bold">{formatCurrency(costoTotal)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Historial de estados */}
      <div>
        <h3 className="text-base font-semibold flex items-center gap-2 mb-3">
          <Clock className="h-4 w-4 text-muted-foreground" /> Historial de Estados
        </h3>
        <div className="relative pl-6 space-y-3">
          <div className="absolute left-2 top-0 bottom-0 w-px bg-border" />
          {(muestra.historial || []).map((h, i) => {
            const cfg = ESTADO_CFG[h.estado_nuevo] || ESTADO_CFG.PENDIENTE;
            return (
              <div key={h.id || i} className="relative">
                <div className={`absolute -left-[18px] top-1.5 h-3 w-3 rounded-full border-2 border-background ring-1 ring-border bg-muted`} />
                <div className="rounded-lg border bg-card px-3 py-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfg.cls}`}>
                      {cfg.label}
                    </span>
                    {h.estado_anterior && (
                      <span className="text-xs text-muted-foreground">← {ESTADO_CFG[h.estado_anterior]?.label || h.estado_anterior}</span>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">{formatDateTime(h.fecha)}</span>
                    {h.usuario && <span className="text-xs font-medium">{h.usuario}</span>}
                  </div>
                  {h.comentario && <p className="text-xs text-muted-foreground mt-1">{h.comentario}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dialog cambio de estado */}
      <Dialog open={estadoDialog} onOpenChange={setEstadoDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cambiar Estado</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nuevo Estado</Label>
              <Select value={nuevoEstado} onValueChange={setNuevoEstado}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {siguientes.map(s => (
                    <SelectItem key={s} value={s}>{ESTADO_CFG[s]?.label || s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Comentario</Label>
              <Textarea
                value={comentario}
                onChange={e => setComentario(e.target.value)}
                placeholder="Opcional..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEstadoDialog(false)}>Cancelar</Button>
            <Button onClick={handleCambiarEstado} disabled={saving || !nuevoEstado}>
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Guardando...</> : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MuestraDetalle;
