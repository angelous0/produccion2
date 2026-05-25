# Resumen — Fallados v2 + v2.1 (para otros tasks/sprints)

Documento de referencia para que cualquier otro task (app operario móvil, sprint de facturación, etc.) entienda qué se hizo en el módulo de Fallados y dónde están las piezas.

---

## 1. Qué es Fallados v2

Reemplaza el flujo viejo de "marcar fallado y olvidarse". Ahora cada fallado detectado en control de calidad genera un **arreglo** (con persona asignada, fecha límite y prórrogas) y se gestiona hasta que el proveedor (o el equipo interno si es Tela) lo devuelve clasificado.

Hay dos versiones:
- **v2** — ya en producción (commits `86f8d01`, `36a0bfc`, `0313fa5` pusheados a `origin/produccion2`). Validado visualmente en localhost.
- **v2.1** — refinamientos pendientes de implementar. Prompt listo en `PROMPT-CLAUDE-CODE-V2.md` de esta misma carpeta.

---

## 2. Reglas de negocio cerradas

| Causa del fallado | Tipo de arreglo | Resultado al recibir entrega |
|---|---|---|
| Costura / Lavandería / Estampado / Otro | Servicio externo (con proveedor) | OK / Liquidación / No devuelto |
| Tela | Interno (sin proveedor) | OK / LQ Leve / LQ Grave / No devuelto |

- **"No devuelto"** es excepción (proveedor desaparece). Link rojo en el modal, no contador principal.
- **Prórroga**: días editables 1–14 (default sugerido 3). Máximo 2 prórrogas por arreglo.
- **Precio facturación al proveedor**: input manual, sin reglas automáticas. Pendiente sprint.
- **Asignación**: cuando la causa NO es Tela, persona + fecha límite + servicio son obligatorios en el mismo paso (drawer "+ Fallado").

---

## 3. Tablas BD afectadas (schema `produccion`)

### Nuevas/modificadas en v2 (migración `019_fallados_v2_lq.sql`)
- `prod_arreglo_entregas`:
  - Renombrado `cant_liq` → `cant_lq_leve`
  - Renombrado `cant_merma` → `cant_lq_grave`
  - Agregado `cant_no_devuelto INT NOT NULL DEFAULT 0`

### Pendiente en v2.1 (migración `020_fallados_v2_liquidacion.sql`)
- `prod_arreglo_entregas`:
  - Agregar `cant_liquidacion INT NOT NULL DEFAULT 0` (solo para arreglos de servicio)

### Tablas relacionadas que ya existían (no se tocan, solo se leen/usan)
- `prod_fallados` — el registro del fallado en sí
- `prod_registro_arreglos` — el arreglo creado a partir del fallado (con campos `marcado_para_cobro`, `cobrado`, prórrogas en JSONB)
- `prod_notas_cobro` + `prod_notas_cobro_lotes` — notas que agrupan envíos para finanzas (migración 007)
- `prod_arreglos_audit` — auditoría de marcar/desmarcar/cobrar/descobrar
- `prod_personas_produccion` — personas (internos + destajistas externos)
- `prod_movimientos` — fuente para el endpoint nuevo `/cortes/{id}/persona-sugerida`

### Mapeo semántico saldo del arreglo (v2)
Sobre los campos existentes `cantidad_recuperada`, `cantidad_liquidacion`, `cantidad_merma` en `prod_registro_arreglos`:

| Concepto en entrega | Suma a saldo |
|---|---|
| cant_ok | cantidad_recuperada |
| cant_lq_leve + cant_lq_grave (tela) | cantidad_liquidacion |
| cant_liquidacion (servicio, v2.1) | cantidad_liquidacion |
| cant_no_devuelto | cantidad_merma |

---

## 4. Backend — archivos clave

| Archivo | Rol |
|---|---|
| `backend/migrations/019_fallados_v2_lq.sql` | Migración v2 (aplicada) |
| `backend/migrations/020_fallados_v2_liquidacion.sql` | Migración v2.1 (pendiente) |
| `backend/routes/fallados_v2.py` | Router con endpoints del módulo |
| `backend/routes/trazabilidad.py` | Contiene endpoints viejos de cobro al proveedor (`/registros/arreglos/{id}/marcar-cobro`, `/cobrar`, etc.) — se reutilizan |
| `backend/server.py` | Monta el router `fallados_v2` |

### Endpoints del módulo (v2 actual)
- `POST /api/arreglos/{arreglo_id}/entregas` — registra entrega con clasificación
- `POST /api/arreglos/{arreglo_id}/prorroga` — agrega prórroga (max 2)
- `POST /api/cortes/{registro_id}/fallado-con-asignacion` — crea fallado + arreglo en una transacción
- `GET /api/fallados/tablero` — listado para el tablero
- `GET /api/personas-produccion?servicio_id=X` — personas filtradas por servicio

### Endpoints nuevos en v2.1 (pendientes)
- `GET /api/cortes/{registro_id}/persona-sugerida` — devuelve la persona del último movimiento de salida del corte (para pre-llenar el drawer)
- `GET /api/fallados/tablero?corte_id=X` — agregar query param para filtrar por corte

---

## 5. Frontend — rutas y componentes

