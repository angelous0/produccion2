# Refactorización Estructural del Módulo de Producción Textil

## 1. Resumen Ejecutivo

Este documento describe la refactorización arquitectónica del módulo de Producción para establecer una base sólida, clara y extensible.

**Objetivos principales:**
- Separación clara de dominios (Inventario, Órdenes, Consumo, Servicios, Costos, Cierre)
- Tipificación fuerte de items (MP, AVIO, SERVICIO, PT)
- Control de tela por rollos con trazabilidad real
- WIP claro con movimientos de costo explícitos
- Servicios separados del inventario físico

---

## 2. Esquema de Base de Datos Propuesto

### 2.1 MAESTRO DE ITEMS (Refactorización)

**Tabla: `prod_item` (renombrar de `prod_inventario`)**
```sql
-- Tipificación fuerte de items
CREATE TYPE prod_tipo_item AS ENUM ('MP', 'AVIO', 'SERVICIO', 'PT');

ALTER TABLE produccion.prod_inventario ADD COLUMN IF NOT EXISTS tipo_item prod_tipo_item;
-- Migrar: UPDATE basado en categoria actual
-- categoria='Telas' → 'MP', categoria='Avios' → 'AVIO', etc.
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | VARCHAR PK | UUID |
| empresa_id | INT FK | Empresa |
| codigo | VARCHAR UNIQUE | Código interno |
| nombre | VARCHAR | Nombre descriptivo |
| tipo_item | ENUM | MP, AVIO, SERVICIO, PT |
| unidad_medida | VARCHAR | unidad, metro, kg, etc. |
| control_por_rollos | BOOL | Solo para MP tipo tela |
| stock_minimo | NUMERIC | Punto de reorden |
| stock_actual | NUMERIC | Saldo global |
| activo | BOOL | Soft delete |
| created_at | TIMESTAMP | |

**Decisión**: Mantener `prod_inventario` como nombre pero agregar `tipo_item` como campo obligatorio con enum. El campo `categoria` queda deprecated.

---

### 2.2 ROLLOS DE TELA (Refactorización)

**Tabla: `prod_rollo` (renombrar de `prod_inventario_rollos`)**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | VARCHAR PK | UUID |
| empresa_id | INT FK | Empresa |
| item_id | VARCHAR FK | → prod_inventario |
| ingreso_id | VARCHAR FK | → prod_inventario_ingresos |
| codigo_rollo | VARCHAR | Número/código del rollo |
| lote | VARCHAR NULL | Referencia del lote |
| color_id | VARCHAR NULL | Color del rollo |
| tono | VARCHAR NULL | Tono/variación |
| ancho | NUMERIC NULL | Ancho en cm |
| metros_iniciales | NUMERIC | Metraje original |
| metros_saldo | NUMERIC | Metraje actual disponible |
| costo_unitario_metro | NUMERIC | Costo por metro |
| costo_total_inicial | NUMERIC | Costo total del rollo |
| estado | VARCHAR | ACTIVO, AGOTADO, BAJA |
| created_at | TIMESTAMP | |

**Cambios desde actual:**
- Renombrar `metraje` → `metros_iniciales`
- Renombrar `metraje_disponible` → `metros_saldo`
- Agregar `costo_unitario_metro` (calculado desde ingreso)
- Agregar `costo_total_inicial`
- Cambiar `activo: bool` → `estado: enum`

---

### 2.3 ORDEN DE PRODUCCIÓN (Nueva estructura limpia)

**Tabla: `prod_orden` (renombrar conceptualmente `prod_registros`)**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | VARCHAR PK | UUID |
| empresa_id | INT FK | Empresa |
| codigo | VARCHAR UNIQUE | Ej: "OP-2025-001" |
| n_corte | VARCHAR | Número de corte (legacy) |
| modelo_id | VARCHAR FK | → prod_modelos |
| pt_item_id | VARCHAR FK | → prod_inventario (tipo=PT) |
| linea_negocio_id | VARCHAR NULL | Opcional |
| centro_costo_id | VARCHAR NULL | Opcional |
| estado | ENUM | BORRADOR, EN_PROCESO, CERRADA, ANULADA |
| fecha_inicio | DATE | |
| fecha_fin_plan | DATE NULL | Fecha planeada |
| fecha_fin_real | DATE NULL | Fecha real de cierre |
| cantidad_plan | INT | Prendas planeadas |
| cantidad_terminada | INT | Prendas reales |
| urgente | BOOL | Flag de prioridad |
| observaciones | TEXT | |
| created_at | TIMESTAMP | |

**Decisión**: Mantener `prod_registros` pero con campos más claros. El estado actual usa strings libres, migrar a enum.

---

### 2.4 BOM / REQUERIMIENTO / RESERVAS (Mantener y limpiar)

Las tablas existentes están bien estructuradas:
- `prod_modelo_tallas` ✓
- `prod_modelo_bom_linea` ✓
- `prod_registro_tallas` ✓ (cantidades por talla de la OP)
- `prod_registro_requerimiento_mp` ✓ (explosión BOM)
- `prod_inventario_reservas` ✓
- `prod_inventario_reservas_linea` ✓

**Solo ajustar:**
- Validar que BOM solo acepte items tipo MP/AVIO (no SERVICIO, no PT)

---

### 2.5 CONSUMO DE MATERIA PRIMA (Nueva tabla)

**Tabla: `prod_consumo_mp` (reemplaza lógica de `prod_inventario_salidas` para OP)**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | VARCHAR PK | UUID |
| empresa_id | INT FK | Empresa |
| orden_id | VARCHAR FK | → prod_registros |
| item_id | VARCHAR FK | → prod_inventario |
| rollo_id | VARCHAR NULL FK | → prod_inventario_rollos |
| talla_id | VARCHAR NULL | Talla si aplica |
| cantidad | NUMERIC | Cantidad consumida |
| costo_unitario | NUMERIC | Costo FIFO del momento |
| costo_total | NUMERIC | cantidad * costo_unitario |
| fecha | DATE | |
| observaciones | TEXT | |
| salida_id | VARCHAR FK | → prod_inventario_salidas (legacy link) |
| created_at | TIMESTAMP | |

**Decisión**: Crear nueva tabla pero mantener `prod_inventario_salidas` para kardex general. `prod_consumo_mp` es la vista de producción.

**Reglas:**
- Si item.control_por_rollos = true → rollo_id obligatorio
- Si item.control_por_rollos = false → FIFO desde ingresos/lotes
- Cada consumo impacta costo acumulado de la orden

---

### 2.6 SERVICIOS EXTERNOS DE PRODUCCIÓN (Nueva tabla)

**Tabla: `prod_servicio_orden` (nueva, separada de inventario)**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | VARCHAR PK | UUID |
| empresa_id | INT FK | Empresa |
| orden_id | VARCHAR FK | → prod_registros (OBLIGATORIO) |
| servicio_id | VARCHAR FK | → prod_servicios_produccion |
| persona_id | VARCHAR FK | → prod_personas_produccion |
| documento_tipo | VARCHAR NULL | Factura, Boleta, etc. |
| documento_numero | VARCHAR NULL | Número de documento |
| cantidad | INT | Prendas procesadas |
| tarifa_unitaria | NUMERIC | Tarifa por prenda |
| costo_total | NUMERIC | cantidad * tarifa |
| fecha_inicio | DATE | |
| fecha_fin | DATE NULL | |
| estado | VARCHAR | PENDIENTE, EN_PROCESO, COMPLETADO |
| observaciones | TEXT | |
| created_at | TIMESTAMP | |

**Decisión**: Esta tabla reemplaza parcialmente a `prod_movimientos_produccion` + `prod_registro_costos_servicio`. Unifico el concepto.

**Regla clave**: Un servicio NUNCA genera stock ni kardex físico.

---

### 2.7 WIP / COSTO ACUMULADO (Nueva tabla de movimientos)

**Tabla: `prod_wip_movimiento`**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | VARCHAR PK | UUID |
| empresa_id | INT FK | Empresa |
| orden_id | VARCHAR FK | → prod_registros |
| origen_tipo | ENUM | 'CONSUMO_MP', 'SERVICIO', 'AJUSTE' |
| origen_id | VARCHAR | ID de consumo/servicio/ajuste |
| costo | NUMERIC | Monto (+/-) |
| fecha | DATE | |
| descripcion | TEXT | |
| created_at | TIMESTAMP | |

**Triggers sugeridos:**
- INSERT en `prod_consumo_mp` → INSERT en `prod_wip_movimiento`
- INSERT/UPDATE en `prod_servicio_orden` → INSERT en `prod_wip_movimiento`

**Vista materializada opcional:**
```sql
CREATE VIEW prod_wip_resumen AS
SELECT 
    orden_id,
    SUM(CASE WHEN origen_tipo = 'CONSUMO_MP' THEN costo ELSE 0 END) as costo_mp,
    SUM(CASE WHEN origen_tipo = 'SERVICIO' THEN costo ELSE 0 END) as costo_servicio,
    SUM(costo) as costo_total
