/**
 * Matriz de permisos por rol — fuente única de verdad.
 *
 * Cada rol tiene una lista de acciones que puede hacer. El helper `puede(user, accion)`
 * resuelve si un usuario tiene permiso para una acción.
 *
 * Reglas:
 *   - `admin` siempre tiene todo. No se lista cada acción para evitar olvidos.
 *   - `lectura` puede ver pantallas pero no mutar. No se lista ninguna acción.
 *   - El resto de roles tienen una lista explícita de acciones.
 *
 * Para agregar un permiso fino que no encaja en un rol completo (ej. "esta persona
 * además puede aprobar matriz aunque sea supervisor de corte"), usar overrides:
 *   user.permisos_extra: ["aprobar_matriz_colores"]
 *   user.permisos_quitados: ["crear_corte"]
 *
 * Esto implementa la opción "Híbrido: rol + overrides" que eligió Eduard.
 */

// ─── ACCIONES DEFINIDAS ──────────────────────────────────────────────────────
// Estas son las claves que se usan en `puede(user, 'accion')` por todo el móvil.
// Si agregás una acción nueva, agregala acá y al rol que corresponda.

export const ACCIONES = {
  // Cortes / OP
  CREAR_CORTE:                  'crear_corte',
  EDITAR_CARACTERISTICAS_CORTE: 'editar_caracteristicas_corte',  // marca, tipo, entalle, tela, hilo, hilo específico
  EDITAR_TALLAS:                'editar_tallas',
  EDITAR_MATRIZ_COLORES:        'editar_matriz_colores',
  APROBAR_MATRIZ_COLORES:       'aprobar_matriz_colores',
  CERRAR_OP:                    'cerrar_op',
  ANULAR_OP:                    'anular_op',

  // Movimientos
  CREAR_MOVIMIENTO_CORTE:       'crear_movimiento_corte',
  CREAR_MOVIMIENTO_ESTAMPADO:   'crear_movimiento_estampado',
  CREAR_MOVIMIENTO_BORDADO:     'crear_movimiento_bordado',
  CREAR_MOVIMIENTO_COSTURA:     'crear_movimiento_costura',
  CREAR_MOVIMIENTO_ATRAQUE:     'crear_movimiento_atraque',
  CREAR_MOVIMIENTO_LAVANDERIA:  'crear_movimiento_lavanderia',
  CREAR_MOVIMIENTO_ACABADO:     'crear_movimiento_acabado',
  REPORTAR_AVANCE:              'reportar_avance',
  CERRAR_MOVIMIENTO:            'cerrar_movimiento',

  // Inventario
  CREAR_INGRESO_MP:             'crear_ingreso_mp',
  CREAR_SALIDA_LIBRE:           'crear_salida_libre',
  AJUSTAR_STOCK:                'ajustar_stock',
  AGREGAR_ROLLOS:               'agregar_rollos',
  DESCARGAR_MP:                 'descargar_mp',          // todo tipo de MP a un corte
  DESCARGAR_MP_SOLO_TELA:       'descargar_mp_solo_tela', // limitado a items tipo TELA

  // Reservas
  GENERAR_REQUERIMIENTO:        'generar_requerimiento',
  RESERVAR_MP:                  'reservar_mp',
  ANULAR_RESERVA:               'anular_reserva',

  // Calidad / Fallados / Acabado
  REPORTAR_INCIDENCIA:          'reportar_incidencia',
  REPORTAR_FALLADO:             'reportar_fallado',
  RESOLVER_INCIDENCIA:          'resolver_incidencia',
  REGISTRAR_ENTREGA_ARREGLO:    'registrar_entrega_arreglo',
  PRORROGA_ARREGLO:             'prorroga_arreglo',
  MARCAR_PARA_COBRO:            'marcar_para_cobro',
  GENERAR_NOTA_COBRO:           'generar_nota_cobro',

  // Muestras lavandería
  CREAR_MUESTRA_LAVANDERIA:     'crear_muestra_lavanderia',
  MARCAR_RETORNO_MUESTRA:       'marcar_retorno_muestra',

  // PT / Tienda
  MARCAR_LLEGADA_TIENDA:        'marcar_llegada_tienda',
  CONFIRMAR_RECEPCION_PT:       'confirmar_recepcion_pt',

  // Otros
  CHAT_REGISTRO:                'chat_registro',
  VER_COSTOS:                   'ver_costos',
  VINCULAR_ODOO:                'vincular_odoo',
};

// ─── PRESETS POR ROL ─────────────────────────────────────────────────────────
// Cada rol mapea a la lista de acciones que puede hacer. Si una persona necesita
// una acción adicional, agregar el rol custom o usar `permisos_extra` por usuario.

