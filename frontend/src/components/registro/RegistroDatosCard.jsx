import React from 'react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Checkbox } from '../ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../ui/command';
import { AlertTriangle, Scissors, Package, Check, ChevronsUpDown, FileDown, Lock, RotateCcw, Clock, PenLine, Plus } from 'lucide-react';
import { Textarea } from '../ui/textarea';

// Helper: campo con selector + fallback texto libre
const CampoCascada = ({ label, items, idKey = 'id', nameKey = 'nombre', selectedId, texto, modo, onChange }) => {
  if (modo === 'text') {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label className="text-xs">{label}</Label>
          <Button type="button" variant="ghost" size="sm" className="h-5 px-1 text-[10px] text-blue-600"
            onClick={() => onChange({ modo: 'select', id: '', texto: '' })}>
            Volver a selector
          </Button>
        </div>
        <Input value={texto} onChange={(e) => onChange({ modo: 'text', id: '', texto: e.target.value })}
          placeholder={`Escribir ${label.toLowerCase()}...`} className="text-sm" />
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <Button type="button" variant="ghost" size="sm" className="h-5 px-1 text-[10px] text-blue-600 gap-1"
          onClick={() => onChange({ modo: 'text', id: '', texto: '' })}>
          <Plus className="h-3 w-3" /> Texto libre
        </Button>
      </div>
      <Select value={selectedId} onValueChange={(v) => onChange({ modo: 'select', id: v, texto: '' })}>
        <SelectTrigger className="text-sm"><SelectValue placeholder={`Seleccionar ${label.toLowerCase()}...`} /></SelectTrigger>
        <SelectContent className="max-h-60">
          {items.map((item) => (
            <SelectItem key={item[idKey]} value={item[idKey]}>{item[nameKey]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export const RegistroDatosCard = ({
  formData, setFormData,
  divisionInfo, navigate,
  esCierreable, cierreExistente, cierrePreview, cierreLoading, ejecutandoCierre,
  onEjecutarCierre, onDescargarBalancePDF, onReabrirCierre,
  observacionCierre, setObservacionCierre,
  modelos, modeloPopoverOpen, setModeloPopoverOpen, modeloSearch, setModeloSearch, onModeloChange,
  lineasNegocio, itemsInventario, modeloSeleccionado,
  onReunificar, isEditing, hilosEspecificos,
  modoManual, setModoManual,
  modeloManualForm, setModeloManualForm,
  catalogoMarcas = [], catalogoTipos = [], catalogoTelas = [], catalogoEntalles = [],
}) => {
  const handleToggleManual = () => {
    if (!modoManual) {
      setModoManual(true);
      setFormData({ ...formData, modelo_id: '' });
    } else {
      setModoManual(false);
      setModeloManualForm({
        marca_id: '', marca_texto: '', marca_modo: 'select',
        tipo_id: '', tipo_texto: '', tipo_modo: 'select',
        tela_id: '', tela_texto: '', tela_modo: 'select',
        entalle_id: '', entalle_texto: '', entalle_modo: 'select',
        nombre_modelo: '', hilo: '', hilo_especifico: '',
      });
    }
  };

  const updateManualField = (field, { modo, id, texto }) => {
    setModeloManualForm(prev => ({
      ...prev,
      [`${field}_modo`]: modo,
      [`${field}_id`]: id,
      [`${field}_texto`]: texto,
    }));
  };
  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Datos del Registro</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        {/* Banner de división de lote */}
        {divisionInfo && (divisionInfo.es_hijo || divisionInfo.hijos.length > 0) && (
          <div className="rounded-lg border border-blue-300 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-700 p-3 space-y-2" data-testid="division-banner">
            <div className="flex items-center gap-2">
              <Scissors className="h-4 w-4 text-blue-600 shrink-0" />
              <span className="text-sm font-medium text-blue-800 dark:text-blue-300">
                {divisionInfo.es_hijo
                  ? `Dividido desde Corte ${divisionInfo.padre?.n_corte}`
                  : `Lote con ${divisionInfo.hijos.length} división(es)`}
              </span>
            </div>
            {divisionInfo.es_hijo && divisionInfo.padre && (
              <div className="ml-6 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Registro padre:</span>
                <Button variant="link" size="sm" className="h-5 px-0 text-xs text-blue-600"
                  onClick={() => navigate(`/registros/editar/${divisionInfo.padre.id}`, { state: { fromRegistro: formData.n_corte } })} data-testid="link-padre">
                  Corte {divisionInfo.padre.n_corte} ({divisionInfo.padre.estado})
                </Button>
              </div>
            )}
            {divisionInfo.hijos.length > 0 && divisionInfo.hijos.map(h => {
              const totalHijo = (h.tallas || []).reduce((s, t) => s + (t.cantidad || 0), 0);
              return (
                <div key={h.id} className="ml-6 flex items-center gap-2">
                  <Button variant="link" size="sm" className="h-5 px-0 text-xs text-blue-600" onClick={() => navigate(`/registros/editar/${h.id}`, { state: { fromRegistro: formData.n_corte } })}>
                    Corte {h.n_corte}
                  </Button>
                  <Badge variant="outline" className="text-[10px]">{h.estado}</Badge>
                  <span className="text-[10px] text-muted-foreground">{totalHijo} prendas</span>
                  <Button variant="ghost" size="sm" className="h-5 px-1 text-[10px] text-red-600 hover:text-red-700"
                    onClick={() => onReunificar(h.id)} title="Reunificar con este lote" data-testid={`btn-reunificar-${h.id}`}>
                    Reunificar
                  </Button>
                </div>
              );
            })}
            {divisionInfo.hermanos.length > 0 && (
              <div className="ml-6 text-xs text-muted-foreground">
                Hermanos: {divisionInfo.hermanos.map(h => (
                  <Button key={h.id} variant="link" size="sm" className="h-5 px-1 text-xs text-blue-600" onClick={() => navigate(`/registros/editar/${h.id}`, { state: { fromRegistro: formData.n_corte } })}>
                    {h.n_corte}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Panel de Cierre de Produccion */}
        {esCierreable && (
          <div className="rounded-lg border-2 border-green-500/40 bg-green-50 dark:bg-green-950/20 p-5 space-y-4" data-testid="cierre-panel">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-green-500/15 flex items-center justify-center shrink-0">
                <Package className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-green-800 dark:text-green-400">Cierre de Produccion</h3>
                <p className="text-xs text-green-600 dark:text-green-500">Cierre oficial con costos congelados y auditoria.</p>
              </div>
            </div>

            {cierreExistente && cierreExistente.estado_cierre === 'CERRADO' ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Badge className="bg-green-600 text-white gap-1 text-xs" data-testid="badge-cerrado">
                    <Lock className="h-3 w-3" /> CERRADO
                  </Badge>
                  {cierreExistente.cerrado_por && (
                    <span className="text-[10px] text-muted-foreground">
                      por {cierreExistente.cerrado_por} | {cierreExistente.fecha}
                    </span>
                  )}
                </div>
                {/* Desglose congelado */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  <div className="rounded-md bg-white dark:bg-zinc-900 p-2.5 text-center border">
                    <p className="text-[9px] uppercase text-muted-foreground">Costo MP</p>
                    <p className="text-sm font-bold font-mono">S/ {parseFloat(cierreExistente.costo_mp || 0).toFixed(2)}</p>
                  </div>
                  <div className="rounded-md bg-white dark:bg-zinc-900 p-2.5 text-center border">
                    <p className="text-[9px] uppercase text-muted-foreground">Servicios</p>
                    <p className="text-sm font-bold font-mono">S/ {parseFloat(cierreExistente.costo_servicios || 0).toFixed(2)}</p>
                  </div>
                  <div className="rounded-md bg-white dark:bg-zinc-900 p-2.5 text-center border">
                    <p className="text-[9px] uppercase text-muted-foreground">Otros</p>
                    <p className="text-sm font-bold font-mono">S/ {parseFloat(cierreExistente.otros_costos || 0).toFixed(2)}</p>
                  </div>
                  <div className="rounded-md bg-white dark:bg-zinc-900 p-2.5 text-center border border-green-400">
                    <p className="text-[9px] uppercase text-muted-foreground">Total Final</p>
                    <p className="text-base font-bold font-mono text-green-700">S/ {parseFloat(cierreExistente.costo_total || 0).toFixed(2)}</p>
                  </div>
                  <div className="rounded-md bg-white dark:bg-zinc-900 p-2.5 text-center border border-green-400">
                    <p className="text-[9px] uppercase text-muted-foreground">Unitario Final</p>
                    <p className="text-base font-bold font-mono text-green-700">S/ {parseFloat(cierreExistente.costo_unitario_final || cierreExistente.costo_unit_pt || 0).toFixed(4)}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                  <div><span className="text-muted-foreground">Qty Terminada:</span> <span className="font-mono font-semibold">{cierreExistente.qty_terminada}</span></div>
                  <div><span className="text-muted-foreground">Merma:</span> <span className="font-mono font-semibold text-amber-600">{cierreExistente.merma_qty || 0}</span></div>
                  <div><span className="text-muted-foreground">PT:</span> <span className="font-mono">{cierreExistente.pt_nombre || '-'}</span></div>
                </div>
                {cierreExistente.observacion_cierre && (
                  <div className="text-xs bg-white dark:bg-zinc-900 rounded p-2 border">
                    <span className="text-muted-foreground">Observacion: </span>{cierreExistente.observacion_cierre}
                  </div>
                )}
                {/* Historial reapertura */}
                {cierreExistente.motivo_reapertura && (
                  <div className="text-xs bg-amber-50 dark:bg-amber-950/20 rounded p-2 border border-amber-200">
                    <div className="flex items-center gap-1 mb-1">
                      <RotateCcw className="h-3 w-3 text-amber-600" />
                      <span className="font-medium text-amber-700">Historial de reapertura</span>
                    </div>
                    <p className="text-muted-foreground">
                      Reabierto por <span className="font-medium">{cierreExistente.reabierto_por}</span> el {cierreExistente.reabierto_at ? new Date(cierreExistente.reabierto_at).toLocaleDateString('es-PE') : '-'}
                    </p>
                    <p>Motivo: {cierreExistente.motivo_reapertura}</p>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={onDescargarBalancePDF} data-testid="btn-descargar-balance-pdf">
                    <FileDown className="h-4 w-4 mr-2" /> Balance PDF
                  </Button>
                  {onReabrirCierre && (
                    <Button type="button" variant="outline" className="text-amber-600 border-amber-300 hover:bg-amber-50"
                      onClick={onReabrirCierre} data-testid="btn-reabrir-cierre">
                      <RotateCcw className="h-4 w-4 mr-2" /> Reabrir
                    </Button>
                  )}
                </div>
              </div>
            ) : cierreExistente && cierreExistente.estado_cierre === 'REABIERTO' ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-amber-400 text-amber-700 gap-1 text-xs" data-testid="badge-reabierto">
                    <RotateCcw className="h-3 w-3" /> REABIERTO
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    por {cierreExistente.reabierto_por} | {cierreExistente.reabierto_at ? new Date(cierreExistente.reabierto_at).toLocaleDateString('es-PE') : '-'}
                  </span>
                </div>
                <div className="text-xs bg-amber-50 dark:bg-amber-950/20 rounded p-2 border border-amber-200">
                  <p className="text-muted-foreground">Motivo: {cierreExistente.motivo_reapertura}</p>
                </div>
                <p className="text-sm text-muted-foreground">Puede volver a ejecutar el cierre con los costos actualizados.</p>
                {/* Mostrar preview si existe */}
                {cierrePreview && (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                      <div className="rounded-md bg-white dark:bg-zinc-900 p-2.5 text-center border">
                        <p className="text-[9px] uppercase text-muted-foreground">Costo MP</p>
                        <p className="text-sm font-bold font-mono">S/ {cierrePreview.costo_mp.toFixed(2)}</p>
                      </div>
                      <div className="rounded-md bg-white dark:bg-zinc-900 p-2.5 text-center border">
                        <p className="text-[9px] uppercase text-muted-foreground">Servicios</p>
                        <p className="text-sm font-bold font-mono">S/ {cierrePreview.costo_servicios.toFixed(2)}</p>
                      </div>
                      <div className="rounded-md bg-white dark:bg-zinc-900 p-2.5 text-center border">
                        <p className="text-[9px] uppercase text-muted-foreground">Otros</p>
                        <p className="text-sm font-bold font-mono">S/ {(cierrePreview.otros_costos || 0).toFixed(2)}</p>
                      </div>
                      <div className="rounded-md bg-white dark:bg-zinc-900 p-2.5 text-center border border-green-300">
                        <p className="text-[9px] uppercase text-muted-foreground">Total</p>
                        <p className="text-base font-bold font-mono text-green-700">S/ {(cierrePreview.costo_total_final || cierrePreview.costo_total).toFixed(2)}</p>
                      </div>
                      <div className="rounded-md bg-white dark:bg-zinc-900 p-2.5 text-center border border-green-300">
                        <p className="text-[9px] uppercase text-muted-foreground">Unitario</p>
                        <p className="text-base font-bold font-mono text-green-700">S/ {(cierrePreview.costo_unitario_final || cierrePreview.costo_unit_pt).toFixed(4)}</p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Observacion de cierre</Label>
                      <Textarea placeholder="Observacion opcional..." value={observacionCierre || ''}
                        onChange={(e) => setObservacionCierre(e.target.value)} className="text-sm h-16" data-testid="textarea-observacion-cierre" />
                    </div>
                    <Button type="button" className="w-full h-11 bg-green-600 hover:bg-green-700"
                      disabled={ejecutandoCierre} onClick={onEjecutarCierre} data-testid="btn-ejecutar-cierre">
                      {ejecutandoCierre ? 'Ejecutando cierre...' : 'Re-ejecutar Cierre de Produccion'}
                    </Button>
                  </>
                )}
              </div>
            ) : cierreLoading ? (
              <div className="text-center py-4 text-green-600">Calculando costos...</div>
            ) : cierrePreview ? (
              <>
                {/* Errores de validacion */}
                {cierrePreview.errores_validacion && cierrePreview.errores_validacion.length > 0 && (
                  <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 rounded p-3 space-y-1">
                    {cierrePreview.errores_validacion.map((err, i) => (
                      <p key={i} className="text-xs text-red-600 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 shrink-0" /> {err}
                      </p>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="rounded-md bg-white dark:bg-zinc-900 p-3 text-center border">
                    <p className="text-[10px] uppercase text-muted-foreground">Costo MP</p>
                    <p className="text-base font-bold font-mono">S/ {cierrePreview.costo_mp.toFixed(2)}</p>
                  </div>
                  <div className="rounded-md bg-white dark:bg-zinc-900 p-3 text-center border">
                    <p className="text-[10px] uppercase text-muted-foreground">Servicios</p>
                    <p className="text-base font-bold font-mono">S/ {cierrePreview.costo_servicios.toFixed(2)}</p>
                  </div>
                  <div className="rounded-md bg-white dark:bg-zinc-900 p-3 text-center border">
                    <p className="text-[10px] uppercase text-muted-foreground">Otros Costos</p>
                    <p className="text-base font-bold font-mono">S/ {(cierrePreview.otros_costos || 0).toFixed(2)}</p>
                  </div>
                  <div className="rounded-md bg-white dark:bg-zinc-900 p-3 text-center border border-green-300">
                    <p className="text-[10px] uppercase text-muted-foreground">Total Final</p>
                    <p className="text-lg font-bold font-mono text-green-700">S/ {(cierrePreview.costo_total_final || cierrePreview.costo_total).toFixed(2)}</p>
                  </div>
                  <div className="rounded-md bg-white dark:bg-zinc-900 p-3 text-center border border-green-300">
                    <p className="text-[10px] uppercase text-muted-foreground">Unitario Final</p>
                    <p className="text-lg font-bold font-mono text-green-700">S/ {(cierrePreview.costo_unitario_final || cierrePreview.costo_unit_pt).toFixed(4)}</p>
                  </div>
                </div>
                {cierrePreview.merma_qty > 0 && (
                  <p className="text-xs text-amber-600 text-center">Mermas registradas: {cierrePreview.merma_qty} prendas</p>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">Observacion de cierre</Label>
                  <Textarea placeholder="Observacion opcional..." value={observacionCierre || ''}
                    onChange={(e) => setObservacionCierre(e.target.value)} className="text-sm h-16" data-testid="textarea-observacion-cierre" />
                </div>
                {!cierrePreview.puede_cerrar && (
                  <p className="text-sm text-amber-600 text-center">
                    {!formData.pt_item_id ? 'Falta asignar un Articulo PT para poder cerrar.' : 'No hay prendas registradas.'}
                  </p>
                )}
                <Button type="button" className="w-full h-12 text-base bg-green-600 hover:bg-green-700"
                  disabled={!cierrePreview.puede_cerrar || ejecutandoCierre} onClick={onEjecutarCierre} data-testid="btn-ejecutar-cierre">
                  {ejecutandoCierre ? 'Ejecutando cierre...' : 'Ejecutar Cierre de Produccion'}
                </Button>
              </>
            ) : null}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="n_corte">N° Corte *</Label>
            <Input id="n_corte" value={formData.n_corte} onChange={(e) => setFormData({ ...formData, n_corte: e.target.value })}
              placeholder="Número de corte" required className="font-mono" data-testid="input-n-corte" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="curva">Curva</Label>
            <Input id="curva" value={formData.curva} onChange={(e) => setFormData({ ...formData, curva: e.target.value })}
              placeholder="Curva" className="font-mono" data-testid="input-curva" />
          </div>
          <div className="space-y-2">
            <Label>Modelo *</Label>
            {!modoManual ? (
              <>
                <Popover open={modeloPopoverOpen} onOpenChange={(open) => { setModeloPopoverOpen(open); if (!open) setModeloSearch(''); }}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" aria-expanded={modeloPopoverOpen} className="w-full justify-between font-normal" data-testid="select-modelo">
                      {modelos.length === 0
                        ? <span className="flex items-center gap-2 text-muted-foreground"><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Cargando modelos...</span>
                        : (formData.modelo_id ? modelos.find(m => m.id === formData.modelo_id)?.nombre || 'Seleccionar modelo' : 'Seleccionar modelo')
                      }
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput placeholder="Buscar modelo..." value={modeloSearch} onValueChange={setModeloSearch} />
                      <CommandList>
                        {modelos.length === 0 ? (
                          <div className="py-6 text-center text-sm text-muted-foreground">Cargando modelos...</div>
                        ) : (() => {
                          const term = modeloSearch.toLowerCase();
                          const filtered = term ? modelos.filter(m => m.nombre.toLowerCase().includes(term)) : modelos;
                          const limited = filtered.slice(0, 50);
                          if (limited.length === 0) return <CommandEmpty>No se encontró modelo.</CommandEmpty>;
                          return (
                            <CommandGroup>
                              {limited.map((m) => (
                                <CommandItem key={m.id} value={m.id} onSelect={() => { onModeloChange(m.id); setModeloPopoverOpen(false); setModeloSearch(''); }}>
                                  <Check className={`mr-2 h-4 w-4 ${formData.modelo_id === m.id ? 'opacity-100' : 'opacity-0'}`} />
                                  {m.nombre}
                                </CommandItem>
                              ))}
                              {filtered.length > 50 && (
                                <div className="px-2 py-1.5 text-xs text-muted-foreground text-center">+{filtered.length - 50} más. Escribe para filtrar...</div>
                              )}
                            </CommandGroup>
                          );
                        })()}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs text-blue-600 gap-1"
                  onClick={handleToggleManual}>
                  <PenLine className="h-3 w-3" /> No encuentras el modelo? Ingresar manualmente
                </Button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs border-amber-400 text-amber-700 bg-amber-50 gap-1">
                  <PenLine className="h-3 w-3" /> Modo Manual
                </Badge>
                <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs"
                  onClick={handleToggleManual}>
                  Volver a selector de modelo
                </Button>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>Línea de Negocio</Label>
            {formData.linea_negocio_id ? (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs" data-testid="badge-linea-negocio">
                  {lineasNegocio.find(l => l.id === formData.linea_negocio_id)?.nombre || `Línea #${formData.linea_negocio_id}`}
                </Badge>
                <span className="text-[10px] text-muted-foreground">Heredada del modelo</span>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Global (sin línea asignada)</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Artículo PT (Producto Terminado)</Label>
            {modeloSeleccionado?.pt_item_id && formData.pt_item_id === modeloSeleccionado.pt_item_id && (
              <p className="text-xs text-green-600">Auto-completado desde el modelo</p>
            )}
            <Select value={formData.pt_item_id || ""} onValueChange={(value) => setFormData({ ...formData, pt_item_id: value === "none" ? "" : value })}>
              <SelectTrigger data-testid="select-pt-item"><SelectValue placeholder="Seleccionar artículo PT" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin artículo PT</SelectItem>
                {itemsInventario.filter(i => i.tipo_item === 'PT').map((item) => (
                  <SelectItem key={item.id} value={item.id}>{item.codigo} - {item.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Campos cascada modo manual */}
        {modoManual && modeloManualForm && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:bg-amber-950/10 p-4 space-y-3" data-testid="panel-modelo-manual">
            <p className="text-xs font-medium text-amber-800 dark:text-amber-400 flex items-center gap-1">
              <PenLine className="h-3.5 w-3.5" /> Datos del modelo (ingreso manual)
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <CampoCascada label="Marca" items={catalogoMarcas}
                selectedId={modeloManualForm.marca_id} texto={modeloManualForm.marca_texto}
                modo={modeloManualForm.marca_modo}
                onChange={(v) => updateManualField('marca', v)} />
              <CampoCascada label="Tipo" items={catalogoTipos}
                selectedId={modeloManualForm.tipo_id} texto={modeloManualForm.tipo_texto}
                modo={modeloManualForm.tipo_modo}
                onChange={(v) => updateManualField('tipo', v)} />
              <CampoCascada label="Tela" items={catalogoTelas}
                selectedId={modeloManualForm.tela_id} texto={modeloManualForm.tela_texto}
                modo={modeloManualForm.tela_modo}
                onChange={(v) => updateManualField('tela', v)} />
              <CampoCascada label="Entalle" items={catalogoEntalles}
                selectedId={modeloManualForm.entalle_id} texto={modeloManualForm.entalle_texto}
                modo={modeloManualForm.entalle_modo}
                onChange={(v) => updateManualField('entalle', v)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nombre del modelo</Label>
              <Input value={modeloManualForm.nombre_modelo}
                onChange={(e) => setModeloManualForm({ ...modeloManualForm, nombre_modelo: e.target.value })}
                placeholder="Ej: Pantalón Cargo Ripstop 2022" className="text-sm" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Hilo</Label>
                <Input value={modeloManualForm.hilo}
                  onChange={(e) => setModeloManualForm({ ...modeloManualForm, hilo: e.target.value })}
                  placeholder="Hilo..." className="text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Hilo específico</Label>
                <Input value={modeloManualForm.hilo_especifico}
                  onChange={(e) => setModeloManualForm({ ...modeloManualForm, hilo_especifico: e.target.value })}
                  placeholder="Hilo específico..." className="text-sm" />
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center space-x-2 pt-2">
          <Checkbox id="urgente" checked={formData.urgente} onCheckedChange={(checked) => setFormData({ ...formData, urgente: checked })} data-testid="checkbox-urgente" />
          <Label htmlFor="urgente" className="flex items-center gap-2 cursor-pointer">
            <AlertTriangle className="h-4 w-4 text-destructive" /> Marcar como Urgente
          </Label>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="fecha_inicio_real">Fecha Inicio Real</Label>
            <Input id="fecha_inicio_real" type="date" value={formData.fecha_inicio_real}
              onChange={(e) => setFormData({ ...formData, fecha_inicio_real: e.target.value })} data-testid="input-fecha-inicio-real" />
            <p className="text-xs text-muted-foreground">
              Fecha fisica de inicio del lote. Afecta el calculo del CIF.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="fecha_entrega_final">Fecha Entrega Final</Label>
            <Input id="fecha_entrega_final" type="date" value={formData.fecha_entrega_final}
              onChange={(e) => setFormData({ ...formData, fecha_entrega_final: e.target.value })} data-testid="input-fecha-entrega-final" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
