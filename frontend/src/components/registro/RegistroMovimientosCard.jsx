import React from 'react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Plus, Play, Cog, Users, Calendar, Pencil, FileText, Trash2, MoreHorizontal, Copy } from 'lucide-react';

export const RegistroMovimientosCard = ({
  movimientosProduccion, serviciosProduccion, isParalizado,
  onOpenDialog, onDelete, onGenerarGuia, totalCantidad, permisos,
  onCopiarDesdeRegistro,
}) => {
  const showAvance = serviciosProduccion.some(s => s.usa_avance_porcentaje && movimientosProduccion.some(m => m.servicio_id === s.id));
  const canCreate = permisos?.canAction?.('crear_movimientos') !== false;
  const canEditMov = permisos?.canAction?.('editar_movimientos') !== false;
  const canCheckService = (servicioId) => permisos?.canService?.(servicioId) !== false;

  // "Activo" = movimiento más reciente/actual por FECHAS REALES del servicio,
  // no por orden de inserción en BD. Prioridad:
  //  1. Movimiento en progreso (fecha_inicio sin fecha_fin)
  //  2. El más reciente por fecha_fin
  //  3. El más reciente por fecha_inicio
  //  4. Si ninguna fecha, el primero del arreglo (backend retorna DESC por created_at)
  const activeIdx = (() => {
    if (movimientosProduccion.length === 0) return -1;
    const inProgress = movimientosProduccion.findIndex(m => m.fecha_inicio && !m.fecha_fin);
    if (inProgress !== -1) return inProgress;
    let bestIdx = 0;
    let bestDate = '';
    movimientosProduccion.forEach((m, idx) => {
      const d = m.fecha_fin || m.fecha_inicio || '';
      if (d && d > bestDate) { bestDate = d; bestIdx = idx; }
    });
    return bestIdx;
  })();
  const cantidadEfectiva = activeIdx >= 0
    ? (movimientosProduccion[activeIdx].cantidad_recibida ?? movimientosProduccion[activeIdx].cantidad ?? '—')
    : '—';

  return (
    <div className="registro-movimientos-card">
      <div className="registro-movimientos-header">
        <div className="flex items-center gap-2.5">
          <div className="registro-movimientos-icon-wrap">
            <Play className="h-4 w-4" />
          </div>
          <span className="registro-movimientos-title">Movimientos de Producción</span>
        </div>
        <div className="flex items-center gap-1.5">
          {canCreate && onCopiarDesdeRegistro && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onCopiarDesdeRegistro}
              disabled={isParalizado}
              className="text-xs"
              data-testid="btn-copiar-movimientos"
            >
              <Copy className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">Copiar desde otro</span>
            </Button>
          )}
          {canCreate && (
            <Button
              type="button"
              size="sm"
              onClick={() => onOpenDialog()}
              disabled={isParalizado}
              className={`registro-btn-nuevo-mov ${isParalizado ? 'opacity-50 cursor-not-allowed' : ''}`}
              data-testid="btn-nuevo-movimiento"
            >
              <Plus className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Agregar</span>
            </Button>
          )}
        </div>
      </div>

      <div className="registro-movimientos-body">
        {movimientosProduccion.length > 0 ? (
          <>
            {/* Vista mobile: Cards */}
            <div className="sm:hidden space-y-2">
              {movimientosProduccion.map((mov, idx) => {
                const enviada = mov.cantidad_enviada || mov.cantidad || 0;
                const recibida = mov.cantidad_recibida || mov.cantidad || 0;
                const diferencia = enviada - recibida;
                const isLast = idx === activeIdx;
                return (
                  <div key={mov.id} className={`registro-mov-mobile-card ${isLast ? 'registro-mov-activo' : ''} ${diferencia > 0 && !isLast ? 'registro-mov-merma' : ''}`} data-testid={`movimiento-card-${mov.id}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium text-sm truncate">{mov.servicio_nombre}</span>
                        {isLast && <span className="registro-mov-badge-activo">activo</span>}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" data-testid={`acciones-movimiento-m-${mov.id}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canEditMov && canCheckService(mov.servicio_id) && (
                            <DropdownMenuItem onClick={() => onOpenDialog(mov)} disabled={isParalizado}>
                              <Pencil className="h-3.5 w-3.5 mr-2" /> Editar
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => onGenerarGuia(mov.id)}>
                            <FileText className="h-3.5 w-3.5 mr-2 text-blue-500" /> Generar Guia
                          </DropdownMenuItem>
                          {canEditMov && canCheckService(mov.servicio_id) && (
                            <DropdownMenuItem onClick={() => onDelete(mov.id)} disabled={isParalizado} className="text-destructive">
                              <Trash2 className="h-3.5 w-3.5 mr-2" /> Eliminar
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="flex items-center gap-4 mt-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="registro-mov-label">Env</span>
                        <span className="font-mono font-medium text-sm">{enviada}</span>
                      </div>
                      <span className="text-muted-foreground text-xs">→</span>
                      <div className="flex items-center gap-1.5">
                        <span className="registro-mov-label">Rec</span>
                        <span className="font-mono font-bold text-sm">{recibida}</span>
                      </div>
                      {diferencia > 0 && (
                        <span className="registro-mov-merma-badge">-{diferencia}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-2 registro-mov-meta">
                      {mov.persona_nombre && <span>{mov.persona_nombre}</span>}
                      {mov.fecha_inicio && (
                        <span className="font-mono">{mov.fecha_inicio.split('-').reverse().join('/')}</span>
                      )}
                    </div>
                  </div>
                );
              })}
              {/* Footer mobile */}
              <div className="registro-mov-footer-mobile">
                <span>Cantidad efectiva</span>
                <span className="registro-mov-footer-value">{cantidadEfectiva}</span>
              </div>
            </div>

            {/* Vista desktop: Tabla */}
            <div className="registro-mov-table-wrap hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow className="registro-mov-thead">
                    <TableHead className="registro-mov-th">Servicio / Persona</TableHead>
                    <TableHead className="registro-mov-th text-center">F. Inicio</TableHead>
                    <TableHead className="registro-mov-th text-right">Enviada</TableHead>
                    <TableHead className="registro-mov-th text-right">Recibida</TableHead>
                    <TableHead className="registro-mov-th text-right">Merma</TableHead>
                    {showAvance && <TableHead className="registro-mov-th text-center hidden md:table-cell">Avance</TableHead>}
                    <TableHead className="registro-mov-th w-[50px] text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movimientosProduccion.map((mov, idx) => {
                    const enviada = mov.cantidad_enviada || mov.cantidad || 0;
                    const recibida = mov.cantidad_recibida || mov.cantidad || 0;
                    const diferencia = enviada - recibida;
                    const isLast = idx === activeIdx;
                    return (
                      <TableRow
                        key={mov.id}
                        className={isLast ? 'registro-mov-activo' : 'registro-mov-row'}
                        data-testid={`movimiento-row-${mov.id}`}
                      >
                        <TableCell>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{mov.servicio_nombre}</span>
                              {isLast && <span className="registro-mov-badge-activo">activo</span>}
                            </div>
                            {mov.persona_nombre && (
                              <span className="registro-mov-meta">{mov.persona_nombre}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {mov.fecha_inicio ? (
                            <span className="text-xs font-mono">{mov.fecha_inicio.split('-').reverse().join('/')}</span>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{enviada}</TableCell>
                        <TableCell className="text-right font-mono font-semibold text-sm">{recibida}</TableCell>
                        <TableCell className="text-right">
                          {diferencia > 0 ? (
                            <span className="registro-mov-merma-badge">-{diferencia}</span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        {showAvance && (
                          <TableCell className="text-center hidden md:table-cell">
                            {serviciosProduccion.find(s => s.id === mov.servicio_id)?.usa_avance_porcentaje && mov.avance_porcentaje != null ? (
                              <div className="flex items-center justify-center gap-1.5">
                                <div className="registro-mov-avance-track">
                                  <div
                                    className={`registro-mov-avance-fill ${mov.avance_porcentaje >= 100 ? 'bg-green-500' : mov.avance_porcentaje >= 50 ? 'bg-blue-500' : 'bg-amber-500'}`}
                                    style={{ width: `${Math.min(100, mov.avance_porcentaje)}%` }}
                                  />
                                </div>
                                <span className="text-xs font-mono font-medium">{mov.avance_porcentaje}%</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                        )}
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" data-testid={`acciones-movimiento-${mov.id}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {canEditMov && canCheckService(mov.servicio_id) && (
                                <DropdownMenuItem onClick={() => onOpenDialog(mov)} disabled={isParalizado} data-testid={`edit-movimiento-${mov.id}`}>
                                  <Pencil className="h-3.5 w-3.5 mr-2" />
                                  Editar
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => onGenerarGuia(mov.id)} data-testid={`guia-movimiento-${mov.id}`}>
                                <FileText className="h-3.5 w-3.5 mr-2 text-blue-500" />
                                Generar Guia
                              </DropdownMenuItem>
                              {canEditMov && canCheckService(mov.servicio_id) && (
                                <DropdownMenuItem onClick={() => onDelete(mov.id)} disabled={isParalizado} className="text-destructive" data-testid={`delete-movimiento-${mov.id}`}>
                                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                                  Eliminar
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {/* Footer row */}
                  <TableRow className="registro-mov-footer-row">
                    <TableCell colSpan={2} className="registro-mov-footer-label">Cantidad efectiva</TableCell>
                    <TableCell className="text-right font-mono text-xs text-gray-400">
                      {movimientosProduccion.length > 0 ? movimientosProduccion[0].cantidad_enviada : '—'}
                    </TableCell>
                    <TableCell className="text-right registro-mov-footer-value" colSpan={showAvance ? 3 : 2}>
                      {cantidadEfectiva}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            <p className="registro-mov-count">
              {movimientosProduccion.length} movimiento{movimientosProduccion.length !== 1 ? 's' : ''} registrado{movimientosProduccion.length !== 1 ? 's' : ''}
            </p>
          </>
        ) : (
          <div className="registro-mov-empty">
            <Play className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p className="font-medium text-sm">No hay movimientos de producción</p>
            <p className="text-xs mt-1 opacity-70">Registra los servicios realizados</p>
          </div>
        )}
      </div>
    </div>
  );
};