export const ROLES_PRESET = {
  // admin: bypass — siempre true. No se define aquí, se maneja en puede().
  admin: '*',

  // lectura: solo ve, no muta. Lista vacía explícita.
  lectura: [],

  // supervisor_inventario (ej: usuario "inventario")
  // Maneja stock, ingresos, salidas, ajustes. NO descarga MP a cortes
  // (esa es decisión del cortador), pero puede ajustar y administrar.
  supervisor_inventario: [
    ACCIONES.CREAR_INGRESO_MP,
    ACCIONES.CREAR_SALIDA_LIBRE,
    ACCIONES.AJUSTAR_STOCK,
    ACCIONES.AGREGAR_ROLLOS,
    ACCIONES.DESCARGAR_MP,
    ACCIONES.GENERAR_REQUERIMIENTO,
    ACCIONES.RESERVAR_MP,
    ACCIONES.REPORTAR_INCIDENCIA,
    ACCIONES.CHAT_REGISTRO,
    ACCIONES.VER_COSTOS,
  ],

  // supervisor_corte_planificacion (ej: cristian cassas)
  // El que arma el corte y planifica producción inicial. Descarga toda MP.
  supervisor_corte_planificacion: [
    ACCIONES.CREAR_CORTE,
    ACCIONES.EDITAR_CARACTERISTICAS_CORTE,
    ACCIONES.EDITAR_TALLAS,
    ACCIONES.DESCARGAR_MP,
    ACCIONES.GENERAR_REQUERIMIENTO,
    ACCIONES.RESERVAR_MP,
    ACCIONES.CREAR_MOVIMIENTO_CORTE,
    ACCIONES.CREAR_MOVIMIENTO_ESTAMPADO,
    ACCIONES.CREAR_MOVIMIENTO_BORDADO,
    ACCIONES.CERRAR_MOVIMIENTO,
    ACCIONES.REPORTAR_AVANCE,
    ACCIONES.REPORTAR_INCIDENCIA,
    ACCIONES.REPORTAR_FALLADO,
    ACCIONES.CHAT_REGISTRO,
    ACCIONES.VER_COSTOS,
    ACCIONES.VINCULAR_ODOO,
  ],

  // supervisor_corte (ej: fortunato)
  // Hace corte/estampado/bordado pero NO crea OP ni edita características.
  // Solo descarga TELA, no avíos.
  supervisor_corte: [
    ACCIONES.EDITAR_TALLAS,
    ACCIONES.DESCARGAR_MP_SOLO_TELA,
    ACCIONES.CREAR_MOVIMIENTO_CORTE,
    ACCIONES.CREAR_MOVIMIENTO_ESTAMPADO,
    ACCIONES.CREAR_MOVIMIENTO_BORDADO,
    ACCIONES.CERRAR_MOVIMIENTO,
    ACCIONES.REPORTAR_AVANCE,
    ACCIONES.REPORTAR_INCIDENCIA,
    ACCIONES.REPORTAR_FALLADO,
    ACCIONES.CHAT_REGISTRO,
  ],

  // operario_costura (ej: raul)
  // Trabaja exclusivamente en costura. Ve pendientes y reporta avances.
  operario_costura: [
    ACCIONES.CREAR_MOVIMIENTO_COSTURA,
    ACCIONES.CERRAR_MOVIMIENTO,
    ACCIONES.REPORTAR_AVANCE,
    ACCIONES.REPORTAR_INCIDENCIA,
    ACCIONES.REPORTAR_FALLADO,
    ACCIONES.CHAT_REGISTRO,
  ],

  // supervisor_atraque_lavanderia (ej: diana)
  // Etapa intermedia: atraque + envío a lavandería.
  supervisor_atraque_lavanderia: [
    ACCIONES.CREAR_MOVIMIENTO_ATRAQUE,
    ACCIONES.CREAR_MOVIMIENTO_LAVANDERIA,  // solo enviar — el retorno lo controla acabado
    ACCIONES.CERRAR_MOVIMIENTO,
    ACCIONES.REPORTAR_AVANCE,
    ACCIONES.REPORTAR_INCIDENCIA,
    ACCIONES.REPORTAR_FALLADO,
    ACCIONES.CREAR_MUESTRA_LAVANDERIA,
    ACCIONES.CHAT_REGISTRO,
  ],

  // supervisor_acabado (ej: omar)
  // Retorno de lavandería + acabado + Almacén PT. Maneja calidad/fallados.
  supervisor_acabado: [
    ACCIONES.EDITAR_MATRIZ_COLORES,
    ACCIONES.CREAR_MOVIMIENTO_LAVANDERIA,  // terminar lavandería
    ACCIONES.CREAR_MOVIMIENTO_ACABADO,
    ACCIONES.CERRAR_MOVIMIENTO,
    ACCIONES.REPORTAR_AVANCE,
    ACCIONES.REPORTAR_INCIDENCIA,
    ACCIONES.REPORTAR_FALLADO,
    ACCIONES.RESOLVER_INCIDENCIA,
    ACCIONES.REGISTRAR_ENTREGA_ARREGLO,
    ACCIONES.PRORROGA_ARREGLO,
    ACCIONES.MARCAR_PARA_COBRO,
    ACCIONES.CREAR_MUESTRA_LAVANDERIA,
    ACCIONES.MARCAR_RETORNO_MUESTRA,
    ACCIONES.CHAT_REGISTRO,
    ACCIONES.VER_COSTOS,
    ACCIONES.VINCULAR_ODOO,
  ],

  // encargada_pt (ej: lorena)
  // Recepción en almacén PT, envío a tienda.
  encargada_pt: [
    ACCIONES.MARCAR_LLEGADA_TIENDA,
    ACCIONES.CONFIRMAR_RECEPCION_PT,
    ACCIONES.REPORTAR_INCIDENCIA,
    ACCIONES.CHAT_REGISTRO,
  ],

  // operario (ej: mirian, casos genéricos sin rol específico)
  // Por default puede crear corte (lo pidió Eduard para Mirian explícitamente).
  // Si alguien debe ser operario PERO no debe crear cortes, usar permisos_quitados.
  operario: [
    ACCIONES.CREAR_CORTE,
    ACCIONES.EDITAR_CARACTERISTICAS_CORTE,
    ACCIONES.EDITAR_TALLAS,
    ACCIONES.REPORTAR_INCIDENCIA,
    ACCIONES.CHAT_REGISTRO,
  ],
};

