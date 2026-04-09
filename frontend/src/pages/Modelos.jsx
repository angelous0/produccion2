import { useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useSaving } from '../hooks/useSaving';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent } from '../components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Checkbox } from '../components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { ModelosTallasTab, ModelosBOMTab } from './ModelosBOM';
import { Plus, Pencil, Trash2, Route, Search, X, ExternalLink, ChevronDown, Copy, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { SearchableSelect } from '../components/SearchableSelect';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const Modelos = ({ modo: modoProp }) => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [pageSize] = useState(50);
  const { saving, guard } = useSaving();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [modoVariante, setModoVariante] = useState(false);
  const [formData, setFormData] = useState({
    nombre: '', marca_id: '', tipo_id: '', entalle_id: '',
    tela_id: '', hilo_id: '', ruta_produccion_id: '', servicios_ids: [], pt_item_id: '',
    linea_negocio_id: '', base_id: '', hilo_especifico_id: '', muestra_modelo_id: '', muestra_base_id: '',
  });

  // Datos para los selects del dialog
  const [marcas, setMarcas] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [entalles, setEntalles] = useState([]);
  const [telas, setTelas] = useState([]);
  const [hilos, setHilos] = useState([]);
  const [hilosEspecificos, setHilosEspecificos] = useState([]);
  const [rutas, setRutas] = useState([]);
  const [servicios, setServicios] = useState([]);
  const [itemsPT, setItemsPT] = useState([]);
  const [lineasNegocio, setLineasNegocio] = useState([]);
  const [bases, setBases] = useState([]);
  const [muestrasModelos, setMuestrasModelos] = useState([]);
  const [muestrasBases, setMuestrasBases] = useState([]);

  // Filtros server-side
  const [searchTerm, setSearchTerm] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [filtroMarca, setFiltroMarca] = useState('todos');
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [filtroEntalle, setFiltroEntalle] = useState('todos');
  const [filtroTela, setFiltroTela] = useState('todos');
  const [filtroTipoModelo, setFiltroTipoModelo] = useState(modoProp || '');

  // Opciones de filtro desde el servidor
  const [filtroOpciones, setFiltroOpciones] = useState({ marcas: [], tipos: [], entalles: [], telas: [] });

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(searchTerm), 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchItems = useCallback(async (append = false) => {
    if (!append) setLoading(true);
    try {
      const offset = append ? items.length : 0;
      const params = new URLSearchParams({ limit: pageSize, offset });
      if (searchDebounced) params.set('search', searchDebounced);
      if (filtroMarca !== 'todos') params.set('marca', filtroMarca);
      if (filtroTipo !== 'todos') params.set('tipo', filtroTipo);
      if (filtroEntalle !== 'todos') params.set('entalle', filtroEntalle);
      if (filtroTela !== 'todos') params.set('tela', filtroTela);
      if (filtroTipoModelo) params.set('tipo_modelo', filtroTipoModelo);
      const response = await axios.get(`${API}/modelos?${params.toString()}`);
      const data = response.data;
      if (append) {
        setItems(prev => [...prev, ...data.items]);
      } else {
        setItems(data.items);
      }
      setTotal(data.total);
    } catch (error) {
      toast.error('Error al cargar modelos');
    } finally {
      setLoading(false);
    }
  }, [searchDebounced, filtroMarca, filtroTipo, filtroEntalle, filtroTela, filtroTipoModelo, pageSize, items.length]);

  const fetchFiltros = async () => {
    try {
      const res = await axios.get(`${API}/modelos-filtros`);
      setFiltroOpciones(res.data);
    } catch (e) {}
  };

  const relatedLoaded = useRef(false);

  const fetchRelatedData = async () => {
    if (relatedLoaded.current) return;
    try {
      const [marcasRes, tiposRes, entallesRes, telasRes, hilosRes, heRes, rutasRes, srvRes, ptRes, lnRes, basesRes, muestrasRes, muestrasBasesRes] = await Promise.all([
        axios.get(`${API}/marcas`),
        axios.get(`${API}/tipos`),
        axios.get(`${API}/entalles`),
        axios.get(`${API}/telas`),
        axios.get(`${API}/hilos`),
        axios.get(`${API}/hilos-especificos`),
        axios.get(`${API}/rutas-produccion`),
        axios.get(`${API}/servicios-produccion`),
        axios.get(`${API}/items-pt`),
        axios.get(`${API}/lineas-negocio`),
        axios.get(`${API}/modelos?all=true`),
        axios.get(`${API}/muestras-modelos`),
        axios.get(`${API}/muestras-bases`),
      ]);
      setMarcas(marcasRes.data);
      setTipos(tiposRes.data);
      setEntalles(entallesRes.data);
      setTelas(telasRes.data);
      setHilos(hilosRes.data);
      setHilosEspecificos(heRes.data);
      setRutas(rutasRes.data);
      setServicios(srvRes.data.sort((a, b) => (a.secuencia || 0) - (b.secuencia || 0)));
      setItemsPT(ptRes.data);
      setLineasNegocio(lnRes.data);
      setBases(basesRes.data.filter(m => !m.base_id));
      const mData = Array.isArray(muestrasRes.data) ? muestrasRes.data : [];
      setMuestrasModelos(mData);
      const mbData = Array.isArray(muestrasBasesRes.data) ? muestrasBasesRes.data : [];
      setMuestrasBases(mbData);
      relatedLoaded.current = true;
    } catch (error) {
      toast.error('Error al cargar datos relacionados');
    }
  };

  useEffect(() => {
    fetchFiltros();
    fetchRelatedData();
  }, []);

  // Reload when filters change
  useEffect(() => {
    fetchItems(false);
  }, [searchDebounced, filtroMarca, filtroTipo, filtroEntalle, filtroTela, filtroTipoModelo]);

  const hayFiltrosActivos = searchTerm || filtroMarca !== 'todos' || filtroTipo !== 'todos' || filtroEntalle !== 'todos' || filtroTela !== 'todos' || filtroTipoModelo !== '';

  const limpiarFiltros = () => {
    setSearchTerm('');
    setFiltroMarca('todos');
    setFiltroTipo('todos');
    setFiltroEntalle('todos');
    setFiltroTela('todos');
    setFiltroTipoModelo('');
  };

  const handleSubmit = guard(async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        ruta_produccion_id: formData.ruta_produccion_id || null,
        linea_negocio_id: formData.linea_negocio_id ? parseInt(formData.linea_negocio_id) : null,
        base_id: formData.base_id || null,
        hilo_especifico_id: formData.hilo_especifico_id || null,
        muestra_modelo_id: formData.muestra_modelo_id || null,
        muestra_base_id: formData.muestra_base_id || null,
      };
      // Si es variante, heredar campos de la base
      if (modoVariante && formData.base_id) {
        const base = bases.find(b => b.id === formData.base_id);
        if (base) {
          payload.marca_id = base.marca_id;
          payload.tipo_id = base.tipo_id;
          payload.entalle_id = base.entalle_id;
          payload.tela_id = base.tela_id;
          payload.hilo_id = base.hilo_id;
          payload.ruta_produccion_id = base.ruta_produccion_id || null;
          payload.servicios_ids = base.servicios_ids || [];
          payload.linea_negocio_id = base.linea_negocio_id || null;
        }
      }
      if (editingItem) {
        await axios.put(`${API}/modelos/${editingItem.id}`, payload);
        toast.success('Modelo actualizado');
      } else {
        await axios.post(`${API}/modelos`, payload);
        toast.success(modoVariante ? 'Variante creada' : 'Modelo base creado');
      }
      setDialogOpen(false);
      setEditingItem(null);
      resetForm();
      fetchItems(false);
    } catch (error) {
      toast.error('Error al guardar modelo');
    }
  });

  const resetForm = () => {
    setFormData({
      nombre: '', marca_id: '', tipo_id: '', entalle_id: '',
      tela_id: '', hilo_id: '', ruta_produccion_id: '', servicios_ids: [], pt_item_id: '',
      linea_negocio_id: '', base_id: '', hilo_especifico_id: '', muestra_modelo_id: '', muestra_base_id: '',
    });
    setModoVariante(false);
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setModoVariante(!!item.base_id);
    setFormData({
      nombre: item.nombre, marca_id: item.marca_id, tipo_id: item.tipo_id,
      entalle_id: item.entalle_id, tela_id: item.tela_id, hilo_id: item.hilo_id,
      ruta_produccion_id: item.ruta_produccion_id || '', servicios_ids: item.servicios_ids || [],
      pt_item_id: item.pt_item_id || '',
      linea_negocio_id: item.linea_negocio_id ? String(item.linea_negocio_id) : '',
      base_id: item.base_id || '',
      hilo_especifico_id: item.hilo_especifico_id || '',
      muestra_modelo_id: item.muestra_modelo_id || '',
      muestra_base_id: item.muestra_base_id || '',
    });
    fetchRelatedData();
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API}/modelos/${id}`);
      toast.success('Modelo eliminado');
      fetchItems(false);
    } catch (error) {
      toast.error('Error al eliminar modelo');
    }
  };

  const handleNew = (isVariante = false) => {
    setEditingItem(null);
    resetForm();
    setModoVariante(isVariante);
    fetchRelatedData();
    setDialogOpen(true);
  };

  const handleCrearVariante = (baseItem) => {
    setEditingItem(null);
    setModoVariante(true);
    setFormData({
      nombre: baseItem.nombre + ' - ',
      marca_id: baseItem.marca_id, tipo_id: baseItem.tipo_id,
      entalle_id: baseItem.entalle_id, tela_id: baseItem.tela_id, hilo_id: baseItem.hilo_id,
      ruta_produccion_id: baseItem.ruta_produccion_id || '',
      servicios_ids: baseItem.servicios_ids || [],
      pt_item_id: '',
      linea_negocio_id: baseItem.linea_negocio_id ? String(baseItem.linea_negocio_id) : '',
      base_id: baseItem.id,
      hilo_especifico_id: '',
      muestra_modelo_id: '',
      muestra_base_id: baseItem.muestra_base_id || '',
    });
    fetchRelatedData();
    setDialogOpen(true);
  };

  // Auto-generate nombre when base or hilo_especifico changes in variante mode
  const handleBaseChange = (baseId) => {
    const base = bases.find(b => b.id === baseId);
    if (base) {
      const heNombre = hilosEspecificos.find(h => h.id === formData.hilo_especifico_id)?.nombre || '';
      setFormData(prev => ({
        ...prev,
        base_id: baseId,
        marca_id: base.marca_id, tipo_id: base.tipo_id,
        entalle_id: base.entalle_id, tela_id: base.tela_id, hilo_id: base.hilo_id,
        ruta_produccion_id: base.ruta_produccion_id || '',
        servicios_ids: base.servicios_ids || [],
        linea_negocio_id: base.linea_negocio_id ? String(base.linea_negocio_id) : '',
        nombre: heNombre ? `${base.nombre} - ${heNombre}` : base.nombre + ' - ',
      }));
    }
  };

  const handleHiloEspChange = (heId) => {
    const heNombre = hilosEspecificos.find(h => h.id === heId)?.nombre || '';
    const baseName = bases.find(b => b.id === formData.base_id)?.nombre || '';
    setFormData(prev => ({
      ...prev,
      hilo_especifico_id: heId,
      nombre: baseName && heNombre ? `${baseName} - ${heNombre}` : prev.nombre,
    }));
  };

  const handleToggleServicio = (servicioId) => {
    const exists = formData.servicios_ids.includes(servicioId);
    setFormData({
      ...formData,
      servicios_ids: exists
        ? formData.servicios_ids.filter(id => id !== servicioId)
        : [...formData.servicios_ids, servicioId],
    });
  };

  const handleCrearPT = async () => {
    if (!editingItem) { toast.error('Guarda el modelo primero antes de crear su PT'); return; }
    try {
      const res = await axios.post(`${API}/modelos/${editingItem.id}/crear-pt`);
      setFormData({ ...formData, pt_item_id: res.data.pt_item_id });
      const ptRes = await axios.get(`${API}/items-pt`);
      setItemsPT(ptRes.data);
      toast.success(`PT creado: ${res.data.pt_item_nombre} (${res.data.pt_item_codigo})`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Error al crear PT');
    }
  };

  const handleVerRegistros = (modeloId) => {
    navigate(`/registros?modelo=${modeloId}`);
  };

  return (
    <div className="space-y-4" data-testid="modelos-page">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            {modoProp === 'base' ? 'Bases' : modoProp === 'variante' ? 'Modelos' : 'Modelos'}
          </h2>
          <p className="text-muted-foreground">
            {modoProp === 'base' ? 'Modelos base con marca, tipo, entalle, tela, hilo y ruta' : modoProp === 'variante' ? 'Variantes de base con hilo especifico y BOM propio' : 'Bases, variantes (con hilo especifico) y BOM'}
          </p>
        </div>
        <div className="flex gap-2">
          {modoProp !== 'variante' && (
            <Button variant="outline" onClick={() => handleNew(false)} data-testid="btn-nueva-base">
              <Plus className="h-4 w-4 mr-2" />
              Nueva Base
            </Button>
          )}
          {modoProp !== 'base' && (
            <Button onClick={() => handleNew(true)} data-testid="btn-nueva-variante">
              <Copy className="h-4 w-4 mr-2" />
              {modoProp === 'variante' ? 'Nuevo Modelo' : 'Nueva Variante'}
            </Button>
          )}
        </div>
      </div>

      {/* Barra de busqueda y filtros */}
      <div className="flex flex-wrap items-center gap-2" data-testid="filtros-modelos">
        <div className="relative flex-1 min-w-[220px] max-w-[320px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar nombre, marca, tipo, entalle, tela..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 pr-8"
            data-testid="input-search-modelos"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Select value={filtroMarca} onValueChange={setFiltroMarca}>
          <SelectTrigger className="w-[150px]" data-testid="filtro-marca">
            <SelectValue placeholder="Marca" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas marcas</SelectItem>
            {filtroOpciones.marcas.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="w-[150px]" data-testid="filtro-tipo">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos tipos</SelectItem>
            {filtroOpciones.tipos.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtroEntalle} onValueChange={setFiltroEntalle}>
          <SelectTrigger className="w-[150px]" data-testid="filtro-entalle">
            <SelectValue placeholder="Entalle" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos entalles</SelectItem>
            {filtroOpciones.entalles.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtroTela} onValueChange={setFiltroTela}>
          <SelectTrigger className="w-[150px]" data-testid="filtro-tela">
            <SelectValue placeholder="Tela" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas telas</SelectItem>
            {filtroOpciones.telas.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        {!modoProp && (
          <Select value={filtroTipoModelo || 'todos'} onValueChange={(v) => setFiltroTipoModelo(v === 'todos' ? '' : v)}>
            <SelectTrigger className="w-[150px]" data-testid="filtro-tipo-modelo">
              <SelectValue placeholder="Tipo Modelo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="base">Solo Bases</SelectItem>
              <SelectItem value="variante">Solo Variantes</SelectItem>
            </SelectContent>
          </Select>
        )}
        {hayFiltrosActivos && (
          <Button variant="ghost" size="sm" onClick={limpiarFiltros} data-testid="btn-limpiar-filtros">
            <X className="h-4 w-4 mr-1" /> Limpiar
          </Button>
        )}
        <span className="text-sm text-muted-foreground ml-auto" data-testid="count-modelos">
          {items.length} de {total}
        </span>
      </div>

      {/* Tabla tipo Excel */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="data-table-header">
                  <TableHead className="min-w-[160px]">Nombre</TableHead>
                  <TableHead>Muestra</TableHead>
                  {!modoProp && <TableHead className="w-[90px]">Jerarquia</TableHead>}
                  {modoProp === 'variante' && <TableHead>Base</TableHead>}
                  <TableHead>Linea</TableHead>
                  <TableHead>Marca</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Entalle</TableHead>
                  <TableHead>Tela</TableHead>
                  <TableHead>Hilo</TableHead>
                  {modoProp !== 'base' && <TableHead>Hilo Esp.</TableHead>}
                  <TableHead>Ruta Prod.</TableHead>
                  {modoProp === 'base' && <TableHead className="text-center">Modelos</TableHead>}
                  <TableHead className="text-center">Registros</TableHead>
                  <TableHead className="w-[110px]">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={14} className="text-center py-8">Cargando...</TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={14} className="text-center py-8 text-muted-foreground">
                      {hayFiltrosActivos ? 'No hay modelos que coincidan con los filtros' : 'No hay modelos registrados'}
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => (
                    <TableRow key={item.id} className="data-table-row" data-testid={`modelo-row-${item.id}`}>
                      <TableCell className="font-medium">{item.nombre}</TableCell>
                      <TableCell className="text-xs">
                        {modoProp === 'base' ? (
                          item.muestra_base_nombre
                            ? <Badge variant="outline" className="text-[10px] border-violet-300 text-violet-700 bg-violet-50 whitespace-nowrap">{item.muestra_base_nombre}</Badge>
                            : <span className="text-muted-foreground">-</span>
                        ) : (
                          item.muestra_nombre
                            ? <Badge variant="outline" className="text-[10px] border-violet-300 text-violet-700 bg-violet-50 whitespace-nowrap">{item.muestra_nombre}</Badge>
                            : <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      {!modoProp && (
                        <TableCell>
                          {item.base_id ? (
                            <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-700 bg-blue-50">Variante</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">Base</Badge>
                          )}
                        </TableCell>
                      )}
                      {modoProp === 'variante' && (
                        <TableCell className="text-sm">
                          {item.base_nombre ? (
                            <span className="text-blue-700 font-medium">{item.base_nombre}</span>
                          ) : <span className="text-muted-foreground">-</span>}
                        </TableCell>
                      )}
                      <TableCell className="text-xs">
                        {item.linea_negocio_nombre 
                          ? <Badge variant="secondary" className="text-[10px]">{item.linea_negocio_nombre}</Badge>
                          : <span className="text-muted-foreground">Global</span>}
                      </TableCell>
                      <TableCell className="text-sm">{item.marca_nombre || '-'}</TableCell>
                      <TableCell className="text-sm">{item.tipo_nombre || '-'}</TableCell>
                      <TableCell className="text-sm">{item.entalle_nombre || '-'}</TableCell>
                      <TableCell className="text-sm">{item.tela_nombre || '-'}</TableCell>
                      <TableCell className="text-sm">{item.hilo_nombre || '-'}</TableCell>
                      {modoProp !== 'base' && (
                        <TableCell className="text-sm">{item.hilo_especifico_nombre || '-'}</TableCell>
                      )}
                      <TableCell>
                        {item.ruta_nombre ? (
                          <Badge variant="outline" className="text-xs whitespace-nowrap">
                            <Route className="h-3 w-3 mr-1" />
                            {item.ruta_nombre}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">Sin ruta</span>
                        )}
                      </TableCell>
                      {modoProp === 'base' && (
                        <TableCell className="text-center">
                          {item.variantes_count > 0 ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs font-semibold text-purple-600 hover:text-purple-800 hover:bg-purple-50"
                              onClick={() => navigate('/modelos')}
                              data-testid={`ver-variantes-${item.id}`}
                            >
                              {item.variantes_count}
                              <ExternalLink className="h-3 w-3 ml-1" />
                            </Button>
                          ) : (
                            <span className="text-muted-foreground text-xs">0</span>
                          )}
                        </TableCell>
                      )}
                      <TableCell className="text-center">
                        {item.registros_count > 0 ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                            onClick={() => handleVerRegistros(item.id)}
                            data-testid={`ver-registros-${item.id}`}
                          >
                            {item.registros_count}
                            <ExternalLink className="h-3 w-3 ml-1" />
                          </Button>
                        ) : (
                          <span className="text-muted-foreground text-xs">0</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {modoProp === 'base' && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleCrearVariante(item)} title="Crear Modelo" data-testid={`crear-variante-${item.id}`}>
                              <Copy className="h-3.5 w-3.5 text-blue-600" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(item)} data-testid={`edit-modelo-${item.id}`}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(item.id)} data-testid={`delete-modelo-${item.id}`}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {/* Cargar mas */}
          {items.length < total && !loading && (
            <div className="flex justify-center py-4 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchItems(true)}
                data-testid="btn-cargar-mas-modelos"
              >
                <ChevronDown className="h-4 w-4 mr-2" />
                Cargar mas ({items.length} de {total})
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de edicion/creacion */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingItem
                ? (modoVariante ? 'Editar Variante' : 'Editar Modelo Base')
                : (modoVariante ? 'Nueva Variante' : 'Nuevo Modelo Base')}
            </DialogTitle>
            <DialogDescription>
              {modoVariante
                ? 'Selecciona la base y el hilo especifico. Los campos se heredan de la base.'
                : 'Configura el modelo base con sus materiales y servicios requeridos'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <Tabs defaultValue="general" className="w-full">
              <TabsList className={`grid w-full ${modoVariante ? 'grid-cols-2' : 'grid-cols-3'}`}>
                <TabsTrigger value="general">General</TabsTrigger>
                {!modoVariante && <TabsTrigger value="tallas">Tallas</TabsTrigger>}
                {modoVariante && <TabsTrigger value="bom">BOM / Receta</TabsTrigger>}
                {!modoVariante && <TabsTrigger value="produccion">Produccion</TabsTrigger>}
              </TabsList>

              <TabsContent value="general" className="space-y-4 mt-4">
                {modoVariante ? (
                  <>
                    {/* VARIANTE MODE */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Modelo Base *</Label>
                        <SearchableSelect
                          value={formData.base_id}
                          onValueChange={handleBaseChange}
                          options={bases.map(b => ({ id: b.id, nombre: b.nombre }))}
                          placeholder="Seleccionar base..."
                          searchPlaceholder="Buscar base..."
                          testId="select-base-variante"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Hilo Especifico *</Label>
                        <SearchableSelect
                          value={formData.hilo_especifico_id}
                          onValueChange={handleHiloEspChange}
                          options={hilosEspecificos.map(h => ({ id: h.id, nombre: h.nombre }))}
                          placeholder="Seleccionar hilo especifico..."
                          searchPlaceholder="Buscar hilo especifico..."
                          testId="select-hilo-especifico-variante"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="nombre-variante">Nombre (auto-generado, editable)</Label>
                        <Input id="nombre-variante" value={formData.nombre} onChange={(e) => setFormData({ ...formData, nombre: e.target.value })} placeholder="Base - Hilo Especifico" required data-testid="input-nombre-variante" />
                      </div>
                      <div className="space-y-2">
                        <Label>Modelo Muestra</Label>
                        <SearchableSelect
                          value={formData.muestra_modelo_id}
                          onValueChange={(v) => setFormData({ ...formData, muestra_modelo_id: v })}
                          options={muestrasModelos.map(m => ({ id: m.id, nombre: `${m.nombre} (${m.hilo_nombre || '-'})` }))}
                          placeholder="Vincular con muestra..."
                          searchPlaceholder="Buscar modelo muestra..."
                          testId="select-muestra-modelo-variante"
                        />
                      </div>
                    </div>
                    {formData.base_id && (
                      <div className="rounded-md bg-muted/50 border p-3 text-xs text-muted-foreground space-y-1">
                        <p className="font-medium text-foreground flex items-center gap-1"><Layers className="h-3 w-3" /> Campos heredados de la base:</p>
                        <p>Marca: {bases.find(b => b.id === formData.base_id)?.marca_nombre || '-'} | Tipo: {bases.find(b => b.id === formData.base_id)?.tipo_nombre || '-'} | Entalle: {bases.find(b => b.id === formData.base_id)?.entalle_nombre || '-'} | Tela: {bases.find(b => b.id === formData.base_id)?.tela_nombre || '-'} | Hilo: {bases.find(b => b.id === formData.base_id)?.hilo_nombre || '-'}</p>
                        <p>Ruta: {bases.find(b => b.id === formData.base_id)?.ruta_nombre || 'Sin ruta'}</p>
                      </div>
                    )}
                    <div className="space-y-2 border-t pt-4">
                      <Label>Articulo PT (Producto Terminado)</Label>
                      <p className="text-xs text-muted-foreground">Item de inventario valorizado que se creara al cerrar la produccion</p>
                      <div className="flex gap-2">
                        <Select value={formData.pt_item_id || 'none'} onValueChange={(value) => setFormData({ ...formData, pt_item_id: value === 'none' ? '' : value })}>
                          <SelectTrigger data-testid="select-pt-item" className="flex-1"><SelectValue placeholder="Seleccionar PT..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sin PT asignado</SelectItem>
                            {itemsPT.map((pt) => <SelectItem key={pt.id} value={pt.id}>{pt.codigo} - {pt.nombre}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Button type="button" variant="outline" size="sm" onClick={handleCrearPT} data-testid="btn-crear-pt" title="Crear PT automatico con el nombre del modelo">
                          <Plus className="h-4 w-4 mr-1" /> Crear PT
                        </Button>
                      </div>
                      {formData.pt_item_id && <p className="text-xs text-green-600">PT vinculado correctamente</p>}
                    </div>
                  </>
                ) : (
                  <>
                    {/* BASE MODE */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="nombre">Nombre *</Label>
                        <Input id="nombre" value={formData.nombre} onChange={(e) => setFormData({ ...formData, nombre: e.target.value })} placeholder="Nombre del modelo base" required data-testid="input-nombre-modelo" />
                      </div>
                      <div className="space-y-2">
                        <Label>Base Muestra</Label>
                        <SearchableSelect
                          value={formData.muestra_base_id}
                          onValueChange={(v) => setFormData({ ...formData, muestra_base_id: v })}
                          options={muestrasBases.map(m => ({ id: m.id, nombre: m.nombre }))}
                          placeholder="Vincular con muestra..."
                          searchPlaceholder="Buscar base muestra..."
                          testId="select-muestra-base"
                        />
                      </div>
                    </div>
                    {formData.muestra_base_id && (() => {
                      const mb = muestrasBases.find(m => m.id === formData.muestra_base_id);
                      return mb ? (
                        <div className="rounded-md bg-violet-50 border border-violet-200 p-3 text-xs space-y-1">
                          <p className="font-medium text-violet-800">Referencia de muestra: {mb.nombre}</p>
                          <p className="text-violet-600">Marca: {mb.marca_nombre || '-'} | Tipo: {mb.tipo_nombre || '-'} | Entalle: {mb.entalle_nombre || '-'} | Tela: {mb.tela_nombre || '-'}</p>
                        </div>
                      ) : null;
                    })()}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Linea de Negocio</Label>
                        <Select value={formData.linea_negocio_id || 'none'} onValueChange={(v) => setFormData({ ...formData, linea_negocio_id: v === 'none' ? '' : v })}>
                          <SelectTrigger data-testid="select-linea-negocio"><SelectValue placeholder="Seleccionar linea..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sin linea (Global)</SelectItem>
                            {lineasNegocio.map(ln => <SelectItem key={ln.id} value={String(ln.id)}>{ln.nombre}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Marca</Label>
                        <SearchableSelect
                          value={formData.marca_id}
                          onValueChange={(value) => setFormData({ ...formData, marca_id: value })}
                          options={marcas}
                          placeholder="Buscar marca..."
                          searchPlaceholder="Buscar marca..."
                          testId="select-marca"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Tipo</Label>
                        <SearchableSelect
                          value={formData.tipo_id}
                          onValueChange={(value) => setFormData({ ...formData, tipo_id: value })}
                          options={tipos}
                          placeholder="Buscar tipo..."
                          searchPlaceholder="Buscar tipo..."
                          testId="select-tipo"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Entalle</Label>
                        <SearchableSelect
                          value={formData.entalle_id}
                          onValueChange={(value) => setFormData({ ...formData, entalle_id: value })}
                          options={entalles}
                          placeholder="Buscar entalle..."
                          searchPlaceholder="Buscar entalle..."
                          testId="select-entalle"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Tela</Label>
                        <SearchableSelect
                          value={formData.tela_id}
                          onValueChange={(value) => setFormData({ ...formData, tela_id: value })}
                          options={telas}
                          placeholder="Buscar tela..."
                          searchPlaceholder="Buscar tela..."
                          testId="select-tela"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Hilo</Label>
                        <SearchableSelect
                          value={formData.hilo_id}
                          onValueChange={(value) => setFormData({ ...formData, hilo_id: value })}
                          options={hilos}
                          placeholder="Buscar hilo..."
                          searchPlaceholder="Buscar hilo..."
                          testId="select-hilo"
                        />
                      </div>
                    </div>
                  </>
                )}
              </TabsContent>

              <TabsContent value="tallas" className="space-y-4 mt-4">
                {editingItem ? <ModelosTallasTab modeloId={editingItem.id} /> : <p className="text-sm text-muted-foreground">Primero crea el modelo para poder asignarle tallas.</p>}
              </TabsContent>

              <TabsContent value="bom" className="space-y-4 mt-4">
                {editingItem ? <ModelosBOMTab modeloId={editingItem.id} lineaNegocioId={editingItem.linea_negocio_id} /> : <p className="text-sm text-muted-foreground">Primero crea el modelo para poder definir su BOM.</p>}
              </TabsContent>

              <TabsContent value="produccion" className="space-y-4 mt-4">
                {modoVariante ? (
                  <div className="rounded-md bg-muted/50 border p-4 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">Produccion heredada de la base</p>
                    <p className="mt-1">La ruta de produccion y los servicios se heredan automaticamente del modelo base seleccionado.</p>
                  </div>
                ) : (
                <>
                <div className="space-y-2">
                  <Label>Ruta de Produccion</Label>
                  <p className="text-xs text-muted-foreground">Define la secuencia de estados para los registros de este modelo</p>
                  <Select value={formData.ruta_produccion_id} onValueChange={(value) => {
                    const rutaId = value === 'none' ? '' : value;
                    const ruta = rutas.find(r => r.id === rutaId);
                    // Auto-poblar servicios desde las etapas de la ruta
                    let nuevosServicios = [...formData.servicios_ids];
                    if (ruta?.etapas) {
                      const serviciosRuta = ruta.etapas
                        .filter(e => e.servicio_id)
                        .map(e => e.servicio_id);
                      // Agregar sin duplicar, mantener los que ya estaban
                      serviciosRuta.forEach(sId => {
                        if (!nuevosServicios.includes(sId)) nuevosServicios.push(sId);
                      });
                    }
                    setFormData({ ...formData, ruta_produccion_id: rutaId, servicios_ids: nuevosServicios });
                  }}>
                    <SelectTrigger data-testid="select-ruta"><SelectValue placeholder="Seleccionar ruta..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin ruta (estados globales)</SelectItem>
                      {rutas.map((r) => <SelectItem key={r.id} value={r.id}>{r.nombre} ({r.etapas?.length || 0} etapas)</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Servicios Requeridos</Label>
                  <p className="text-xs text-muted-foreground">Auto-completados desde la ruta. Puedes agregar o quitar.</p>
                  <div className="grid grid-cols-3 gap-1.5 border rounded-md p-2.5">
                    {servicios.map((srv) => {
                      const checked = formData.servicios_ids.includes(srv.id);
                      return (
                        <label key={srv.id} className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-xs cursor-pointer transition-colors ${checked ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted border border-transparent'}`}>
                          <Checkbox checked={checked} onCheckedChange={() => handleToggleServicio(srv.id)} data-testid={`checkbox-servicio-${srv.id}`} className="h-3.5 w-3.5" />
                          <span className={checked ? 'font-medium' : 'text-muted-foreground'}>{srv.nombre}</span>
                        </label>
                      );
                    })}
                    {servicios.length === 0 && <p className="col-span-3 text-xs text-muted-foreground text-center py-2">No hay servicios disponibles</p>}
                  </div>
                </div>
                </>
                )}
              </TabsContent>
            </Tabs>

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving} data-testid="btn-guardar-modelo">{editingItem ? 'Guardar Cambios' : 'Crear Modelo'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};


export const ModelosBases = () => <Modelos modo="base" />;
export const ModelosVariantes = () => <Modelos modo="variante" />;
