# Auditoría de código — módulo Producción

Fecha: 2026-06-09 · 76 hallazgos confirmados (verificación adversarial) · alta:28 media:30 baja:18

> Nota: los 5 hallazgos de 'doble /api/api' fueron RE-VERIFICADOS manualmente y son FALSOS POSITIVOS (REACT_APP_BACKEND_URL no incluye /api). No están en esta lista.

## Severidad ALTA (23)

### [backend-endpoints] Endpoint huérfano: POST /api/registros/{registro_id}/vincular-producto
- **Ubicación:** `backend/routes/odoo_tienda.py:151`
- Confirmado: endpoint POST /registros/{registro_id}/vincular-producto definido en línea 151. PERO el frontend usa /api/registros/{id}/distribucion-pt en su lugar (VincularOdooDialog.jsx:57, 116). Son endpoints competidores: vincular-producto es legacy, distribucion-pt es el actual.

### [backend-endpoints] Endpoint huérfano: DELETE /api/registros/{registro_id}/vincular-producto
- **Ubicación:** `backend/routes/odoo_tienda.py:215`
- Confirmado: endpoint DELETE /registros/{registro_id}/vincular-producto definido en línea 215. Frontend usa DELETE /distribucion-pt en su lugar (VincularOdooDialog.jsx:138). Duplicado no utilizado de la nueva API distribucion-pt.

### [backend-legacy] estado vs estado_op: cierre.py actualiza campos con valores incongruentes
- **Ubicación:** `backend/routes/cierre.py:728, 859`
- Línea 728 cierre: UPDATE estado='CERRADA', estado_op='CERRADA' (ambos iguales). Línea 859 reapertura: UPDATE estado='Producto Terminado', estado_op='EN_PROCESO' (incongruentes). El campo estado usa legacy strings, estado_op usa ENUM. Al reabrir, el registro queda con estado de dos sistemas distintos, rompiendo filtros que usen cualquiera de los dos.

### [backend-legacy] estado_op vs estado_operativo: tres campos diferentes en tabla prod_registros
- **Ubicación:** `backend/routes/control_produccion.py:322, 393, 596, 646`
- CRÍTICO: estado_operativo NO existe en las migraciones (grep en migrations/ devuelve nada). Pero seed_demo.py línea 155,271,357,363 y control_produccion.py escriben a esta columna. O (a) la columna nunca fue creada y los SEEDs fallan, o (b) existe en BD viejas pero fue abandonada. registros_main.py línea 512-523 calcula estado_operativo en memoria sin persistencia. Hay confusión de quién maneja este campo.

### [backend-legacy] registros_main.py: calcula estado_operativo en memoria sin persistencia, pero control_produccion.py lo escribe en DB
- **Ubicación:** `backend/routes/registros_main.py:512-523`
- registros_main.py calcula estado_operativo (PARALIZADA/EN_RIESGO/NORMAL) en memoria pero NUNCA lo persiste. control_produccion.py línea 393 sí persiste. Hay dos lógicas: una para lectura (registros_main), otra para escritura (control_produccion). Si se desincronizан, los cálculos en memoria no reflejan BD.

### [backend-legacy] seed_demo.py usa estado_operativo directamente en SQL sin definir columna
- **Ubicación:** `backend/seed_demo.py:155, 271, 357, 363`
- seed_demo.py inserta/actualiza estado_operativo (línea 155, 271, 357, 363). Pero esta columna NO existe en las migraciones. Si la columna no fue creada, los SEEDs fallarán. Si existe en BD legacy pero fue abandonada, los SEEDs crean datos inconsistentes con la lógica de control_produccion.py.

### [backend-legacy] prod_consumo_mp vs prod_registro_requerimiento_mp: no hay constraint que garantice consistency
- **Ubicación:** `backend/routes/consumo.py:334-342`
- consumo.py línea 334-342 inserta en prod_consumo_mp Y actualiza cantidad_consumida en requerimiento. No hay FK constraint entre tablas. Si alguien borra un consumo directo en SQL, el requerimiento no se revierte automáticamente. DELETE endpoint lo maneja manualmente, pero falta trigger en BD para garantizar consistency.