| Ruta | Componente | Función |
|---|---|---|
| `/cortes-calidad` | `pages/CortesCalidad.jsx` | Lista de cortes en acabado, drawer "+ Fallado" |
| `/fallados-tablero` | `pages/FalladosTablero.jsx` | Tablero de arreglos pendientes con KPIs |
| `/calidad` (ruta existente) | (pestaña Fallados y Arreglos) | Flujo de cobro al proveedor (no se tocó) |

### Render dual (web vs móvil)
Cada página tiene dos layouts en el mismo componente, controlados por Tailwind breakpoints (`md:` y arriba = desktop, debajo = mobile). No son rutas separadas.

- Desktop: tabla compacta con botones inline
- Mobile: cards grandes coloreadas por urgencia, modal en lugar de drawer

### Pendiente en v2.1 (frontend)
- Pre-selección de persona del último movimiento al abrir drawer
- Botón "Ver fallados" debe navegar a `/fallados-tablero?corte_id=X`
- Modal "Recibir entrega" con render condicional según `tipo_arreglo` (servicio vs tela)
- Checkbox "Enviar a facturación al proveedor" solo en arreglos de servicio con `cant_liquidacion > 0`

---

## 6. Ciclo completo del flujo (de extremo a extremo)

```
Control de calidad detecta defecto en corte
        ↓
[/cortes-calidad] Drawer "+ Fallado"
   - Elige causa (Costura/Tela/Lavandería/Estampado/Otro)
   - Si != Tela: asigna persona + fecha límite (default +3d)
        ↓
Se crea prod_fallados + prod_registro_arreglos
        ↓
[/fallados-tablero] El arreglo aparece en el tablero
   - Estados: sin asignar / por vencer / vencido / en proceso
   - Puede recibir prórrogas (max 2)
        ↓
Proveedor (o equipo interno) devuelve las prendas
[/fallados-tablero] Modal "Recibir entrega"
   - Servicio: OK / Liquidación [+ checkbox "Enviar a facturación"]
   - Tela: OK / LQ Leve / LQ Grave
   - Link excepción: "Marcar como NO devuelto"
        ↓
Saldo del arreglo se actualiza
        ↓
SI checkbox tildado en servicio:
   marcado_para_cobro = TRUE en prod_registro_arreglos
        ↓
[/calidad → Fallados y Arreglos → Sin marcar]
   El lote aparece para ser cobrado
        ↓
Usuario marca, pone precio (sprint pendiente), genera nota de cobro
        ↓
Finanzas procesa la nota → cobrado = TRUE
```

---

## 7. Lo pendiente

### Sprint inmediato (v2.1) — prompt listo
Ver `PROMPT-CLAUDE-CODE-V2.md`. Cubre los 4 puntos:
1. Pre-selección persona del último movimiento
2. Navegación "Ver fallados" → tablero filtrado
3. Render condicional servicio vs tela en modal
4. Checkbox enviar a facturación

### Sprint posterior — Facturación precio manual
Backend ya tiene los campos `precio_unitario_facturacion`, `precio_total_facturacion` preparados. Falta:
- UI para ingresar precio cuando se marca para cobro
- Mostrar en la nota de cobro

### Sprint futuro — Vista operario externo (relevante para app operario móvil)
Si los destajistas externos (Artemio Rodriguez, Servicios Industriales Antártida, etc.) tienen cuenta en la app, podrían:
- Ver sus arreglos pendientes con fecha límite
- Reportar devolución desde su lado (versión simplificada del modal Recibir entrega)
- Ver historial de cuánto les han cobrado

**Esto es un sprint aparte** y depende de decisión sobre autenticación/permisos para externos.

---

## 8. Para el task de "App operario mobile"

**No incluir las pantallas actuales de Fallados v2 dentro de la app operario.** Son pantallas de gestión (supervisor de acabado/calidad), no de operario en planta.

**Sí tiene sentido** dejar previsto en la arquitectura de la app operario un futuro módulo "Mis arreglos" para destajistas externos, pero implementarlo como sprint separado cuando el operario interno ya esté validado.

El operario interno (Juan Pérez, Corte) puede a lo sumo **reportar incidencia** desde la pantalla 11 del mockup operario, pero eso ya estaba contemplado y no toca Fallados v2.

---

## 9. Archivos de referencia en `produccion/mockups/`

| Archivo | Para qué sirve |
|---|---|
| `fallados-v2-completo.html` | Mockup visual de las 5 pantallas (web + móvil) |
| `fallados-v2-final.html` | Versión previa del mockup, menos completa |
| `PROMPT-CLAUDE-CODE.md` | Prompt v1 que generó la implementación v2 (histórico) |
| `PROMPT-CLAUDE-CODE-V2.md` | Prompt v2.1 pendiente de ejecutar |
| `RESUMEN-FALLADOS-V2.md` | Este documento |
| `operario-mobile.html` | Mockup de app operario (otro task, no relacionado a Fallados) |

---

## 10. Notas de implementación

- **Migración aplicada con schema explícito** (`produccion.tabla`) — política del proyecto, no usar nombres sueltos.
- **Idempotencia obligatoria** en todas las migraciones (`IF NOT EXISTS`, `IF EXISTS` antes de renames).
- **Saldo del arreglo** se actualiza en la misma transacción del POST entregas, NO disparado por trigger.
- **Distribución PT auto-update**: se decidió NO tocarla este sprint. Se manejará manualmente desde el módulo de distribución existente.
- **Auditoría**: aprovechar `prod_arreglos_audit` cuando se setee `marcado_para_cobro=TRUE` desde el endpoint de entregas (accion='marcar_cobro').
