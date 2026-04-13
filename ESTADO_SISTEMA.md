# Estado del Sistema ERP Textil

**Fecha:** 2026-04-12
**Generado por:** Misión Nocturna — Integración y Validación Completa

---

## Resumen

El sistema ERP Textil cubre dos módulos principales: **Producción** (puerto 8000) y **Finanzas** (puerto 8001), ambos conectados a PostgreSQL en `72.60.241.216:9595/datos`.

---

## Backends

| Módulo | Puerto | Framework | Estado |
|--------|--------|-----------|--------|
| Producción | 8000 | FastAPI + asyncpg | Operativo |
| Finanzas | 8001 | FastAPI + asyncpg | Operativo |

**Comando de arranque:** `python3 -m uvicorn server:app --host 0.0.0.0 --port <PUERTO> --reload`

---

## Datos Sembrados (Seed)

### Producción (schema `produccion`)

| Tabla | Registros | Detalle |
|-------|-----------|---------|
| `prod_personas_produccion` | 7 | 3 INTERNO (con unidad_interna_id), 4 EXTERNO |
| `prod_inventario` | 11 | TEL-001, TEL-002, AVI-001..AVI-005 + existentes |
| `prod_modelos` | 4 | Polo Element Regular, Pantalón Denim Slim + existentes |
| `prod_bom_cabecera` | 3 | BOM vinculados a modelos |
| `prod_modelo_bom_linea` | 14 | Líneas de BOM con items de inventario |
| `prod_registros` | 6 | CORTE-004 (cerrado), CORTE-005 (costura), CORTE-006 (corte urgente), CORTE-007 (cerrado) + 2 existentes |
| `prod_registro_cierre` | 2 | CORTE-004 (S/7,035.65 con CIF S/2,780), CORTE-007 (S/3,930) |
| `prod_movimientos_produccion` | 11 | Movimientos de corte, costura, acabado |
| `prod_inventario_ingresos` | 12 | Ingresos de telas y avíos |
| `prod_inventario_salidas` | 13 | Salidas a registros de producción |
| `prod_inventario_reservas` | 5 | Reservas activas |
| `prod_inventario_rollos` | 3 | Control por rollos para telas |
| `prod_motivos_incidencia` | 8 | Calidad, Falta Material, Otro, Falta Avíos, etc. (todos activos) |
| `prod_incidencia` | 2 | Incidencias en registros |
| `prod_servicios_produccion` | 6 | Corte, Costura, Acabado, Bordado, Estampado, Lavandería |
| `prod_usuarios` | 2 | `eduard` (admin), `costurero1` (usuario) |

### Finanzas (schema `finanzas2`, empresa_id=7)

| Tabla | Registros | Detalle |
|-------|-----------|---------|
| `cont_empresa` | 2 | id=7 Ambission Industries, id=8 Proyecto Moda Sac |
| `cont_tercero` | 5 | 4 proveedores + 1 existente |
| `fin_unidad_interna` | 4 | Corte Interno, Costura Interna, Acabado Interno, Lazer Interno |
| `fin_cargo_interno` | 9 | Cargos por categoría (planilla, alquiler, depreciación, etc.) |
| `fin_gasto_unidad_interna` | 9 | Gastos distribuidos por unidad interna |
| `fin_activo_fijo` | 3 | Cortadora industrial, máquinas de coser, plancha industrial |
| `cont_planilla` | 1 | Marzo 2026, S/9,200 |
| `cont_planilla_detalle` | 3 | 3 empleados con distribución a UIs |
| `cont_oc` | 2 | OC-001 (recibida), OC-002 (borrador) |
| `cont_factura_proveedor` | 2 | Facturas vinculadas a OC |

---

## Verificación de Endpoints

### Producción (8000)