### [backend-hardcode] Credenciales hardcodeadas en scripts de configuración
- **Ubicación:** `backend/reset_and_create_users.py:11`
- Línea 11 contiene DB_URL = "postgresql://admin:admin@72.60.241.216:9595/datos" — credenciales en texto plano con IP de máquina dev expuesta. Es un script que se ejecuta manualmente, no es un import reutilizado.

### [backend-hardcode] Credenciales hardcodeadas en múltiples scripts de seed
- **Ubicación:** `backend/seed_demo.py:5`
- Línea 5: DB_URL = "postgres://admin:admin@72.60.241.216:9595/datos?sslmode=disable" — mismo patrón, credenciales + sslmode=disable en BD dev.

### [backend-hardcode] Credenciales hardcodeadas en otro script
- **Ubicación:** `backend/seed_bom.py:12`
- Línea 12: DB_URL = "postgres://admin:admin@72.60.241.216:9595/datos?sslmode=disable" — misma credencial y sslmode=disable.

### [backend-hardcode] Credenciales hardcodeadas en script de migración de roles
- **Ubicación:** `backend/migrate_roles_mobile.py:27`
- Línea 27: DB_URL = "postgresql://admin:admin@72.60.241.216:9595/datos" — credencial admin hardcodeada.

### [backend-hardcode] Credenciales hardcodeadas en script de exportación
- **Ubicación:** `backend/scripts/crear_salidas.py:11`
- Línea 11: DB_URL = 'postgres://admin:admin@72.60.241.216:9595/datos?sslmode=disable&options=-csearch_path%3Dproduccion' — credencial en texto plano.

### [backend-hardcode] Contraseñas de usuarios hardcodeadas en script de inicialización
- **Ubicación:** `backend/reset_and_create_users.py:38, 46, 77, 109, 145, 180, 215, 255, 286, 294`
- Confirmado: línea 38 (eduard123), 46 (raul123), 77 (diana123), etc. Además se imprimen en línea 381: print(f"  ✓ {u['username']} ({u['rol']}) — contraseña: {u['password']}"). Las contraseñas hardcodeadas se guardan en BD sin encriptación de password.

### [backend-hardcode] Inconsistencia crítica: empresa_id 6 vs 7 en migraciones
- **Ubicación:** `backend/migrations/001_multiempresa_valorizacion.py:16`
- Línea 16: DEFAULT_EMPRESA_ID = 6 usa Ambission Industries SAC con empresa_id=6. Pero migrations/002 línea 125 hace UPDATE con empresa_id=6, mientras seed_demo.py líneas 111, 156, 161 e insertan empresa_id=7. Hay inconsistencia entre migraciones (6) y datos de demo (7).

### [backend-hardcode] Inconsistencia: empresa_id 7 en defaults pero migraciones usan 6
- **Ubicación:** `backend/migrations/002_refactorizacion_produccion.py:125, 180, 225, 286, 302`
- Migración 002 hace múltiples DEFAULT 6 y COALESCE con 6 (líneas 118, 125, 141, 180, 225, etc.) pero seed_demo.py, crear_salidas.py, y registros_main.py usan empresa_id=7. Hay desalineación entre el default de migraciones (6) y el que se usa en runtime (7).

### [front-back-mismatch] Endpoint /liquidacion-directa no existe en backend
- **Ubicación:** `frontend/src/components/TrazabilidadPanel.jsx:311`
- El frontend llama a POST ${API}/liquidacion-directa (línea 311) para registrar liquidaciones directas. Búsqueda exhaustiva en backend/routes muestra que NO existe este endpoint. No aparece ni en trazabilidad.py ni en fallados_v2.py. El dialog de Liquidación Directa SÍ está implementado en la UI (línea 1229-1270) y se abre con botón (línea 685), pero el POST fallará. Esto es funcionalidad incompleta que necesita implementación backend o rerouting a endpoint existente.

