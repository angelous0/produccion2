import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../ui/command';
import { Separator } from '../ui/separator';
import { toast } from 'sonner';
import {
  Package, Link2, Unlink, Search, Plus, Trash2, Save,
  CheckCircle2, AlertTriangle, Clock, CircleDot, Loader2, Activity
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const TIPOS_SALIDA = [
  { value: 'normal', label: 'Normal' },
  { value: 'arreglo', label: 'Arreglo' },
  { value: 'liquidacion_leve', label: 'Liquidacion Leve' },
  { value: 'liquidacion_grave', label: 'Liquidacion Grave' },
];

const EstadoBadge = ({ estado }) => {
  const config = {
    COMPLETO: { className: 'bg-emerald-100 text-emerald-800 border-emerald-300', icon: CheckCircle2 },
    PARCIAL: { className: 'bg-amber-100 text-amber-800 border-amber-300', icon: AlertTriangle },
    PENDIENTE: { className: 'bg-red-100 text-red-800 border-red-300', icon: Clock },
    SIN_DISTRIBUCION: { className: 'bg-slate-100 text-slate-600 border-slate-300', icon: CircleDot },
  };
  const c = config[estado] || config.SIN_DISTRIBUCION;
  const Icon = c.icon;
  return (
    <Badge variant="outline" className={`${c.className} text-xs font-medium gap-1`} data-testid={`badge-estado-${estado}`}>
      <Icon className="h-3 w-3" /> {estado}
    </Badge>
  );
};

const ProductoSelector = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(async () => {
      try {
        const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
        const res = await axios.get(`${API}/odoo/product-templates?search=${encodeURIComponent(search)}&limit=20`, { headers });
        setOptions(res.data);
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, open]);

  useEffect(() => {
    if (value && !selected) {
      const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
      axios.get(`${API}/odoo/product-templates?search=${value}&limit=5`, { headers })
        .then(res => {
          const found = res.data.find(p => p.odoo_id === value);
          if (found) setSelected(found);
        }).catch(() => {});
    }
  }, [value, selected]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-start text-xs font-normal h-8 truncate" data-testid="btn-select-producto">
          {selected ? `${selected.name} (${selected.odoo_id})` : 'Seleccionar producto...'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Buscar por nombre o ID..." value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>Sin resultados</CommandEmpty>
            <CommandGroup>
              {options.map(p => (
                <CommandItem key={p.odoo_id} value={String(p.odoo_id)}
                  onSelect={() => { setSelected(p); onChange(p.odoo_id); setOpen(false); }}>
                  <div className="flex flex-col">
                    <span className="text-xs font-medium">{p.name}</span>
                    <span className="text-[10px] text-muted-foreground">{p.marca} | {p.tipo} | ID: {p.odoo_id}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export const DistribucionPTPanel = ({ registroId }) => {
  const [distribucion, setDistribucion] = useState(null);
  const [vinculos, setVinculos] = useState([]);
  const [conciliacion, setConciliacion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Lineas editables locales
  const [lineas, setLineas] = useState([]);
  const [dirty, setDirty] = useState(false);

  // Buscador ajustes
  const [ajustesDisponibles, setAjustesDisponibles] = useState([]);
  const [ajusteSearch, setAjusteSearch] = useState('');
  const [ajustePopoverOpen, setAjustePopoverOpen] = useState(false);
  const [vinculando, setVinculando] = useState(false);
  const [desvinculando, setDesvinculando] = useState(null);
  const [trazabilidad, setTrazabilidad] = useState(null);

  const getAuthHeader = useCallback(() => {
    return { Authorization: `Bearer ${localStorage.getItem('token')}` };
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const headers = getAuthHeader();
      const [distRes, vincRes, concRes, trazRes] = await Promise.all([
        axios.get(`${API}/registros/${registroId}/distribucion-pt`, { headers }),
        axios.get(`${API}/registros/${registroId}/vinculos-odoo`, { headers }),
        axios.get(`${API}/registros/${registroId}/conciliacion-odoo`, { headers }),
        axios.get(`${API}/registros/${registroId}/resumen-cantidades`, { headers }).catch(() => ({ data: null })),
      ]);
      setDistribucion(distRes.data);
      setVinculos(vincRes.data);
      setConciliacion(concRes.data);
      setTrazabilidad(trazRes.data);
      setLineas(distRes.data.lineas.map(l => ({
        tipo_salida: l.tipo_salida,
        product_template_id_odoo: l.product_template_id_odoo,
        cantidad: l.cantidad,
        producto_nombre: l.producto_nombre,
      })));
      setDirty(false);
    } catch (err) {
      toast.error('Error cargando datos de distribucion PT');
    } finally {
      setLoading(false);
    }
  }, [registroId, getAuthHeader]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Buscar ajustes disponibles
  useEffect(() => {
    if (!ajustePopoverOpen) return;
    const timer = setTimeout(async () => {
      try {
        const res = await axios.get(
          `${API}/odoo/stock-inventories?solo_produccion=true&search=${encodeURIComponent(ajusteSearch)}&limit=30`,
          { headers: getAuthHeader() }
        );
        setAjustesDisponibles(res.data);
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(timer);
  }, [ajusteSearch, ajustePopoverOpen, getAuthHeader]);

  const addLinea = () => {
    setLineas(prev => [...prev, { tipo_salida: 'normal', product_template_id_odoo: null, cantidad: 0 }]);
    setDirty(true);
  };

  const removeLinea = (idx) => {
    setLineas(prev => prev.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const updateLinea = (idx, field, value) => {
    setLineas(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
    setDirty(true);
  };

  const totalDistribuido = lineas.reduce((s, l) => s + (parseFloat(l.cantidad) || 0), 0);
  const totalProducido = distribucion?.total_producido || 0;
  const cuadra = Math.abs(totalDistribuido - totalProducido) < 0.01;

  const guardarDistribucion = async () => {
    const invalidas = lineas.filter(l => !l.product_template_id_odoo || l.cantidad <= 0);
    if (invalidas.length) {
      toast.error('Todas las lineas deben tener producto y cantidad > 0');
      return;
    }
    if (!cuadra) {
      toast.error(`El total (${totalDistribuido}) no coincide con el producido (${totalProducido})`);
      return;
    }
    setSaving(true);
    try {
      await axios.post(`${API}/registros/${registroId}/distribucion-pt`, {
        lineas: lineas.map(l => ({
          tipo_salida: l.tipo_salida,
          product_template_id_odoo: l.product_template_id_odoo,
          cantidad: parseFloat(l.cantidad),
        }))
      }, { headers: getAuthHeader() });
      toast.success('Distribucion guardada correctamente');
      await fetchAll();
    } catch (err) {
      toast.error(typeof err.response?.data?.detail === 'string' ? err.response?.data?.detail : 'Error al guardar distribucion');
    } finally {
      setSaving(false);
    }
  };

  const vincularAjuste = async (odooId) => {
    if (vinculando) return;
    setVinculando(true);
    try {
      await axios.post(`${API}/registros/${registroId}/vinculos-odoo`,
        { stock_inventory_odoo_id: odooId }, { headers: getAuthHeader() });
      toast.success('Ajuste vinculado');
      setAjustePopoverOpen(false);
      await fetchAll();
    } catch (err) {
      toast.error(typeof err.response?.data?.detail === 'string' ? err.response?.data?.detail : 'Error al vincular ajuste');
    } finally {
      setVinculando(false);
    }
  };

  const desvincularAjuste = async (vinculoId) => {
    if (desvinculando) return;
    setDesvinculando(vinculoId);
    try {
      await axios.delete(`${API}/registros/${registroId}/vinculos-odoo/${vinculoId}`, { headers: getAuthHeader() });
      toast.success('Ajuste desvinculado');
      await fetchAll();
    } catch (err) {
      toast.error('Error al desvincular');
    } finally {
      setDesvinculando(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12" data-testid="pt-loading">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="distribucion-pt-panel">
      {/* Resumen superior */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Producido:</span>
              <span className="font-semibold" data-testid="total-producido">{totalProducido}</span>
            </div>
            <Separator orientation="vertical" className="h-5" />
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Distribuido:</span>
              <span className={`font-semibold ${cuadra ? 'text-emerald-600' : 'text-red-600'}`} data-testid="total-distribuido">
                {totalDistribuido}
              </span>
            </div>
            <Separator orientation="vertical" className="h-5" />
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Ingresado Odoo:</span>
              <span className="font-semibold text-blue-600" data-testid="total-ingresado">
                {conciliacion?.total_ingresado || 0}
              </span>
            </div>
            <Separator orientation="vertical" className="h-5" />
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Pendiente:</span>
              <span className="font-semibold" data-testid="total-pendiente">
                {conciliacion?.total_pendiente || 0}
              </span>
            </div>
            <EstadoBadge estado={conciliacion?.estado || 'SIN_DISTRIBUCION'} />
          </div>
        </CardContent>
      </Card>

      {/* Bloque Trazabilidad del Lote */}
      {trazabilidad && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4" /> Trazabilidad del Lote
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-4 pb-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3" data-testid="trazabilidad-resumen">
              <div className="bg-slate-50 rounded-md px-3 py-2 border">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Inicial</div>
                <div className="text-base font-bold" data-testid="traz-inicial">{trazabilidad.cantidad_inicial || totalProducido}</div>
              </div>
              <div className="bg-emerald-50 rounded-md px-3 py-2 border border-emerald-200">
                <div className="text-[10px] text-emerald-600 uppercase tracking-wider">Terminado OK</div>
                <div className="text-base font-bold text-emerald-700" data-testid="traz-terminado">
                  {(trazabilidad.cantidad_inicial || totalProducido) - trazabilidad.mermas - trazabilidad.fallados_total + trazabilidad.fallados_reparados}
                </div>
              </div>
              {trazabilidad.mermas > 0 && (
                <div className="bg-red-50 rounded-md px-3 py-2 border border-red-200">
                  <div className="text-[10px] text-red-600 uppercase tracking-wider">Mermas</div>
                  <div className="text-base font-bold text-red-700" data-testid="traz-mermas">{trazabilidad.mermas}</div>
                </div>
              )}
              {trazabilidad.fallados_reparados > 0 && (
                <div className="bg-blue-50 rounded-md px-3 py-2 border border-blue-200">
                  <div className="text-[10px] text-blue-600 uppercase tracking-wider">Arreglos Resueltos</div>
                  <div className="text-base font-bold text-blue-700" data-testid="traz-arreglos">{trazabilidad.fallados_reparados}</div>
                </div>
              )}
              {trazabilidad.fallados_liquidados > 0 && (
                <div className="bg-amber-50 rounded-md px-3 py-2 border border-amber-200">
                  <div className="text-[10px] text-amber-600 uppercase tracking-wider">Liquidacion</div>
                  <div className="text-base font-bold text-amber-700" data-testid="traz-liquidacion">{trazabilidad.fallados_liquidados}</div>
                </div>
              )}
              {trazabilidad.fallados_en_arreglo > 0 && (
                <div className="bg-purple-50 rounded-md px-3 py-2 border border-purple-200">
                  <div className="text-[10px] text-purple-600 uppercase tracking-wider">En Arreglo</div>
                  <div className="text-base font-bold text-purple-700" data-testid="traz-en-arreglo">{trazabilidad.fallados_en_arreglo}</div>
                </div>
              )}
              {trazabilidad.fallados_sin_asignar > 0 && (
                <div className="bg-orange-50 rounded-md px-3 py-2 border border-orange-200">
                  <div className="text-[10px] text-orange-600 uppercase tracking-wider">Fallados Pendientes</div>
                  <div className="text-base font-bold text-orange-700" data-testid="traz-fallados-pend">{trazabilidad.fallados_sin_asignar}</div>
                </div>
              )}
              {trazabilidad.segunda > 0 && (
                <div className="bg-yellow-50 rounded-md px-3 py-2 border border-yellow-200">
                  <div className="text-[10px] text-yellow-600 uppercase tracking-wider">Segunda</div>
                  <div className="text-base font-bold text-yellow-700">{trazabilidad.segunda}</div>
                </div>
              )}
              {trazabilidad.descarte > 0 && (
                <div className="bg-gray-50 rounded-md px-3 py-2 border border-gray-300">
                  <div className="text-[10px] text-gray-600 uppercase tracking-wider">Descarte</div>
                  <div className="text-base font-bold text-gray-700">{trazabilidad.descarte}</div>
                </div>
              )}
            </div>
            {trazabilidad.alertas && trazabilidad.alertas.length > 0 && (
              <div className="mt-2 space-y-1">
                {trazabilidad.alertas.map((a, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1">
                    <AlertTriangle className="h-3 w-3 shrink-0" /> {a.mensaje}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Bloque A: Distribucion esperada */}
      <Card>
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Package className="h-4 w-4" /> Distribucion Esperada
            </CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={addLinea} className="h-7 text-xs gap-1" data-testid="btn-add-linea">
              <Plus className="h-3 w-3" /> Agregar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0 px-4 pb-4">
          {lineas.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Sin lineas de distribucion. Agrega una para comenzar.</p>
          ) : (
            <div className="space-y-2">
              {/* Header */}
              <div className="hidden sm:grid grid-cols-[160px_1fr_100px_32px] gap-2 text-[10px] text-muted-foreground font-medium uppercase tracking-wider px-1">
                <span>Tipo Salida</span><span>Producto Odoo</span><span>Cantidad</span><span></span>
              </div>
              {lineas.map((linea, idx) => (
                <div key={idx} className="grid grid-cols-1 sm:grid-cols-[160px_1fr_100px_32px] gap-2 items-center bg-muted/30 rounded-md p-2 sm:p-1"
                  data-testid={`linea-dist-${idx}`}>
                  <Select value={linea.tipo_salida} onValueChange={v => updateLinea(idx, 'tipo_salida', v)}>
                    <SelectTrigger className="h-8 text-xs" data-testid={`select-tipo-${idx}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS_SALIDA.map(t => (
                        <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <ProductoSelector
                    value={linea.product_template_id_odoo}
                    onChange={v => updateLinea(idx, 'product_template_id_odoo', v)}
                  />
                  <Input type="number" min="1" step="1" className="h-8 text-xs"
                    value={linea.cantidad || ''} placeholder="Cant."
                    onChange={e => updateLinea(idx, 'cantidad', e.target.value)}
                    data-testid={`input-cantidad-${idx}`}
                  />
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                    onClick={() => removeLinea(idx)} data-testid={`btn-remove-${idx}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Footer distribucion */}
          {lineas.length > 0 && (
            <div className="flex items-center justify-between mt-3 pt-3 border-t">
              <div className="flex items-center gap-3 text-xs">
                <span>Total: <strong className={cuadra ? 'text-emerald-600' : 'text-red-600'}>{totalDistribuido}</strong> / {totalProducido}</span>
                {cuadra ? (
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 text-[10px]">Cuadra</Badge>
                ) : (
                  <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300 text-[10px]">
                    Diferencia: {(totalDistribuido - totalProducido).toFixed(0)}
                  </Badge>
                )}
              </div>
              <Button type="button" size="sm" onClick={guardarDistribucion} disabled={saving || !cuadra || !dirty}
                className="h-7 text-xs gap-1" data-testid="btn-guardar-distribucion">
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Guardar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bloque B: Ajustes Odoo vinculados */}
      <Card>
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Link2 className="h-4 w-4" /> Ajustes Odoo Vinculados
            </CardTitle>
            <Popover open={ajustePopoverOpen} onOpenChange={setAjustePopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" data-testid="btn-buscar-ajuste">
                  <Search className="h-3 w-3" /> Vincular Ajuste
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[380px] p-0" align="end">
                <Command shouldFilter={false}>
                  <CommandInput placeholder="Buscar ajuste por nombre o ID..." value={ajusteSearch} onValueChange={setAjusteSearch} />
                  <CommandList>
                    <CommandEmpty>Sin ajustes de produccion encontrados</CommandEmpty>
                    <CommandGroup>
                      {ajustesDisponibles.map(a => (
                        <CommandItem key={a.odoo_id} value={String(a.odoo_id)} disabled={!a.disponible || vinculando}
                          onSelect={() => { if (a.disponible && !vinculando) vincularAjuste(a.odoo_id); }}
                          className={!a.disponible || vinculando ? 'opacity-50' : ''}>
                          <div className="flex flex-col flex-1">
                            <span className="text-xs font-medium">{a.name}</span>
                            <span className="text-[10px] text-muted-foreground">
                              ID: {a.odoo_id} | Qty: {a.total_qty} | {a.date ? new Date(a.date).toLocaleDateString('es') : ''}
                            </span>
                          </div>
                          {!a.disponible && (
                            <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-300 shrink-0">
                              Vinculado a otro
                            </Badge>
                          )}
                          {a.disponible && vinculando && (
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </CardHeader>
        <CardContent className="pt-0 px-4 pb-4">
          {vinculos.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Sin ajustes vinculados. Usa el boton "Vincular Ajuste" para agregar.</p>
          ) : (
            <div className="space-y-2">
              {vinculos.map(v => (
                <div key={v.id} className="flex items-center justify-between bg-blue-50/50 border border-blue-200/60 rounded-md px-3 py-2"
                  data-testid={`vinculo-${v.id}`}>
                  <div className="flex flex-col">
                    <span className="text-xs font-medium">{v.ajuste_nombre || `Ajuste #${v.stock_inventory_odoo_id}`}</span>
                    <span className="text-[10px] text-muted-foreground">
                      ID Odoo: {v.stock_inventory_odoo_id} | Qty Total: {v.total_moves_qty} | {v.ajuste_fecha ? new Date(v.ajuste_fecha).toLocaleDateString('es') : ''}
                    </span>
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0"
                    disabled={desvinculando === v.id}
                    onClick={() => desvincularAjuste(v.id)} data-testid={`btn-desvincular-${v.id}`}>
                    {desvinculando === v.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bloque C: Resultado de conciliacion */}
      {conciliacion && conciliacion.detalle.length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Conciliacion
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-4 pb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-xs" data-testid="tabla-conciliacion">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-2 font-medium">Producto</th>
                    <th className="py-2 px-2 font-medium text-right">Esperado</th>
                    <th className="py-2 px-2 font-medium text-right">Ingresado</th>
                    <th className="py-2 px-2 font-medium text-right">Pendiente</th>
                    <th className="py-2 pl-2 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {conciliacion.detalle.map((d, i) => (
                    <tr key={i} className="border-b last:border-0" data-testid={`fila-conc-${i}`}>
                      <td className="py-2 pr-2">
                        <div className="font-medium">{d.producto_nombre}</div>
                        <div className="text-[10px] text-muted-foreground">{d.producto_marca} | ID: {d.product_template_id_odoo}</div>
                      </td>
                      <td className="py-2 px-2 text-right font-medium">{d.esperado}</td>
                      <td className="py-2 px-2 text-right font-medium text-blue-600">{d.ingresado}</td>
                      <td className="py-2 px-2 text-right font-medium">{d.pendiente}</td>
                      <td className="py-2 pl-2"><EstadoBadge estado={d.estado} /></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t font-semibold">
                    <td className="py-2 pr-2">TOTAL</td>
                    <td className="py-2 px-2 text-right">{conciliacion.total_esperado}</td>
                    <td className="py-2 px-2 text-right text-blue-600">{conciliacion.total_ingresado}</td>
                    <td className="py-2 px-2 text-right">{conciliacion.total_pendiente}</td>
                    <td className="py-2 pl-2"><EstadoBadge estado={conciliacion.estado} /></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
