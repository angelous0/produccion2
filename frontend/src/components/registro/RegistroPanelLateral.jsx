import React from 'react';
import axios from 'axios';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Separator } from '../ui/separator';
import { Save, MessageCircle, Scissors, ArrowRight, ChevronDown, MoreHorizontal } from 'lucide-react';
import { ConversacionPanel, ConversacionTrigger } from '../ConversacionPanel';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '../ui/dropdown-menu';

// Mini-componente para stats de conversación
const ConversacionStats = ({ registroId, API, refreshKey }) => {
  const [stats, setStats] = React.useState(null);
  React.useEffect(() => {
    if (!registroId) return;
    axios.get(`${API}/registros/${registroId}/conversacion`).then(r => {
      const msgs = r.data || [];
      const total = msgs.length;
      const importantes = msgs.filter(m => m.estado === 'importante').length;
      const pendientes = msgs.filter(m => m.estado === 'pendiente').length;
      const fijados = msgs.filter(m => m.fijado).length;
      setStats({ total, importantes, pendientes, fijados });
    }).catch(() => setStats({ total: 0, importantes: 0, pendientes: 0, fijados: 0 }));
  }, [registroId, refreshKey]);
  if (!stats) return <span className="text-xs text-muted-foreground">Cargando...</span>;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="registro-panel-conv-total">{stats.total} mensajes</span>
      {stats.importantes > 0 && <span className="registro-panel-conv-badge registro-panel-conv-imp">{stats.importantes} imp.</span>}
      {stats.pendientes > 0 && <span className="registro-panel-conv-badge registro-panel-conv-pend">{stats.pendientes} pend.</span>}
      {stats.fijados > 0 && <span className="registro-panel-conv-badge registro-panel-conv-fij">{stats.fijados} fijados</span>}
    </div>
  );
};