### [front-back-mismatch] Llamada a POST /arreglos sin contexto de registro
- **Ubicación:** `frontend/src/components/TrazabilidadPanel.jsx:224`
- Frontend llama axios.post(`${API}/arreglos`, {...fallado_id, registro_id, ...}) en línea 224. El backend define SOLO POST /registros/{registro_id}/arreglos en trazabilidad.py línea 710, que requiere registro_id en el path, NO en el body. El endpoint POST /arreglos sin path parameter NO existe. Esta llamada fallará con 404 porque Axios estará POST a /api/arreglos sin registry_id en path.

### [estados-residuales] Typo en estado POLO: 'Para Aacabado' vs 'Para Acabado'
- **Ubicación:** `backend/seed_demo.py:36`
- Confirmado: línea 36 contiene ESTADOS_POLO = [...'Para Aacabado',...]. También aparece en línea 139 en datos hardcodeados de registros. ESTADOS_PRODUCCION en models.py:449 dice 'Para Acabado' (correcto). Es un typo real con doble 'a'.

### [estados-residuales] Estado con tilde 'Para Lavandería' en reset_and_create_users.py (usuarios raul/diana)
- **Ubicación:** `backend/reset_and_create_users.py:51, 82`
- Confirmado: líneas 51 y 82 contienen 'Para Lavandería' CON tilde. ESTADOS_PRODUCCION en models.py:449 dice 'Para Lavanderia' SIN tilde. Los permisos de raul y diana usan tildes que no coincidirán con la DB normalizada, causando fallos en validaciones de estado.

### [estados-residuales] Estado con tilde 'Lavandería' en reset_and_create_users.py (usuario omar)
- **Ubicación:** `backend/reset_and_create_users.py:229`
- Confirmado: línea 229 contiene 'Lavandería' CON tilde en lista de estados_permitidos de usuario omar. Contradicción con ESTADOS_PRODUCCION normalizado (models.py:449) que usa 'Lavanderia' SIN tilde. Causará fallos en validaciones de permisos.

### [estados-residuales] Roles de usuarios con estados CON tildes que contradicen DB
- **Ubicación:** `backend/reset_and_create_users.py:51, 82, 229`
- Confirmado: Esta es la síntesis de los hallazgos #2 y #3. Los permisos de raul, diana, omar incluyen estados CON tildes ('Para Lavandería', 'Lavandería') que no coincidirán con la DB normalizada sin tildes. Causará que validaciones como 'if estado in user_estados_permitidos' fallen silenciosamente.

### [mobile] Permiso no verificado para cerrar/anular OP
- **Ubicación:** `frontend/src/mobile/pages/RegistroDetalle.jsx:399-410`
- Confirmado: MenuOpcionesSheet recibe solo {registro, onClose, onCerrar, onAnular, inactiva}. No recibe user, no puede validar ACCIONES.CERRAR_OP ni ACCIONES.ANULAR_OP. Los botones se muestran a cualquier usuario autenticado.

### [mobile] Permiso inconsistente para cambiar estado en RegistroDetalle
- **Ubicación:** `frontend/src/mobile/pages/RegistroDetalle.jsx:29-31`
- Confirmado: puedeCambiarEstado usa 'user?.rol === admin || permisos._operativos?.acciones_produccion?.cambiar_estados'. Diverge del sistema permisos.js que usa puede(user, ACCIONES).

## Severidad MEDIA (30)

### [backend-endpoints] Endpoint huérfano: POST /api/consumos
- **Ubicación:** `backend/routes/consumo.py:259`
- Confirmado: endpoint POST /consumos definido en línea 259. Grep exhaustivo del frontend (todos los archivos .jsx/.tsx/.js) no retorna referencias a axios/fetch hacia /consumos. El endpoint existe pero no hay llamada desde UI.

### [backend-endpoints] Endpoint huérfano: GET /api/consumos/{consumo_id}
- **Ubicación:** `backend/routes/consumo.py:233`
- Confirmado: endpoint GET /consumos/{consumo_id} definido en línea 233. Sin referencias en frontend. El módulo consumo.py tiene endpoints CRUD completos pero desconectados de la UI.

