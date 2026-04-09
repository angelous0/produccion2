"""
Router BOM (Bill of Materials) - Cabecera + Detalle
Propósito: definir materiales estándar por modelo, estimar consumo, generar requerimiento MP.
El BOM NO reemplaza el consumo real ni el costo real de cierre.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from uuid import uuid4
from db import get_pool

router = APIRouter(prefix="/api/bom", tags=["BOM"])


# ==================== PYDANTIC MODELS ====================

class BomCabeceraCreate(BaseModel):
    modelo_id: str
    nombre: Optional[str] = None
    codigo: Optional[str] = None
    version: int = 1
    observaciones: Optional[str] = None

class BomCabeceraUpdate(BaseModel):
    nombre: Optional[str] = None
    estado: Optional[str] = None  # BORRADOR, APROBADO, INACTIVO
    observaciones: Optional[str] = None
    vigente_desde: Optional[str] = None
    vigente_hasta: Optional[str] = None

class BomLineaCreate(BaseModel):
    inventario_id: Optional[str] = None
    servicio_produccion_id: Optional[str] = None
    tipo_componente: str = "TELA"  # TELA, AVIO, SERVICIO, EMPAQUE, OTRO
    talla_id: Optional[str] = None
    etapa_id: Optional[str] = None
    cantidad_base: float = 1.0
    merma_pct: float = 0.0
    es_opcional: bool = False
    observaciones: Optional[str] = None
    costo_manual: Optional[float] = None

class BomLineaUpdate(BaseModel):
    inventario_id: Optional[str] = None
    servicio_produccion_id: Optional[str] = None
    tipo_componente: Optional[str] = None
    talla_id: Optional[str] = None
    etapa_id: Optional[str] = None
    cantidad_base: Optional[float] = None
    merma_pct: Optional[float] = None
    es_opcional: Optional[bool] = None
    observaciones: Optional[str] = None
    activo: Optional[bool] = None
    orden: Optional[int] = None
    costo_manual: Optional[float] = None


# ==================== HELPERS ====================

def row_to_dict(row):
    if row is None:
        return None
    d = dict(row)
    from datetime import datetime
    from decimal import Decimal
    for k, v in d.items():
        if isinstance(v, datetime):
            d[k] = v.isoformat()
        elif isinstance(v, Decimal):
            d[k] = float(v)
    return d

TIPOS_COMPONENTE = ["TELA", "AVIO", "SERVICIO", "EMPAQUE", "OTRO"]
ESTADOS_BOM = ["BORRADOR", "APROBADO", "INACTIVO"]


# ==================== CABECERA ====================

@router.get("")
async def list_bom_cabeceras(modelo_id: str = Query(...), estado: Optional[str] = None):
    """Lista BOMs de un modelo."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        q = """
            SELECT bc.*, m.nombre as modelo_nombre,
                   (SELECT COUNT(*) FROM prod_modelo_bom_linea bl WHERE bl.bom_id = bc.id AND bl.activo = true) as total_lineas
            FROM prod_bom_cabecera bc
            LEFT JOIN prod_modelos m ON bc.modelo_id = m.id
            WHERE bc.modelo_id = $1
        """
        params = [modelo_id]
        if estado:
            q += " AND bc.estado = $2"
            params.append(estado)
        q += " ORDER BY bc.version DESC"
        rows = await conn.fetch(q, *params)
    return [row_to_dict(r) for r in rows]


@router.post("")
async def create_bom_cabecera(data: BomCabeceraCreate):
    """Crea una nueva cabecera BOM para un modelo."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Verificar modelo existe
        modelo = await conn.fetchrow("SELECT id, nombre FROM prod_modelos WHERE id = $1", data.modelo_id)
        if not modelo:
            raise HTTPException(status_code=404, detail="Modelo no encontrado")

        # Auto-calcular version
        max_ver = await conn.fetchval(
            "SELECT COALESCE(MAX(version), 0) FROM prod_bom_cabecera WHERE modelo_id = $1",
            data.modelo_id
        )
        version = (max_ver or 0) + 1

        codigo = data.codigo or f"BOM-{modelo['nombre'][:10].upper().replace(' ','-')}-V{version}"
        nombre = data.nombre or f"Receta v{version}"
        new_id = str(uuid4())

        await conn.execute("""
            INSERT INTO prod_bom_cabecera (id, modelo_id, codigo, version, nombre, estado, observaciones, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, 'BORRADOR', $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """, new_id, data.modelo_id, codigo, version, nombre, data.observaciones)

        row = await conn.fetchrow("""
            SELECT bc.*, m.nombre as modelo_nombre
            FROM prod_bom_cabecera bc
            LEFT JOIN prod_modelos m ON bc.modelo_id = m.id
            WHERE bc.id = $1
        """, new_id)

    return row_to_dict(row)


