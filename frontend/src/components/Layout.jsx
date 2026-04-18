import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import {
  LayoutDashboard,
  Tag,
  Layers,
  Shirt,
  Palette,
  Scissors,
  Box,
  ClipboardList,
  Sun,
  Moon,
  Menu,
  X,
  Ruler,
  Droplets,
  Package,
  ArrowDownCircle,
  ArrowUpCircle,
  RefreshCw,
  FileText,
  BookOpen,
  Cog,
  Users,
  Play,
  BarChart3,
  Route,
  Sparkles,
  LogOut,
  User,
  Shield,
  Key,
  Loader2,
  History,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Database,
  Activity,
  GitBranch,
  Grid3X3,
  PackageX,
  ArrowRightLeft,
  ShieldCheck,
  TrendingUp,
  Bell,
  Truck,
  CalendarDays,
  BarChart2,
  Wrench,
  Search,
  Building2,
  AlertTriangle,
  FlaskConical,
  Receipt,
  UserCircle2,
  CircleDot,
  StickerIcon,
  WashingMachine,
  Layers3,
} from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';
import { NotificacionesBell } from './NotificacionesBell';
import { usePermissions, RUTA_A_TABLA } from '../hooks/usePermissions';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ── Saludo dinámico ────────────────────────────────────────────────────────

function getGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return { text: 'Buenos días', emoji: '☀️' };
  if (hour >= 12 && hour < 19) return { text: 'Buenas tardes', emoji: '🌤' };
  return { text: 'Buenas noches', emoji: '🌙' };
}

function getUserInitials(user) {
  if (user?.nombre_completo) {
    return user.nombre_completo
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('');
  }
  return (user?.username || 'U')[0].toUpperCase();
}

// ── Grupos de navegación ────────────────────────────────────────────────────

const operacionesItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/registros', icon: ClipboardList, label: 'Registros' },
  { to: '/muestras', icon: FlaskConical, label: 'Muestras' },
];

const inventarioItems = [
  { to: '/inventario', icon: Package, label: 'Inventario' },
  { to: '/inventario/ingresos', icon: ArrowDownCircle, label: 'Ingresos' },
  { to: '/inventario/salidas', icon: ArrowUpCircle, label: 'Salidas' },
  { to: '/inventario/salidas-libres', icon: PackageX, label: 'Salidas Libres' },
  { to: '/inventario/ajustes', icon: RefreshCw, label: 'Ajustes' },
  { to: '/inventario/rollos', icon: Layers, label: 'Rollos' },
  { to: '/inventario/movimientos', icon: FileText, label: 'Movimientos' },
  { to: '/inventario/kardex', icon: BookOpen, label: 'Kardex' },
  { to: '/inventario/kardex-pt', icon: Database, label: 'Kardex PT' },
  { to: '/inventario/kardex-general', icon: BarChart3, label: 'Kardex General' },
  { to: '/inventario/alertas-stock', icon: PackageX, label: 'Alertas Stock' },
  { to: '/inventario/transferencias-linea', icon: ArrowRightLeft, label: 'Transferencias' },
];

const reportesItems = [
  { to: '/reportes/alertas', icon: Bell, label: 'Alertas del Día' },
  { to: '/reportes/seguimiento', icon: Activity, label: 'Seguimiento' },
  { to: '/reportes/agenda-entregas', icon: CalendarDays, label: 'Agenda Entregas' },
  { to: '/reportes/entregas', icon: Truck, label: 'Entregas' },
  { to: '/reportes/costo-lote', icon: BarChart2, label: 'Costo por Lote' },
  { to: '/reportes/tendencia-fallados', icon: Wrench, label: 'Fallados y Arreglos' },
  { to: '/reportes/operativo', icon: Users, label: 'Operativo & Terceros' },
  { to: '/reportes/calidad', icon: Shield, label: 'Calidad' },
  { to: '/reportes/valorizacion', icon: Package, label: 'Valorizacion' },
  { to: '/reportes/lotes', icon: GitBranch, label: 'Lotes & Trazabilidad' },
  { to: '/reportes/matriz', icon: Grid3X3, label: 'Matriz Dinamica' },
  { to: '/reportes/rendimiento-servicios', icon: TrendingUp, label: 'Rendimiento Servicios' },
  { to: '/reportes/costos-produccion', icon: Receipt, label: 'Costos de Producción' },
];

