# Prompt para Claude Code — Fallados v2 (Sprint final)

Copia y pega lo que sigue en Claude Code:

---

Implementa los cambios validados del módulo Fallados v2.

**Referencia visual obligatoria (léelo primero):**
`/Users/eduardcardenas/Documents/erp-textil/produccion/mockups/fallados-v2-completo.html`

## REGLAS DE NEGOCIO CERRADAS

1. Resultados al recibir entrega: **OK / LQ Leve / LQ Grave** (NO existe "merma" pura).
2. **"No devuelto"** es caso excepcional (proveedor desaparece). Link secundario, no contador.
3. Cuando la causa del fallado NO es Tela → persona y fecha límite **obligatorias** en el mismo paso.
4. **Prórroga**: días editables (default sugerido 3, rango 1–14). Máximo 2 prórrogas por arreglo.
5. **Precio facturación al proveedor**: input manual al pasar a facturación. Sin reglas automáticas.

## BACKEND

### A. Migración 019_fallados_v2_lq.sql (idempotente, schema `produccion.` explícito)

- `ALTER TABLE produccion.prod_arreglo_entregas`:
  - Renombrar `cant_liq` → `cant_lq_leve` si existe
  - Renombrar `cant_merma` → `cant_lq_grave` si existe
  - `ADD COLUMN IF NOT EXISTS cant_no_devuelto INT NOT NULL DEFAULT 0`

### B. Editar `routes/fallados_v2.py`

1. **POST `/api/arreglos/{arreglo_id}/entregas`** (modificar el existente)
   - Body: `{ cant_ok, cant_lq_leve, cant_lq_grave, cant_no_devuelto, observacion? }`
   - Validar: `cant_ok + cant_lq_leve + cant_lq_grave + cant_no_devuelto <= pendiente`
   - Si `cant_lq_leve > 0` o `cant_lq_grave > 0`: incrementar la línea correspondiente en `prod_distribuciones_esperadas` del registro (tipo "Liquidación Leve" / "Liquidación Grave")
   - Si `cant_no_devuelto > 0`: solo se registra en `prod_arreglo_entregas`, NO toca almacén ni distribución

2. **POST `/api/arreglos/{arreglo_id}/prorroga`** (modificar)
   - Body: `{ dias: int (1..14), motivo?: str }`
   - Validar que `len(arreglo.prorrogas) < 2`, sino devolver 400
   - `fecha_limite += dias`, append al JSONB `prorrogas`
   - Cambiar la constante: `MAX_DIAS_POR_PRORROGA` ya no es fija, es validación de rango

3. **POST `/api/cortes/{registro_id}/fallado-con-asignacion`** (NUEVO)
   - Body: `{ cantidad, causa: 'Costura'|'Tela'|'Lavado'|'Estampado'|'Otro', observacion?, persona_id?, fecha_limite?, servicio_id? }`
   - Si `causa != 'Tela'`: `persona_id`, `fecha_limite` y `servicio_id` son obligatorios
   - Si `causa == 'Tela'`: solo crear el fallado, sin arreglo
   - En el caso servicio: crear `prod_fallados` + `prod_registro_arreglos` en la misma transacción
   - `fecha_limite_original = fecha_limite`

4. **GET `/api/personas-produccion?servicio_id=X`** — verificar que ya filtra por servicio. Si no, agregar query param.

## FRONTEND

### C. `pages/CortesCalidad.jsx`

- **Desktop (`md:` y arriba):** lista compacta de una línea por corte:
  - `[Número mono] [Modelo] [Etapa badge] [Prendas count] [SPACER] [Botones]`
  - Botones más chicos (h-8) pero con texto + icono
- **Móvil:** mantener layout actual (cards grandes), no tocar
- **Drawer "+ Fallado":**
  - Conservar: cantidad, chip causa, observación
  - **Nuevo bloque azul** cuando `chip != 'Tela'`:
    - Select persona filtrada por servicio del chip
    - Input date fecha límite (default = hoy + 3 días)
    - Ambos obligatorios, deshabilitar botón Guardar si faltan
    - Texto auxiliar "Solo personas del servicio [X]"
  - Aviso verde cuando `chip == 'Tela'`: "No requiere asignar — queda en arreglo interno"
  - Botón guardar llama `POST /api/cortes/{id}/fallado-con-asignacion`

### D. `pages/FalladosTablero.jsx`

- **Móvil (debajo de `md:`):** layout aparte
  - KPIs en grid 2x2
  - Lista de tarjetas grandes coloreadas según urgencia
  - Botón ancho "📦 Recibir entrega" + botón chico "Prórroga"
  - Mostrar línea de historial en cada card: "Hist: X OK · Y LQ Leve · Z LQ Grave"
- **Desktop:** mantener tabla actual sin cambios
- **Modal "Recibir entrega":**
  - 3 contadores: OK (verde) / LQ Leve (amarillo) / LQ Grave (naranja)
  - Debajo del botón "Registrar entrega", link rojo subrayado: "⚠ Marcar como NO devuelto (proveedor no respondió)"
  - El link abre un mini-form con un solo input numérico para no_devuelto y un campo de motivo obligatorio
- **Modal "Prórroga":**
  - Input number `dias` (default 3, min 1, max 14)
  - Textarea motivo (opcional)
  - Si `arreglo.prorrogas.length >= 2`: deshabilitar y mostrar aviso "Ya se otorgaron las 2 prórrogas permitidas"

## VALIDACIÓN OBLIGATORIA

1. Aplicar migración 019 (`psql -f migrations/019_fallados_v2_lq.sql`)
2. Verificar pool de conexiones reciba bien las nuevas columnas
3. Smoke test cada endpoint con curl o httpie
4. Probar en localhost:3000:
   - Marcar fallado de Tela → NO debe aparecer bloque azul
   - Marcar fallado de Costura → bloque azul obligatorio, dropdown solo muestra personas de costura
   - Recibir entrega con LQ Leve 2 → verificar que aparece línea "Liquidación Leve: 2" en Distribución Esperada del corte
   - Dar prórroga 5 días → verificar fecha cambia, contador llega a 1/2
   - Dar segunda prórroga → contador 2/2, botón se deshabilita
   - Intentar tercera → debe devolver 400

5. Commitear solo si todo lo anterior pasa. Mensaje: `feat(fallados-v2): asignación directa + LQ leve/grave + prórroga variable`

## NO COMMITEAR SI

- Algún endpoint devuelve 500
- La migración rompe datos existentes
- Hay regresión en `/cortes-calidad` actual
- Los smoke tests fallan

Cuando termines, házme un resumen corto en español con: qué cambió, qué probaste, qué quedó pendiente.
