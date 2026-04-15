import "@/App.css";
import React, { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "./components/ui/sonner";
import { ThemeProvider } from "./context/ThemeContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Registros } from "./pages/Registros";
import { RegistroForm } from "./pages/RegistroForm";
import { Loader2 } from "lucide-react";

// Lazy imports - se cargan solo cuando se navega a la ruta
const AgendaEntregas = lazy(() => import('./pages/AgendaEntregas'));
const CostoPorLote = lazy(() => import('./pages/CostoPorLote'));
const TendenciaFallados = lazy(() => import('./pages/TendenciaFallados'));
const DashboardEjecutivo = lazy(() => import('./pages/DashboardEjecutivo'));
const ReporteAlertas = lazy(() => import('./pages/ReporteAlertas'));
const ReporteEntregas = lazy(() => import('./pages/ReporteEntregas'));
const Usuarios = lazy(() => import("./pages/Usuarios").then(m => ({ default: m.Usuarios })));
const HistorialActividad = lazy(() => import("./pages/HistorialActividad").then(m => ({ default: m.HistorialActividad })));
const Backups = lazy(() => import("./pages/Backups").then(m => ({ default: m.Backups })));
const ConfigEmpresa = lazy(() => import("./pages/ConfigEmpresa"));
const Marcas = lazy(() => import("./pages/Marcas").then(m => ({ default: m.Marcas })));
const Tipos = lazy(() => import("./pages/Tipos").then(m => ({ default: m.Tipos })));
const Entalles = lazy(() => import("./pages/Entalles").then(m => ({ default: m.Entalles })));
const Telas = lazy(() => import("./pages/Telas").then(m => ({ default: m.Telas })));
const Hilos = lazy(() => import("./pages/Hilos").then(m => ({ default: m.Hilos })));
const ImportRegistros = lazy(() => import("./pages/ImportRegistros"));
const TallasCatalogo = lazy(() => import("./pages/TallasCatalogo").then(m => ({ default: m.TallasCatalogo })));
const ColoresCatalogo = lazy(() => import("./pages/ColoresCatalogo").then(m => ({ default: m.ColoresCatalogo })));
const ColoresGenerales = lazy(() => import("./pages/ColoresGenerales").then(m => ({ default: m.ColoresGenerales })));
const ModelosLazy = lazy(() => import("./pages/Modelos").then(m => ({ default: m.Modelos })));
const ModelosBasesLazy = lazy(() => import("./pages/Modelos").then(m => ({ default: m.ModelosBases })));
const ModelosVariantesLazy = lazy(() => import("./pages/Modelos").then(m => ({ default: m.ModelosVariantes })));
const Inventario = lazy(() => import("./pages/Inventario").then(m => ({ default: m.Inventario })));
const InventarioIngresos = lazy(() => import("./pages/InventarioIngresos").then(m => ({ default: m.InventarioIngresos })));
const InventarioSalidas = lazy(() => import("./pages/InventarioSalidas").then(m => ({ default: m.InventarioSalidas })));
const InventarioAjustes = lazy(() => import("./pages/InventarioAjustes").then(m => ({ default: m.InventarioAjustes })));
const InventarioRollos = lazy(() => import("./pages/InventarioRollos").then(m => ({ default: m.InventarioRollos })));
const ReporteMovimientos = lazy(() => import("./pages/ReporteMovimientos").then(m => ({ default: m.ReporteMovimientos })));
const Kardex = lazy(() => import("./pages/Kardex").then(m => ({ default: m.Kardex })));
const KardexPT = lazy(() => import("./pages/KardexPT").then(m => ({ default: m.KardexPT })));
const ServiciosProduccion = lazy(() => import("./pages/ServiciosProduccion").then(m => ({ default: m.ServiciosProduccion })));
const PersonasProduccion = lazy(() => import("./pages/PersonasProduccion").then(m => ({ default: m.PersonasProduccion })));
const MovimientosProduccion = lazy(() => import("./pages/MovimientosProduccion").then(m => ({ default: m.MovimientosProduccion })));
const ReporteProductividad = lazy(() => import("./pages/ReporteProductividad").then(m => ({ default: m.ReporteProductividad })));
const RutasProduccion = lazy(() => import("./pages/RutasProduccion").then(m => ({ default: m.RutasProduccion })));
const MotivosIncidenciaPage = lazy(() => import("./pages/MotivosIncidencia").then(m => ({ default: m.MotivosIncidencia })));
const GuiasRemision = lazy(() => import("./pages/GuiasRemision").then(m => ({ default: m.GuiasRemision })));
const HilosEspecificos = lazy(() => import("./pages/HilosEspecificos").then(m => ({ default: m.HilosEspecificos })));
const ReporteTrazabilidad = lazy(() => import("./pages/ReporteTrazabilidad").then(m => ({ default: m.ReporteTrazabilidad })));
const MatrizProduccion = lazy(() => import("./pages/MatrizProduccion").then(m => ({ default: m.MatrizProduccion })));
const RendimientoServicios = lazy(() => import("./pages/RendimientoServicios"));
const ReporteStockBajo = lazy(() => import("./pages/ReporteStockBajo").then(m => ({ default: m.ReporteStockBajo })));
const SeguimientoProduccion = lazy(() => import("./pages/SeguimientoProduccion").then(m => ({ default: m.SeguimientoProduccion })));
const OperativoTerceros = lazy(() => import("./pages/OperativoTerceros").then(m => ({ default: m.OperativoTerceros })));
const LotesTrazabilidad = lazy(() => import("./pages/LotesTrazabilidad").then(m => ({ default: m.LotesTrazabilidad })));
const TransferenciasLinea = lazy(() => import("./pages/TransferenciasLinea").then(m => ({ default: m.TransferenciasLinea })));
const AuditoriaLogs = lazy(() => import("./pages/AuditoriaLogs").then(m => ({ default: m.AuditoriaLogs })));
const ValorizacionConsolidado = lazy(() => import("./pages/ValorizacionConsolidado").then(m => ({ default: m.ValorizacionConsolidado })));
const CalidadConsolidado = lazy(() => import("./pages/CalidadConsolidado").then(m => ({ default: m.CalidadConsolidado })));
const SalidasLibres = lazy(() => import("./pages/SalidasLibres").then(m => ({ default: m.SalidasLibres })));
const Muestras = lazy(() => import("./pages/Muestras").then(m => ({ default: m.Muestras })));
const MuestraDetalle = lazy(() => import("./pages/MuestraDetalle").then(m => ({ default: m.MuestraDetalle })));

const LazyFallback = () => (
  <div className="flex items-center justify-center h-64">
    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
  </div>
);

const LazyWrap = ({ children }) => <Suspense fallback={<LazyFallback />}>{children}</Suspense>;

// Componente de ruta protegida
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

// Componente para rutas públicas (login)
const PublicRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  
  return children;
};