@router.get("/{bom_id}")
async def get_bom_detalle(bom_id: str):
    """Obtiene cabecera BOM con todas sus líneas."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        cab = await conn.fetchrow("""
            SELECT bc.*, m.nombre as modelo_nombre
            FROM prod_bom_cabecera bc
            LEFT JOIN prod_modelos m ON bc.modelo_id = m.id
            WHERE bc.id = $1
        """, bom_id)
        if not cab:
            raise HTTPException(status_code=404, detail="BOM no encontrado")

        lineas = await conn.fetch("""
            SELECT bl.*, i.nombre as inventario_nombre, i.codigo as inventario_codigo,
                   i.tipo_item as inventario_tipo, i.unidad_medida as inventario_unidad,
                   tc.nombre as talla_nombre,
                   et.nombre as etapa_nombre,
                   sp.nombre as servicio_nombre, sp.tarifa as servicio_tarifa
            FROM prod_modelo_bom_linea bl
            LEFT JOIN prod_inventario i ON bl.inventario_id = i.id
            LEFT JOIN prod_tallas_catalogo tc ON bl.talla_id = tc.id
            LEFT JOIN prod_servicios_produccion et ON bl.etapa_id = et.id
            LEFT JOIN prod_servicios_produccion sp ON bl.servicio_produccion_id = sp.id
            WHERE bl.bom_id = $1
            ORDER BY bl.orden ASC, bl.created_at ASC
        """, bom_id)

    cab_dict = row_to_dict(cab)
    cab_dict["lineas"] = [row_to_dict(l) for l in lineas]
    return cab_dict


@router.delete("/{bom_id}")
async def delete_bom_cabecera(bom_id: str):
    """Elimina una cabecera BOM y todas sus líneas."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        cab = await conn.fetchrow("SELECT * FROM prod_bom_cabecera WHERE id = $1", bom_id)
        if not cab:
            raise HTTPException(status_code=404, detail="BOM no encontrado")
        await conn.execute("DELETE FROM prod_modelo_bom_linea WHERE bom_id = $1", bom_id)
        await conn.execute("DELETE FROM prod_bom_cabecera WHERE id = $1", bom_id)
    return {"message": "BOM eliminado", "codigo": cab['codigo']}



