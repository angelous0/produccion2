import { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { Palette, Save, CheckCircle2, Square, CheckSquare, Search, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';

const API = `${process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000'}/api`;

/**
 * Asignación de colores por tipo de producto.
 * Permite definir qué colores aplican para Pantalon, Polo, Camisa, etc.
 */
export const ColoresPorTipo = () => {
  const [tipos, setTipos] = useState([]);
  const [tipoActual, setTipoActual] = useState(null);
  const [colores, setColores] = useState([]);  // [{id, nombre, codigo_hex, asignado}]
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    axios.get(`${API}/tipos`).then(r => {
      const ts = r.data || [];
      setTipos(ts);
      if (ts[0]) setTipoActual(ts[0].id);
    }).catch(() => toast.error('Error cargando tipos'));
  }, []);

  useEffect(() => {
    if (!tipoActual) return;
    setLoading(true);
    setTouched(false);
    axios.get(`${API}/tipos/${tipoActual}/colores`)
      .then(r => setColores(r.data || []))
      .catch(() => toast.error('Error cargando colores'))
      .finally(() => setLoading(false));
  }, [tipoActual]);

  const colorisFiltrados = useMemo(() => {
    if (!search.trim()) return colores;
    const q = search.toLowerCase();
    return colores.filter(c => (c.nombre || '').toLowerCase().includes(q));
  }, [colores, search]);

  const totalAsignados = colores.filter(c => c.asignado).length;

  const toggle = (id) => {
    setColores(prev => prev.map(c => c.id === id ? { ...c, asignado: !c.asignado } : c));
    setTouched(true);
  };
  const marcarTodos = () => {
    setColores(prev => prev.map(c => ({ ...c, asignado: true })));
    setTouched(true);
  };
  const limpiar = () => {
    setColores(prev => prev.map(c => ({ ...c, asignado: false })));
    setTouched(true);
  };

  const handleSave = async () => {
    if (saving || !tipoActual) return;
    setSaving(true);
    try {
      const color_ids = colores.filter(c => c.asignado).map(c => c.id);
      await axios.put(`${API}/tipos/${tipoActual}/colores`, { color_ids });
      toast.success(`${color_ids.length} colores asignados al tipo`);
      setTouched(false);
    } catch (e) {
      toast.error('Error al guardar');
    } finally { setSaving(false); }
  };

  const tipoNombre = tipos.find(t => t.id === tipoActual)?.nombre || '';

  return (
    <div className="space-y-4 p-4 max-w-5xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Palette className="h-6 w-6" /> Colores por Tipo de Producto
        </h2>
        <p className="text-muted-foreground text-sm">
          Define qué colores están disponibles para cada tipo. Los colores no asignados no aparecerán al crear registros del tipo correspondiente.
        </p>
      </div>

      {/* Selector de tipo */}
      <Card>
        <CardContent className="pt-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="md:col-span-1">
              <Label className="text-xs">Tipo de producto</Label>
              <Select value={tipoActual || ''} onValueChange={setTipoActual}>
                <SelectTrigger><SelectValue placeholder="Selecciona un tipo" /></SelectTrigger>
                <SelectContent>
                  {tipos.map(t => <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-1">
              <Label className="text-xs">Buscar color</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Negro, Azul, Beige..." className="pl-8" />
              </div>
            </div>
            <div className="md:col-span-1 flex flex-col items-end gap-2">
              <div className="text-sm">
                <span className="text-muted-foreground">Asignados: </span>
                <strong>{totalAsignados}</strong>
                <span className="text-muted-foreground"> / {colores.length}</span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={marcarTodos} disabled={loading}>Marcar todos</Button>
                <Button variant="outline" size="sm" onClick={limpiar} disabled={loading}>Limpiar</Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Grilla de colores */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Colores disponibles para <strong>{tipoNombre || '...'}</strong>
            {touched && <span className="ml-2 text-xs font-normal text-amber-600">(cambios sin guardar)</span>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin" /></div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {colorisFiltrados.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggle(c.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md border text-left transition-all ${c.asignado ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:bg-muted/50'}`}
                >
                  {c.asignado ? <CheckSquare className="h-4 w-4 text-primary shrink-0" /> : <Square className="h-4 w-4 text-muted-foreground shrink-0" />}
                  <div
                    className="w-4 h-4 rounded border shrink-0"
                    style={{ background: c.codigo_hex || '#ccc' }}
                  />
                  <span className="text-sm truncate">{c.nombre}</span>
                </button>
              ))}
              {colorisFiltrados.length === 0 && (
                <div className="col-span-full text-center text-muted-foreground py-8 text-sm">
                  {search ? 'Sin resultados' : 'Sin colores en el catálogo'}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Acciones */}
      <div className="sticky bottom-4 flex justify-end">
        <div className="bg-background border rounded-lg shadow-lg p-3 flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {totalAsignados} color{totalAsignados !== 1 ? 'es' : ''} asignado{totalAsignados !== 1 ? 's' : ''} a {tipoNombre}
          </span>
          <Button onClick={handleSave} disabled={saving || !touched}>
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            {saving ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ColoresPorTipo;