function AppRoutes() {
  return (
    <Routes>
      {/* Ruta pública - Login */}
      <Route path="/login" element={
        <PublicRoute>
          <Login />
        </PublicRoute>
      } />
      
      {/* Rutas protegidas */}
      <Route path="/" element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }>
        <Route index element={<Dashboard />} />
        <Route path="usuarios" element={<LazyWrap><Usuarios /></LazyWrap>} />
        <Route path="auditoria" element={<LazyWrap><AuditoriaLogs /></LazyWrap>} />
        <Route path="historial-actividad" element={<LazyWrap><HistorialActividad /></LazyWrap>} />
        <Route path="backups" element={<LazyWrap><Backups /></LazyWrap>} />
        <Route path="config-empresa" element={<LazyWrap><ConfigEmpresa /></LazyWrap>} />
        <Route path="marcas" element={<LazyWrap><Marcas /></LazyWrap>} />
        <Route path="tipos" element={<LazyWrap><Tipos /></LazyWrap>} />
        <Route path="entalles" element={<LazyWrap><Entalles /></LazyWrap>} />
        <Route path="telas" element={<LazyWrap><Telas /></LazyWrap>} />
        <Route path="hilos" element={<LazyWrap><Hilos /></LazyWrap>} />
        <Route path="hilos-especificos" element={<LazyWrap><HilosEspecificos /></LazyWrap>} />
        <Route path="tallas-catalogo" element={<LazyWrap><TallasCatalogo /></LazyWrap>} />
        <Route path="colores-catalogo" element={<LazyWrap><ColoresCatalogo /></LazyWrap>} />
        <Route path="colores-generales" element={<LazyWrap><ColoresGenerales /></LazyWrap>} />
        <Route path="bases" element={<LazyWrap><ModelosBasesLazy /></LazyWrap>} />
        <Route path="modelos" element={<LazyWrap><ModelosVariantesLazy /></LazyWrap>} />
        <Route path="registros" element={<Registros />} />
        <Route path="registros/nuevo" element={<RegistroForm />} />
        <Route path="registros/editar/:id" element={<RegistroForm />} />
        <Route path="registros/importar" element={<LazyWrap><ImportRegistros /></LazyWrap>} />
        <Route path="inventario" element={<LazyWrap><Inventario /></LazyWrap>} />
        <Route path="inventario/ingresos" element={<LazyWrap><InventarioIngresos /></LazyWrap>} />
        <Route path="inventario/salidas" element={<LazyWrap><InventarioSalidas /></LazyWrap>} />
        <Route path="inventario/ajustes" element={<LazyWrap><InventarioAjustes /></LazyWrap>} />
        <Route path="inventario/rollos" element={<LazyWrap><InventarioRollos /></LazyWrap>} />
        <Route path="inventario/movimientos" element={<LazyWrap><ReporteMovimientos /></LazyWrap>} />
        <Route path="inventario/kardex" element={<LazyWrap><Kardex /></LazyWrap>} />
        <Route path="inventario/kardex-pt" element={<LazyWrap><KardexPT /></LazyWrap>} />
        <Route path="inventario/alertas-stock" element={<LazyWrap><ReporteStockBajo /></LazyWrap>} />
        <Route path="inventario/transferencias-linea" element={<LazyWrap><TransferenciasLinea /></LazyWrap>} />
        <Route path="inventario/salidas-libres" element={<LazyWrap><SalidasLibres /></LazyWrap>} />
        <Route path="muestras" element={<LazyWrap><Muestras /></LazyWrap>} />
        <Route path="muestras/:id" element={<LazyWrap><MuestraDetalle /></LazyWrap>} />
        <Route path="maestros/servicios" element={<LazyWrap><ServiciosProduccion /></LazyWrap>} />
        <Route path="maestros/personas" element={<LazyWrap><PersonasProduccion /></LazyWrap>} />
        <Route path="maestros/rutas" element={<LazyWrap><RutasProduccion /></LazyWrap>} />
        <Route path="maestros/movimientos" element={<LazyWrap><MovimientosProduccion /></LazyWrap>} />
        <Route path="maestros/productividad" element={<LazyWrap><ReporteProductividad /></LazyWrap>} />
        <Route path="maestros/motivos-incidencia" element={<LazyWrap><MotivosIncidenciaPage /></LazyWrap>} />
        <Route path="guias" element={<LazyWrap><GuiasRemision /></LazyWrap>} />
        {/* Rutas consolidadas */}
        <Route path="reportes/seguimiento" element={<LazyWrap><SeguimientoProduccion /></LazyWrap>} />
        <Route path="reportes/operativo" element={<LazyWrap><OperativoTerceros /></LazyWrap>} />
        <Route path="reportes/lotes" element={<LazyWrap><LotesTrazabilidad /></LazyWrap>} />
        <Route path="reportes/valorizacion" element={<LazyWrap><ValorizacionConsolidado /></LazyWrap>} />
        <Route path="reportes/calidad" element={<LazyWrap><CalidadConsolidado /></LazyWrap>} />
        <Route path="reportes/dashboard-ejecutivo" element={<LazyWrap><DashboardEjecutivo /></LazyWrap>} />
        <Route path="reportes/alertas" element={<LazyWrap><ReporteAlertas /></LazyWrap>} />
        
        <Route path="reportes/agenda-entregas" element={<LazyWrap><AgendaEntregas /></LazyWrap>} />
        <Route path="reportes/costo-lote" element={<LazyWrap><CostoPorLote /></LazyWrap>} />
        <Route path="reportes/tendencia-fallados" element={<LazyWrap><TendenciaFallados /></LazyWrap>} />
        <Route path="reportes/entregas" element={<LazyWrap><ReporteEntregas /></LazyWrap>} />
        <Route path="control-fallados" element={<Navigate to="/reportes/calidad?tab=fallados" replace />} />
        <Route path="reportes/matriz" element={<LazyWrap><MatrizProduccion /></LazyWrap>} />
        <Route path="reportes/rendimiento-servicios" element={<LazyWrap><RendimientoServicios /></LazyWrap>} />
        <Route path="reportes/trazabilidad/:registroId" element={<LazyWrap><ReporteTrazabilidad /></LazyWrap>} />
        {/* Legacy redirects */}
        <Route path="reportes/dashboard" element={<Navigate to="/" replace />} />
        <Route path="reportes/en-proceso" element={<Navigate to="/reportes/seguimiento" replace />} />
        <Route path="reportes/wip-etapa" element={<Navigate to="/reportes/seguimiento?tab=wip-etapa" replace />} />
        <Route path="reportes/atrasados" element={<Navigate to="/reportes/seguimiento?tab=atrasados" replace />} />
        <Route path="reportes/cumplimiento-ruta" element={<Navigate to="/reportes/seguimiento?tab=cumplimiento" replace />} />
        <Route path="reportes/balance-terceros" element={<Navigate to="/reportes/operativo?tab=balance" replace />} />
        <Route path="reportes/costura" element={<Navigate to="/reportes/operativo?tab=operativo" replace />} />
        <Route path="reportes/tiempos-muertos" element={<Navigate to="/reportes/operativo?tab=tiempos" replace />} />
        <Route path="reportes/lotes-fraccionados" element={<Navigate to="/reportes/lotes" replace />} />
        <Route path="reportes/trazabilidad-general" element={<Navigate to="/reportes/lotes?tab=trazabilidad" replace />} />
        <Route path="reportes/mp-valorizado" element={<Navigate to="/reportes/valorizacion" replace />} />
        <Route path="reportes/wip" element={<Navigate to="/reportes/valorizacion?tab=wip" replace />} />
        <Route path="reportes/pt-valorizado" element={<Navigate to="/reportes/valorizacion?tab=pt" replace />} />
        <Route path="calidad/merma" element={<Navigate to="/reportes/calidad?tab=mermas" replace />} />
        <Route path="calidad/reporte-mermas" element={<Navigate to="/reportes/calidad?tab=resumen-calidad" replace />} />
        <Route path="reportes/estados-item" element={<Navigate to="/reportes/calidad?tab=estados" replace />} />
      </Route>
      
      {/* Redirigir cualquier ruta desconocida a login */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
