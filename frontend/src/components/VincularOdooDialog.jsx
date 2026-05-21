// Popup compartido para editar la "Distribución Esperada" (1:N) de un corte.
// Sistema: prod_registro_pt_relacion — cada línea = (tipo_salida, template_odoo, cantidad).
// Al guardar/limpiar, llama onSaved(item) para que el padre refresque sus datos.
//
// Usado por:
//   - ReporteCortes.jsx (click en icono Odoo de una fila)
//   - ConciliacionPendiente.jsx (click en icono Odoo en sección "Sin distribución" o
//     en drill-down de "Productos con conciliación pendiente").
//
// Props:
//   item       — { id, n_corte, modelo, marca, tipo, vinculado_odoo } (null = cerrado)
//   onClose    — cierra sin guardar
//   onSaved    — (item) => void, llamado tras guardar exitosamente
//   onCleared  — (item) => void, llamado tras eliminar todas las líneas
import { useEffect, useState } from 'react';
import axios from 'axios';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from './ui/dialog';
import {
  Link2, Loader2, Search, Check, Unlink, AlertTriangle, X,
} from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const VincularOdooDialog = ({ item, onClose, onSaved, onCleared }) => {
  const [lineas, setLineas]                 = useState([]);
  const [distLoading, setDistLoading]       = useState(false);
  const [distSaving, setDistSaving]         = useState(false);
  const [totalProducido, setTotalProducido] = useState(0);

  // Picker secundario
  const [pickerIndex, setPickerIndex]       = useState(null);
  const [pickerBusqueda, setPickerBusqueda] = useState('');
  const [pickerResultados, setPickerResultados] = useState([]);
  const [pickerLoading, setPickerLoading]   = useState(false);

  // Cargar la distribución existente al abrir
  useEffect(() => {
    if (!item) {
      // Reset al cerrar
      setLineas([]); setPickerIndex(null); setPickerBusqueda('');
      setPickerResultados([]); setTotalProducido(0);
      return;
    }
    setDistLoading(true);
    setLineas([]);
    setPickerIndex(null);
    setPickerBusqueda('');
    setPickerResultados([]);
    axios.get(`${API}/registros/${item.id}/distribucion-pt`)
      .then(r => {
        const d = r.data || {};
        setTotalProducido(d.total_producido || 0);
        setLineas((d.lineas || []).map(l => ({
          tipo_salida: l.tipo_salida || 'normal',
          product_template_id_odoo: l.product_template_id_odoo,
          producto_nombre: l.producto_nombre || `Template #${l.product_template_id_odoo}`,
          cantidad: Number(l.cantidad) || 0,
        })));
      })
      .catch(() => toast.error('Error al cargar la distribución actual'))
      .finally(() => setDistLoading(false));
  }, [item]);

  // Picker: búsqueda con debounce
  useEffect(() => {
    if (pickerIndex === null) return;
    const t = setTimeout(() => {
      const term = pickerBusqueda.trim();
      if (!term) { setPickerResultados([]); return; }
      setPickerLoading(true);
      axios.get(`${API}/odoo-tienda/productos/buscar`, { params: { q: term, limit: 30 } })
        .then(r => setPickerResultados(r.data || []))
        .catch(() => setPickerResultados([]))
        .finally(() => setPickerLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [pickerBusqueda, pickerIndex]);

  const agregarLinea = () => {
    setLineas(prev => [...prev, {
      tipo_salida: 'normal',
      product_template_id_odoo: null,
      producto_nombre: '',
      cantidad: 0,
    }]);
    setPickerIndex(lineas.length);
    setPickerBusqueda(item?.modelo || '');
  };
  const quitarLinea = (idx) => setLineas(prev => prev.filter((_, i) => i !== idx));
  const setLinea = (idx, campo, valor) =>
    setLineas(prev => prev.map((l, i) => i === idx ? { ...l, [campo]: valor } : l));
  const elegirProductoEnLinea = (prod) => {
    setLinea(pickerIndex, 'product_template_id_odoo', prod.template_id);
    setLinea(pickerIndex, 'producto_nombre', prod.name);
    setPickerIndex(null);
    setPickerBusqueda('');
    setPickerResultados([]);
  };

  const guardar = async () => {
    if (!item) return;
    if (lineas.some(l => !l.product_template_id_odoo)) {
      toast.error('Falta seleccionar producto Odoo en una línea');
      return;
    }
    setDistSaving(true);
    try {
      await axios.post(`${API}/registros/${item.id}/distribucion-pt`, {
        lineas: lineas.map(l => ({
          tipo_salida: l.tipo_salida,
          product_template_id_odoo: l.product_template_id_odoo,
          cantidad: Number(l.cantidad) || 0,
        })),
      });
      toast.success(`Distribución guardada (${lineas.length} línea${lineas.length === 1 ? '' : 's'})`);
      onSaved?.(item);
      onClose?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Error al guardar la distribución');
    } finally {
      setDistSaving(false);
    }
  };

  const limpiar = async () => {
    if (!item) return;
    if (!window.confirm('¿Eliminar TODAS las líneas de Distribución Esperada de este corte?')) return;
    setDistSaving(true);
    try {
      await axios.delete(`${API}/registros/${item.id}/distribucion-pt`);
      toast.success('Distribución eliminada');
      onCleared?.(item);
      onClose?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Error al eliminar');
    } finally {
      setDistSaving(false);
    }
  };

  const totalDistribuido = lineas.reduce((s, l) => s + (Number(l.cantidad) || 0), 0);
  const cuadra = Math.abs(totalDistribuido - totalProducido) < 0.01;

  return (
    <>
      <Dialog open={!!item} onOpenChange={(v) => { if (!v && !distSaving) onClose?.(); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-emerald-600" />
              Distribución Esperada — vincular a Odoo
            </DialogTitle>
            <DialogDescription asChild>
              <div>
                {item && (
                  <div className="text-xs">
                    Corte <strong className="font-mono">{item.n_corte || '(sin número)'}</strong>
                    {' · '}<strong>{item.modelo || '—'}</strong>
                    {' · '}{item.marca || '—'} · {item.tipo || '—'}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground mt-1">
                  Cada línea = un producto Odoo + tipo (Normal / LQ leve / LQ grave) + cantidad.
                  El total debe cuadrar con las prendas producidas.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>

          {distLoading ? (
            <div className="flex items-center justify-center gap-2 h-32 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando distribución...
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-xs flex-wrap rounded-md border bg-muted/30 px-3 py-1.5">
                <span><span className="text-muted-foreground">Producido:</span> <strong>{totalProducido}</strong></span>
                <span>·</span>
                <span><span className="text-muted-foreground">Distribuido:</span> <strong className={cuadra ? 'text-emerald-700' : 'text-amber-700'}>{totalDistribuido}</strong></span>
                {totalProducido > 0 && (
                  cuadra
                    ? <span className="ml-auto inline-flex items-center gap-1 text-emerald-700"><Check className="h-3 w-3" /> cuadra</span>
                    : <span className="ml-auto inline-flex items-center gap-1 text-amber-700"><AlertTriangle className="h-3 w-3" /> {totalDistribuido > totalProducido ? `excede en ${totalDistribuido - totalProducido}` : `faltan ${totalProducido - totalDistribuido}`}</span>
                )}
              </div>

              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/60">
                    <tr>
                      <th className="text-left p-2 font-medium w-[160px]">Tipo</th>
                      <th className="text-left p-2 font-medium">Producto Odoo</th>
                      <th className="text-right p-2 font-medium w-[100px]">Cantidad</th>
                      <th className="w-[36px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineas.length === 0 && (
                      <tr><td colSpan={4} className="p-4 text-center text-muted-foreground italic">
                        Sin líneas. Click en "Agregar línea" para empezar.
                      </td></tr>
                    )}
                    {lineas.map((l, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="p-1.5">
                          <Select value={l.tipo_salida} onValueChange={v => setLinea(idx, 'tipo_salida', v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="normal">Normal</SelectItem>
                              <SelectItem value="liquidacion_leve">Liquidación Leve (LQ)</SelectItem>
                              <SelectItem value="liquidacion_grave">Liquidación Grave</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-full justify-start text-xs font-normal"
                            onClick={() => {
                              setPickerIndex(idx);
                              setPickerBusqueda(l.producto_nombre || item?.modelo || '');
                              setPickerResultados([]);
                            }}
                          >
                            {l.product_template_id_odoo
                              ? <span className="truncate">{l.producto_nombre} <span className="text-muted-foreground">(#{l.product_template_id_odoo})</span></span>
                              : <span className="text-muted-foreground">Seleccionar producto...</span>}
                          </Button>
                        </td>
                        <td className="p-1.5">
                          <Input
                            type="number"
                            min={0}
                            value={l.cantidad}
                            onChange={e => setLinea(idx, 'cantidad', e.target.value)}
                            onFocus={e => e.target.select()}
                            className="h-8 text-xs text-right font-mono"
                          />
                        </td>
                        <td className="p-1.5 text-center">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                  onClick={() => quitarLinea(idx)} title="Quitar línea">
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between gap-2">
                <Button size="sm" variant="outline" onClick={agregarLinea} className="h-7 text-[11px] gap-1">
                  + Agregar línea
                </Button>
                {totalProducido > 0 && lineas.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-[11px] gap-1 text-muted-foreground"
                    onClick={() => {
                      const delta = totalProducido - totalDistribuido;
                      if (delta === 0 || lineas.length === 0) return;
                      setLinea(0, 'cantidad', (Number(lineas[0].cantidad) || 0) + delta);
                    }}
                    title="Ajusta la primera línea para que el total cuadre"
                  >
                    Cuadrar diferencia
                  </Button>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="flex sm:justify-between gap-2">
            <div>
              {item?.vinculado_odoo && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={limpiar}
                  disabled={distSaving}
                  className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10"
                >
                  <Unlink className="h-3.5 w-3.5" />
                  Eliminar todas
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => onClose?.()} disabled={distSaving}>
                Cancelar
              </Button>
              <Button size="sm" onClick={guardar} disabled={distSaving || distLoading}>
                {distSaving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                Guardar distribución
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Picker secundario: elegir producto Odoo */}
      <Dialog open={pickerIndex !== null} onOpenChange={(v) => { if (!v) setPickerIndex(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-base">Seleccionar producto Odoo</DialogTitle>
            <DialogDescription className="text-xs">
              Busca el template (modelo) al cual asignar esta línea.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={pickerBusqueda}
                onChange={e => setPickerBusqueda(e.target.value)}
                placeholder="Buscar por nombre, marca, tipo..."
                className="pl-7 h-9"
                autoFocus
              />
            </div>
            <div className="max-h-[340px] overflow-auto rounded-md border bg-background">
              {pickerLoading && (
                <div className="flex items-center justify-center gap-2 h-24 text-muted-foreground text-xs">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando...
                </div>
              )}
              {!pickerLoading && pickerBusqueda.trim() === '' && (
                <div className="text-center py-8 text-xs text-muted-foreground italic">
                  Escribe al menos 2 caracteres
                </div>
              )}
              {!pickerLoading && pickerBusqueda.trim() && pickerResultados.length === 0 && (
                <div className="text-center py-8 text-xs text-muted-foreground italic">
                  Sin resultados
                </div>
              )}
              {!pickerLoading && pickerResultados.length > 0 && (
                <table className="w-full text-xs">
                  <thead className="bg-muted/60 sticky top-0">
                    <tr>
                      <th className="text-left p-2 font-medium">Nombre</th>
                      <th className="text-left p-2 font-medium">Marca</th>
                      <th className="text-left p-2 font-medium">Tipo · Tela · Entalle</th>
                      <th className="text-right p-2 font-medium w-[80px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pickerResultados.map(p => (
                      <tr key={`${p.template_id}-${p.company_key}`} className="border-t hover:bg-muted/30">
                        <td className="p-2 font-medium">{p.name}</td>
                        <td className="p-2 text-muted-foreground">{p.marca || '—'}</td>
                        <td className="p-2 text-muted-foreground text-[11px]">
                          {[p.tipo, p.tela, p.entalle].filter(Boolean).join(' · ') || '—'}
                        </td>
                        <td className="p-2 text-right">
                          <Button size="sm" className="h-7 text-[11px]" onClick={() => elegirProductoEnLinea(p)}>
                            Elegir
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setPickerIndex(null)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default VincularOdooDialog;
