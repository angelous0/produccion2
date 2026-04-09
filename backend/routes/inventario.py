"""
Router: Inventario de Items
CRUD para prod_inventario (MP, AVIO, PT, SERVICIO)
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
import uuid
from datetime import datetime

router = APIRouter(prefix="/api", tags=["inventario"])

# Import shared dependencies
import sys
sys.path.insert(0, '/app/backend')
from db import get_pool
from auth import get_current_user
from helpers import row_to_dict


# ==================== PYDANTIC MODELS ====================

class ItemBase(BaseModel):
    codigo: str
    nombre: str
    descripcion: str = ""
    tipo_item: str = "MP"  # MP, AVIO, SERVICIO, PT
    categoria: str = "Otros"  # Legacy, keep for backwards compat
    unidad_medida: str = "unidad"
    stock_minimo: int = 0
    control_por_rollos: bool = False


class ItemCreate(ItemBase):
    empresa_id: int = 7


class ItemUpdate(BaseModel):
    codigo: Optional[str] = None
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    tipo_item: Optional[str] = None
    categoria: Optional[str] = None
    unidad_medida: Optional[str] = None
    stock_minimo: Optional[int] = None
    control_por_rollos: Optional[bool] = None


TIPOS_ITEM_VALIDOS = ['MP', 'AVIO', 'SERVICIO', 'PT']


# ==================== ENDPOINTS ====================

@router.get("/inventario")
async def get_inventario(
    empresa_id: int = Query(7),
    tipo_item: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Lista items de inventario con filtros"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        query = """
            SELECT i.*, 
                COALESCE((
                    SELECT SUM(rl.cantidad_reservada - rl.cantidad_liberada)
                    FROM prod_inventario_reservas_linea rl
                    JOIN prod_inventario_reservas r ON rl.reserva_id = r.id
                    WHERE rl.item_id = i.id AND r.estado = 'ACTIVA'
                ), 0) as total_reservado
            FROM prod_inventario i
            WHERE i.empresa_id = $1
        """
        params = [empresa_id]
        
        if tipo_item:
            params.append(tipo_item)
            query += f" AND i.tipo_item = ${len(params)}"
        
        query += " ORDER BY i.tipo_item, i.nombre"
        
        rows = await conn.fetch(query, *params)
        
        result = []
        for r in rows:
            d = row_to_dict(r)
            d['stock_actual'] = float(d.get('stock_actual') or 0)
            d['total_reservado'] = float(d.get('total_reservado') or 0)
            d['stock_disponible'] = max(0, d['stock_actual'] - d['total_reservado'])
            result.append(d)
        
        return result


@router.get("/inventario/{item_id}")
async def get_item(
    item_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Obtiene detalle de un item con lotes y rollos"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        item = await conn.fetchrow("SELECT * FROM prod_inventario WHERE id = $1", item_id)
        if not item:
            raise HTTPException(status_code=404, detail="Item no encontrado")
        
        d = row_to_dict(item)
        d['stock_actual'] = float(d.get('stock_actual') or 0)
        
        # Lotes disponibles (FIFO) con estado facturación
        ingresos = await conn.fetch("""
            SELECT i.*,
                COALESCE((
                    SELECT SUM(fim.cantidad_aplicada) 
                    FROM finanzas2.cont_factura_ingreso_mp fim 
                    WHERE fim.ingreso_id = i.id
                ), 0) as qty_facturada
            FROM prod_inventario_ingresos i
            WHERE i.item_id = $1 AND i.cantidad_disponible > 0 
            ORDER BY i.fecha ASC
        """, item_id)
        lotes = []
        for ing in ingresos:
            ld = row_to_dict(ing)
            qty_rec = float(ld.get('cantidad') or 0)
            qty_fac = float(ld.get('qty_facturada') or 0)
            ld['qty_facturada'] = round(qty_fac, 4)
            ld['qty_pendiente_factura'] = round(max(0, qty_rec - qty_fac), 4)
            ld['estado_facturacion'] = (
                'COMPLETO' if qty_rec > 0 and (qty_rec - qty_fac) <= 0 else
                'PARCIAL' if qty_fac > 0 else
                'PENDIENTE'
            )
            lotes.append(ld)
        d['lotes'] = lotes
        
        # Rollos si control_por_rollos
        if d.get('control_por_rollos'):
            rollos = await conn.fetch("""
                SELECT * FROM prod_inventario_rollos 
                WHERE item_id = $1 AND estado = 'ACTIVO' AND metros_saldo > 0
                ORDER BY created_at ASC
            """, item_id)
            d['rollos'] = [row_to_dict(r) for r in rollos]
        
        # Reservas activas
        total_reservado = await conn.fetchval("""
            SELECT COALESCE(SUM(rl.cantidad_reservada - rl.cantidad_liberada), 0)
            FROM prod_inventario_reservas_linea rl
            JOIN prod_inventario_reservas r ON rl.reserva_id = r.id
            WHERE rl.item_id = $1 AND r.estado = 'ACTIVA'
        """, item_id)
        d['total_reservado'] = float(total_reservado or 0)
        d['stock_disponible'] = max(0, d['stock_actual'] - d['total_reservado'])
        
        return d


@router.post("/inventario")
async def create_item(
    data: ItemCreate,
    current_user: dict = Depends(get_current_user)
):
    """Crea un nuevo item de inventario"""
    if data.tipo_item not in TIPOS_ITEM_VALIDOS:
        raise HTTPException(status_code=400, detail=f"tipo_item debe ser uno de: {TIPOS_ITEM_VALIDOS}")
    
    # Servicios no tienen control por rollos ni stock físico
    if data.tipo_item == 'SERVICIO':
        data.control_por_rollos = False
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Verificar código único
        existing = await conn.fetchrow(
            "SELECT id FROM prod_inventario WHERE codigo = $1 AND empresa_id = $2",
            data.codigo, data.empresa_id
        )
        if existing:
            raise HTTPException(status_code=400, detail="El código ya existe")
        
        item_id = str(uuid.uuid4())
        await conn.execute("""
            INSERT INTO prod_inventario 
            (id, empresa_id, codigo, nombre, descripcion, tipo_item, categoria, 
             unidad_medida, stock_minimo, stock_actual, control_por_rollos, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, $10, NOW())
        """, item_id, data.empresa_id, data.codigo, data.nombre, data.descripcion,
             data.tipo_item, data.categoria, data.unidad_medida, data.stock_minimo,
             data.control_por_rollos)
        
        return {"id": item_id, **data.model_dump()}


@router.put("/inventario/{item_id}")
async def update_item(
    item_id: str,
    data: ItemUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Actualiza un item existente"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT * FROM prod_inventario WHERE id = $1", item_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Item no encontrado")
        
        # Build dynamic update
        updates = []
        params = []
        idx = 1
        
        for field in ['codigo', 'nombre', 'descripcion', 'tipo_item', 'categoria',
                      'unidad_medida', 'stock_minimo', 'control_por_rollos']:
            val = getattr(data, field, None)
            if val is not None:
                # Validate tipo_item
                if field == 'tipo_item' and val not in TIPOS_ITEM_VALIDOS:
                    raise HTTPException(status_code=400, detail=f"tipo_item debe ser uno de: {TIPOS_ITEM_VALIDOS}")
                updates.append(f"{field} = ${idx}")
                params.append(val)
                idx += 1
        
        if not updates:
            return row_to_dict(existing)
        
        params.append(item_id)
        await conn.execute(
            f"UPDATE prod_inventario SET {', '.join(updates)} WHERE id = ${idx}",
            *params
        )
        
        updated = await conn.fetchrow("SELECT * FROM prod_inventario WHERE id = $1", item_id)
        return row_to_dict(updated)


@router.delete("/inventario/{item_id}")
async def delete_item(
    item_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Elimina un item (validando que no tenga movimientos)"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        item = await conn.fetchrow("SELECT * FROM prod_inventario WHERE id = $1", item_id)
        if not item:
            raise HTTPException(status_code=404, detail="Item no encontrado")
        
        # Check for related records
        ingresos = await conn.fetchval(
            "SELECT COUNT(*) FROM prod_inventario_ingresos WHERE item_id = $1", item_id
        )
        if ingresos > 0:
            raise HTTPException(status_code=400, detail=f"No se puede eliminar: tiene {ingresos} ingreso(s)")
        
        salidas = await conn.fetchval(
            "SELECT COUNT(*) FROM prod_inventario_salidas WHERE item_id = $1", item_id
        )
        if salidas > 0:
            raise HTTPException(status_code=400, detail=f"No se puede eliminar: tiene {salidas} salida(s)")
        
        consumos = await conn.fetchval(
            "SELECT COUNT(*) FROM prod_consumo_mp WHERE item_id = $1", item_id
        )
        if consumos > 0:
            raise HTTPException(status_code=400, detail=f"No se puede eliminar: tiene {consumos} consumo(s)")
        
        await conn.execute("DELETE FROM prod_inventario WHERE id = $1", item_id)
        return {"message": "Item eliminado"}


@router.get("/inventario/{item_id}/disponibilidad")
async def get_disponibilidad(
    item_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Obtiene disponibilidad real (stock - reservas)"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        item = await conn.fetchrow("SELECT * FROM prod_inventario WHERE id = $1", item_id)
        if not item:
            raise HTTPException(status_code=404, detail="Item no encontrado")
        
        stock_actual = float(item['stock_actual'] or 0)
        
        total_reservado = await conn.fetchval("""
            SELECT COALESCE(SUM(rl.cantidad_reservada - rl.cantidad_liberada), 0)
            FROM prod_inventario_reservas_linea rl
            JOIN prod_inventario_reservas r ON rl.reserva_id = r.id
            WHERE rl.item_id = $1 AND r.estado = 'ACTIVA'
        """, item_id)
        total_reservado = float(total_reservado or 0)
        
        return {
            "item_id": item_id,
            "codigo": item['codigo'],
            "nombre": item['nombre'],
            "tipo_item": item.get('tipo_item', 'MP'),
            "stock_actual": stock_actual,
            "total_reservado": total_reservado,
            "disponible": max(0, stock_actual - total_reservado),
            "control_por_rollos": item['control_por_rollos']
        }


@router.get("/inventario-categorias")
async def get_categorias():
    """Lista categorías legacy (para backwards compat)"""
    return {"categorias": ["Telas", "Avios", "Otros"]}


@router.get("/inventario-tipos")
async def get_tipos_item():
    """Lista tipos de item válidos"""
    return {
        "tipos": [
            {"codigo": "MP", "nombre": "Materia Prima", "descripcion": "Telas y materiales principales"},
            {"codigo": "AVIO", "nombre": "Avío", "descripcion": "Botones, cierres, etiquetas, etc."},
            {"codigo": "SERVICIO", "nombre": "Servicio", "descripcion": "Servicios externos (no genera stock)"},
            {"codigo": "PT", "nombre": "Producto Terminado", "descripcion": "Prendas terminadas"}
        ]
    }