FROM prod_wip_movimiento
GROUP BY orden_id;
```

---

### 2.8 CIERRE DE PRODUCCIÓN (Ajustar existente)

**Tabla: `prod_cierre` (renombrar de `prod_registro_cierre`)**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | VARCHAR PK | UUID |
| empresa_id | INT FK | Empresa |
| orden_id | VARCHAR FK UNIQUE | → prod_registros |
| fecha_cierre | DATE | |
| cantidad_terminada | NUMERIC | Prendas reales |
| costo_mp | NUMERIC | Total MP consumida |
| costo_servicios | NUMERIC | Total servicios |
| otros_costos | NUMERIC | Ajustes adicionales |
| costo_total | NUMERIC | Suma total |
| costo_unitario_pt | NUMERIC | costo_total / cantidad |
| observaciones | TEXT | |
| created_at | TIMESTAMP | |

---

### 2.9 INGRESO DE PRODUCTO TERMINADO (Ajustar existente)

**Tabla: `prod_ingreso_pt` (nueva, específica para PT)**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | VARCHAR PK | UUID |
| empresa_id | INT FK | Empresa |
| cierre_id | VARCHAR FK | → prod_cierre |
| orden_id | VARCHAR FK | → prod_registros |
| item_pt_id | VARCHAR FK | → prod_inventario (tipo=PT) |
| cantidad | NUMERIC | Prendas ingresadas |
| costo_unitario | NUMERIC | Costo calculado |
| costo_total | NUMERIC | |
| almacen_destino_id | VARCHAR NULL | |
| fecha | DATE | |
| ingreso_inventario_id | VARCHAR FK | → prod_inventario_ingresos |
| created_at | TIMESTAMP | |

**Decisión**: Esta tabla es un "puente" que también crea el registro en `prod_inventario_ingresos` para mantener kardex unificado.

---

## 3. Tablas Actuales: Reutilizar / Refactorizar / Deprecar

| Tabla Actual | Acción | Nueva Tabla/Rol |
|--------------|--------|-----------------|
| `prod_inventario` | REFACTORIZAR | Agregar `tipo_item` enum |
| `prod_inventario_ingresos` | MANTENER | Kardex de ingresos |
| `prod_inventario_salidas` | MANTENER | Kardex de salidas |
| `prod_inventario_rollos` | REFACTORIZAR | Agregar campos de costo |
| `prod_inventario_ajustes` | MANTENER | Ajustes de inventario |
| `prod_inventario_reservas` | MANTENER | Reservas ATP |
| `prod_inventario_reservas_linea` | MANTENER | Líneas de reserva |
| `prod_registros` | REFACTORIZAR | Agregar campos, limpiar estados |
| `prod_registro_tallas` | MANTENER | Cantidades por talla |
| `prod_registro_requerimiento_mp` | MANTENER | Explosión BOM |
| `prod_movimientos_produccion` | DEPRECAR | Reemplazar con `prod_servicio_orden` |
| `prod_registro_costos_servicio` | DEPRECAR | Unificar en `prod_servicio_orden` |
| `prod_registro_cierre` | REFACTORIZAR | Renombrar a `prod_cierre` |
| `prod_mermas` | MANTENER | Registro de mermas |
| `prod_modelo_tallas` | MANTENER | Tallas por modelo |
| `prod_modelo_bom_linea` | MANTENER | BOM |

### Tablas Nuevas a Crear

| Nueva Tabla | Propósito |
|-------------|-----------|
| `prod_consumo_mp` | Consumo de MP por OP con costo |
| `prod_servicio_orden` | Servicios externos por OP |
| `prod_wip_movimiento` | Trazabilidad de costos WIP |
| `prod_ingreso_pt` | Ingresos PT desde cierre |

---

## 4. Modularización Backend

```
/app/backend/
├── server.py                    # Solo startup, middleware, include routers
├── db.py                        # Pool compartido (mantener)
├── auth.py                      # Autenticación (mantener)
├── helpers.py                   # Helpers comunes (mantener)
├── models/                      # Pydantic schemas
│   ├── __init__.py
│   ├── inventario.py
│   ├── ordenes.py
│   ├── consumo.py
│   ├── servicios.py
│   └── cierre.py
├── routes/
│   ├── __init__.py
│   ├── auth.py                  # Login, usuarios
│   ├── maestros.py              # Marcas, tipos, telas, hilos, entalles, tallas, colores
│   ├── modelos.py               # Modelos + BOM + tallas por modelo
│   ├── inventario.py            # CRUD items, ingresos, salidas, ajustes, kardex
│   ├── rollos.py                # CRUD rollos
│   ├── ordenes.py               # CRUD órdenes de producción
│   ├── requerimiento.py         # Explosión BOM, reservas
│   ├── consumo.py               # Consumo de MP
│   ├── servicios.py             # Servicios externos por OP
│   ├── cierre.py                # Preview, ejecutar cierre, ingreso PT
│   └── reportes.py              # Todos los reportes (valorización, kardex, etc.)
└── migrations/
    ├── 001_multiempresa_valorizacion.py
    └── 002_refactorizacion_produccion.py  # NUEVA