### [backend-endpoints] Endpoint huérfano: GET /api/ordenes
- **Ubicación:** `backend/routes/ordenes.py:59`
- Confirmado: endpoint GET /ordenes definido en línea 59. Búsqueda exhaustiva en frontend no retorna referencias. El router está registrado en server.py pero la UI no lo llama.

### [backend-endpoints] Endpoint huérfano: GET /api/ordenes/{orden_id}
- **Ubicación:** `backend/routes/ordenes.py:114`
- Confirmado: endpoint GET /ordenes/{orden_id} definido en línea 114. Sin uso detectado desde frontend. Módulo completo (CRUD) pero desactivado desde la UI.

### [backend-endpoints] Endpoint huérfano: GET /api/servicios-orden
- **Ubicación:** `backend/routes/servicios.py:91`
- Confirmado: endpoint GET /servicios-orden definido en línea 91. Grep exhaustivo no retorna referencias en frontend. Solo aparece en servicios.py, nunca llamado.

### [backend-endpoints] Endpoint huérfano: GET /api/servicios-orden/{servicio_id}
- **Ubicación:** `backend/routes/servicios.py:128`
- Confirmado: endpoint GET /servicios-orden/{servicio_id} definido en línea 128. Sin uso en frontend. Parte del módulo abandonado de servicios-orden.

### [backend-endpoints] Endpoint huérfano: POST /api/servicios-orden/{servicio_id}/completar
- **Ubicación:** `backend/routes/servicios.py:339`
- Confirmado: endpoint POST .../completar definido en línea 339. Sin llamador en frontend. Acción de negocio definida pero nunca expuesta a UI.

### [backend-legacy] prod_consumo_mp queried en reportes/kardex sin validación cruzada con prod_registro_tallas
- **Ubicación:** `backend/routes/reportes.py:514-517`
- El kardex (línea 514-517) trae consumos de prod_consumo_mp pero no valida que cantidad_consumida en prod_registro_requerimiento_mp sea consistente. Es más una incongruencia de diseño (múltiples fuentes de cantidad) que causa reportes potencialmente divergentes. No hay JOIN con requerimiento para audit.

### [backend-legacy] tallas JSONB legacy vs prod_registro_tallas: fallback a JSON sin sincronización explícita
- **Ubicación:** `backend/routes/distribucion_pt.py:114-137`
- Función _get_total_producido tiene triple fallback: prod_registro_tallas (nueva) → tallas JSONB (legacy) → prod_movimientos_produccion. Múltiples fuentes de verdad. Si prod_registro_tallas está vacío, cae a JSONB sin sincronización. No hay trigger que mantenga JSONB en sync con tabla normalizada.

### [backend-legacy] validar_registro_activo(): parámetro campo_estado requiere campo específico sin valor por defecto seguro
- **Ubicación:** `backend/helpers.py:84-95`
- Función tiene default campo_estado='estado', pero consumo.py y ordenes.py pasan campo_estado='estado_op'. Si un registro tiene estado='CERRADA' pero estado_op='EN_PROCESO', la validación puede pasar o fallar según qué campo se pase. Falta una convención clara de cuál campo es la source de verdad.

### [backend-legacy] cierre.py: reapertura hardcodea estado='Producto Terminado' sin validar estado anterior
- **Ubicación:** `backend/routes/cierre.py:859`
- Al reabrir un cierre, siempre seta estado='Producto Terminado'. Pero el registro pudo haber tenido estado='Tienda' o 'Almacen PT' antes del cierre. No hay snapshot del estado anterior. Se pierden datos sobre cuál era el estado previo, haciendo la reapertura imprecisa.

### [backend-hardcode] Inconsistencia de estados: Producto Terminado vs Almacen PT
- **Ubicación:** `backend/routes/reportes_produccion.py:675`
- Comentario línea 675 explícitamente advierte: el alias mapea "producto terminado" → "almacen pt". Esto es una validación manual hardcodeada para reconciliar que ESTADOS_PRODUCCION en models.py lista 13 estados pero las rutas usan nombres distintos. Es un workaround, no estándar.

