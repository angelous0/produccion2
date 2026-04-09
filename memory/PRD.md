# Sistema de Produccion Textil - PRD

## Descripcion General
ERP full-stack para gestion de produccion textil. Backend FastAPI + Frontend React + PostgreSQL.

## Modulos Implementados

### 1. Produccion Core
- Registros de produccion (OP), modelos, rutas, tallas, colores
- Movimientos de produccion (envio/recepcion entre servicios)
- Incidencias y paralizaciones

### 2. Inventario FIFO
- Items de inventario con control de stock
- Ingresos, salidas, ajustes con costeo FIFO
- Rollos de tela con trazabilidad
- Alertas de stock minimo

### 3. Trazabilidad Simplificada (V2) - 2026-04-09
- **prod_fallados simplificada**: fuente oficial de total_fallados
- **prod_registro_arreglos**: envios a arreglo con resolucion (recuperado/liquidacion/merma)
- Estados automaticos: EN_ARREGLO, PARCIAL, COMPLETADO, VENCIDO (3 dias limite)
- Resumen: total_producido = normal + recuperado + liquidacion + merma + fallado_pendiente
- Ecuacion de validacion en tiempo real
- Alertas por arreglos vencidos y fallados pendientes

### 4. Control de Fallados - 2026-04-09
- Integrado como tab "Fallados y Arreglos" dentro de Calidad
- KPIs: Total Fallados, Pendientes, Vencidos, Recuperado, Liquidacion, Merma
- Filtros: Estado, Servicio, Persona, Fecha, Solo vencidos, Solo pendientes, Linea negocio
- Tabla consolidada por registro con estados calculados
- Click en fila abre el registro
- Tooltip con info rapida al hover
- Endpoint: GET /api/fallados-control

### 5. Distribucion PT y Conciliacion Odoo
- Tab PT Odoo en detalle de registro

### 6. Kardex PT
- Lectura del schema Odoo (stock_move, stock_location)

### 7. Cierre de Produccion
- Preview con costos + resultado_final de arreglos V2

### 8. Reportes - Reestructurado 2026-04-09
Dashboard unico con KPIs, alertas, WIP por etapa, carga por servicio y accesos rapidos.
Pantallas consolidadas con Tabs:
- **Seguimiento**: En Proceso, WIP por Etapa, Atrasados, Cumplimiento Ruta, Paralizados
- **Operativo y Terceros**: Rep. Operativo, Tiempos Muertos, Paralizados, Balance Terceros
- **Lotes y Trazabilidad**: Fraccionados, Trazabilidad General, KPIs Calidad
- **Valorizacion**: MP Valorizado, WIP, PT Valorizado
- **Calidad**: Resumen Calidad, Mermas, Estados del Item, Fallados y Arreglos
- **Matriz Dinamica**: pantalla independiente

## Arquitectura
```
/app/backend/routes/
  trazabilidad.py  - Fallados/Arreglos V2 + Control Fallados + KPIs
  cierre.py        - Preview/ejecutar cierre con resultado_final
  registros_main.py
  distribucion_pt.py
  kardex_pt.py
  reportes_produccion.py
  stats_reportes.py

/app/frontend/src/
  components/ArreglosPanel.jsx  - Panel simplificado en tab Control
  components/Layout.jsx         - Sidebar limpio (sin Control Fallados independiente)
  pages/Dashboard.jsx           - Dashboard unico fusionado
  pages/CalidadConsolidado.jsx  - 4 tabs con useSearchParams
  pages/OperativoTerceros.jsx   - 4 tabs reordenados con useSearchParams
  pages/SeguimientoProduccion.jsx - 5 tabs
  pages/LotesTrazabilidad.jsx  - 3 tabs
  pages/ValorizacionConsolidado.jsx - 3 tabs
  pages/ControlFallados.jsx     - Integrado como tab (sin h1 standalone)
  pages/RegistroForm.jsx        - Formulario registro (usa ArreglosPanel)
```

## Endpoints Clave
- CRUD Fallados: GET/POST /api/fallados, PUT/DELETE /api/fallados/{id}
- CRUD Arreglos V2: GET/POST /api/registros/{id}/arreglos, PUT/DELETE /api/arreglos/{id}
- Resumen: GET /api/registros/{id}/resumen-cantidades
- Control Fallados: GET /api/fallados-control
- KPIs: GET /api/reportes/trazabilidad-kpis
- Preview cierre: GET /api/registros/{id}/preview-cierre

## Tareas Pendientes
- P1: Integrar filtro linea_negocio_id en Reportes (Dashboard, KPIs, Matriz) e Inventario
- P2: Fase 2 de Reportes (indicadores por servicio, ranking, tiempos promedio, % recuperacion/merma)
- P2: Refactorizar registros_main.py y server.py (modularizacion)
- P2: Logging estructurado backend
- P3: Exportacion PDF de reportes
- P3: Rate limiting API
