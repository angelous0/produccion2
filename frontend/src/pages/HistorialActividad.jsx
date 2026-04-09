import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { 
  History, 
  LogIn, 
  Plus, 
  Pencil, 
  Trash2, 
  Key, 
  Shield, 
  Search,
  ChevronLeft,
  ChevronRight,
  Filter,
  User,
  Package,
  FileText,
  Shirt,
  Palette,
  Tag,
  Layers,
  Scissors,
  Box,
  Ruler,
  Users,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Configuración de tipos de acción
const TIPO_ACCION_CONFIG = {
  login: { label: 'Inició sesión', icon: LogIn, bgColor: 'bg-blue-500', textColor: 'text-blue-600' },
  crear: { label: 'Creó', icon: Plus, bgColor: 'bg-green-500', textColor: 'text-green-600' },
  editar: { label: 'Editó', icon: Pencil, bgColor: 'bg-yellow-500', textColor: 'text-yellow-600' },
  eliminar: { label: 'Eliminó', icon: Trash2, bgColor: 'bg-red-500', textColor: 'text-red-600' },
  cambio_password: { label: 'Cambió contraseña', icon: Key, bgColor: 'bg-purple-500', textColor: 'text-purple-600' },
  cambio_password_admin: { label: 'Cambió contraseña de', icon: Shield, bgColor: 'bg-orange-500', textColor: 'text-orange-600' },
};

// Configuración de tablas con iconos y rutas
const TABLA_CONFIG = {
  usuarios: { label: 'Usuario', icon: User, route: '/usuarios' },
  registros: { label: 'Registro', icon: FileText, route: '/registros' },
  marcas: { label: 'Marca', icon: Tag, route: '/marcas' },
  tipos: { label: 'Tipo', icon: Layers, route: '/tipos' },
  entalles: { label: 'Entalle', icon: Shirt, route: '/entalles' },
  telas: { label: 'Tela', icon: Scissors, route: '/telas' },
  hilos: { label: 'Hilo', icon: Palette, route: '/hilos' },
  hilos_especificos: { label: 'Hilo Específico', icon: Sparkles, route: '/hilos-especificos' },
  modelos: { label: 'Modelo', icon: Box, route: '/modelos' },
  tallas: { label: 'Talla', icon: Ruler, route: '/tallas-catalogo' },
  colores: { label: 'Color', icon: Palette, route: '/colores-catalogo' },
  colores_generales: { label: 'Color General', icon: Palette, route: '/colores-generales' },
  personas: { label: 'Persona', icon: Users, route: '/maestros/personas' },
  servicios: { label: 'Servicio', icon: Package, route: '/maestros/servicios' },
  inventario: { label: 'Inventario', icon: Package, route: '/inventario' },
};

// Formatear fecha para agrupar
const formatDateGroup = (dateStr) => {
  const date = new Date(dateStr);
  const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  let formatted = date.toLocaleDateString('es-PE', options);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
};

// Formatear hora
const formatTime = (dateStr) => {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });
};

// Obtener fecha sin hora para agrupar
const getDateKey = (dateStr) => {
  const date = new Date(dateStr);
  return date.toISOString().split('T')[0];
};