### [backend-hardcode] Inconsistencia de acentuación: Lavanderia vs Lavandería
- **Ubicación:** `backend/reset_and_create_users.py:51, 82, 229`
- reset_and_create_users.py usa "Lavandería" (con tilde) en líneas 51, 82, 229. Pero models.py línea 449 define ESTADOS_PRODUCCION = [..., "Lavanderia", ...] SIN tilde. seed_demo.py línea 35 usa "Lavanderia" sin tilde. Hay inconsistencia de acentuación.

### [backend-hardcode] Typo en estado: Para Aacabado
- **Ubicación:** `backend/seed_demo.py:36`
- Línea 36: ESTADOS_POLO contiene "Para Aacabado" (doble 'a'). Línea 139 también usa "Para Aacabado". No existe en ESTADOS_PRODUCCION (models.py línea 447-451). Esto genera registros con estado inválido. Es un typo real que causa incongruencia.

### [backend-hardcode] empresa_id=7 hardcodeado en múltiples rutas sin centralización
- **Ubicación:** `backend/routes/registros_main.py:320, 1052`
- Línea 320: parámetro default empresa_id: int = 7. Línea 1052: comentario dice "empresa_id = 7  # FK válido para cont_empresa". Sin constante centralizada. Difícil de mantener si empresa cambia.

### [backend-hardcode] empresa_id=7 hardcodeado en función de transferencias
- **Ubicación:** `backend/routes/transferencias_linea.py:101, 733`
- Línea 101: función _items_compatibles_en_linea tiene default empresa_id: int = 7. Línea 733: WHERE empresa_id = 7 hardcodeado en query. Sin parametrización. Falso positivo no es — está confirmado el hardcode.

### [backend-hardcode] Estados hardcodeados sin sincronización con BD
- **Ubicación:** `backend/routes/auth.py:469-473`
- Líneas 469-473: lista manual de 16 estados en auth.py ("estados_disponibles"). ESTADOS_PRODUCCION en models.py línea 447-451 tiene 13 estados. La lista en auth.py incluye "Muestra Lavanderia", "Estampado", "Para Estampado" que no están en ESTADOS_PRODUCCION. Desincronizado.

### [backend-hardcode] Scheduler asume empresa_id=7 sin validación
- **Ubicación:** `backend/scheduler.py:37, 46`
- Línea 46: fake_user = {"empresa_id": 7, "username": "scheduler"}. Comentario en líneas 37-38 admite que en multi-empresa debería iterar pero hardcodea empresa_id=7. No hay mecanismo para cambiar si empresa cambia.

### [frontend-huerfano] Componente ExportPDFButton no utilizado
- **Ubicación:** `frontend/src/components/ExportPDFButton.jsx:1-165`
- Grep exhaustivo confirma que el componente solo aparece en su definición (línea de export default). No hay ninguna importación de ExportPDFButton en el codebase. Es dead code funcional pero completamente no utilizado.

### [front-back-mismatch] PUT /arreglos/{id}/cerrar no existe, falta endpoint de cierre
- **Ubicación:** `frontend/src/components/TrazabilidadPanel.jsx:246`
- Línea 246 llama axios.put(`${API}/arreglos/${selectedArreglo.id}/cerrar`, cierreForm, {...}). Búsqueda en backend trazabilidad.py confirma que NO existe @router.put con /cerrar. Existen endpoints: PUT /arreglos/{arreglo_id} (línea 759), POST /arreglos/{arreglo_id}/marcar-cobro, POST /arreglos/{arreglo_id}/cobrar, etc., pero NINGUNO con /cerrar. El dialog cierreArregloDialogOpen SÍ está en UI (línea 1070-1147) completamente implementado, pero el endpoint backend falta. Necesita implementación o cambio de estrategia (usar PUT /arreglos/{id} directo con cantidad_recuperada/liquidacion).

