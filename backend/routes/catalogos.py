"""Router for catalog CRUD endpoints (marcas, tipos, entalles, telas, hilos, tallas, colores, hilos-especificos, rutas, servicios, personas, lineas-negocio)."""
import json
from fastapi import APIRouter, HTTPException, Depends
from db import get_pool
from helpers import row_to_dict, parse_jsonb
from auth_utils import get_current_user, require_permiso as require_permission
from models import (
    MarcaCreate, Marca, TipoCreate, Tipo, EntalleCreate, Entalle,
    TelaCreate, Tela, HiloCreate, Hilo, TallaCreate, Talla,
    ColorGeneralCreate, ColorGeneral, ColorCreate, Color,
    HiloEspecificoCreate, HiloEspecifico,
    RutaProduccionCreate, RutaProduccion,
    ServicioCreate, Servicio, PersonaCreate, Persona,
)
from pydantic import BaseModel
from typing import List

router = APIRouter(prefix="/api")

class ReorderItem(BaseModel):
    id: str
    orden: int

class ReorderRequest(BaseModel):
    items: List[ReorderItem]

@router.get("/marcas")
async def get_marcas():
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM prod_marcas ORDER BY orden ASC, created_at DESC")
        return [row_to_dict(r) for r in rows]

@router.post("/marcas")
async def create_marca(input: MarcaCreate):
    marca = Marca(**input.model_dump())
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Auto-asignar orden si es 0
        if marca.orden == 0:
            max_orden = await conn.fetchval("SELECT COALESCE(MAX(orden), 0) FROM prod_marcas")
            marca.orden = max_orden + 1
        await conn.execute(
            "INSERT INTO prod_marcas (id, nombre, orden, created_at) VALUES ($1, $2, $3, $4)",
            marca.id, marca.nombre, marca.orden, marca.created_at.replace(tzinfo=None)
        )
    return marca

@router.put("/marcas/{marca_id}")
async def update_marca(marca_id: str, input: MarcaCreate):
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.fetchrow("SELECT * FROM prod_marcas WHERE id = $1", marca_id)
        if not result:
            raise HTTPException(status_code=404, detail="Marca no encontrada")
        await conn.execute("UPDATE prod_marcas SET nombre = $1, orden = $2 WHERE id = $3", input.nombre, input.orden, marca_id)
        return {**row_to_dict(result), "nombre": input.nombre, "orden": input.orden}

