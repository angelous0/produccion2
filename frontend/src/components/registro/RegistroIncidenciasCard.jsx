import React from 'react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Separator } from '../ui/separator';
import { AlertTriangle, Plus, ChevronDown, ChevronUp, Check, Trash2 } from 'lucide-react';

export const RegistroIncidenciasCard = ({
  incidencias, showResueltas, onToggleResueltas,
  onResolver, onEliminar, onNueva, permisos,
}) => {
  const canRegister = permisos?.canAction?.('registrar_incidencias') !== false;
  const canResolve = permisos?.canAction?.('resolver_incidencias') !== false;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Incidencias
            {incidencias.filter(i => i.estado === 'ABIERTA').length > 0 && (
              <Badge variant="destructive" className="ml-1">{incidencias.filter(i => i.estado === 'ABIERTA').length} abiertas</Badge>
            )}
          </CardTitle>
          {canRegister && (
            <Button type="button" size="sm" variant="outline" onClick={onNueva} data-testid="btn-nueva-incidencia">
              <Plus className="h-4 w-4 mr-1" /> Nueva
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {incidencias.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Sin incidencias registradas</p>
        ) : (
          <div className="space-y-2">
            {/* Incidencias activas */}
            {incidencias.filter(i => i.estado === 'ABIERTA').map((inc) => (
              <div key={inc.id} className="flex items-start gap-3 p-3 rounded-lg border bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800" data-testid={`incidencia-${inc.id}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="destructive" className="text-xs">{inc.estado}</Badge>
                    <span className="font-medium text-sm">{inc.motivo_nombre || inc.tipo}</span>
                    {inc.paraliza && <Badge variant="outline" className="text-xs border-red-300 text-red-600">Paraliza</Badge>}
                    {inc.paralizacion_activa && <Badge className="bg-red-600 text-xs">En pausa</Badge>}
                  </div>
                  {inc.comentario && <p className="text-xs text-muted-foreground mt-1">{inc.comentario}</p>}
                  {inc.movimiento_servicio && <p className="text-xs text-muted-foreground">Mov: {inc.movimiento_servicio}</p>}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {inc.fecha_hora ? new Date(inc.fecha_hora).toLocaleString('es-PE', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : ''}
                    {inc.paraliza && inc.paralizacion_inicio && (
                      <span className="ml-2">Paralizada: {new Date(inc.paralizacion_inicio).toLocaleString('es-PE', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })} (activa)</span>
                    )}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  {canResolve && (
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => onResolver(inc.id)} title="Resolver" data-testid={`resolver-incidencia-${inc.id}`}>
                      <Check className="h-4 w-4 text-green-600" />
                    </Button>
                  )}
                  {canRegister && (
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEliminar(inc.id)} title="Eliminar" data-testid={`eliminar-incidencia-${inc.id}`}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))}

            {/* Incidencias resueltas — colapsadas */}
            {incidencias.filter(i => i.estado === 'RESUELTA').length > 0 && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={onToggleResueltas}
                  className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full py-1.5"
                  data-testid="toggle-incidencias-resueltas"
                >
                  {showResueltas ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  <span>Historial resueltas ({incidencias.filter(i => i.estado === 'RESUELTA').length})</span>
                  <Separator className="flex-1" />
                </button>
                {showResueltas && (
                  <div className="space-y-1.5 mt-1">
                    {incidencias.filter(i => i.estado === 'RESUELTA').map((inc) => (
                      <div key={inc.id} className="flex items-start gap-3 p-2.5 rounded-lg border bg-muted/20 border-border" data-testid={`incidencia-${inc.id}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary" className="text-[10px]">RESUELTA</Badge>
                            <span className="font-medium text-xs text-muted-foreground">{inc.motivo_nombre || inc.tipo}</span>
                            {inc.paraliza && <Badge variant="outline" className="text-[10px] border-green-300 text-green-600">Reanudada</Badge>}
                          </div>
                          {inc.comentario && <p className="text-[11px] text-muted-foreground mt-0.5">{inc.comentario}</p>}
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {inc.fecha_hora ? new Date(inc.fecha_hora).toLocaleString('es-PE', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : ''}
                            {inc.paraliza && inc.paralizacion_inicio && (
                              <span className="ml-1">· Paralizada: {new Date(inc.paralizacion_inicio).toLocaleString('es-PE', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}
                                {inc.paralizacion_fin ? ` → ${new Date(inc.paralizacion_fin).toLocaleString('es-PE', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}` : ''}
                              </span>
                            )}
                          </p>
                          {inc.updated_at && (
                            <p className="text-[11px] text-green-600 mt-0.5 flex items-center gap-1">
                              <Check className="h-2.5 w-2.5" />
                              Resuelta: {new Date(inc.updated_at).toLocaleString('es-PE', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' })}
                            </p>
                          )}
                        </div>
                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => onEliminar(inc.id)} title="Eliminar" data-testid={`eliminar-incidencia-${inc.id}`}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