### [estados-residuales] Inconsistencia 'Hantag' vs 'Hangtag' en comentarios
- **Ubicación:** `backend/routes/reportes_produccion.py:3336, 3338, 3340`
- Confirmado: líneas 3336, 3338, 3340 usan 'Hantag' (SIN 'g'). Líneas 3329-3331, 3345-3347, 3367 usan 'Hangtag' (correcto, CON 'g'). Typo en comentarios solo (no afecta código de lógica), pero es inconsistencia visible.

### [estados-residuales] Mapa de colores en frontend solo cubre 5 categorías, no 13 estados
- **Ubicación:** `frontend/src/lib/utils.js:21-29`
- Confirmado: getStatusClass() en líneas 21-29 mapea solo ['corte', 'costura', 'atraque', 'lavanderia', 'acabado', 'almacen', 'tienda']. ESTADOS_PRODUCCION tiene 13 estados. Estados como 'Bordado', 'Estampado', 'Muestra Lavanderia', 'Producto Terminado' quedan sin clases CSS específicas y retornan string vacío.

### [estados-residuales] ESTADOS_POLO divergente de ESTADOS_PRODUCCION: contiene Estampado
- **Ubicación:** `backend/seed_demo.py:35-36`
- Confirmado: ESTADOS_POLO en líneas 35-36 incluye 'Para Estampado' y 'Estampado', que NO están en ESTADOS_PRODUCCION de models.py:449. ESTADOS_PANTALON tampoco tiene 'Estampado'. Es un divergencia de design: ¿POLO puede tener Estampado o es solo para pantalones?

### [estados-residuales] Frontend prueba tiene copia hardcodeada de ESTADOS_PRODUCCION
- **Ubicación:** `frontend/src/prueba/pages/PruebaRegistroDetalle.jsx:16-20`
- Confirmado: líneas 16-20 definen const ESTADOS_PRODUCCION hardcodeado con los 13 estados. Es una copia local, no importada de API. Si backend cambia estados, esta copia quedará desincronizada. Debería usar endpoint /api/catalogo/estados-produccion.

### [mobile] Inconsistencia de permisos: esAdmin hardcodeado en lugar de ACCIONES
- **Ubicación:** `frontend/src/mobile/pages/IncidenciaDetalle.jsx:43`
- Confirmado: esAdmin = user?.rol === 'admin'. Debería usar puede(user, ACCIONES.RESOLVER_INCIDENCIA).

### [mobile] TODO pendiente: pantalla de alertas de stock sin implementar
- **Ubicación:** `frontend/src/mobile/pages/Home.jsx:342`
- Confirmado: existe comentario TODO '{ label: Ver alertas, to: /m/registros }, // TODO: pantalla de alertas movil'. No hay pantalla dedicada MobileAlertas.

### [mobile] Permiso inconsistente para resolver incidencias en IncidenciasRegistro
- **Ubicación:** `frontend/src/mobile/pages/IncidenciasRegistro.jsx:1-30`
- Confirmado: NO importa puede ni ACCIONES. PUT /incidencias/:id y POST /incidencias/:id/avances se ejecutan sin validacion RESOLVER_INCIDENCIA.

### [mobile] Permiso no verificado para reportar avances en IncidenciasRegistro
- **Ubicación:** `frontend/src/mobile/pages/IncidenciasRegistro.jsx:430-431`
- Confirmado: POST /incidencias/:id/avances SIN validacion de puede(user, ACCIONES.REPORTAR_AVANCE). Formulario se muestra a cualquier usuario autenticado.

### [mobile] RegistroDetalle: puedeCambiarEstado usa lógica legacy
- **Ubicación:** `frontend/src/mobile/pages/RegistroDetalle.jsx:659-660`
- Confirmado: CambiarEstadoSheet define esAdmin = user?.rol === admin y estadosPermitidos = user?.permisos?._operativos?.estados_permitidos. Diverge de permisos.js.