@router.delete("/marcas/{marca_id}")
async def delete_marca(marca_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute("DELETE FROM prod_marcas WHERE id = $1", marca_id)
        if result == "DELETE 0":
            raise HTTPException(status_code=404, detail="Marca no encontrada")
        return {"message": "Marca eliminada"}

# ==================== ENDPOINTS TIPO ====================

@router.get("/tipos")
async def get_tipos(marca_id: str = None):
    pool = await get_pool()
    async with pool.acquire() as conn:
        if marca_id:
            rows = await conn.fetch("SELECT * FROM prod_tipos WHERE marca_ids ? $1 ORDER BY orden ASC, created_at DESC", marca_id)
        else:
            rows = await conn.fetch("SELECT * FROM prod_tipos ORDER BY orden ASC, created_at DESC")
        result = []
        for r in rows:
            d = row_to_dict(r)
            d['marca_ids'] = parse_jsonb(d.get('marca_ids'))
            result.append(d)
        return result

@router.post("/tipos")
async def create_tipo(input: TipoCreate):
    tipo = Tipo(**input.model_dump())
    pool = await get_pool()
    async with pool.acquire() as conn:
        if tipo.orden == 0:
            max_orden = await conn.fetchval("SELECT COALESCE(MAX(orden), 0) FROM prod_tipos")
            tipo.orden = max_orden + 1
        await conn.execute(
            "INSERT INTO prod_tipos (id, nombre, marca_ids, orden, created_at) VALUES ($1, $2, $3, $4, $5)",
            tipo.id, tipo.nombre, json.dumps(tipo.marca_ids), tipo.orden, tipo.created_at.replace(tzinfo=None)
        )
    return tipo

@router.put("/tipos/{tipo_id}")
async def update_tipo(tipo_id: str, input: TipoCreate):
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.fetchrow("SELECT * FROM prod_tipos WHERE id = $1", tipo_id)
        if not result:
            raise HTTPException(status_code=404, detail="Tipo no encontrado")
        await conn.execute("UPDATE prod_tipos SET nombre = $1, marca_ids = $2, orden = $3 WHERE id = $4", 
                          input.nombre, json.dumps(input.marca_ids), input.orden, tipo_id)
        return {**row_to_dict(result), "nombre": input.nombre, "marca_ids": input.marca_ids, "orden": input.orden}

@router.delete("/tipos/{tipo_id}")
async def delete_tipo(tipo_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM prod_tipos WHERE id = $1", tipo_id)
        return {"message": "Tipo eliminado"}

# ==================== ENDPOINTS ENTALLE ====================

@router.get("/entalles")
async def get_entalles(tipo_id: str = None):
    pool = await get_pool()
    async with pool.acquire() as conn:
        if tipo_id:
            rows = await conn.fetch("SELECT * FROM prod_entalles WHERE tipo_ids ? $1 ORDER BY orden ASC, created_at DESC", tipo_id)
        else:
            rows = await conn.fetch("SELECT * FROM prod_entalles ORDER BY orden ASC, created_at DESC")
        result = []
        for r in rows:
            d = row_to_dict(r)
            d['tipo_ids'] = parse_jsonb(d.get('tipo_ids'))
            result.append(d)
        return result

@router.post("/entalles")
async def create_entalle(input: EntalleCreate):
    entalle = Entalle(**input.model_dump())
    pool = await get_pool()
    async with pool.acquire() as conn:
        if entalle.orden == 0:
            max_orden = await conn.fetchval("SELECT COALESCE(MAX(orden), 0) FROM prod_entalles")
            entalle.orden = max_orden + 1
        await conn.execute(
            "INSERT INTO prod_entalles (id, nombre, tipo_ids, orden, created_at) VALUES ($1, $2, $3, $4, $5)",
            entalle.id, entalle.nombre, json.dumps(entalle.tipo_ids), entalle.orden, entalle.created_at.replace(tzinfo=None)
        )
    return entalle

@router.put("/entalles/{entalle_id}")
async def update_entalle(entalle_id: str, input: EntalleCreate):
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.fetchrow("SELECT * FROM prod_entalles WHERE id = $1", entalle_id)
        if not result:
            raise HTTPException(status_code=404, detail="Entalle no encontrado")
        await conn.execute("UPDATE prod_entalles SET nombre = $1, tipo_ids = $2, orden = $3 WHERE id = $4",
                          input.nombre, json.dumps(input.tipo_ids), input.orden, entalle_id)
        return {**row_to_dict(result), "nombre": input.nombre, "tipo_ids": input.tipo_ids, "orden": input.orden}

@router.delete("/entalles/{entalle_id}")
async def delete_entalle(entalle_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM prod_entalles WHERE id = $1", entalle_id)
        return {"message": "Entalle eliminado"}

# ==================== ENDPOINTS TELA ====================

@router.get("/telas")
async def get_telas(entalle_id: str = None):
    pool = await get_pool()
    async with pool.acquire() as conn:
        if entalle_id:
            rows = await conn.fetch("SELECT * FROM prod_telas WHERE entalle_ids ? $1 ORDER BY orden ASC, created_at DESC", entalle_id)
        else:
            rows = await conn.fetch("SELECT * FROM prod_telas ORDER BY orden ASC, created_at DESC")
        result = []
        for r in rows:
            d = row_to_dict(r)
            d['entalle_ids'] = parse_jsonb(d.get('entalle_ids'))
            result.append(d)
        return result

@router.post("/telas")
async def create_tela(input: TelaCreate):
    tela = Tela(**input.model_dump())
    pool = await get_pool()
    async with pool.acquire() as conn:
        if tela.orden == 0:
            max_orden = await conn.fetchval("SELECT COALESCE(MAX(orden), 0) FROM prod_telas")
            tela.orden = max_orden + 1
        await conn.execute(
            "INSERT INTO prod_telas (id, nombre, entalle_ids, orden, created_at) VALUES ($1, $2, $3, $4, $5)",
            tela.id, tela.nombre, json.dumps(tela.entalle_ids), tela.orden, tela.created_at.replace(tzinfo=None)
        )
    return tela

@router.put("/telas/{tela_id}")
async def update_tela(tela_id: str, input: TelaCreate):
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.fetchrow("SELECT * FROM prod_telas WHERE id = $1", tela_id)
        if not result:
            raise HTTPException(status_code=404, detail="Tela no encontrada")
        await conn.execute("UPDATE prod_telas SET nombre = $1, entalle_ids = $2, orden = $3 WHERE id = $4",
                          input.nombre, json.dumps(input.entalle_ids), input.orden, tela_id)
        return {**row_to_dict(result), "nombre": input.nombre, "entalle_ids": input.entalle_ids, "orden": input.orden}

@router.delete("/telas/{tela_id}")
async def delete_tela(tela_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM prod_telas WHERE id = $1", tela_id)
        return {"message": "Tela eliminada"}

# ==================== ENDPOINTS HILO ====================

@router.get("/hilos")
async def get_hilos(tela_id: str = None):
    pool = await get_pool()
    async with pool.acquire() as conn:
        if tela_id:
            rows = await conn.fetch("SELECT * FROM prod_hilos WHERE tela_ids ? $1 ORDER BY orden ASC, created_at DESC", tela_id)
        else:
            rows = await conn.fetch("SELECT * FROM prod_hilos ORDER BY orden ASC, created_at DESC")
        result = []
        for r in rows:
            d = row_to_dict(r)
            d['tela_ids'] = parse_jsonb(d.get('tela_ids'))
            result.append(d)
        return result

@router.post("/hilos")
async def create_hilo(input: HiloCreate):
    hilo = Hilo(**input.model_dump())
    pool = await get_pool()
    async with pool.acquire() as conn:
        if hilo.orden == 0:
            max_orden = await conn.fetchval("SELECT COALESCE(MAX(orden), 0) FROM prod_hilos")
            hilo.orden = max_orden + 1
        await conn.execute(
            "INSERT INTO prod_hilos (id, nombre, tela_ids, orden, created_at) VALUES ($1, $2, $3, $4, $5)",
            hilo.id, hilo.nombre, json.dumps(hilo.tela_ids), hilo.orden, hilo.created_at.replace(tzinfo=None)
        )
    return hilo

@router.put("/hilos/{hilo_id}")
async def update_hilo(hilo_id: str, input: HiloCreate):
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.fetchrow("SELECT * FROM prod_hilos WHERE id = $1", hilo_id)
        if not result:
            raise HTTPException(status_code=404, detail="Hilo no encontrado")
        await conn.execute("UPDATE prod_hilos SET nombre = $1, tela_ids = $2, orden = $3 WHERE id = $4",
                          input.nombre, json.dumps(input.tela_ids), input.orden, hilo_id)
        return {**row_to_dict(result), "nombre": input.nombre, "tela_ids": input.tela_ids, "orden": input.orden}

@router.delete("/hilos/{hilo_id}")
async def delete_hilo(hilo_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM prod_hilos WHERE id = $1", hilo_id)
        return {"message": "Hilo eliminado"}

# ==================== ENDPOINTS TALLA CATALOGO ====================

@router.get("/tallas-catalogo")
async def get_tallas_catalogo():
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM prod_tallas_catalogo ORDER BY orden ASC")
        return [row_to_dict(r) for r in rows]

@router.post("/tallas-catalogo")
async def create_talla_catalogo(input: TallaCreate):
    talla = Talla(**input.model_dump())
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO prod_tallas_catalogo (id, nombre, orden, created_at) VALUES ($1, $2, $3, $4)",
            talla.id, talla.nombre, talla.orden, talla.created_at.replace(tzinfo=None)
        )
    return talla

@router.put("/tallas-catalogo/{talla_id}")
async def update_talla_catalogo(talla_id: str, input: TallaCreate):
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.fetchrow("SELECT * FROM prod_tallas_catalogo WHERE id = $1", talla_id)
        if not result:
            raise HTTPException(status_code=404, detail="Talla no encontrada")
        await conn.execute("UPDATE prod_tallas_catalogo SET nombre = $1, orden = $2 WHERE id = $3",
                          input.nombre, input.orden, talla_id)
        return {**row_to_dict(result), "nombre": input.nombre, "orden": input.orden}

@router.delete("/tallas-catalogo/{talla_id}")
async def delete_talla_catalogo(talla_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM prod_tallas_catalogo WHERE id = $1", talla_id)
        return {"message": "Talla eliminada"}

# ==================== ENDPOINTS COLORES GENERALES ====================

@router.get("/colores-generales")
async def get_colores_generales():
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM prod_colores_generales ORDER BY orden ASC, nombre ASC")
        return [row_to_dict(r) for r in rows]

@router.post("/colores-generales")
async def create_color_general(input: ColorGeneralCreate):
    color_general = ColorGeneral(**input.model_dump())
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Verificar que no exista
        existing = await conn.fetchrow("SELECT id FROM prod_colores_generales WHERE LOWER(nombre) = LOWER($1)", input.nombre)
        if existing:
            raise HTTPException(status_code=400, detail="Ya existe un color general con ese nombre")
        if color_general.orden == 0:
            max_orden = await conn.fetchval("SELECT COALESCE(MAX(orden), 0) FROM prod_colores_generales")
            color_general.orden = max_orden + 1
        await conn.execute(
            "INSERT INTO prod_colores_generales (id, nombre, orden, created_at) VALUES ($1, $2, $3, $4)",
            color_general.id, color_general.nombre, color_general.orden, color_general.created_at.replace(tzinfo=None)
        )
    return color_general

@router.put("/colores-generales/{color_general_id}")
async def update_color_general(color_general_id: str, input: ColorGeneralCreate):
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.fetchrow("SELECT * FROM prod_colores_generales WHERE id = $1", color_general_id)
        if not result:
            raise HTTPException(status_code=404, detail="Color general no encontrado")
        # Verificar que no exista otro con el mismo nombre
        existing = await conn.fetchrow("SELECT id FROM prod_colores_generales WHERE LOWER(nombre) = LOWER($1) AND id != $2", input.nombre, color_general_id)
        if existing:
            raise HTTPException(status_code=400, detail="Ya existe un color general con ese nombre")
        await conn.execute("UPDATE prod_colores_generales SET nombre = $1, orden = $2 WHERE id = $3", input.nombre, input.orden, color_general_id)
        return {**row_to_dict(result), "nombre": input.nombre, "orden": input.orden}

@router.delete("/colores-generales/{color_general_id}")
async def delete_color_general(color_general_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Verificar si hay colores usando este color general
        count = await conn.fetchval("SELECT COUNT(*) FROM prod_colores_catalogo WHERE color_general_id = $1", color_general_id)
        if count > 0:
            raise HTTPException(status_code=400, detail=f"No se puede eliminar: {count} color(es) usan este color general")
        await conn.execute("DELETE FROM prod_colores_generales WHERE id = $1", color_general_id)
        return {"message": "Color general eliminado"}

# ==================== ENDPOINTS COLOR CATALOGO ====================

@router.get("/colores-catalogo")
async def get_colores_catalogo():
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM prod_colores_catalogo ORDER BY orden ASC, nombre ASC")
        result = []
        for r in rows:
            d = row_to_dict(r)
            # Obtener nombre del color general
            if d.get('color_general_id'):
                cg = await conn.fetchrow("SELECT nombre FROM prod_colores_generales WHERE id = $1", d['color_general_id'])
                d['color_general_nombre'] = cg['nombre'] if cg else None
            else:
                d['color_general_nombre'] = None
            result.append(d)
        return result

@router.post("/colores-catalogo")
async def create_color_catalogo(input: ColorCreate):
    color = Color(**input.model_dump())
    pool = await get_pool()
    async with pool.acquire() as conn:
        if color.orden == 0:
            max_orden = await conn.fetchval("SELECT COALESCE(MAX(orden), 0) FROM prod_colores_catalogo")
            color.orden = max_orden + 1
        await conn.execute(
            "INSERT INTO prod_colores_catalogo (id, nombre, codigo_hex, color_general_id, orden, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
            color.id, color.nombre, color.codigo_hex, color.color_general_id, color.orden, color.created_at.replace(tzinfo=None)
        )
    return color

@router.put("/colores-catalogo/{color_id}")
async def update_color_catalogo(color_id: str, input: ColorCreate):
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.fetchrow("SELECT * FROM prod_colores_catalogo WHERE id = $1", color_id)
        if not result:
            raise HTTPException(status_code=404, detail="Color no encontrado")
        await conn.execute("UPDATE prod_colores_catalogo SET nombre = $1, codigo_hex = $2, color_general_id = $3, orden = $4 WHERE id = $5",
                          input.nombre, input.codigo_hex, input.color_general_id, input.orden, color_id)
        return {**row_to_dict(result), "nombre": input.nombre, "codigo_hex": input.codigo_hex, "color_general_id": input.color_general_id, "orden": input.orden}

@router.delete("/colores-catalogo/{color_id}")
async def delete_color_catalogo(color_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM prod_colores_catalogo WHERE id = $1", color_id)
        return {"message": "Color eliminado"}

# ==================== REORDENAMIENTO MODELO ↔ TALLAS ====================

@router.put("/modelos/{modelo_id}/tallas/reorder")
async def reorder_modelo_tallas(modelo_id: str, request: ReorderRequest, current_user: dict = Depends(require_permission("modelos", "editar"))):
    """Reordena tallas de un modelo. Se valida que cada id pertenezca al modelo."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        # validar pertenencia
        ids = [it.id for it in request.items]
        if not ids:
            return {"message": "Sin cambios", "items_updated": 0}

        rows = await conn.fetch(
            "SELECT id FROM prod_modelo_tallas WHERE modelo_id=$1 AND id = ANY($2::varchar[])",
            modelo_id,
            ids,
        )
        found = {r['id'] for r in rows}
        missing = [i for i in ids if i not in found]
        if missing:
            raise HTTPException(status_code=400, detail="Hay tallas que no pertenecen a este modelo")

        for item in request.items:
            await conn.execute(
                "UPDATE prod_modelo_tallas SET orden=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2",
                int(item.orden),
                item.id,
            )

    return {"message": "Orden actualizado", "items_updated": len(request.items)}


@router.delete("/modelos/{modelo_id}/tallas/{rel_id}/hard")
async def hard_delete_modelo_talla(modelo_id: str, rel_id: str, current_user: dict = Depends(require_permission("modelos", "editar"))):
    """Elimina físicamente la relación modelo-talla SOLO si no tiene vinculaciones (por ahora: BOM)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rel = await conn.fetchrow("SELECT * FROM prod_modelo_tallas WHERE id=$1 AND modelo_id=$2", rel_id, modelo_id)
        if not rel:
            raise HTTPException(status_code=404, detail="Relación modelo-talla no encontrada")

        # Vinculación: BOM por talla
        used = await conn.fetchval(
            "SELECT COUNT(*) FROM prod_modelo_bom_linea WHERE modelo_id=$1 AND talla_id=$2",
            modelo_id,
            rel.get('talla_id'),
        )
        if used and int(used) > 0:
            raise HTTPException(status_code=400, detail="No se puede borrar: hay líneas BOM vinculadas a esta talla")

        await conn.execute("DELETE FROM prod_modelo_tallas WHERE id=$1", rel_id)

    return {"message": "Talla eliminada"}

 

@router.put("/reorder/{tabla}")
async def reorder_items(tabla: str, request: ReorderRequest):
    """Endpoint genérico para reordenar items de cualquier tabla"""
    tablas_permitidas = {
        "marcas": "prod_marcas",
        "tipos": "prod_tipos",
        "entalles": "prod_entalles",
        "telas": "prod_telas",
        "hilos": "prod_hilos",
        "tallas-catalogo": "prod_tallas_catalogo",
        "colores-generales": "prod_colores_generales",
        "colores-catalogo": "prod_colores_catalogo",
        "hilos-especificos": "prod_hilos_especificos"
    }
    
    if tabla not in tablas_permitidas:
        raise HTTPException(status_code=400, detail=f"Tabla '{tabla}' no permitida para reordenamiento")
    
    table_name = tablas_permitidas[tabla]
    pool = await get_pool()
    async with pool.acquire() as conn:
        for item in request.items:
            await conn.execute(f"UPDATE {table_name} SET orden = $1 WHERE id = $2", item.orden, item.id)
    
    return {"message": f"Reordenamiento de {tabla} completado", "items_updated": len(request.items)}

# ==================== ENDPOINTS HILOS ESPECÍFICOS ====================

@router.get("/hilos-especificos")
async def get_hilos_especificos():
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM prod_hilos_especificos ORDER BY orden ASC, nombre ASC")
        return [row_to_dict(r) for r in rows]

@router.post("/hilos-especificos")
async def create_hilo_especifico(input: HiloEspecificoCreate):
    hilo = HiloEspecifico(**input.model_dump())
    pool = await get_pool()
    async with pool.acquire() as conn:
        if hilo.orden == 0:
            max_orden = await conn.fetchval("SELECT COALESCE(MAX(orden), 0) FROM prod_hilos_especificos")
            hilo.orden = max_orden + 1
        await conn.execute(
            "INSERT INTO prod_hilos_especificos (id, nombre, codigo, color, descripcion, orden, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
            hilo.id, hilo.nombre, hilo.codigo, hilo.color, hilo.descripcion, hilo.orden, hilo.created_at.replace(tzinfo=None)
        )
    return hilo

@router.put("/hilos-especificos/{hilo_id}")
async def update_hilo_especifico(hilo_id: str, input: HiloEspecificoCreate):
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.fetchrow("SELECT * FROM prod_hilos_especificos WHERE id = $1", hilo_id)
        if not result:
            raise HTTPException(status_code=404, detail="Hilo específico no encontrado")
        await conn.execute(
            "UPDATE prod_hilos_especificos SET nombre = $1, codigo = $2, color = $3, descripcion = $4, orden = $5 WHERE id = $6",
            input.nombre, input.codigo, input.color, input.descripcion, input.orden, hilo_id
        )
        return {**row_to_dict(result), **input.model_dump()}

@router.delete("/hilos-especificos/{hilo_id}")
async def delete_hilo_especifico(hilo_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM prod_hilos_especificos WHERE id = $1", hilo_id)
        return {"message": "Hilo específico eliminado"}
@router.get("/rutas-produccion")
async def get_rutas_produccion():
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM prod_rutas_produccion ORDER BY created_at DESC")
        result = []
        for r in rows:
            d = row_to_dict(r)
            d['etapas'] = parse_jsonb(d.get('etapas'))
            # Enriquecer con nombres de servicios
            for etapa in d['etapas']:
                srv = await conn.fetchrow("SELECT nombre FROM prod_servicios_produccion WHERE id = $1", etapa.get('servicio_id'))
                etapa['servicio_nombre'] = srv['nombre'] if srv else None
            result.append(d)
        return result

@router.get("/rutas-produccion/{ruta_id}")
async def get_ruta_produccion(ruta_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM prod_rutas_produccion WHERE id = $1", ruta_id)
        if not row:
            raise HTTPException(status_code=404, detail="Ruta no encontrada")
        d = row_to_dict(row)
        d['etapas'] = parse_jsonb(d.get('etapas'))
        for etapa in d['etapas']:
            srv = await conn.fetchrow("SELECT nombre FROM prod_servicios_produccion WHERE id = $1", etapa.get('servicio_id'))
            etapa['servicio_nombre'] = srv['nombre'] if srv else None
        return d

@router.post("/rutas-produccion")
async def create_ruta_produccion(input: RutaProduccionCreate):
    ruta = RutaProduccion(**input.model_dump())
    pool = await get_pool()
    async with pool.acquire() as conn:
        etapas_json = json.dumps([e.model_dump() for e in ruta.etapas])
        await conn.execute(
            "INSERT INTO prod_rutas_produccion (id, nombre, descripcion, etapas, created_at) VALUES ($1, $2, $3, $4, $5)",
            ruta.id, ruta.nombre, ruta.descripcion, etapas_json, ruta.created_at.replace(tzinfo=None)
        )
    return ruta

@router.put("/rutas-produccion/{ruta_id}")
async def update_ruta_produccion(ruta_id: str, input: RutaProduccionCreate):
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.fetchrow("SELECT * FROM prod_rutas_produccion WHERE id = $1", ruta_id)
        if not result:
            raise HTTPException(status_code=404, detail="Ruta no encontrada")
        etapas_json = json.dumps([e.model_dump() for e in input.etapas])
        await conn.execute("UPDATE prod_rutas_produccion SET nombre = $1, descripcion = $2, etapas = $3 WHERE id = $4",
                          input.nombre, input.descripcion, etapas_json, ruta_id)
        return {**row_to_dict(result), "nombre": input.nombre, "descripcion": input.descripcion, "etapas": [e.model_dump() for e in input.etapas]}

@router.delete("/rutas-produccion/{ruta_id}")
async def delete_ruta_produccion(ruta_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        count = await conn.fetchval("SELECT COUNT(*) FROM prod_modelos WHERE ruta_produccion_id = $1", ruta_id)
        if count > 0:
            raise HTTPException(status_code=400, detail=f"No se puede eliminar: {count} modelo(s) usan esta ruta")
        await conn.execute("DELETE FROM prod_rutas_produccion WHERE id = $1", ruta_id)
        return {"message": "Ruta eliminada"}

# ==================== ENDPOINTS SERVICIOS PRODUCCION ====================

@router.get("/servicios-produccion")
async def get_servicios_produccion():
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM prod_servicios_produccion ORDER BY orden ASC, created_at ASC")
        return [row_to_dict(r) for r in rows]

@router.post("/servicios-produccion")
async def create_servicio_produccion(input: ServicioCreate):
    servicio = Servicio(**input.model_dump())
    pool = await get_pool()
    async with pool.acquire() as conn:
        max_orden = await conn.fetchval("SELECT COALESCE(MAX(orden), -1) FROM prod_servicios_produccion")
        await conn.execute(
            "INSERT INTO prod_servicios_produccion (id, nombre, descripcion, tarifa, orden, usa_avance_porcentaje, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
            servicio.id, servicio.nombre, servicio.descripcion, servicio.tarifa, max_orden + 1, input.usa_avance_porcentaje, servicio.created_at.replace(tzinfo=None)
        )
    return servicio

@router.put("/servicios-produccion/{servicio_id}")
async def update_servicio_produccion(servicio_id: str, input: ServicioCreate):
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.fetchrow("SELECT * FROM prod_servicios_produccion WHERE id = $1", servicio_id)
        if not result:
            raise HTTPException(status_code=404, detail="Servicio no encontrado")
        if input.orden is not None:
            await conn.execute(
                "UPDATE prod_servicios_produccion SET nombre = $1, descripcion = $2, tarifa = $3, orden = $4, usa_avance_porcentaje = $5 WHERE id = $6",
                input.nombre, input.descripcion, input.tarifa, input.orden, input.usa_avance_porcentaje, servicio_id)
        else:
            await conn.execute(
                "UPDATE prod_servicios_produccion SET nombre = $1, descripcion = $2, tarifa = $3, usa_avance_porcentaje = $4 WHERE id = $5",
                input.nombre, input.descripcion, input.tarifa, input.usa_avance_porcentaje, servicio_id)
        return {**row_to_dict(result), **input.model_dump(exclude_none=True)}

@router.delete("/servicios-produccion/{servicio_id}")
async def delete_servicio_produccion(servicio_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        mov_count = await conn.fetchval("SELECT COUNT(*) FROM prod_movimientos_produccion WHERE servicio_id = $1", servicio_id)
        if mov_count > 0:
            raise HTTPException(status_code=400, detail=f"No se puede eliminar: {mov_count} movimiento(s) usan este servicio")
        await conn.execute("DELETE FROM prod_servicios_produccion WHERE id = $1", servicio_id)
        return {"message": "Servicio eliminado"}

# ==================== ENDPOINTS PERSONAS PRODUCCION ====================

@router.get("/personas-produccion")
async def get_personas_produccion(servicio_id: str = None, activo: bool = None):
    pool = await get_pool()
    async with pool.acquire() as conn:
        query = "SELECT * FROM prod_personas_produccion WHERE 1=1"
        params = []
        if activo is not None:
            params.append(activo)
            query += f" AND activo = ${len(params)}"
        query += " ORDER BY orden ASC, nombre ASC"
        rows = await conn.fetch(query, *params)
        result = []
        for r in rows:
            d = row_to_dict(r)
            d['servicios'] = parse_jsonb(d.get('servicios'))
            # Enriquecer con nombre del servicio
            servicios_detalle = []
            for s in d['servicios']:
                # Handle both formats: string (just UUID) or dict {"servicio_id": ..., "tarifa": ...}
                if isinstance(s, str):
                    sid = s
                    tarifa = 0
                else:
                    sid = s.get('servicio_id')
                    tarifa = s.get('tarifa', 0)
                srv = await conn.fetchrow("SELECT nombre FROM prod_servicios_produccion WHERE id = $1", sid)
                servicios_detalle.append({
                    "servicio_id": sid,
                    "servicio_nombre": srv['nombre'] if srv else None,
                    "tarifa": tarifa
                })
            d['servicios_detalle'] = servicios_detalle
            # Enriquecer unidad interna
            if d.get('unidad_interna_id'):
                ui = await conn.fetchrow("SELECT nombre FROM finanzas2.fin_unidad_interna WHERE id = $1", d['unidad_interna_id'])
                d['unidad_interna_nombre'] = ui['nombre'] if ui else None
            if servicio_id:
                if any((s if isinstance(s, str) else s.get('servicio_id')) == servicio_id for s in d['servicios']):
                    result.append(d)
            else:
                result.append(d)
        return result

@router.post("/personas-produccion")
async def create_persona_produccion(input: PersonaCreate):
    persona = Persona(**input.model_dump())
    pool = await get_pool()
    async with pool.acquire() as conn:
        servicios_json = json.dumps([s.model_dump() for s in persona.servicios])
        await conn.execute(
            "INSERT INTO prod_personas_produccion (id, nombre, tipo, telefono, email, direccion, servicios, activo, tipo_persona, unidad_interna_id, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
            persona.id, persona.nombre, persona.tipo, persona.telefono, persona.email, persona.direccion, servicios_json, persona.activo, persona.tipo_persona, persona.unidad_interna_id, persona.created_at.replace(tzinfo=None)
        )
    return persona

@router.put("/personas-produccion/{persona_id}")
async def update_persona_produccion(persona_id: str, input: PersonaCreate):
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.fetchrow("SELECT * FROM prod_personas_produccion WHERE id = $1", persona_id)
        if not result:
            raise HTTPException(status_code=404, detail="Persona no encontrada")
        servicios_json = json.dumps([s.model_dump() for s in input.servicios])
        await conn.execute(
            "UPDATE prod_personas_produccion SET nombre=$1, tipo=$2, telefono=$3, email=$4, direccion=$5, servicios=$6, activo=$7, tipo_persona=$8, unidad_interna_id=$9 WHERE id=$10",
            input.nombre, input.tipo, input.telefono, input.email, input.direccion, servicios_json, input.activo, input.tipo_persona, input.unidad_interna_id, persona_id
        )
        return {**row_to_dict(result), **input.model_dump()}

@router.delete("/personas-produccion/{persona_id}")
async def delete_persona_produccion(persona_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        mov_count = await conn.fetchval("SELECT COUNT(*) FROM prod_movimientos_produccion WHERE persona_id = $1", persona_id)
        if mov_count > 0:
            raise HTTPException(status_code=400, detail=f"No se puede eliminar: {mov_count} movimiento(s) asignados")
        await conn.execute("DELETE FROM prod_personas_produccion WHERE id = $1", persona_id)
        return {"message": "Persona eliminada"}
@router.get("/lineas-negocio")
async def get_lineas_negocio():
    """Retorna las líneas de negocio activas desde finanzas2."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, codigo, nombre FROM finanzas2.cont_linea_negocio WHERE activo = true ORDER BY nombre"
        )
        return [{"id": r["id"], "codigo": r["codigo"], "nombre": r["nombre"]} for r in rows]


# ==================== CONFIGURACIÓN EMPRESA ====================

PROD_TABLES_EMPRESA = [
    "prod_inventario",
    "prod_inventario_ingresos",
    "prod_inventario_rollos",
    "prod_inventario_salidas",
    "prod_inventario_reservas",
    "prod_inventario_reservas_linea",
    "prod_registros",
    "prod_registro_tallas",
    "prod_registro_requerimiento_mp",
    "prod_registro_cierre",
    "prod_registro_costos_servicio",
    "prod_consumo_mp",
    "prod_incidencia",
    "prod_ingreso_pt",
    "prod_orden_etapa",
    "prod_paralizacion",
    "prod_servicio_orden",
    "prod_transferencias_linea",
    "prod_wip_movimiento",
]


@router.get("/configuracion/empresa")
async def get_empresa_activa(current_user: dict = Depends(get_current_user)):
    """Detecta la empresa activa y lista empresas disponibles."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Detectar empresa actual desde prod_registros (tabla principal)
        empresa_actual = await conn.fetchval(
            "SELECT empresa_id FROM prod_registros ORDER BY fecha_creacion DESC LIMIT 1"
        )
        if not empresa_actual:
            empresa_actual = await conn.fetchval(
                "SELECT empresa_id FROM prod_inventario LIMIT 1"
            )

        # Listar empresas disponibles
        empresas = await conn.fetch(
            "SELECT id, nombre, ruc FROM finanzas2.cont_empresa WHERE activo = true ORDER BY nombre"
        )

        return {
            "empresa_actual_id": empresa_actual,
            "empresas": [{"id": r["id"], "nombre": r["nombre"], "ruc": r.get("ruc")} for r in empresas],
        }


@router.put("/configuracion/empresa")
async def cambiar_empresa_activa(
    payload: dict,
    current_user: dict = Depends(get_current_user),
):
    """Cambia la empresa_id en TODAS las tablas de producción."""
    nueva_empresa_id = payload.get("empresa_id")
    if not nueva_empresa_id:
        raise HTTPException(status_code=400, detail="empresa_id requerido")

    pool = await get_pool()
    async with pool.acquire() as conn:
        # Verificar que la empresa existe
        existe = await conn.fetchval(
            "SELECT id FROM finanzas2.cont_empresa WHERE id = $1 AND activo = true",
            int(nueva_empresa_id),
        )
        if not existe:
            raise HTTPException(status_code=404, detail="Empresa no encontrada o inactiva")

        # Actualizar todas las tablas
        resumen = {}
        for tabla in PROD_TABLES_EMPRESA:
            try:
                result = await conn.execute(
                    f"UPDATE {tabla} SET empresa_id = $1 WHERE empresa_id IS DISTINCT FROM $1",
                    int(nueva_empresa_id),
                )
                count = int(result.split(" ")[-1]) if result else 0
                if count > 0:
                    resumen[tabla] = count
            except Exception:
                # Tabla puede estar vacía o no tener columna (skip)
                pass

        return {
            "message": f"Empresa actualizada a ID {nueva_empresa_id}",
            "empresa_id": int(nueva_empresa_id),
            "tablas_actualizadas": resumen,
        }


# ── Modo Migración ──────────────────────────────────────────────────────────

@router.get("/configuracion/modo-migracion")
async def get_modo_migracion(current_user: dict = Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT valor, updated_at, updated_by FROM prod_configuracion WHERE clave = 'modo_migracion'"
        )
        if not row:
            return {"activo": False}
        return {
            "activo": row["valor"] == "true",
            "updated_at": row["updated_at"].isoformat() + "Z" if row["updated_at"] else None,
            "updated_by": row["updated_by"],
        }


@router.put("/configuracion/modo-migracion")
async def set_modo_migracion(payload: dict, current_user: dict = Depends(get_current_user)):
    # Solo admin
    if current_user.get("rol") != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores pueden cambiar el modo migración")
    activo = payload.get("activo", False)
    valor = "true" if activo else "false"
    usuario = current_user.get("username", current_user.get("nombre_completo", ""))
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO prod_configuracion (clave, valor, updated_at, updated_by)
               VALUES ('modo_migracion', $1, CURRENT_TIMESTAMP, $2)
               ON CONFLICT (clave) DO UPDATE SET valor = $1, updated_at = CURRENT_TIMESTAMP, updated_by = $2""",
            valor, usuario,
        )
    return {"activo": activo, "message": f"Modo migración {'activado' if activo else 'desactivado'}"}