| Endpoint | Estado | Resultado |
|----------|--------|-----------|
| `GET /api/personas-produccion` | OK | 7 personas (requiere auth) |
| `GET /api/registros` | OK | 6 registros |
| `GET /api/inventario?all=true` | OK | 11 items |
| `GET /api/modelos` | OK | 4 modelos |
| `GET /api/reportes-produccion/costo-lote` | OK | 6 items |
| `GET /api/motivos-incidencia` | OK | 8 motivos (requiere auth) |
| `GET /api/reportes-produccion/wip-etapa` | OK | 2 etapas (requiere auth) |
| `GET /api/reportes-produccion/en-proceso` | OK | 3 registros en proceso (requiere auth) |
| `GET /api/reportes-produccion/atrasados` | OK | 0 atrasados |
| `POST /api/auth/login` | OK | Funcional tras fix bcrypt |

### Finanzas (8001, empresa_id=7)

| Endpoint | Estado | Resultado |
|----------|--------|-----------|
| `GET /api/empresas` | OK | 2 empresas |
| `GET /api/terceros?empresa_id=7` | OK | 4 terceros |
| `GET /api/unidades-internas?empresa_id=7` | OK | 4 UIs |
| `GET /api/cargos-internos?empresa_id=7` | OK | 9 cargos |
| `GET /api/gastos-unidad-interna?empresa_id=7` | OK | 9 gastos |
| `GET /api/activos-fijos?empresa_id=7` | OK | 3 activos |
| `GET /api/planillas?empresa_id=7` | OK | 1 planilla |
| `GET /api/ordenes-compra?empresa_id=7` | OK | 2 OC |
| `GET /api/facturas-proveedor?empresa_id=7` | OK | 2 facturas |

---

## Bugs Corregidos en esta Sesión

### 1. Incompatibilidad passlib + bcrypt 5.0

**Archivo:** `backend/auth_utils.py`
**Problema:** `passlib.context.CryptContext` falla con bcrypt >= 4.1, causando 500 en login.
**Solución:** Reemplazado `passlib` con uso directo de `bcrypt` (`bcrypt.checkpw` / `bcrypt.hashpw`).

### 2. Toast error muestra `[object Object]`

**Archivo:** `frontend/src/pages/RegistroForm.jsx`
**Problema:** Cuando FastAPI devuelve `detail` como array (errores de validación Pydantic), `toast.error()` mostraba `[object Object]`.
**Solución:** Agregada función `getErrorMsg()` que maneja string, array y objetos. Aplicada en 10 catch blocks.

### 3. Motivos de incidencia inactivos

**DB:** `prod_motivos_incidencia`
**Problema:** 5 de 8 motivos tenían `activo = FALSE`, causando que aparecieran pocos en la UI.
**Solución:** Activados todos los motivos (`UPDATE SET activo = TRUE`).

### 4. Bugs de sesiones anteriores (ya aplicados)

- Reserva overwrite: re-reservar para mismo item/registro reemplaza en vez de apilar
- Costo por Lote: empresa_id parametrizado (antes hardcoded a 7)
- Protección eliminación: items/rollos/ingresos con movimientos no pueden eliminarse
- delete_salida: actualiza `cantidad_consumida` en requerimiento_mp
- Password reset: `eduard` con password `admin123`

---

## Credenciales

| Sistema | Usuario | Password | Rol |
|---------|---------|----------|-----|
| Producción | eduard | admin123 | admin |
| Producción | costurero1 | (original, no modificado) | usuario |

---

## Notas Importantes

- **Endpoints de finanzas requieren `empresa_id`** como query param (no es opcional).
- **Router prefixes de producción:** catalogos usa `/api`, reportes usa `/api/reportes-produccion`.
- `prod_personas_produccion` **no tiene columna `empresa_id`** — las personas son globales.
- Los nombres en BD usan **acentos** (María López, Pedro Ríos, Lavandería SAC).
- El backend debe iniciarse con `python3 -m uvicorn` (no el binario `uvicorn` directamente).
