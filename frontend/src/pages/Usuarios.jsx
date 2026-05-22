import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useSaving } from '../hooks/useSaving';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import { Checkbox } from '../components/ui/checkbox';
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
  DialogFooter,
  DialogDescription,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../components/ui/accordion';
import { Label } from '../components/ui/label';
import { Plus, Pencil, Trash2, Users, Shield, Key, Play, Package, Database, Settings, AlertTriangle, BarChart } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '../lib/dateUtils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ROLES = [
  { value: 'admin', label: 'Administrador', color: 'bg-red-500' },
  { value: 'usuario', label: 'Usuario', color: 'bg-blue-500' },
  { value: 'lectura', label: 'Solo Lectura', color: 'bg-gray-500' },
];

const CATEGORIA_ICONS = {
  'Producción': Play,
  'Inventario': Package,
  'Catálogos': Database,
  'Odoo': Package,
  'Maestros': Database,
  'Configuración': Settings,
  'Calidad': AlertTriangle,
  'Reportes': BarChart,
};

const PERMISOS_CATEGORIAS_BASE = [
  {
    nombre: 'Producción',
    icono: 'Play',
    tablas: [
      { key: 'dashboard', nombre: 'Dashboard', acciones: ['ver'] },
      { key: 'registros', nombre: 'Registros', acciones: ['ver', 'crear', 'editar', 'eliminar'] },
      { key: 'muestras', nombre: 'Muestras', acciones: ['ver', 'crear', 'editar', 'eliminar'] },
      { key: 'movimientos_produccion', nombre: 'Movimientos de Producción', acciones: ['ver', 'crear', 'editar', 'eliminar'] },
      { key: 'guias_remision', nombre: 'Guías de Remisión', acciones: ['ver', 'crear', 'editar', 'eliminar'] },
    ],
  },
  {
    nombre: 'Inventario',
    icono: 'Package',
    tablas: [
      { key: 'inventario', nombre: 'Items de Inventario', acciones: ['ver', 'crear', 'editar', 'eliminar'] },
      { key: 'inventario_ingresos', nombre: 'Ingresos', acciones: ['ver', 'crear', 'editar', 'eliminar'] },
      { key: 'inventario_salidas', nombre: 'Salidas', acciones: ['ver', 'crear', 'editar', 'eliminar'] },
      { key: 'inventario_salidas_libres', nombre: 'Salidas Libres', acciones: ['ver', 'crear', 'editar', 'eliminar'] },
      { key: 'inventario_ajustes', nombre: 'Ajustes', acciones: ['ver', 'crear', 'editar', 'eliminar'] },
      { key: 'inventario_rollos', nombre: 'Rollos de Tela', acciones: ['ver', 'crear', 'editar'] },
      { key: 'reporte_movimientos', nombre: 'Movimientos', acciones: ['ver'] },
      { key: 'kardex', nombre: 'Kardex', acciones: ['ver'] },
      { key: 'kardex_pt', nombre: 'Kardex PT', acciones: ['ver'] },
      { key: 'kardex_general', nombre: 'Kardex General', acciones: ['ver'] },
      { key: 'reporte_stock_bajo', nombre: 'Alertas Stock', acciones: ['ver'] },
      { key: 'transferencias_linea', nombre: 'Transferencias', acciones: ['ver', 'crear', 'editar'] },
    ],
  },
  {
    nombre: 'Catálogos',
    icono: 'Database',
    tablas: [
      { key: 'marcas', nombre: 'Marcas', acciones: ['ver', 'crear', 'editar', 'eliminar'] },
      { key: 'generos', nombre: 'Géneros', acciones: ['ver', 'crear', 'editar', 'eliminar'] },
      { key: 'tipos', nombre: 'Tipos', acciones: ['ver', 'crear', 'editar', 'eliminar'] },
      { key: 'entalles', nombre: 'Entalles', acciones: ['ver', 'crear', 'editar', 'eliminar'] },
      { key: 'telas', nombre: 'Telas', acciones: ['ver', 'crear', 'editar', 'eliminar'] },
      { key: 'telas_general', nombre: 'Telas Generales', acciones: ['ver', 'crear', 'editar', 'eliminar'] },
      { key: 'hilos', nombre: 'Hilos', acciones: ['ver', 'crear', 'editar', 'eliminar'] },
      { key: 'hilos_especificos', nombre: 'Hilos Específicos', acciones: ['ver', 'crear', 'editar', 'eliminar'] },
      { key: 'tallas', nombre: 'Tallas', acciones: ['ver', 'crear', 'editar', 'eliminar'] },
      { key: 'colores', nombre: 'Colores', acciones: ['ver', 'crear', 'editar', 'eliminar'] },
      { key: 'colores_generales', nombre: 'Colores Generales', acciones: ['ver', 'crear', 'editar', 'eliminar'] },
      { key: 'colores_por_tipo', nombre: 'Colores por Tipo', acciones: ['ver', 'crear', 'editar', 'eliminar'] },
      { key: 'cuellos', nombre: 'Cuellos', acciones: ['ver', 'crear', 'editar', 'eliminar'] },
      { key: 'detalles', nombre: 'Detalles', acciones: ['ver', 'crear', 'editar', 'eliminar'] },
      { key: 'lavados', nombre: 'Lavados', acciones: ['ver', 'crear', 'editar', 'eliminar'] },
      { key: 'bases', nombre: 'Bases', acciones: ['ver', 'crear', 'editar', 'eliminar'] },
      { key: 'modelos', nombre: 'Modelos', acciones: ['ver', 'crear', 'editar', 'eliminar'] },
    ],
  },
  {
    nombre: 'Odoo',
    icono: 'Package',
    tablas: [
      { key: 'productos_odoo', nombre: 'Productos Odoo', acciones: ['ver'] },
    ],
  },
  {
    nombre: 'Maestros',
    icono: 'Settings',
    tablas: [
      { key: 'servicios_produccion', nombre: 'Servicios', acciones: ['ver', 'crear', 'editar', 'eliminar'] },
      { key: 'personas_produccion', nombre: 'Personas', acciones: ['ver', 'crear', 'editar', 'eliminar'] },
      { key: 'rutas_produccion', nombre: 'Rutas de Producción', acciones: ['ver', 'crear', 'editar', 'eliminar'] },
      { key: 'movimientos_produccion', nombre: 'Movimientos', acciones: ['ver', 'crear', 'editar', 'eliminar'] },
      { key: 'motivos_incidencia', nombre: 'Motivos Incidencia', acciones: ['ver', 'crear', 'editar', 'eliminar'] },
      { key: 'reporte_productividad', nombre: 'Productividad', acciones: ['ver'] },
    ],
  },
  {
    nombre: 'Configuración',
    icono: 'Settings',
    tablas: [
      { key: 'config_empresa', nombre: 'Empresa', acciones: ['ver', 'editar'] },
      { key: 'usuarios', nombre: 'Usuarios', acciones: ['ver', 'crear', 'editar', 'eliminar'] },
      { key: 'historial_actividad', nombre: 'Historial', acciones: ['ver'] },
      { key: 'auditoria', nombre: 'Auditoría', acciones: ['ver'] },
      { key: 'backups', nombre: 'Backups', acciones: ['ver', 'crear', 'eliminar'] },
    ],
  },
  {
    nombre: 'Calidad',
    icono: 'AlertTriangle',
    tablas: [
      { key: 'merma', nombre: 'Merma', acciones: ['ver', 'crear', 'editar', 'eliminar'] },
      { key: 'reporte_calidad', nombre: 'Reportes de Calidad', acciones: ['ver'] },
    ],
  },
  {
    nombre: 'Reportes',
    icono: 'BarChart',
    tablas: [
      { key: 'reporte_validacion_registros', nombre: 'Validación MP/Servicios', acciones: ['ver'] },
      { key: 'reporte_seguimiento', nombre: 'Seguimiento', acciones: ['ver'] },
      { key: 'reporte_entregas', nombre: 'Entregas', acciones: ['ver'] },
      { key: 'reporte_costo_lote', nombre: 'Costo por Lote', acciones: ['ver'] },
      { key: 'reporte_operativo', nombre: 'Reporte de servicios', acciones: ['ver'] },
      { key: 'reporte_valorizacion', nombre: 'Valorización', acciones: ['ver'] },
      { key: 'reporte_lotes', nombre: 'Lotes & Trazabilidad', acciones: ['ver'] },
      { key: 'reporte_matriz', nombre: 'Matriz Dinámica', acciones: ['ver'] },
      { key: 'reporte_rendimiento_servicios', nombre: 'Rendimiento Servicios', acciones: ['ver'] },
      { key: 'reporte_despachos_tienda', nombre: 'Despachos a Tienda', acciones: ['ver'] },
      { key: 'reporte_costos_produccion', nombre: 'Detalle por Talla e Insumo', acciones: ['ver'] },
      { key: 'reporte_movimientos_costos', nombre: 'Movimientos & Costos', acciones: ['ver'] },
    ],
  },
];

