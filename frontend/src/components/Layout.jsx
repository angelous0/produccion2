import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
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
} from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';
import { NotificacionesBell } from './NotificacionesBell';
import { usePermissions, RUTA_A_TABLA } from '../hooks/usePermissions';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ── Grupos de navegación ────────────────────────────────────────────────────

const operacionesItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/registros', icon: ClipboardList, label: 'Registros' },
  { to: '/reportes/seguimiento', icon: Activity, label: 'Seguimiento' },
];

const inventarioItems = [
  { to: '/inventario', icon: Package, label: 'Inventario' },
  { to: '/inventario/ingresos', icon: ArrowDownCircle, label: 'Ingresos' },
  { to: '/inventario/salidas', icon: ArrowUpCircle, label: 'Salidas' },
  { to: '/inventario/ajustes', icon: RefreshCw, label: 'Ajustes' },
  { to: '/inventario/rollos', icon: Layers, label: 'Rollos' },
  { to: '/inventario/movimientos', icon: FileText, label: 'Movimientos' },
  { to: '/inventario/kardex', icon: BookOpen, label: 'Kardex' },
  { to: '/inventario/kardex-pt', icon: BookOpen, label: 'Kardex PT' },
  { to: '/inventario/alertas-stock', icon: PackageX, label: 'Alertas Stock' },
  { to: '/inventario/transferencias-linea', icon: ArrowRightLeft, label: 'Transferencias' },
];

const reportesItems = [
  { to: '/reportes/matriz', icon: Grid3X3, label: 'Matriz Dinámica' },
  { to: '/reportes/operativo', icon: Users, label: 'Operativo & Terceros' },
  { to: '/reportes/lotes', icon: GitBranch, label: 'Lotes & Trazabilidad' },
  { to: '/reportes/valorizacion', icon: Package, label: 'Valorización' },
  { to: '/reportes/calidad', icon: Shield, label: 'Calidad' },
];

const catalogosItems = [
  { to: '/marcas', icon: Tag, label: 'Marcas' },
  { to: '/tipos', icon: Layers, label: 'Tipos' },
  { to: '/entalles', icon: Shirt, label: 'Entalles' },
  { to: '/telas', icon: Palette, label: 'Telas' },
  { to: '/hilos', icon: Scissors, label: 'Hilos' },
  { to: '/hilos-especificos', icon: Sparkles, label: 'Hilos Específicos' },
  { to: '/tallas-catalogo', icon: Ruler, label: 'Tallas' },
  { to: '/colores-catalogo', icon: Droplets, label: 'Colores' },
  { to: '/colores-generales', icon: Palette, label: 'Colores Generales' },
  { to: '/bases', icon: Layers, label: 'Bases' },
  { to: '/modelos', icon: Box, label: 'Modelos' },
];

const maestrosItems = [
  { to: '/maestros/servicios', icon: Cog, label: 'Servicios' },
  { to: '/maestros/personas', icon: Users, label: 'Personas' },
  { to: '/maestros/rutas', icon: Route, label: 'Rutas' },
  { to: '/maestros/movimientos', icon: Play, label: 'Movimientos' },
  { to: '/maestros/productividad', icon: BarChart3, label: 'Productividad' },
  { to: '/guias', icon: FileText, label: 'Guías de Remisión' },
];

const configItems = [
  { to: '/usuarios', icon: Shield, label: 'Usuarios' },
  { to: '/historial-actividad', icon: History, label: 'Historial' },
  { to: '/auditoria', icon: ShieldCheck, label: 'Auditoría' },
  { to: '/backups', icon: Database, label: 'Backups' },
];

// ── Grupo colapsable ────────────────────────────────────────────────────────

function NavGroup({ label, items, collapsed: sidebarCollapsed, storageKey, defaultOpen = false, onItemClick }) {
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
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
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
            end={item.to === '/inventario'}
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

// ── Layout principal ────────────────────────────────────────────────────────

export const Layout = () => {
  const { theme, toggleTheme } = useTheme();
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  usePermissions('registros');

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
      toast.error(error.response?.data?.detail || 'Error al cambiar contraseña');
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">

      {/* ── Header ── */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-background/80 border-b flex-shrink-0">
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

          <div className="flex items-center gap-2">
            <Scissors className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold tracking-tight">Producción Textil</h1>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <NotificacionesBell />

            <Button variant="ghost" size="icon" onClick={toggleTheme} data-testid="theme-toggle">
              {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2" data-testid="user-menu-btn">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-4 w-4 text-primary" />
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
          fixed inset-y-0 left-0 z-40 transform bg-card border-r pt-16 transition-all duration-300 ease-in-out
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

            {/* ── Operaciones — siempre visible ── */}
            {filterItems(operacionesItems).map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={closeMobileSidebar}
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

            {/* ── Inventario — expandido por defecto ── */}
            <NavGroup
              label="Inventario"
              storageKey="inventario"
              defaultOpen={true}
              items={filterItems(inventarioItems)}
              collapsed={sidebarCollapsed}
              onItemClick={closeMobileSidebar}
            />

            {/* ── Reportes — expandido por defecto ── */}
            <NavGroup
              label="Reportes"
              storageKey="reportes"
              defaultOpen={true}
              items={filterItems(reportesItems)}
              collapsed={sidebarCollapsed}
              onItemClick={closeMobileSidebar}
            />

            {/* ── Catálogos — cerrado por defecto ── */}
            <NavGroup
              label="Catálogos"
              storageKey="catalogos"
              defaultOpen={false}
              items={filterItems(catalogosItems)}
              collapsed={sidebarCollapsed}
              onItemClick={closeMobileSidebar}
            />

            {/* ── Maestros — cerrado por defecto ── */}
            <NavGroup
              label="Maestros"
              storageKey="maestros"
              defaultOpen={false}
              items={filterItems(maestrosItems)}
              collapsed={sidebarCollapsed}
              onItemClick={closeMobileSidebar}
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
              />
            )}

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
          className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 min-w-0 p-6 md:p-8"
          id="main-content"
        >
          <ScrollToTop />
          <Outlet />
        </main>

      </div>
    </div>
  );
};
