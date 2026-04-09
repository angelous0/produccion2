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
      {stats.importantes > 0 && <span className="text-[10px] px-1.5 py-0 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 font-medium">{stats.importantes} imp.</span>}
      {stats.pendientes > 0 && <span className="text-[10px] px-1.5 py-0 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 font-medium">{stats.pendientes} pend.</span>}
      {stats.fijados > 0 && <span className="text-[10px] px-1.5 py-0 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 font-medium">{stats.fijados} fijados</span>}
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
        <div className="rounded-xl border bg-card p-4 space-y-2.5 shadow-sm hover:shadow transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Lote</span>
            <span className="registro-panel-lote-num">{formData.n_corte || '—'}</span>
          </div>
          <Separator />
          <div className="divide-y divide-border space-y-0">
            <div className="flex items-center justify-between py-1.5">
              <span className="text-xs text-muted-foreground">Estado</span>
              <Badge variant={isParalizado ? 'destructive' : 'outline'} className="text-xs font-medium">
                {isParalizado ? 'PARALIZADO' : formData.estado}
              </Badge>
            </div>
            <div className="flex items-center justify-between py-1.5">
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
            {isEditing && (
              <>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-xs text-muted-foreground">Movimientos</span>
                  <span className="text-xs font-semibold font-mono">{movimientosProduccion.length}</span>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-xs text-muted-foreground">Incidencias</span>
                  <div className="flex items-center gap-1.5">
                    {incidenciasAbiertas > 0 && (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">{incidenciasAbiertas} abiertas</Badge>
                    )}
                    <span className="text-xs font-semibold font-mono">{incidencias.length}</span>
                  </div>
                </div>
              </>
            )}
            {formData.linea_negocio_id && (
              <div className="flex items-center justify-between py-1.5">
                <span className="text-xs text-muted-foreground">Línea</span>
                <span className="text-xs font-medium truncate max-w-[140px] text-right">{lineasNegocio.find(l => l.id === formData.linea_negocio_id)?.nombre || '—'}</span>
              </div>
            )}
          </div>
        </div>

        {/* Card Modelo */}
        {modeloSeleccionado && (
          <div className="rounded-xl border bg-card p-3 shadow-sm hover:shadow transition-shadow">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1">Modelo</p>
            <p className="font-semibold text-sm leading-snug mb-2">{modeloSeleccionado.nombre}</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <span className="text-muted-foreground">Marca</span>
              <span className="font-medium">{modeloSeleccionado.marca_nombre || '—'}</span>
              <span className="text-muted-foreground">Tipo</span>
              <span className="font-medium">{modeloSeleccionado.tipo_nombre || '—'}</span>
              <span className="text-muted-foreground">Entalle</span>
              <span className="font-medium">{modeloSeleccionado.entalle_nombre || '—'}</span>
              <span className="text-muted-foreground">Tela</span>
              <span className="font-medium">{modeloSeleccionado.tela_nombre || '—'}</span>
              <span className="text-muted-foreground">Hilo</span>
              <span className="font-medium">{modeloSeleccionado.hilo_nombre || '—'}</span>
            </div>
          </div>
        )}

        {/* Card Mensajes */}
        {isEditing && (
          <button
            type="button"
            onClick={() => setConvOpen(true)}
            className="w-full rounded-xl border bg-card p-3 hover:bg-accent/50 transition-colors text-left group shadow-sm"
            data-testid="btn-abrir-conversacion-panel"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Mensajes</span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <ConversacionStats registroId={id} API={API} />
          </button>
        )}

        {/* Botones de acción */}
        <div className="space-y-2">
          <Button type="submit" className="w-full h-10 shadow-sm" disabled={loading || isParalizado} data-testid="btn-guardar-registro">
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
      </div>
    </div>
  );
};