const PERMISOS_OPERATIVOS_BASE = {
  estados_disponibles: [
    'Para Corte', 'Corte', 'Para Estampado', 'Estampado',
    'Para Costura', 'Costura', 'Bordado',
    'Para Atraque', 'Atraque', 'Para Lavandería', 'Muestra Lavandería', 'Lavandería',
    'Para Acabado', 'Acabado',
    'Almacén PT', 'Tienda',
  ],
  acciones_produccion: [
    { key: 'crear_movimientos', nombre: 'Crear movimientos de producción' },
    { key: 'editar_movimientos', nombre: 'Editar/eliminar movimientos' },
    { key: 'cambiar_estados', nombre: 'Cambiar estados de registros' },
    { key: 'registrar_incidencias', nombre: 'Registrar incidencias/paralizaciones' },
    { key: 'resolver_incidencias', nombre: 'Resolver incidencias/paralizaciones' },
    { key: 'dividir_lotes', nombre: 'Dividir lotes' },
    { key: 'cerrar_lotes', nombre: 'Cerrar/finalizar lotes' },
  ],
  acciones_inventario: [
    { key: 'crear_items', nombre: 'Crear items de inventario' },
    { key: 'registrar_ingresos', nombre: 'Registrar ingresos' },
    { key: 'dar_salida_mp', nombre: 'Dar salida de materia prima' },
    { key: 'reservar_materiales', nombre: 'Reservar materiales' },
    { key: 'ajustes_stock', nombre: 'Ajustes de stock' },
    { key: 'gestionar_bom', nombre: 'Gestionar BOM de modelos' },
  ],
};

