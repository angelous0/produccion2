import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem('token'));
  // Empresa fija en 7 (AMBISSION INDUSTRIES S.A.C.). Es la única con datos
  // reales y evita confusiones por cambios accidentales en localStorage.
  // Si en el futuro se necesita multi-empresa, basta con quitar este lock.
  const EMPRESA_FIJA = 7;
  const [empresaId, setEmpresaId] = useState(() => {
    // Sobrescribe cualquier valor previo (puede haber quedado un 8 viejo)
    localStorage.setItem('empresa_id', String(EMPRESA_FIJA));
    return EMPRESA_FIJA;
  });

  // Configurar axios con el token
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  }, [token]);

  // Toggle de clase 'readonly-mode' en <html> para que el CSS global
  // deshabilite inputs y oculte botones de escritura.
  useEffect(() => {
    const root = document.documentElement;
    if (user?.rol === 'lectura') {
      root.classList.add('readonly-mode');
    } else {
      root.classList.remove('readonly-mode');
    }
    return () => root.classList.remove('readonly-mode');
  }, [user?.rol]);

  // Interceptor para manejar token expirado (401)
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401 && token) {
          // Token expirado o inválido - cerrar sesión automáticamente
          localStorage.removeItem('token');
          setToken(null);
          setUser(null);
          delete axios.defaults.headers.common['Authorization'];
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
    return () => axios.interceptors.response.eject(interceptor);
  }, [token]);

  // Verificar token al cargar + cargar empresa activa
  useEffect(() => {
    const verifyToken = async () => {
      const savedToken = localStorage.getItem('token');
      if (!savedToken) {
        setLoading(false);
        return;
      }

      try {
        axios.defaults.headers.common['Authorization'] = `Bearer ${savedToken}`;
        const response = await axios.get(`${API}/auth/me`);
        setUser(response.data);
        setToken(savedToken);

        // Empresa fija en EMPRESA_FIJA (7). No se consulta el backend.
        // Garantiza que cada sesión arranque con la empresa correcta sin
        // depender de localStorage previo.
        localStorage.setItem('empresa_id', String(EMPRESA_FIJA));
        setEmpresaId(EMPRESA_FIJA);
      } catch (error) {
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    verifyToken();
  }, []);

  const login = async (username, password) => {
    const response = await axios.post(`${API}/auth/login`, { username, password });
    const { access_token, user: userData } = response.data;
    
    localStorage.setItem('token', access_token);
    setToken(access_token);
    setUser(userData);
    
    return userData;
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    delete axios.defaults.headers.common['Authorization'];
  };

  const hasPermission = (tabla, accion) => {
    if (!user) return false;
    
    // Admin tiene todos los permisos
    if (user.rol === 'admin') return true;
    
    // Lectura solo puede ver
    if (user.rol === 'lectura') return accion === 'ver';
    
    // Usuario: verificar permisos personalizados
    const permisos = user.permisos || {};
    const tablaPermisos = permisos[tabla] || {};
    return tablaPermisos[accion] === true;
  };

  const canView = (tabla) => hasPermission(tabla, 'ver');
  const canCreate = (tabla) => hasPermission(tabla, 'crear');
  const canEdit = (tabla) => hasPermission(tabla, 'editar');
  const canDelete = (tabla) => hasPermission(tabla, 'eliminar');

  const isAdmin = () => user?.rol === 'admin';

  // updateEmpresaId quedó bloqueada por la decisión de fijar empresa en 7.
  // Cualquier intento de cambio (ej. desde ConfigEmpresa) se ignora.
  // Para volver a habilitar multi-empresa, restaurar el cuerpo previo.
  // eslint-disable-next-line no-unused-vars
  const updateEmpresaId = (_id) => {
    localStorage.setItem('empresa_id', String(EMPRESA_FIJA));
    setEmpresaId(EMPRESA_FIJA);
  };

  const value = {
    user,
    token,
    loading,
    login,
    logout,
    hasPermission,
    canView,
    canCreate,
    canEdit,
    canDelete,
    isAdmin,
    isAuthenticated: !!user,
    empresaId,
    updateEmpresaId,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