### [mobile] Falta de validación de permiso en CobroArreglos
- **Ubicación:** `frontend/src/mobile/pages/CobroArreglos.jsx:29`
- Confirmado: esAdmin = puede(user, ACCIONES.GENERAR_NOTA_COBRO) es correcto, pero página se renderiza para todos sin validacion global de permisos.

## Severidad BAJA (18)

### [backend-legacy] prod_muestras / prod_muestras_materiales / prod_muestras_historial_estado: sistema eliminado pero comentarios incompletos
- **Ubicación:** `backend/migrations/startup_ddl.py:847-849`
- Comentario dice 'fue dado de baja', pero NO hay DROP TABLE statements en el DDL. Si estas tablas existen en BD legacy, no se limpian al correr migraciones. Riesgo de datos fantasma y confusión para nuevos desarrolladores que piensen que aún existen.

### [backend-legacy] prod_registro_cierre: snapshot_json puede ser string o dict causando deserialization manual
- **Ubicación:** `backend/routes/cierre.py:777-783`
- get_cierre() chequea if isinstance(result['snapshot_json'], str) antes de json.loads(). Indica que el campo puede venir como string o ya como dict. Debería ser siempre JSONB en BD (deserializado automático) o siempre TEXT (always string). El código defensivo es válido pero señala inconsistencia de tipo en BD.

### [backend-legacy] cortes_pendientes_colores.py: hardcodea filtro estado_op IN ('ABIERTA','EN_PROCESO')
- **Ubicación:** `backend/routes/cortes_pendientes_colores.py:76-77`
- Línea 77 hardcodea filtro estado_op IN ('ABIERTA','EN_PROCESO'). Comentario línea 76 dice 'ignoramos cerrados/anulados salvo que el front pida'. Pero no hay parámetro query para que el front lo pida. Comentario contradice código. Es comportamiento intencional pero mal documentado/flexible.

### [frontend-huerfano] TODO comentario en pantalla de alertas móvil
- **Ubicación:** `frontend/src/mobile/pages/Home.jsx:342`
- Confirmado el TODO: `cta: { label: 'Ver alertas', to: '/m/registros' }, // TODO: pantalla de alertas móvil`. El CTA está implementado pero redirige a /m/registros en lugar de una pantalla dedicada de alertas.

### [frontend-huerfano] Página legacy ReporteAtrasados sin ruta activa
- **Ubicación:** `frontend/src/pages/ReporteAtrasados.jsx:1-15`
- Página existe con código funcional y hace requests a `/api/reportes-produccion/atrasados`. Sin embargo, NO tiene ruta en App.js. La ruta antigua `/reportes/atrasados` redirige a `/reportes/seguimiento?tab=atrasados` (línea 256 de App.js). Es código legacy sin ruteo activo.

### [frontend-huerfano] Página legacy ReporteCostura sin ruta activa
- **Ubicación:** `frontend/src/pages/ReporteCostura.jsx:1-20`
- Página implementada pero sin ruta activa en App.js. Ruta `/reportes/costura` redirige a `/reportes/operativo?tab=operativo` (línea 259). Código legacy que ha sido reemplazado por el tab en ReporteOperativo.

### [frontend-huerfano] Página legacy ReporteBalanceTerceros sin ruta activa
- **Ubicación:** `frontend/src/pages/ReporteBalanceTerceros.jsx:1`
- Página implementada sin ruta en App.js. Ruta `/reportes/balance-terceros` redirige a `/reportes/operativo?tab=balance` (línea 258). Funcionalidad migrada a tab en ReporteOperativo.

### [frontend-huerfano] Página legacy ReporteTiemposMuertos sin ruta activa
- **Ubicación:** `frontend/src/pages/ReporteTiemposMuertos.jsx:1`
- Página implementada sin ruta activa. Ruta `/reportes/tiempos-muertos` redirige a `/reportes/operativo?tab=tiempos` (línea 260). Legacy reemplazado por arquitectura de tabs.

