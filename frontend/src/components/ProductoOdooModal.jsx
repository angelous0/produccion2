import { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from './ui/dialog';
import { Badge } from './ui/badge';
import { Ban, Save, Loader2, Package } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Modal para clasificar un producto de Odoo con los catálogos de producción.
 * Carga catálogos al montar y maneja cascadas:
 *  - tela_general_id → filtra telas
 *  - tipo == 'Polo' → requiere cuello
 *  - tipo in Pantalon/Short → muestra lavado
 */
const ProductoOdooModal = ({ producto, onClose, onSaved }) => {
  const [saving, setSaving] = useState(false);
  const [excluding, setExcluding] = useState(false);

  // Catálogos
  const [marcas, setMarcas] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [telasGenerales, setTelasGenerales] = useState([]);
  const [telas, setTelas] = useState([]);
  const [entalles, setEntalles] = useState([]);
  const [generos, setGeneros] = useState([]);
  const [cuellos, setCuellos] = useState([]);
  const [detalles, setDetalles] = useState([]);
  const [lavados, setLavados] = useState([]);
  const [coloresGenerales, setColoresGenerales] = useState([]);

  // Form state
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
  });

  // Cargar catálogos
  useEffect(() => {
    (async () => {
      try {
        const [m, t, tg, te, e, g, c, d, l, cg] = await Promise.all([
          axios.get(`${API}/marcas`),
          axios.get(`${API}/tipos`),
          axios.get(`${API}/telas-general`),
          axios.get(`${API}/telas`),
          axios.get(`${API}/entalles`),
          axios.get(`${API}/generos`),
          axios.get(`${API}/cuellos`),
          axios.get(`${API}/detalles`),
          axios.get(`${API}/lavados`),
          axios.get(`${API}/colores-generales`),
        ]);
        setMarcas(m.data || []);
        setTipos(t.data || []);
        setTelasGenerales(tg.data || []);
        setTelas(te.data || []);
        setEntalles(e.data || []);
        setGeneros(g.data || []);
        setCuellos(c.data || []);
        setDetalles(d.data || []);
        setLavados(l.data || []);
        setColoresGenerales(cg.data || []);
      } catch {
        toast.error('Error al cargar catálogos');
      }
    })();
  }, []);

  // Cascadas
  const tipoSeleccionado = useMemo(() => tipos.find(t => t.id === form.tipo_id), [tipos, form.tipo_id]);
  const esPolo = tipoSeleccionado?.nombre === 'Polo';
  const esPantalonOShort = tipoSeleccionado?.nombre === 'Pantalon' || tipoSeleccionado?.nombre === 'Short';

  const telasFiltradas = useMemo(() => {
    if (!form.tela_general_id) return telas;
    return telas.filter(t => String(t.tela_general_id) === String(form.tela_general_id));
  }, [telas, form.tela_general_id]);

  const setField = (k, v) => setForm(prev => ({ ...prev, [k]: v === '_none' ? '' : v }));

  // Si cambia tela_general, limpiar tela seleccionada si no pertenece
  useEffect(() => {
    if (form.tela_id && form.tela_general_id) {
      const t = telas.find(x => x.id === form.tela_id);
      if (t && String(t.tela_general_id) !== String(form.tela_general_id)) {
        setForm(prev => ({ ...prev, tela_id: '' }));
      }
    }
  }, [form.tela_general_id, form.tela_id, telas]);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const body = { ...form };
      // strings vacíos → null
      Object.keys(body).forEach(k => { if (body[k] === '') body[k] = null; });
      const res = await axios.patch(`${API}/odoo-enriq/${producto.id}/clasificar`, body);
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
            Asigna los catálogos de producción a este producto Odoo. Los campos con <span className="text-destructive">*</span> son requeridos para quedar en estado Completo.
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
          <SelectField label="Tipo" requerido value={form.tipo_id} onChange={v => setField('tipo_id', v)} options={tipos} />
          <SelectField label="Tela General" value={form.tela_general_id} onChange={v => setField('tela_general_id', v)} options={telasGenerales} />
          <SelectField label="Tela" value={form.tela_id} onChange={v => setField('tela_id', v)} options={telasFiltradas} disabled={!form.tela_general_id} placeholder={!form.tela_general_id ? 'Primero elige tela general' : 'Seleccionar'} />
          <SelectField label="Entalle" value={form.entalle_id} onChange={v => setField('entalle_id', v)} options={entalles} />
          <SelectField label="Género" requerido value={form.genero_id} onChange={v => setField('genero_id', v)} options={generos} />
          {esPolo && (
            <SelectField label="Cuello" requerido value={form.cuello_id} onChange={v => setField('cuello_id', v)} options={cuellos} />
          )}
          <SelectField label="Detalle" value={form.detalle_id} onChange={v => setField('detalle_id', v)} options={detalles} />
          {esPantalonOShort && (
            <SelectField label="Lavado" value={form.lavado_id} onChange={v => setField('lavado_id', v)} options={lavados} />
          )}
          <SelectField label="Categoría Color" value={form.categoria_color_id} onChange={v => setField('categoria_color_id', v)} options={coloresGenerales} />
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