const mergeUniqueByKey = (base = [], incoming = []) => {
  const map = new Map(base.map((item) => [item.key, item]));
  incoming.forEach((item) => {
    if (!item?.key) return;
    map.set(item.key, { ...item, ...map.get(item.key) });
  });
  return Array.from(map.values());
};

const mergeUniqueValues = (base = [], incoming = []) => {
  return Array.from(new Set([...base, ...incoming].filter(Boolean)));
};

const buildPermisosStructure = (serverData = {}) => {
  const knownKeys = new Set(PERMISOS_CATEGORIAS_BASE.flatMap((categoria) => categoria.tablas.map((tabla) => tabla.key)));
  const unknownTables = (serverData.categorias || [])
    .flatMap((categoria) => categoria.tablas || [])
    .filter((tabla) => tabla?.key && !knownKeys.has(tabla.key));

  const categorias = PERMISOS_CATEGORIAS_BASE.map((categoria) => ({
    ...categoria,
    tablas: categoria.tablas.map((tabla) => ({ ...tabla })),
  }));

  if (unknownTables.length > 0) {
    categorias.push({
      nombre: 'Otros',
      icono: 'Database',
      tablas: unknownTables,
    });
  }

  const serverOperativos = serverData.permisos_operativos || {};
  return {
    ...serverData,
    categorias,
    permisos_operativos: {
      ...serverOperativos,
      servicios_disponibles: serverOperativos.servicios_disponibles || [],
      estados_disponibles: mergeUniqueValues(PERMISOS_OPERATIVOS_BASE.estados_disponibles, serverOperativos.estados_disponibles || []),
      acciones_produccion: mergeUniqueByKey(PERMISOS_OPERATIVOS_BASE.acciones_produccion, serverOperativos.acciones_produccion || []),
      acciones_inventario: mergeUniqueByKey(PERMISOS_OPERATIVOS_BASE.acciones_inventario, serverOperativos.acciones_inventario || []),
    },
  };
};