const catalogosItems = [
  { to: '/marcas', icon: Tag, label: 'Marcas' },
  { to: '/generos', icon: UserCircle2, label: 'Géneros' },
  { to: '/tipos', icon: Layers, label: 'Tipos' },
  { to: '/entalles', icon: Shirt, label: 'Entalles' },
  { to: '/telas', icon: Palette, label: 'Telas' },
  { to: '/telas-general', icon: Layers3, label: 'Telas Generales' },
  { to: '/hilos', icon: Scissors, label: 'Hilos' },
  { to: '/hilos-especificos', icon: Sparkles, label: 'Hilos Específicos' },
  { to: '/tallas-catalogo', icon: Ruler, label: 'Tallas' },
  { to: '/colores-catalogo', icon: Droplets, label: 'Colores' },
  { to: '/colores-generales', icon: Palette, label: 'Colores Generales' },
  { to: '/cuellos', icon: CircleDot, label: 'Cuellos' },
  { to: '/detalles', icon: StickerIcon, label: 'Detalles' },
  { to: '/lavados', icon: WashingMachine, label: 'Lavados' },
  { to: '/bases', icon: Layers, label: 'Bases' },
  { to: '/modelos', icon: Box, label: 'Modelos' },
];

const maestrosItems = [
  { to: '/maestros/servicios', icon: Cog, label: 'Servicios' },
  { to: '/maestros/personas', icon: Users, label: 'Personas' },
  { to: '/maestros/rutas', icon: Route, label: 'Rutas' },
  { to: '/maestros/movimientos', icon: Play, label: 'Movimientos' },
  { to: '/maestros/motivos-incidencia', icon: AlertTriangle, label: 'Motivos Incidencia' },
  { to: '/maestros/productividad', icon: BarChart3, label: 'Productividad' },
  { to: '/guias', icon: FileText, label: 'Guías de Remisión' },
];

const configItems = [
  { to: '/config-empresa', icon: Building2, label: 'Empresa' },
  { to: '/usuarios', icon: Shield, label: 'Usuarios' },
  { to: '/historial-actividad', icon: History, label: 'Historial' },
  { to: '/auditoria', icon: ShieldCheck, label: 'Auditoría' },
  { to: '/backups', icon: Database, label: 'Backups' },
];

// ── Grupo colapsable ────────────────────────────────────────────────────────

function NavGroup({ label, items, collapsed: sidebarCollapsed, storageKey, defaultOpen = false, onItemClick, dotColor }) {
  const [open, setOpen] = useState(() => {
    const saved = localStorage.getItem(`navgroup_${storageKey}`);
    if (saved !== null) return saved === 'true';
    return defaultOpen;
  });

  const toggle = () => {
    const next = !open;
    setOpen(next);
    localStorage.setItem(`navgroup_${storageKey}`, String(next));
  };

  if (items.length === 0) return null;

  return (
    <div>
      {sidebarCollapsed ? (
        <div className="hidden md:block h-px bg-border mx-2 my-2" />
      ) : (
        <button
          onClick={toggle}
          className="w-full flex items-center justify-between px-3 py-1.5 mt-3 mb-0.5 rounded-md hover:bg-muted/50 transition-colors group"
        >
          <span className="nav-group-label group-hover:text-foreground transition-colors flex items-center">
            {dotColor && <span className={`w-1.5 h-1.5 rounded-full ${dotColor} mr-1.5`} />}
            {label}
          </span>
          <ChevronDown
            className={`h-3 w-3 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-0' : '-rotate-90'}`}
          />
        </button>
      )}

      <div
        style={{
          maxHeight: open || sidebarCollapsed ? '800px' : '0px',
          overflow: 'hidden',
          transition: 'max-height 0.25s ease-in-out',
        }}
      >
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/' || item.to === '/inventario'}
            onClick={onItemClick}
            className={({ isActive }) =>
              `sidebar-item ${isActive ? 'active' : ''} ${sidebarCollapsed ? 'md:justify-center md:px-2' : ''}`
            }
            data-testid={`nav-${item.label.toLowerCase().replace(/ /g, '-')}`}
            title={sidebarCollapsed ? item.label : undefined}
          >
            <item.icon className="h-4 w-4 flex-shrink-0" />
            <span className={sidebarCollapsed ? 'md:hidden' : ''}>{item.label}</span>
          </NavLink>
        ))}
      </div>
    </div>
  );
}

