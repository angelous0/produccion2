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
      <span className="text-sm font-semibold">{stats.total} mensajes</span>
      {stats.importantes > 0 && <span className="text-[10px] px-1.5 py-0 rounded-full bg-red-100 text-red-700 font-medium">{stats.importantes} imp.</span>}
      {stats.pendientes > 0 && <span className="text-[10px] px-1.5 py-0 rounded-full bg-amber-100 text-amber-700 font-medium">{stats.pendientes} pend.</span>}
      {stats.fijados > 0 && <span className="text-[10px] px-1.5 py-0 rounded-full bg-blue-100 text-blue-700 font-medium">{stats.fijados} fijados</span>}
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
  return (
    <div className="hidden lg:block">
      <div className="sticky top-4 space-y-3" data-testid="panel-derecho">

        {/* Resumen del Lote */}
        <div className="rounded-xl border bg-card p-4 space-y-2.5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Lote</span>
            <span className="font-mono font-bold text-xl leading-none">{formData.n_corte || '—'}</span>
          </div>
          <Separator />
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Estado</span>
              <Badge variant={isParalizado ? 'destructive' : 'outline'} className="text-xs font-medium">{isParalizado ? 'PARALIZADO' : formData.estado}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Prendas</span>
              {(() => {
                const cantOriginal = tallasSeleccionadas.reduce((sum, t) => sum + (t.cantidad || 0), 0);
                const ultimoMov = movimientosProduccion && movimientosProduccion.length > 0
                  ? movimientosProduccion[movimientosProduccion.length - 1] : null;
                const cantEfectiva = ultimoMov
                  ? (ultimoMov.cantidad_recibida ?? ultimoMov.cantidad ?? cantOriginal) : cantOriginal;
                const hayMerma = cantEfectiva < cantOriginal;
                return hayMerma ? (
                  <span className="font-mono text-base" data-testid="prendas-efectivas">
                    <span className="line-through text-muted-foreground text-sm mr-1.5">{cantOriginal}</span>
                    <span className="font-bold text-amber-600">{cantEfectiva}</span>
                  </span>
                ) : (
                  <span className="font-mono font-bold text-base" data-testid="prendas-efectivas">{cantOriginal}</span>
                );
              })()}
            </div>
            {formData.linea_negocio_id && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Línea</span>
                <span className="text-xs font-medium truncate max-w-[160px] text-right">{lineasNegocio.find(l => l.id === formData.linea_negocio_id)?.nombre || '—'}</span>
              </div>
            )}
            {isEditing && (
              <>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Movimientos</span>
                  <span className="text-xs font-semibold">{movimientosProduccion.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Incidencias</span>
                  <div className="flex items-center gap-1.5">
                    {incidencias.filter(i => i.estado === 'ABIERTA').length > 0 && (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">{incidencias.filter(i => i.estado === 'ABIERTA').length} abiertas</Badge>
                    )}
                    <span className="text-xs font-semibold">{incidencias.length}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Acciones */}
        <div className="space-y-2">
          <Button type="submit" className="w-full h-9" disabled={loading} data-testid="btn-guardar-registro">
            <Save className="h-4 w-4 mr-2" />
            {loading ? 'Guardando...' : (isEditing ? 'Actualizar Registro' : 'Crear Registro')}
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" className="flex-1 text-muted-foreground" onClick={() => navigate('/registros')}>
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

        {/* Datos del Modelo */}
        {modeloSeleccionado && (
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-0.5">Modelo</p>
            <p className="font-semibold text-sm leading-snug">{modeloSeleccionado.nombre}</p>
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 mt-2 text-xs">
              <span className="text-muted-foreground">Marca</span>
              <span className="font-medium">{modeloSeleccionado.marca_nombre || '-'}</span>
              <span className="text-muted-foreground">Tipo</span>
              <span className="font-medium">{modeloSeleccionado.tipo_nombre || '-'}</span>
              <span className="text-muted-foreground">Entalle</span>
              <span className="font-medium">{modeloSeleccionado.entalle_nombre || '-'}</span>
              <span className="text-muted-foreground">Tela</span>
              <span className="font-medium">{modeloSeleccionado.tela_nombre || '-'}</span>
              <span className="text-muted-foreground">Hilo</span>
              <span className="font-medium">{modeloSeleccionado.hilo_nombre || '-'}</span>
              <span className="text-muted-foreground">Hilo Específico</span>
              <span className="font-medium">{modeloSeleccionado.hilo_especifico_nombre || '-'}</span>
            </div>
          </div>
        )}

        {/* Conversación integrada */}
        {isEditing && (
          <button
            type="button"
            onClick={() => setConvOpen(true)}
            className="w-full rounded-lg border bg-card p-3 hover:bg-accent/50 transition-colors text-left group"
            data-testid="btn-abrir-conversacion-panel"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Conversación</span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <ConversacionStats registroId={id} API={API} />
          </button>
        )}
      </div>
    </div>
  );
};
