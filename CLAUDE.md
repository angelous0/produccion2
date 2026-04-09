# Producción Textil — ERP

Sistema ERP para la gestión de producción textil. Cubre el ciclo completo: modelos, BOM, órdenes, registros de producción, inventario de materiales, trazabilidad de lotes, reportes y auditoría.

---

## Stack

### Backend
- **Framework:** FastAPI (Python)
- **ORM:** SQLAlchemy 2.0 async
- **Base de datos:** PostgreSQL (asyncpg + psycopg2)
- **Autenticación:** JWT (python-jose, HS256, expiración 1 año)
- **Validación:** Pydantic v2
- **Reportes/exportaciones:** pandas, openpyxl, reportlab
- **Entry point:** `backend/server.py`

### Frontend
- **Framework:** React 19 + React Router 7
- **Estilos:** TailwindCSS 3 + CSS variables (light/dark)
- **UI components:** shadcn/ui (Radix UI primitives)
- **Iconos:** Lucide React
- **HTTP:** Axios
- **Gráficas:** Recharts
- **Exportaciones:** jsPDF, XLSX
- **Build:** Create React App + CRACO
- **Package manager:** Yarn

---

## Estructura de carpetas

```
produccion-main 2/
├── backend/
│   ├── server.py          # App FastAPI, monta todos los routers
│   ├── db.py              # Pool de conexión PostgreSQL
│   ├── models.py          # Modelos Pydantic
│   ├── auth.py            # Lógica de autenticación
│   ├── auth_utils.py      # Utilidades JWT
│   ├── helpers.py         # Funciones helper
│   ├── routes/            # ~30 módulos de rutas (inventario, registros, reportes, etc.)
│   ├── migrations/        # Scripts de migración SQL
│   └── scripts/           # Scripts de utilidad y seed
├── frontend/
│   ├── src/
│   │   ├── App.js         # Router principal (100+ rutas)
│   │   ├── context/
│   │   │   ├── AuthContext.jsx    # Estado de auth y usuario
│   │   │   └── ThemeContext.jsx   # Tema claro/oscuro
│   │   ├── hooks/
│   │   │   ├── usePermissions.js  # Control de permisos por ruta
│   │   │   └── useSaving.js
│   │   ├── components/
│   │   │   ├── Layout.jsx         # Shell principal (sidebar, header)
│   │   │   ├── ui/                # 49 componentes shadcn/ui
│   │   │   └── registro/          # Subcomponentes de registro
│   │   ├── pages/                 # 70+ páginas organizadas por dominio
│   │   └── lib/                   # Utilidades (dateUtils, utils)
│   ├── tailwind.config.js
│   ├── craco.config.js
│   └── package.json
├── docs/
├── tests/
└── CLAUDE.md
```

---

## Comandos para correr el proyecto

### Backend

```bash
# Instalar dependencias
cd backend
pip install -r requirements.txt

# Variables de entorno necesarias
# DATABASE_URL=postgresql+asyncpg://user:pass@localhost/dbname
# SECRET_KEY=tu_clave_secreta

# Correr servidor de desarrollo
uvicorn server:app --reload --host 0.0.0.0 --port 8000

# La API queda en http://localhost:8000
# Docs interactivas en http://localhost:8000/docs
```

### Frontend

```bash
# Instalar dependencias
cd frontend
yarn install

# Variables de entorno necesarias
# REACT_APP_BACKEND_URL=http://localhost:8000

# Correr en desarrollo
yarn start          # http://localhost:3000

# Build de producción
yarn build
```

---

## Módulos principales del backend

| Router | Archivo | Descripción |
|--------|---------|-------------|
| `/api/auth` | `routes/auth.py` | Login, usuarios, cambio de contraseña |
| `/api/catalogos` | `routes/catalogos.py` | Telas, hilos, colores, marcas, tipos, etc. |
| `/api/inventario` | `routes/inventario_main.py` | Ingresos, salidas, ajustes, kardex |
| `/api/registros` | `routes/registros_main.py` | Órdenes de producción y seguimiento |
| `/api/reportes` | `routes/reportes_produccion.py` | Matriz, operativo, lotes, valorización |
| `/api/auditoria` | `routes/auditoria.py` | Log de auditoría de cambios |
| `/api/backups` | `server.py` | Copias de seguridad |

## Navegación del sidebar (Layout.jsx)

El sidebar tiene 6 grupos:

| Grupo | Estado inicial | Visible para |
|-------|---------------|--------------|
| **Operaciones** | Siempre visible | Todos |
| **Inventario** | Expandido | Todos (filtrado por permisos) |
| **Reportes** | Expandido | Todos |
| **Catálogos** | Cerrado | Todos |
| **Maestros** | Cerrado | Todos |
| **Configuración** | Cerrado | Solo admin |

El estado abierto/cerrado de cada grupo persiste en `localStorage` bajo las claves `navgroup_inventario`, `navgroup_reportes`, etc.

## Roles de usuario

- `admin` — acceso completo
- `usuario` — acceso filtrado por tabla de permisos (`user.permisos`)
- `lectura` — solo lectura
