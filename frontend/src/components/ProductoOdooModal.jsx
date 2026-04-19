import { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from './ui/dialog';
import { Ban, Save, Loader2, Package, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import useCascadaClasificacion from '../hooks/useCascadaClasificacion';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Modal para clasificar un producto de Odoo con los catálogos de producción.
 * Usa useCascadaClasificacion: al cambiar un padre, se refiltra el hijo y se
 * limpia el valor seleccionado si queda inválido.
 */
const ProductoOdooModal = ({ producto, onClose, onSaved }) => {
  const [saving, setSaving] = useState(false);
  const [excluding, setExcluding] = useState(false);

  const [form, setForm] = useState({
    marca_id: producto.marca_id || '',
    tipo_id: producto.tipo_id || '',
    tela_general_id: producto.tela_general_id || '',
    tela_id: producto.tela_id || '',
    entalle_id: producto.entalle_id || '',
    genero_id: producto.genero_id || '',
    cuello_id: producto.cuello_id || '',
    detalle_id: producto.detalle_id || '',
    lavado_id: producto.lavado_id || '',
    categoria_color_id: producto.categoria_color_id || '',
    notas: producto.notas || '',
    costo_manual: producto.costo_manual != null ? String(producto.costo_manual) : '',
  });

  // Guardamos el valor original para saber si cambió (evita PATCH innecesario)
  const costoOriginal = producto.costo_manual != null ? parseFloat(producto.costo_manual) : null;

  const {
    marcas, tipos, entalles, telas, telasGenerales,
    generos, cuellos, detalles, lavados, categoriasColor,
    mostrarCuello, mostrarLavado, esIdValido,
  } = useCascadaClasificacion({
    marca_id: form.marca_id,
    tipo_id: form.tipo_id,
    entalle_id: form.entalle_id,
    tela_general_id: form.tela_general_id,
  });

  // ── Limpieza automática de valores inválidos cuando cambia el padre ──
  // Si el valor actual ya no está en la lista filtrada, lo reseteo.
  useEffect(() => {
    setForm(prev => {
      const updates = {};
      if (prev.tipo_id && tipos.length && !esIdValido(prev.tipo_id, tipos)) updates.tipo_id = '';
      if (prev.genero_id && generos.length && !esIdValido(prev.genero_id, generos)) updates.genero_id = '';
      return Object.keys(updates).length ? { ...prev, ...updates } : prev;
    });
  }, [tipos, generos, esIdValido]);

  useEffect(() => {
    setForm(prev => {
      const updates = {};
      if (prev.entalle_id && entalles.length && !esIdValido(prev.entalle_id, entalles)) updates.entalle_id = '';
      if (prev.cuello_id && cuellos.length && !esIdValido(prev.cuello_id, cuellos)) updates.cuello_id = '';
      if (prev.detalle_id && detalles.length && !esIdValido(prev.detalle_id, detalles)) updates.detalle_id = '';
      if (prev.lavado_id && lavados.length && !esIdValido(prev.lavado_id, lavados)) updates.lavado_id = '';
      return Object.keys(updates).length ? { ...prev, ...updates } : prev;
    });
  }, [entalles, cuellos, detalles, lavados, esIdValido]);

  useEffect(() => {
    setForm(prev => {
      if (prev.tela_id && telas.length && !esIdValido(prev.tela_id, telas)) {
        return { ...prev, tela_id: '' };
      }
      return prev;
    });
  }, [telas, esIdValido]);

  // Ocultar cuello/lavado → limpiar su valor
  useEffect(() => {
    if (!mostrarCuello && form.cuello_id) setForm(prev => ({ ...prev, cuello_id: '' }));
  }, [mostrarCuello]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mostrarLavado && form.lavado_id) setForm(prev => ({ ...prev, lavado_id: '' }));
  }, [mostrarLavado]); // eslint-disable-line react-hooks/exhaustive-deps

  const setField = (k, v) => setForm(prev => ({ ...prev, [k]: v === '_none' ? '' : v }));

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // Separar el costo del resto del form (va a un endpoint distinto)
      const { costo_manual, ...clasifForm } = form;
      const body = { ...clasifForm };
      Object.keys(body).forEach(k => { if (body[k] === '') body[k] = null; });
      const res = await axios.patch(`${API}/odoo-enriq/${producto.id}/clasificar`, body);

      // Si el costo cambió, llamar al endpoint específico
      const costoNuevo = costo_manual === '' || costo_manual == null
        ? null
        : parseFloat(costo_manual);
      const costoCambio = (costoOriginal ?? null) !== (costoNuevo ?? null);
      if (costoCambio) {
        if (costoNuevo != null && (isNaN(costoNuevo) || costoNuevo < 0)) {
          toast.error('Costo inválido');
          setSaving(false);
          return;
        }
        await axios.patch(`${API}/odoo-enriq/${producto.id}/costo`, {
          costo_manual: costoNuevo,
        });
      }

      const estado = res.data?.estado;
      const pendientes = res.data?.campos_pendientes || [];
      if (estado === 'completo') toast.success('Producto clasificado — Completo');
      else if (estado === 'parcial') toast.success(`Parcial — Faltan: ${pendientes.join(', ')}`);
      else toast.success('Guardado');
      onSaved?.();
    } catch (err) {
      const msg = typeof err.response?.data?.detail === 'string' ? err.response.data.detail : 'Error al guardar';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleExclude = async () => {
    if (excluding) return;
    if (!window.confirm('¿Excluir este producto? No aparecerá como pendiente.')) return;
    setExcluding(true);
    try {
      await axios.post(`${API}/odoo-enriq/${producto.id}/excluir`);
      toast.success('Producto excluido');
      onSaved?.();
    } catch (err) {
      toast.error('Error al excluir');
    } finally {
      setExcluding(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Clasificar producto: {producto.odoo_nombre}
          </DialogTitle>
          <DialogDescription>
            Asigna los catálogos de producción a este producto Odoo. Los campos con <span className="text-destructive">*</span> son requeridos para estado Completo.
          </DialogDescription>
        </DialogHeader>

        {/* Info Odoo */}
        <div className="bg-muted/40 rounded-md p-3 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Template ID:</span> <span className="font-mono">#{producto.odoo_template_id}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Marca (Odoo):</span> <span className="font-medium">{producto.odoo_marca_texto || '—'}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Tipo (Odoo):</span> <span className="font-medium">{producto.odoo_tipo_texto || '—'}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Stock actual:</span> <span className="font-mono">{parseFloat(producto.odoo_stock_actual || 0).toLocaleString('es-PE')}</span></div>
          {producto.classified_by && (
            <div className="flex justify-between text-xs pt-1 border-t">
              <span className="text-muted-foreground">Última clasificación:</span>
              <span>{producto.classified_by} · {producto.classified_at && new Date(producto.classified_at).toLocaleString('es-PE')}</span>
            </div>
          )}
        </div>

        {/* Clasificación */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
          <SelectField label="Marca" requerido value={form.marca_id} onChange={v => setField('marca_id', v)} options={marcas} />
          <SelectField label="Tipo" requerido value={form.tipo_id} onChange={v => setField('tipo_id', v)} options={tipos} disabled={!form.marca_id} placeholder={!form.marca_id ? 'Primero elige marca' : 'Seleccionar'} />
          <SelectField label="Tela General" value={form.tela_general_id} onChange={v => setField('tela_general_id', v)} options={telasGenerales} />
          <SelectField label="Entalle" value={form.entalle_id} onChange={v => setField('entalle_id', v)} options={entalles} disabled={!form.tipo_id} placeholder={!form.tipo_id ? 'Primero elige tipo' : 'Seleccionar'} />
          <SelectField label="Tela" value={form.tela_id} onChange={v => setField('tela_id', v)} options={telas} disabled={!form.entalle_id && !form.tela_general_id} placeholder={!form.entalle_id && !form.tela_general_id ? 'Primero elige entalle o tela general' : 'Seleccionar'} />
          <SelectField label="Género" requerido value={form.genero_id} onChange={v => setField('genero_id', v)} options={generos} disabled={!form.marca_id} placeholder={!form.marca_id ? 'Primero elige marca' : 'Seleccionar'} />
          {mostrarCuello && (
            <SelectField label="Cuello" requerido value={form.cuello_id} onChange={v => setField('cuello_id', v)} options={cuellos} />
          )}
          <SelectField label="Detalle" value={form.detalle_id} onChange={v => setField('detalle_id', v)} options={detalles} disabled={!form.tipo_id} placeholder={!form.tipo_id ? 'Primero elige tipo' : 'Seleccionar'} />
          {mostrarLavado && (
            <SelectField label="Lavado" requerido value={form.lavado_id} onChange={v => setField('lavado_id', v)} options={lavados} />
          )}
          <SelectField label="Categoría Color" value={form.categoria_color_id} onChange={v => setField('categoria_color_id', v)} options={categoriasColor} />
        </div>

        {/* Costo manual — editable para productos antiguos sin costo en Odoo */}
        <div className="pt-4 mt-2 border-t">
          <Label className="text-xs flex items-center gap-1.5">
            <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
            Costo manual (S/)
          </Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            placeholder="0.00"
            value={form.costo_manual ?? ''}
            onChange={(e) => setForm(prev => ({ ...prev, costo_manual: e.target.value }))}
            className="h-9 text-sm mt-1 font-mono"
          />
          <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
            Se usa para calcular margen en reportes de Ventas. Los productos creados desde el módulo Producción traen el costo automático.
            {producto.costo_updated_at && (
              <span className="block mt-0.5">
                Última actualización: {new Date(producto.costo_updated_at).toLocaleDateString('es-PE')}
                {producto.costo_updated_by && ` por ${producto.costo_updated_by}`}
              </span>
            )}
          </p>
        </div>

        <div className="pt-2">
          <Label className="text-xs">Notas</Label>
          <Textarea
            value={form.notas}
            onChange={(e) => setForm(prev => ({ ...prev, notas: e.target.value }))}
            placeholder="Observaciones internas…"
            rows={2}
          />
        </div>

        <DialogFooter className="flex justify-between flex-row">
          <Button variant="destructive" onClick={handleExclude} disabled={excluding || saving}>
            <Ban className="h-4 w-4 mr-2" /> Excluir
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Guardar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const SelectField = ({ label, requerido, value, onChange, options = [], disabled, placeholder = 'Seleccionar' }) => (
  <div className="space-y-1">
    <Label className="text-xs">
      {label} {requerido && <span className="text-destructive">*</span>}
    </Label>
    <Select value={value || '_none'} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="_none">— Sin asignar —</SelectItem>
        {options.map(o => <SelectItem key={o.id} value={o.id}>{o.nombre}</SelectItem>)}
      </SelectContent>
    </Select>
  </div>
);

export default ProductoOdooModal;