### [frontend-huerfano] Página legacy ReporteEnProceso sin ruta activa
- **Ubicación:** `frontend/src/pages/ReporteEnProceso.jsx:1`
- Página implementada sin ruta en App.js. Ruta antigua redirige a `/reportes/seguimiento` (línea 254). Funcionalidad migrada completamente.

### [frontend-huerfano] Página legacy ReporteParalizados sin ruta activa
- **Ubicación:** `frontend/src/pages/ReporteParalizados.jsx:1`
- Página implementada sin ruta en App.js. Ruta antigua redirige a `/reportes/seguimiento?tab=paralizados` (línea 262). Funcionalidad migrada al nuevo hub de seguimiento.

### [frontend-huerfano] Página legacy ReporteLotesFraccionados sin ruta activa
- **Ubicación:** `frontend/src/pages/ReporteLotesFraccionados.jsx:1`
- Página implementada sin ruta en App.js. Ruta antigua redirige a `/reportes/lotes` (línea 261). Funcionalidad cubierta por LotesTrazabilidad en nueva arquitectura.

### [frontend-huerfano] console.log no eliminado en FichaItemModal
- **Ubicación:** `frontend/src/components/FichaItemModal.jsx:233`
- Confirmado console.log en línea 233 con `// eslint-disable-next-line no-console`. Según comentario del código, sirve para debug/reportes de errores. Debug log intencional y declarativo.

### [frontend-huerfano] console.log en ChatRegistro.jsx móvil
- **Ubicación:** `frontend/src/mobile/pages/ChatRegistro.jsx:77-82`
- Confirmados console.log en líneas 77 y 82 con eslint-disable-next-line. Logs intencionales: '[chat] cargando /api/usuarios/mencionables…' (línea 77) y '[chat] mencionables OK · ${lista.length} usuarios' (línea 82). Sirven para debug de carga de usuarios de mención.

### [estados-residuales] Servicio 'Lavandería' con tilde en seed_completo.py
- **Ubicación:** `backend/scripts/seed_completo.py:313`
- Confirmado: línea 313 tiene (SRV_LAVANDERIA, 'Lavandería', ...) con tilde. Es inconsistente con el patrón 'Lavanderia' sin tilde visto en otros scripts. Es script de seed (datos iniciales), impacto bajo pero es desalineación visible.

### [estados-residuales] Comentario desactualizado en NuevoMovimiento.jsx
- **Ubicación:** `frontend/src/mobile/pages/NuevoMovimiento.jsx:16`
- Confirmado: líneas 15-16 muestran comentario que menciona 'Lavandería' (con tilde) como ejemplo. Pero el código mismo (líneas 18-23) implementa normalizarNombreServicio() que QUITA tildes correctamente. El comentario es simplemente un ejemplo anticuado, no afecta lógica.

### [mobile] MatrizColores deprecada pero mantenida como re-export
- **Ubicación:** `frontend/src/mobile/pages/MatrizColores.jsx:1-5`
- Confirmado: archivo solo contiene comentario Deprecated y re-export de EditarMatrizColores. Patrón backward-compatibility, no error.

### [mobile] Hardcoded rol check para crear ingreso en Home.jsx
- **Ubicación:** `frontend/src/mobile/pages/Home.jsx:67`
- Confirmado: usa 'puede(user, ACCIONES.CREAR_INGRESO_MP) || user?.rol === admin'. Redundante porque puede() ya verifica admin.

### [mobile] Placeholder page mockeada en MobileApp pero sin ruta asignada
- **Ubicación:** `frontend/src/mobile/pages/Placeholder.jsx:25`
- Confirmado: MobilePlaceholder se importa en MobileApp.jsx linea 44, pero NO aparece en ninguna ruta (lineas 98-156). Componente phantom sin asignar.

## Inciertos (2)

- [backend-hardcode] TIENDAS_VALIDAS hardcodeadas sin documentación de cambio — `backend/routes/reportes_produccion.py:69-74`
- [mobile] EscanearQR: QR tipo ROL-XXXX navega a pantalla inexistente — `frontend/src/mobile/pages/EscanearQR.jsx:20`