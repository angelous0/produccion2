import React from 'react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { NumericInput } from '../ui/numeric-input';
import { Checkbox } from '../ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../ui/command';
import { Separator } from '../ui/separator';
import { NumericInput as NumInput } from '../ui/numeric-input';
import { MultiSelectColors } from '../MultiSelectColors';
import { Divide, ArrowRight, Check, ChevronsUpDown, Scissors, Trash2, Plus, Pencil, ArrowLeft, Lock, DollarSign, X, RotateCcw, AlertTriangle } from 'lucide-react';
import { formatCurrency as fmtCur } from '../../lib/utils';

/**
 * Colores Distribution Dialog
 */
export const ColoresDialog = ({
  open, onOpenChange,
  tallasSeleccionadas, coloresSeleccionados, coloresCatalogo,
  matrizCantidades, onColoresChange, onMatrizChange,
  getCantidadMatriz, getTotalColor, getTotalTallaAsignado, getTotalGeneralAsignado,
  onProrratear, onSave,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Distribución de Colores</DialogTitle>
        <DialogDescription>Selecciona colores y distribuye las cantidades por talla</DialogDescription>
      </DialogHeader>
      <div className="space-y-6 py-4">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Seleccionar Colores</h3>
          <MultiSelectColors
            options={coloresCatalogo}
            selected={coloresSeleccionados}
            onChange={onColoresChange}
            placeholder="Buscar y seleccionar colores..."
            searchPlaceholder="Buscar color..."
            emptyMessage="No se encontraron colores."
          />
          <p className="text-xs text-muted-foreground mt-2">El primer color seleccionado recibe todo el total automáticamente.</p>
        </div>
        <Separator />
        {tallasSeleccionadas.length > 0 && coloresSeleccionados.length > 0 ? (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Distribución por Talla y Color</h3>
              <Button type="button" variant="outline" size="sm" onClick={onProrratear} data-testid="btn-prorratear-colores">
                <Divide className="h-4 w-4 mr-1" /> Prorratear
              </Button>
            </div>
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="bg-muted/50 p-3 text-left text-xs font-semibold uppercase tracking-wider border-b min-w-[120px]">Color</th>
                    {tallasSeleccionadas.map((t) => (
                      <th key={t.talla_id} className="bg-muted/50 p-3 text-center text-xs font-semibold uppercase tracking-wider border-b min-w-[100px]">
                        <div>{t.talla_nombre}</div>
                        <div className="text-muted-foreground font-normal mt-1">Total: {t.cantidad}</div>
                      </th>
                    ))}
                    <th className="bg-muted/70 p-3 text-center text-xs font-semibold uppercase tracking-wider border-b min-w-[80px]">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {coloresSeleccionados.map((color, colorIndex) => (
                    <tr key={color.id} className={colorIndex % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                      <td className="p-2 border-b">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded border shrink-0" style={{ backgroundColor: color.codigo_hex || '#ccc' }} />
                          <span className="font-medium text-sm">{color.nombre}</span>
                        </div>
                      </td>
                      {tallasSeleccionadas.map((t) => (
                        <td key={t.talla_id} className="p-1 border-b">
                          <NumericInput
                            min="0"
                            value={getCantidadMatriz(color.id, t.talla_id)}
                            onChange={(e) => onMatrizChange(color.id, t.talla_id, e.target.value)}
                            className="w-full font-mono text-center h-10"
                            placeholder="0"
                            data-testid={`matriz-${color.id}-${t.talla_id}`}
                          />
                        </td>
                      ))}
                      <td className="p-2 border-b bg-muted/30 text-center font-mono font-semibold">{getTotalColor(color.id)}</td>
                    </tr>
                  ))}
                  <tr className="bg-muted/50">
                    <td className="p-3 font-semibold text-sm">Asignado</td>
                    {tallasSeleccionadas.map((t) => {
                      const asignado = getTotalTallaAsignado(t.talla_id);
                      const completo = asignado === t.cantidad;
                      return (
                        <td key={t.talla_id} className="p-3 text-center font-mono font-semibold">
                          <span className={completo ? 'text-green-600' : 'text-orange-500'}>{asignado}</span>
                          <span className="text-muted-foreground">/{t.cantidad}</span>
                        </td>
                      );
                    })}
                    <td className="p-3 text-center font-mono font-bold bg-primary/10 text-primary">{getTotalGeneralAsignado()}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground border rounded-lg bg-muted/20">
            Selecciona al menos un color para ver la matriz de distribución
          </div>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
        <Button onClick={onSave} disabled={coloresSeleccionados.length === 0} data-testid="btn-guardar-colores">Guardar Distribución</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

/**
 * Movimiento de Producción Dialog
 */
export const MovimientoDialog = ({
  open, onOpenChange, editingMovimiento, movimientoFormData, setMovimientoFormData,
  serviciosProduccion, personasFiltradas, modeloSeleccionado,
  servicioPopoverOpen, setServicioPopoverOpen,
  personaPopoverOpen, setPersonaPopoverOpen,
  onServicioChange, onPersonaChange, onSave, saving,
  getTarifaPersonaServicio, formatCurrency,
  calcularCostoMovimiento, calcularDiferenciaMovimiento,
  usaRuta, etapasCompletas, movimientosProduccion,
  detalleCostos = [], setDetalleCostos,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{editingMovimiento ? 'Editar Movimiento' : 'Nuevo Movimiento de Producción'}</DialogTitle>
        <DialogDescription>{editingMovimiento ? 'Modifica los datos del movimiento' : 'Registrar un movimiento de producción para este corte'}</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label>Servicio *</Label>
          <Popover open={servicioPopoverOpen} onOpenChange={setServicioPopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" role="combobox" aria-expanded={servicioPopoverOpen} className="w-full justify-between font-normal" data-testid="select-servicio-movimiento">
                {movimientoFormData.servicio_id
                  ? (serviciosProduccion.find(s => s.id === movimientoFormData.servicio_id)?.nombre || 'Servicio seleccionado')
                  : 'Seleccionar servicio...'}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command>
                <CommandInput placeholder="Buscar servicio..." />
                <CommandList>
                  <CommandEmpty>No se encontro servicio</CommandEmpty>
                  <CommandGroup>
                    {(modeloSeleccionado?.servicios_ids?.length > 0
                      ? serviciosProduccion.filter(s => modeloSeleccionado.servicios_ids.includes(s.id))
                      : serviciosProduccion
                    ).map((servicio) => (
                      <CommandItem key={servicio.id} value={servicio.nombre} onSelect={() => { onServicioChange(servicio.id); setServicioPopoverOpen(false); }}>
                        <Check className={`mr-2 h-4 w-4 ${movimientoFormData.servicio_id === servicio.id ? 'opacity-100' : 'opacity-0'}`} />
                        {servicio.nombre}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {modeloSeleccionado?.servicios_ids?.length > 0 && <p className="text-xs text-muted-foreground">Mostrando servicios configurados en el modelo</p>}
        </div>

        <div className="space-y-2">
          <Label>Persona *</Label>
          <Popover open={personaPopoverOpen} onOpenChange={setPersonaPopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" role="combobox" aria-expanded={personaPopoverOpen} className="w-full justify-between font-normal" disabled={!movimientoFormData.servicio_id} data-testid="select-persona-movimiento">
                {movimientoFormData.persona_id
                  ? (personasFiltradas.find(p => p.id === movimientoFormData.persona_id)?.nombre || 'Persona seleccionada')
                  : (movimientoFormData.servicio_id ? 'Seleccionar persona...' : 'Selecciona servicio primero')}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command>
                <CommandInput placeholder="Buscar persona..." />
                <CommandList>
                  <CommandEmpty>No se encontro persona</CommandEmpty>
                  <CommandGroup>
                    {personasFiltradas.map((persona) => {
                      const tarifaPersona = getTarifaPersonaServicio(persona.id, movimientoFormData.servicio_id);
                      return (
                        <CommandItem key={persona.id} value={persona.nombre} onSelect={() => { onPersonaChange(persona.id); setPersonaPopoverOpen(false); }}>
                          <Check className={`mr-2 h-4 w-4 ${movimientoFormData.persona_id === persona.id ? 'opacity-100' : 'opacity-0'}`} />
                          <span className="flex items-center gap-2">
                            {persona.nombre}
                            <span className={`text-[10px] px-1 rounded ${persona.tipo_persona === 'INTERNO' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
                              {persona.tipo_persona === 'INTERNO' ? 'INT' : 'EXT'}
                            </span>
                            {tarifaPersona > 0 && <span className="text-green-600 text-xs">({formatCurrency(tarifaPersona)}/prenda)</span>}
                          </span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {movimientoFormData.servicio_id && personasFiltradas.length === 0 && (
            <p className="text-xs text-orange-500">No hay personas asignadas a este servicio. Asígnalas en Maestros → Personas.</p>
          )}
          {movimientoFormData.persona_id && (() => {
            const personaSel = personasFiltradas.find(p => p.id === movimientoFormData.persona_id);
            if (!personaSel) return null;
            return (
              <div className={`p-2 rounded-lg border text-xs ${personaSel.tipo_persona === 'INTERNO' ? 'bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800' : 'bg-gray-50 border-gray-200 dark:bg-gray-900 dark:border-gray-700'}`} data-testid="persona-tipo-info">
                <div className="flex items-center gap-2">
                  <Badge variant={personaSel.tipo_persona === 'INTERNO' ? 'default' : 'outline'} className={`text-[10px] px-1 py-0 ${personaSel.tipo_persona === 'INTERNO' ? 'bg-blue-600' : ''}`}>
                    {personaSel.tipo_persona === 'INTERNO' ? 'Interno' : 'Externo'}
                  </Badge>
                  {personaSel.tipo_persona === 'INTERNO' && personaSel.unidad_interna_nombre && (
                    <span className="text-muted-foreground">Unidad: <strong>{personaSel.unidad_interna_nombre}</strong></span>
                  )}
                  {personaSel.tipo_persona === 'EXTERNO' && (
                    <span className="text-muted-foreground">Costo externo - sin unidad interna</span>
                  )}
                </div>
              </div>
            );
          })()}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="fecha-inicio">Fecha Inicio</Label>
            <Input
              id="fecha-inicio" type="date"
              value={movimientoFormData.fecha_inicio}
              min={(() => {
                if (!usaRuta || !etapasCompletas.length || !movimientoFormData.servicio_id) return undefined;
                const etapaIdx = etapasCompletas.findIndex(e => e.servicio_id === movimientoFormData.servicio_id);
                if (etapaIdx <= 0) return undefined;
                for (let i = etapaIdx - 1; i >= 0; i--) {
                  const ea = etapasCompletas[i];
                  if (!ea.servicio_id) continue;
                  const movsAnt = movimientosProduccion.filter(m => m.servicio_id === ea.servicio_id && m.fecha_fin);
                  if (movsAnt.length > 0) return movsAnt.map(m => m.fecha_fin).sort().pop();
                }
                return undefined;
              })()}
              onChange={(e) => {
                const val = e.target.value;
                const updates = { fecha_inicio: val };
                if (movimientoFormData.fecha_fin && val && movimientoFormData.fecha_fin < val) updates.fecha_fin = '';
                if (movimientoFormData.fecha_esperada_movimiento && val && movimientoFormData.fecha_esperada_movimiento < val) updates.fecha_esperada_movimiento = '';
                setMovimientoFormData({ ...movimientoFormData, ...updates });
              }}
              data-testid="input-fecha-inicio"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fecha-fin">Fecha Fin</Label>
            <Input id="fecha-fin" type="date" value={movimientoFormData.fecha_fin} min={movimientoFormData.fecha_inicio || undefined}
              onChange={(e) => setMovimientoFormData({ ...movimientoFormData, fecha_fin: e.target.value })} data-testid="input-fecha-fin" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="fecha-esperada">Fecha Esperada</Label>
            <Input id="fecha-esperada" type="date" value={movimientoFormData.fecha_esperada_movimiento} min={movimientoFormData.fecha_inicio || undefined}
              onChange={(e) => setMovimientoFormData({ ...movimientoFormData, fecha_esperada_movimiento: e.target.value })} data-testid="input-fecha-esperada-movimiento" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="cantidad-enviada">Cantidad Enviada</Label>
            <NumericInput id="cantidad-enviada" min="0" value={movimientoFormData.cantidad_enviada}
              onChange={(e) => {
                const enviada = e.target.value;
                setMovimientoFormData({
                  ...movimientoFormData,
                  cantidad_enviada: enviada,
                  cantidad_recibida: movimientoFormData.cantidad_recibida === movimientoFormData.cantidad_enviada ? enviada : movimientoFormData.cantidad_recibida
                });
              }}
              className="font-mono" data-testid="input-cantidad-enviada" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cantidad-recibida">Cantidad Recibida</Label>
            <NumericInput id="cantidad-recibida" min="0" value={movimientoFormData.cantidad_recibida}
              onChange={(e) => setMovimientoFormData({ ...movimientoFormData, cantidad_recibida: e.target.value })}
              className="font-mono" data-testid="input-cantidad-recibida" />
          </div>
        </div>

        {calcularDiferenciaMovimiento() > 0 && (
          <div className="p-3 bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg">
            <div className="flex justify-between items-center">
              <span className="text-sm text-orange-700 dark:text-orange-300">Diferencia (Merma):</span>
              <span className="text-lg font-bold text-orange-700 dark:text-orange-300">{calcularDiferenciaMovimiento()} prendas</span>
            </div>
            <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">Esta diferencia se registrará automáticamente en Calidad/Merma</p>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="tarifa-movimiento" className={detalleCostos?.length > 0 ? 'text-muted-foreground' : ''}>
            Tarifa por Prenda (S/) {detalleCostos?.length > 0 && <span className="text-xs font-normal ml-1">(deshabilitada — el detalle reemplaza la tarifa)</span>}
          </Label>
          <NumericInput id="tarifa-movimiento" min="0" step="0.01" value={movimientoFormData.tarifa_aplicada}
            onChange={(e) => setMovimientoFormData({ ...movimientoFormData, tarifa_aplicada: e.target.value })}
            className={`font-mono ${detalleCostos?.length > 0 ? 'opacity-40 pointer-events-none' : ''}`}
            placeholder="0.00" data-testid="input-tarifa-movimiento"
            disabled={detalleCostos?.length > 0} />
          {movimientoFormData.persona_id && movimientoFormData.servicio_id && !detalleCostos?.length && (
            <p className="text-xs text-muted-foreground">Tarifa configurada para esta persona: {formatCurrency(getTarifaPersonaServicio(movimientoFormData.persona_id, movimientoFormData.servicio_id))}</p>
          )}
        </div>

        {detalleCostos?.length > 0 ? (
          <div className="p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
            <div className="flex justify-between items-center">
              <span className="text-sm text-green-700 dark:text-green-300">Costo por detalle:</span>
              <span className="text-lg font-bold text-green-700 dark:text-green-300">{fmtCur(detalleCostos.reduce((s, l) => s + (l.cantidad || 0) * (l.precio_unitario || 0), 0))}</span>
            </div>
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">El detalle de costos reemplaza la tarifa por prenda</p>
          </div>
        ) : movimientoFormData.cantidad_recibida > 0 && movimientoFormData.tarifa_aplicada > 0 ? (
          <div className="p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
            <div className="flex justify-between items-center">
              <span className="text-sm text-green-700 dark:text-green-300">Costo calculado:</span>
              <span className="text-lg font-bold text-green-700 dark:text-green-300">{formatCurrency(calcularCostoMovimiento())}</span>
            </div>
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">{movimientoFormData.cantidad_recibida} prendas × {formatCurrency(movimientoFormData.tarifa_aplicada)}</p>
          </div>
        ) : null}

        {movimientoFormData.servicio_id && serviciosProduccion.find(s => s.id === movimientoFormData.servicio_id)?.usa_avance_porcentaje && (
          <div className="space-y-2">
            <Label htmlFor="avance-porcentaje">Avance %</Label>
            <div className="flex items-center gap-3">
              <NumericInput id="avance-porcentaje" min="0" max="100" value={movimientoFormData.avance_porcentaje ?? ''}
                onChange={(e) => setMovimientoFormData({ ...movimientoFormData, avance_porcentaje: e.target.value === '' ? null : Number(e.target.value) })}
                className="font-mono w-24" placeholder="0" data-testid="input-avance-porcentaje" />
              <span className="text-sm text-muted-foreground">%</span>
              {movimientoFormData.avance_porcentaje != null && (
                <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${movimientoFormData.avance_porcentaje >= 100 ? 'bg-green-500' : movimientoFormData.avance_porcentaje >= 50 ? 'bg-blue-500' : 'bg-amber-500'}`}
                    style={{ width: `${Math.min(100, Math.max(0, movimientoFormData.avance_porcentaje))}%` }} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Detalle de costos */}
        {setDetalleCostos && (
          <div className="space-y-2 border rounded-lg p-3 bg-muted/20">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5" />
                Detalle de costos
              </Label>
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setDetalleCostos(prev => [...prev, { descripcion: '', cantidad: parseFloat(movimientoFormData.cantidad_enviada) || 0, precio_unitario: 0 }])}>
                <Plus className="h-3 w-3 mr-1" /> Agregar línea
              </Button>
            </div>
            {detalleCostos.length > 0 ? (
              <>
                <div className="grid grid-cols-[1fr,80px,90px,80px,32px] gap-1.5 text-[10px] font-medium text-muted-foreground px-1">
                  <span>Descripción</span><span className="text-right">Cant.</span><span className="text-right">P. Unit.</span><span className="text-right">Subtotal</span><span />
                </div>
                {detalleCostos.map((linea, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr,80px,90px,80px,32px] gap-1.5 items-center">
                    <Input placeholder="Ej: Pretina" value={linea.descripcion}
                      onChange={(e) => setDetalleCostos(prev => prev.map((l, i) => i === idx ? { ...l, descripcion: e.target.value } : l))}
                      className="h-8 text-xs" />
                    <NumericInput min="0" value={linea.cantidad}
                      onChange={(e) => setDetalleCostos(prev => prev.map((l, i) => i === idx ? { ...l, cantidad: parseFloat(e.target.value) || 0 } : l))}
                      className="h-8 text-xs text-right font-mono" />
                    <NumericInput min="0" step="0.01" value={linea.precio_unitario}
                      onChange={(e) => setDetalleCostos(prev => prev.map((l, i) => i === idx ? { ...l, precio_unitario: parseFloat(e.target.value) || 0 } : l))}
                      className="h-8 text-xs text-right font-mono" />
                    <span className="text-xs font-mono text-right text-green-600 font-medium pr-1">
                      {fmtCur((linea.cantidad || 0) * (linea.precio_unitario || 0))}
                    </span>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDetalleCostos(prev => prev.filter((_, i) => i !== idx))}>
                      <X className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                ))}
                <div className="flex justify-end items-center gap-2 pt-1 border-t">
                  <span className="text-xs font-medium text-muted-foreground">Total detalle:</span>
                  <span className="text-sm font-bold font-mono text-green-600">{fmtCur(detalleCostos.reduce((s, l) => s + (l.cantidad || 0) * (l.precio_unitario || 0), 0))}</span>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-2">
                Sin líneas de detalle — el costo se calcula como cantidad × tarifa
              </p>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="observaciones-movimiento">Observaciones</Label>
          <Textarea id="observaciones-movimiento" value={movimientoFormData.observaciones}
            onChange={(e) => setMovimientoFormData({ ...movimientoFormData, observaciones: e.target.value })}
            placeholder="Notas adicionales..." rows={2} data-testid="input-observaciones-movimiento" />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
        <Button onClick={onSave} disabled={saving || !movimientoFormData.servicio_id || !movimientoFormData.persona_id} data-testid="btn-guardar-movimiento">
          {saving ? 'Guardando...' : (editingMovimiento ? 'Actualizar' : 'Registrar Movimiento')}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

/**
 * Incidencia Dialog
 */
export const IncidenciaDialog = ({
  open, onOpenChange, incidenciaForm, setIncidenciaForm,
  motivosIncidencia, onCrear, nuevoMotivoNombre, setNuevoMotivoNombre, onCrearMotivo,
  gestionMotivos, setGestionMotivos, editandoMotivo, setEditandoMotivo,
  editMotivoNombre, setEditMotivoNombre, onEditarMotivo, onEliminarMotivo,
  mode = 'create',  // 'create' | 'edit'
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>{mode === 'edit' ? 'Editar Incidencia' : 'Nueva Incidencia'}</DialogTitle>
        <DialogDescription>
          {mode === 'edit' ? 'Modifica los datos de la incidencia' : 'Registra un evento que afecta la produccion de este registro'}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div className="space-y-2">
          <Label>Motivo *</Label>
          <Select value={incidenciaForm.motivo_id} onValueChange={(v) => setIncidenciaForm(prev => ({ ...prev, motivo_id: v }))}>
            <SelectTrigger data-testid="select-motivo-incidencia"><SelectValue placeholder="Seleccionar motivo..." /></SelectTrigger>
            <SelectContent>
              {motivosIncidencia.map(m => <SelectItem key={m.id} value={m.id}>{m.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Input placeholder="Nuevo motivo..." value={nuevoMotivoNombre}
              onChange={(e) => setNuevoMotivoNombre(e.target.value)} className="text-sm" data-testid="input-nuevo-motivo"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onCrearMotivo(); } }} />
            <Button type="button" variant="outline" size="sm" onClick={onCrearMotivo} disabled={!nuevoMotivoNombre.trim()} data-testid="btn-crear-motivo">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <button type="button" className="text-xs text-muted-foreground hover:text-foreground underline" onClick={() => setGestionMotivos(!gestionMotivos)} data-testid="toggle-gestionar-motivos">
            {gestionMotivos ? 'Ocultar lista' : 'Gestionar motivos'}
          </button>
          {gestionMotivos && (
            <div className="border rounded-lg max-h-[180px] overflow-y-auto divide-y text-sm" onWheel={(e) => e.stopPropagation()}>
              {motivosIncidencia.length === 0 && <p className="p-2 text-muted-foreground text-xs">Sin motivos</p>}
              {motivosIncidencia.map(m => (
                <div key={m.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted/50">
                  {editandoMotivo === m.id ? (
                    <>
                      <Input value={editMotivoNombre} onChange={(e) => setEditMotivoNombre(e.target.value)} className="h-7 text-sm flex-1" autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onEditarMotivo(m.id); } if (e.key === 'Escape') setEditandoMotivo(null); }}
                        data-testid={`input-edit-motivo-${m.id}`} />
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => onEditarMotivo(m.id)} data-testid={`btn-save-motivo-${m.id}`}>
                        <Check className="h-3.5 w-3.5 text-green-600" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setEditandoMotivo(null)}>
                        <ArrowLeft className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 truncate">{m.nombre}</span>
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => { setEditandoMotivo(m.id); setEditMotivoNombre(m.nombre); }} data-testid={`btn-edit-motivo-${m.id}`}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-destructive hover:text-destructive" onClick={() => onEliminarMotivo(m.id)} data-testid={`btn-delete-motivo-${m.id}`}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-2">
          <Label>Fecha y hora</Label>
          <Input
            type="datetime-local"
            value={incidenciaForm.fecha_hora || ''}
            onChange={(e) => setIncidenciaForm(prev => ({ ...prev, fecha_hora: e.target.value }))}
            data-testid="input-fecha-incidencia"
          />
          <p className="text-[10px] text-muted-foreground">Hora de Lima. Déjalo vacío para usar la hora actual.</p>
        </div>
        <div className="space-y-2">
          <Label>Comentario</Label>
          <Textarea value={incidenciaForm.comentario} onChange={(e) => setIncidenciaForm(prev => ({ ...prev, comentario: e.target.value }))}
            placeholder="Descripcion del problema..." rows={2} data-testid="input-comentario-incidencia" />
        </div>
        {mode === 'create' && (
          <div className="flex items-center space-x-2 p-3 border rounded-lg bg-red-50 dark:bg-red-950/20">
            <Checkbox id="paraliza-check" checked={incidenciaForm.paraliza} onCheckedChange={(checked) => setIncidenciaForm(prev => ({ ...prev, paraliza: checked }))} data-testid="checkbox-paraliza" />
            <div>
              <Label htmlFor="paraliza-check" className="cursor-pointer font-medium">Paraliza produccion</Label>
              <p className="text-xs text-muted-foreground">Detiene la produccion hasta que se resuelva esta incidencia</p>
            </div>
          </div>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
        <Button type="button" onClick={onCrear} data-testid="btn-guardar-incidencia">
          {mode === 'edit' ? 'Guardar cambios' : 'Registrar Incidencia'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

/**
 * Dialog para resolver una incidencia — con fecha y comentario de resolución.
 */
export const ResolverIncidenciaDialog = ({ open, onOpenChange, form, setForm, onResolver }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Resolver Incidencia</DialogTitle>
        <DialogDescription>Marca la incidencia como resuelta. Opcionalmente indica fecha y comentario.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3 py-2">
        <div className="space-y-2">
          <Label>Fecha de resolución</Label>
          <Input
            type="datetime-local"
            value={form?.fecha_resolucion || ''}
            onChange={(e) => setForm(prev => ({ ...prev, fecha_resolucion: e.target.value }))}
            data-testid="input-fecha-resolucion"
          />
          <p className="text-[10px] text-muted-foreground">Hora de Lima. Déjalo vacío para usar la hora actual.</p>
        </div>
        <div className="space-y-2">
          <Label>Comentario de resolución</Label>
          <Textarea
            value={form?.comentario_resolucion || ''}
            onChange={(e) => setForm(prev => ({ ...prev, comentario_resolucion: e.target.value }))}
            placeholder="Cómo se resolvió, qué se hizo, observaciones..."
            rows={3}
            data-testid="input-comentario-resolucion"
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
        <Button type="button" onClick={onResolver} data-testid="btn-confirmar-resolucion">Marcar como resuelta</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

/**
 * Sugerencia de Estado Dialog
 */
export const SugerenciaEstadoDialog = ({ dialog, onClose, formData, onAutoGuardarEstado }) => (
  <Dialog open={!!dialog} onOpenChange={() => onClose()}>
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Sugerencia de Estado</DialogTitle>
        <DialogDescription>{dialog?.mensaje}</DialogDescription>
      </DialogHeader>
      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
        <Badge variant="outline">{formData.estado}</Badge>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <Badge className="bg-primary">{dialog?.estadoSugerido}</Badge>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} data-testid="btn-rechazar-sugerencia-estado">No, mantener estado</Button>
        <Button onClick={async () => { const e = dialog.estadoSugerido; onClose(); await onAutoGuardarEstado(e); }} data-testid="btn-aceptar-sugerencia-estado">
          Sí, actualizar estado
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

/**
 * Sugerencia de Movimiento Dialog
 */
export const SugerenciaMovDialog = ({ dialog, onClose, formData, onOpenMovimientoPrelleno }) => (
  <Dialog open={!!dialog} onOpenChange={() => onClose()}>
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Movimiento Faltante</DialogTitle>
        <DialogDescription>
          El estado "{formData.estado}" está vinculado al servicio "{dialog?.servicio_nombre}" y no existe un movimiento registrado. ¿Deseas crearlo ahora?
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} data-testid="btn-rechazar-sugerencia-mov">No, solo cambiar estado</Button>
        <Button onClick={() => { onClose(); onOpenMovimientoPrelleno(dialog); }} data-testid="btn-aceptar-sugerencia-mov">
          Sí, crear movimiento
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

/**
 * Retroceso de Estado Dialog — pide confirmación y motivo cuando se retrocede en la ruta
 */
export const RetrocesoEstadoDialog = ({ dialog, onClose, onConfirmar }) => {
  const [motivo, setMotivo] = React.useState('');
  const handleConfirm = () => { if (!motivo.trim()) return; onConfirmar(dialog.nuevo_estado, motivo.trim()); setMotivo(''); };
  return (
    <Dialog open={!!dialog} onOpenChange={() => { onClose(); setMotivo(''); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ArrowLeft className="h-4 w-4 text-amber-500" /> Retroceso de Estado</DialogTitle>
          <DialogDescription>
            Estás retrocediendo de <strong>"{dialog?.estado_actual}"</strong> a <strong>"{dialog?.nuevo_estado}"</strong>. Esto no es lo habitual en el flujo de producción.
          </DialogDescription>
        </DialogHeader>
        {(dialog?.advertencias || []).map((adv, i) => (
          <p key={i} className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 p-2 rounded">{adv}</p>
        ))}
        <div className="space-y-2">
          <Label htmlFor="motivo-retroceso">Motivo del retroceso <span className="text-red-500">*</span></Label>
          <Textarea id="motivo-retroceso" value={motivo} onChange={e => setMotivo(e.target.value)}
            placeholder="Ej: Error en corte, se debe repetir la etapa..." className="min-h-[80px]" data-testid="input-motivo-retroceso" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); setMotivo(''); }} data-testid="btn-cancelar-retroceso">Cancelar</Button>
          <Button onClick={handleConfirm} disabled={!motivo.trim()} data-testid="btn-confirmar-retroceso">Confirmar retroceso</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/**
 * Advertencia de Cantidad Dialog — avisa cuando hay discrepancia de prendas al avanzar
 */
export const AdvertenciaCantidadDialog = ({ dialog, onClose, onContinuar }) => (
  <Dialog open={!!dialog} onOpenChange={() => onClose()}>
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-amber-600">⚠ Discrepancia de cantidad</DialogTitle>
        <DialogDescription>Se detectó una diferencia en la cantidad de prendas al avanzar de estado.</DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        {(dialog?.advertencias || []).map((adv, i) => (
          <p key={i} className="text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 p-3 rounded">{adv}</p>
        ))}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button variant="default" onClick={() => { onClose(); onContinuar(); }} data-testid="btn-continuar-con-advertencia">
          Continuar de todas formas
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

/**
 * Forzar Estado Dialog — con campo de motivo obligatorio
 */
export const ForzarEstadoDialog = ({ dialog, onClose, onForzar, movimientosProduccion, onOpenMovimientoDialog }) => {
  const [motivo, setMotivo] = React.useState('');
  return (
    <Dialog open={!!dialog} onOpenChange={() => { onClose(); setMotivo(''); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Cambio de Estado Bloqueado</DialogTitle>
          <DialogDescription>No se puede cambiar a "{dialog?.nuevo_estado}" por las siguientes razones:</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 my-2">
          {(dialog?.bloqueos || []).map((b, i) => {
            const msg = typeof b === 'string' ? b : b.mensaje;
            const movId = typeof b === 'object' ? b.movimiento_id : null;
            const srvId = typeof b === 'object' ? b.servicio_id : null;
            return (
              <div key={i} className="flex items-center justify-between gap-2 p-2 rounded border bg-muted/30">
                <p className="text-sm text-foreground flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 text-amber-500">&#x26A0;</span>{msg}
                </p>
                {movId && (
                  <Button size="sm" variant="default" className="shrink-0 h-7 text-xs" data-testid={`btn-cerrar-mov-${i}`}
                    onClick={() => { onClose(); setMotivo(''); const mov = movimientosProduccion.find(m => m.id === movId); if (mov) onOpenMovimientoDialog(mov); }}>
                    Cerrar movimiento
                  </Button>
                )}
                {!movId && srvId && (
                  <Button size="sm" variant="default" className="shrink-0 h-7 text-xs" data-testid={`btn-crear-mov-${i}`}
                    onClick={() => { onClose(); setMotivo(''); onOpenMovimientoDialog(); }}>
                    Crear movimiento
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        <div className="space-y-2">
          <Label htmlFor="motivo-forzar">Motivo para forzar <span className="text-red-500">*</span></Label>
          <Textarea id="motivo-forzar" value={motivo} onChange={e => setMotivo(e.target.value)}
            placeholder="Indica por qué necesitas forzar este cambio..." className="min-h-[60px]" data-testid="input-motivo-forzar" />
        </div>
        <DialogFooter className="flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={() => { onClose(); setMotivo(''); }} data-testid="btn-cancelar-forzar-estado">Cancelar</Button>
          <button className="text-xs text-muted-foreground underline hover:text-foreground transition-colors cursor-pointer disabled:opacity-40"
            disabled={!motivo.trim()} data-testid="btn-forzar-cambio-estado"
            onClick={() => { onForzar(dialog.nuevo_estado, motivo.trim()); setMotivo(''); }}>
            Forzar cambio de estado
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/**
 * División de Lote Dialog
 */
export const DivisionDialog = ({ open, onOpenChange, formData, divisionTallas, setDivisionTallas, onDividir }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Dividir Lote - Corte {formData.n_corte}</DialogTitle>
        <DialogDescription>Asigna las cantidades que irán al nuevo lote. El registro actual se quedará con el resto.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-xs font-medium text-muted-foreground border-b pb-2">
          <span>Talla</span><span className="text-center">Disponible</span><span className="text-center">Dividir</span>
        </div>
        {divisionTallas.map((t, idx) => (
          <div key={t.talla_id} className="grid grid-cols-3 gap-2 items-center">
            <span className="text-sm font-medium">{t.talla_nombre}</span>
            <span className="text-sm text-center text-muted-foreground">{t.cantidad_disponible}</span>
            <Input type="number" min="0" max={t.cantidad_disponible} value={t.cantidad_dividir}
              onChange={(e) => {
                const val = Math.min(Math.max(0, parseInt(e.target.value) || 0), t.cantidad_disponible);
                setDivisionTallas(prev => prev.map((dt, i) => i === idx ? { ...dt, cantidad_dividir: val } : dt));
              }}
              className="h-8 text-sm text-center" data-testid={`input-division-${t.talla_nombre}`} />
          </div>
        ))}
        <div className="border-t pt-2 flex justify-between text-sm">
          <span className="font-medium">Total a dividir:</span>
          <span className="font-bold text-blue-600">{divisionTallas.reduce((s, t) => s + t.cantidad_dividir, 0)} prendas</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="font-medium">Queda en este lote:</span>
          <span className="font-bold">{divisionTallas.reduce((s, t) => s + (t.cantidad_disponible - t.cantidad_dividir), 0)} prendas</span>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
        <Button onClick={onDividir} disabled={divisionTallas.every(t => t.cantidad_dividir === 0)} data-testid="btn-confirmar-division">
          <Scissors className="h-4 w-4 mr-2" /> Confirmar División
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

/**
 * Salida de Inventario Dialog
 */
export const SalidaInventarioDialog = ({
  open, onOpenChange, salidaFormData, setSalidaFormData,
  selectedItemInventario, selectedRollo, itemsInventario,
  rollosDisponibles, busquedaItem, setBusquedaItem,
  itemSelectorOpen, setItemSelectorOpen,
  onItemChange, onRolloChange, onCreateSalida, saving,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Nueva Salida de Inventario</DialogTitle>
        <DialogDescription>Registrar una salida de inventario vinculada a este registro</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label>Item de Inventario *</Label>
          <div className="relative">
            <Input placeholder="Buscar item por código o nombre..." value={busquedaItem}
              onChange={(e) => { setBusquedaItem(e.target.value); setItemSelectorOpen(true); }}
              onFocus={() => setItemSelectorOpen(true)} data-testid="search-item-inventario" className="w-full" />
            {salidaFormData.item_id && !busquedaItem && (
              <div className="absolute inset-0 flex items-center px-3 pointer-events-none bg-background rounded-md border">
                <span className="font-mono mr-2 text-sm">{selectedItemInventario?.codigo}</span>
                <span className="text-sm">{selectedItemInventario?.nombre}</span>
                <span className="ml-auto text-xs text-muted-foreground">Stock: {selectedItemInventario?.stock_actual}</span>
              </div>
            )}
            {salidaFormData.item_id && !busquedaItem && (
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground z-10"
                onClick={() => { setSalidaFormData({ ...salidaFormData, item_id: '', rollo_id: '' }); setBusquedaItem(''); }}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {itemSelectorOpen && busquedaItem !== undefined && (
            <div className="border rounded-lg max-h-[200px] overflow-y-auto bg-background shadow-md" onWheel={(e) => e.stopPropagation()}>
              {itemsInventario
                .filter(item => {
                  const cat = (item.categoria || item.tipo_item || '').toLowerCase();
                  if (cat === 'servicios' || cat === 'servicio') return false;
                  if (!busquedaItem) return true;
                  const q = busquedaItem.toLowerCase();
                  return (item.codigo || '').toLowerCase().includes(q) || (item.nombre || '').toLowerCase().includes(q);
                })
                .map((item) => (
                  <div key={item.id} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/60 cursor-pointer text-sm transition-colors"
                    onClick={() => { onItemChange(item.id); setBusquedaItem(''); setItemSelectorOpen(false); }} data-testid={`item-option-${item.id}`}>
                    <span className="font-mono text-xs shrink-0">{item.codigo}</span>
                    <span className="truncate">{item.nombre}</span>
                    <span className="ml-auto text-xs text-muted-foreground shrink-0">Stock: {item.stock_actual}</span>
                    {item.control_por_rollos && <span className="text-xs bg-blue-100 text-blue-700 px-1 rounded shrink-0">Rollos</span>}
                  </div>
                ))}
              {itemsInventario.filter(item => {
                const cat = (item.categoria || item.tipo_item || '').toLowerCase();
                if (cat === 'servicios' || cat === 'servicio') return false;
                if (!busquedaItem) return true;
                const q = busquedaItem.toLowerCase();
                return (item.codigo || '').toLowerCase().includes(q) || (item.nombre || '').toLowerCase().includes(q);
              }).length === 0 && (
                <div className="px-3 py-4 text-center text-sm text-muted-foreground">No se encontraron items</div>
              )}
            </div>
          )}
          {selectedItemInventario && !selectedItemInventario.control_por_rollos && (
            <p className="text-sm text-muted-foreground">Stock disponible: <span className="font-mono font-semibold">{selectedItemInventario.stock_actual}</span> {selectedItemInventario.unidad_medida}</p>
          )}
        </div>

        {selectedItemInventario?.control_por_rollos && (
          <div className="space-y-2">
            <Label>Rollo *</Label>
            <Select value={salidaFormData.rollo_id} onValueChange={onRolloChange}>
              <SelectTrigger data-testid="select-rollo"><SelectValue placeholder="Seleccionar rollo..." /></SelectTrigger>
              <SelectContent>
                {rollosDisponibles.length === 0 ? (
                  <SelectItem value="none" disabled>No hay rollos disponibles</SelectItem>
                ) : rollosDisponibles.map((rollo) => (
                  <SelectItem key={rollo.id} value={rollo.id}>
                    <span className="font-mono font-semibold">{rollo.numero_rollo}</span>
                    <span className="mx-1">|</span><span>{rollo.tono || 'Sin tono'}</span>
                    <span className="mx-1">|</span><span className="font-mono text-green-600">{rollo.metraje_disponible?.toFixed(2)}m</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedRollo && (
              <div className="p-3 bg-muted/30 rounded-lg text-sm grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">Rollo:</span><span className="font-mono font-semibold ml-2">{selectedRollo.numero_rollo}</span></div>
                <div><span className="text-muted-foreground">Tono:</span><span className="ml-2">{selectedRollo.tono || '-'}</span></div>
                <div><span className="text-muted-foreground">Ancho:</span><span className="font-mono ml-2">{selectedRollo.ancho}cm</span></div>
                <div><span className="text-muted-foreground">Disponible:</span><span className="font-mono font-semibold text-green-600 ml-2">{selectedRollo.metraje_disponible?.toFixed(2)}m</span></div>
              </div>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="cantidad-salida">Cantidad ({selectedItemInventario?.unidad_medida || 'unidad'}) *</Label>
          <NumericInput id="cantidad-salida" min="0.01" step="0.01" max={selectedRollo?.metraje_disponible || selectedItemInventario?.stock_actual || 999999}
            value={salidaFormData.cantidad} onChange={(e) => setSalidaFormData({ ...salidaFormData, cantidad: e.target.value })}
            className="font-mono" data-testid="input-cantidad-salida" />
          {selectedRollo && <p className="text-xs text-muted-foreground">Máximo del rollo: {selectedRollo.metraje_disponible?.toFixed(2)}m</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="observaciones-salida">Observaciones</Label>
          <Textarea id="observaciones-salida" value={salidaFormData.observaciones}
            onChange={(e) => setSalidaFormData({ ...salidaFormData, observaciones: e.target.value })}
            placeholder="Notas adicionales..." rows={2} data-testid="input-observaciones-salida" />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
        <Button onClick={onCreateSalida}
          disabled={saving || !salidaFormData.item_id || salidaFormData.cantidad < 0.01 || (selectedItemInventario?.control_por_rollos && !salidaFormData.rollo_id)}
          data-testid="btn-guardar-salida">
          {saving ? 'Guardando...' : 'Registrar Salida'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export const ReabrirCierreDialog = ({ open, onOpenChange, cierreExistente, onConfirmar, saving }) => {
  const [motivo, setMotivo] = React.useState('');
  const motivoValido = motivo.trim().length >= 5;

  const handleClose = () => { setMotivo(''); onOpenChange(false); };
  const handleConfirmar = async () => { await onConfirmar(motivo.trim()); setMotivo(''); };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-amber-600" />
            Revertir cierre de producción
          </DialogTitle>
          <DialogDescription>
            Esta acción deshace el cierre y restaura el registro a estado editable.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Lo que se revertirá */}
          <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-1.5">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" /> Se revertirán los siguientes cambios:
            </p>
            <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-1 ml-4 list-disc">
              <li>El ingreso de <strong>{cierreExistente?.qty_terminada ?? '—'} prendas</strong> al inventario PT será eliminado</li>
              <li>El stock del artículo PT disminuirá en esa cantidad</li>
              <li>El estado del registro volverá a <strong>Producto Terminado</strong></li>
              <li>Podrás volver a ejecutar el cierre con datos corregidos</li>
            </ul>
          </div>

          {cierreExistente && (
            <div className="rounded-md bg-muted/40 border px-3 py-2 text-xs grid grid-cols-2 gap-x-4 gap-y-0.5">
              <span className="text-muted-foreground">Fecha cierre</span>
              <span className="font-mono">{cierreExistente.fecha ? new Date(cierreExistente.fecha).toLocaleDateString('es-PE', { timeZone: 'America/Lima' }) : '—'}</span>
              <span className="text-muted-foreground">Costo Total</span>
              <span className="font-mono">{cierreExistente.costo_total != null ? `S/ ${parseFloat(cierreExistente.costo_total).toFixed(2)}` : '—'}</span>
              <span className="text-muted-foreground">PT Nombre</span>
              <span className="truncate">{cierreExistente.pt_nombre || '—'}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="motivo-reabrir" className="text-sm">
              Motivo de la reversión <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="motivo-reabrir"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: Error en cantidad de prendas terminadas, costo de insumo incorrecto..."
              rows={3}
              className={`text-sm ${!motivoValido && motivo.length > 0 ? 'border-red-400' : ''}`}
            />
            {!motivoValido && motivo.length > 0 && (
              <p className="text-xs text-red-500">Mínimo 5 caracteres</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={saving}>Cancelar</Button>
          <Button
            variant="destructive"
            onClick={handleConfirmar}
            disabled={!motivoValido || saving}
            data-testid="btn-confirmar-reabrir">
            {saving ? 'Revirtiendo...' : <><RotateCcw className="h-4 w-4 mr-1.5" /> Revertir cierre</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