// ── ScrollToTop ─────────────────────────────────────────────────────────────

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    const el = document.getElementById('main-content');
    if (el) el.scrollTo(0, 0);
  }, [pathname]);
  return null;
}


// ── Búsqueda Global ──────────────────────────────────────────────────────────
function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ref = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const search = async (q) => {
    if (!q.trim() || q.length < 2) { setResults(null); return; }
    setLoading(true);
    try {
      const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
      const [regs, pers] = await Promise.all([
        axios.get(`${API}/registros/?limit=200`).then(r => r.data?.items || r.data || []),
        axios.get(`${API}/personas-produccion?all=true`).then(r => r.data?.items || r.data || []).catch(() => []),
      ]);
      const ql = q.toLowerCase();
      const regResults = regs.filter(r =>
        r.n_corte?.toLowerCase().includes(ql) ||
        r.modelo_nombre?.toLowerCase().includes(ql)
      ).slice(0, 5);
      const persResults = pers.filter(p => p.nombre?.toLowerCase().includes(ql)).slice(0, 3);
      setResults({ registros: regResults, personas: persResults });
    } catch { setResults(null); }
    finally { setLoading(false); }
  };

  const handleChange = (e) => {
    const v = e.target.value;
    setQuery(v);
    setOpen(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => search(v), 300);
  };

  const go = (url) => { navigate(url); setOpen(false); setQuery(''); setResults(null); };

  return (
    <div className="relative hidden md:block" ref={ref} style={{ width: 240 }}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={handleChange}
          onFocus={() => query.length >= 2 && setOpen(true)}
          placeholder="Buscar corte, modelo, persona..."
          className="pl-8 h-8 text-xs bg-muted/40 border-muted focus:bg-background w-full"
          data-testid="global-search-input"
        />
        {loading && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
      {open && results && (
        <div className="absolute top-full mt-1 w-[320px] rounded-xl border bg-card shadow-xl z-50 overflow-hidden">
          {results.registros.length === 0 && results.personas.length === 0 ? (
            <div className="px-4 py-3 text-xs text-muted-foreground">Sin resultados para "{query}"</div>
          ) : (
            <>
              {results.registros.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/30 border-b">Registros</div>
                  {results.registros.map(r => (
                    <button key={r.id} onClick={() => go('/registros/editar/' + r.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors text-left border-b last:border-0">
                      <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <ClipboardList className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold">Corte {r.n_corte}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{r.modelo_nombre} · {r.estado}</p>
                      </div>
                    </button>
                  ))}
                </>
              )}
              {results.personas.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/30 border-b border-t">Personas</div>
                  {results.personas.map(p => (
                    <button key={p.id} onClick={() => go('/maestros/personas')}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors text-left border-b last:border-0">
                      <div className="h-7 w-7 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                        <User className="h-3.5 w-3.5 text-green-700" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold">{p.nombre}</p>
                        <p className="text-[11px] text-muted-foreground">{p.tipo} · {p.servicios?.map(s => s.servicio_nombre).join(', ').substring(0,30)}</p>
                      </div>
                    </button>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Layout principal ────────────────────────────────────────────────────────

export const Layout = () => {
  const { theme, toggleTheme } = useTheme();
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  usePermissions('registros');

  // Modo migración — banner global
  const [modoMigracion, setModoMigracion] = useState(false);
  useEffect(() => {
    axios.get(`${API}/configuracion/modo-migracion`)
      .then(r => setModoMigracion(r.data?.activo || false))
      .catch(() => {});
    // Re-check cada 60s
    const interval = setInterval(() => {
      axios.get(`${API}/configuracion/modo-migracion`)
        .then(r => setModoMigracion(r.data?.activo || false))
        .catch(() => {});
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const filterItems = (items) => {
    if (isAdmin()) return items;
    return items.filter((item) => {
      const tabla = RUTA_A_TABLA[item.to];
      if (!tabla) return true;
      const permisos = user?.permisos || {};
      const perm = permisos[tabla];
      if (!perm) return true;
      return perm.ver !== false;
    });
  };

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('sidebarCollapsed') === 'true';
  });
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });

  const toggleSidebarCollapsed = () => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    localStorage.setItem('sidebarCollapsed', String(next));
  };

  const closeMobileSidebar = () => setSidebarOpen(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      toast.error('Las contraseñas nuevas no coinciden');
      return;
    }
    if (passwordForm.new_password.length < 4) {
      toast.error('La contraseña debe tener al menos 4 caracteres');
      return;
    }
    setPasswordLoading(true);
    try {
      await axios.put(`${API}/auth/change-password`, {
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      });
      toast.success('Contraseña actualizada correctamente');
      setPasswordDialogOpen(false);
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response?.data?.detail : 'Error al cambiar contraseña');
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">

      {/* ── Header ── */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-background/80 border-b flex-shrink-0 header-elevated">
        <div className="flex h-16 items-center px-4 md:px-6">

          <Button
            variant="ghost"
            size="icon"
            className="md:hidden mr-2"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            data-testid="mobile-menu-toggle"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>

          <div className="flex items-center gap-3">
            <div className="logo-badge">
              <Scissors className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight leading-tight">Producción</h1>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <GlobalSearch />
            <NotificacionesBell />

            <Button variant="ghost" size="icon" onClick={toggleTheme} data-testid="theme-toggle">
              {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2" data-testid="user-menu-btn">
                  <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                    {getUserInitials(user)}
                  </div>
                  <span className="hidden md:inline text-sm font-medium">
                    {user?.nombre_completo || user?.username}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span>{user?.nombre_completo || user?.username}</span>
                    <span className="text-xs font-normal text-muted-foreground capitalize">
                      {user?.rol === 'admin'
                        ? 'Administrador'
                        : user?.rol === 'lectura'
                        ? 'Solo Lectura'
                        : 'Usuario'}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {isAdmin() && (
                  <>
                    <DropdownMenuItem onClick={() => navigate('/usuarios')} data-testid="menu-usuarios">
                      <Shield className="h-4 w-4 mr-2" />
                      Gestionar Usuarios
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/historial-actividad')} data-testid="menu-historial">
                      <History className="h-4 w-4 mr-2" />
                      Historial de Actividad
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/backups')} data-testid="menu-backups">
                      <Database className="h-4 w-4 mr-2" />
                      Copias de Seguridad
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/auditoria')} data-testid="menu-auditoria">
                      <ShieldCheck className="h-4 w-4 mr-2" />
                      Auditoría
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuItem onClick={() => setPasswordDialogOpen(true)} data-testid="menu-change-password">
                  <Key className="h-4 w-4 mr-2" />
                  Cambiar Contraseña
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive" data-testid="menu-logout">
                  <LogOut className="h-4 w-4 mr-2" />
                  Cerrar Sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* ── Banner Modo Carga Inicial ── */}
      {modoMigracion && (
        <div className="bg-yellow-400 dark:bg-yellow-600 text-yellow-900 dark:text-yellow-100 text-center text-xs font-semibold py-1.5 px-4 flex items-center justify-center gap-2 flex-shrink-0 z-40">
          <AlertTriangle className="h-3.5 w-3.5" />
          MODO CARGA INICIAL ACTIVO — Las salidas de inventario que ocurran se revertirán al desactivar
          <AlertTriangle className="h-3.5 w-3.5" />
        </div>
      )}

      {/* ── Dialog Contraseña ── */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar Contraseña</DialogTitle>
            <DialogDescription>Ingresa tu contraseña actual y la nueva contraseña</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleChangePassword}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="current_password">Contraseña Actual</Label>
                <Input
                  id="current_password"
                  type="password"
                  value={passwordForm.current_password}
                  onChange={(e) => setPasswordForm({ ...passwordForm, current_password: e.target.value })}
                  placeholder="Tu contraseña actual"
                  required
                  disabled={passwordLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new_password">Nueva Contraseña</Label>
                <Input
                  id="new_password"
                  type="password"
                  value={passwordForm.new_password}
                  onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                  placeholder="Tu nueva contraseña"
                  required
                  disabled={passwordLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm_password">Confirmar Nueva Contraseña</Label>
                <Input
                  id="confirm_password"
                  type="password"
                  value={passwordForm.confirm_password}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
                  placeholder="Repite la nueva contraseña"
                  required
                  disabled={passwordLoading}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPasswordDialogOpen(false)} disabled={passwordLoading}>
                Cancelar
              </Button>
              <Button type="submit" disabled={passwordLoading}>
                {passwordLoading
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando...</>
                  : 'Guardar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* ── Sidebar ── */}
        <aside className={`
          fixed inset-y-0 left-0 z-40 transform sidebar-bg border-r pt-16 transition-all duration-300 ease-in-out
          md:translate-x-0 md:relative md:pt-0 md:flex-shrink-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          ${sidebarCollapsed ? 'md:w-16' : 'md:w-60'} w-64
        `}>

          {/* Botón colapsar desktop */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebarCollapsed}
            className="absolute -right-3 top-20 z-50 hidden md:flex h-6 w-6 rounded-full border bg-background shadow-md hover:bg-accent"
            data-testid="sidebar-toggle"
          >
            {sidebarCollapsed
              ? <ChevronRight className="h-3 w-3" />
              : <ChevronLeft className="h-3 w-3" />}
          </Button>

          <nav
            className={`flex flex-col p-3 overflow-y-auto h-full gap-0.5 ${sidebarCollapsed ? 'md:items-center md:px-2' : ''}`}
            data-testid="sidebar-nav"
          >

            {/* ── Producción — siempre visible, expandido por defecto ── */}
            <NavGroup
              label="Producción"
              storageKey="produccion"
              defaultOpen={true}
              items={filterItems(operacionesItems)}
              collapsed={sidebarCollapsed}
              onItemClick={closeMobileSidebar}
              dotColor="bg-blue-500"
            />

            {/* ── Inventario — expandido por defecto ── */}
            <NavGroup
              label="Inventario"
              storageKey="inventario"
              defaultOpen={true}
              items={filterItems(inventarioItems)}
              collapsed={sidebarCollapsed}
              onItemClick={closeMobileSidebar}
              dotColor="bg-green-500"
            />

            {/* ── Reportes — expandido por defecto ── */}
            <NavGroup
              label="Reportes"
              storageKey="reportes"
              defaultOpen={true}
              items={filterItems(reportesItems)}
              collapsed={sidebarCollapsed}
              onItemClick={closeMobileSidebar}
              dotColor="bg-purple-500"
            />

            {/* ── Catálogos — cerrado por defecto ── */}
            <NavGroup
              label="Catálogos"
              storageKey="catalogos"
              defaultOpen={false}
              items={filterItems(catalogosItems)}
              collapsed={sidebarCollapsed}
              onItemClick={closeMobileSidebar}
              dotColor="bg-gray-400"
            />

            {/* ── Maestros — cerrado por defecto ── */}
            <NavGroup
              label="Maestros"
              storageKey="maestros"
              defaultOpen={false}
              items={filterItems(maestrosItems)}
              collapsed={sidebarCollapsed}
              onItemClick={closeMobileSidebar}
              dotColor="bg-gray-400"
            />

            {/* ── Configuración — solo admin, cerrado por defecto ── */}
            {isAdmin() && (
              <NavGroup
                label="Configuración"
                storageKey="configuracion"
                defaultOpen={false}
                items={configItems}
                collapsed={sidebarCollapsed}
                onItemClick={closeMobileSidebar}
                dotColor="bg-red-500"
              />
            )}

            {/* ── Avatar usuario ── */}
            <div className="mt-auto pt-4 border-t border-border/50">
              <div className={`flex items-center gap-3 px-3 py-2 ${sidebarCollapsed ? 'md:justify-center md:px-0' : ''}`}>
                <div className="user-avatar-initials" title={user?.nombre_completo || user?.username}>
                  {getUserInitials(user)}
                </div>
                {!sidebarCollapsed && (
                  <div className="hidden md:block min-w-0">
                    <p className="text-sm font-medium truncate">{user?.nombre_completo || user?.username}</p>
                    <p className="text-[10px] text-muted-foreground capitalize">
                      {user?.rol === 'admin' ? 'Administrador' : user?.rol === 'lectura' ? 'Solo Lectura' : 'Usuario'}
                    </p>
                  </div>
                )}
              </div>
            </div>

          </nav>
        </aside>

        {/* Overlay mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/50 md:hidden"
            onClick={closeMobileSidebar}
          />
        )}

        {/* Contenido principal */}
        <main
          className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 min-w-0 p-4 md:p-6"
          id="main-content"
        >
          <ScrollToTop />
          <Outlet />
        </main>

      </div>
    </div>
  );
};
