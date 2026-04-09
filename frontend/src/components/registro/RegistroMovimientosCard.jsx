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
import { Plus, Play, Cog, Users, Calendar, Pencil, FileText, Trash2, MoreHorizontal } from 'lucide-react';

export const RegistroMovimientosCard = ({
  movimientosProduccion, serviciosProduccion, isParalizado,
  onOpenDialog, onDelete, onGenerarGuia, totalCantidad, permisos,
}) => {
  const showAvance = serviciosProduccion.some(s => s.usa_avance_porcentaje && movimientosProduccion.some(m => m.servicio_id === s.id));
  const canCreate = permisos?.canAction?.('crear_movimientos') !== false;
  const canEditMov = permisos?.canAction?.('editar_movimientos') !== false;
  const canCheckService = (servicioId) => permisos?.canService?.(servicioId) !== false;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          <Play className="h-5 w-5" />
          <span className="hidden sm:inline">Movimientos de Produccion</span>
          <span className="sm:hidden">Movimientos</span>
        </CardTitle>
        {canCreate && (
          <Button
            type="button"
            size="sm"
            onClick={() => onOpenDialog()}
            disabled={isParalizado}
            className={isParalizado ? 'opacity-50 cursor-not-allowed' : ''}
            data-testid="btn-nuevo-movimiento"
          >
            <Plus className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Agregar Movimiento</span>
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {movimientosProduccion.length > 0 ? (
          <>
            {/* Vista mobile: Cards */}
            <div className="sm:hidden space-y-2">
              {movimientosProduccion.map((mov) => {
                const enviada = mov.cantidad_enviada || mov.cantidad || 0;
                const recibida = mov.cantidad_recibida || mov.cantidad || 0;
                const diferencia = enviada - recibida;
                return (
                  <div key={mov.id} className={`rounded-lg border p-3 ${diferencia > 0 ? 'border-l-4 border-l-amber-400' : ''}`} data-testid={`movimiento-card-${mov.id}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <Cog className="h-4 w-4 text-blue-500 shrink-0" />
                        <span className="font-medium text-sm truncate">{mov.servicio_nombre}</span>
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
                    <div className="flex items-center gap-3 mt-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">Env</span>
                        <span className="font-mono font-medium text-sm">{enviada}</span>
                      </div>
                      <span className="text-muted-foreground">→</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">Rec</span>
                        <span className="font-mono font-bold text-sm">{recibida}</span>
                      </div>
                      {diferencia > 0 && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">-{diferencia}</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      {mov.persona_nombre && <span>{mov.persona_nombre}</span>}
                      {mov.fecha_inicio && (
                        <span className="font-mono">{mov.fecha_inicio.split('-').reverse().join('/')}</span>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
                <span className="text-xs text-muted-foreground font-medium">Cantidad efectiva</span>
                <span className="font-mono font-bold text-primary">
                  {movimientosProduccion.length > 0
                    ? (movimientosProduccion[movimientosProduccion.length - 1].cantidad_recibida
                      ?? movimientosProduccion[movimientosProduccion.length - 1].cantidad ?? '-')
                    : '-'}
                </span>
              </div>
            </div>

            {/* Vista desktop: Tabla */}
            <div className="border rounded-lg overflow-x-auto hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Servicio</TableHead>
                    <TableHead>Persona</TableHead>
                    <TableHead className="text-center hidden md:table-cell">F. Esperada</TableHead>
                    <TableHead className="text-center">Fechas</TableHead>
                    <TableHead className="text-right">Enviada</TableHead>
                    <TableHead className="text-right">Recibida</TableHead>
                    <TableHead className="text-right">Merma</TableHead>
                    {showAvance && <TableHead className="text-center hidden md:table-cell">Avance</TableHead>}
                    <TableHead className="w-[50px] text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movimientosProduccion.map((mov) => {
                    const enviada = mov.cantidad_enviada || mov.cantidad || 0;
                    const recibida = mov.cantidad_recibida || mov.cantidad || 0;
                    const diferencia = enviada - recibida;
                    let fechaAlerta = '';
                    let fechaClase = '';
                    if (mov.fecha_esperada_movimiento) {
                      const hoy = new Date(); hoy.setHours(0,0,0,0);
                      const esp = new Date(mov.fecha_esperada_movimiento + 'T00:00:00');
                      const diff = Math.ceil((esp - hoy) / (1000*60*60*24));
                      if (diff < 0) { fechaAlerta = 'Vencido'; fechaClase = 'text-red-600 font-semibold'; }
                      else if (diff <= 3) { fechaAlerta = `${diff}d`; fechaClase = 'text-amber-600 font-semibold'; }
                    }
                    return (
                      <TableRow key={mov.id} className={fechaAlerta === 'Vencido' ? 'bg-red-50 dark:bg-red-950/10' : ''} data-testid={`movimiento-row-${mov.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Cog className="h-4 w-4 text-blue-500" />
                            <span className="font-medium">{mov.servicio_nombre}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <span>{mov.persona_nombre}</span>
                              <div className="flex items-center gap-1 mt-0.5">
                                <Badge variant={mov.persona_tipo === 'INTERNO' ? 'default' : 'outline'} className={`text-[10px] px-1 py-0 ${mov.persona_tipo === 'INTERNO' ? 'bg-blue-600' : ''}`} data-testid={`persona-tipo-badge-${mov.id}`}>
                                  {mov.persona_tipo === 'INTERNO' ? 'Interno' : 'Externo'}
                                </Badge>
                                {mov.unidad_interna_nombre && (
                                  <span className="text-[10px] text-muted-foreground" data-testid={`unidad-interna-label-${mov.id}`}>{mov.unidad_interna_nombre}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center hidden md:table-cell">
                          {mov.fecha_esperada_movimiento ? (
                            <div className={`text-xs font-mono ${fechaClase}`}>
                              {mov.fecha_esperada_movimiento.split('-').reverse().join('/')}
                              {fechaAlerta && <span className="ml-1 text-[10px]">({fechaAlerta})</span>}
                            </div>
                          ) : <span className="text-muted-foreground text-xs">-</span>}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="text-xs">
                            {mov.fecha_inicio && (
                              <div className="flex items-center justify-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {mov.fecha_inicio.split('-').reverse().join('/')}
                              </div>
                            )}
                            {mov.fecha_fin && (
                              <div className="text-muted-foreground">
                                → {mov.fecha_fin.split('-').reverse().join('/')}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono">{enviada}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">{recibida}</TableCell>
                        <TableCell className="text-right font-mono">
                          {diferencia > 0 ? (
                            <Badge variant="destructive" className="text-xs">-{diferencia}</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        {showAvance && (
                          <TableCell className="text-center hidden md:table-cell">
                            {serviciosProduccion.find(s => s.id === mov.servicio_id)?.usa_avance_porcentaje && mov.avance_porcentaje != null ? (
                              <div className="flex items-center justify-center gap-1.5">
                                <div className="w-12 h-2 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${mov.avance_porcentaje >= 100 ? 'bg-green-500' : mov.avance_porcentaje >= 50 ? 'bg-blue-500' : 'bg-amber-500'}`}
                                    style={{ width: `${Math.min(100, mov.avance_porcentaje)}%` }}
                                  />
                                </div>
                                <span className="text-xs font-mono font-medium">{mov.avance_porcentaje}%</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
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
                  <TableRow className="bg-muted/30">
                    <TableCell colSpan={4} className="font-semibold text-xs text-muted-foreground">Cantidad efectiva (ultima recibida)</TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {movimientosProduccion.length > 0 ? movimientosProduccion[0].cantidad_enviada : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold text-primary" colSpan={showAvance ? 3 : 2}>
                      {movimientosProduccion.length > 0
                        ? (movimientosProduccion[movimientosProduccion.length - 1].cantidad_recibida
                          ?? movimientosProduccion[movimientosProduccion.length - 1].cantidad
                          ?? '-')
                        : '-'}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">
              {movimientosProduccion.length} movimiento{movimientosProduccion.length !== 1 ? 's' : ''} registrado{movimientosProduccion.length !== 1 ? 's' : ''}
            </p>
          </>
        ) : (
          <div className="text-center py-6 text-muted-foreground border rounded-lg bg-muted/20">
            <Play className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No hay movimientos de producción</p>
            <p className="text-xs mt-1">Registra los servicios realizados</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
