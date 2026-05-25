# Prompt para Claude Code — Fallados v2.1 (Refinamientos post-validación)

Copia y pega lo siguiente en Claude Code:

---

Implementa los refinamientos del módulo Fallados v2 que detectamos en la validación visual. Lee primero el código existente para confirmar nombres exactos de columnas/endpoints antes de tocar nada.

## CONTEXTO DEL CAMBIO

Fallados v2 ya está en producción (commits 86f8d01, 36a0bfc, 0313fa5 — ya pusheados). Detectamos 4 mejoras al usarlo en localhost:

1. El drawer no pre-selecciona la persona a la que originalmente se mandó el corte.
2. El botón "Ver fallados" en `/cortes-calidad` no navega a ningún lado.
3. La semántica del modal "Recibir entrega" es incorrecta:
   - Servicios (Costura/Lavanderia/Estampado) deben tener **OK / Liquidación / No devuelto** (sin leve/grave).
   - Tela (interno) sigue con **OK / LQ Leve / LQ Grave / No devuelto**.
4. Falta conectar la liquidación de servicio con el módulo de cobro al proveedor (`/calidad → Fallados y Arreglos → Sin marcar`).

## REGLAS DE NEGOCIO CERRADAS

- **Servicio** (causa = Costura, Lavanderia, Estampado): el proveedor responde con OK o se le liquida. No existe leve/grave aquí porque al proveedor le facturas un solo concepto (liquidación).
- **Tela** (causa = Tela, sin proveedor): el arreglo es interno, distinguir Leve vs Grave porque define cómo lo despachas (LQ Leve vende a precio reducido, LQ Grave es scrap).
- **No devuelto**: excepción, aplica en ambos casos.
- **Checkbox "Enviar a facturación al proveedor"**: aparece SOLO en arreglos de servicio cuando `cant_liquidacion > 0`. Si el usuario tilda → marcado_para_cobro = TRUE (entra a Sin marcar). Si no tilda → la liquidación queda registrada pero no entra al flujo de cobro.

## BACKEND

### A. Migración 020_fallados_v2_liquidacion.sql (idempotente, schema `produccion.` explícito)

```sql
ALTER TABLE produccion.prod_arreglo_entregas
    ADD COLUMN IF NOT EXISTS cant_liquidacion INT NOT NULL DEFAULT 0;
```

No tocar las columnas existentes (`cant_lq_leve`, `cant_lq_grave`, `cant_no_devuelto`). La nueva columna `cant_liquidacion` solo se usará en arreglos de servicio.

### B. Editar `routes/fallados_v2.py`

1. **POST `/api/arreglos/{arreglo_id}/entregas`** (modificar)
   - Body nuevo: `{ cant_ok, cant_lq_leve?, cant_lq_grave?, cant_liquidacion?, cant_no_devuelto, observacion?, enviar_a_facturacion?: bool }`
   - Cargar el arreglo. Determinar si es servicio o tela mirando `causa_fallado` (Costura/Lavanderia/Estampado/Otro vs Tela).
   - Validación condicional:
     - Si es **servicio**: solo aceptar `cant_ok`, `cant_liquidacion`, `cant_no_devuelto`. Rechazar 422 si vienen `cant_lq_leve` o `cant_lq_grave` con valor > 0.
     - Si es **tela**: solo aceptar `cant_ok`, `cant_lq_leve`, `cant_lq_grave`, `cant_no_devuelto`. Rechazar 422 si viene `cant_liquidacion` con valor > 0.
   - Validar suma total <= pendiente (igual que hoy).
   - Actualizar saldo del arreglo (igual que hoy):
     - servicio: `cantidad_liquidacion += cant_liquidacion`, `cantidad_merma += cant_no_devuelto`, `cantidad_recuperada += cant_ok`
     - tela: `cantidad_liquidacion += cant_lq_leve + cant_lq_grave`, `cantidad_merma += cant_no_devuelto`, `cantidad_recuperada += cant_ok`
   - **Nuevo:** si es servicio y `enviar_a_facturacion == True` y `cant_liquidacion > 0`:
     - UPDATE `prod_registro_arreglos` SET `marcado_para_cobro = TRUE`, `marcado_por_usuario_id`, `marcado_por_nombre`, `fecha_marcado = NOW()`, `motivo_marcado = 'Liquidación servicio: X pzs'`
     - Insertar fila en `prod_arreglos_audit` con accion = 'marcar_cobro'
     - NO ejecutar la validación de vencido que tiene el endpoint `/registros/arreglos/{id}/marcar-cobro` — este flujo es paralelo y válido aunque el arreglo no esté vencido.
     - Si ya estaba `marcado_para_cobro = TRUE`, no hacer nada (idempotente, no error).

2. **GET `/api/cortes/{registro_id}/persona-sugerida`** (NUEVO)
   - Devolver `{ persona_id, persona_nombre, servicio_id, servicio_nombre }` correspondiente al último movimiento de salida del corte hacia un servicio externo.
   - Query: buscar en `prod_movimientos` el último registro con `tipo = 'salida'` y `servicio_id IS NOT NULL` para ese `registro_id`. Si no hay, devolver 204 No Content (frontend dejará el drawer vacío como hoy).

3. **GET `/api/fallados/tablero`** (modificar)
   - Aceptar query param opcional `corte_id` (o `registro_id`, usar el que ya esté convencionado).
   - Si viene, filtrar la lista de arreglos por ese corte únicamente.
   - Mantener mismo formato de respuesta (`hist_ok`, `hist_lq_leve`, `hist_lq_grave`, etc.) y agregar `hist_liquidacion` para arreglos de servicio.

