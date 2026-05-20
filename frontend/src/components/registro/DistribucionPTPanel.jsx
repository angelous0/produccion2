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

// IMPORTANTE: el backend valida estos valores. Si agregas uno nuevo (ej. 'facturado_proveedor')
// hay que actualizar también backend/routes/distribucion_pt.py::TIPOS_SALIDA_LABELS y la
// migración que define el CHECK constraint.
const TIPOS_SALIDA = [
  { value: 'normal', label: 'Normal' },
  { value: 'liquidacion_leve', label: 'Liquidación Leve (LQ)' },
  { value: 'liquidacion_grave', label: 'Liquidación Grave' },
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
      // Para hidratar la selección actual permitimos también templates que no
      // cumplan el filtro vendible (por compat con datos legacy).
      axios.get(`${API}/odoo/product-templates?search=${value}&limit=5&incluir_no_vendibles=true`, { headers })
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
                    <span className="text-[10px] text-muted-foreground">
                      {[p.marca, p.tipo, p.entalle].filter(Boolean).join(' | ')} · ID: {p.odoo_id}
                    </span>
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
  const [autoMatching, setAutoMatching] = useState(false);
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
      return { vinculos: vincRes.data, distribucion: distRes.data };
    } catch (err) {
      toast.error('Error cargando datos de distribucion PT');
      return null;
    } finally {
      setLoading(false);
    }
  }, [registroId, getAuthHeader]);

  // ── Auto-match: vincular ajustes con match completo ───────────────
  // Desvincula primero los huérfanos (templates ya no en la distribución)
  // y luego vincula los ajustes disponibles cuyos templates coincidan 100%.
  const runAutoMatch = useCallback(async ({ silent = false } = {}) => {
    if (autoMatching) return;
    setAutoMatching(true);
    let vinculados = 0;
    let desvinculados = 0;
    try {
      const headers = getAuthHeader();

      // 1) Refrescar vínculos para tener templates_match actualizado
      const vincRes = await axios.get(`${API}/registros/${registroId}/vinculos-odoo`, { headers });
      const vincActuales = vincRes.data || [];

      // 2) Desvincular huérfanos: templates_match=0 con templates_total>0
      //    (el corte tiene distribución pero el ajuste ya no mueve ninguno)
      const huerfanos = vincActuales.filter(v => v.templates_total > 0 && v.templates_match === 0);
      for (const v of huerfanos) {
        try {
          await axios.delete(`${API}/registros/${registroId}/vinculos-odoo/${v.id}`, { headers });
          desvinculados += 1;
        } catch { /* ignore */ }
      }

      // 3) Buscar candidatos y vincular los que matchean al menos 1 template del corte.
      //    Match parcial: en la práctica los ajustes Odoo vienen separados por producto
      //    (uno por BONETY, otro por BONETY-LQ, etc.), así que un único ajuste rara vez
      //    cubre toda la distribución. Vinculamos cada uno que toque al menos 1 template
      //    del corte y esté libre.
      const ajustesRes = await axios.get(
        `${API}/odoo/stock-inventories?registro_id=${registroId}&limit=200`,
        { headers }
      );
      const candidatos = (ajustesRes.data || []).filter(a =>
        a.disponible && a.templates_match > 0
      );
      for (const a of candidatos) {
        try {
          await axios.post(`${API}/registros/${registroId}/vinculos-odoo`,
            { stock_inventory_odoo_id: a.odoo_id }, { headers });
          vinculados += 1;
        } catch { /* ignore — probablemente ya vinculado */ }
      }

      if (vinculados > 0 || desvinculados > 0) {
        await fetchAll();
      }
      if (!silent || vinculados > 0 || desvinculados > 0) {
        const partes = [];
        if (vinculados > 0) partes.push(`${vinculados} vinculado${vinculados > 1 ? 's' : ''}`);
        if (desvinculados > 0) partes.push(`${desvinculados} desvinculado${desvinculados > 1 ? 's' : ''}`);
        if (partes.length) {
          toast.success(`Auto-match: ${partes.join(', ')}`);
        } else if (!silent) {
          toast.info('Sin ajustes con match completo disponibles');
        }
      }
    } catch {
      if (!silent) toast.error('Error en auto-match');
    } finally {
      setAutoMatching(false);
    }
  }, [registroId, getAuthHeader, fetchAll, autoMatching]);

  // Carga inicial + auto-match silencioso
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetchAll();
      if (cancelled || !res) return;
      // Solo ejecutar auto-match si el corte tiene distribución declarada
      if ((res.distribucion?.lineas || []).length > 0) {
        runAutoMatch({ silent: true });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registroId]);

  // Buscar ajustes disponibles. Pasamos registro_id para que el backend
  // filtre estricto a los ajustes que mueven al menos uno de los templates
  // declarados en la distribución del corte (cualquier tipo_salida).
  useEffect(() => {
    if (!ajustePopoverOpen) return;
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          search: ajusteSearch,
          limit: '30',
        });
        if (registroId) params.set('registro_id', registroId);
        const res = await axios.get(
          `${API}/odoo/stock-inventories?${params.toString()}`,
          { headers: getAuthHeader() }
        );
        setAjustesDisponibles(res.data);
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(timer);
  }, [ajusteSearch, ajustePopoverOpen, getAuthHeader, registroId]);

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
  const excede = totalDistribuido > totalProducido + 0.01;
  const parcial = !cuadra && !excede && totalDistribuido >= 0;
  const pendiente = Math.max(0, totalProducido - totalDistribuido);

  const guardarDistribucion = async () => {
    // Validaciones cliente: relajamos a (a) sin negativos, (b) sin exceder.
    // Cantidad=0 está permitido (vínculo puro: solo declara template+tipo).
    const sinProducto = lineas.filter(l => !l.product_template_id_odoo);
    if (sinProducto.length) {
      toast.error('Todas las lineas deben tener un producto Odoo seleccionado');
      return;
    }
    const negativas = lineas.filter(l => parseFloat(l.cantidad) < 0);
    if (negativas.length) {
      toast.error('La cantidad no puede ser negativa');
      return;
    }
    if (excede) {
      toast.error(`El total (${totalDistribuido}) excede el producido (${totalProducido})`);
      return;
    }
    setSaving(true);
    try {
      const res = await axios.post(`${API}/registros/${registroId}/distribucion-pt`, {
        lineas: lineas.map(l => ({
          tipo_salida: l.tipo_salida,
          product_template_id_odoo: l.product_template_id_odoo,
          cantidad: parseFloat(l.cantidad),
        }))
      }, { headers: getAuthHeader() });
      toast.success('Distribucion guardada correctamente');

      // Feedback del hook automático de sync: si el sistema detectó que
      // alguna variante 'normal' ya llegó a tienda comercial, lo avisamos
      // explícitamente para que el usuario sepa que el estado/fecha fueron
      // actualizados sin que tenga que ir a otra pantalla.
      const syncCambios = res.data?.sync_tienda || [];
      const cambio = syncCambios[0];
      if (cambio) {
        const fechaStr = cambio.fecha_ingreso
          ? new Date(cambio.fecha_ingreso).toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: 'short' })
          : '';
        if (cambio.accion === 'nuevo') {
          toast.success(`Detectado en ${cambio.tienda_destino} (${fechaStr})`, {
            description: 'Estado actualizado a Tienda · fecha auto-asignada',
          });
        } else if (cambio.accion === 'actualizado') {
          toast.success(`Re-detectado en ${cambio.tienda_destino} (${fechaStr})`, {
            description: 'Fecha actualizada por cambio de template (era auto)',
          });
        } else if (cambio.accion === 'estado_solo_fecha_manual') {
          toast.info(`Estado pasado a Tienda (${cambio.tienda_destino})`, {
            description: 'Fecha manual previa respetada',
          });
        }
      }

      await fetchAll();
      // Re-evaluar matches: si se agregaron/quitaron templates, vincular/desvincular automáticamente.
      runAutoMatch({ silent: true });
    } catch (err) {
      const detail = err.response?.data?.detail;
      let msg = 'Error al guardar distribucion';
      if (typeof detail === 'string') {
        msg = detail;
      } else if (Array.isArray(detail) && detail.length > 0) {
        // FastAPI validación: [{loc: [...], msg: '...', type: '...'}]
        msg = detail.map(d => `${(d.loc || []).slice(-1)[0] || ''}: ${d.msg || d.type || ''}`).filter(Boolean).join(' · ') || msg;
      } else if (detail && typeof detail === 'object' && detail.msg) {
        msg = detail.msg;
      }
      toast.error(msg);
      // Log completo en consola para diagnóstico
      // eslint-disable-next-line no-console
      console.error('[DistribucionPT] error', err.response?.status, err.response?.data);
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
              <span className={`font-semibold ${cuadra ? 'text-emerald-600' : excede ? 'text-red-600' : 'text-amber-600'}`} data-testid="total-distribuido">
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
                  <Input type="number" min="0" step="1" className="h-8 text-xs"
                    value={linea.cantidad === 0 ? 0 : (linea.cantidad || '')}
                    placeholder="Cant. (0 = sólo vincular)"
                    onChange={e => updateLinea(idx, 'cantidad', e.target.value)}
                    data-testid={`input-cantidad-${idx}`}
                    title="Cantidad esperada. Deja 0 si sólo quieres vincular el template para que el sync detecte llegadas a tienda."
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
            <div className="flex items-center justify-between mt-3 pt-3 border-t gap-2 flex-wrap">
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <span>
                  Total:{' '}
                  <strong className={cuadra ? 'text-emerald-600' : excede ? 'text-red-600' : 'text-amber-600'}>
                    {totalDistribuido}
                  </strong>
                  {' / '}{totalProducido}
                </span>
                {cuadra && (
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 text-[10px]">Cuadra</Badge>
                )}
                {excede && (
                  <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300 text-[10px]">
                    Excede en {(totalDistribuido - totalProducido).toFixed(0)}
                  </Badge>
                )}
                {parcial && (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 text-[10px]" title="Puedes guardar parcial y completar después cuando lleguen los arreglos o se confirmen las mermas">
                    Pendiente: {pendiente.toFixed(0)} prendas
                  </Badge>
                )}
                {parcial && pendiente > 0 && (
                  <Button
                    type="button" size="sm" variant="ghost"
                    className="h-6 text-[10px] px-2 text-blue-700 hover:text-blue-900 hover:bg-blue-50"
                    onClick={() => {
                      // Atajo: agrega una línea Normal con el resto pendiente.
                      // Si ya hay una línea Normal sin producto, la rellena;
                      // si no, crea una nueva (el usuario elige el template).
                      setLineas(prev => {
                        const idxVacia = prev.findIndex(l => l.tipo_salida === 'normal' && !l.product_template_id_odoo);
                        if (idxVacia >= 0) {
                          return prev.map((l, i) => i === idxVacia ? { ...l, cantidad: pendiente } : l);
                        }
                        return [...prev, { tipo_salida: 'normal', product_template_id_odoo: null, cantidad: pendiente }];
                      });
                      setDirty(true);
                    }}
                    title="Crea una línea Normal con las prendas pendientes (te falta elegir el template)"
                  >
                    + Completar con Normal
                  </Button>
                )}
              </div>
              <Button type="button" size="sm" onClick={guardarDistribucion} disabled={saving || excede || !dirty}
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
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => runAutoMatch({ silent: false })}
                disabled={autoMatching || lineas.length === 0}
                title={lineas.length === 0 ? 'Declara la distribución para usar auto-match' : 'Vincula todos los ajustes disponibles con match 100%'}
                data-testid="btn-auto-match"
              >
                {autoMatching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Activity className="h-3 w-3" />}
                Vincular todos
              </Button>
              <Popover open={ajustePopoverOpen} onOpenChange={setAjustePopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" data-testid="btn-buscar-ajuste">
                    <Search className="h-3 w-3" /> Vincular Ajuste
                  </Button>
                </PopoverTrigger>
              <PopoverContent className="w-[440px] p-0" align="end">
                <Command shouldFilter={false}>
                  <CommandInput placeholder="Buscar ajuste por nombre o ID..." value={ajusteSearch} onValueChange={setAjusteSearch} />
                  <CommandList>
                    <CommandEmpty>
                      {lineas.length === 0
                        ? 'Primero declara la distribución del corte (templates Odoo) para ver ajustes candidatos.'
                        : 'Sin ajustes de los últimos 120 días que muevan estos templates.'}
                    </CommandEmpty>
                    <CommandGroup>
                      {ajustesDisponibles.map(a => (
                        <CommandItem key={a.odoo_id} value={String(a.odoo_id)} disabled={!a.disponible || vinculando}
                          onSelect={() => { if (a.disponible && !vinculando) vincularAjuste(a.odoo_id); }}
                          className={!a.disponible || vinculando ? 'opacity-50' : ''}>
                          <div className="flex flex-col flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium truncate">{a.name}</span>
                              {a.templates_total > 0 && (
                                <Badge variant="outline" className="text-[9px] shrink-0 bg-blue-50 text-blue-700 border-blue-300">
                                  {a.templates_match}/{a.templates_total} match
                                </Badge>
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground">
                              ID: {a.odoo_id} · {a.date ? new Date(a.date).toLocaleDateString('es-PE', { timeZone: 'America/Lima' }) : ''} · Total: {a.total_qty}
                              {a.qty_para_corte > 0 && <> · <span className="text-blue-700 dark:text-blue-300 font-semibold">Tuyas: {a.qty_para_corte}</span></>}
                            </span>
                            {/* Desglose por template del corte */}
                            {(a.templates_detalle || []).length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {a.templates_detalle.map(td => (
                                  <span key={td.template_id}
                                    className="text-[9px] px-1.5 py-0.5 rounded-md border border-blue-200 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:border-blue-900 dark:text-blue-300">
                                    {td.nombre || `#${td.template_id}`}: {td.qty}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          {!a.disponible && (
                            <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-300 shrink-0 ml-2">
                              Vinculado a otro
                            </Badge>
                          )}
                          {a.disponible && vinculando && (
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0 ml-2" />
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            </div>
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
                      ID Odoo: {v.stock_inventory_odoo_id} | Qty Total: {v.total_moves_qty} | {v.ajuste_fecha ? new Date(v.ajuste_fecha).toLocaleDateString('es-PE', { timeZone: 'America/Lima' }) : ''}
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
