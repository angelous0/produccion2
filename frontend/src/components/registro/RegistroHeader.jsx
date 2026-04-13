import React from 'react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import axios from 'axios';
import { toast } from 'sonner';
import { ArrowLeft, Save, AlertTriangle, Play, CheckCircle2, MessageCircle } from 'lucide-react';

// Mini-componente de stats de mensajes para el header
const HeaderMensajes = ({ registroId, API, onOpen, refreshKey }) => {
  const [stats, setStats] = React.useState(null);
  React.useEffect(() => {
    if (!registroId) return;
    axios.get(`${API}/registros/${registroId}/conversacion`).then(r => {
      const msgs = r.data || [];
      const total = msgs.length;
      const importantes = msgs.filter(m => m.estado === 'importante').length;
      const pendientes = msgs.filter(m => m.estado === 'pendiente').length;
      setStats({ total, importantes, pendientes });
    }).catch(() => setStats({ total: 0, importantes: 0, pendientes: 0 }));
  }, [registroId, refreshKey]);

  if (!stats) return null;

  const hasAlerts = stats.importantes > 0 || stats.pendientes > 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`registro-header-mensajes ${hasAlerts ? 'registro-header-mensajes-alert' : ''}`}
      title="Abrir mensajes"
    >
      <MessageCircle className="h-4 w-4" />
      {stats.total > 0 && <span className="registro-header-mensajes-count">{stats.total}</span>}
      {stats.importantes > 0 && <span className="registro-header-mensajes-imp">{stats.importantes} imp.</span>}
      {stats.pendientes > 0 && <span className="registro-header-mensajes-pend">{stats.pendientes} pend.</span>}
    </button>
  );
};