@router.put("/{bom_id}")
async def update_bom_cabecera(bom_id: str, data: BomCabeceraUpdate):
    """Actualiza estado/observaciones de la cabecera BOM."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        cab = await conn.fetchrow("SELECT * FROM prod_bom_cabecera WHERE id = $1", bom_id)
        if not cab:
            raise HTTPException(status_code=404, detail="BOM no encontrado")

        estado = data.estado if data.estado else cab['estado']
        if estado not in ESTADOS_BOM:
            raise HTTPException(status_code=400, detail=f"Estado inválido. Permitidos: {ESTADOS_BOM}")

        nombre = data.nombre if data.nombre is not None else cab.get('nombre')
        obs = data.observaciones if data.observaciones is not None else cab['observaciones']
        vigente_desde = data.vigente_desde or (cab['vigente_desde'].isoformat() if cab['vigente_desde'] else None)
        vigente_hasta = data.vigente_hasta or (cab['vigente_hasta'].isoformat() if cab['vigente_hasta'] else None)

        await conn.execute("""
            UPDATE prod_bom_cabecera
            SET estado = $1, observaciones = $2, nombre = $3,
                vigente_desde = $4::timestamp, vigente_hasta = $5::timestamp,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $6
        """, estado, obs, nombre, vigente_desde, vigente_hasta, bom_id)

        row = await conn.fetchrow("""
            SELECT bc.*, m.nombre as modelo_nombre
            FROM prod_bom_cabecera bc
            LEFT JOIN prod_modelos m ON bc.modelo_id = m.id
            WHERE bc.id = $1
        """, bom_id)
    return row_to_dict(row)


# ==================== LÍNEAS ====================

@router.post("/{bom_id}/lineas")
async def add_bom_linea(bom_id: str, data: BomLineaCreate):
    """Agrega una línea al BOM."""
    if data.cantidad_base <= 0:
        raise HTTPException(status_code=400, detail="cantidad_base debe ser mayor a 0")
    if data.tipo_componente not in TIPOS_COMPONENTE:
        raise HTTPException(status_code=400, detail=f"tipo_componente inválido. Permitidos: {TIPOS_COMPONENTE}")
    if data.merma_pct < 0 or data.merma_pct > 100:
        raise HTTPException(status_code=400, detail="merma_pct debe estar entre 0 y 100")

    pool = await get_pool()
    async with pool.acquire() as conn:
        # Verificar BOM existe
        cab = await conn.fetchrow("SELECT * FROM prod_bom_cabecera WHERE id = $1", bom_id)
        if not cab:
            raise HTTPException(status_code=404, detail="BOM no encontrado")

        # Verificar inventario si se proporcionó
        if data.inventario_id:
            inv = await conn.fetchrow("SELECT * FROM prod_inventario WHERE id = $1", data.inventario_id)
            if not inv:
                raise HTTPException(status_code=404, detail="Item de inventario no encontrado")

        # Calcular cantidad_total
        cantidad_total = round(data.cantidad_base * (1 + data.merma_pct / 100), 4)

        new_id = str(uuid4())
        costo_manual = float(data.costo_manual) if data.costo_manual is not None else None
        # Para SERVICIO: usar servicio_produccion_id, no inventario_id
        inv_id = data.inventario_id if data.tipo_componente != 'SERVICIO' else None
        serv_id = data.servicio_produccion_id if data.tipo_componente == 'SERVICIO' else None
        await conn.execute("""
            INSERT INTO prod_modelo_bom_linea
                (id, bom_id, modelo_id, inventario_id, servicio_produccion_id, tipo_componente, talla_id, etapa_id,
                 unidad_base, cantidad_base, merma_pct, cantidad_total, es_opcional,
                 observaciones, orden, activo, costo_manual, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
                    'PRENDA', $9, $10, $11, $12,
                    $13, 10, true, $14, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """, new_id, bom_id, cab['modelo_id'], inv_id, serv_id, data.tipo_componente,
            data.talla_id, data.etapa_id,
            float(data.cantidad_base), float(data.merma_pct), cantidad_total, data.es_opcional,
            data.observaciones, costo_manual)

        row = await conn.fetchrow("""
            SELECT bl.*, i.nombre as inventario_nombre, i.codigo as inventario_codigo,
                   i.tipo_item as inventario_tipo, i.unidad_medida as inventario_unidad,
                   tc.nombre as talla_nombre, et.nombre as etapa_nombre,
                   sp.nombre as servicio_nombre, sp.tarifa as servicio_tarifa
            FROM prod_modelo_bom_linea bl
            LEFT JOIN prod_inventario i ON bl.inventario_id = i.id
            LEFT JOIN prod_tallas_catalogo tc ON bl.talla_id = tc.id
            LEFT JOIN prod_servicios_produccion et ON bl.etapa_id = et.id
            LEFT JOIN prod_servicios_produccion sp ON bl.servicio_produccion_id = sp.id
            WHERE bl.id = $1
        """, new_id)

    return row_to_dict(row)


@router.put("/{bom_id}/lineas/{linea_id}")
async def update_bom_linea(bom_id: str, linea_id: str, data: BomLineaUpdate):
    """Actualiza una línea del BOM."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        bl = await conn.fetchrow(
            "SELECT * FROM prod_modelo_bom_linea WHERE id = $1 AND bom_id = $2",
            linea_id, bom_id
        )
        if not bl:
            raise HTTPException(status_code=404, detail="Línea BOM no encontrada")

        inv_id = data.inventario_id if data.inventario_id is not None else bl['inventario_id']
        serv_id = data.servicio_produccion_id if data.servicio_produccion_id is not None else bl.get('servicio_produccion_id')
        tipo = data.tipo_componente if data.tipo_componente is not None else (bl.get('tipo_componente') or 'TELA')
        # Para SERVICIO: limpiar inventario_id; para materiales: limpiar servicio_produccion_id
        if tipo == 'SERVICIO':
            inv_id = None
        else:
            serv_id = None
        talla_id = data.talla_id if data.talla_id is not None else bl.get('talla_id')
        etapa_id = data.etapa_id if data.etapa_id is not None else bl.get('etapa_id')
        cant_base = float(data.cantidad_base) if data.cantidad_base is not None else float(bl['cantidad_base'])
        merma = float(data.merma_pct) if data.merma_pct is not None else float(bl.get('merma_pct') or 0)
        es_opc = data.es_opcional if data.es_opcional is not None else bool(bl.get('es_opcional') or False)
        obs = data.observaciones if data.observaciones is not None else bl.get('observaciones')
        activo = data.activo if data.activo is not None else bl['activo']
        orden = data.orden if data.orden is not None else bl.get('orden', 10)
        costo_manual = float(data.costo_manual) if data.costo_manual is not None else (float(bl['costo_manual']) if bl.get('costo_manual') is not None else None)

        if tipo not in TIPOS_COMPONENTE:
            raise HTTPException(status_code=400, detail=f"tipo_componente inválido. Permitidos: {TIPOS_COMPONENTE}")
        if cant_base <= 0:
            raise HTTPException(status_code=400, detail="cantidad_base debe ser mayor a 0")
        if merma < 0 or merma > 100:
            raise HTTPException(status_code=400, detail="merma_pct debe estar entre 0 y 100")

        cantidad_total = round(cant_base * (1 + merma / 100), 4)

        await conn.execute("""
            UPDATE prod_modelo_bom_linea
            SET inventario_id = $1, servicio_produccion_id = $14, tipo_componente = $2, talla_id = $3, etapa_id = $4,
                cantidad_base = $5, merma_pct = $6, cantidad_total = $7, es_opcional = $8,
                observaciones = $9, activo = $10, orden = $12, costo_manual = $13, updated_at = CURRENT_TIMESTAMP
            WHERE id = $11
        """, inv_id, tipo, talla_id, etapa_id, cant_base, merma, cantidad_total,
            es_opc, obs, activo, linea_id, orden, costo_manual, serv_id)

        row = await conn.fetchrow("""
            SELECT bl.*, i.nombre as inventario_nombre, i.codigo as inventario_codigo,
                   i.tipo_item as inventario_tipo, i.unidad_medida as inventario_unidad,
                   tc.nombre as talla_nombre, et.nombre as etapa_nombre,
                   sp.nombre as servicio_nombre, sp.tarifa as servicio_tarifa
            FROM prod_modelo_bom_linea bl
            LEFT JOIN prod_inventario i ON bl.inventario_id = i.id
            LEFT JOIN prod_tallas_catalogo tc ON bl.talla_id = tc.id
            LEFT JOIN prod_servicios_produccion et ON bl.etapa_id = et.id
            LEFT JOIN prod_servicios_produccion sp ON bl.servicio_produccion_id = sp.id
            WHERE bl.id = $1
        """, linea_id)

    return row_to_dict(row)


