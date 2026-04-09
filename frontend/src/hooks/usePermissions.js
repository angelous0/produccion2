import { useAuth } from '../context/AuthContext';

/**
 * Hook para verificar permisos del usuario actual
 * 
 * Uso basico:
 * const { canView, canCreate, canEdit, canDelete, isReadOnly } = usePermissions('registros');
 * 
 * Uso operativo:
 * const { canService, canAction, canInventoryAction } = usePermissions('registros');
 * canService('id-servicio-costura') // true/false
 * canAction('crear_movimientos')    // true/false
 * canInventoryAction('dar_salida_mp') // true/false
 */
export const usePermissions = (tabla) => {
  const { user, isAdmin } = useAuth();

  // Admin tiene todos los permisos
  if (isAdmin()) {
    return {
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
      isReadOnly: false,
      isAdmin: true,
      canService: () => true,
      canAction: () => true,
      canInventoryAction: () => true,
      canChangeToState: () => true,
      serviciosPermitidos: [],
      estadosPermitidos: [],
      todosServicios: true,
    };
  }

  // Usuario de solo lectura
  if (user?.rol === 'lectura') {
    return {
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      isReadOnly: true,
      isAdmin: false,
      canService: () => false,
      canAction: () => false,
      canInventoryAction: () => false,
      canChangeToState: () => false,
      serviciosPermitidos: [],
      estadosPermitidos: [],
      todosServicios: false,
    };
  }

  // Usuario normal - verificar permisos especificos
  const permisos = user?.permisos || {};
  const permisosTabla = permisos[tabla] || {};
  const operativos = permisos._operativos || {};
  const serviciosPermitidos = operativos.servicios_permitidos || [];
  const todosServicios = serviciosPermitidos.length === 0; // vacío = todos permitidos
  const accionesProduccion = operativos.acciones_produccion || {};
  const accionesInventario = operativos.acciones_inventario || {};
  const estadosPermitidos = operativos.estados_permitidos || []; // vacío = todos

  // Check if user can operate on a specific service
  const canService = (servicioId) => {
    if (todosServicios) return true;
    return serviciosPermitidos.includes(servicioId);
  };

  // Check production action
  const canAction = (actionKey) => {
    // Si no hay operativos definidos, permitir todo (backward compatibility)
    if (!operativos.acciones_produccion) return true;
    return accionesProduccion[actionKey] === true;
  };

  // Check inventory action
  const canInventoryAction = (actionKey) => {
    if (!operativos.acciones_inventario) return true;
    return accionesInventario[actionKey] === true;
  };

  // Check if user can change to a specific state
  const canChangeToState = (estado) => {
    if (estadosPermitidos.length === 0) return true; // vacío = todos
    return estadosPermitidos.includes(estado);
  };

  return {
    canView: permisosTabla.ver !== false,
    canCreate: permisosTabla.crear === true,
    canEdit: permisosTabla.editar === true,
    canDelete: permisosTabla.eliminar === true,
    isReadOnly: !permisosTabla.crear && !permisosTabla.editar && !permisosTabla.eliminar,
    isAdmin: false,
    canService,
    canAction,
    canInventoryAction,
    canChangeToState,
    serviciosPermitidos,
    estadosPermitidos,
    todosServicios,
  };
};

/**
 * Mapeo de rutas a tablas de permisos
 */
export const RUTA_A_TABLA = {
  '/': 'dashboard',
  '/marcas': 'marcas',
  '/tipos': 'tipos',
  '/entalles': 'entalles',
  '/telas': 'telas',
  '/hilos': 'hilos',
  '/hilos-especificos': 'hilos_especificos',
  '/tallas-catalogo': 'tallas',
  '/colores-catalogo': 'colores',
  '/colores-generales': 'colores_generales',
  '/modelos': 'modelos',
  '/registros': 'registros',
  '/inventario': 'inventario',
  '/inventario/ingresos': 'inventario',
  '/inventario/salidas': 'inventario',
  '/inventario/ajustes': 'inventario',
  '/inventario/rollos': 'inventario',
  '/inventario/movimientos': 'reporte_movimientos',
  '/inventario/kardex': 'kardex',
  '/maestros/servicios': 'servicios',
  '/maestros/personas': 'personas',
  '/maestros/rutas': 'rutas',
  '/maestros/movimientos': 'movimientos_produccion',
  '/maestros/productividad': 'reporte_productividad',
  '/calidad/merma': 'mermas',
  '/guias': 'guias',
};

export default usePermissions;
