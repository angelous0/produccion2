import React from 'react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import axios from 'axios';
import { toast } from 'sonner';
import { ArrowLeft, Save, AlertTriangle, Play } from 'lucide-react';

export const RegistroHeader = ({
  formData, setFormData, modeloSeleccionado, isEditing, isParalizado,
  estados, usaRuta, rutaNombre, analisisEstado,
  loading, id, navigate, API,
  autoGuardarEstado, setForzarEstadoDialog, setSugerenciaMovDialog,
  handleSubmit, permisos,
}) => {

  const canChangeStates = permisos?.canAction?.('cambiar_estados') !== false;
  const canChangeToState = (estado) => permisos?.canChangeToState?.(estado) !== false;

  const handleEstadoChange = async (value) => {
    if (!canChangeStates || !canChangeToState(value)) {
      toast.error('No tienes permiso para cambiar a este estado');
      return;
    }
    if (usaRuta && id) {
      try {
        const resp = await axios.post(`${API}/registros/${id}/validar-cambio-estado`, { nuevo_estado: value });
        const data = resp.data;
        if (!data.permitido) { setForzarEstadoDialog({ nuevo_estado: value, bloqueos: data.bloqueos }); return; }
        await autoGuardarEstado(value);
        if (data.sugerencia_movimiento) setSugerenciaMovDialog(data.sugerencia_movimiento);
      } catch { await autoGuardarEstado(value); }
    } else { await autoGuardarEstado(value); }
  };

  const currentIdx = estados.indexOf(formData.estado);
  const progressPct = estados.length > 1 ? Math.round((currentIdx / (estados.length - 1)) * 100) : 0;

  return (
    <div
      className={`rounded-xl border bg-card shadow-sm p-4 space-y-3 ${isParalizado ? 'border-destructive bg-destructive/5' : ''}`}
      data-testid="header-operativo"
    >
      {/* Fila 1: Navegación + Identidad + Guardar */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate('/registros')} data-testid="btn-volver">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-2xl font-semibold tracking-tight">Corte {formData.n_corte || '—'}</h2>
            {modeloSeleccionado && (
              <span className="text-sm text-muted-foreground">· {modeloSeleccionado.nombre}</span>
            )}
            {formData.urgente && (
              <Badge variant="destructive" className="text-xs px-2.5 py-0.5 font-bold">URGENTE</Badge>
            )}
            {isParalizado && (
              <Badge className="bg-red-600 text-xs px-2.5 py-0.5 font-bold">PARALIZADO</Badge>
            )}
          </div>
          {!isEditing && <p className="text-sm text-muted-foreground">Crear un nuevo registro de producción</p>}
        </div>
        <Button
          type="button"
          size="sm"
          disabled={loading || isParalizado}
          onClick={async () => { await handleSubmit(null, true); }}
          className={isParalizado ? 'opacity-50' : ''}
          data-testid="btn-guardar-rapido"
        >
          <Save className="h-4 w-4 mr-1" />
          {loading ? 'Guardando...' : 'Guardar'}
        </Button>
      </div>

      {/* Fila 2: Estado + Ruta (solo edición) */}
      {isEditing && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-3" data-testid="estado-banner">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Play className="h-4 w-4 text-primary shrink-0" />
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Estado</span>
            </div>
            <Select
              key={estados.length > 0 && formData.estado ? formData.estado : 'est-loading'}
              value={formData.estado}
              onValueChange={handleEstadoChange}
              disabled={isParalizado || !canChangeStates}
            >
              <SelectTrigger data-testid="select-estado" className={`w-full sm:w-[220px] h-9 text-sm font-semibold ${(isParalizado || !canChangeStates) ? 'opacity-50 cursor-not-allowed' : ''}`} disabled={isParalizado || !canChangeStates}>
                <SelectValue placeholder="Seleccionar estado" />
              </SelectTrigger>
              <SelectContent>
                {estados.map((e, idx) => {
                  const allowed = canChangeToState(e);
                  return (
                    <SelectItem key={e} value={e} disabled={!allowed}>
                      <span className={`flex items-center gap-2 ${!allowed ? 'opacity-40' : ''}`}>
                        <span className="text-xs text-muted-foreground font-mono w-5">{idx + 1}.</span>
                        {e}
                        {!allowed && <span className="text-[9px] text-red-400 ml-1">sin permiso</span>}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {usaRuta && rutaNombre && (
              <span className="text-xs text-muted-foreground">Ruta: {rutaNombre}</span>
            )}
            {id && (
              <label className="flex items-center gap-1.5 cursor-pointer select-none ml-auto" title="Desactiva las validaciones de movimientos para cambiar de estado libremente">
                <input type="checkbox" checked={formData.skip_validacion_estado || false} onChange={async (ev) => {
                  const newVal = ev.target.checked;
                  setFormData(prev => ({ ...prev, skip_validacion_estado: newVal }));
                  try { await axios.put(`${API}/registros/${id}/skip-validacion`, { skip_validacion_estado: newVal }); toast.success(newVal ? 'Validacion desactivada' : 'Validacion activada'); }
                  catch { toast.error('Error'); setFormData(prev => ({ ...prev, skip_validacion_estado: !newVal })); }
                }} className="rounded border-gray-300" data-testid="toggle-skip-validacion" />
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">Sin restricciones</span>
              </label>
            )}
          </div>

          {/* Ruta visual */}
          {estados.length > 1 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
                {estados.map((e, idx) => {
                  const isPast = idx < currentIdx;
                  const isCurrent = idx === currentIdx;
                  const allowed = canChangeStates && canChangeToState(e);
                  return (
                    <div key={e} className="flex items-center gap-1 shrink-0">
                      {idx > 0 && <div className={`w-3 h-px ${isPast ? 'bg-green-400' : 'bg-gray-200 dark:bg-gray-700'}`} />}
                      <div className={`${
                        isCurrent ? 'registro-etapa-actual' :
                        isPast ? 'registro-etapa-pasada' :
                        'registro-etapa-futura'
                      } ${allowed && !isCurrent ? 'cursor-pointer hover:ring-1 hover:ring-primary/50' : ''} ${!allowed && !isCurrent ? 'opacity-40 cursor-not-allowed' : ''}`}
                        onClick={() => allowed && handleEstadoChange(e)}
                        title={!allowed ? 'Sin permiso para este estado' : e}
                      >{e}</div>
                    </div>
                  );
                })}
              </div>
              {/* Barra de progreso lineal */}
              <div className="h-0.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gray-900 dark:bg-white rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Banner PARALIZADO */}
      {isEditing && isParalizado && (
        <div className="rounded-lg border-2 border-red-500 bg-red-50 dark:bg-red-950/30 p-4 flex items-center gap-4" data-testid="banner-paralizado">
          <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-6 w-6 text-red-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-red-800 dark:text-red-300 text-base">Registro PARALIZADO</p>
            <p className="text-sm text-red-600 dark:text-red-400">No se puede cambiar de estado ni crear/editar movimientos hasta resolver la incidencia.</p>
          </div>
        </div>
      )}

      {/* Banner inconsistencias */}
      {analisisEstado && analisisEstado.inconsistencias && analisisEstado.inconsistencias.length > 0 && !formData.skip_validacion_estado && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700 p-2.5 space-y-1" data-testid="inconsistencias-banner">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
            <span className="text-xs font-medium text-amber-800 dark:text-amber-300">Estado y movimientos no coinciden</span>
          </div>
          {analisisEstado.inconsistencias.map((inc, i) => (
            <p key={i} className={`text-[11px] ml-5 ${inc.severidad === 'error' ? 'text-red-600 font-medium' : 'text-amber-700 dark:text-amber-400'}`}>{inc.mensaje}</p>
          ))}
          {analisisEstado.estado_sugerido && analisisEstado.estado_sugerido !== formData.estado && (
            <div className="ml-5 mt-0.5">
              <Button type="button" variant="outline" size="sm" className="h-5 text-[10px] border-amber-400 text-amber-700 hover:bg-amber-100" onClick={async () => { await autoGuardarEstado(analisisEstado.estado_sugerido); }} data-testid="btn-aplicar-estado-sugerido">
                Aplicar: {analisisEstado.estado_sugerido}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