// ─── HELPER PRINCIPAL ────────────────────────────────────────────────────────

/**
 * ¿Puede el usuario hacer esta acción?
 *
 * @param {object|null} user — objeto del AuthContext con { rol, permisos_extra?, permisos_quitados? }
 * @param {string} accion — clave de ACCIONES
 * @returns {boolean}
 */
export function puede(user, accion) {
  if (!user || !user.rol) return false;
  if (!accion) return false;

  // 1) admin = bypass total
  if (user.rol === 'admin') {
    // pero respetar quitados puntuales si el admin se quiso restringir
    if (Array.isArray(user.permisos_quitados) && user.permisos_quitados.includes(accion)) {
      return false;
    }
    return true;
  }

  // 2) permisos_extra (override que SUMA al rol)
  if (Array.isArray(user.permisos_extra) && user.permisos_extra.includes(accion)) {
    // pero respetar quitados si quitan después de agregar (poco común)
    if (Array.isArray(user.permisos_quitados) && user.permisos_quitados.includes(accion)) {
      return false;
    }
    return true;
  }

  // 3) permisos del rol
  const preset = ROLES_PRESET[user.rol];
  if (!preset) return false;
  if (preset === '*') return true;
  if (!preset.includes(accion)) return false;

  // 4) permisos_quitados (override que RESTA del rol)
  if (Array.isArray(user.permisos_quitados) && user.permisos_quitados.includes(accion)) {
    return false;
  }

  return true;
}

/**
 * Versión "any": devuelve true si el usuario puede AL MENOS UNA de las acciones.
 * Útil para mostrar una sección entera si el usuario puede hacer alguna cosa adentro.
 */
export function puedeAlguna(user, acciones) {
  return acciones.some(a => puede(user, a));
}

/**
 * Etiqueta legible para mostrar el rol al usuario.
 * Usado en sidebar/header tanto del móvil como del admin web.
 */
const ROL_LABELS = {
  admin:                          'Administrador',
  usuario:                        'Usuario',
  lectura:                        'Solo Lectura',
  operario:                       'Operario',
  operario_costura:               'Operario Costura',
  supervisor_corte_planificacion: 'Sup. Corte / Planif.',
  supervisor_corte:               'Supervisor Corte',
  supervisor_atraque_lavanderia:  'Sup. Atraque / Lav.',
  supervisor_acabado:             'Supervisor Acabado',
  supervisor_inventario:          'Supervisor Inventario',
  encargada_pt:                   'Encargada PT / Tienda',
};

export function labelRol(rol) {
  if (!rol) return '—';
  return ROL_LABELS[rol] || rol; // fallback al string crudo si es desconocido
}

/**
 * Lista de servicios de movimiento que el usuario puede crear.
 * Devuelve un array de strings normalizados ('corte', 'costura', etc.) para
 * filtrar dropdowns de servicios en NuevoMovimiento.
 */
export function serviciosPermitidos(user) {
  if (!user) return [];
  const mapa = {
    [ACCIONES.CREAR_MOVIMIENTO_CORTE]:      'corte',
    [ACCIONES.CREAR_MOVIMIENTO_ESTAMPADO]:  'estampado',
    [ACCIONES.CREAR_MOVIMIENTO_BORDADO]:    'bordado',
    [ACCIONES.CREAR_MOVIMIENTO_COSTURA]:    'costura',
    [ACCIONES.CREAR_MOVIMIENTO_ATRAQUE]:    'atraque',
    [ACCIONES.CREAR_MOVIMIENTO_LAVANDERIA]: 'lavanderia',
    [ACCIONES.CREAR_MOVIMIENTO_ACABADO]:    'acabado',
  };
  return Object.entries(mapa)
    .filter(([accion]) => puede(user, accion))
    .map(([, servicio]) => servicio);
}