export const HistorialActividad = () => {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [actividades, setActividades] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [limit] = useState(50);
  
  // Filtros
  const [filtros, setFiltros] = useState({
    usuario_id: '',
    tipo_accion: '',
    fecha_desde: '',
    fecha_hasta: '',
  });

  const fetchActividades = async (currentPage = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtros.usuario_id) params.append('usuario_id', filtros.usuario_id);
      if (filtros.tipo_accion) params.append('tipo_accion', filtros.tipo_accion);
      if (filtros.fecha_desde) params.append('fecha_desde', filtros.fecha_desde);
      if (filtros.fecha_hasta) params.append('fecha_hasta', filtros.fecha_hasta);
      params.append('limit', limit);
      params.append('offset', currentPage * limit);
      
      const response = await axios.get(`${API}/actividad?${params.toString()}`);
      setActividades(response.data.items);
      setTotal(response.data.total);
    } catch (error) {
      toast.error('Error al cargar historial');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsuarios = async () => {
    try {
      const response = await axios.get(`${API}/usuarios`);
      setUsuarios(response.data);
    } catch (error) {
      console.error('Error fetching usuarios:', error);
    }
  };

  useEffect(() => {
    fetchActividades();
    fetchUsuarios();
  }, []);

  const handleFiltrar = () => {
    setPage(0);
    fetchActividades(0);
  };

  const handlePageChange = (newPage) => {
    setPage(newPage);
    fetchActividades(newPage);
  };

  // Agrupar actividades por fecha
  const actividadesAgrupadas = actividades.reduce((groups, act) => {
    const dateKey = getDateKey(act.created_at);
    if (!groups[dateKey]) {
      groups[dateKey] = {
        label: formatDateGroup(act.created_at),
        items: []
      };
    }
    groups[dateKey].items.push(act);
    return groups;
  }, {});

  // Navegar al registro o módulo
  const handleNavigate = (actividad) => {
    const config = TABLA_CONFIG[actividad.tabla_afectada];
    if (!config) return;

    if (actividad.tipo_accion === 'eliminar') {
      // Si eliminó, ir a la lista del módulo
      navigate(config.route);
    } else if (actividad.tipo_accion === 'crear' || actividad.tipo_accion === 'editar') {
      // Si creó o editó, intentar ir al registro específico
      if (actividad.tabla_afectada === 'registros' && actividad.registro_id) {
        navigate(`/registros/editar/${actividad.registro_id}`);
      } else {
        navigate(config.route);
      }
    } else {
      navigate(config.route);
    }
  };

  // Obtener descripción formateada
  const getDescripcion = (actividad) => {
    const config = TIPO_ACCION_CONFIG[actividad.tipo_accion] || { label: actividad.tipo_accion };
    const tablaConfig = TABLA_CONFIG[actividad.tabla_afectada];
    
    if (actividad.tipo_accion === 'login') {
      return null; // Solo mostrar "Inició sesión"
    }
    
    const tablaLabel = tablaConfig?.label || actividad.tabla_afectada || '';
    const registroNombre = actividad.registro_nombre ? `"${actividad.registro_nombre}"` : '';
    
    return { tablaLabel, registroNombre };
  };

  // Renderizar badges con datos relevantes
  const renderDataBadges = (actividad) => {
    const datos = actividad.datos_nuevos || actividad.datos_anteriores;
    if (!datos || typeof datos !== 'object') return null;
    
    const badges = [];
    const camposImportantes = ['nombre', 'username', 'rol', 'email', 'codigo', 'cantidad', 'precio'];
    
    camposImportantes.forEach(campo => {
      if (datos[campo] && datos[campo] !== '***') {
        badges.push({ key: campo, value: datos[campo] });
      }
    });
    
    return badges.slice(0, 4); // Máximo 4 badges
  };

  const totalPages = Math.ceil(total / limit);

  if (!isAdmin()) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">No tienes permisos para ver esta página</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="historial-actividad-page">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <History className="h-6 w-6" />
          Historial de Actividad
        </h2>
        <p className="text-muted-foreground">
          Registro de todas las acciones realizadas en el sistema
        </p>
      </div>

      {/* Filtros compactos */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[150px]">
              <Select 
                value={filtros.usuario_id || "all"} 
                onValueChange={(value) => setFiltros({ ...filtros, usuario_id: value === "all" ? "" : value })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Todos los usuarios" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {usuarios.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.username}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex-1 min-w-[150px]">
              <Select 
                value={filtros.tipo_accion || "all"} 
                onValueChange={(value) => setFiltros({ ...filtros, tipo_accion: value === "all" ? "" : value })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Todas las acciones" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {Object.entries(TIPO_ACCION_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key}>{config.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <Input
              type="date"
              value={filtros.fecha_desde}
              onChange={(e) => setFiltros({ ...filtros, fecha_desde: e.target.value })}
              className="w-[140px] h-9"
              placeholder="Desde"
            />
            
            <Input
              type="date"
              value={filtros.fecha_hasta}
              onChange={(e) => setFiltros({ ...filtros, fecha_hasta: e.target.value })}
              className="w-[140px] h-9"
              placeholder="Hasta"
            />
            
            <Button onClick={handleFiltrar} size="sm" className="h-9">
              <Filter className="h-4 w-4 mr-1" />
              Filtrar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Timeline de actividades */}
      <div className="space-y-6">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Cargando...</div>
        ) : Object.keys(actividadesAgrupadas).length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No hay actividades registradas
          </div>
        ) : (
          Object.entries(actividadesAgrupadas).map(([dateKey, group]) => (
            <div key={dateKey}>
              {/* Fecha como separador */}
              <div className="text-sm font-medium text-muted-foreground mb-3 px-1">
                {group.label}
              </div>
              
              {/* Cards de actividades */}
              <div className="space-y-2">
                {group.items.map((act) => {
                  const tipoConfig = TIPO_ACCION_CONFIG[act.tipo_accion] || { 
                    label: act.tipo_accion, 
                    icon: History, 
                    bgColor: 'bg-gray-500',
                    textColor: 'text-gray-600'
                  };
                  const Icon = tipoConfig.icon;
                  const tablaConfig = TABLA_CONFIG[act.tabla_afectada];
                  const TablaIcon = tablaConfig?.icon || FileText;
                  const descripcion = getDescripcion(act);
                  const badges = renderDataBadges(act);
                  const isClickable = act.tabla_afectada && tablaConfig;
                  
                  return (
                    <Card 
                      key={act.id} 
                      className={`transition-all ${isClickable ? 'hover:shadow-md hover:border-primary/30 cursor-pointer' : ''}`}
                      onClick={() => isClickable && handleNavigate(act)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          {/* Icono de acción */}
                          <div className={`${tipoConfig.bgColor} p-2 rounded-full flex-shrink-0`}>
                            <Icon className="h-4 w-4 text-white" />
                          </div>
                          
                          {/* Contenido */}
                          <div className="flex-1 min-w-0">
                            {/* Línea principal */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium">{act.usuario_nombre}</span>
                              <span className={`${tipoConfig.textColor} font-medium`}>
                                {tipoConfig.label}
                              </span>
                              {descripcion && (
                                <>
                                  {act.tabla_afectada && (
                                    <span className="flex items-center gap-1">
                                      <TablaIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                      <span className="text-muted-foreground">{descripcion.tablaLabel}</span>
                                    </span>
                                  )}
                                  {descripcion.registroNombre && (
                                    <span className="font-medium">{descripcion.registroNombre}</span>
                                  )}
                                </>
                              )}
                              {isClickable && (
                                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/50" />
                              )}
                            </div>
                            
                            {/* Descripción adicional */}
                            {act.descripcion && act.tipo_accion !== 'login' && (
                              <p className="text-sm text-muted-foreground mt-1 truncate">
                                {act.descripcion}
                              </p>
                            )}
                            
                            {/* Badges con datos */}
                            {badges && badges.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {badges.map((badge, idx) => (
                                  <Badge key={idx} variant="secondary" className="text-xs font-normal">
                                    {badge.key}: {String(badge.value)}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                          
                          {/* Hora */}
                          <div className="text-xs text-muted-foreground flex-shrink-0">
                            {formatTime(act.created_at)}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Paginación */}
      {total > limit && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Mostrando {page * limit + 1} - {Math.min((page + 1) * limit, total)} de {total}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(page - 1)}
              disabled={page === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="flex items-center px-3 text-sm">
              {page + 1} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= totalPages - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
