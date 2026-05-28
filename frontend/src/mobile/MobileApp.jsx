import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MobileLayout } from './MobileLayout';
import { MobileHome } from './pages/Home';
import { MobileRegistrosList } from './pages/RegistrosList';
import { MobileRegistroDetalle } from './pages/RegistroDetalle';
import { MobileDescargaMP } from './pages/DescargaMP';
import { MobileNuevoMovimiento } from './pages/NuevoMovimiento';
import { MobileMaterialesRegistro } from './pages/MaterialesRegistro';
import { MobileMovimientosRegistro } from './pages/MovimientosRegistro';
import { MobileMovimientoDetalle } from './pages/MovimientoDetalle';
import { MobileNuevaIncidencia } from './pages/NuevaIncidencia';
import { MobileNuevoFallado } from './pages/NuevoFallado';
import { MobileArreglosRegistro } from './pages/ArreglosRegistro';
import { MobileIncidenciasRegistro } from './pages/IncidenciasRegistro';
import { MobileChatRegistro } from './pages/ChatRegistro';
import { MobileTallasRegistro } from './pages/TallasRegistro';
import { MobileEditarTallas } from './pages/EditarTallas';
import { MobileNuevoCorte } from './pages/NuevoCorte';
import { MobileNotificaciones } from './pages/Notificaciones';
import { MobileCerrarCorte } from './pages/CerrarCorte';
import { MobileCobroArreglos } from './pages/CobroArreglos';
import { MobileProrrogaArreglo } from './pages/ProrrogaArreglo';
import { MobileIngresosMP } from './pages/IngresosMP';
import { MobileNuevoIngresoMP } from './pages/NuevoIngresoMP';
import { MobileIngresoDetalle } from './pages/IngresoDetalle';
import { MobileSalidasLibres } from './pages/SalidasLibres';
import { MobileNuevaSalidaLibre } from './pages/NuevaSalidaLibre';
import { MobileReservasRegistro } from './pages/ReservasRegistro';
import { MobileEscanearQR } from './pages/EscanearQR';
import { MobileEditarMatrizColores } from './pages/EditarMatrizColores';
import { MobileMuestrasLavanderia } from './pages/MuestrasLavanderia';
import { MobileNuevaMuestraLavanderia } from './pages/NuevaMuestraLavanderia';
import { MobileCostosRegistro } from './pages/CostosRegistro';
import { MobileQRCorte } from './pages/QRCorte';
import { MobileHistorial } from './pages/Historial';
import { MobilePlaceholder } from './pages/Placeholder';
import { MobileMiPerfil } from './pages/MiPerfil';
import { MobileLogin } from './pages/Login';
import { Loader2 } from 'lucide-react';

/**
 * Guard interno de mobile: si no está autenticado, redirige a /m/login
 * (no al login admin de /login).
 */
const MobileProtected = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#f9fafb',
      }}>
        <Loader2 className="m-spin" size={32} style={{ color: '#0f766e' }} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/m/login" replace state={{ from: location }} />;
  }

  return children;
};

/**
 * Si el usuario ya está logueado y entra a /m/login, lo manda al home mobile.
 */
const MobilePublic = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0f766e',
      }}>
        <Loader2 className="m-spin" size={32} style={{ color: 'white' }} />
      </div>
    );
  }
  if (isAuthenticated) {
    return <Navigate to="/m" replace />;
  }
  return children;
};

export const MobileApp = () => {
  return (
    <Routes>
      {/* Login mobile (público) */}
      <Route path="login" element={
        <MobilePublic>
          <MobileLogin />
        </MobilePublic>
      } />

      {/* Resto de pantallas (protegidas, dentro del Layout mobile) */}
      <Route element={
        <MobileProtected>
          <MobileLayout />
        </MobileProtected>
      }>
        <Route index element={<MobileHome />} />
        <Route path="registros" element={<MobileRegistrosList />} />
        <Route path="registros/nuevo" element={<MobileNuevoCorte />} />
        <Route path="registros/:id" element={<MobileRegistroDetalle />} />
        <Route path="registros/:id/descarga-mp" element={<MobileDescargaMP />} />
        <Route path="registros/:id/nuevo-movimiento" element={<MobileNuevoMovimiento />} />
        <Route path="registros/:id/materiales" element={<MobileMaterialesRegistro />} />
        <Route path="registros/:id/movimientos" element={<MobileMovimientosRegistro />} />
        <Route path="registros/:id/movimientos/:movId" element={<MobileMovimientoDetalle />} />
        <Route path="registros/:id/nueva-incidencia" element={<MobileNuevaIncidencia />} />
        <Route path="registros/:id/nuevo-fallado" element={<MobileNuevoFallado />} />
        <Route path="registros/:id/arreglos" element={<MobileArreglosRegistro />} />
        <Route path="registros/:id/arreglos/:arregloId/prorroga" element={<MobileProrrogaArreglo />} />
        <Route path="registros/:id/incidencias" element={<MobileIncidenciasRegistro />} />
        <Route path="registros/:id/chat" element={<MobileChatRegistro />} />
        <Route path="registros/:id/tallas" element={<MobileTallasRegistro />} />
        <Route path="registros/:id/tallas/editar" element={<MobileEditarTallas />} />
        <Route path="registros/:id/matriz-colores" element={<MobileEditarMatrizColores />} />
        <Route path="registros/:id/muestras-lavanderia" element={<MobileMuestrasLavanderia />} />
        <Route path="registros/:id/nueva-muestra-lavanderia" element={<MobileNuevaMuestraLavanderia />} />
        <Route path="registros/:id/costos" element={<MobileCostosRegistro />} />
        <Route path="registros/:id/reservas" element={<MobileReservasRegistro />} />
        <Route path="registros/:id/qr" element={<MobileQRCorte />} />
        <Route path="registros/:id/cerrar" element={<MobileCerrarCorte />} />
        <Route path="historial" element={<MobileHistorial />} />
        <Route path="notificaciones" element={<MobileNotificaciones />} />
        <Route path="cobro" element={<MobileCobroArreglos />} />
        <Route path="ingresos" element={<MobileIngresosMP />} />
        <Route path="ingresos/nuevo" element={<MobileNuevoIngresoMP />} />
        <Route path="ingresos/:id" element={<MobileIngresoDetalle />} />
        <Route path="salidas-libres" element={<MobileSalidasLibres />} />
        <Route path="salidas-libres/nueva" element={<MobileNuevaSalidaLibre />} />
        <Route path="yo" element={<MobileMiPerfil />} />
        <Route path="escanear" element={<MobileEscanearQR />} />
        <Route path="*" element={<Navigate to="/m" replace />} />
      </Route>
    </Routes>
  );
};

export default MobileApp;