```

---

## 5. Flujo Final del Sistema

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FLUJO DE PRODUCCIÓN                          │
└─────────────────────────────────────────────────────────────────────┘

1. INGRESO MP
   └─→ prod_inventario_ingresos (cantidad, costo_unitario)
        └─→ Si control_por_rollos=true: prod_inventario_rollos
             (metros_iniciales, costo_unitario_metro)
        └─→ UPDATE prod_inventario.stock_actual

2. ORDEN DE PRODUCCIÓN (OP)
   └─→ prod_registros (modelo_id, pt_item_id, cantidad_plan)
        └─→ prod_registro_tallas (cantidades reales por talla)

3. EXPLOSIÓN BOM → REQUERIMIENTO
   └─→ prod_registro_requerimiento_mp (item_id, cantidad_requerida)

4. RESERVAS
   └─→ prod_inventario_reservas + prod_inventario_reservas_linea
        (bloquea stock para esta OP)

5. CONSUMO MP
   └─→ prod_consumo_mp (item_id, rollo_id?, cantidad, costo_total)
        └─→ UPDATE prod_inventario.stock_actual (--)
        └─→ UPDATE prod_inventario_rollos.metros_saldo (si rollo)
        └─→ INSERT prod_wip_movimiento (origen='CONSUMO_MP')
        └─→ Libera reserva correspondiente

6. SERVICIOS EXTERNOS
   └─→ prod_servicio_orden (servicio_id, persona_id, cantidad, costo_total)
        └─→ INSERT prod_wip_movimiento (origen='SERVICIO')
        └─→ NO genera movimiento de inventario físico

7. WIP (Trabajo en Proceso)
   └─→ prod_wip_movimiento acumula todos los costos
        └─→ Vista: sum(costo) WHERE orden_id = X

8. CIERRE DE PRODUCCIÓN
   └─→ prod_cierre (costo_mp, costo_servicios, costo_total, costo_unitario)
        └─→ Calcula costo final

9. INGRESO PT
   └─→ prod_ingreso_pt (item_pt_id, cantidad, costo_unitario)
        └─→ INSERT prod_inventario_ingresos (para kardex)
        └─→ UPDATE prod_inventario.stock_actual (item PT)
        └─→ UPDATE prod_registros.estado = 'CERRADA'
```