export const Usuarios = () => {
  const { user: currentUser, isAdmin } = useAuth();
  const [usuarios, setUsuarios] = useState([]);
  const [estructura, setEstructura] = useState(() => buildPermisosStructure());
  const [loading, setLoading] = useState(true);
  const { saving, guard } = useSaving();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [permisosDialogOpen, setPermisosDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    nombre_completo: '',
    rol: 'usuario',
  });
  const [permisos, setPermisos] = useState({});
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const fetchUsuarios = async () => {
    try {
      const response = await axios.get(`${API}/usuarios`);
      setUsuarios(response.data);
    } catch (error) {
      toast.error('Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  };

  const fetchEstructura = async () => {
    try {
      const response = await axios.get(`${API}/permisos/estructura`);
      setEstructura(buildPermisosStructure(response.data));
    } catch (error) {
      console.error('Error fetching estructura:', error);
      setEstructura(buildPermisosStructure());
    }
  };

  useEffect(() => {
    fetchUsuarios();
    fetchEstructura();
  }, []);

  const handleSubmit = guard(async (e) => {
    e.preventDefault();
    try {
      if (editingUser) {
        await axios.put(`${API}/usuarios/${editingUser.id}`, {
          email: formData.email,
          nombre_completo: formData.nombre_completo,
          rol: formData.rol,
        });
        toast.success('Usuario actualizado');
      } else {
        if (!formData.password) {
          toast.error('La contraseña es requerida');
          return;
        }
        await axios.post(`${API}/usuarios`, formData);
        toast.success('Usuario creado');
      }
      setDialogOpen(false);
      resetForm();
      fetchUsuarios();
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response?.data?.detail : 'Error al guardar');
    }
  });

  const handleToggleActivo = async (user) => {
    try {
      await axios.put(`${API}/usuarios/${user.id}`, { activo: !user.activo });
      toast.success(`Usuario ${!user.activo ? 'activado' : 'desactivado'}`);
      fetchUsuarios();
    } catch (error) {
      toast.error('Error al cambiar estado');
    }
  };

  const handleResetPassword = async (user) => {
    if (!window.confirm(`¿Resetear contraseña de ${user.username} a "${user.username}123"?`)) return;
    try {
      const response = await axios.put(`${API}/usuarios/${user.id}/reset-password`);
      toast.success(response.data.message);
    } catch (error) {
      toast.error('Error al resetear contraseña');
    }
  };

  const handleOpenPasswordDialog = (user) => {
    setEditingUser(user);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordDialogOpen(true);
  };

  const handleSetPassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error('Las contraseñas no coinciden');
      return;
    }
    if (newPassword.length < 4) {
      toast.error('La contraseña debe tener al menos 4 caracteres');
      return;
    }
    try {
      await axios.put(`${API}/usuarios/${editingUser.id}/set-password`, {
        new_password: newPassword
      });
      toast.success(`Contraseña de ${editingUser.username} actualizada`);
      setPasswordDialogOpen(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response?.data?.detail : 'Error al cambiar contraseña');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este usuario?')) return;
    try {
      await axios.delete(`${API}/usuarios/${id}`);
      toast.success('Usuario eliminado');
      fetchUsuarios();
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response?.data?.detail : 'Error al eliminar');
    }
  };

  const handleEditPermisos = (user) => {
    setEditingUser(user);
    setPermisos(user.permisos || {});
    setPermisosDialogOpen(true);
  };

  const handleSavePermisos = async () => {
    try {
      await axios.put(`${API}/usuarios/${editingUser.id}`, { permisos });
      toast.success('Permisos actualizados');
      setPermisosDialogOpen(false);
      fetchUsuarios();
    } catch (error) {
      toast.error('Error al guardar permisos');
    }
  };

  const togglePermiso = (tabla, accion) => {
    setPermisos(prev => {
      const current = prev[tabla] || {};
      const nextChecked = !current[accion];
      const nextTabla = { ...current, [accion]: nextChecked };

      // Crear/editar/eliminar no tiene sentido sin poder ver el modulo.
      if (accion !== 'ver' && nextChecked) {
        nextTabla.ver = true;
      }

      // Si se quita Ver, se apagan tambien las acciones de escritura.
      if (accion === 'ver' && !nextChecked) {
        Object.keys(nextTabla).forEach((key) => {
          nextTabla[key] = false;
        });
      }

      return {
        ...prev,
        [tabla]: nextTabla,
      };
    });
  };

  const toggleAllPermisos = (tabla, acciones, checked) => {
    const newPermisos = { ...permisos };
    newPermisos[tabla] = {};
    acciones.forEach(acc => {
      newPermisos[tabla][acc] = checked;
    });
    setPermisos(newPermisos);
  };

  // ===== Operativos =====
  const operativos = permisos._operativos || {};
  const serviciosPermitidos = operativos.servicios_permitidos || [];
  const accionesProduccion = operativos.acciones_produccion || {};
  const accionesInventario = operativos.acciones_inventario || {};

  const setOperativos = (op) => {
    setPermisos(prev => ({ ...prev, _operativos: { ...prev._operativos, ...op } }));
  };

  const toggleServicio = (sid) => {
    const current = [...serviciosPermitidos];
    const idx = current.indexOf(sid);
    if (idx >= 0) current.splice(idx, 1);
    else current.push(sid);
    setOperativos({ servicios_permitidos: current });
  };

  const toggleAccionProd = (key) => {
    setOperativos({
      acciones_produccion: { ...accionesProduccion, [key]: !accionesProduccion[key] }
    });
  };

  const toggleAccionInv = (key) => {
    setOperativos({
      acciones_inventario: { ...accionesInventario, [key]: !accionesInventario[key] }
    });
  };

  const selectAllServicios = (all) => {
    if (all) {
      setOperativos({ servicios_permitidos: [] }); // vacío = todos
    }
  };

  const selectNoneServicios = () => {
    const allIds = estructura.permisos_operativos?.servicios_disponibles?.map(s => s.id) || [];
    // Deselecting all = setting to the full list, which then means "none" by negation
    // Actually: vacío = todos, con IDs = solo esos
    // So if user wants to restrict, they select specific services
    setOperativos({ servicios_permitidos: [] }); 
  };

  const handleNew = () => {
    setEditingUser(null);
    resetForm();
    setDialogOpen(true);
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      email: user.email || '',
      password: '',
      nombre_completo: user.nombre_completo || '',
      rol: user.rol,
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      username: '',
      email: '',
      password: '',
      nombre_completo: '',
      rol: 'usuario',
    });
  };

  const getRolBadge = (rol) => {
    const rolInfo = ROLES.find(r => r.value === rol) || ROLES[1];
    return (
      <Badge className={`${rolInfo.color} text-white`}>
        {rolInfo.label}
      </Badge>
    );
  };

  if (!isAdmin()) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">No tienes permisos para ver esta página</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="usuarios-page">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6" />
            Gestión de Usuarios
          </h2>
          <p className="text-muted-foreground">
            Administra usuarios y sus permisos
          </p>
        </div>
        <Button onClick={handleNew} data-testid="btn-nuevo-usuario">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Usuario
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuario</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Creado</TableHead>
                <TableHead className="w-[150px]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">Cargando...</TableCell>
                </TableRow>
              ) : usuarios.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No hay usuarios
                  </TableCell>
                </TableRow>
              ) : (
                usuarios.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.username}</TableCell>
                    <TableCell>{user.nombre_completo || '-'}</TableCell>
                    <TableCell className="text-muted-foreground">{user.email || '-'}</TableCell>
                    <TableCell>{getRolBadge(user.rol)}</TableCell>
                    <TableCell>
                      <Switch
                        checked={user.activo}
                        onCheckedChange={() => handleToggleActivo(user)}
                        disabled={user.id === currentUser?.id}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(user.created_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {user.rol === 'usuario' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditPermisos(user)}
                            title="Editar Permisos"
                          >
                            <Shield className="h-4 w-4 text-blue-500" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenPasswordDialog(user)}
                          title="Cambiar Contraseña"
                          disabled={user.id === currentUser?.id}
                        >
                          <Key className="h-4 w-4 text-orange-500" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(user)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(user.id)}
                          disabled={user.id === currentUser?.id}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog Crear/Editar Usuario */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}</DialogTitle>
            <DialogDescription>
              {editingUser ? 'Modifica los datos del usuario' : 'Crea una nueva cuenta de usuario'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="username">Usuario *</Label>
                <Input
                  id="username"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder="nombre.usuario"
                  required
                  disabled={!!editingUser}
                />
              </div>
              {!editingUser && (
                <div className="space-y-2">
                  <Label htmlFor="password">Contraseña *</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Contraseña inicial"
                    required={!editingUser}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="nombre_completo">Nombre Completo</Label>
                <Input
                  id="nombre_completo"
                  value={formData.nombre_completo}
                  onChange={(e) => setFormData({ ...formData, nombre_completo: e.target.value })}
                  placeholder="Juan Pérez"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="usuario@empresa.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Rol</Label>
                <Select value={formData.rol} onValueChange={(value) => setFormData({ ...formData, rol: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((rol) => (
                      <SelectItem key={rol.value} value={rol.value}>
                        {rol.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Admin: acceso total | Usuario: permisos personalizables | Lectura: solo ver
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {editingUser ? 'Actualizar' : 'Crear'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog Editar Permisos */}
      <Dialog open={permisosDialogOpen} onOpenChange={setPermisosDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-500" />
              Permisos de {editingUser?.nombre_completo || editingUser?.username}
            </DialogTitle>
            <DialogDescription>
              Configura permisos por modulo y permisos operativos granulares.
            </DialogDescription>
          </DialogHeader>
          
          <Accordion type="multiple" className="w-full" defaultValue={['operativos']}>
            {/* ===== PERMISOS OPERATIVOS ===== */}
            <AccordionItem value="operativos">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-amber-500" />
                  <span className="font-semibold">Permisos Operativos</span>
                  <Badge variant="secondary" className="text-[10px] ml-1">Granular</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-5 pl-2">
                  {/* Servicios Permitidos */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold">Servicios permitidos para movimientos</p>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" className="h-6 text-[10px]"
                          onClick={() => setOperativos({ servicios_permitidos: [] })}>
                          Todos
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">
                      Si no marcas ninguno, tiene acceso a todos. Si marcas algunos, solo puede operar en esos servicios.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {estructura.permisos_operativos?.servicios_disponibles?.map((s) => (
                        <label key={s.id} className="flex items-center gap-2 p-2 rounded border text-xs cursor-pointer hover:bg-accent/50"
                          data-testid={`servicio-${s.nombre}`}>
                          <Checkbox
                            checked={serviciosPermitidos.includes(s.id)}
                            onCheckedChange={() => toggleServicio(s.id)}
                          />
                          {s.nombre}
                        </label>
                      ))}
                    </div>
                    {serviciosPermitidos.length > 0 && (
                      <p className="text-xs text-amber-600 mt-1">
                        Restringido a {serviciosPermitidos.length} servicio(s)
                      </p>
                    )}
                  </div>

                  {/* Acciones de Produccion */}
                  <div>
                    <p className="text-sm font-semibold mb-2">Acciones de produccion</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {estructura.permisos_operativos?.acciones_produccion?.map((a) => (
                        <label key={a.key} className="flex items-center gap-2 p-2 rounded border text-xs cursor-pointer hover:bg-accent/50"
                          data-testid={`accion-prod-${a.key}`}>
                          <Checkbox
                            checked={accionesProduccion[a.key] || false}
                            onCheckedChange={() => toggleAccionProd(a.key)}
                          />
                          {a.nombre}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Estados permitidos */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold">Estados de produccion permitidos</p>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" className="h-6 text-[10px]"
                          onClick={() => setOperativos({ estados_permitidos: [] })}>
                          Todos
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">
                      Si no marcas ninguno, puede cambiar a todos los estados. Si marcas algunos, solo puede cambiar a esos.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {estructura.permisos_operativos?.estados_disponibles?.map((estado) => {
                        const estadosPerms = operativos.estados_permitidos || [];
                        const checked = estadosPerms.includes(estado);
                        return (
                          <label key={estado} className="flex items-center gap-2 p-1.5 rounded border text-[11px] cursor-pointer hover:bg-accent/50"
                            data-testid={`estado-${estado}`}>
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => {
                                const current = [...(operativos.estados_permitidos || [])];
                                const idx = current.indexOf(estado);
                                if (idx >= 0) current.splice(idx, 1);
                                else current.push(estado);
                                setOperativos({ estados_permitidos: current });
                              }}
                            />
                            {estado}
                          </label>
                        );
                      })}
                    </div>
                    {(operativos.estados_permitidos || []).length > 0 && (
                      <p className="text-xs text-amber-600 mt-1">
                        Restringido a {(operativos.estados_permitidos || []).length} estado(s)
                      </p>
                    )}
                  </div>

                  {/* Acciones de Inventario */}
                  <div>
                    <p className="text-sm font-semibold mb-2">Acciones de inventario/materiales</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {estructura.permisos_operativos?.acciones_inventario?.map((a) => (
                        <label key={a.key} className="flex items-center gap-2 p-2 rounded border text-xs cursor-pointer hover:bg-accent/50"
                          data-testid={`accion-inv-${a.key}`}>
                          <Checkbox
                            checked={accionesInventario[a.key] || false}
                            onCheckedChange={() => toggleAccionInv(a.key)}
                          />
                          {a.nombre}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* ===== PERMISOS POR MODULO ===== */}
            {estructura.categorias?.map((categoria) => {
              const Icon = CATEGORIA_ICONS[categoria.nombre] || Database;
              return (
                <AccordionItem key={categoria.nombre} value={categoria.nombre}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      {categoria.nombre}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3 pl-6">
                      {categoria.tablas.map((tabla) => (
                        <div key={tabla.key} className="flex items-center justify-between py-2 border-b last:border-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{tabla.nombre}</span>
                          </div>
                          <div className="flex items-center gap-4">
                            {tabla.acciones.map((accion) => (
                              <label key={accion} className="flex items-center gap-1 cursor-pointer">
                                <Checkbox
                                  checked={permisos[tabla.key]?.[accion] || false}
                                  onCheckedChange={() => togglePermiso(tabla.key, accion)}
                                />
                                <span className="text-xs text-muted-foreground capitalize">{accion}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPermisosDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSavePermisos} data-testid="btn-guardar-permisos">
              Guardar Permisos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Cambiar Contraseña de Usuario */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-orange-500" />
              Cambiar Contraseña
            </DialogTitle>
            <DialogDescription>
              Establece una nueva contraseña para <strong>{editingUser?.username}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new_password">Nueva Contraseña</Label>
              <Input
                id="new_password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Nueva contraseña"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm_password">Confirmar Contraseña</Label>
              <Input
                id="confirm_password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repite la contraseña"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPasswordDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSetPassword}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