export const RegistroPanelLateral = ({
  formData, modeloSeleccionado, tallasSeleccionadas,
  lineasNegocio, isParalizado, isEditing,
  movimientosProduccion, incidencias,
  loading, navigate, onSubmit, onOpenDivision,
  id, API, convOpen, setConvOpen, user, permisos, convRefreshKey,
}) => {
  const incidenciasAbiertas = incidencias.filter(i => i.estado === 'ABIERTA').length;

  return (
    <div className="hidden lg:block">
      <div className="sticky top-4 space-y-3" data-testid="panel-derecho">

        {/* Card Modelo (arriba, más notorio) */}
        {modeloSeleccionado && (
          <div className="registro-panel-card registro-panel-card-modelo">
            <p className="registro-panel-modelo-name">{modeloSeleccionado.nombre}</p>
            <div className="registro-panel-modelo-grid">
              <span className="registro-panel-stat-label">Marca</span>
              <span className="registro-panel-modelo-val">{modeloSeleccionado.marca_nombre || '—'}</span>
              <span className="registro-panel-stat-label">Tipo</span>
              <span className="registro-panel-modelo-val">{modeloSeleccionado.tipo_nombre || '—'}</span>
              <span className="registro-panel-stat-label">Entalle</span>
              <span className="registro-panel-modelo-val">{modeloSeleccionado.entalle_nombre || '—'}</span>
              <span className="registro-panel-stat-label">Tela</span>
              <span className="registro-panel-modelo-val">{modeloSeleccionado.tela_nombre || '—'}</span>
              <span className="registro-panel-stat-label">Hilo</span>
              <span className="registro-panel-modelo-val">{modeloSeleccionado.hilo_nombre || '—'}</span>
              <span className="registro-panel-stat-label">Hilo Esp.</span>
              <span className="registro-panel-modelo-val">{modeloSeleccionado.hilo_especifico_nombre || '—'}</span>
              <span className="registro-panel-stat-label">Curva</span>
              <span className="registro-panel-modelo-val">{formData.curva || '—'}</span>
            </div>
          </div>
        )}
        {/* Card Modelo Manual */}
        {!modeloSeleccionado && formData.modelo_manual && (
          <div className="registro-panel-card registro-panel-card-modelo">
            <div className="flex items-center gap-2 mb-1">
              <p className="registro-panel-modelo-name">{formData.modelo_manual.nombre_modelo || 'Modelo Manual'}</p>
              <span className="inline-flex items-center rounded px-1 py-0.5 text-[9px] font-medium bg-gray-100 text-gray-500 border border-gray-200">Manual</span>
            </div>
            <div className="registro-panel-modelo-grid">
              <span className="registro-panel-stat-label">Marca</span>
              <span className="registro-panel-modelo-val">{formData.modelo_manual.marca_texto || '—'}</span>
              <span className="registro-panel-stat-label">Tipo</span>
              <span className="registro-panel-modelo-val">{formData.modelo_manual.tipo_texto || '—'}</span>
              <span className="registro-panel-stat-label">Entalle</span>
              <span className="registro-panel-modelo-val">{formData.modelo_manual.entalle_texto || '—'}</span>
              <span className="registro-panel-stat-label">Tela</span>
              <span className="registro-panel-modelo-val">{formData.modelo_manual.tela_texto || '—'}</span>
              <span className="registro-panel-stat-label">Hilo</span>
              <span className="registro-panel-modelo-val">{formData.modelo_manual.hilo_texto || formData.modelo_manual.hilo || '—'}</span>
              <span className="registro-panel-stat-label">Hilo Esp.</span>
              <span className="registro-panel-modelo-val">{formData.modelo_manual.hilo_especifico_texto || formData.modelo_manual.hilo_especifico || '—'}</span>
              <span className="registro-panel-stat-label">Curva</span>
              <span className="registro-panel-modelo-val">{formData.curva || '—'}</span>
            </div>
          </div>
        )}

        {/* Card Resumen del Lote */}
        <div className="registro-panel-card">
          <div className="registro-panel-card-header">
            <span className="registro-panel-section-label">Lote</span>
            <span className="registro-panel-lote-num">{formData.n_corte || '—'}</span>
          </div>

          <div className="registro-panel-divider" />

          <div className="registro-panel-stats">
            <div className="registro-panel-stat-row">
              <span className="registro-panel-stat-label">Prendas</span>
              {(() => {
                const cantOriginal = tallasSeleccionadas.reduce((sum, t) => sum + (t.cantidad || 0), 0);
                const ultimoMov = movimientosProduccion && movimientosProduccion.length > 0
                  ? movimientosProduccion[movimientosProduccion.length - 1] : null;
                const cantEfectiva = ultimoMov
                  ? (ultimoMov.cantidad_recibida ?? ultimoMov.cantidad ?? cantOriginal) : cantOriginal;
                const hayMerma = cantEfectiva < cantOriginal;
                return hayMerma ? (
                  <span className="registro-panel-prendas" data-testid="prendas-efectivas">
                    <span className="registro-panel-prendas-original">{cantOriginal}</span>
                    <span className="registro-panel-prendas-actual">{cantEfectiva}</span>
                  </span>
                ) : (
                  <span className="registro-panel-prendas-solo" data-testid="prendas-efectivas">{cantOriginal}</span>
                );
              })()}
            </div>
            {isEditing && (
              <>
                <div className="registro-panel-stat-row">
                  <span className="registro-panel-stat-label">Movimientos</span>
                  <span className="registro-panel-stat-value">{movimientosProduccion.length}</span>
                </div>
                <div className="registro-panel-stat-row">
                  <span className="registro-panel-stat-label">Incidencias</span>
                  <div className="flex items-center gap-1.5">
                    {incidenciasAbiertas > 0 && (
                      <span className="registro-panel-inc-badge">{incidenciasAbiertas} abiertas</span>
                    )}
                    <span className="registro-panel-stat-value">{incidencias.length}</span>
                  </div>
                </div>
              </>
            )}
            {formData.linea_negocio_id && (
              <div className="registro-panel-stat-row">
                <span className="registro-panel-stat-label">Línea</span>
                <span className="registro-panel-stat-value-text">{lineasNegocio.find(l => l.id === formData.linea_negocio_id)?.nombre || '—'}</span>
              </div>
            )}
          </div>
        </div>


        {/* Botones de acción */}
        <div className="sticky bottom-0 bg-background pt-2 pb-1 border-t mt-3 space-y-2">
          <Button type="submit" className="registro-panel-btn-save" disabled={loading || isParalizado} data-testid="btn-guardar-registro">
            <Save className="h-4 w-4 mr-2" />
            {loading ? 'Guardando...' : (isEditing ? 'Actualizar Registro' : 'Crear Registro')}
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" className="flex-1 text-muted-foreground text-xs" onClick={() => navigate('/registros')}>
              Cancelar
            </Button>
            {isEditing && permisos?.canAction?.('dividir_lotes') !== false && tallasSeleccionadas.some(t => t.cantidad > 0) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="px-2" data-testid="btn-mas-acciones">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={onOpenDivision} data-testid="btn-dividir-lote">
                    <Scissors className="h-3.5 w-3.5 mr-2" />
                    Dividir Lote
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
