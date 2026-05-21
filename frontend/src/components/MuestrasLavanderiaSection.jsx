import { Fragment, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import {
  ChevronRight, ChevronDown, Plus, Check, X, Loader2, FlaskConical,
  CheckCircle2, XCircle, AlertCircle, Send, Trash2, ChevronsUpDown,
} from 'lucide-react';
import { formatColorName } from '../lib/utils';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ESTADO_BADGE = {
  enviada:             { label: 'Enviada',     classes: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-950/40 dark:text-blue-400',     icon: Send },
  pendiente_decision:  { label: 'Pendiente',   classes: 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-950/40 dark:text-orange-400', icon: AlertCircle },
  aprobada:            { label: 'Aprobada',    classes: 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-400', icon: CheckCircle2 },
  rechazada:           { label: 'Rechazada',   classes: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-950/40 dark:text-red-400',           icon: XCircle },
  parcial:             { label: 'Parcial',     classes: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-400', icon: AlertCircle },
};

const hoyISO = () => new Date().toISOString().slice(0, 10);
const formatFecha = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y.slice(2)}`;
};

export const MuestrasLavanderiaSection = ({ muestras = [], cortes = [], scope, onChanged }) => {
  const [detalleId, setDetalleId] = useState(null);
  // Muestra mostrada en el modal — siempre la versión más fresca por id
  const detalleMuestra = useMemo(
    () => (detalleId != null ? muestras.find(m => m.id === detalleId) || null : null),
    [detalleId, muestras]
  );
  const [colores, setColores] = useState([]);
  const [openNew, setOpenNew] = useState(false);

  // Carga el catálogo filtrado por la regla aplicable (scope = marca/tipo/entalle/hilo)
  useEffect(() => {
    if (!scope || !openNew) return;
    const params = new URLSearchParams({ solo_regla: 'true' });
    if (scope.marca_id)   params.set('marca_id',   scope.marca_id);
    if (scope.tipo_id)    params.set('tipo_id',    scope.tipo_id);
    if (scope.entalle_id) params.set('entalle_id', scope.entalle_id);
    if (scope.hilo_id)    params.set('hilo_id',    scope.hilo_id);
    axios.get(`${API}/colores-catalogo?${params}`)
      .then(r => {
        const list = Array.isArray(r.data) ? r.data : [];
        if (list.length > 0) return setColores(list);
        // Fallback: catálogo completo si la regla no devuelve
        const fb = new URLSearchParams();
        if (scope.marca_id)   fb.set('marca_id',   scope.marca_id);
        if (scope.tipo_id)    fb.set('tipo_id',    scope.tipo_id);
        if (scope.entalle_id) fb.set('entalle_id', scope.entalle_id);
        fb.set('incluir_todos', 'true');
        return axios.get(`${API}/colores-catalogo?${fb}`).then(r2 => setColores(r2.data || []));
      })
      .catch(() => setColores([]));
  }, [scope, openNew]);

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/40 dark:border-sky-900 dark:bg-sky-950/15 p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <FlaskConical className="h-4 w-4 text-sky-700 dark:text-sky-400" />
          <p className="text-xs font-semibold text-sky-700 dark:text-sky-400">
            Muestras de lavandería — {muestras.length} {muestras.length === 1 ? 'envío' : 'envíos'}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[11px] gap-1"
          onClick={() => setOpenNew(true)}
          data-testid="btn-enviar-muestra"
        >
          <Plus className="h-3 w-3" />
          Enviar muestra
        </Button>
      </div>

      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Enviar muestra a lavandería</DialogTitle>
            <p className="text-xs text-muted-foreground">
              Registro de envío parcial para probar colores antes del proceso completo.
            </p>
          </DialogHeader>
          {openNew && (
            <NuevaMuestraForm
              cortes={cortes}
              colores={colores}
              onCancel={() => setOpenNew(false)}
              onCreated={() => { setOpenNew(false); onChanged?.(); }}
            />
          )}
        </DialogContent>
      </Dialog>

      {muestras.length === 0 && !openNew && (
        <p className="text-xs text-muted-foreground italic">
          Sin muestras enviadas. Usa "Enviar muestra" para registrar un envío parcial a lavandería antes del proceso completo.
        </p>
      )}

      {muestras.length > 0 && (
        <div className="rounded-md border bg-background">
          <table className="w-full text-[11px] border-collapse table-fixed">
            <thead className="bg-muted/95">
              <tr>
                <th className="text-left p-1.5 border-b font-medium w-[55px]">Corte</th>
                <th className="text-left p-1.5 border-b font-medium">Modelo</th>
                <th className="text-left p-1.5 border-b font-medium w-[120px]">Lavandería</th>
                <th className="text-center p-1.5 border-b font-medium w-[40px]">Cant</th>
                <th className="text-center p-1.5 border-b font-medium w-[60px]">Envío</th>
                <th className="text-center p-1.5 border-b font-medium w-[80px]">Devuelta</th>
                <th className="text-center p-1.5 border-b font-medium w-[80px]">Estado</th>
                <th className="text-right p-1.5 border-b font-medium w-[32px]"></th>
              </tr>
            </thead>
            <tbody>
              {muestras.map(m => (
                <MuestraRow
                  key={m.id}
                  muestra={m}
                  onOpenDetalle={() => setDetalleId(m.id)}
                  onChanged={onChanged}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de detalle: tabla completa de colores con decisiones/correcciones */}
      <Dialog open={!!detalleMuestra} onOpenChange={(v) => !v && setDetalleId(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              Muestra · Corte {detalleMuestra?.n_corte} · {detalleMuestra?.modelo || '—'}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              Enviada {formatFecha(detalleMuestra?.fecha_envio)}
              {detalleMuestra?.fecha_retorno && ` · Devuelta ${formatFecha(detalleMuestra.fecha_retorno)}`}
              {' · '}{detalleMuestra?.cantidad_total} prendas
            </p>
          </DialogHeader>
          {detalleMuestra && (
            <DetalleColores muestra={detalleMuestra} onChanged={onChanged} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ──────────────── Fila de muestra + detalle ────────────────

const MuestraRow = ({ muestra, onOpenDetalle, onChanged }) => {
  const estadoCfg = ESTADO_BADGE[muestra.estado] || ESTADO_BADGE.enviada;
  const EstadoIcon = estadoCfg.icon;
  const [savingRetorno, setSavingRetorno] = useState(false);
  const [savingDelete, setSavingDelete] = useState(false);
  const [savingDeshacer, setSavingDeshacer] = useState(false);
  const [savingLav, setSavingLav] = useState(false);
  const [lavanderiasOpts, setLavanderiasOpts] = useState([]);
  const [lavOpen, setLavOpen] = useState(false);

  const hayDecision = (muestra.colores || []).some(c => c.decision);

  // Carga lavanderías solo cuando se abre el popover
  useEffect(() => {
    if (!lavOpen || lavanderiasOpts.length > 0) return;
    axios.get(`${API}/muestras-lavanderia/lavanderias`)
      .then(r => setLavanderiasOpts(Array.isArray(r.data) ? r.data : []))
      .catch(() => setLavanderiasOpts([]));
  }, [lavOpen, lavanderiasOpts.length]);

  const cambiarLavanderia = async (e, personaId) => {
    e.stopPropagation();
    setSavingLav(true);
    try {
      await axios.put(`${API}/muestras-lavanderia/${muestra.id}`, {
        persona_lavanderia_id: personaId,
      });
      toast.success(personaId ? 'Lavandería asignada' : 'Lavandería removida');
      setLavOpen(false);
      onChanged?.();
    } catch (e2) {
      toast.error(e2?.response?.data?.detail || 'Error al actualizar lavandería');
    } finally {
      setSavingLav(false);
    }
  };

  const marcarRetorno = async (e) => {
    e.stopPropagation();
    setSavingRetorno(true);
    try {
      await axios.put(`${API}/muestras-lavanderia/${muestra.id}/retorno`, {
        fecha_retorno: hoyISO(),
      });
      toast.success('Muestra marcada como devuelta');
      onChanged?.();
    } catch (e2) {
      toast.error(e2?.response?.data?.detail || 'Error');
    } finally {
      setSavingRetorno(false);
    }
  };

  const deshacerDevolucion = async (e) => {
    e.stopPropagation();
    if (!window.confirm('¿Deshacer la devolución? La muestra volverá a estado "Enviada".')) return;
    setSavingDeshacer(true);
    try {
      await axios.delete(`${API}/muestras-lavanderia/${muestra.id}/retorno`);
      toast.success('Devolución deshecha');
      onChanged?.();
    } catch (e2) {
      toast.error(e2?.response?.data?.detail || 'Error al deshacer');
    } finally {
      setSavingDeshacer(false);
    }
  };

  const eliminar = async (e) => {
    e.stopPropagation();
    if (!window.confirm('¿Eliminar esta muestra? Esta acción es irreversible.')) return;
    setSavingDelete(true);
    try {
      await axios.delete(`${API}/muestras-lavanderia/${muestra.id}`);
      toast.success('Muestra eliminada');
      onChanged?.();
    } catch (e2) {
      toast.error(e2?.response?.data?.detail || 'Error');
    } finally {
      setSavingDelete(false);
    }
  };

  return (
    <tr
      className="border-b cursor-pointer hover:bg-muted/30"
      onClick={onOpenDetalle}
      title="Ver detalle de la muestra"
    >
      <td className="p-1.5 font-mono">
        <div className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
          {muestra.n_corte}
        </div>
      </td>
      <td className="p-1.5 truncate" title={muestra.modelo || ''}>{muestra.modelo || '—'}</td>
      <td className="p-1.5 text-[10px]" onClick={(e) => e.stopPropagation()}>
        <Popover open={lavOpen} onOpenChange={setLavOpen}>
          <PopoverTrigger asChild>
            <button
              className="w-full text-left truncate hover:bg-muted/40 rounded px-1 py-0.5 cursor-pointer"
              title={muestra.lavanderia_nombre || 'Click para asignar lavandería'}
              disabled={savingLav}
              data-testid={`btn-lavanderia-${muestra.id}`}
            >
              {savingLav ? (
                <Loader2 className="h-3 w-3 animate-spin inline" />
              ) : muestra.lavanderia_nombre ? (
                <span className="text-foreground">{muestra.lavanderia_nombre}</span>
              ) : (
                <span className="text-muted-foreground italic">— asignar</span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-1" align="start">
            <div className="text-[10px] text-muted-foreground px-2 py-1 border-b mb-1">
              Lavandería destino
            </div>
            <button
              className="w-full text-left text-xs px-2 py-1 rounded hover:bg-muted text-muted-foreground italic"
              onClick={(e) => cambiarLavanderia(e, null)}
            >
              Sin asignar
            </button>
            {lavanderiasOpts.map(l => (
              <button
                key={l.id}
                className={`w-full text-left text-xs px-2 py-1 rounded hover:bg-muted ${muestra.persona_lavanderia_id === l.id ? 'font-medium bg-muted/60' : ''}`}
                onClick={(e) => cambiarLavanderia(e, l.id)}
              >
                {muestra.persona_lavanderia_id === l.id && '✓ '}{l.nombre}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </td>
      <td className="p-1.5 text-center font-mono">{muestra.cantidad_total}</td>
      <td className="p-1.5 text-center text-[10px]">{formatFecha(muestra.fecha_envio)}</td>
      <td className="p-1.5 text-center text-[10px]">
        {muestra.fecha_retorno ? (
          <div className="inline-flex items-center gap-1">
            <span>{formatFecha(muestra.fecha_retorno)}</span>
            {!hayDecision && (
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 text-muted-foreground hover:text-destructive"
                onClick={deshacerDevolucion}
                disabled={savingDeshacer}
                title="Deshacer devolución (puse devuelta por error)"
                data-testid={`btn-deshacer-row-${muestra.id}`}
              >
                {savingDeshacer ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <X className="h-2.5 w-2.5" />}
              </Button>
            )}
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-5 text-[9px] px-1.5"
            onClick={marcarRetorno}
            disabled={savingRetorno}
          >
            {savingRetorno ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Devolver'}
          </Button>
        )}
      </td>
      <td className="p-1.5 text-center">
        <Badge className={`text-[9px] px-1 ${estadoCfg.classes}`}>
          <EstadoIcon className="h-2.5 w-2.5 mr-0.5" />
          {estadoCfg.label}
        </Badge>
      </td>
      <td className="p-1.5 text-right">
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          onClick={eliminar}
          disabled={savingDelete}
          title="Eliminar muestra"
        >
          <Trash2 className="h-3 w-3 text-muted-foreground" />
        </Button>
      </td>
    </tr>
  );
};

// ──────────────── Detalle de colores ────────────────

export const DetalleColores = ({ muestra, onChanged }) => {
  const [reenviarOpen, setReenviarOpen] = useState(false);
  const [fechaReenvio, setFechaReenvio] = useState(hoyISO());
  const [obsReenvio, setObsReenvio] = useState('');
  const [savingReenvio, setSavingReenvio] = useState(false);
  const [savingMarcar, setSavingMarcar] = useState(false);
  const [savingDeshacer, setSavingDeshacer] = useState(false);
  const [fechaMarcar, setFechaMarcar] = useState(hoyISO());

  const hayDecision = (muestra.colores || []).some(c => c.decision);
  const rechazados = (muestra.colores || []).filter(c => c.decision === 'rechazado');

  const marcarDevuelta = async () => {
    setSavingMarcar(true);
    try {
      await axios.put(`${API}/muestras-lavanderia/${muestra.id}/retorno`, {
        fecha_retorno: fechaMarcar,
      });
      toast.success('Muestra marcada como devuelta');
      onChanged?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Error al marcar retorno');
    } finally {
      setSavingMarcar(false);
    }
  };

  const deshacerDevolucion = async () => {
    if (!window.confirm('¿Deshacer la devolución? La muestra volverá a estado "Enviada".')) return;
    setSavingDeshacer(true);
    try {
      await axios.delete(`${API}/muestras-lavanderia/${muestra.id}/retorno`);
      toast.success('Devolución deshecha');
      onChanged?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Error al deshacer devolución');
    } finally {
      setSavingDeshacer(false);
    }
  };

  const reenviarRechazados = async () => {
    setSavingReenvio(true);
    try {
      await axios.post(`${API}/muestras-lavanderia/${muestra.id}/reenviar`, {
        fecha_envio: fechaReenvio,
        observaciones: obsReenvio || null,
      });
      toast.success(`Nueva muestra creada con ${rechazados.length} color${rechazados.length > 1 ? 'es' : ''} reenviado${rechazados.length > 1 ? 's' : ''}`);
      setReenviarOpen(false);
      setObsReenvio('');
      onChanged?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Error al reenviar');
    } finally {
      setSavingReenvio(false);
    }
  };

  return (
    <div className="rounded border bg-background overflow-hidden">
      {/* Barra de acciones */}
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b bg-muted/40 flex-wrap">
        <div className="flex items-center gap-2 text-[11px] flex-wrap">
          {muestra.fecha_retorno ? (
            <>
              <Badge variant="outline" className="text-[9px] px-1.5 bg-emerald-50 text-emerald-700 border-emerald-300">
                <Check className="h-2.5 w-2.5 mr-0.5" /> Devuelta {formatFecha(muestra.fecha_retorno)}
              </Badge>
              {!hayDecision && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] px-2"
                  onClick={deshacerDevolucion}
                  disabled={savingDeshacer}
                  title="Limpia la fecha de retorno (solo si nadie tomó decisión)"
                  data-testid="btn-deshacer-devolucion"
                >
                  {savingDeshacer ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3 mr-1" />}
                  Deshacer devolución
                </Button>
              )}
              {hayDecision && (
                <span className="text-[10px] text-muted-foreground italic">
                  No se puede deshacer: ya hay decisiones registradas.
                </span>
              )}
            </>
          ) : (
            <>
              <Badge variant="outline" className="text-[9px] px-1.5 bg-blue-50 text-blue-700 border-blue-300">
                <Send className="h-2.5 w-2.5 mr-0.5" /> Enviada {formatFecha(muestra.fecha_envio)}
              </Badge>
              <input
                type="date"
                value={fechaMarcar}
                onChange={e => setFechaMarcar(e.target.value)}
                className="h-6 text-[10px] px-1.5 rounded border border-input bg-background"
                data-testid="input-fecha-retorno"
              />
              <Button
                size="sm"
                className="h-6 text-[10px] px-2"
                onClick={marcarDevuelta}
                disabled={savingMarcar}
                data-testid="btn-marcar-devuelta"
              >
                {savingMarcar ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                Marcar devuelta
              </Button>
            </>
          )}
        </div>
        {rechazados.length > 0 && (
          <Popover open={reenviarOpen} onOpenChange={setReenviarOpen}>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[10px] px-2 border-orange-300 text-orange-700 hover:bg-orange-50"
                data-testid="btn-reenviar-rechazados"
                title="Crea una nueva muestra con solo los colores rechazados"
              >
                <Send className="h-3 w-3 mr-1" />
                Reenviar rechazados ({rechazados.length})
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-3" align="end">
              <p className="text-xs font-medium mb-2">Reenviar {rechazados.length} color{rechazados.length > 1 ? 'es' : ''} rechazado{rechazados.length > 1 ? 's' : ''}</p>
              <p className="text-[10px] text-muted-foreground mb-2">
                Se crea una muestra nueva con: {rechazados.map(c => formatColorName(c.color_nombre)).join(', ')}. Las correcciones del rechazo se copian como observaciones de envío.
              </p>
              <label className="text-[10px] text-muted-foreground font-medium">Fecha de nuevo envío</label>
              <input
                type="date"
                value={fechaReenvio}
                onChange={e => setFechaReenvio(e.target.value)}
                className="w-full text-xs px-2 py-1 rounded border border-input bg-background mb-2"
                data-testid="input-fecha-reenvio"
              />
              <label className="text-[10px] text-muted-foreground font-medium">Observaciones (opcional)</label>
              <textarea
                value={obsReenvio}
                onChange={e => setObsReenvio(e.target.value)}
                rows={2}
                className="w-full text-xs px-2 py-1 rounded border border-input bg-background mb-2 resize-none"
                placeholder="Nota para lavandería…"
              />
              <div className="flex justify-end gap-1.5">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setReenviarOpen(false)} disabled={savingReenvio}>
                  Cancelar
                </Button>
                <Button size="sm" className="h-7 text-xs" onClick={reenviarRechazados} disabled={savingReenvio}>
                  {savingReenvio ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />}
                  Reenviar
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>

      <table className="w-full text-xs border-collapse">
        <thead className="bg-muted/60">
          <tr>
            <th className="text-left p-1.5 border-b font-medium">Color</th>
            <th className="text-right p-1.5 border-b font-medium w-[70px]">Cant</th>
            <th className="text-left p-1.5 border-b font-medium">Obs. envío</th>
            <th className="text-center p-1.5 border-b font-medium w-[200px]">Decisión</th>
            <th className="text-left p-1.5 border-b font-medium">Correcciones</th>
          </tr>
        </thead>
        <tbody>
          {(muestra.colores || []).map(c => (
            <ColorDecisionRow
              key={c.id}
              colorRow={c}
              disabled={!muestra.fecha_retorno}
              onChanged={onChanged}
            />
          ))}
        </tbody>
      </table>
      {!muestra.fecha_retorno && (
        <p className="text-[10px] text-muted-foreground italic p-2 bg-muted/30">
          La muestra aún no ha sido marcada como devuelta. Las decisiones se habilitan después de registrar el retorno.
        </p>
      )}
      {muestra.observaciones && (
        <p className="text-[11px] text-muted-foreground p-2 bg-muted/20 border-t">
          <span className="font-medium">Obs:</span> {muestra.observaciones}
        </p>
      )}
    </div>
  );
};

const ColorDecisionRow = ({ colorRow, disabled, onChanged }) => {
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [correcciones, setCorrecciones] = useState(colorRow.correcciones || '');

  const decidir = async (decision, correccionesValue) => {
    setSaving(true);
    try {
      await axios.put(`${API}/muestras-lavanderia/colores/${colorRow.id}`, {
        decision,
        correcciones: correccionesValue ?? null,
      });
      toast.success(decision === 'aprobado' ? 'Color aprobado' : 'Color rechazado');
      setEditing(false);
      onChanged?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Error al guardar decisión');
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className="border-b last:border-b-0 hover:bg-muted/20">
      <td className="p-1.5 font-medium">{formatColorName(colorRow.color_nombre)}</td>
      <td className="p-1.5 text-right font-mono">{colorRow.cantidad}</td>
      <td className="p-1.5 text-[11px] text-muted-foreground">
        {colorRow.observaciones_envio || '—'}
      </td>
      <td className="p-1.5 text-center">
        {colorRow.decision === 'aprobado' && (
          <Badge className="text-[9px] px-1.5 bg-emerald-100 text-emerald-700 border-emerald-300">
            <Check className="h-2.5 w-2.5 mr-0.5" /> Aprobado
          </Badge>
        )}
        {colorRow.decision === 'rechazado' && (
          <Badge className="text-[9px] px-1.5 bg-red-100 text-red-700 border-red-300">
            <X className="h-2.5 w-2.5 mr-0.5" /> Rechazado
          </Badge>
        )}
        {!colorRow.decision && (
          <Badge variant="outline" className="text-[9px] px-1.5 text-muted-foreground">Pendiente</Badge>
        )}
        {!disabled && (
          <div className="inline-flex gap-1 ml-2">
            <Button
              variant="outline"
              size="sm"
              className="h-5 text-[9px] px-1.5 gap-0.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              onClick={() => decidir('aprobado', null)}
              disabled={saving}
              title="Aprobar"
            >
              <Check className="h-2.5 w-2.5" />
            </Button>
            <Popover open={editing} onOpenChange={setEditing}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-5 text-[9px] px-1.5 gap-0.5 border-red-300 text-red-700 hover:bg-red-50"
                  disabled={saving}
                  title="Rechazar con correcciones"
                  onClick={() => setCorrecciones(colorRow.correcciones || '')}
                >
                  <X className="h-2.5 w-2.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-2" align="end">
                <p className="text-[11px] font-medium mb-1.5">Rechazar y dejar correcciones</p>
                <textarea
                  value={correcciones}
                  onChange={e => setCorrecciones(e.target.value)}
                  placeholder='Ej: "Sale muy claro, necesita más tiempo de lavado"'
                  className="w-full text-xs px-2 py-1.5 rounded border border-input bg-background min-h-[60px] mb-2"
                  autoFocus
                />
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditing(false)}>Cancelar</Button>
                  <Button size="sm" className="h-7 text-xs" onClick={() => decidir('rechazado', correcciones)} disabled={saving}>
                    {saving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                    Rechazar
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )}
      </td>
      <td className="p-1.5 text-[11px] text-muted-foreground">
        {colorRow.correcciones || (colorRow.decision === 'rechazado' ? '—' : '')}
      </td>
    </tr>
  );
};

// ──────────────── Formulario para nueva muestra ────────────────

export const NuevaMuestraForm = ({ cortes, colores, onCancel, onCreated }) => {
  const [registroId, setRegistroId] = useState(cortes[0]?.id || '');
  const [fechaEnvio, setFechaEnvio] = useState(hoyISO());
  const [observaciones, setObservaciones] = useState('');
  const [lineas, setLineas] = useState([]);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [colorSearch, setColorSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [cortePickerOpen, setCortePickerOpen] = useState(false);
  const [lavanderias, setLavanderias] = useState([]);
  const [lavanderiaId, setLavanderiaId] = useState('');

  // Carga lavanderías activas al montar
  useEffect(() => {
    axios.get(`${API}/muestras-lavanderia/lavanderias`)
      .then(r => setLavanderias(Array.isArray(r.data) ? r.data : []))
      .catch(() => setLavanderias([]));
  }, []);

  const corteSeleccionado = useMemo(
    () => cortes.find(c => c.id === registroId),
    [cortes, registroId]
  );

  const coloresFiltrados = useMemo(() => {
    const term = colorSearch.trim().toLowerCase();
    const usados = new Set(lineas.map(l => l.color_id));
    return colores
      .filter(c => !usados.has(c.id))
      .filter(c => !term || (c.nombre || '').toLowerCase().includes(term));
  }, [colores, colorSearch, lineas]);

  const agregarColor = (color) => {
    setLineas(prev => [...prev, {
      color_id: color.id,
      color_nombre: color.nombre,
      cantidad: 1,
      observaciones_envio: '',
    }]);
    setColorPickerOpen(false);
    setColorSearch('');
  };

  const setCantidad = (idx, val) => {
    setLineas(prev => prev.map((l, i) => i === idx ? { ...l, cantidad: Math.max(0, parseInt(val || '0', 10) || 0) } : l));
  };

  const setObservacion = (idx, val) => {
    setLineas(prev => prev.map((l, i) => i === idx ? { ...l, observaciones_envio: val } : l));
  };

  const quitarLinea = (idx) => {
    setLineas(prev => prev.filter((_, i) => i !== idx));
  };

  const totalCantidad = lineas.reduce((s, l) => s + (l.cantidad || 0), 0);

  const guardar = async () => {
    if (!registroId) { toast.error('Selecciona un corte'); return; }
    if (lineas.length === 0) { toast.error('Agrega al menos un color'); return; }
    if (lineas.some(l => !l.cantidad || l.cantidad <= 0)) { toast.error('Todos los colores deben tener cantidad > 0'); return; }
    setSaving(true);
    try {
      await axios.post(`${API}/registros/${registroId}/muestras-lavanderia`, {
        fecha_envio: fechaEnvio,
        destino: 'lavanderia',
        observaciones: observaciones || null,
        persona_lavanderia_id: lavanderiaId || null,
        colores: lineas.map(l => ({
          color_id: l.color_id,
          color_nombre: formatColorName(l.color_nombre),
          cantidad: l.cantidad,
          observaciones_envio: l.observaciones_envio?.trim() || null,
        })),
      });
      toast.success('Muestra creada');
      onCreated?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Error al crear la muestra');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-6">
          <label className="text-[10px] text-muted-foreground font-medium">Corte</label>
          {cortes.length === 0 ? (
            <div className="w-full text-xs px-2 py-1.5 rounded border border-input bg-background text-muted-foreground italic">
              Sin cortes disponibles
            </div>
          ) : (
            <Popover open={cortePickerOpen} onOpenChange={setCortePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  role="combobox"
                  className="w-full justify-between h-[30px] text-xs font-normal px-2"
                  data-testid="btn-select-corte-muestra"
                >
                  <span className="truncate">
                    {corteSeleccionado
                      ? `${corteSeleccionado.n_corte} · ${corteSeleccionado.modelo || '—'} (${corteSeleccionado.estado})`
                      : 'Seleccionar corte…'}
                  </span>
                  <ChevronsUpDown className="h-3 w-3 opacity-50 shrink-0 ml-1" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[420px] p-0" align="start">
                <Command
                  filter={(value, search) => {
                    if (!search) return 1;
                    return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
                  }}
                >
                  <CommandInput placeholder="Buscar por corte, modelo o estado…" />
                  <CommandList className="max-h-[280px]">
                    <CommandEmpty>Sin coincidencias</CommandEmpty>
                    <CommandGroup>
                      {cortes.map(c => {
                        const label = `${c.n_corte} · ${c.modelo || '—'} (${c.estado})`;
                        return (
                          <CommandItem
                            key={c.id}
                            value={label}
                            onSelect={() => { setRegistroId(c.id); setCortePickerOpen(false); }}
                            className="text-xs"
                          >
                            <Check className={`h-3 w-3 mr-2 ${registroId === c.id ? 'opacity-100' : 'opacity-0'}`} />
                            <div className="flex flex-col min-w-0">
                              <span className="font-medium truncate">
                                {c.n_corte} · {c.modelo || '—'}
                              </span>
                              <span className="text-[10px] text-muted-foreground">{c.estado}</span>
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          )}
        </div>
        <div className="col-span-3">
          <label className="text-[10px] text-muted-foreground font-medium">Fecha envío</label>
          <input
            type="date"
            value={fechaEnvio}
            onChange={e => setFechaEnvio(e.target.value)}
            className="w-full text-xs px-2 py-1.5 rounded border border-input bg-background"
          />
        </div>
        <div className="col-span-3">
          <label className="text-[10px] text-muted-foreground font-medium">Lavandería</label>
          <select
            value={lavanderiaId}
            onChange={e => setLavanderiaId(e.target.value)}
            className="w-full text-xs px-2 py-1.5 rounded border border-input bg-background"
            data-testid="select-lavanderia"
          >
            <option value="">Sin asignar</option>
            {lavanderias.map(l => (
              <option key={l.id} value={l.id}>{l.nombre}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex justify-end">
        <span className="text-[10px] text-muted-foreground">
          Total: <strong className="text-foreground font-mono">{totalCantidad}</strong> prendas
        </span>
      </div>

      <div className="rounded border overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted/60">
            <tr>
              <th className="text-left p-1.5 font-medium w-[160px]">Color</th>
              <th className="text-right p-1.5 font-medium w-[90px]">Cantidad</th>
              <th className="text-left p-1.5 font-medium">Observaciones</th>
              <th className="w-[40px]"></th>
            </tr>
          </thead>
          <tbody>
            {lineas.length === 0 && (
              <tr><td colSpan={4} className="p-2 text-center text-muted-foreground italic">Agrega colores ↓</td></tr>
            )}
            {lineas.map((l, idx) => (
              <tr key={idx} className="border-t">
                <td className="p-1.5 align-top">{formatColorName(l.color_nombre)}</td>
                <td className="p-1.5 align-top">
                  <input
                    type="number"
                    min={1}
                    value={l.cantidad}
                    onChange={e => setCantidad(idx, e.target.value)}
                    onFocus={e => e.target.select()}
                    className="w-full text-xs px-2 py-1 rounded border border-input bg-background text-right font-mono"
                  />
                </td>
                <td className="p-1.5 align-top">
                  <input
                    type="text"
                    value={l.observaciones_envio || ''}
                    onChange={e => setObservacion(idx, e.target.value)}
                    placeholder='ej: "más oscuro", "lavado 30 min"'
                    className="w-full text-xs px-2 py-1 rounded border border-input bg-background"
                  />
                </td>
                <td className="p-1.5 text-right align-top">
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => quitarLinea(idx)}>
                    <X className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Popover open={colorPickerOpen} onOpenChange={setColorPickerOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1">
            <Plus className="h-3 w-3" /> Agregar color
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2" align="start">
          <input
            type="text"
            placeholder="Buscar color..."
            value={colorSearch}
            onChange={e => setColorSearch(e.target.value)}
            className="w-full text-xs px-2 py-1 mb-2 rounded border border-input bg-background"
            autoFocus
          />
          <div className="max-h-[200px] overflow-auto flex flex-col gap-0.5">
            {coloresFiltrados.length === 0 && <p className="text-[11px] text-muted-foreground italic p-2">Sin resultados</p>}
            {coloresFiltrados.slice(0, 60).map(c => (
              <button
                key={c.id}
                onClick={() => agregarColor(c)}
                className="text-left text-[11px] px-2 py-1 rounded hover:bg-muted hover:text-primary transition-colors"
              >
                {formatColorName(c.nombre)}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <div>
        <label className="text-[10px] text-muted-foreground font-medium">Observaciones (opcional)</label>
        <textarea
          value={observaciones}
          onChange={e => setObservaciones(e.target.value)}
          placeholder='Ej: "Probar color en mezclilla denim premium"'
          className="w-full text-xs px-2 py-1.5 rounded border border-input bg-background min-h-[50px]"
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onCancel}>Cancelar</Button>
        <Button size="sm" className="h-7 text-xs" onClick={guardar} disabled={saving}>
          {saving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
          Crear muestra
        </Button>
      </div>
    </div>
  );
};
