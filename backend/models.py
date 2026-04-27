"""Pydantic models shared across all routers."""
from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import List, Optional
from datetime import datetime, timezone
import uuid


# ==================== USUARIOS ====================
class UserLogin(BaseModel):
    username: str
    password: str

class UserCreate(BaseModel):
    username: str
    email: Optional[str] = None
    password: str
    nombre_completo: Optional[str] = None
    rol: str = "usuario"
    permisos: dict = {}

class UserUpdate(BaseModel):
    email: Optional[str] = None
    nombre_completo: Optional[str] = None
    rol: Optional[str] = None
    permisos: Optional[dict] = None
    activo: Optional[bool] = None

class UserChangePassword(BaseModel):
    current_password: str
    new_password: str

class AdminSetPassword(BaseModel):
    new_password: str


# ==================== CATÁLOGOS ====================
class MarcaBase(BaseModel):
    nombre: str
    orden: int = 0

class MarcaCreate(MarcaBase):
    pass

class Marca(MarcaBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TipoBase(BaseModel):
    nombre: str
    marca_ids: List[str] = []
    orden: int = 0

class TipoCreate(TipoBase):
    pass

class Tipo(TipoBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class EntalleBase(BaseModel):
    nombre: str
    tipo_ids: List[str] = []
    orden: int = 0

class EntalleCreate(EntalleBase):
    pass

class Entalle(EntalleBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TelaBase(BaseModel):
    nombre: str
    entalle_ids: List[str] = []
    tela_general_id: Optional[str] = None
    orden: int = 0

class TelaCreate(TelaBase):
    pass

class Tela(TelaBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class HiloBase(BaseModel):
    nombre: str
    tela_ids: List[str] = []
    orden: int = 0

class HiloCreate(HiloBase):
    pass

class Hilo(HiloBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class GeneroBase(BaseModel):
    nombre: str
    marca_ids: List[str] = []
    orden: int = 0

class GeneroCreate(GeneroBase):
    pass

class Genero(GeneroBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TelaGeneralBase(BaseModel):
    nombre: str
    orden: int = 0

class TelaGeneralCreate(TelaGeneralBase):
    pass

class TelaGeneral(TelaGeneralBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CuelloBase(BaseModel):
    nombre: str
    tipo_ids: List[str] = []
    orden: int = 0

class CuelloCreate(CuelloBase):
    pass

class Cuello(CuelloBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class DetalleBase(BaseModel):
    nombre: str
    tipo_ids: List[str] = []
    orden: int = 0

class DetalleCreate(DetalleBase):
    pass

class Detalle(DetalleBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class LavadoBase(BaseModel):
    nombre: str
    categoria: str = "basico"
    tipo_ids: List[str] = []
    orden: int = 0

    @field_validator("categoria")
    @classmethod
    def validate_categoria(cls, v: str) -> str:
        if v not in ("basico", "moda"):
            raise ValueError("categoria debe ser 'basico' o 'moda'")
        return v

class LavadoCreate(LavadoBase):
    pass

class Lavado(LavadoBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TallaBase(BaseModel):
    nombre: str
    orden: int = 0

class TallaCreate(TallaBase):
    pass

class Talla(TallaBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ColorGeneralBase(BaseModel):
    nombre: str
    orden: int = 0

class ColorGeneralCreate(ColorGeneralBase):
    pass

class ColorGeneral(ColorGeneralBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ColorBase(BaseModel):
    nombre: str
    codigo_hex: str = ""
    color_general_id: Optional[str] = None
    categoria: str = "basico"
    orden: int = 0
    modelo: Optional[str] = None  # Texto libre: referencia informativa al modelo asociado

class ColorCreate(ColorBase):
    pass

class Color(ColorBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class HiloEspecificoBase(BaseModel):
    nombre: str
    codigo: str = ""
    color: str = ""
    descripcion: str = ""
    orden: int = 0

class HiloEspecificoCreate(HiloEspecificoBase):
    pass

class HiloEspecifico(HiloEspecificoBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ==================== RUTAS Y SERVICIOS ====================
class EtapaRuta(BaseModel):
    nombre: str
    servicio_id: Optional[str] = None
    orden: float = 0
    obligatorio: bool = True
    aparece_en_estado: bool = True
    es_cierre: bool = False

class RutaProduccionBase(BaseModel):
    nombre: str
    descripcion: str = ""
    etapas: List[EtapaRuta] = []

class RutaProduccionCreate(RutaProduccionBase):
    pass

class RutaProduccion(RutaProduccionBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ServicioBase(BaseModel):
    nombre: str
    descripcion: str = ""
    tarifa: float = 0
    orden: Optional[int] = None
    usa_avance_porcentaje: bool = False
    # Servicio "simple" (1:1 sin fechas, sin mermas). Si es TRUE, el diálogo
    # de movimiento oculta fechas, fuerza cantidad recibida = enviada y
    # auto-completa la cantidad con las prendas efectivas del corte.
    es_simple: bool = False

class ServicioCreate(ServicioBase):
    pass

class Servicio(ServicioBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PersonaServicio(BaseModel):
    servicio_id: str
    tarifa: float = 0

class PersonaBase(BaseModel):
    nombre: str
    tipo: str = "externo"
    telefono: str = ""
    email: str = ""
    direccion: str = ""
    servicios: List[PersonaServicio] = []
    activo: bool = True
    tipo_persona: str = "EXTERNO"
    unidad_interna_id: Optional[int] = None

class PersonaCreate(PersonaBase):
    pass

class Persona(PersonaBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ==================== MODELOS ====================
class ModeloBase(BaseModel):
    nombre: str
    marca_id: str
    tipo_id: str
    entalle_id: str
    tela_id: str
    hilo_id: str
    ruta_produccion_id: str
    servicios_ids: List[str] = []
    pt_item_id: Optional[str] = None
    linea_negocio_id: Optional[int] = None
    base_id: Optional[str] = None
    hilo_especifico_id: Optional[str] = None
    muestra_modelo_id: Optional[str] = None
    muestra_base_id: Optional[str] = None
    genero_id: Optional[str] = None
    cuello_id: Optional[str] = None
    detalle_id: Optional[str] = None
    lavado_id: Optional[str] = None

class ModeloCreate(ModeloBase):
    pass

class Modelo(ModeloBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TallaCantidadItem(BaseModel):
    model_config = ConfigDict(extra="allow")
    talla_id: str
    nombre: Optional[str] = ""
    talla_nombre: Optional[str] = ""
    cantidad: int = 0

class ModeloTallaBase(BaseModel):
    talla_id: str
    orden: int = 10
    activo: bool = True

class ModeloTallaCreate(ModeloTallaBase):
    pass

class ModeloTallaUpdate(BaseModel):
    orden: Optional[int] = None
    activo: Optional[bool] = None

class ModeloTallaOut(BaseModel):
    id: str
    modelo_id: str
    talla_id: str
    talla_nombre: Optional[str] = None
    orden: int = 10
    activo: bool = True
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

class ModeloBomLineaBase(BaseModel):
    inventario_id: str
    talla_id: Optional[str] = None
    cantidad_base: float
    activo: bool = True

class ModeloBomLineaCreate(ModeloBomLineaBase):
    pass

class ModeloBomLineaUpdate(BaseModel):
    inventario_id: Optional[str] = None
    talla_id: Optional[str] = None
    cantidad_base: Optional[float] = None
    activo: Optional[bool] = None

class ModeloBomLineaOut(BaseModel):
    id: str
    modelo_id: str
    inventario_id: str
    inventario_nombre: Optional[str] = None
    inventario_codigo: Optional[str] = None
    talla_id: Optional[str] = None
    talla_nombre: Optional[str] = None
    unidad_base: Optional[str] = None
    cantidad_base: float
    orden: Optional[int] = None
    activo: bool
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


# ==================== REGISTROS ====================
class ColorDistribucion(BaseModel):
    color_id: str
    color_nombre: str = ""
    cantidad: int = 0

class TallaConColores(BaseModel):
    talla_id: str
    talla_nombre: str = ""
    cantidad_total: int = 0
    colores: List[ColorDistribucion] = []

class ModeloManual(BaseModel):
    marca_id: Optional[str] = None
    marca_texto: Optional[str] = None
    tipo_id: Optional[str] = None
    tipo_texto: Optional[str] = None
    tela_id: Optional[str] = None
    tela_texto: Optional[str] = None
    entalle_id: Optional[str] = None
    entalle_texto: Optional[str] = None
    nombre_modelo: Optional[str] = None
    hilo: Optional[str] = None
    hilo_especifico: Optional[str] = None
    hilo_id: Optional[str] = None
    hilo_texto: Optional[str] = None
    hilo_especifico_id: Optional[str] = None
    hilo_especifico_texto: Optional[str] = None

class RegistroBase(BaseModel):
    n_corte: str
    modelo_id: Optional[str] = None
    modelo_manual: Optional[ModeloManual] = None
    curva: str = ""
    estado: str = "Para Corte"
    urgente: bool = False
    hilo_especifico_id: Optional[str] = None
    pt_item_id: Optional[str] = None
    empresa_id: Optional[int] = 8
    observaciones: Optional[str] = None
    fecha_entrega_final: Optional[str] = None
    fecha_inicio_real: Optional[str] = None
    linea_negocio_id: Optional[int] = None
    es_migracion: bool = False

class RegistroCreate(RegistroBase):
    tallas: List[TallaCantidadItem] = []
    distribucion_colores: List[TallaConColores] = []

class Registro(RegistroBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    fecha_creacion: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    tallas: List[TallaCantidadItem] = []
    distribucion_colores: List[TallaConColores] = []

ESTADOS_PRODUCCION = [
    "Para Corte", "Corte", "Para Costura", "Costura", "Para Atraque", "Atraque",
    "Para Lavandería", "Muestra Lavanderia", "Lavandería", "Para Acabado",
    "Acabado", "Almacén PT", "Tienda"
]

class RegistroTallaBase(BaseModel):
    talla_id: str
    cantidad_real: int = 0

class RegistroTallaCreate(RegistroTallaBase):
    pass

class RegistroTallaUpdate(BaseModel):
    cantidad_real: int

class RegistroTallaBulkUpdate(BaseModel):
    tallas: List[RegistroTallaBase]

class RequerimientoMPOut(BaseModel):
    id: str
    registro_id: str
    item_id: str
    item_codigo: Optional[str] = None
    item_nombre: Optional[str] = None
    item_unidad: Optional[str] = None
    control_por_rollos: bool = False
    talla_id: Optional[str] = None
    talla_nombre: Optional[str] = None
    cantidad_requerida: float
    cantidad_reservada: float
    cantidad_consumida: float
    pendiente_reservar: float = 0
    pendiente_consumir: float = 0
    estado: str

class ReservaLineaInput(BaseModel):
    item_id: str
    talla_id: Optional[str] = None
    cantidad: float

class ReservaCreateInput(BaseModel):
    lineas: List[ReservaLineaInput]

class LiberarReservaLineaInput(BaseModel):
    item_id: str
    talla_id: Optional[str] = None
    cantidad: float

class LiberarReservaInput(BaseModel):
    lineas: List[LiberarReservaLineaInput]

class DisponibilidadItemOut(BaseModel):
    item_id: str
    item_codigo: Optional[str] = None
    item_nombre: Optional[str] = None
    stock_actual: float
    total_reservado: float
    disponible: float
    control_por_rollos: bool


# ==================== MOVIMIENTOS ====================
class MovimientoBase(BaseModel):
    registro_id: str
    servicio_id: str
    persona_id: str
    cantidad_enviada: int = 0
    cantidad_recibida: int = 0
    tarifa_aplicada: float = 0
    fecha_inicio: Optional[str] = None
    fecha_fin: Optional[str] = None
    fecha_esperada_movimiento: Optional[str] = None
    responsable_movimiento: Optional[str] = None
    observaciones: str = ""
    avance_porcentaje: Optional[int] = None
    detalle_costos: Optional[list] = None

class MovimientoCreate(MovimientoBase):
    pass

class Movimiento(MovimientoBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    diferencia: int = 0
    costo_calculado: float = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ==================== INVENTARIO ====================
class ItemInventarioBase(BaseModel):
    codigo: str
    nombre: str
    descripcion: str = ""
    categoria: str = "Otros"
    unidad_medida: str = "unidad"
    stock_minimo: int = 0
    control_por_rollos: bool = False
    linea_negocio_id: Optional[int] = None

class ItemInventarioCreate(ItemInventarioBase):
    stock_inicial: float = 0
    costo_unitario_inicial: float = 0

class ItemInventario(ItemInventarioBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    stock_actual: float = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class IngresoInventarioBase(BaseModel):
    item_id: str
    cantidad: float
    costo_unitario: float = 0.0
    proveedor: str = ""
    numero_documento: str = ""
    observaciones: str = ""

class IngresoInventarioCreate(IngresoInventarioBase):
    rollos: List[dict] = []
    empresa_id: int = 7
    linea_negocio_id: Optional[int] = None

class IngresoInventario(IngresoInventarioBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    fecha: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    cantidad_disponible: float = 0

class SalidaInventarioBase(BaseModel):
    item_id: str
    cantidad: float
    registro_id: Optional[str] = None
    talla_id: Optional[str] = None
    observaciones: str = ""
    rollo_id: Optional[str] = None

class SalidaInventarioCreate(SalidaInventarioBase):
    linea_negocio_id: Optional[int] = None

class SalidaInventario(SalidaInventarioBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    fecha: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    costo_total: float = 0.0
    detalle_fifo: List[dict] = []

class AjusteInventarioBase(BaseModel):
    item_id: str
    tipo: str
    cantidad: float
    motivo: str = ""
    observaciones: str = ""
    rollo_id: Optional[str] = None

class AjusteInventarioCreate(AjusteInventarioBase):
    pass

class AjusteInventario(AjusteInventarioBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    fecha: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ==================== MERMAS Y GUÍAS ====================
class MermaBase(BaseModel):
    registro_id: str
    movimiento_id: str
    servicio_id: str
    persona_id: str
    cantidad: int = 0
    motivo: str = ""

class MermaCreate(MermaBase):
    pass

class Merma(MermaBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    fecha: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class GuiaRemisionBase(BaseModel):
    movimiento_id: str
    registro_id: str
    servicio_id: str
    persona_id: str
    cantidad: int = 0
    observaciones: str = ""

class GuiaRemisionCreate(GuiaRemisionBase):
    pass

class GuiaRemision(GuiaRemisionBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    numero_guia: str = ""
    fecha: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ==================== REORDER ====================
class ReorderItem(BaseModel):
    id: str
    orden: int

class ReorderRequest(BaseModel):
    items: List[ReorderItem]

class DivisionLoteRequest(BaseModel):
    tallas_hijo: list
    estado_hijo: Optional[str] = None


# ==================== ODOO ENRIQUECIMIENTO ====================
class OdooProductoEnriq(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    odoo_template_id: int
    empresa_id: int = 7

    odoo_nombre: Optional[str] = None
    odoo_default_code: Optional[str] = None
    odoo_marca_texto: Optional[str] = None
    odoo_tipo_texto: Optional[str] = None
    odoo_entalle_texto: Optional[str] = None
    odoo_tela_texto: Optional[str] = None
    odoo_hilo_texto: Optional[str] = None
    odoo_active: bool = True
    odoo_stock_actual: float = 0

    marca_id: Optional[str] = None
    tipo_id: Optional[str] = None
    tela_general_id: Optional[str] = None
    tela_id: Optional[str] = None
    entalle_id: Optional[str] = None
    genero_id: Optional[str] = None
    cuello_id: Optional[str] = None
    detalle_id: Optional[str] = None
    lavado_id: Optional[str] = None
    hilo_id: Optional[str] = None
    categoria_color_id: Optional[str] = None

    estado: str = 'pendiente'
    excluido_motivo: Optional[str] = None
    campos_pendientes: List[str] = []
    notas: Optional[str] = None

    costo_manual: Optional[float] = None
    costo_updated_at: Optional[datetime] = None
    costo_updated_by: Optional[str] = None

    classified_by: Optional[str] = None
    classified_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    last_sync: Optional[datetime] = None


class OdooProductoCostoInput(BaseModel):
    costo_manual: Optional[float] = None


class ColorMappingInput(BaseModel):
    template_id: int
    color_odoo_original: str
    color_id: str
    product_ids: List[int]


class ColorMappingDeleteInput(BaseModel):
    template_id: int
    product_ids: List[int]


class ColorCrearRapidoInput(BaseModel):
    nombre: str
    color_general_id: Optional[str] = None


class OdooProductoClasificarInput(BaseModel):
    marca_id: Optional[str] = None
    tipo_id: Optional[str] = None
    tela_general_id: Optional[str] = None
    tela_id: Optional[str] = None
    entalle_id: Optional[str] = None
    genero_id: Optional[str] = None
    cuello_id: Optional[str] = None
    detalle_id: Optional[str] = None
    lavado_id: Optional[str] = None
    hilo_id: Optional[str] = None
    categoria_color_id: Optional[str] = None
    linea_negocio_id: Optional[int] = None
    notas: Optional[str] = None
    excluir: Optional[bool] = False