---

## 6. Plan de Ejecución

### Fase 1: Migración de Datos (sin romper funcionalidad)
1. ALTER TABLE prod_inventario ADD COLUMN tipo_item VARCHAR
2. UPDATE prod_inventario SET tipo_item basado en categoria
3. ALTER TABLE prod_inventario_rollos ADD COLUMN costo_unitario_metro
4. UPDATE costo_unitario_metro desde ingreso relacionado
5. CREATE TABLE prod_consumo_mp
6. CREATE TABLE prod_servicio_orden
7. CREATE TABLE prod_wip_movimiento
8. CREATE TABLE prod_ingreso_pt

### Fase 2: Backend Refactorización
1. Crear estructura de carpetas routes/ y models/
2. Mover endpoints de server.py a routers modulares
3. Implementar nueva lógica de consumo → WIP
4. Implementar nueva lógica de servicios → WIP
5. Ajustar cierre para usar nuevas tablas

### Fase 3: Frontend Ajustes
1. Adaptar formularios a nuevos campos (tipo_item)
2. Ajustar pestañas de OP para nuevas estructuras
3. Actualizar reportes de valorización

---

## 7. Validaciones y Reglas de Negocio

1. **Servicios ≠ Inventario**: Un item tipo SERVICIO no puede tener stock ni generar kardex
2. **Tela → Rollos**: Si item.tipo_item = 'MP' y control_por_rollos = true, todo consumo debe especificar rollo_id
3. **PT asignado**: No se puede cerrar una OP sin pt_item_id
4. **WIP consistente**: El costo_total en cierre debe ser = suma de WIP movimientos
5. **FIFO**: El costo de consumo viene del ingreso más antiguo con stock disponible

