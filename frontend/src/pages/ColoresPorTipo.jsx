import { useEffect, useMemo, useState, useCallback } from 'react';
import axios from 'axios';
import {
  Palette, Save, Search, Loader2, Plus, Trash2,
  Check, Layers, Star,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { formatColorName } from '../lib/utils';

const API = `${process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000'}/api`;
const ALL_VALUE = '_all';
const NEW_VALUE = '_new';

const emptyRule = (tipoId = '') => ({
  id: null,
  nombre: '',
  marca_id: '',
  tipo_id: tipoId,
  hilo_id: '',
  entalle_ids: [],
  color_ids: [],
  estrella_ids: [],  // subset de color_ids: deben tener stock siempre (⭐ en Almacén PT)
  activo: true,
  orden: 0,
});

const selectionBoxClass = (checked) => (
  `flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
    checked ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white'
  }`
);

const selectableButtonClass = (checked, extra = '') => (
  `border text-left transition-colors ${extra} ${
    checked
      ? 'border-blue-300 bg-blue-50 text-blue-950 shadow-sm ring-1 ring-blue-100 hover:bg-blue-100'
      : 'border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50'
  }`
);

export const ColoresPorTipo = () => {
  const [marcas, setMarcas] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [entalles, setEntalles] = useState([]);
  const [hilos, setHilos] = useState([]);
  const [colores, setColores] = useState([]);
  const [reglas, setReglas] = useState([]);
  const [reglaActualId, setReglaActualId] = useState(NEW_VALUE);
  const [form, setForm] = useState(emptyRule());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [m, t, e, c, r, h] = await Promise.all([
        axios.get(`${API}/marcas`),
        axios.get(`${API}/tipos`),
        axios.get(`${API}/entalles`),
        axios.get(`${API}/colores-catalogo?incluir_todos=true`),
        axios.get(`${API}/colores-reglas`),
        axios.get(`${API}/hilos`),
      ]);
      const tiposData = t.data || [];
      const reglasData = r.data || [];
      setMarcas(m.data || []);
      setTipos(tiposData);
      setEntalles(e.data || []);
      setColores(c.data || []);
      setReglas(reglasData);
      setHilos(h.data || []);
      if (reglasData[0]) {
        cargarRegla(reglasData[0]);
      } else {
        setReglaActualId(NEW_VALUE);
        setForm(emptyRule(tiposData[0]?.id || ''));
      }
      setTouched(false);
    } catch {
      toast.error('Error cargando reglas de colores');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const marcasMap = useMemo(() => new Map(marcas.map(m => [m.id, m.nombre])), [marcas]);
  const tiposMap = useMemo(() => new Map(tipos.map(t => [t.id, t.nombre])), [tipos]);
  const entallesMap = useMemo(() => new Map(entalles.map(e => [e.id, e.nombre])), [entalles]);
  const hilosMap = useMemo(() => new Map(hilos.map(h => [h.id, h.nombre])), [hilos]);

  const tiposDisponibles = useMemo(() => {
    if (!form.marca_id) return tipos;
    return tipos.filter(t => !Array.isArray(t.marca_ids) || t.marca_ids.length === 0 || t.marca_ids.includes(form.marca_id));
  }, [tipos, form.marca_id]);

  const entallesDelTipo = useMemo(() => {
    if (!form.tipo_id) return [];
    return entalles.filter(e => Array.isArray(e.tipo_ids) && e.tipo_ids.includes(form.tipo_id));
  }, [entalles, form.tipo_id]);

  useEffect(() => {
    if (form.tipo_id && tiposDisponibles.length && !tiposDisponibles.some(t => t.id === form.tipo_id)) {
      setForm(prev => ({ ...prev, tipo_id: '', entalle_ids: [] }));
      setTouched(true);
    }
  }, [form.tipo_id, tiposDisponibles]);

  const nombreSugerido = useMemo(() => {
    const marca = form.marca_id ? marcasMap.get(form.marca_id) : 'Todas las marcas';
    const tipo = form.tipo_id ? tiposMap.get(form.tipo_id) : 'Tipo';
    const entalleNames = form.entalle_ids.map(id => entallesMap.get(id)).filter(Boolean);
    const entalleTxt = entalleNames.length ? entalleNames.join(' / ') : 'Todos los entalles';
    const hiloTxt = form.hilo_id ? ` · Hilo ${hilosMap.get(form.hilo_id) || ''}` : '';
    return `${marca} - ${tipo} - ${entalleTxt}${hiloTxt}`;
  }, [form.marca_id, form.tipo_id, form.entalle_ids, form.hilo_id, marcasMap, tiposMap, entallesMap, hilosMap]);

  const setField = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setTouched(true);
  };

  const cargarRegla = (regla) => {
    setReglaActualId(regla.id);
    setForm({
      id: regla.id,
      nombre: regla.nombre || '',
      marca_id: regla.marca_id || '',
      tipo_id: regla.tipo_id || '',
      hilo_id: regla.hilo_id || '',
      entalle_ids: regla.entalle_ids || [],
      color_ids: regla.color_ids || [],
      estrella_ids: regla.estrella_ids || [],
      activo: regla.activo !== false,
      orden: regla.orden || 0,
    });
    setTouched(false);
  };

  const nuevaRegla = () => {
    setReglaActualId(NEW_VALUE);
    setForm(prev => emptyRule(prev.tipo_id || tipos[0]?.id || ''));
    setTouched(false);
  };

  const toggleEntalle = (entalleId) => {
    setForm(prev => {
      const exists = prev.entalle_ids.includes(entalleId);
      return {
        ...prev,
        entalle_ids: exists
          ? prev.entalle_ids.filter(id => id !== entalleId)
          : [...prev.entalle_ids, entalleId],
      };
    });
    setTouched(true);
  };

  const toggleColor = (colorId) => {
    setForm(prev => {
      const exists = prev.color_ids.includes(colorId);
      return {
        ...prev,
        color_ids: exists
          ? prev.color_ids.filter(id => id !== colorId)
          : [...prev.color_ids, colorId],
        // Si quitamos un color de la regla, también lo quitamos de estrellas
        estrella_ids: exists
          ? prev.estrella_ids.filter(id => id !== colorId)
          : prev.estrella_ids,
      };
    });
    setTouched(true);
  };

  // Alterna ⭐ estrella SOLO si el color ya está en la regla
  const toggleEstrella = (colorId) => {
    setForm(prev => {
      if (!prev.color_ids.includes(colorId)) return prev;
      const isStar = prev.estrella_ids.includes(colorId);
      return {
        ...prev,
        estrella_ids: isStar
          ? prev.estrella_ids.filter(id => id !== colorId)
          : [...prev.estrella_ids, colorId],
      };
    });
    setTouched(true);
  };

  const coloresFiltrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return colores;
    return colores.filter(c => (
      (c.nombre || '').toLowerCase().includes(q)
      || (c.color_general_nombre || '').toLowerCase().includes(q)
    ));
  }, [colores, search]);

  const gruposColor = useMemo(() => {
    const grupos = new Map();
    coloresFiltrados.forEach(color => {
      const key = color.color_general_nombre ? formatColorName(color.color_general_nombre) : 'Sin grupo';
      if (!grupos.has(key)) grupos.set(key, []);
      grupos.get(key).push(color);
    });
    return Array.from(grupos.entries()).map(([nombre, items]) => ({ nombre, items }));
  }, [coloresFiltrados]);

  const marcarColores = (ids, checked) => {
    setForm(prev => {
      const actual = new Set(prev.color_ids);
      const estrellas = new Set(prev.estrella_ids);
      ids.forEach(id => {
        if (checked) actual.add(id);
        else { actual.delete(id); estrellas.delete(id); }
      });
      return {
        ...prev,
        color_ids: Array.from(actual),
        estrella_ids: Array.from(estrellas),
      };
    });
    setTouched(true);
  };

  const copiarDesde = (reglaId) => {
    const regla = reglas.find(r => r.id === reglaId);
    if (!regla) return;
    setForm(prev => ({
      ...prev,
      color_ids: regla.color_ids || [],
      estrella_ids: regla.estrella_ids || [],
    }));
    setTouched(true);
    toast.success(`Colores copiados desde ${regla.nombre}`);
  };

  const guardar = async () => {
    if (!form.tipo_id) {
      toast.error('Selecciona un tipo para la regla');
      return;
    }
    if (form.color_ids.length === 0) {
      toast.error('Selecciona al menos un color');
      return;
    }
    setSaving(true);
    const payload = {
      nombre: (form.nombre || nombreSugerido).trim(),
      marca_id: form.marca_id || null,
      tipo_id: form.tipo_id || null,
      hilo_id: form.hilo_id || null,
      entalle_ids: form.entalle_ids,
      color_ids: form.color_ids,
      // Solo persistimos estrellas que sigan en la regla (defensivo)
      estrella_ids: (form.estrella_ids || []).filter(id => form.color_ids.includes(id)),
      activo: form.activo,
      orden: form.orden || 0,
    };
    try {
      const res = form.id
        ? await axios.put(`${API}/colores-reglas/${form.id}`, payload)
        : await axios.post(`${API}/colores-reglas`, payload);
      const saved = res.data;
      const reglasRes = await axios.get(`${API}/colores-reglas`);
      setReglas(reglasRes.data || []);
      cargarRegla(saved);
      toast.success('Regla de colores guardada');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al guardar regla');
    } finally {
      setSaving(false);
    }
  };

  const eliminar = async () => {
    if (!form.id) return;
    if (!window.confirm(`¿Eliminar la regla "${form.nombre}"?`)) return;
    try {
      await axios.delete(`${API}/colores-reglas/${form.id}`);
      toast.success('Regla eliminada');
      await cargar();
    } catch {
      toast.error('Error al eliminar regla');
    }
  };

  const totalSeleccionados = form.color_ids.length;

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 max-w-6xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Palette className="h-6 w-6" /> Reglas de colores
        </h2>
        <p className="text-muted-foreground text-sm">
          Define colores por marca, tipo y grupos de entalles. Usa una sola regla para entalles que comparten paleta.
        </p>
      </div>

      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr_auto] gap-3 items-end">
            <div>
              <Label className="text-xs">Regla</Label>
              <Select
                value={reglaActualId}
                onValueChange={(value) => {
                  if (value === NEW_VALUE) nuevaRegla();
                  else {
                    const regla = reglas.find(r => r.id === value);
                    if (regla) cargarRegla(regla);
                  }
                }}
              >
                <SelectTrigger><SelectValue placeholder="Seleccionar regla" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NEW_VALUE}>Nueva regla</SelectItem>
                  {reglas.map(r => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.nombre}
                      {r.hilo_nombre ? ` · Hilo ${r.hilo_nombre}` : ''}
                      {' '}({r.colores_count || 0})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Copiar colores desde</Label>
              <Select onValueChange={copiarDesde}>
                <SelectTrigger><SelectValue placeholder="Elegir otra regla" /></SelectTrigger>
                <SelectContent>
                  {reglas.filter(r => r.id !== form.id).map(r => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.nombre}
                      {r.hilo_nombre ? ` · Hilo ${r.hilo_nombre}` : ''}
                      {' '}({r.colores_count || 0})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={nuevaRegla}>
                <Plus className="h-4 w-4 mr-1" /> Nueva
              </Button>
              <Button type="button" variant="outline" onClick={eliminar} disabled={!form.id} className="text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4 mr-1" /> Eliminar
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div>
              <Label className="text-xs">Nombre de regla</Label>
              <Input value={form.nombre} onChange={(e) => setField('nombre', e.target.value)} placeholder={nombreSugerido} />
            </div>
            <div>
              <Label className="text-xs">Marca</Label>
              <Select value={form.marca_id || ALL_VALUE} onValueChange={(value) => setField('marca_id', value === ALL_VALUE ? '' : value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>Todas las marcas</SelectItem>
                  {marcas.map(m => <SelectItem key={m.id} value={m.id}>{m.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select
                value={form.tipo_id || ''}
                onValueChange={(value) => {
                  setForm(prev => ({ ...prev, tipo_id: value, entalle_ids: [] }));
                  setTouched(true);
                }}
              >
                <SelectTrigger><SelectValue placeholder="Seleccionar tipo" /></SelectTrigger>
                <SelectContent>
                  {tiposDisponibles.map(t => <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Hilo</Label>
              <Select
                value={form.hilo_id || ALL_VALUE}
                onValueChange={(value) => setField('hilo_id', value === ALL_VALUE ? '' : value)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>Cualquier hilo</SelectItem>
                  {hilos.map(h => <SelectItem key={h.id} value={h.id}>{h.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Buscar color</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Negro, Azul, Beige..." className="pl-8" />
              </div>
            </div>
          </div>

          <div className="rounded-md border bg-muted/20 p-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium flex items-center gap-1.5">
                  <Layers className="h-4 w-4" /> Entalles que comparten esta regla
                </div>
                <p className="text-xs text-muted-foreground">
                  Deja vacío para que aplique a todo el tipo. Marca varios para grupos como Semipitillo / Pitillo / Skinny.
                </p>
              </div>
              <Badge variant="secondary">{form.entalle_ids.length || 'Todos'}</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {entallesDelTipo.map(e => {
                const checked = form.entalle_ids.includes(e.id);
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => toggleEntalle(e.id)}
                    aria-pressed={checked}
                    className={`px-3 py-1.5 rounded-md text-sm flex items-center gap-2 ${selectableButtonClass(checked)}`}
                  >
                    <span className={selectionBoxClass(checked)}>
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    {e.nombre}
                  </button>
                );
              })}
              {entallesDelTipo.length === 0 && (
                <span className="text-xs text-muted-foreground">Selecciona un tipo para ver sus entalles.</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">
              Colores para {form.nombre || nombreSugerido}
              {touched && <span className="ml-2 text-xs font-normal text-amber-600">(cambios sin guardar)</span>}
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => marcarColores(coloresFiltrados.map(c => c.id), true)}>
                Marcar visibles
              </Button>
              <Button variant="outline" size="sm" onClick={() => marcarColores(coloresFiltrados.map(c => c.id), false)}>
                Limpiar visibles
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {gruposColor.map(grupo => {
            const idsGrupo = grupo.items.map(c => c.id);
            const marcadosGrupo = idsGrupo.filter(id => form.color_ids.includes(id)).length;
            return (
              <section key={grupo.nombre} className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold">
                    {grupo.nombre}
                    <span className="text-muted-foreground font-normal ml-2">{marcadosGrupo}/{idsGrupo.length}</span>
                  </div>
                  <div className="flex gap-1">
                    <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => marcarColores(idsGrupo, true)}>
                      Marcar grupo
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => marcarColores(idsGrupo, false)}>
                      Limpiar
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                  {grupo.items.map(c => {
                    const checked = form.color_ids.includes(c.id);
                    const isStar = form.estrella_ids.includes(c.id);
                    return (
                      <div
                        key={c.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleColor(c.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleColor(c.id); } }}
                        aria-pressed={checked}
                        className={`flex items-center gap-2 px-3 py-2 rounded-md min-w-0 cursor-pointer ${
                          isStar
                            ? 'border border-amber-300 bg-amber-50 text-amber-950 shadow-sm ring-1 ring-amber-100 hover:bg-amber-100'
                            : selectableButtonClass(checked)
                        }`}
                        title={formatColorName(c.nombre)}
                      >
                        <span className="text-sm truncate font-medium flex-1">{formatColorName(c.nombre)}</span>
                        {checked && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); toggleEstrella(c.id); }}
                            className={`shrink-0 p-0.5 rounded transition-colors ${
                              isStar ? 'text-amber-500 hover:text-amber-600' : 'text-slate-300 hover:text-amber-400'
                            }`}
                            title={isStar ? 'Quitar estrella (no es obligatorio en PT)' : 'Marcar estrella (debe tener stock siempre)'}
                          >
                            <Star className={`h-4 w-4 ${isStar ? 'fill-amber-400' : ''}`} />
                          </button>
                        )}
                        {checked && !isStar && <Check className="h-4 w-4 text-blue-600 shrink-0" />}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {gruposColor.length === 0 && (
            <div className="text-center text-muted-foreground py-8 text-sm">
              Sin resultados
            </div>
          )}
        </CardContent>
      </Card>

      <div className="sticky bottom-4 flex justify-end">
        <div className="bg-background border rounded-lg shadow-lg p-3 flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {totalSeleccionados} color{totalSeleccionados !== 1 ? 'es' : ''} en esta regla
          </span>
          <Button onClick={guardar} disabled={saving || !touched}>
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            {saving ? 'Guardando...' : 'Guardar regla'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ColoresPorTipo;