4. **Endpoint del tablero (fila por arreglo)**: agregar campo `tipo_arreglo: 'servicio' | 'tela'` y `marcado_para_cobro: bool` para que el frontend sepa qué renderizar y si ya está marcado.

## FRONTEND

### C. `pages/CortesCalidad.jsx`

1. **Drawer "+ Fallado"** (bloque azul de asignación):
   - Al abrir el drawer (cuando el usuario elige causa != Tela), llamar `GET /api/cortes/{registro_id}/persona-sugerida`.
   - Si responde 200: pre-seleccionar `persona_id` en el dropdown y filtrar por `servicio_id` devuelto. Mostrar microcopy: "Sugerido del último envío".
   - Si responde 204: dejar el dropdown vacío como hoy.
   - El usuario puede cambiar la selección libremente (no bloquear).

2. **Botón "Ver fallados"** en cards/filas con fallados existentes:
   - Hoy no navega. Cambiar a `navigate('/fallados-tablero?corte_id=' + registro_id)`.
   - Mismo cambio en versión móvil.

### D. `pages/FalladosTablero.jsx`

1. **Aceptar query param `corte_id`**:
   - Si viene, mostrar chip arriba: "Filtrando por corte XXX · [Limpiar]" y filtrar lista.
   - El botón "Limpiar" quita el query param y vuelve al listado completo.

2. **Modal "Recibir entrega"** — render condicional según `tipo_arreglo`:
   - **Si `tipo_arreglo == 'servicio'`:**
     - Mostrar 2 contadores: OK (verde) / Liquidación (naranja)
     - NO mostrar LQ Leve ni LQ Grave
     - Debajo de los contadores, mostrar **checkbox**: `☐ Enviar a facturación al proveedor` (default: no tildado)
     - Si `cant_liquidacion == 0`, ocultar el checkbox.
     - Microcopy debajo del checkbox: "Si tildas, este lote aparecerá en Calidad → Fallados y Arreglos → Sin marcar para que después lo cobres."
     - Si el arreglo ya tiene `marcado_para_cobro = TRUE`, deshabilitar el checkbox y mostrar texto: "Ya marcado para cobro previamente."
   - **Si `tipo_arreglo == 'tela'`:**
     - 3 contadores: OK (verde) / LQ Leve (amarillo) / LQ Grave (naranja)
     - NO mostrar checkbox de facturación (no aplica)
   - **En ambos casos**: link rojo "⚠ Marcar como NO devuelto (proveedor no respondió)" debajo del botón principal — sin cambios.

3. **Versión móvil del tablero**:
   - Las cards mobiles deben tener el mismo botón "📦 Recibir entrega" que abre el modal — verificar que el modal funcione bien en móvil con el render condicional nuevo.
   - Línea de historial en cada card:
     - Si servicio: "Hist: X OK · Y Liquidación · Z No devuelto"
     - Si tela: "Hist: X OK · Y LQ Leve · Z LQ Grave · W No devuelto"

## VALIDACIÓN OBLIGATORIA

1. Aplicar migración 020 (`psql -f migrations/020_fallados_v2_liquidacion.sql`).
2. Smoke test cada endpoint modificado:
   - POST entrega arreglo de Costura con `cant_liquidacion=5, enviar_a_facturacion=true` → verificar que el arreglo queda con `marcado_para_cobro=TRUE` y aparece en `/api/registros/arreglos/sin-marcar` (o el endpoint que use ese reporte).
   - POST entrega arreglo de Tela con `cant_lq_leve=3, cant_lq_grave=1` → verificar que NO se modifica `marcado_para_cobro`.
   - POST entrega servicio con `cant_lq_leve > 0` → debe devolver 422.
   - GET persona-sugerida de un corte que se mandó a Artemio Costura → devolver Artemio.
   - GET persona-sugerida de un corte interno sin envíos → 204.
3. Probar en localhost:3000:
   - Abrir corte 010, drawer "+ Fallado", elegir Costura → persona pre-seleccionada = la del último envío.
   - En `/cortes-calidad`, click "Ver fallados" de un corte con fallados → navega a `/fallados-tablero?corte_id=010` y solo muestra los arreglos de ese corte.
   - Modal Recibir entrega de arreglo de Costura: solo OK / Liquidación + checkbox. Tildar checkbox + Liquidación 5 → guardar → verificar en `/calidad → Fallados y Arreglos → Sin marcar` que aparece ese lote.
   - Modal Recibir entrega de arreglo de Tela: solo OK / LQ Leve / LQ Grave, SIN checkbox.
4. Verificar que no haya regresiones en el módulo existente de cobros (Calidad → Fallados y Arreglos → marcar/desmarcar/cobrar manualmente).

## NO COMMITEAR SI

- Algún endpoint devuelve 500.
- La migración 020 rompe entregas existentes.
- El render condicional del modal no funciona (muestra LQ Leve/Grave en servicios o viceversa).
- El checkbox marca para cobro pero el registro no aparece en /calidad → Sin marcar.

## COMMIT MESSAGE SUGERIDO

`feat(fallados-v2.1): liquidación servicio + checkbox facturación + navegación ver-fallados + persona sugerida`

Cuando termines, házme un resumen corto en español con: qué cambió, qué probaste, qué quedó pendiente.