---

## 8. Archivos que Cambian

| Archivo | Cambios |
|---------|---------|
| `/app/backend/server.py` | Reducir a ~200 líneas (solo startup + include routers) |
| `/app/backend/routes/inventario.py` | NUEVO: CRUDs de inventario |
| `/app/backend/routes/ordenes.py` | NUEVO: CRUDs de órdenes |
| `/app/backend/routes/consumo.py` | NUEVO: Lógica de consumo + WIP |
| `/app/backend/routes/servicios.py` | NUEVO: Servicios por OP |
| `/app/backend/routes/cierre.py` | MODIFICAR: Usar nuevas tablas |
| `/app/backend/migrations/002_*.py` | NUEVO: Migración estructural |
| `/app/frontend/src/pages/Inventario.jsx` | Ajustar para tipo_item |
| `/app/frontend/src/pages/RegistroDetalleFase2.jsx` | Ajustar pestañas |

---

## 9. Próximos Pasos

1. **Aprobar diseño** con usuario
2. **Crear migración SQL** (002_refactorizacion_produccion.py)
3. **Ejecutar migración** en ambiente de prueba
4. **Crear routers backend** uno por uno
5. **Probar flujo completo**: Ingreso MP → Consumo → Servicio → Cierre → PT
6. **Ajustar frontend** según sea necesario

