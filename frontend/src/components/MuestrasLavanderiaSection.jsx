import { Fragment, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import {
  ChevronRight, ChevronDown, Plus, Check, X, Loader2, FlaskConical,
  CheckCircle2, XCircle, AlertCircle, Send, Trash2,
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
      <td className="p-1.5 text-center font-mono">{muestra.cantidad_total}</td>
      <td className="p-1.5 text-center text-[10px]">{formatFecha(muestra.fecha_envio)}</td>
      <td className="p-1.5 text-center text-[10px]">
        {muestra.fecha_retorno
          ? formatFecha(muestra.fecha_retorno)
          : (
            <Button
              variant="outline"
              size="sm"
              className="h-5 text-[9px] px-1.5"
              onClick={marcarRetorno}
              disabled={savingRetorno}
            >
              {savingRetorno ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Devolver'}
            </Button>
          )
        }
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

const DetalleColores = ({ muestra, onChanged }) => {
  return (
    <div className="rounded border bg-background overflow-hidden">
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
          <select
            value={registroId}
            onChange={e => setRegistroId(e.target.value)}
            className="w-full text-xs px-2 py-1.5 rounded border border-input bg-background"
          >
            {cortes.length === 0 && <option value="">Sin cortes disponibles</option>}
            {cortes.map(c => (
              <option key={c.id} value={c.id}>
                {c.n_corte} · {c.modelo || '—'} ({c.estado})
              </option>
            ))}
          </select>
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
        <div className="col-span-3 flex items-end">
          <span className="text-[10px] text-muted-foreground">
            Total: <strong className="text-foreground font-mono">{totalCantidad}</strong> prendas
          </span>
        </div>
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