export const RegistroHeader = ({
  formData, setFormData, modeloSeleccionado, isEditing, isParalizado,
  estados, usaRuta, rutaNombre, analisisEstado,
  loading, id, navigate, API,
  autoGuardarEstado, setForzarEstadoDialog, setSugerenciaMovDialog,
  setRetrocesoDialog, setAdvertenciaCantidadDialog,
  handleSubmit, permisos, setConvOpen, convRefreshKey,
  cameFromRegistro,
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
        // Retroceso detectado — pedir confirmación y motivo
        if (data.es_retroceso) {
          setRetrocesoDialog({ nuevo_estado: value, estado_actual: data.estado_actual, advertencias: data.advertencias || [] });
          return;
        }
        if (!data.permitido) { setForzarEstadoDialog({ nuevo_estado: value, bloqueos: data.bloqueos }); return; }
        // Advertencias de cantidad (no bloquean pero informan)
        if (data.advertencias && data.advertencias.length > 0) {
          setAdvertenciaCantidadDialog({ advertencias: data.advertencias, nuevo_estado: value, sugerencia: data.sugerencia_movimiento });
          return;
        }
        await autoGuardarEstado(value);
        if (data.sugerencia_movimiento) setSugerenciaMovDialog(data.sugerencia_movimiento);
      } catch { await autoGuardarEstado(value); }
    } else { await autoGuardarEstado(value); }
  };

  const currentIdx = estados.indexOf(formData.estado);
  const progressPct = estados.length > 1 ? Math.round((currentIdx / (estados.length - 1)) * 100) : 0;

  return (
    <div
      className={`registro-header-card ${isParalizado ? 'registro-header-paralizado' : ''}`}
      data-testid="header-operativo"
    >
      {/* Fila 1: Navegación + Identidad + Guardar */}
      <div className="flex items-center gap-4">
        {cameFromRegistro ? (
          <Button variant="ghost" size="sm" className="registro-btn-back gap-1.5" onClick={() => navigate(-1)} data-testid="btn-volver">
            <ArrowLeft className="h-4 w-4" />
            <span className="text-xs">Corte {cameFromRegistro}</span>
          </Button>
        ) : (
          <Button variant="ghost" size="icon" className="registro-btn-back" onClick={() => navigate('/registros')} data-testid="btn-volver">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="registro-title">Corte {formData.n_corte || '—'}</h2>
            {modeloSeleccionado && (
              <span className="registro-subtitle">· {modeloSeleccionado.nombre}</span>
            )}
            {formData.urgente && (
              <Badge variant="destructive" className="registro-badge-urgente">URGENTE</Badge>
            )}
            {isParalizado && (
              <Badge className="bg-red-600 text-white registro-badge-urgente">PARALIZADO</Badge>
            )}
          </div>
          {!isEditing && <p className="registro-subtitle" style={{ marginTop: 2 }}>Crear un nuevo registro de producción</p>}
        </div>
        {isEditing && id && (
          <HeaderMensajes registroId={id} API={API} onOpen={() => setConvOpen?.(true)} refreshKey={convRefreshKey} />
        )}
        <Button
          type="button"
          size="sm"
          disabled={loading || isParalizado}
          onClick={async () => { await handleSubmit(null, true); }}
          className={`registro-btn-save-quick ${isParalizado ? 'opacity-50' : ''}`}
          data-testid="btn-guardar-rapido"
        >
          <Save className="h-4 w-4 mr-1.5" />
          {loading ? 'Guardando...' : 'Guardar'}
        </Button>
      </div>

      {/* Fila 2: Estado + Ruta (solo edición) */}
      {isEditing && (
        <div className="registro-estado-block" data-testid="estado-banner">
          {/* Controls row */}
          <div className="flex items-center gap-3 flex-wrap">
            <Select
              key={estados.length > 0 && formData.estado ? formData.estado : 'est-loading'}
              value={formData.estado}
              onValueChange={handleEstadoChange}
              disabled={isParalizado || !canChangeStates}
            >
              <SelectTrigger data-testid="select-estado" className={`registro-select-estado ${(isParalizado || !canChangeStates) ? 'opacity-50 cursor-not-allowed' : ''}`} disabled={isParalizado || !canChangeStates}>
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
              <span className="registro-ruta-label">Ruta: {rutaNombre}</span>
            )}
            {id && (
              <label className="registro-skip-label" title="Desactiva las validaciones de movimientos para cambiar de estado libremente">
                <input type="checkbox" checked={formData.skip_validacion_estado || false} onChange={async (ev) => {
                  const newVal = ev.target.checked;
                  if (newVal) {
                    const motivo = window.prompt('Motivo para desactivar restricciones:');
                    if (!motivo || !motivo.trim()) return;
                    setFormData(prev => ({ ...prev, skip_validacion_estado: newVal }));
                    try { await axios.put(`${API}/registros/${id}/skip-validacion`, { skip_validacion_estado: newVal, motivo: motivo.trim() }); toast.success('Validación desactivada'); }
                    catch { toast.error('Error'); setFormData(prev => ({ ...prev, skip_validacion_estado: !newVal })); }
                  } else {
                    setFormData(prev => ({ ...prev, skip_validacion_estado: newVal }));
                    try { await axios.put(`${API}/registros/${id}/skip-validacion`, { skip_validacion_estado: newVal }); toast.success('Validación activada'); }
                    catch { toast.error('Error'); setFormData(prev => ({ ...prev, skip_validacion_estado: !newVal })); }
                  }
                }} className="registro-checkbox" data-testid="toggle-skip-validacion" />
                <span className="registro-skip-text">Sin restricciones</span>
              </label>
            )}
          </div>

          {/* Ruta visual — pipeline */}
          {estados.length > 1 && (
            <div className="registro-pipeline">
              <div className="registro-pipeline-track">
                {estados.map((e, idx) => {
                  const isPast = idx < currentIdx;
                  const isCurrent = idx === currentIdx;
                  const allowed = canChangeStates && canChangeToState(e);
                  return (
                    <React.Fragment key={e}>
                      {idx > 0 && (
                        <div className={`registro-pipeline-connector ${isPast ? 'registro-pipeline-connector-done' : ''}`} />
                      )}
                      <div
                        className={`registro-etapa ${
                          isCurrent ? 'registro-etapa-actual' :
                          isPast ? 'registro-etapa-pasada' :
                          'registro-etapa-futura'
                        } ${allowed && !isCurrent ? 'registro-etapa-clickable' : ''} ${!allowed && !isCurrent ? 'registro-etapa-disabled' : ''}`}
                        onClick={() => allowed && handleEstadoChange(e)}
                        title={!allowed ? 'Sin permiso para este estado' : e}
                      >
                        {isPast && <CheckCircle2 className="registro-etapa-check" />}
                        {e}
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
              {/* Progress bar */}
              <div className="registro-progress-bar">
                <div className="registro-progress-fill" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Banner PARALIZADO */}
      {isEditing && isParalizado && (
        <div className="registro-paralizado-banner" data-testid="banner-paralizado">
          <div className="registro-paralizado-icon">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="registro-paralizado-title">Registro PARALIZADO</p>
            <p className="registro-paralizado-desc">No se puede cambiar de estado ni crear/editar movimientos hasta resolver la incidencia.</p>
          </div>
        </div>
      )}

      {/* Banner inconsistencias */}
      {analisisEstado && analisisEstado.inconsistencias && analisisEstado.inconsistencias.length > 0 && !formData.skip_validacion_estado && (
        <div className="registro-inconsistencias-banner" data-testid="inconsistencias-banner">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
            <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">Estado y movimientos no coinciden</span>
          </div>
          {analisisEstado.inconsistencias.map((inc, i) => (
            <p key={i} className={`text-xs ml-6 ${inc.severidad === 'error' ? 'text-red-600 font-medium' : 'text-amber-700 dark:text-amber-400'}`}>{inc.mensaje}</p>
          ))}
          {analisisEstado.estado_sugerido && analisisEstado.estado_sugerido !== formData.estado && (
            <div className="ml-6 mt-1">
              <Button type="button" variant="outline" size="sm" className="h-6 text-[11px] border-amber-400 text-amber-700 hover:bg-amber-100" onClick={async () => { await autoGuardarEstado(analisisEstado.estado_sugerido); }} data-testid="btn-aplicar-estado-sugerido">
                Aplicar: {analisisEstado.estado_sugerido}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
