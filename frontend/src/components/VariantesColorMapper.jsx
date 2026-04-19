import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './ui/select';
import {
  ChevronDown, ChevronRight, Plus, Loader2, Palette,
  CheckCircle2, AlertCircle, CircleDashed, Trash2, Check, X,
} from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Mapea los colores Odoo (texto libre) a FKs de prod_colores_catalogo,
 * por cada product_id (variante) del template. Agrupa por color Odoo,
 * muestra stock/ventas por talla y permite mapeo bulk por grupo.
 */
export default function VariantesColorMapper({ templateId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [colores, setColores] = useState([]);
  const [coloresGenerales, setColoresGenerales] = useState([]);
  const [expandido, setExpandido] = useState(null);
  const [selecciones, setSelecciones] = useState({});
  const [creando, setCreando] = useState(null);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoGeneralId, setNuevoGeneralId] = useState('');
  const [saving, setSaving] = useState(null);

  const cargar = useCallback(async () => {
    if (!templateId) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/odoo-enriq/${templateId}/variantes`);
      setData(res.data);
    } catch (err) {
      toast.error('Error al cargar variantes');
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  const cargarColores = useCallback(async () => {
    try {
      const [c, cg] = await Promise.all([
        axios.get(`${API}/colores-catalogo`),
        axios.get(`${API}/colores-generales`),
      ]);
      setColores(c.data || []);
      setColoresGenerales(cg.data || []);
    } catch {}
  }, []);

  useEffect(() => {
    cargar();
    cargarColores();
  }, [cargar, cargarColores]);

  const guardarMapeo = async (grupo) => {
    const colorId = selecciones[grupo.color_odoo] || grupo.color_id_mapeado;
    if (!colorId) return;
    setSaving(grupo.color_odoo);
    try {
      await axios.post(`${API}/odoo-enriq/color-mapping`, {
        template_id: templateId,
        color_odoo_original: grupo.color_odoo,
        color_id: colorId,
        product_ids: grupo.product_ids.map(p => p.product_id),
      });
      toast.success(`${grupo.color_odoo} mapeado`);
      setExpandido(null);
      await cargar();
    } catch (err) {
      const msg = typeof err.response?.data?.detail === 'string' ? err.response.data.detail : 'Error al mapear';
      toast.error(msg);
    } finally {
      setSaving(null);
    }
  };

  const quitarMapeo = async (grupo) => {
    if (!window.confirm(`¿Quitar el mapeo de "${grupo.color_odoo}"? (${grupo.product_ids.length} variantes)`)) return;
    setSaving(grupo.color_odoo);
    try {
      await axios.delete(`${API}/odoo-enriq/color-mapping`, {
        data: {
          template_id: templateId,
          product_ids: grupo.product_ids.map(p => p.product_id),
        },
      });
      toast.success('Mapeo eliminado');
      await cargar();
    } catch {
      toast.error('Error al eliminar mapeo');
    } finally {
      setSaving(null);
    }
  };

  const crearColor = async (colorOdoo) => {
    const nombre = nuevoNombre.trim();
    if (!nombre) return;
    try {
      const res = await axios.post(`${API}/odoo-enriq/colores/crear`, {
        nombre,
        color_general_id: nuevoGeneralId || null,
      });
      const d = res.data;
      if (d.existing) {
        toast.success(`Color "${d.nombre}" ya existía, seleccionado`);
      } else {
        toast.success(`Color "${d.nombre}" creado`);
      }
      await cargarColores();
      setSelecciones(prev => ({ ...prev, [colorOdoo]: d.id }));
      setCreando(null);
      setNuevoNombre('');
      setNuevoGeneralId('');
    } catch (err) {
      const msg = typeof err.response?.data?.detail === 'string' ? err.response.data.detail : 'Error al crear color';
      toast.error(msg);
    }
  };

  if (loading) {
    return (
      <div className="mt-6 pt-6 border-t text-center text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin inline-block mr-2" />
        Cargando variantes…
      </div>
    );
  }

  if (!data?.colores?.length) {
    return (
      <div className="mt-6 pt-6 border-t text-sm text-muted-foreground">
        Este producto no tiene variantes registradas en Odoo.
      </div>
    );
  }

  const pct = data.total_colores_odoo > 0
    ? (data.colores_mapeados / data.total_colores_odoo) * 100
    : 0;

  return (
    <div className="mt-6 pt-6 border-t space-y-3">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-sm font-semibold flex items-center gap-1.5">
            <Palette className="h-4 w-4 text-blue-600" />
            Variantes · mapeo de colores
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {data.stock_total.toLocaleString('es-PE')} unidades en stock · {data.total_variantes} variantes · {data.total_colores_odoo} colores de Odoo
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">
            {data.colores_mapeados}/{data.total_colores_odoo} mapeados
          </span>
          <div className="w-20 h-1 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {data.colores.map(grupo => {
          const expanded = expandido === grupo.color_odoo;
          const pendiente = grupo.mapeo_estado === 'pendiente';
          const parcial = grupo.mapeo_estado === 'parcial';
          const colorSelId = selecciones[grupo.color_odoo] || grupo.color_id_mapeado || '';
          const isSaving = saving === grupo.color_odoo;

          return (
            <div
              key={grupo.color_odoo}
              className={`rounded-md overflow-hidden border ${
                pendiente ? 'border-amber-400 border-2' :
                parcial ? 'border-amber-300' : 'border-border'
              }`}
            >
              <button
                type="button"
                onClick={() => setExpandido(expanded ? null : grupo.color_odoo)}
                className={`w-full px-3 py-2.5 flex items-center justify-between gap-3 text-left transition-colors
                  ${pendiente && expanded ? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-muted/40 hover:bg-muted/60'}`}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium flex items-center gap-2">
                      {grupo.color_odoo}
                      <span className="text-[10px] text-muted-foreground font-normal">color Odoo</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {grupo.product_ids.length} variantes · {grupo.stock_total} stock · {grupo.unidades_vendidas.toLocaleString('es-PE')} vendidas
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {grupo.mapeo_estado === 'mapeado' && (
                    <>
                      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 text-[10px] gap-1">
                        <CheckCircle2 className="h-3 w-3" /> mapeado
                      </Badge>
                      <span className="text-[11px] text-muted-foreground truncate max-w-[180px]">
                        → {grupo.color_nombre_mapeado}
                        {grupo.color_general_nombre && <span className="opacity-60"> · {grupo.color_general_nombre}</span>}
                      </span>
                    </>
                  )}
                  {grupo.mapeo_estado === 'parcial' && (
                    <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 text-[10px] gap-1">
                      <AlertCircle className="h-3 w-3" /> parcial
                    </Badge>
                  )}
                  {grupo.mapeo_estado === 'pendiente' && (
                    <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-400 text-[10px] gap-1">
                      <CircleDashed className="h-3 w-3" /> pendiente
                    </Badge>
                  )}
                </div>
              </button>

              {expanded && (
                <div className="p-3 bg-background space-y-3">
                  {/* Grid de variantes */}
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                    {grupo.product_ids.map(p => (
                      <div key={p.product_id} className="bg-muted/40 rounded-md px-2 py-1.5">
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Talla {p.talla || '—'}</div>
                        <div className="text-sm font-mono font-semibold mt-0.5">{p.stock}</div>
                        <div className="text-[9px] text-muted-foreground mt-0.5">{p.unidades_vendidas.toLocaleString('es-PE')} vend</div>
                      </div>
                    ))}
                  </div>

                  {/* Selector color */}
                  <div className="space-y-1">
                    <Label className="text-[11px]">Color de catálogo *</Label>
                    {creando === grupo.color_odoo ? (
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Input
                          autoFocus
                          value={nuevoNombre}
                          onChange={(e) => setNuevoNombre(e.target.value)}
                          placeholder="Nombre del nuevo color"
                          className="h-9 text-sm flex-1"
                        />
                        <Select value={nuevoGeneralId || '_none'} onValueChange={v => setNuevoGeneralId(v === '_none' ? '' : v)}>
                          <SelectTrigger className="h-9 text-sm w-full sm:w-48"><SelectValue placeholder="Color general (opcional)" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none">— sin asignar —</SelectItem>
                            {coloresGenerales.map(cg => <SelectItem key={cg.id} value={cg.id}>{cg.nombre}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <div className="flex gap-1">
                          <Button size="sm" onClick={() => crearColor(grupo.color_odoo)} disabled={!nuevoNombre.trim()} className="h-9">
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => { setCreando(null); setNuevoNombre(''); setNuevoGeneralId(''); }} className="h-9">
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Select
                          value={colorSelId || '_none'}
                          onValueChange={(v) => setSelecciones(prev => ({ ...prev, [grupo.color_odoo]: v === '_none' ? '' : v }))}
                        >
                          <SelectTrigger className="h-9 text-sm flex-1"><SelectValue placeholder="— Seleccionar —" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none">— Seleccionar —</SelectItem>
                            {colores.map(c => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.nombre}
                                {c.color_general_nombre && <span className="text-muted-foreground"> · {c.color_general_nombre}</span>}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button size="sm" variant="outline" onClick={() => setCreando(grupo.color_odoo)} className="h-9" title="Crear nuevo color">
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="px-2.5 py-1.5 bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-300 rounded text-[11px]">
                    Aplica a los <strong>{grupo.product_ids.length} product_id</strong> · tallas / stock / ventas no cambian
                  </div>

                  <div className="flex justify-end gap-2">
                    {grupo.mapeo_estado !== 'pendiente' && (
                      <Button size="sm" variant="outline" onClick={() => quitarMapeo(grupo)} disabled={isSaving} className="h-8 text-xs text-destructive hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Quitar mapeo
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setExpandido(null)} className="h-8 text-xs">
                      Cancelar
                    </Button>
                    <Button size="sm" onClick={() => guardarMapeo(grupo)} disabled={!colorSelId || isSaving} className="h-8 text-xs">
                      {isSaving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                      Guardar mapeo
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