@router.delete("/{bom_id}/lineas/{linea_id}")
async def delete_bom_linea(bom_id: str, linea_id: str):
    """Elimina o desactiva una línea del BOM."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        bl = await conn.fetchrow(
            "SELECT * FROM prod_modelo_bom_linea WHERE id = $1 AND bom_id = $2",
            linea_id, bom_id
        )
        if not bl:
            raise HTTPException(status_code=404, detail="Línea BOM no encontrada")

        await conn.execute("DELETE FROM prod_modelo_bom_linea WHERE id = $1", linea_id)
    return {"action": "deleted", "message": "Línea eliminada"}


# ==================== COSTO ESTÁNDAR ====================

@router.get("/{bom_id}/costo-estandar")
async def get_bom_costo_estandar(bom_id: str, cantidad_prendas: int = Query(1, ge=1)):
    """Calcula el costo estándar de un BOM basado en precios actuales de inventario.
    El costo estándar es REFERENCIAL, no reemplaza el costo real de producción."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        cab = await conn.fetchrow("SELECT * FROM prod_bom_cabecera WHERE id = $1", bom_id)
        if not cab:
            raise HTTPException(status_code=404, detail="BOM no encontrado")

        lineas = await conn.fetch("""
            SELECT bl.*, i.nombre as inventario_nombre, i.codigo as inventario_codigo,
                   i.costo_promedio as precio_unitario, i.unidad_medida as inventario_unidad,
                   i.tipo_item as inventario_tipo,
                   sp.nombre as servicio_nombre, sp.tarifa as servicio_tarifa
            FROM prod_modelo_bom_linea bl
            LEFT JOIN prod_inventario i ON bl.inventario_id = i.id
            LEFT JOIN prod_servicios_produccion sp ON bl.servicio_produccion_id = sp.id
            WHERE bl.bom_id = $1 AND bl.activo = true
            ORDER BY bl.tipo_componente, bl.orden
        """, bom_id)

    detalle = []
    total_por_tipo = {}
    total_general = 0.0

    for l in lineas:
        ld = row_to_dict(l)
        costo_manual_val = ld.get('costo_manual')
        tipo = ld.get('tipo_componente') or 'OTRO'
        
        # Para SERVICIO: costo_manual > tarifa del servicio > 0
        if tipo == 'SERVICIO':
            if costo_manual_val is not None:
                precio = float(costo_manual_val)
            else:
                precio = float(ld.get('servicio_tarifa') or 0)
            nombre_display = ld.get('servicio_nombre') or '(servicio)'
            codigo_display = None
        else:
            precio = float(ld.get('precio_unitario') or 0)
            nombre_display = ld.get('inventario_nombre')
            codigo_display = ld.get('inventario_codigo')
        
        cant_total = float(ld.get('cantidad_total') or ld.get('cantidad_base', 0))
        costo_unitario = round(cant_total * precio, 4)
        costo_lote = round(costo_unitario * cantidad_prendas, 2)

        item = {
            "linea_id": ld['id'],
            "inventario_codigo": codigo_display,
            "inventario_nombre": nombre_display,
            "servicio_produccion_id": ld.get('servicio_produccion_id'),
            "tipo_componente": tipo,
            "cantidad_base": float(ld.get('cantidad_base', 0)),
            "merma_pct": float(ld.get('merma_pct') or 0),
            "cantidad_total": cant_total,
            "precio_unitario": precio,
            "costo_manual": float(costo_manual_val) if costo_manual_val is not None else None,
            "costo_por_prenda": costo_unitario,
            "costo_lote": costo_lote,
            "es_opcional": ld.get('es_opcional', False),
        }
        detalle.append(item)

        if tipo not in total_por_tipo:
            total_por_tipo[tipo] = 0.0
        total_por_tipo[tipo] += costo_unitario
        if not item['es_opcional']:
            total_general += costo_unitario

    return {
        "bom_id": bom_id,
        "modelo_id": row_to_dict(cab)['modelo_id'],
        "version": row_to_dict(cab)['version'],
        "estado": row_to_dict(cab)['estado'],
        "cantidad_prendas": cantidad_prendas,
        "costo_estandar_unitario": round(total_general, 4),
        "costo_estandar_lote": round(total_general * cantidad_prendas, 2),
        "costo_por_tipo": {k: round(v, 4) for k, v in total_por_tipo.items()},
        "detalle": detalle,
    }


