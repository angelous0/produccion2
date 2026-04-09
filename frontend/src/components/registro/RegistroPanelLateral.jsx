import React from 'react';
import axios from 'axios';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Separator } from '../ui/separator';
import { Save, Scissors, ArrowRight, ChevronDown, MoreHorizontal } from 'lucide-react';
import { ConversacionPanel, ConversacionTrigger } from '../ConversacionPanel';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '../ui/dropdown-menu';

// Mini-componente para stats de conversación
const ConversacionStats = ({ registroId, API }) => {
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
  }, [registroId]);
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
  id, API, convOpen, setConvOpen, user, permisos,
}) => {
  const incidenciasAbiertas = incidencias.filter(i => i.estado === 'ABIERTA').length;

  return (
    <div className="hidden lg:block">
      <div className="sticky top-4 space-y-3" data-testid="panel-derecho">

        {/* Card Resumen del Lote */}
        <div className="registro-panel-card">
          <div className="registro-panel-card-header">
            <span className="registro-panel-section-label">Lote</span>
            <span className="registro-panel-lote-num">{formData.n_corte || '—'}</span>
          </div>

          <div className="registro-panel-divider" />

          <div className="registro-panel-stats">
            <div className="registro-panel-stat-row">
              <span className="registro-panel-stat-label">Estado</span>
              <Badge variant={isParalizado ? 'destructive' : 'outline'} className="registro-panel-stat-badge">
                {isParalizado ? 'PARALIZADO' : formData.estado}
              </Badge>
            </div>
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

        {/* Card Modelo */}
        {modeloSeleccionado && (
          <div className="registro-panel-card">
            <p className="registro-panel-section-label" style={{ marginBottom: 6 }}>Modelo</p>
            <p className="registro-panel-modelo-name">{modeloSeleccionado.nombre}</p>
            <div className="registro-panel-modelo-grid">
              <span className="registro-panel-stat-label">Marca</span>
              <span className="registro-panel-stat-value-text">{modeloSeleccionado.marca_nombre || '—'}</span>
              <span className="registro-panel-stat-label">Tipo</span>
              <span className="registro-panel-stat-value-text">{modeloSeleccionado.tipo_nombre || '—'}</span>
              <span className="registro-panel-stat-label">Entalle</span>
              <span className="registro-panel-stat-value-text">{modeloSeleccionado.entalle_nombre || '—'}</span>
              <span className="registro-panel-stat-label">Tela</span>
              <span className="registro-panel-stat-value-text">{modeloSeleccionado.tela_nombre || '—'}</span>
              <span className="registro-panel-stat-label">Hilo</span>
              <span className="registro-panel-stat-value-text">{modeloSeleccionado.hilo_nombre || '—'}</span>
            </div>
          </div>
        )}

        {/* Card Mensajes */}
        {isEditing && (
          <button
            type="button"
            onClick={() => setConvOpen(true)}
            className="registro-panel-card registro-panel-card-clickable"
            data-testid="btn-abrir-conversacion-panel"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="registro-panel-section-label">Mensajes</span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <ConversacionStats registroId={id} API={API} />
          </button>
        )}

        {/* Botones de acción */}
        <div className="space-y-2.5">
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
