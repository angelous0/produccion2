import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useSaving } from '../hooks/useSaving';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Separator } from '../components/ui/separator';
import { Plus, Pencil, Trash2, AlertTriangle, Eye, Palette, Scissors, Package, Cog, Clock, PauseCircle, PlayCircle, FileWarning, Calendar, User, Search, X, Filter, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { NumericInput } from '../components/ui/numeric-input';
import { getStatusClass } from '../lib/utils';
import { MultiSelectColors } from '../components/MultiSelectColors';
import { formatDate, formatRelativeDate } from '../lib/dateUtils';
import { ExportButton } from '../components/ExportButton';
import { RegistroDetalleFase2 } from './RegistroDetalleFase2';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const TIPOS_INCIDENCIA = [
  { value: 'FALTA_MATERIAL', label: 'Falta Material' },
  { value: 'FALTA_AVIOS', label: 'Falta Avíos' },
  { value: 'RETRASO_TALLER', label: 'Retraso Taller' },
  { value: 'CALIDAD', label: 'Calidad' },
  { value: 'CAMBIO_PRIORIDAD', label: 'Cambio Prioridad' },
  { value: 'OTRO', label: 'Otro' },
];

const MOTIVOS_PARALIZACION = [
  { value: 'FALTA_MATERIAL', label: 'Falta Material' },
  { value: 'FALTA_AVIOS', label: 'Falta Avíos' },
  { value: 'CALIDAD', label: 'Calidad' },
  { value: 'TALLER', label: 'Taller' },
  { value: 'OTRO', label: 'Otro' },
];

const getEstadoOperativoBadge = (estado) => {
  switch (estado) {
    case 'PARALIZADA':
      return <Badge className="bg-red-600 text-white" data-testid="badge-paralizada">Paralizada</Badge>;
    case 'EN_RIESGO':
      return <Badge className="bg-amber-500 text-white" data-testid="badge-en-riesgo">En Riesgo</Badge>;
    default:
      return <Badge variant="outline" className="text-green-600 border-green-600" data-testid="badge-normal">Normal</Badge>;
  }
};

const getFechaEntregaBadge = (fecha, estado) => {
  if (!fecha) return <span className="text-muted-foreground text-sm">-</span>;
  if (estado === 'Almacén PT') return <span className="text-sm font-mono">{formatDate(fecha)}</span>;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const entrega = new Date(fecha + 'T00:00:00');
  const diffDays = Math.ceil((entrega - hoy) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return <span className="text-red-600 font-semibold text-sm font-mono">{formatDate(fecha)} (vencido)</span>;
  if (diffDays <= 3) return <span className="text-amber-600 font-semibold text-sm font-mono">{formatDate(fecha)} ({diffDays}d)</span>;
  return <span className="text-sm font-mono">{formatDate(fecha)}</span>;
};

export const Registros = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const { saving, guard } = useSaving();
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [coloresDialogOpen, setColoresDialogOpen] = useState(false);
  const [viewingItem, setViewingItem] = useState(null);
  const [colorEditItem, setColorEditItem] = useState(null);
  
  // Datos para distribución de colores
  const [coloresSeleccionados, setColoresSeleccionados] = useState([]);
  const [matrizCantidades, setMatrizCantidades] = useState({});
  const [coloresCatalogo, setColoresCatalogo] = useState([]);
  
  // Control de producción
  const [controlDialogOpen, setControlDialogOpen] = useState(false);
  const [controlItem, setControlItem] = useState(null);
  const [controlData, setControlData] = useState({ fecha_entrega_esperada: '', responsable_actual: '' });
  
  // Incidencias
  const [incidenciasDialogOpen, setIncidenciasDialogOpen] = useState(false);
  const [incidenciasItem, setIncidenciasItem] = useState(null);
  const [incidencias, setIncidencias] = useState([]);
  const [incidenciaForm, setIncidenciaForm] = useState({ tipo: '', comentario: '' });
  
  // Paralizaciones
  const [paralizacionDialogOpen, setParalizacionDialogOpen] = useState(false);
  const [paralizacionItem, setParalizacionItem] = useState(null);
  const [paralizaciones, setParalizaciones] = useState([]);
  const [paralizacionForm, setParalizacionForm] = useState({ motivo: '', comentario: '' });

  // Búsqueda y filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [estadosExcluidos, setEstadosExcluidos] = useState(['Tienda']);
  const [estadosIncluidos, setEstadosIncluidos] = useState([]);
  const [modoFiltro, setModoFiltro] = useState('excluir'); // 'incluir' o 'excluir'
  const [filtroOperativo, setFiltroOperativo] = useState('todos');
  const [filtroUrgente, setFiltroUrgente] = useState(false);
  const [filtroModeloId, setFiltroModeloId] = useState(searchParams.get('modelo') || '');
  const [filtroLinea, setFiltroLinea] = useState('');
  const [filtroMarcas, setFiltroMarcas] = useState([]);
  const [filtroTipos, setFiltroTipos] = useState([]);
  const [filtroEntalles, setFiltroEntalles] = useState([]);
  const [filtroTelas, setFiltroTelas] = useState([]);
  const [filtrosPanelOpen, setFiltrosPanelOpen] = useState(false);
  const [filtroDropdownOpen, setFiltroDropdownOpen] = useState(null); // 'marca' | 'tipo' | 'entalle' | 'tela' | null
  const [lineasNegocio, setLineasNegocio] = useState([]);
  const [opcionesFiltro, setOpcionesFiltro] = useState({ marcas: [], tipos: [], entalles: [], telas: [] });
  const [estadosDisponibles, setEstadosDisponibles] = useState([]);
  const [total, setTotal] = useState(0);
  const [pageSize] = useState(50);
  const [estadoDropdownOpen, setEstadoDropdownOpen] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(searchTerm), 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchItems = async (append = false) => {
    if (!append) setLoading(true);
    try {
      const offset = append ? items.length : 0;
      const params = new URLSearchParams({ limit: pageSize, offset });
      if (searchDebounced) params.set('search', searchDebounced);
      if (modoFiltro === 'incluir' && estadosIncluidos.length > 0) {
        params.set('estados', estadosIncluidos.join(','));
        params.set('excluir_estados', '');
      } else if (modoFiltro === 'excluir' && estadosExcluidos.length > 0) {
        params.set('excluir_estados', estadosExcluidos.join(','));
      } else {
        params.set('excluir_estados', '');
      }
      if (filtroModeloId) params.set('modelo_id', filtroModeloId);
      if (filtroLinea) params.set('linea_negocio_id', filtroLinea);
      if (filtroMarcas.length > 0) params.set('marca_id', filtroMarcas.join(','));
      if (filtroTipos.length > 0) params.set('tipo_id', filtroTipos.join(','));
      if (filtroEntalles.length > 0) params.set('entalle_id', filtroEntalles.join(','));
      if (filtroTelas.length > 0) params.set('tela_id', filtroTelas.join(','));
      const response = await axios.get(`${API}/registros?${params.toString()}`);
      const data = response.data;
      if (append) {
        setItems(prev => [...prev, ...data.items]);
      } else {
        setItems(data.items);
      }
      setTotal(data.total);
    } catch (error) {
      toast.error('Error al cargar registros');
    } finally {
      setLoading(false);
    }
  };

  const fetchEstados = async () => {
    try {
      const response = await axios.get(`${API}/registros-estados`);
      setEstadosDisponibles(response.data);
    } catch (e) {}
  };

  const fetchColores = async () => {
    try {
      const response = await axios.get(`${API}/colores-catalogo`);
      setColoresCatalogo(response.data);
    } catch (error) {
      console.error('Error fetching colores:', error);
    }
  };

  const fetchFiltrosModelo = async () => {
    try {
      const params = new URLSearchParams();
      if (filtroMarcas.length > 0) params.set('marca_id', filtroMarcas.join(','));
      if (filtroTipos.length > 0) params.set('tipo_id', filtroTipos.join(','));
      if (filtroEntalles.length > 0) params.set('entalle_id', filtroEntalles.join(','));
      if (filtroTelas.length > 0) params.set('tela_id', filtroTelas.join(','));
      const r = await axios.get(`${API}/registros/filtros-modelo?${params.toString()}`);
      setOpcionesFiltro(r.data);
    } catch { }
  };

  useEffect(() => {
    fetchEstados();
    fetchColores();
    axios.get(`${API}/lineas-negocio`).then(r => setLineasNegocio(r.data)).catch(() => {});
    fetchFiltrosModelo();
  }, []);

  // Re-fetch opciones en cascada cuando cambian las selecciones
  useEffect(() => {
    fetchFiltrosModelo();
  }, [filtroMarcas, filtroTipos, filtroEntalles, filtroTelas]);

  // Reload when filters change
  useEffect(() => {
    fetchItems(false);
  }, [searchDebounced, estadosExcluidos, estadosIncluidos, modoFiltro, filtroOperativo, filtroModeloId, filtroLinea, filtroMarcas, filtroTipos, filtroEntalles, filtroTelas]);

  // ========== LÓGICA DE COLORES ==========

  const handleOpenColoresDialog = (item) => {
    setColorEditItem(item);
    
    if (item.distribucion_colores && item.distribucion_colores.length > 0) {
      const coloresUnicos = [];
      const matriz = {};
      
      item.distribucion_colores.forEach(talla => {
        (talla.colores || []).forEach(c => {
          if (!coloresUnicos.find(cu => cu.id === c.color_id)) {
            const colorCat = coloresCatalogo.find(cc => cc.id === c.color_id);
            if (colorCat) {
              coloresUnicos.push(colorCat);
            }
          }
          const key = `${c.color_id}_${talla.talla_id}`;
          matriz[key] = c.cantidad;
        });
      });
      
      setColoresSeleccionados(coloresUnicos);
      setMatrizCantidades(matriz);
    } else {
      setColoresSeleccionados([]);
      setMatrizCantidades({});
    }
    
    setColoresDialogOpen(true);
  };

  const handleToggleColor = (colorId) => {
    const color = coloresCatalogo.find(c => c.id === colorId);
    if (!color) return;
    
    const existe = coloresSeleccionados.find(c => c.id === colorId);
    
    if (existe) {
      setColoresSeleccionados(coloresSeleccionados.filter(c => c.id !== colorId));
      const nuevaMatriz = { ...matrizCantidades };
      Object.keys(nuevaMatriz).forEach(key => {
        if (key.startsWith(`${colorId}_`)) {
          delete nuevaMatriz[key];
        }
      });
      setMatrizCantidades(nuevaMatriz);
    } else {
      const esElPrimero = coloresSeleccionados.length === 0;
      setColoresSeleccionados([...coloresSeleccionados, color]);
      
      if (esElPrimero && colorEditItem?.tallas) {
        const nuevaMatriz = { ...matrizCantidades };
        colorEditItem.tallas.forEach(t => {
          nuevaMatriz[`${colorId}_${t.talla_id}`] = t.cantidad;
        });
        setMatrizCantidades(nuevaMatriz);
      }
    }
  };

  // Handler para el multiselect de colores
  const handleColoresChange = (nuevosColores) => {
    // Detectar si se agregó un nuevo color
    const coloresAgregados = nuevosColores.filter(
      nc => !coloresSeleccionados.find(cs => cs.id === nc.id)
    );
    
    // Detectar si se removió un color
    const coloresRemovidos = coloresSeleccionados.filter(
      cs => !nuevosColores.find(nc => nc.id === cs.id)
    );
    
    // Limpiar matriz para colores removidos
    if (coloresRemovidos.length > 0) {
      const nuevaMatriz = { ...matrizCantidades };
      coloresRemovidos.forEach(color => {
        Object.keys(nuevaMatriz).forEach(key => {
          if (key.startsWith(`${color.id}_`)) {
            delete nuevaMatriz[key];
          }
        });
      });
      setMatrizCantidades(nuevaMatriz);
    }
    
    // Si es el primer color agregado, asignar todo el total
    if (coloresSeleccionados.length === 0 && coloresAgregados.length > 0 && colorEditItem?.tallas) {
      const primerColor = coloresAgregados[0];
      const nuevaMatriz = { ...matrizCantidades };
      colorEditItem.tallas.forEach(t => {
        nuevaMatriz[`${primerColor.id}_${t.talla_id}`] = t.cantidad;
      });
      setMatrizCantidades(nuevaMatriz);
    }
    
    setColoresSeleccionados(nuevosColores);
  };

  const getCantidadMatriz = (colorId, tallaId) => {
    return matrizCantidades[`${colorId}_${tallaId}`] || 0;
  };

  const handleMatrizChange = (colorId, tallaId, valor) => {
    const cantidad = parseInt(valor) || 0;
    const talla = colorEditItem?.tallas?.find(t => t.talla_id === tallaId);
    
    if (!talla) return;
    
    let sumaOtros = 0;
    coloresSeleccionados.forEach(c => {
      if (c.id !== colorId) {
        sumaOtros += getCantidadMatriz(c.id, tallaId);
      }
    });
    
    if (cantidad + sumaOtros > talla.cantidad) {
      toast.error(`La suma (${cantidad + sumaOtros}) excede el total de la talla ${talla.talla_nombre} (${talla.cantidad})`);
      return;
    }
    
    setMatrizCantidades({
      ...matrizCantidades,
      [`${colorId}_${tallaId}`]: cantidad
    });
  };

  const getTotalColor = (colorId) => {
    let total = 0;
    (colorEditItem?.tallas || []).forEach(t => {
      total += getCantidadMatriz(colorId, t.talla_id);
    });
    return total;
  };

  const getTotalTallaAsignado = (tallaId) => {
    let total = 0;
    coloresSeleccionados.forEach(c => {
      total += getCantidadMatriz(c.id, tallaId);
    });
    return total;
  };

  const getTotalGeneralAsignado = () => {
    let total = 0;
    coloresSeleccionados.forEach(c => {
      total += getTotalColor(c.id);
    });
    return total;
  };

  const handleSaveColores = guard(async () => {
    try {
      const distribucion = (colorEditItem?.tallas || []).map(t => ({
        talla_id: t.talla_id,
        talla_nombre: t.talla_nombre,
        cantidad_total: t.cantidad,
        colores: coloresSeleccionados.map(c => ({
          color_id: c.id,
          color_nombre: c.nombre,
          cantidad: getCantidadMatriz(c.id, t.talla_id)
        })).filter(c => c.cantidad > 0)
      }));
      
      const payload = {
        n_corte: colorEditItem.n_corte,
        modelo_id: colorEditItem.modelo_id,
        curva: colorEditItem.curva,
        estado: colorEditItem.estado,
        urgente: colorEditItem.urgente,
        tallas: colorEditItem.tallas,
        distribucion_colores: distribucion
      };
      
      await axios.put(`${API}/registros/${colorEditItem.id}`, payload);
      toast.success('Distribución de colores guardada');
      setColoresDialogOpen(false);
      setColorEditItem(null);
      setColoresSeleccionados([]);
      setMatrizCantidades({});
      fetchItems();
    } catch (error) {
      toast.error('Error al guardar distribución de colores');
    }
  });

  const handleView = (item) => {
    setViewingItem(item);
    setViewDialogOpen(true);
  };

  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const handleDelete = (id) => {
    const reg = items.find(i => i.id === id);
    setDeleteConfirm(reg || { id });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await axios.delete(`${API}/registros/${deleteConfirm.id}`);
      toast.success('Registro eliminado');
      setDeleteConfirm(null);
      fetchItems();
    } catch (error) {
      toast.error('Error al eliminar registro');
    }
  };

  const getTotalPiezas = (registro) => {
    if (!registro.tallas) return 0;
    return registro.tallas.reduce((sum, t) => sum + (t.cantidad || 0), 0);
  };

  const tieneColores = (registro) => {
    return registro.distribucion_colores && 
           registro.distribucion_colores.some(t => t.colores && t.colores.length > 0);
  };

  // ========== CONTROL DE PRODUCCIÓN ==========
  
  const handleOpenControl = (item) => {
    setControlItem(item);
    setControlData({
      fecha_entrega_final: item.fecha_entrega_final || '',
    });
    setControlDialogOpen(true);
  };

  const handleSaveControl = guard(async () => {
    try {
      await axios.put(`${API}/registros/${controlItem.id}/control`, controlData);
      toast.success('Control actualizado');
      setControlDialogOpen(false);
      fetchItems();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Error al actualizar');
    }
  });

  // ========== INCIDENCIAS ==========

  const handleOpenIncidencias = async (item) => {
    setIncidenciasItem(item);
    setIncidenciaForm({ tipo: '', comentario: '' });
    try {
      const res = await axios.get(`${API}/incidencias/${item.id}`);
      setIncidencias(res.data);
    } catch { setIncidencias([]); }
    setIncidenciasDialogOpen(true);
  };

  const handleCreateIncidencia = guard(async () => {
    if (!incidenciaForm.tipo) { toast.error('Selecciona un tipo'); return; }
    try {
      await axios.post(`${API}/incidencias`, {
        registro_id: incidenciasItem.id,
        tipo: incidenciaForm.tipo,
        comentario: incidenciaForm.comentario,
        usuario: 'eduard',
      });
      toast.success('Incidencia registrada');
      setIncidenciaForm({ tipo: '', comentario: '' });
      const res = await axios.get(`${API}/incidencias/${incidenciasItem.id}`);
      setIncidencias(res.data);
      fetchItems();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Error al registrar');
    }
  });

  const handleResolverIncidencia = guard(async (incId) => {
    try {
      await axios.put(`${API}/incidencias/${incId}`, { estado: 'RESUELTA' });
      toast.success('Incidencia resuelta');
      const res = await axios.get(`${API}/incidencias/${incidenciasItem.id}`);
      setIncidencias(res.data);
      fetchItems();
    } catch (error) {
      toast.error('Error al resolver');
    }
  });

  // ========== PARALIZACIONES ==========

  const handleOpenParalizaciones = async (item) => {
    setParalizacionItem(item);
    setParalizacionForm({ motivo: '', comentario: '' });
    try {
      const res = await axios.get(`${API}/paralizaciones/${item.id}`);
      setParalizaciones(res.data);
    } catch { setParalizaciones([]); }
    setParalizacionDialogOpen(true);
  };

  const handleCrearParalizacion = guard(async () => {
    if (!paralizacionForm.motivo) { toast.error('Selecciona un motivo'); return; }
    try {
      await axios.post(`${API}/paralizaciones`, {
        registro_id: paralizacionItem.id,
        motivo: paralizacionForm.motivo,
        comentario: paralizacionForm.comentario,
      });
      toast.success('Paralización registrada');
      setParalizacionForm({ motivo: '', comentario: '' });
      const res = await axios.get(`${API}/paralizaciones/${paralizacionItem.id}`);
      setParalizaciones(res.data);
      fetchItems();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Error al paralizar');
    }
  });

  const handleLevantarParalizacion = guard(async (parId) => {
    try {
      await axios.put(`${API}/paralizaciones/${parId}/levantar`);
      toast.success('Paralización levantada');
      const res = await axios.get(`${API}/paralizaciones/${paralizacionItem.id}`);
      setParalizaciones(res.data);
      fetchItems();
    } catch (error) {
      toast.error('Error al levantar paralización');
    }
  });

  // Detectar nombre del modelo filtrado
  const modeloFiltrado = filtroModeloId ? items.find(i => i.modelo_id === filtroModeloId)?.modelo_nombre : null;

  const hayFiltrosActivos = searchTerm || (modoFiltro === 'excluir' ? estadosExcluidos.length > 0 : estadosIncluidos.length > 0) || filtroOperativo !== 'todos' || filtroModeloId || filtroUrgente || (filtroLinea && filtroLinea !== 'todas') || filtroMarcas.length > 0 || filtroTipos.length > 0 || filtroEntalles.length > 0 || filtroTelas.length > 0;
  const hayFiltrosModelo = filtroMarcas.length + filtroTipos.length + filtroEntalles.length + filtroTelas.length;

  const toggleEstado = (estado) => {
    if (modoFiltro === 'excluir') {
      setEstadosExcluidos(prev => prev.includes(estado) ? prev.filter(e => e !== estado) : [...prev, estado]);
    } else {
      setEstadosIncluidos(prev => prev.includes(estado) ? prev.filter(e => e !== estado) : [...prev, estado]);
    }
  };

  const limpiarFiltros = () => {
    setSearchTerm('');
    setEstadosExcluidos(['Tienda']);
    setEstadosIncluidos([]);
    setModoFiltro('excluir');
    setFiltroOperativo('todos');
    setFiltroUrgente(false);
    setFiltroModeloId('');
    setFiltroLinea('');
    setFiltroMarcas([]);
    setFiltroTipos([]);
    setFiltroEntalles([]);
    setFiltroTelas([]);
    setSearchParams({});
  };

  // Filtro operativo client-side (ya que no se envía al server)
  const displayItems = items.filter(i => {
    if (filtroOperativo !== 'todos' && (i.estado_operativo || 'NORMAL') !== filtroOperativo) return false;
    if (filtroUrgente && !i.urgente) return false;
    return true;
  });

  return (
    <div className="space-y-4" data-testid="registros-page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Registros de Producción</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {total} lotes activos
          </p>
        </div>
        <div className="flex gap-2">
          <ExportButton tabla="registros" filters={(() => {
            const f = {};
            if (filtroMarcas.length > 0) f.marca_id = filtroMarcas.join(',');
            if (filtroTipos.length > 0) f.tipo_id = filtroTipos.join(',');
            if (filtroEntalles.length > 0) f.entalle_id = filtroEntalles.join(',');
            if (filtroTelas.length > 0) f.tela_id = filtroTelas.join(',');
            if (modoFiltro === 'incluir' && estadosIncluidos.length > 0) f.estados = estadosIncluidos.join(',');
            if (modoFiltro === 'excluir' && estadosExcluidos.length > 0) f.excluir_estados = estadosExcluidos.join(',');
            if (searchDebounced) f.search = searchDebounced;
            return f;
          })()} items={items} />
          <Button onClick={() => navigate('/registros/nuevo')} data-testid="btn-nuevo-registro" size="sm" className="sm:size-default">
            <Plus className="h-4 w-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">Nuevo Registro</span>
            <span className="sm:hidden">Nuevo</span>
          </Button>
        </div>
      </div>

      {/* Barra de búsqueda y filtros */}
      <div className="registros-filtros-container" data-testid="filtros-registros">
        {/* Fila principal */}
        <div className="registros-filtros-row">
          <div className="relative flex-1 min-w-[180px] max-w-[320px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar N° Corte o Modelo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-8 h-9"
              data-testid="input-search-registros"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Estados dropdown */}
          <div className="relative">
            <Button variant="outline" size="sm" className="h-9 gap-1" onClick={() => { setEstadoDropdownOpen(!estadoDropdownOpen); setFiltroDropdownOpen(null); }} data-testid="btn-filtro-estados">
              <Filter className="h-3.5 w-3.5" />
              Estados
              {(modoFiltro === 'excluir' ? estadosExcluidos.length : estadosIncluidos.length) > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1 text-xs">
                  {modoFiltro === 'excluir' ? `-${estadosExcluidos.length}` : `${estadosIncluidos.length}`}
                </Badge>
              )}
            </Button>
            {estadoDropdownOpen && (
              <div className="registros-filtro-dropdown w-[260px]">
                <div className="flex gap-1 mb-2 border-b pb-2">
                  <Button variant={modoFiltro === 'excluir' ? 'default' : 'ghost'} size="sm" className="h-7 text-xs flex-1" onClick={() => { setModoFiltro('excluir'); setEstadosIncluidos([]); }}>Excluir</Button>
                  <Button variant={modoFiltro === 'incluir' ? 'default' : 'ghost'} size="sm" className="h-7 text-xs flex-1" onClick={() => { setModoFiltro('incluir'); setEstadosExcluidos([]); }}>Solo mostrar</Button>
                </div>
                {estadosDisponibles.map(e => {
                  const selected = modoFiltro === 'excluir' ? estadosExcluidos.includes(e) : estadosIncluidos.includes(e);
                  return (
                    <label key={e} className="registros-filtro-option">
                      <input type="checkbox" checked={selected} onChange={() => toggleEstado(e)} className="rounded" />
                      <span className={modoFiltro === 'excluir' && selected ? 'line-through text-muted-foreground' : ''}>{e}</span>
                    </label>
                  );
                })}
                <div className="border-t mt-2 pt-2 flex justify-end">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEstadoDropdownOpen(false)}>Cerrar</Button>
                </div>
              </div>
            )}
          </div>

          <Select value={filtroOperativo} onValueChange={setFiltroOperativo}>
            <SelectTrigger className="w-[130px] h-9" data-testid="select-filtro-operativo">
              <SelectValue placeholder="Operativo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="NORMAL">Normal</SelectItem>
              <SelectItem value="EN_RIESGO">En Riesgo</SelectItem>
              <SelectItem value="PARALIZADA">Paralizada</SelectItem>
            </SelectContent>
          </Select>

          <Button variant={filtroUrgente ? "default" : "outline"} size="sm"
            className={`h-9 ${filtroUrgente ? 'bg-rose-600 hover:bg-rose-700' : ''}`}
            onClick={() => setFiltroUrgente(!filtroUrgente)} data-testid="filtro-urgente">
            <AlertTriangle className="h-3.5 w-3.5 mr-1" />
            Urgentes
          </Button>

          <Select value={filtroLinea || "todas"} onValueChange={v => setFiltroLinea(v === "todas" ? "" : v)}>
            <SelectTrigger className="h-9 w-[160px]" data-testid="filtro-linea">
              <SelectValue placeholder="Línea" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas las líneas</SelectItem>
              {lineasNegocio.map(l => (
                <SelectItem key={l.id} value={String(l.id)}>{l.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Filtros de modelo: dropdowns multi-select en cascada */}
          {[
            { key: 'marca', label: 'Marca', selected: filtroMarcas, setSelected: setFiltroMarcas, options: opcionesFiltro.marcas },
            { key: 'tipo', label: 'Tipo', selected: filtroTipos, setSelected: setFiltroTipos, options: opcionesFiltro.tipos },
            { key: 'entalle', label: 'Entalle', selected: filtroEntalles, setSelected: setFiltroEntalles, options: opcionesFiltro.entalles },
            { key: 'tela', label: 'Tela', selected: filtroTelas, setSelected: setFiltroTelas, options: opcionesFiltro.telas },
          ].map(f => (
            <div className="relative" key={f.key}>
              <Button variant="outline" size="sm" className={`h-9 gap-1 ${f.selected.length > 0 ? 'border-primary text-primary' : ''}`}
                onClick={() => { setFiltroDropdownOpen(filtroDropdownOpen === f.key ? null : f.key); setEstadoDropdownOpen(false); }}
                data-testid={`btn-filtro-${f.key}`}>
                {f.label}
                {f.selected.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{f.selected.length}</Badge>
                )}
              </Button>
              {filtroDropdownOpen === f.key && (
                <div className="registros-filtro-dropdown w-[220px]">
                  {f.options.length === 0 ? (
                    <p className="text-xs text-muted-foreground px-2 py-3 text-center">Sin opciones disponibles</p>
                  ) : (
                    f.options.map(opt => {
                      const sel = f.selected.includes(opt.id);
                      return (
                        <label key={opt.id} className="registros-filtro-option">
                          <input type="checkbox" checked={sel} onChange={() => {
                            f.setSelected(prev => sel ? prev.filter(x => x !== opt.id) : [...prev, opt.id]);
                          }} className="rounded" />
                          <span>{opt.nombre}</span>
                        </label>
                      );
                    })
                  )}
                  {f.selected.length > 0 && (
                    <div className="border-t mt-1 pt-1">
                      <button className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 w-full text-left" onClick={() => f.setSelected([])}>Limpiar selección</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {hayFiltrosActivos && (
            <Button variant="ghost" size="sm" className="h-9" onClick={limpiarFiltros} data-testid="btn-limpiar-filtros">
              <X className="h-4 w-4 mr-1" /> Limpiar
            </Button>
          )}

          <span className="text-sm text-muted-foreground ml-auto whitespace-nowrap" data-testid="count-registros">
            {displayItems.length} de {total}
          </span>
        </div>

        {/* Filtros activos: badges removibles */}
        {(modeloFiltrado || hayFiltrosModelo > 0) && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {modeloFiltrado && (
              <Badge variant="secondary" className="gap-1 text-xs">
                Modelo: {modeloFiltrado}
                <button onClick={() => { setFiltroModeloId(''); setSearchParams({}); }}><X className="h-3 w-3" /></button>
              </Badge>
            )}
            {filtroMarcas.map(id => {
              const m = opcionesFiltro.marcas.find(x => x.id === id);
              return m ? <Badge key={id} variant="outline" className="registros-filtro-badge">Marca: {m.nombre} <button onClick={() => setFiltroMarcas(prev => prev.filter(x => x !== id))}><X className="h-3 w-3" /></button></Badge> : null;
            })}
            {filtroTipos.map(id => {
              const t = opcionesFiltro.tipos.find(x => x.id === id);
              return t ? <Badge key={id} variant="outline" className="registros-filtro-badge">Tipo: {t.nombre} <button onClick={() => setFiltroTipos(prev => prev.filter(x => x !== id))}><X className="h-3 w-3" /></button></Badge> : null;
            })}
            {filtroEntalles.map(id => {
              const e = opcionesFiltro.entalles.find(x => x.id === id);
              return e ? <Badge key={id} variant="outline" className="registros-filtro-badge">Entalle: {e.nombre} <button onClick={() => setFiltroEntalles(prev => prev.filter(x => x !== id))}><X className="h-3 w-3" /></button></Badge> : null;
            })}
            {filtroTelas.map(id => {
              const t = opcionesFiltro.telas.find(x => x.id === id);
              return t ? <Badge key={id} variant="outline" className="registros-filtro-badge">Tela: {t.nombre} <button onClick={() => setFiltroTelas(prev => prev.filter(x => x !== id))}><X className="h-3 w-3" /></button></Badge> : null;
            })}
          </div>
        )}
      </div>

      {/* Chips rápidos de estado */}
      {estadosDisponibles.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {estadosDisponibles.map(estado => {
            const isActive = modoFiltro === 'incluir' && estadosIncluidos.includes(estado);
            const isExcluded = modoFiltro === 'excluir' && estadosExcluidos.includes(estado);
            return (
              <button
                key={estado}
                type="button"
                onClick={() => {
                  if (modoFiltro === 'excluir') {
                    setModoFiltro('incluir');
                    setEstadosIncluidos([estado]);
                    setEstadosExcluidos([]);
                  } else if (isActive) {
                    const next = estadosIncluidos.filter(e => e !== estado);
                    if (next.length === 0) { setModoFiltro('excluir'); setEstadosExcluidos(['Tienda']); }
                    else setEstadosIncluidos(next);
                  } else {
                    setEstadosIncluidos(prev => [...prev, estado]);
                  }
                }}
                className={`registro-chip-estado ${isActive ? 'registro-chip-estado-active' : ''} ${isExcluded ? 'registro-chip-estado-excluded' : ''}`}
              >
                {estado}
              </button>
            );
          })}
        </div>
      )}

      {/* Vista mobile: Cards */}
      <div className="md:hidden space-y-2" data-testid="registros-cards-mobile">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Cargando...</div>
        ) : displayItems.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {hayFiltrosActivos ? 'No hay registros que coincidan' : 'No hay registros'}
          </div>
        ) : (
          displayItems.map((item) => (
            <div
              key={item.id}
              className={`rounded-lg border bg-card p-3 active:bg-muted/60 transition-colors cursor-pointer ${item.urgente ? 'border-l-4 border-l-rose-500 bg-rose-50/50 dark:bg-rose-950/20' : item.estado_operativo === 'PARALIZADA' ? 'border-l-4 border-l-red-500' : ''}`}
              onClick={() => navigate(`/registros/editar/${item.id}`)}
              data-testid={`registro-card-${item.id}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {item.urgente && <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />}
                    {item.paralizacion_activa && <PauseCircle className="h-3.5 w-3.5 text-red-600 shrink-0" />}
                    <span className="font-mono font-bold text-sm">{item.n_corte}</span>
                    {item.dividido_desde_registro_id && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 border-blue-300 text-blue-600">div</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate mt-0.5">
                    {item.modelo_nombre || '-'}
                    {item.es_modelo_manual && <span className="ml-1 inline-flex items-center rounded px-1 py-0.5 text-[9px] font-medium bg-gray-100 text-gray-500 border border-gray-200">Manual</span>}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge variant="outline" className={`${getStatusClass(item.estado)} text-[11px] whitespace-nowrap`}>
                    {item.estado}
                  </Badge>
                  <span className="font-mono font-semibold text-sm">{getTotalPiezas(item)}</span>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                <span>{formatRelativeDate(item.ultima_actividad || item.fecha_creacion)}</span>
                {item.linea_negocio_nombre && (
                  <Badge variant="secondary" className="text-[9px] px-1.5 py-0 font-normal">{item.linea_negocio_nombre.split(' - ')[0]}</Badge>
                )}
                {item.incidencias_abiertas > 0 && (
                  <span className="flex items-center gap-0.5 text-amber-600">
                    <AlertTriangle className="h-3 w-3" />{item.incidencias_abiertas}
                  </span>
                )}
                {item.mermas_total > 0 && (
                  <span className="text-amber-600">M:{item.mermas_total}</span>
                )}
                <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground/50" />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Vista desktop: Tabla */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="data-table-header">
                  <TableHead>N° Corte</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead>Actividad</TableHead>
                  <TableHead className="hidden md:table-cell">Linea</TableHead>
                  <TableHead className="hidden lg:table-cell">Marca</TableHead>
                  <TableHead className="hidden xl:table-cell">Tipo</TableHead>
                  <TableHead className="hidden xl:table-cell">Entalle</TableHead>
                  <TableHead className="hidden lg:table-cell">Tela</TableHead>
                  <TableHead className="hidden xl:table-cell">Hilo</TableHead>
                  <TableHead className="hidden xl:table-cell">Hilo Esp.</TableHead>
                  <TableHead className="hidden xl:table-cell">Curva</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha Final</TableHead>
                  <TableHead>Operativo</TableHead>
                  <TableHead className="hidden lg:table-cell">Salud</TableHead>
                  <TableHead className="w-[140px]">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={16} className="text-center py-8">
                      Cargando...
                    </TableCell>
                  </TableRow>
                ) : displayItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={16} className="text-center py-8 text-muted-foreground">
                      {hayFiltrosActivos ? 'No hay registros que coincidan con los filtros' : 'No hay registros'}
                    </TableCell>
                  </TableRow>
                ) : (
                  displayItems.map((item) => (
                    <TableRow
                      key={item.id}
                      className={`data-table-row cursor-pointer hover:bg-muted/30 transition-colors ${item.urgente ? 'bg-rose-50 dark:bg-rose-950/30 border-l-2 border-l-red-500' : item.estado_operativo === 'PARALIZADA' ? 'bg-red-50 dark:bg-red-950/20 border-l-2 border-l-red-700' : item.estado_operativo === 'EN_RIESGO' ? 'bg-amber-50 dark:bg-amber-950/20 border-l-2 border-l-amber-500' : 'border-l-2 border-l-blue-400'}`}
                      data-testid={`registro-row-${item.id}`}
                      onClick={() => navigate(`/registros/editar/${item.id}`)}
                    >
                      <TableCell className="font-mono font-bold text-base whitespace-nowrap">
                        <div>
                          <div className="flex items-center gap-1">
                            {item.urgente && (
                              <AlertTriangle className="h-3.5 w-3.5 text-destructive badge-urgent" />
                            )}
                            {item.paralizacion_activa && (
                              <PauseCircle className="h-3.5 w-3.5 text-red-600" />
                            )}
                            {item.incidencias_abiertas > 0 && (
                              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-white text-[9px] font-bold">{item.incidencias_abiertas}</span>
                            )}
                            {item.n_corte}
                            {item.dividido_desde_registro_id && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 border-blue-300 text-blue-600">div</Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {item.modelo_nombre || '-'}
                        {item.es_modelo_manual && <span className="ml-1 inline-flex items-center rounded px-1 py-0.5 text-[9px] font-medium bg-gray-100 text-gray-500 border border-gray-200">Manual</span>}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap text-muted-foreground" title={formatDate(item.ultima_actividad || item.fecha_creacion)}>
                        {formatRelativeDate(item.ultima_actividad || item.fecha_creacion)}
                      </TableCell>
                      <TableCell className="text-xs hidden md:table-cell">
                        {item.linea_negocio_nombre
                          ? <Badge variant="secondary" className="text-[10px] whitespace-nowrap">{item.linea_negocio_nombre.split(' - ')[0]}</Badge>
                          : <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell className="text-xs hidden lg:table-cell">{item.marca_nombre || '-'}</TableCell>
                      <TableCell className="text-xs hidden xl:table-cell">{item.tipo_nombre || '-'}</TableCell>
                      <TableCell className="text-xs hidden xl:table-cell">{item.entalle_nombre || '-'}</TableCell>
                      <TableCell className="text-xs hidden lg:table-cell">{item.tela_nombre || '-'}</TableCell>
                      <TableCell className="text-xs hidden xl:table-cell">{item.hilo_nombre || '-'}</TableCell>
                      <TableCell className="text-xs hidden xl:table-cell">{item.hilo_especifico_nombre || '-'}</TableCell>
                      <TableCell className="text-xs hidden xl:table-cell whitespace-nowrap">{item.curva || '-'}</TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {getTotalPiezas(item)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`${getStatusClass(item.estado)} whitespace-nowrap text-xs`}>
                          {item.estado}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {getFechaEntregaBadge(item.fecha_entrega_final, item.estado)}
                      </TableCell>
                      <TableCell>
                        {getEstadoOperativoBadge(item.estado_operativo)}
                      </TableCell>
                      <TableCell data-testid={`salud-${item.id}`} className="hidden lg:table-cell">
                        <div className="flex items-center gap-1">
                          {(item.mermas_total > 0 || item.fallados_total > 0 || item.arreglos_vencidos > 0) ? (
                            <>
                              {item.mermas_total > 0 && (
                                <span title={`${item.mermas_total} mermas`} className="flex h-5 min-w-[20px] px-1 items-center justify-center rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-[9px] font-bold gap-0.5">
                                  <AlertTriangle className="h-3 w-3" />{item.mermas_total}
                                </span>
                              )}
                              {item.fallados_total > 0 && (
                                <span title={`${item.fallados_total} fallados`} className="flex h-5 min-w-[20px] px-1 items-center justify-center rounded bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-[9px] font-bold gap-0.5">
                                  <Package className="h-3 w-3" />{item.fallados_total}
                                </span>
                              )}
                              {item.arreglos_vencidos > 0 && (
                                <span title={`${item.arreglos_vencidos} arreglos vencidos`} className="flex h-5 min-w-[20px] px-1 items-center justify-center rounded bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 text-[9px] font-bold gap-0.5">
                                  <Clock className="h-3 w-3" />{item.arreglos_vencidos}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-[10px] text-green-600 dark:text-green-400 font-medium">OK</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); handleOpenColoresDialog(item); }} title="Colores" data-testid={`colores-registro-${item.id}`}>
                            <Palette className={`h-3.5 w-3.5 ${tieneColores(item) ? 'text-primary' : ''}`} />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }} title="Eliminar" data-testid={`delete-registro-${item.id}`}>
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
        </CardContent>
      </Card>

      {/* Botón cargar más */}
      {items.length < total && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => fetchItems(true)} disabled={loading} data-testid="btn-cargar-mas">
            {loading ? 'Cargando...' : `Cargar más (${items.length} de ${total})`}
          </Button>
        </div>
      )}

      {/* Dialog para distribuir colores */}
      <Dialog open={coloresDialogOpen} onOpenChange={setColoresDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Distribución de Colores - Corte #{colorEditItem?.n_corte}</DialogTitle>
            <DialogDescription>
              Selecciona colores y distribuye las cantidades por talla
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Selector de colores múltiple con buscador */}
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Seleccionar Colores
              </h3>
              <MultiSelectColors
                options={coloresCatalogo}
                selected={coloresSeleccionados}
                onChange={handleColoresChange}
                placeholder="Buscar y seleccionar colores..."
                searchPlaceholder="Buscar color..."
                emptyMessage="No se encontraron colores."
              />
              <p className="text-xs text-muted-foreground mt-2">
                El primer color seleccionado recibe todo el total automáticamente.
              </p>
            </div>

            <Separator />

            {/* Matriz de cantidades */}
            {colorEditItem?.tallas?.length > 0 && coloresSeleccionados.length > 0 ? (
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Distribución por Talla y Color
                </h3>
                
                <div className="border rounded-lg overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="bg-muted/50 p-3 text-left text-xs font-semibold uppercase tracking-wider border-b min-w-[120px]">
                          Color
                        </th>
                        {colorEditItem.tallas.map((t) => (
                          <th key={t.talla_id} className="bg-muted/50 p-3 text-center text-xs font-semibold uppercase tracking-wider border-b min-w-[100px]">
                            <div>{t.talla_nombre}</div>
                            <div className="text-muted-foreground font-normal mt-1">
                              Total: {t.cantidad}
                            </div>
                          </th>
                        ))}
                        <th className="bg-muted/70 p-3 text-center text-xs font-semibold uppercase tracking-wider border-b min-w-[80px]">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {coloresSeleccionados.map((color, colorIndex) => (
                        <tr key={color.id} className={colorIndex % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                          <td className="p-2 border-b">
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-5 h-5 rounded border shrink-0"
                                style={{ backgroundColor: color.codigo_hex || '#ccc' }}
                              />
                              <span className="font-medium text-sm">{color.nombre}</span>
                            </div>
                          </td>
                          {colorEditItem.tallas.map((t) => (
                            <td key={t.talla_id} className="p-1 border-b">
                              <NumericInput
                                min="0"
                                value={getCantidadMatriz(color.id, t.talla_id)}
                                onChange={(e) => handleMatrizChange(color.id, t.talla_id, e.target.value)}
                                className="w-full font-mono text-center h-10"
                                placeholder="0"
                                data-testid={`matriz-${color.id}-${t.talla_id}`}
                              />
                            </td>
                          ))}
                          <td className="p-2 border-b bg-muted/30 text-center font-mono font-semibold">
                            {getTotalColor(color.id)}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-muted/50">
                        <td className="p-3 font-semibold text-sm">Asignado</td>
                        {colorEditItem.tallas.map((t) => {
                          const asignado = getTotalTallaAsignado(t.talla_id);
                          const completo = asignado === t.cantidad;
                          return (
                            <td key={t.talla_id} className="p-3 text-center font-mono font-semibold">
                              <span className={completo ? 'text-green-600' : 'text-orange-500'}>
                                {asignado}
                              </span>
                              <span className="text-muted-foreground">/{t.cantidad}</span>
                            </td>
                          );
                        })}
                        <td className="p-3 text-center font-mono font-bold bg-primary/10 text-primary">
                          {getTotalGeneralAsignado()}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ) : colorEditItem?.tallas?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border rounded-lg bg-muted/20">
                Este registro no tiene tallas definidas. Edita el registro primero.
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground border rounded-lg bg-muted/20">
                Selecciona al menos un color para ver la matriz de distribución
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setColoresDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSaveColores} 
              disabled={saving || coloresSeleccionados.length === 0}
              data-testid="btn-guardar-colores"
            >
              Guardar Distribución
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para ver detalle — REMOVIDO, ahora está en RegistroForm pestaña Gestión OP */}
      {false && <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Detalle del Registro</DialogTitle>
            <DialogDescription>
              Información completa del registro de producción
            </DialogDescription>
          </DialogHeader>
          {viewingItem && (
            <Tabs defaultValue="info" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="info">
                  <Eye className="h-4 w-4 mr-2" />
                  Información General
                </TabsTrigger>
                <TabsTrigger value="mp" data-testid="tab-gestion-op">
                  <Cog className="h-4 w-4 mr-2" />
                  Gestión OP
                </TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="mt-4">
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        {viewingItem.urgente && (
                          <AlertTriangle className="h-5 w-5 text-destructive badge-urgent" />
                        )}
                        Corte #{viewingItem.n_corte}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Fecha:</span>
                          <p className="font-mono">{formatDate(viewingItem.fecha_creacion)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Modelo:</span>
                          <p className="font-medium">
                            {viewingItem.modelo_nombre || '-'}
                            {viewingItem.es_modelo_manual && <span className="ml-1 inline-flex items-center rounded px-1 py-0.5 text-[9px] font-medium bg-gray-100 text-gray-500 border border-gray-200">Manual</span>}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Marca:</span>
                          <p>{viewingItem.marca_nombre || '-'}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Tipo:</span>
                          <p>{viewingItem.tipo_nombre || '-'}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Entalle:</span>
                          <p>{viewingItem.entalle_nombre || '-'}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Tela:</span>
                          <p>{viewingItem.tela_nombre || '-'}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Hilo:</span>
                          <p>{viewingItem.hilo_nombre || '-'}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Curva:</span>
                          <p className="font-mono">{viewingItem.curva || '-'}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Estado:</span>
                          <p>
                            <Badge variant="outline" className={getStatusClass(viewingItem.estado)}>
                              {viewingItem.estado}
                            </Badge>
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Total Piezas:</span>
                          <p className="font-mono font-bold text-lg">{getTotalPiezas(viewingItem)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {viewingItem.tallas && viewingItem.tallas.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Tallas (Curva)</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-3">
                          {viewingItem.tallas.map((t) => (
                            <div key={t.talla_id} className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg">
                              <span className="font-medium">{t.talla_nombre}:</span>
                              <span className="font-mono font-bold">{t.cantidad}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {viewingItem.distribucion_colores && viewingItem.distribucion_colores.some(t => t.colores?.length > 0) && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Distribución por Color</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse text-sm">
                            <thead>
                              <tr>
                                <th className="bg-muted/50 p-2 border text-left font-semibold">Color</th>
                                {viewingItem.tallas.map((t) => (
                                  <th key={t.talla_id} className="bg-muted/50 p-2 border text-center font-semibold">
                                    {t.talla_nombre}
                                  </th>
                                ))}
                                <th className="bg-muted/70 p-2 border text-center font-semibold">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(() => {
                                const coloresUnicos = new Map();
                                viewingItem.distribucion_colores.forEach(t => {
                                  (t.colores || []).forEach(c => {
                                    if (!coloresUnicos.has(c.color_id)) {
                                      coloresUnicos.set(c.color_id, c.color_nombre);
                                    }
                                  });
                                });
                                
                                return Array.from(coloresUnicos.entries()).map(([colorId, colorNombre]) => (
                                  <tr key={colorId}>
                                    <td className="bg-muted/30 p-2 border font-medium">{colorNombre}</td>
                                    {viewingItem.tallas.map((t) => {
                                      const distTalla = viewingItem.distribucion_colores.find(d => d.talla_id === t.talla_id);
                                      const colorData = (distTalla?.colores || []).find(c => c.color_id === colorId);
                                      return (
                                        <td key={t.talla_id} className="p-2 border text-center font-mono">
                                          {colorData?.cantidad || 0}
                                        </td>
                                      );
                                    })}
                                    <td className="bg-muted/50 p-2 border text-center font-mono font-semibold">
                                      {viewingItem.distribucion_colores.reduce((sum, t) => {
                                        const colorData = (t.colores || []).find(c => c.color_id === colorId);
                                        return sum + (colorData?.cantidad || 0);
                                      }, 0)}
                                    </td>
                                  </tr>
                                ));
                              })()}
                              <tr>
                                <td className="bg-muted/70 p-2 border font-semibold">Total</td>
                                {viewingItem.tallas.map((t) => {
                                  const distTalla = viewingItem.distribucion_colores.find(d => d.talla_id === t.talla_id);
                                  return (
                                    <td key={t.talla_id} className="bg-muted/50 p-2 border text-center font-mono font-semibold">
                                      {(distTalla?.colores || []).reduce((sum, c) => sum + (c.cantidad || 0), 0)}
                                    </td>
                                  );
                                })}
                                <td className="bg-primary/10 p-2 border text-center font-mono font-bold text-primary">
                                  {viewingItem.distribucion_colores.reduce((sum, t) => 
                                    sum + (t.colores || []).reduce((s, c) => s + (c.cantidad || 0), 0), 0
                                  )}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="mp" className="mt-4">
                <RegistroDetalleFase2 
                  registroId={viewingItem.id} 
                  registro={viewingItem} 
                  onEstadoChange={(nuevoEstado) => {
                    // Actualizar el estado en la lista
                    setItems(prevItems => 
                      prevItems.map(item => 
                        item.id === viewingItem.id 
                          ? { ...item, estado: nuevoEstado }
                          : item
                      )
                    );
                    // Actualizar el item en visualización
                    setViewingItem(prev => ({ ...prev, estado: nuevoEstado }));
                  }}
                />
              </TabsContent>
            </Tabs>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>}

      {/* Dialog Control de Producción */}
      <Dialog open={controlDialogOpen} onOpenChange={setControlDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Control - Corte #{controlItem?.n_corte}</DialogTitle>
            <DialogDescription>Fecha de entrega final del registro</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Fecha Entrega Final</Label>
              <Input
                type="date"
                value={controlData.fecha_entrega_final}
                onChange={(e) => setControlData({ ...controlData, fecha_entrega_final: e.target.value })}
                data-testid="input-fecha-entrega"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setControlDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveControl} disabled={saving} data-testid="btn-guardar-control">
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Incidencias */}
      <Dialog open={incidenciasDialogOpen} onOpenChange={setIncidenciasDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Incidencias - Corte #{incidenciasItem?.n_corte}</DialogTitle>
            <DialogDescription>Registro y seguimiento de incidencias</DialogDescription>
          </DialogHeader>
          
          {/* Formulario nueva incidencia */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <h4 className="text-sm font-semibold">Nueva Incidencia</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo</Label>
                  <Select value={incidenciaForm.tipo} onValueChange={(v) => setIncidenciaForm({ ...incidenciaForm, tipo: v })}>
                    <SelectTrigger data-testid="select-tipo-incidencia">
                      <SelectValue placeholder="Seleccionar tipo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS_INCIDENCIA.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button onClick={handleCreateIncidencia} disabled={saving || !incidenciaForm.tipo} className="w-full" data-testid="btn-crear-incidencia">
                    {saving ? 'Registrando...' : 'Registrar'}
                  </Button>
                </div>
              </div>
              <Textarea
                value={incidenciaForm.comentario}
                onChange={(e) => setIncidenciaForm({ ...incidenciaForm, comentario: e.target.value })}
                placeholder="Comentario (opcional)..."
                rows={2}
                data-testid="input-comentario-incidencia"
              />
            </CardContent>
          </Card>

          {/* Historial */}
          <div className="space-y-2 mt-2">
            <h4 className="text-sm font-semibold text-muted-foreground">Historial ({incidencias.length})</h4>
            {incidencias.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Sin incidencias</p>
            ) : (
              incidencias.map((inc) => (
                <div key={inc.id} className={`flex items-start justify-between p-3 rounded-lg border ${inc.estado === 'ABIERTA' ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/20' : 'border-muted'}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant={inc.estado === 'ABIERTA' ? 'default' : 'secondary'} className="text-xs">
                        {TIPOS_INCIDENCIA.find(t => t.value === inc.tipo)?.label || inc.tipo}
                      </Badge>
                      <Badge variant="outline" className={`text-xs ${inc.estado === 'ABIERTA' ? 'text-amber-600' : 'text-green-600'}`}>
                        {inc.estado}
                      </Badge>
                    </div>
                    {inc.comentario && <p className="text-sm mt-1 text-muted-foreground">{inc.comentario}</p>}
                    <p className="text-xs text-muted-foreground mt-1">{new Date(inc.fecha_hora).toLocaleString('es-PE')} - {inc.usuario}</p>
                  </div>
                  {inc.estado === 'ABIERTA' && (
                    <Button variant="ghost" size="sm" onClick={() => handleResolverIncidencia(inc.id)} disabled={saving} data-testid={`resolver-inc-${inc.id}`}>
                      Resolver
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Paralizaciones */}
      <Dialog open={paralizacionDialogOpen} onOpenChange={setParalizacionDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Paralizaciones - Corte #{paralizacionItem?.n_corte}</DialogTitle>
            <DialogDescription>Gestión de paralizaciones del registro</DialogDescription>
          </DialogHeader>

          {/* Paralización activa */}
          {paralizacionItem?.paralizacion_activa ? (
            <Card className="border-red-300 bg-red-50 dark:bg-red-950/20">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <PauseCircle className="h-5 w-5 text-red-600" />
                      <span className="font-semibold text-red-700">Paralización Activa</span>
                    </div>
                    <p className="text-sm mt-1">
                      Motivo: {MOTIVOS_PARALIZACION.find(m => m.value === paralizaciones.find(p => p.activa)?.motivo)?.label || paralizaciones.find(p => p.activa)?.motivo}
                    </p>
                    {paralizaciones.find(p => p.activa)?.comentario && (
                      <p className="text-sm text-muted-foreground">{paralizaciones.find(p => p.activa)?.comentario}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">Desde: {new Date(paralizaciones.find(p => p.activa)?.fecha_inicio).toLocaleString('es-PE')}</p>
                  </div>
                  <Button variant="destructive" onClick={() => handleLevantarParalizacion(paralizaciones.find(p => p.activa)?.id)} disabled={saving} data-testid="btn-levantar-paralizacion">
                    {saving ? 'Levantando...' : 'Levantar'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            /* Formulario nueva paralización */
            <Card>
              <CardContent className="p-4 space-y-3">
                <h4 className="text-sm font-semibold">Nueva Paralización</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Motivo</Label>
                    <Select value={paralizacionForm.motivo} onValueChange={(v) => setParalizacionForm({ ...paralizacionForm, motivo: v })}>
                      <SelectTrigger data-testid="select-motivo-paralizacion">
                        <SelectValue placeholder="Seleccionar motivo..." />
                      </SelectTrigger>
                      <SelectContent>
                        {MOTIVOS_PARALIZACION.map(m => (
                          <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button variant="destructive" onClick={handleCrearParalizacion} disabled={saving || !paralizacionForm.motivo} className="w-full" data-testid="btn-crear-paralizacion">
                      {saving ? 'Paralizando...' : 'Paralizar'}
                    </Button>
                  </div>
                </div>
                <Textarea
                  value={paralizacionForm.comentario}
                  onChange={(e) => setParalizacionForm({ ...paralizacionForm, comentario: e.target.value })}
                  placeholder="Comentario (opcional)..."
                  rows={2}
                  data-testid="input-comentario-paralizacion"
                />
              </CardContent>
            </Card>
          )}

          {/* Historial */}
          <div className="space-y-2 mt-2">
            <h4 className="text-sm font-semibold text-muted-foreground">Historial ({paralizaciones.length})</h4>
            {paralizaciones.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Sin paralizaciones</p>
            ) : (
              paralizaciones.map((par) => (
                <div key={par.id} className={`p-3 rounded-lg border ${par.activa ? 'border-red-300 bg-red-50 dark:bg-red-950/20' : 'border-muted'}`}>
                  <div className="flex items-center gap-2">
                    <Badge variant={par.activa ? 'destructive' : 'secondary'} className="text-xs">
                      {MOTIVOS_PARALIZACION.find(m => m.value === par.motivo)?.label || par.motivo}
                    </Badge>
                    <Badge variant="outline" className={`text-xs ${par.activa ? 'text-red-600' : 'text-green-600'}`}>
                      {par.activa ? 'Activa' : 'Levantada'}
                    </Badge>
                  </div>
                  {par.comentario && <p className="text-sm mt-1 text-muted-foreground">{par.comentario}</p>}
                  <p className="text-xs text-muted-foreground mt-1">
                    Inicio: {new Date(par.fecha_inicio).toLocaleString('es-PE')}
                    {par.fecha_fin && ` | Fin: ${new Date(par.fecha_fin).toLocaleString('es-PE')}`}
                  </p>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmación de eliminación */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Eliminar Registro
            </DialogTitle>
            <DialogDescription>
              {deleteConfirm && (
                <>
                  ¿Estás seguro de eliminar <strong>{deleteConfirm.n_corte}</strong>?
                  Se eliminarán todos los movimientos, materiales y datos asociados.
                  Esta acción no se puede deshacer.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmDelete}>Sí, eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