# ==================== DUPLICAR BOM ====================

@router.post("/{bom_id}/duplicar")
async def duplicar_bom(bom_id: str):
    """Crea una nueva versión del BOM copiando todas las líneas activas."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        cab = await conn.fetchrow("SELECT * FROM prod_bom_cabecera WHERE id = $1", bom_id)
        if not cab:
            raise HTTPException(status_code=404, detail="BOM no encontrado")

        modelo_id = cab['modelo_id']
        max_ver = await conn.fetchval(
            "SELECT COALESCE(MAX(version), 0) FROM prod_bom_cabecera WHERE modelo_id = $1", modelo_id
        )
        new_ver = (max_ver or 0) + 1
        new_cab_id = str(uuid4())
        new_codigo = f"{cab['codigo'].rsplit('-V', 1)[0]}-V{new_ver}" if '-V' in (cab['codigo'] or '') else f"BOM-V{new_ver}"

        await conn.execute("""
            INSERT INTO prod_bom_cabecera (id, modelo_id, codigo, version, estado, observaciones, created_at, updated_at)
            VALUES ($1, $2, $3, $4, 'BORRADOR', $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """, new_cab_id, modelo_id, new_codigo, new_ver,
            f"Duplicado de v{cab['version']}")

        # Copiar líneas activas
        lineas = await conn.fetch(
            "SELECT * FROM prod_modelo_bom_linea WHERE bom_id = $1 AND activo = true", bom_id
        )
        for l in lineas:
            new_linea_id = str(uuid4())
            await conn.execute("""
                INSERT INTO prod_modelo_bom_linea
                    (id, bom_id, modelo_id, inventario_id, servicio_produccion_id, tipo_componente, talla_id, etapa_id,
                     unidad_base, cantidad_base, merma_pct, cantidad_total, es_opcional,
                     observaciones, orden, activo, costo_manual, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
                        $9, $10, $11, $12, $13, $14, $15, true, $16,
                        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """, new_linea_id, new_cab_id, modelo_id, l['inventario_id'],
                l.get('servicio_produccion_id'),
                l.get('tipo_componente') or 'TELA', l.get('talla_id'), l.get('etapa_id'),
                l.get('unidad_base') or 'PRENDA', float(l['cantidad_base']),
                float(l.get('merma_pct') or 0), float(l.get('cantidad_total') or l['cantidad_base']),
                bool(l.get('es_opcional') or False), l.get('observaciones'),
                l.get('orden') or 10,
                float(l['costo_manual']) if l.get('costo_manual') is not None else None)

        row = await conn.fetchrow("""
            SELECT bc.*, m.nombre as modelo_nombre,
                   (SELECT COUNT(*) FROM prod_modelo_bom_linea bl WHERE bl.bom_id = bc.id AND bl.activo = true) as total_lineas
            FROM prod_bom_cabecera bc
            LEFT JOIN prod_modelos m ON bc.modelo_id = m.id
            WHERE bc.id = $1
        """, new_cab_id)

    return row_to_dict(row)


# ==================== EXPLOSIÓN BOM → REQUERIMIENTO MP ====================

class ExplosionBomRequest(BaseModel):
    empresa_id: int = 7
    bom_id: Optional[str] = None  # Si no se pasa, busca el mejor BOM para el modelo de la orden
    regenerar: bool = False  # Si true, borra requerimiento anterior y regenera


@router.post("/explosion/{orden_id}")
async def explosion_bom_requerimiento(orden_id: str, data: ExplosionBomRequest):
    """Explota el BOM de un modelo para generar el requerimiento de MP de una orden.
    Solo genera requerimiento para TELA, AVIO, EMPAQUE (no SERVICIO).
    Lógica de tallas: talla_id=null en BOM → aplica a TODAS las tallas de la orden."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        # 1. Obtener la orden
        orden = await conn.fetchrow(
            "SELECT id, n_corte, modelo_id, tallas, estado_op, empresa_id FROM prod_registros WHERE id = $1",
            orden_id
        )
        if not orden:
            raise HTTPException(status_code=404, detail="Orden no encontrada")
        if orden['estado_op'] == 'CERRADA':
            raise HTTPException(status_code=400, detail="No se puede generar requerimiento para una orden cerrada")

        modelo_id = orden['modelo_id']
        empresa_id = data.empresa_id or orden['empresa_id']

        # 2. Parsear tallas de la orden
        import json
        tallas_raw = json.loads(orden['tallas']) if orden['tallas'] else []
        tallas_orden = []
        total_prendas = 0
        for t in tallas_raw:
            cant = t.get('cantidad', 0)
            tallas_orden.append({
                "talla_id": t.get('talla_id'),
                "talla_nombre": t.get('talla_nombre', t.get('nombre', '?')),
                "cantidad": cant,
            })
            total_prendas += cant

        if total_prendas == 0:
            raise HTTPException(status_code=400, detail="La orden no tiene tallas/cantidades definidas")

        # 3. Encontrar el BOM
        if data.bom_id:
            bom = await conn.fetchrow("SELECT * FROM prod_bom_cabecera WHERE id = $1", data.bom_id)
        else:
            # Buscar mejor BOM: APROBADO primero, luego BORRADOR, versión más reciente
            bom = await conn.fetchrow("""
                SELECT * FROM prod_bom_cabecera
                WHERE modelo_id = $1 AND estado != 'INACTIVO'
                ORDER BY CASE estado WHEN 'APROBADO' THEN 1 WHEN 'BORRADOR' THEN 2 ELSE 3 END, version DESC
                LIMIT 1
            """, modelo_id)

        if not bom:
            raise HTTPException(status_code=404, detail=f"No hay BOM disponible para el modelo de esta orden")

        # 4. Obtener líneas activas del BOM (solo TELA, AVIO, EMPAQUE - NO SERVICIO)
        lineas = await conn.fetch("""
            SELECT bl.*, i.nombre as inv_nombre, i.codigo as inv_codigo,
                   i.stock_actual, i.unidad_medida as inv_unidad, i.costo_promedio
            FROM prod_modelo_bom_linea bl
            LEFT JOIN prod_inventario i ON bl.inventario_id = i.id
            WHERE bl.bom_id = $1 AND bl.activo = true
              AND COALESCE(bl.tipo_componente, 'TELA') IN ('TELA', 'AVIO', 'EMPAQUE', 'OTRO')
            ORDER BY bl.tipo_componente, bl.orden
        """, bom['id'])

        if not lineas:
            raise HTTPException(status_code=400, detail="El BOM no tiene líneas de material activas (TELA/AVIO/EMPAQUE)")

        # 5. Verificar si ya existe requerimiento previo
        existing = await conn.fetchval(
            "SELECT COUNT(*) FROM prod_registro_requerimiento_mp WHERE registro_id = $1", orden_id
        )
        if existing > 0 and not data.regenerar:
            raise HTTPException(
                status_code=409,
                detail=f"Ya existe un requerimiento con {existing} líneas para esta orden. Usa regenerar=true para reemplazar."
            )
        if existing > 0 and data.regenerar:
            await conn.execute("DELETE FROM prod_registro_requerimiento_mp WHERE registro_id = $1", orden_id)

        # 6. Calcular requerimiento por cada línea del BOM
        requerimiento = []
        for linea in lineas:
            l = row_to_dict(linea)
            cant_total_bom = float(l.get('cantidad_total') or l.get('cantidad_base', 0))
            tipo = l.get('tipo_componente') or 'TELA'
            inv_nombre = l.get('inv_nombre') or '(sin referencia)'
            inv_unidad = l.get('inv_unidad') or ''
            stock = float(l.get('stock_actual') or 0)
            costo_prom = float(l.get('costo_promedio') or 0)

            if l.get('talla_id'):
                # Línea aplica a talla específica
                talla_match = next((t for t in tallas_orden if t['talla_id'] == l['talla_id']), None)
                if not talla_match:
                    continue  # Talla no existe en la orden, skip
                cant_req = round(cant_total_bom * talla_match['cantidad'], 4)
                talla_id = l['talla_id']
            else:
                # Línea aplica a TODAS las tallas → multiplicar por total
                cant_req = round(cant_total_bom * total_prendas, 4)
                talla_id = None

            if cant_req <= 0:
                continue

            req_id = str(uuid4())
            await conn.execute("""
                INSERT INTO prod_registro_requerimiento_mp
                    (id, registro_id, item_id, talla_id, cantidad_requerida,
                     cantidad_reservada, cantidad_consumida, estado,
                     bom_id, bom_linea_id, tipo_componente, unidad_medida,
                     inventario_nombre, merma_pct, empresa_id, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5,
                        0, 0, 'PENDIENTE',
                        $6, $7, $8, $9,
                        $10, $11, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """, req_id, orden_id, l['inventario_id'], talla_id, cant_req,
                bom['id'], l['id'], tipo, inv_unidad,
                inv_nombre, float(l.get('merma_pct') or 0), empresa_id)

            requerimiento.append({
                "id": req_id,
                "item_id": l['inventario_id'],
                "inventario_nombre": inv_nombre,
                "inventario_codigo": l.get('inv_codigo'),
                "tipo_componente": tipo,
                "unidad_medida": inv_unidad,
                "talla_id": talla_id,
                "cantidad_base_bom": float(l.get('cantidad_base', 0)),
                "merma_pct": float(l.get('merma_pct') or 0),
                "cantidad_total_bom": cant_total_bom,
                "prendas_aplicadas": talla_match['cantidad'] if l.get('talla_id') and 'talla_match' in dir() else total_prendas,
                "cantidad_requerida": cant_req,
                "stock_actual": stock,
                "deficit": max(0, cant_req - stock),
                "costo_estimado": round(cant_req * costo_prom, 2),
            })

        # 7. Servicios como referencia (no generan requerimiento)
        servicios_ref = await conn.fetch("""
            SELECT bl.*, sp.nombre as serv_nombre, sp.tarifa as serv_tarifa,
                   i.nombre as inv_nombre, i.costo_promedio
            FROM prod_modelo_bom_linea bl
            LEFT JOIN prod_servicios_produccion sp ON bl.servicio_produccion_id = sp.id
            LEFT JOIN prod_inventario i ON bl.inventario_id = i.id
            WHERE bl.bom_id = $1 AND bl.activo = true AND bl.tipo_componente = 'SERVICIO'
        """, bom['id'])
        servicios_estandar = []
        for s in servicios_ref:
            sd = row_to_dict(s)
            costo_manual_val = sd.get('costo_manual')
            serv_tarifa = float(sd.get('serv_tarifa') or 0)
            if costo_manual_val is not None:
                costo_unit = float(costo_manual_val)
            else:
                costo_unit = serv_tarifa
            nombre = sd.get('serv_nombre') or sd.get('inv_nombre') or '(servicio)'
            servicios_estandar.append({
                "servicio_nombre": nombre,
                "servicio_produccion_id": sd.get('servicio_produccion_id'),
                "cantidad_base": float(sd.get('cantidad_base', 0)),
                "costo_unitario_ref": costo_unit,
                "costo_total_ref": round(float(sd.get('cantidad_base', 0)) * costo_unit * total_prendas, 2),
                "costo_manual": float(costo_manual_val) if costo_manual_val is not None else None,
                "nota": "Solo referencial. El costo real se registra en servicios de producción.",
            })

    total_costo_mp = sum(r['costo_estimado'] for r in requerimiento)
    total_costo_serv = sum(s['costo_total_ref'] for s in servicios_estandar)

    return {
        "orden_id": orden_id,
        "n_corte": orden['n_corte'],
        "bom_id": bom['id'],
        "bom_codigo": bom['codigo'],
        "bom_version": bom['version'],
        "bom_estado": bom['estado'],
        "total_prendas": total_prendas,
        "tallas": tallas_orden,
        "requerimiento_mp": requerimiento,
        "servicios_estandar": servicios_estandar,
        "resumen": {
            "total_lineas_mp": len(requerimiento),
            "total_costo_mp_estimado": round(total_costo_mp, 2),
            "total_costo_servicios_ref": round(total_costo_serv, 2),
            "total_costo_estimado": round(total_costo_mp + total_costo_serv, 2),
            "items_con_deficit": sum(1 for r in requerimiento if r['deficit'] > 0),
        },
    }


@router.get("/requerimiento/{orden_id}")
async def get_requerimiento_orden(orden_id: str):
    """Obtiene el requerimiento MP generado por explosión BOM para una orden."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        orden = await conn.fetchrow(
            "SELECT id, n_corte, modelo_id, estado_op FROM prod_registros WHERE id = $1", orden_id
        )
        if not orden:
            raise HTTPException(status_code=404, detail="Orden no encontrada")

        rows = await conn.fetch("""
            SELECT r.*, i.stock_actual, i.costo_promedio, i.codigo as inv_codigo,
                   tc.nombre as talla_nombre
            FROM prod_registro_requerimiento_mp r
            LEFT JOIN prod_inventario i ON r.item_id = i.id
            LEFT JOIN prod_tallas_catalogo tc ON r.talla_id = tc.id
            WHERE r.registro_id = $1
            ORDER BY r.tipo_componente, r.inventario_nombre
        """, orden_id)

        items = []
        for r in rows:
            d = row_to_dict(r)
            stock = float(d.get('stock_actual') or 0)
            cant_req = float(d.get('cantidad_requerida') or 0)
            items.append({
                **d,
                "stock_actual": stock,
                "deficit": max(0, cant_req - stock),
                "costo_estimado": round(cant_req * float(d.get('costo_promedio') or 0), 2),
            })

    return {
        "orden_id": orden_id,
        "n_corte": orden['n_corte'],
        "total_lineas": len(items),
        "items": items,
    }
