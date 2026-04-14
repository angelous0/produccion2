import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import React from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { formatCurrency } from '../lib/utils';
import { useSaving } from '../hooks/useSaving';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Save, Scissors, FileText } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { ClipboardList, Play, ShieldAlert, Package, Activity, Clock, AlertTriangle as AlertTriangleIcon, ArrowRight, MessageCircle, Cog } from 'lucide-react';
import { toast } from 'sonner';
import { SalidaRollosDialog } from '../components/SalidaRollosDialog';
import { TrazabilidadPanel } from '../components/TrazabilidadPanel';
import { ArreglosPanel } from '../components/ArreglosPanel';
import MaterialesTab from '../components/MaterialesTab';
import { DistribucionPTPanel } from '../components/registro/DistribucionPTPanel';
import { ConversacionPanel, ConversacionTrigger } from '../components/ConversacionPanel';
import { ConversacionInline } from '../components/ConversacionInline';
import { CostosTab, CierreTab } from './RegistroDetalleFase2';
import { useAuth } from '../context/AuthContext';
import usePermissions from '../hooks/usePermissions';

// Subcomponentes modulares
import {
  RegistroHeader, RegistroDatosCard, RegistroTallasCard,
  RegistroMovimientosCard, RegistroIncidenciasCard, RegistroPanelLateral,
  ColoresDialog, MovimientoDialog, IncidenciaDialog,
  SugerenciaEstadoDialog, SugerenciaMovDialog, ForzarEstadoDialog,
  RetrocesoEstadoDialog, AdvertenciaCantidadDialog,
  DivisionDialog, SalidaInventarioDialog,
} from '../components/registro';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const getErrorMsg = (error, fallback) => {
  const d = error?.response?.data?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map(e => e.msg || JSON.stringify(e)).join('; ');
  return fallback;
};

export const RegistroForm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const isEditing = Boolean(id);
  const cameFromRegistro = location.state?.fromRegistro;
  const { user } = useAuth();
  const perms = usePermissions('registros');
  const permsMovimientos = usePermissions('movimientos_produccion');
  const permsInventario = usePermissions('inventario_salidas');

  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [convOpen, setConvOpen] = useState(false);
  const [convRefreshKey, setConvRefreshKey] = useState(0);
  const { saving, guard } = useSaving();

  const [formData, setFormData] = useState({
    n_corte: '', modelo_id: '', modelo_manual: null, curva: '', estado: 'Para Corte', urgente: false,
    hilo_especifico_id: '', pt_item_id: '',
    observaciones: '', fecha_entrega_final: '', fecha_inicio_real: '', linea_negocio_id: null,
  });

  const [modoManual, setModoManual] = useState(false);
  const [catalogoMarcas, setCatalogoMarcas] = useState([]);
  const [catalogoTipos, setCatalogoTipos] = useState([]);
  const [catalogoTelas, setCatalogoTelas] = useState([]);
  const [catalogoEntalles, setCatalogoEntalles] = useState([]);
  const [modeloManualForm, setModeloManualForm] = useState({
    marca_id: '', marca_texto: '', marca_modo: 'select',
    tipo_id: '', tipo_texto: '', tipo_modo: 'select',
    tela_id: '', tela_texto: '', tela_modo: 'select',
    entalle_id: '', entalle_texto: '', entalle_modo: 'select',
    nombre_modelo: '', hilo: '', hilo_especifico: '',
  });

  const [modeloSeleccionado, setModeloSeleccionado] = useState(null);
  const [tallasSeleccionadas, setTallasSeleccionadas] = useState([]);
  const [coloresDialogOpen, setColoresDialogOpen] = useState(false);
  const [coloresSeleccionados, setColoresSeleccionados] = useState([]);
  const [matrizCantidades, setMatrizCantidades] = useState({});
  const [distribucionColores, setDistribucionColores] = useState([]);

  const [tallasCatalogo, setTallasCatalogo] = useState([]);
  const [coloresCatalogo, setColoresCatalogo] = useState([]);
  const [modelos, setModelos] = useState([]);
  const [lineasNegocio, setLineasNegocio] = useState([]);
  const [estados, setEstados] = useState([]);
  const [estadosGlobales, setEstadosGlobales] = useState([]);
  const [usaRuta, setUsaRuta] = useState(false);
  const [rutaNombre, setRutaNombre] = useState('');
  const [siguienteEstado, setSiguienteEstado] = useState(null);
  const [itemsInventario, setItemsInventario] = useState([]);
  const [salidasRegistro, setSalidasRegistro] = useState([]);
  const [salidaDialogOpen, setSalidaDialogOpen] = useState(false);
  const [selectedItemInventario, setSelectedItemInventario] = useState(null);
  const [rollosDisponibles, setRollosDisponibles] = useState([]);
  const [selectedRollo, setSelectedRollo] = useState(null);
  const [salidaFormData, setSalidaFormData] = useState({ item_id: '', cantidad: 1, rollo_id: '', observaciones: '' });
  const [rollosDialogOpen, setRollosDialogOpen] = useState(false);
  const [busquedaItem, setBusquedaItem] = useState('');
  const [itemSelectorOpen, setItemSelectorOpen] = useState(false);

  const [movimientosProduccion, setMovimientosProduccion] = useState([]);
  const [serviciosProduccion, setServiciosProduccion] = useState([]);
  const [personasProduccion, setPersonasProduccion] = useState([]);
  const [movimientoDialogOpen, setMovimientoDialogOpen] = useState(false);
  const [editingMovimiento, setEditingMovimiento] = useState(null);
  const [personasFiltradas, setPersonasFiltradas] = useState([]);

  const [cierrePreview, setCierrePreview] = useState(null);
  const [cierreLoading, setCierreLoading] = useState(false);
  const [cierreExistente, setCierreExistente] = useState(null);
  const [ejecutandoCierre, setEjecutandoCierre] = useState(false);
  const [observacionCierre, setObservacionCierre] = useState('');

  const [analisisEstado, setAnalisisEstado] = useState(null);
  const [sugerenciaEstadoDialog, setSugerenciaEstadoDialog] = useState(null);
  const [sugerenciaMovDialog, setSugerenciaMovDialog] = useState(null);
  const [forzarEstadoDialog, setForzarEstadoDialog] = useState(null);
  const [retrocesoDialog, setRetrocesoDialog] = useState(null);
  const [advertenciaCantidadDialog, setAdvertenciaCantidadDialog] = useState(null);
  const [etapasCompletas, setEtapasCompletas] = useState([]);

  const [divisionDialogOpen, setDivisionDialogOpen] = useState(false);
  const [divisionTallas, setDivisionTallas] = useState([]);
  const [divisionInfo, setDivisionInfo] = useState(null);

  const esUltimaEtapa = estados.length > 0 && formData.estado === estados[estados.length - 1];
  const esCierreable = (() => {
    if (etapasCompletas.length > 0) {
      const etapaActual = etapasCompletas.find(e => e.nombre === formData.estado && e.es_cierre === true);
      if (etapaActual) return true;
    }
    return esUltimaEtapa;
  })();

  const [movimientoFormData, setMovimientoFormData] = useState({
    servicio_id: '', persona_id: '', fecha_inicio: '', fecha_fin: '',
    cantidad_enviada: 0, cantidad_recibida: 0, tarifa_aplicada: 0,
    fecha_esperada_movimiento: '', observaciones: '', avance_porcentaje: null,
  });
  const [detalleCostosMovimiento, setDetalleCostosMovimiento] = useState([]);

  const [hilosEspecificos, setHilosEspecificos] = useState([]);
  const [modeloPopoverOpen, setModeloPopoverOpen] = useState(false);
  const [modeloSearch, setModeloSearch] = useState('');
  const [servicioPopoverOpen, setServicioPopoverOpen] = useState(false);
  const [personaPopoverOpen, setPersonaPopoverOpen] = useState(false);

  const [incidencias, setIncidencias] = useState([]);
  const isParalizado = incidencias.some(i => i.paraliza && i.paralizacion_activa && i.estado === 'ABIERTA');
  const [motivosIncidencia, setMotivosIncidencia] = useState([]);
  const [incidenciaDialogOpen, setIncidenciaDialogOpen] = useState(false);
  const [incidenciaForm, setIncidenciaForm] = useState({ motivo_id: '', comentario: '', paraliza: false });
  const [showResueltas, setShowResueltas] = useState(false);
  const [nuevoMotivoNombre, setNuevoMotivoNombre] = useState('');
  const [gestionMotivos, setGestionMotivos] = useState(false);
  const [editandoMotivo, setEditandoMotivo] = useState(null);
  const [editMotivoNombre, setEditMotivoNombre] = useState('');
  const [salidasExpandidas, setSalidasExpandidas] = useState({});

  // Unsaved changes tracking
  const initialFormSnap = useRef(null);
  const initialTallasSnap = useRef(null);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const pendingNavRef = useRef(null);
  const savedRef = useRef(false);

  const isDirty = useMemo(() => {
    if (!initialFormSnap.current) return false;
    const formChanged = JSON.stringify(formData) !== JSON.stringify(initialFormSnap.current);
    const tallasChanged = JSON.stringify(tallasSeleccionadas) !== JSON.stringify(initialTallasSnap.current);
    return formChanged || tallasChanged;
  }, [formData, tallasSeleccionadas]);

  // ========== DATA FETCHING ==========
  const fetchWithRetry = async (url, retries = 2) => {
    for (let i = 0; i <= retries; i++) {
      try { const res = await axios.get(url, { timeout: 15000 }); return res.data; }
      catch (e) { if (i === retries) return null; await new Promise(r => setTimeout(r, 800)); }
    }
    return null;
  };

  const fetchRelatedData = () => {
    // Datos esenciales para el formulario (siempre necesarios)
    fetchWithRetry(`${API}/modelos?all=true`).then(d => { if (d) setModelos(d.filter(m => m.base_id)); });
    fetchWithRetry(`${API}/hilos-especificos`).then(d => { if (d) setHilosEspecificos(d); });
    axios.get(`${API}/estados`).then(r => { setEstados(r.data.estados); setEstadosGlobales(r.data.estados); }).catch(() => {});
    axios.get(`${API}/tallas-catalogo`).then(r => setTallasCatalogo(r.data)).catch(() => {});
    axios.get(`${API}/colores-catalogo`).then(r => setColoresCatalogo(r.data)).catch(() => {});
    axios.get(`${API}/lineas-negocio`).then(r => setLineasNegocio(r.data)).catch(() => {});
    // Catálogos para modo manual
    axios.get(`${API}/marcas`).then(r => setCatalogoMarcas(r.data)).catch(() => {});
    axios.get(`${API}/tipos`).then(r => setCatalogoTipos(r.data)).catch(() => {});
    axios.get(`${API}/telas`).then(r => setCatalogoTelas(r.data)).catch(() => {});
    axios.get(`${API}/entalles`).then(r => setCatalogoEntalles(r.data)).catch(() => {});
    // Datos para dialogos (se cargan en segundo plano, no bloquean render)
    setTimeout(() => {
      axios.get(`${API}/inventario?all=true`).then(r => setItemsInventario(r.data)).catch(() => {});
      axios.get(`${API}/servicios-produccion`).then(r => setServiciosProduccion(r.data)).catch(() => {});
      axios.get(`${API}/personas-produccion?activo=true`).then(r => setPersonasProduccion(r.data)).catch(() => {});
    }, 100);
  };

  const fetchEstadosDisponibles = async (registroId) => {
    if (!registroId) { setEstados(estadosGlobales); setUsaRuta(false); setRutaNombre(''); setSiguienteEstado(null); setEtapasCompletas([]); return; }
    try {
      const response = await axios.get(`${API}/registros/${registroId}/estados-disponibles`);
      const data = response.data;
      setEstados(data.estados || estadosGlobales); setUsaRuta(data.usa_ruta || false);
      setRutaNombre(data.ruta_nombre || ''); setSiguienteEstado(data.siguiente_estado || null);
      setEtapasCompletas(data.etapas_completas || []);
    } catch { setEstados(estadosGlobales); }
  };

  const fetchAnalisisEstado = async () => {
    if (!id || !usaRuta) return;
    try { const r = await axios.get(`${API}/registros/${id}/analisis-estado`); setAnalisisEstado(r.data); } catch {}
  };

  const fetchSalidasRegistro = async () => {
    if (!id) return;
    try { const r = await axios.get(`${API}/inventario-salidas?registro_id=${id}`); setSalidasRegistro(r.data); } catch {}
  };

  const fetchMovimientosProduccion = async () => {
    if (!id) return;
    try { const r = await axios.get(`${API}/movimientos-produccion?registro_id=${id}&all=true`); setMovimientosProduccion(r.data); } catch {}
  };

  const fetchIncidencias = async () => {
    if (!id) return;
    try { const res = await axios.get(`${API}/incidencias/${id}`); setIncidencias(res.data); } catch {}
  };

  const fetchMotivosIncidencia = async () => {
    try { const res = await axios.get(`${API}/motivos-incidencia`); setMotivosIncidencia(res.data); } catch {}
  };

  const fetchDivisionInfo = async () => {
    if (!id) return;
    try { const r = await axios.get(`${API}/registros/${id}/divisiones`); setDivisionInfo(r.data); } catch {}
  };

  const fetchRegistro = async () => {
    if (!id) { setLoadingData(false); return; }
    try {
      const response = await axios.get(`${API}/registros/${id}`);
      const registro = response.data;
      setFormData({
        n_corte: registro.n_corte, modelo_id: registro.modelo_id, modelo_manual: registro.modelo_manual || null,
        curva: registro.curva || '',
        estado: registro.estado, urgente: registro.urgente, hilo_especifico_id: registro.hilo_especifico_id || '',
        pt_item_id: registro.pt_item_id || '',
        observaciones: registro.observaciones || '', fecha_entrega_final: registro.fecha_entrega_final || '',
        fecha_inicio_real: registro.fecha_inicio_real || '',
        skip_validacion_estado: registro.skip_validacion_estado || false, linea_negocio_id: registro.linea_negocio_id || null,
      });
      // Restore manual mode if registro was created with modelo_manual
      if (registro.modelo_manual && !registro.modelo_id) {
        const mm = registro.modelo_manual;
        setModoManual(true);
        setModeloManualForm({
          marca_id: mm.marca_id || '', marca_texto: mm.marca_texto || '', marca_modo: mm.marca_id ? 'select' : (mm.marca_texto ? 'text' : 'select'),
          tipo_id: mm.tipo_id || '', tipo_texto: mm.tipo_texto || '', tipo_modo: mm.tipo_id ? 'select' : (mm.tipo_texto ? 'text' : 'select'),
          tela_id: mm.tela_id || '', tela_texto: mm.tela_texto || '', tela_modo: mm.tela_id ? 'select' : (mm.tela_texto ? 'text' : 'select'),
          entalle_id: mm.entalle_id || '', entalle_texto: mm.entalle_texto || '', entalle_modo: mm.entalle_id ? 'select' : (mm.entalle_texto ? 'text' : 'select'),
          nombre_modelo: mm.nombre_modelo || '', hilo: mm.hilo || '', hilo_especifico: mm.hilo_especifico || '',
        });
      }
      setTallasSeleccionadas(registro.tallas || []);
      setDistribucionColores(registro.distribucion_colores || []);
      // Usar modelos ya cargados por fetchRelatedData (evita llamada duplicada)
      if (modelos.length > 0) {
        const modelo = modelos.find(m => m.id === registro.modelo_id);
        setModeloSeleccionado(modelo || null);
        if (!registro.pt_item_id && modelo?.pt_item_id) setFormData(prev => ({ ...prev, pt_item_id: modelo.pt_item_id }));
      }
      try { await fetchEstadosDisponibles(id); } catch {}
    } catch { toast.error('Error al cargar registro'); navigate('/registros'); }
    finally { setLoadingData(false); }
  };

  // ========== EFFECTS ==========
  const [activeTab, setActiveTab] = useState('datos');
  const [tabsLoaded, setTabsLoaded] = useState({ general: false, produccion: false, incidencias: false });

  // Stats calculados
  const prendasEfectivas = (() => {
    const cantOriginal = tallasSeleccionadas.reduce((sum, t) => sum + (t.cantidad || 0), 0);
    const ultimoMov = movimientosProduccion.length > 0 ? movimientosProduccion[movimientosProduccion.length - 1] : null;
    return ultimoMov ? (ultimoMov.cantidad_recibida ?? ultimoMov.cantidad ?? cantOriginal) : cantOriginal;
  })();

  const incidenciasAbiertas = incidencias.filter(i => i.estado === 'ABIERTA').length;

  // Carga inicial: solo datos del formulario + datos ligeros del panel lateral
  useEffect(() => {
    fetchRelatedData();
    if (id) {
      fetchRegistro();
      // Datos ligeros necesarios para el panel lateral
      fetchMovimientosProduccion();
      fetchIncidencias();
    } else {
      setLoadingData(false);
    }
  }, [id]);

  // Snapshot for dirty detection — once loading is done
  useEffect(() => {
    if (!loadingData && !initialFormSnap.current) {
      initialFormSnap.current = JSON.parse(JSON.stringify(formData));
      initialTallasSnap.current = JSON.parse(JSON.stringify(tallasSeleccionadas));
    }
  }, [loadingData, formData, tallasSeleccionadas]);

  // Reset saved flag & snapshot after successful save
  const safeNavigate = useCallback((path) => {
    if (isDirty && !savedRef.current && path === '/registros') {
      pendingNavRef.current = path;
      setShowExitDialog(true);
    } else {
      savedRef.current = false;
      navigate(path);
    }
  }, [isDirty, navigate]);

  // Browser tab close / refresh guard
  useEffect(() => {
    const handler = (e) => {
      if (isDirty && !savedRef.current) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // Cuando los modelos se cargan, resolver el modelo seleccionado
  useEffect(() => {
    if (modelos.length > 0 && formData.modelo_id && !modeloSeleccionado) {
      const modelo = modelos.find(m => m.id === formData.modelo_id);
      if (modelo) {
        setModeloSeleccionado(modelo);
        if (!formData.pt_item_id && modelo.pt_item_id) setFormData(prev => ({ ...prev, pt_item_id: modelo.pt_item_id }));
      }
    }
  }, [modelos, formData.modelo_id]);

  // Carga lazy por pestaña activa
  useEffect(() => {
    if (!id) return;
    if (activeTab === 'produccion' && !tabsLoaded.produccion) {
      fetchSalidasRegistro();
      setTabsLoaded(prev => ({ ...prev, produccion: true }));
    }
    if (activeTab === 'incidencias' && !tabsLoaded.incidencias) {
      fetchMotivosIncidencia();
      fetchDivisionInfo();
      setTabsLoaded(prev => ({ ...prev, incidencias: true }));
    }
    if (activeTab === 'general' && !tabsLoaded.general) {
      setTabsLoaded(prev => ({ ...prev, general: true }));
    }
  }, [activeTab, id, tabsLoaded]);

  useEffect(() => { if (id && usaRuta) fetchAnalisisEstado(); }, [id, usaRuta, movimientosProduccion.length]);
  useEffect(() => {
    if (!id || !esCierreable) { setCierrePreview(null); return; }
    const fetchCierre = async () => {
      setCierreLoading(true);
      try {
        const token = localStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        const cierreRes = await axios.get(`${API}/registros/${id}/cierre-produccion`, { headers }).catch(() => ({ data: null }));
        if (cierreRes.data) {
          setCierreExistente(cierreRes.data);
          // Si esta reabierto, tambien cargar preview
          if (cierreRes.data.estado_cierre === 'REABIERTO') {
            const previewRes = await axios.get(`${API}/registros/${id}/preview-cierre`, { headers }).catch(() => ({ data: null }));
            if (previewRes.data) setCierrePreview(previewRes.data);
          }
        }
        else { const previewRes = await axios.get(`${API}/registros/${id}/preview-cierre`, { headers }); setCierrePreview(previewRes.data); }
      } catch {} finally { setCierreLoading(false); }
    };
    fetchCierre();
  }, [id, esCierreable]);

  // ========== HANDLERS ==========
  const handleModeloChange = async (modeloId) => {
    const modelo = modelos.find(m => m.id === modeloId);
    setModeloSeleccionado(modelo || null);
    const lineaHeredada = modelo?.linea_negocio_id || null;
    if (modelo?.pt_item_id) {
      setFormData({ ...formData, modelo_id: modeloId, pt_item_id: modelo.pt_item_id, linea_negocio_id: lineaHeredada });
    } else if (modelo) {
      setFormData({ ...formData, modelo_id: modeloId, linea_negocio_id: lineaHeredada });
      try {
        const token = localStorage.getItem('token');
        const res = await axios.post(`${API}/modelos/${modelo.id}/crear-pt`, {}, { headers: { Authorization: `Bearer ${token}` } });
        setFormData(prev => ({ ...prev, pt_item_id: res.data.pt_item_id }));
        const modelosRes = await axios.get(`${API}/modelos?all=true`);
        const variantes = modelosRes.data.filter(m => m.base_id);
        setModelos(variantes); setModeloSeleccionado(variantes.find(m => m.id === modeloId) || null);
        const itemsRes = await axios.get(`${API}/inventario?all=true`); setItemsInventario(itemsRes.data);
        toast.success(`PT creado automáticamente: ${res.data.pt_item_nombre}`);
      } catch {}
    } else { setFormData({ ...formData, modelo_id: modeloId, linea_negocio_id: null }); }
  };

  const handleEjecutarCierre = async () => {
    if (!window.confirm('Confirmar el cierre de produccion? Los costos quedaran congelados.')) return;
    setEjecutandoCierre(true);
    try {
      const token = localStorage.getItem('token');
      await handleSubmit(null, true);
      await axios.post(`${API}/registros/${id}/cierre-produccion`,
        { observacion_cierre: observacionCierre || null },
        { headers: { Authorization: `Bearer ${token}` } });
      toast.success('Cierre de produccion ejecutado exitosamente'); navigate('/registros');
    } catch (err) { toast.error(typeof err.response?.data?.detail === 'string' ? err.response.data.detail : 'Error al ejecutar cierre'); }
    finally { setEjecutandoCierre(false); }
  };

  const handleReabrirCierre = async () => {
    const motivo = window.prompt('Motivo de la reapertura (minimo 5 caracteres):');
    if (!motivo || motivo.trim().length < 5) {
      if (motivo !== null) toast.error('El motivo debe tener al menos 5 caracteres');
      return;
    }
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/registros/${id}/reabrir-cierre`,
        { motivo: motivo.trim() },
        { headers: { Authorization: `Bearer ${token}` } });
      toast.success('Cierre reabierto exitosamente');
      // Recargar datos
      window.location.reload();
    } catch (err) { toast.error(typeof err.response?.data?.detail === 'string' ? err.response.data.detail : 'Error al reabrir cierre'); }
  };

  const descargarBalancePDF = async () => {
    try {
      toast.info('Generando PDF...');
      const res = await axios.get(`${API}/registros/${id}/balance-pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a'); link.href = url;
      link.download = `Balance_${formData.n_corte || id}.pdf`; link.click(); window.URL.revokeObjectURL(url);
      toast.success('PDF descargado');
    } catch { toast.error('Error al generar PDF'); }
  };

  // Tallas
  const handleAddTalla = (tallaId) => {
    const talla = tallasCatalogo.find(t => t.id === tallaId);
    if (!talla || tallasSeleccionadas.find(t => t.talla_id === tallaId)) return;
    setTallasSeleccionadas([...tallasSeleccionadas, { talla_id: talla.id, talla_nombre: talla.nombre, cantidad: 0 }]);
  };
  const handleTallaCantidadChange = (tallaId, cantidad) => {
    setTallasSeleccionadas(tallasSeleccionadas.map(t => t.talla_id === tallaId ? { ...t, cantidad: parseInt(cantidad) || 0 } : t));
  };
  const handleRemoveTalla = (tallaId) => { setTallasSeleccionadas(tallasSeleccionadas.filter(t => t.talla_id !== tallaId)); };

  // Colores
  const handleOpenColoresDialog = () => {
    if (distribucionColores && distribucionColores.length > 0) {
      const coloresUnicos = []; const matriz = {};
      distribucionColores.forEach(talla => {
        (talla.colores || []).forEach(c => {
          if (!coloresUnicos.find(cu => cu.id === c.color_id)) { const colorCat = coloresCatalogo.find(cc => cc.id === c.color_id); if (colorCat) coloresUnicos.push(colorCat); }
          matriz[`${c.color_id}_${talla.talla_id}`] = c.cantidad;
        });
      });
      setColoresSeleccionados(coloresUnicos); setMatrizCantidades(matriz);
    } else { setColoresSeleccionados([]); setMatrizCantidades({}); }
    setColoresDialogOpen(true);
  };
  const handleColoresChange = (nuevosColores) => {
    const coloresRemovidos = coloresSeleccionados.filter(cs => !nuevosColores.find(nc => nc.id === cs.id));
    if (coloresRemovidos.length > 0) {
      const nuevaMatriz = { ...matrizCantidades };
      coloresRemovidos.forEach(color => { Object.keys(nuevaMatriz).forEach(key => { if (key.startsWith(`${color.id}_`)) delete nuevaMatriz[key]; }); });
      setMatrizCantidades(nuevaMatriz);
    }
    const coloresAgregados = nuevosColores.filter(nc => !coloresSeleccionados.find(cs => cs.id === nc.id));
    if (coloresSeleccionados.length === 0 && coloresAgregados.length > 0 && tallasSeleccionadas.length > 0) {
      const primerColor = coloresAgregados[0]; const nuevaMatriz = { ...matrizCantidades };
      tallasSeleccionadas.forEach(t => { nuevaMatriz[`${primerColor.id}_${t.talla_id}`] = t.cantidad; });
      setMatrizCantidades(nuevaMatriz);
    }
    setColoresSeleccionados(nuevosColores);
  };
  const getCantidadMatriz = (colorId, tallaId) => matrizCantidades[`${colorId}_${tallaId}`] || 0;
  const handleMatrizChange = (colorId, tallaId, valor) => {
    const cantidad = parseInt(valor) || 0;
    const talla = tallasSeleccionadas.find(t => t.talla_id === tallaId);
    if (!talla) return;
    let sumaOtros = 0;
    coloresSeleccionados.forEach(c => { if (c.id !== colorId) sumaOtros += getCantidadMatriz(c.id, tallaId); });
    if (cantidad + sumaOtros > talla.cantidad) { toast.error(`La suma (${cantidad + sumaOtros}) excede el total de la talla ${talla.talla_nombre} (${talla.cantidad})`); return; }
    setMatrizCantidades({ ...matrizCantidades, [`${colorId}_${tallaId}`]: cantidad });
  };
  const getTotalColor = (colorId) => { let total = 0; tallasSeleccionadas.forEach(t => { total += getCantidadMatriz(colorId, t.talla_id); }); return total; };
  const getTotalTallaAsignado = (tallaId) => { let total = 0; coloresSeleccionados.forEach(c => { total += getCantidadMatriz(c.id, tallaId); }); return total; };
  const getTotalGeneralAsignado = () => { let total = 0; coloresSeleccionados.forEach(c => { total += getTotalColor(c.id); }); return total; };
  const handleProrratear = () => {
    if (coloresSeleccionados.length === 0 || tallasSeleccionadas.length === 0) return;
    const nuevaMatriz = {};
    tallasSeleccionadas.forEach(t => {
      const totalTalla = t.cantidad || 0; const numColores = coloresSeleccionados.length;
      const base = Math.floor(totalTalla / numColores); const resto = totalTalla % numColores;
      coloresSeleccionados.forEach((color, index) => { nuevaMatriz[`${color.id}_${t.talla_id}`] = base + (index < resto ? 1 : 0); });
    });
    setMatrizCantidades(nuevaMatriz); toast.success('Cantidades prorrateadas equitativamente');
  };
  const handleSaveColores = () => {
    const distribucion = tallasSeleccionadas.map(t => ({
      talla_id: t.talla_id, talla_nombre: t.talla_nombre, cantidad_total: t.cantidad,
      colores: coloresSeleccionados.map(c => ({ color_id: c.id, color_nombre: c.nombre, cantidad: getCantidadMatriz(c.id, t.talla_id) })).filter(c => c.cantidad > 0)
    }));
    setDistribucionColores(distribucion); setColoresDialogOpen(false); toast.success('Distribución de colores guardada');
  };
  const tieneColores = useMemo(() => distribucionColores && distribucionColores.some(t => t.colores && t.colores.length > 0), [distribucionColores]);

  // Salidas de inventario
  const handleOpenSalidaDialog = () => {
    setSalidaFormData({ item_id: '', cantidad: 1, rollo_id: '', observaciones: '' });
    setSelectedItemInventario(null); setRollosDisponibles([]); setSelectedRollo(null);
    setBusquedaItem(''); setItemSelectorOpen(false); setSalidaDialogOpen(true);
  };
  const handleItemInventarioChange = async (itemId) => {
    const item = itemsInventario.find(i => i.id === itemId);
    setSelectedItemInventario(item); setSelectedRollo(null);
    setSalidaFormData({ ...salidaFormData, item_id: itemId, rollo_id: '', cantidad: 1 });
    if (item?.control_por_rollos) {
      try { const r = await axios.get(`${API}/inventario-rollos?item_id=${itemId}&activo=true`); setRollosDisponibles(r.data.filter(r => r.metraje_disponible > 0)); }
      catch { setRollosDisponibles([]); }
    } else { setRollosDisponibles([]); }
  };
  const handleRolloChange = (rolloId) => {
    const rollo = rollosDisponibles.find(r => r.id === rolloId);
    setSelectedRollo(rollo); setSalidaFormData({ ...salidaFormData, rollo_id: rolloId, cantidad: 1 });
  };
  const handleCreateSalida = guard(async () => {
    if (!salidaFormData.item_id || salidaFormData.cantidad < 0.01) { toast.error('Selecciona un item y cantidad válida'); return; }
    if (selectedItemInventario?.control_por_rollos && !salidaFormData.rollo_id) { toast.error('Debes seleccionar un rollo'); return; }
    try {
      const payload = { ...salidaFormData, registro_id: id };
      if (!payload.rollo_id) delete payload.rollo_id;
      await axios.post(`${API}/inventario-salidas`, payload);
      toast.success('Salida registrada'); setSalidaDialogOpen(false); fetchSalidasRegistro();
      const inventarioRes = await axios.get(`${API}/inventario?all=true`); setItemsInventario(inventarioRes.data);
    } catch (error) { toast.error(getErrorMsg(error, 'Error al crear salida')); }
  });
  const handleDeleteSalida = async (salidaId) => {
    if (!window.confirm('¿Estás seguro de eliminar esta salida?')) return;
    try { await axios.delete(`${API}/inventario-salidas/${salidaId}`); toast.success('Salida eliminada'); fetchSalidasRegistro();
      const inventarioRes = await axios.get(`${API}/inventario?all=true`); setItemsInventario(inventarioRes.data);
    } catch (error) { toast.error(getErrorMsg(error, 'Error al eliminar salida')); }
  };

  const getTotalCostoSalidas = () => salidasRegistro.reduce((sum, s) => sum + (s.costo_total || 0), 0);

  // Movimientos
  const getTarifaPersonaServicio = (personaId, servicioId) => {
    const persona = personasProduccion.find(p => p.id === personaId);
    if (!persona) return 0;
    const servicioDetalle = (persona.servicios_detalle || []).find(s => s.servicio_id === servicioId);
    if (servicioDetalle) return servicioDetalle.tarifa || 0;
    const servicio = (persona.servicios || []).find(s => s.servicio_id === servicioId);
    if (servicio) return servicio.tarifa || 0;
    return 0;
  };
  const calcularCostoMovimiento = () => (movimientoFormData.tarifa_aplicada || 0) * (movimientoFormData.cantidad_recibida || 0);
  const calcularDiferenciaMovimiento = () => (movimientoFormData.cantidad_enviada || 0) - (movimientoFormData.cantidad_recibida || 0);
  const calcularCantidadTotalRegistro = () => {
    if (distribucionColores && distribucionColores.length > 0) {
      let total = 0; distribucionColores.forEach(talla => { (talla.colores || []).forEach(color => { total += color.cantidad || 0; }); }); return total;
    }
    if (tallasSeleccionadas && tallasSeleccionadas.length > 0) return tallasSeleccionadas.reduce((sum, t) => sum + (t.cantidad || 0), 0);
    return 0;
  };

  // Cantidad efectiva = ultima cantidad_recibida (refleja mermas) o cantidad original si no hay movimientos
  const calcularCantidadEfectiva = () => {
    if (movimientosProduccion && movimientosProduccion.length > 0) {
      const ultimo = movimientosProduccion[movimientosProduccion.length - 1];
      const recibida = ultimo.cantidad_recibida ?? ultimo.cantidad ?? 0;
      if (recibida > 0) return recibida;
    }
    return calcularCantidadTotalRegistro();
  };

  const handleOpenMovimientoDialog = (movimiento = null) => {
    const cantidadTotal = calcularCantidadTotalRegistro();
    const cantidadEfectiva = calcularCantidadEfectiva();
    if (movimiento) {
      setEditingMovimiento(movimiento);
      setMovimientoFormData({
        servicio_id: movimiento.servicio_id, persona_id: movimiento.persona_id,
        fecha_inicio: movimiento.fecha_inicio || '', fecha_fin: movimiento.fecha_fin || '',
        cantidad_enviada: movimiento.cantidad_enviada || movimiento.cantidad || 0,
        cantidad_recibida: movimiento.cantidad_recibida || movimiento.cantidad || 0,
        tarifa_aplicada: movimiento.tarifa_aplicada || 0, fecha_esperada_movimiento: movimiento.fecha_esperada_movimiento || '',
        observaciones: movimiento.observaciones || '', avance_porcentaje: movimiento.avance_porcentaje ?? null,
      });
      const filtradas = personasProduccion.filter(p => {
        const tieneEnDetalle = (p.servicios_detalle || []).some(s => s.servicio_id === movimiento.servicio_id);
        const tieneEnServicios = (p.servicios || []).some(s => s.servicio_id === movimiento.servicio_id);
        const tieneEnIds = (p.servicio_ids || []).includes(movimiento.servicio_id);
        return tieneEnDetalle || tieneEnServicios || tieneEnIds;
      });
      setPersonasFiltradas(filtradas);
      setDetalleCostosMovimiento(movimiento.detalle_costos || []);
    } else {
      setEditingMovimiento(null);
      setMovimientoFormData({
        servicio_id: '', persona_id: '', fecha_inicio: new Date().toISOString().split('T')[0], fecha_fin: '',
        cantidad_enviada: cantidadEfectiva, cantidad_recibida: cantidadEfectiva, tarifa_aplicada: 0,
        fecha_esperada_movimiento: '', responsable_movimiento: '', observaciones: '', avance_porcentaje: null,
      });
      setPersonasFiltradas([]);
      setDetalleCostosMovimiento([]);
    }
    setMovimientoDialogOpen(true);
  };

  const handleServicioChange = (servicioId) => {
    const filtradas = personasProduccion.filter(p => {
      const tieneEnDetalle = (p.servicios_detalle || []).some(s => s.servicio_id === servicioId);
      const tieneEnServicios = (p.servicios || []).some(s => s.servicio_id === servicioId);
      const tieneEnIds = (p.servicio_ids || []).includes(servicioId);
      return tieneEnDetalle || tieneEnServicios || tieneEnIds;
    });
    setPersonasFiltradas(filtradas);
    let fechaInicioSugerida = movimientoFormData.fecha_inicio;
    if (usaRuta && etapasCompletas.length > 0 && !editingMovimiento) {
      const etapaIdx = etapasCompletas.findIndex(e => e.servicio_id === servicioId);
      if (etapaIdx > 0) {
        for (let i = etapaIdx - 1; i >= 0; i--) {
          const etapaAnterior = etapasCompletas[i]; if (!etapaAnterior.servicio_id) continue;
          const movsAnteriores = movimientosProduccion.filter(m => m.servicio_id === etapaAnterior.servicio_id && m.fecha_fin);
          if (movsAnteriores.length > 0) { fechaInicioSugerida = movsAnteriores.map(m => m.fecha_fin).sort().pop(); break; }
        }
      }
    }
    setMovimientoFormData({ ...movimientoFormData, servicio_id: servicioId, persona_id: '', tarifa_aplicada: 0, fecha_inicio: fechaInicioSugerida });
  };

  const handlePersonaChange = (personaId) => {
    const tarifa = getTarifaPersonaServicio(personaId, movimientoFormData.servicio_id);
    setMovimientoFormData({ ...movimientoFormData, persona_id: personaId, tarifa_aplicada: tarifa });
  };

  const handleSaveMovimiento = guard(async () => {
    if (!movimientoFormData.servicio_id || !movimientoFormData.persona_id) { toast.error('Selecciona servicio y persona'); return; }
    if (movimientoFormData.fecha_inicio && movimientoFormData.fecha_fin && movimientoFormData.fecha_fin <= movimientoFormData.fecha_inicio) { toast.error('La fecha fin debe ser mayor que la fecha inicio'); return; }
    if (movimientoFormData.fecha_inicio && movimientoFormData.fecha_esperada_movimiento && movimientoFormData.fecha_esperada_movimiento <= movimientoFormData.fecha_inicio) { toast.error('La fecha esperada debe ser mayor que la fecha inicio'); return; }
    try {
      const payload = { ...movimientoFormData, registro_id: id, detalle_costos: detalleCostosMovimiento.length > 0 ? detalleCostosMovimiento : null };
      if (editingMovimiento) { await axios.put(`${API}/movimientos-produccion/${editingMovimiento.id}`, payload); toast.success('Movimiento actualizado'); }
      else { await axios.post(`${API}/movimientos-produccion`, payload); toast.success('Movimiento registrado'); }
      setMovimientoDialogOpen(false); setEditingMovimiento(null); await fetchMovimientosProduccion();
      // Sugerencia bidireccional
      if (usaRuta && etapasCompletas.length > 0) {
        const servicioMov = movimientoFormData.servicio_id;
        const etapaVinculada = etapasCompletas.find(e => e.servicio_id === servicioMov && e.aparece_en_estado !== false);
        if (etapaVinculada) {
          const etapaNombre = etapaVinculada.nombre;
          const idxEtapaMov = etapasCompletas.indexOf(etapaVinculada);
          const idxEstadoActual = etapasCompletas.findIndex(e => e.nombre === formData.estado);
          if (movimientoFormData.fecha_inicio && !movimientoFormData.fecha_fin && etapaNombre !== formData.estado && idxEtapaMov > idxEstadoActual) {
            setSugerenciaEstadoDialog({ tipo: 'inicio', mensaje: `Se inició ${etapaVinculada.nombre}. ¿Deseas actualizar el estado del registro?`, estadoSugerido: etapaNombre });
          } else if (movimientoFormData.fecha_fin) {
            const siguientes = etapasCompletas.slice(idxEtapaMov + 1);
            const sigEstado = siguientes.find(e => e.aparece_en_estado !== false);
            if (sigEstado && sigEstado.nombre !== formData.estado) {
              const idxSig = etapasCompletas.findIndex(e => e.nombre === sigEstado.nombre);
              if (idxSig > idxEstadoActual) setSugerenciaEstadoDialog({ tipo: 'fin', mensaje: `${etapaVinculada.nombre} fue finalizada. ¿Deseas avanzar el estado del registro?`, estadoSugerido: sigEstado.nombre });
            }
          }
        }
      }
    } catch (error) { toast.error(getErrorMsg(error, 'Error al guardar movimiento')); }
  });

  const handleDeleteMovimiento = async (movimientoId) => {
    if (!window.confirm('¿Estás seguro de eliminar este movimiento?')) return;
    try { await axios.delete(`${API}/movimientos-produccion/${movimientoId}`); toast.success('Movimiento eliminado'); fetchMovimientosProduccion(); }
    catch (error) { toast.error(getErrorMsg(error, 'Error al eliminar')); }
  };

  const handleGenerarGuia = async (movimientoId) => {
    try {
      const response = await axios.post(`${API}/guias-remision/from-movimiento/${movimientoId}`);
      const guia = response.data.guia;
      toast.success(`Guía ${guia.numero_guia} lista para imprimir`);
      const printWindow = window.open('', '_blank');
      printWindow.document.write(`<html><head><title>Guía de Remisión ${guia.numero_guia}</title><style>body{font-family:Arial,sans-serif;padding:40px;max-width:800px;margin:0 auto}.header{text-align:center;border-bottom:2px solid #000;padding-bottom:15px;margin-bottom:30px}.header h1{margin:0;font-size:28px}.header .numero{font-size:24px;font-family:monospace;margin-top:10px}.header .fecha{color:#666;margin-top:5px}.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:30px}.info-box{border:1px solid #ddd;padding:15px;border-radius:8px}.info-box h3{margin:0 0 10px 0;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:1px}.info-box p{margin:5px 0}.info-box .nombre{font-size:18px;font-weight:bold}.cantidad-box{text-align:center;padding:30px;background:#f5f5f5;border-radius:8px;margin-bottom:30px}.cantidad-box .numero{font-size:64px;font-weight:bold;color:#333}.cantidad-box .label{color:#666;font-size:14px;text-transform:uppercase}.observaciones{border:1px solid #ddd;padding:15px;border-radius:8px;min-height:60px;margin-bottom:30px}.observaciones h3{margin:0 0 10px 0;font-size:12px;color:#666;text-transform:uppercase}.firmas{display:grid;grid-template-columns:1fr 1fr;gap:60px;margin-top:60px}.firma-box{text-align:center}.firma-linea{border-top:1px solid #000;padding-top:8px;margin-top:80px;font-size:14px}@media print{body{padding:20px}}</style></head><body><div class="header"><h1>GUÍA DE REMISIÓN</h1><div class="numero">${guia.numero_guia}</div><div class="fecha">Fecha: ${guia.fecha ? new Date(guia.fecha).toLocaleDateString('es-PE') : ''}</div></div><div class="info-grid"><div class="info-box"><h3>Registro de Producción</h3><p class="nombre">${guia.modelo_nombre || 'N/A'}</p><p>N° Corte: ${guia.registro_n_corte || 'N/A'}</p><p style="margin-top:10px;color:#666">Servicio: ${guia.servicio_nombre || 'N/A'}</p></div><div class="info-box"><h3>Destinatario</h3><p class="nombre">${guia.persona_nombre || 'N/A'}</p>${guia.persona_telefono ? `<p>Tel: ${guia.persona_telefono}</p>` : ''}${guia.persona_direccion ? `<p>${guia.persona_direccion}</p>` : ''}</div></div><div class="cantidad-box"><div class="numero">${guia.cantidad}</div><div class="label">Prendas</div></div>${guia.observaciones ? `<div class="observaciones"><h3>Observaciones</h3><p>${guia.observaciones}</p></div>` : ''}<div class="firmas"><div class="firma-box"><div class="firma-linea">Firma Remitente</div></div><div class="firma-box"><div class="firma-linea">Firma Destinatario</div></div></div></body></html>`);
      printWindow.document.close(); printWindow.print();
    } catch (error) {
      if (error.response?.status === 400) toast.error('Ya existe una guía para este movimiento');
      else toast.error(getErrorMsg(error, 'Error al generar guía'));
    }
  };

  const totalCantidadMovimientos = useMemo(() => movimientosProduccion.reduce((sum, m) => sum + (m.cantidad_recibida || m.cantidad || 0), 0), [movimientosProduccion]);

  // Estado
  const autoGuardarEstado = async (nuevoEstado) => {
    if (!id || !isEditing) return;
    try {
      await axios.put(`${API}/registros/${id}`, { ...formData, estado: nuevoEstado, tallas: tallasSeleccionadas, distribucion_colores: distribucionColores });
      setFormData(prev => ({ ...prev, estado: nuevoEstado })); toast.success(`Estado actualizado a "${nuevoEstado}"`); fetchAnalisisEstado();
    } catch { toast.error('Error al guardar estado'); }
  };

  const handleSubmit = async (e, silentMode = false) => {
    if (e) e.preventDefault(); setLoading(true);
    try {
      const payload = { ...formData, tallas: tallasSeleccionadas, distribucion_colores: distribucionColores };
      if (modoManual) {
        payload.modelo_id = null;
        payload.modelo_manual = {
          marca_id: modeloManualForm.marca_modo === 'select' ? modeloManualForm.marca_id || null : null,
          marca_texto: modeloManualForm.marca_modo === 'text' ? modeloManualForm.marca_texto : (catalogoMarcas.find(m => m.id === modeloManualForm.marca_id)?.nombre || null),
          tipo_id: modeloManualForm.tipo_modo === 'select' ? modeloManualForm.tipo_id || null : null,
          tipo_texto: modeloManualForm.tipo_modo === 'text' ? modeloManualForm.tipo_texto : (catalogoTipos.find(t => t.id === modeloManualForm.tipo_id)?.nombre || null),
          tela_id: modeloManualForm.tela_modo === 'select' ? modeloManualForm.tela_id || null : null,
          tela_texto: modeloManualForm.tela_modo === 'text' ? modeloManualForm.tela_texto : (catalogoTelas.find(t => t.id === modeloManualForm.tela_id)?.nombre || null),
          entalle_id: modeloManualForm.entalle_modo === 'select' ? modeloManualForm.entalle_id || null : null,
          entalle_texto: modeloManualForm.entalle_modo === 'text' ? modeloManualForm.entalle_texto : (catalogoEntalles.find(e => e.id === modeloManualForm.entalle_id)?.nombre || null),
          nombre_modelo: modeloManualForm.nombre_modelo || null,
          hilo: modeloManualForm.hilo || null,
          hilo_especifico: modeloManualForm.hilo_especifico || null,
        };
      } else {
        payload.modelo_manual = null;
      }
      if (isEditing) { await axios.put(`${API}/registros/${id}`, payload); if (!silentMode) toast.success('Registro actualizado'); }
      else { const res = await axios.post(`${API}/registros`, payload); if (silentMode && res.data?.id) navigate(`/registros/editar/${res.data.id}`, { replace: true }); if (!silentMode) toast.success('Registro creado'); }
      savedRef.current = true;
      initialFormSnap.current = JSON.parse(JSON.stringify(formData));
      initialTallasSnap.current = JSON.parse(JSON.stringify(tallasSeleccionadas));
      if (!silentMode) navigate('/registros');
    } catch { toast.error('Error al guardar registro'); }
    finally { setLoading(false); }
  };

  // Incidencias
  const handleCrearIncidencia = async () => {
    if (!incidenciaForm.motivo_id) { toast.error('Selecciona un motivo'); return; }
    try {
      await axios.post(`${API}/incidencias`, { registro_id: id, motivo_id: incidenciaForm.motivo_id, comentario: incidenciaForm.comentario, paraliza: incidenciaForm.paraliza, usuario: 'eduard' });
      toast.success('Incidencia registrada'); setIncidenciaDialogOpen(false);
      setIncidenciaForm({ motivo_id: '', comentario: '', paraliza: false }); fetchIncidencias();
    } catch (error) { toast.error(getErrorMsg(error, 'Error al crear incidencia')); }
  };
  const handleResolverIncidencia = async (incId) => {
    try { await axios.put(`${API}/incidencias/${incId}`, { estado: 'RESUELTA' }); toast.success('Incidencia resuelta'); fetchIncidencias(); }
    catch { toast.error('Error al resolver incidencia'); }
  };
  const handleEliminarIncidencia = async (incId) => {
    if (!window.confirm('¿Estás seguro de eliminar esta incidencia?')) return;
    try { await axios.delete(`${API}/incidencias/${incId}`); toast.success('Incidencia eliminada'); fetchIncidencias(); }
    catch { toast.error('Error al eliminar incidencia'); }
  };
  const handleCrearMotivo = async () => {
    if (!nuevoMotivoNombre.trim()) return;
    try {
      const res = await axios.post(`${API}/motivos-incidencia`, { nombre: nuevoMotivoNombre.trim() });
      setMotivosIncidencia(prev => [...prev, res.data].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setIncidenciaForm(prev => ({ ...prev, motivo_id: res.data.id })); setNuevoMotivoNombre(''); toast.success(`Motivo "${res.data.nombre}" creado`);
    } catch (error) { toast.error(getErrorMsg(error, 'Error al crear motivo')); }
  };
  const handleEditarMotivo = async (motivoId) => {
    if (!editMotivoNombre.trim()) return;
    try {
      const res = await axios.put(`${API}/motivos-incidencia/${motivoId}`, { nombre: editMotivoNombre.trim() });
      setMotivosIncidencia(prev => prev.map(m => m.id === motivoId ? res.data : m).sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setEditandoMotivo(null); setEditMotivoNombre(''); toast.success('Motivo actualizado');
    } catch (error) { toast.error(getErrorMsg(error, 'Error al editar motivo')); }
  };
  const handleEliminarMotivo = async (motivoId) => {
    if (!window.confirm('¿Estás seguro de eliminar este motivo?')) return;
    try {
      await axios.delete(`${API}/motivos-incidencia/${motivoId}`);
      setMotivosIncidencia(prev => prev.filter(m => m.id !== motivoId));
      if (incidenciaForm.motivo_id === motivoId) setIncidenciaForm(prev => ({ ...prev, motivo_id: '' }));
      toast.success('Motivo eliminado');
    } catch { toast.error('Error al eliminar motivo'); }
  };

  // División
  const handleOpenDivision = () => {
    setDivisionTallas(tallasSeleccionadas.map(t => ({ talla_id: t.talla_id, talla_nombre: t.talla_nombre, cantidad_disponible: t.cantidad, cantidad_dividir: 0 })));
    setDivisionDialogOpen(true);
  };
  const handleDividirLote = async () => {
    const tallasConCantidad = divisionTallas.filter(t => t.cantidad_dividir > 0);
    if (tallasConCantidad.length === 0) { toast.error('Asigna al menos una cantidad a dividir'); return; }
    for (const t of tallasConCantidad) { if (t.cantidad_dividir > t.cantidad_disponible) { toast.error(`La cantidad para ${t.talla_nombre} excede lo disponible`); return; } }
    try {
      const resp = await axios.post(`${API}/registros/${id}/dividir`, { tallas_hijo: tallasConCantidad.map(t => ({ talla_id: t.talla_id, cantidad: t.cantidad_dividir })) });
      toast.success(resp.data.mensaje); setDivisionDialogOpen(false);
      const regResp = await axios.get(`${API}/registros/${id}`); setTallasSeleccionadas(regResp.data.tallas || []); fetchDivisionInfo();
    } catch (error) { toast.error(getErrorMsg(error, 'Error al dividir lote')); }
  };
  const handleReunificar = async (hijoId) => {
    try { await axios.post(`${API}/registros/${hijoId}/reunificar`); toast.success('Lote reunificado exitosamente');
      const regResp = await axios.get(`${API}/registros/${id}`); setTallasSeleccionadas(regResp.data.tallas || []); fetchDivisionInfo();
    } catch (error) { toast.error(getErrorMsg(error, 'Error al reunificar')); }
  };

  // Forzar estado (con motivo)
  const handleForzarEstado = async (nuevoEstado, motivo) => {
    setForzarEstadoDialog(null);
    try { await axios.post(`${API}/registros/${id}/validar-cambio-estado`, { nuevo_estado: nuevoEstado, forzar: true, motivo_forzar: motivo || '' }); await autoGuardarEstado(nuevoEstado); toast.success(`Estado forzado a "${nuevoEstado}"`); }
    catch { await autoGuardarEstado(nuevoEstado); }
  };

  // Confirmar retroceso de estado (con motivo)
  const handleConfirmarRetroceso = async (nuevoEstado, motivo) => {
    setRetrocesoDialog(null);
    try {
      const resp = await axios.post(`${API}/registros/${id}/validar-cambio-estado`, { nuevo_estado: nuevoEstado, confirmar_retroceso: true, motivo_retroceso: motivo });
      if (resp.data.permitido) { await autoGuardarEstado(nuevoEstado); toast.success(`Estado retrocedido a "${nuevoEstado}"`); }
      else { toast.error(resp.data.bloqueos?.[0]?.mensaje || 'No se pudo retroceder'); }
    } catch { toast.error('Error al retroceder estado'); }
  };

  // Continuar con advertencia de cantidad
  const handleContinuarConAdvertencia = async () => {
    const dialog = advertenciaCantidadDialog;
    setAdvertenciaCantidadDialog(null);
    if (dialog?.nuevo_estado) {
      await autoGuardarEstado(dialog.nuevo_estado);
      if (dialog.sugerencia) setSugerenciaMovDialog(dialog.sugerencia);
    }
  };

  // Abrir movimiento pre-llenado desde sugerencia
  const handleOpenMovimientoPrelleno = (sug) => {
    const cantidadEfectiva = calcularCantidadEfectiva();
    setEditingMovimiento(null);
    setMovimientoFormData({
      servicio_id: sug.servicio_id, persona_id: '', fecha_inicio: new Date().toISOString().split('T')[0], fecha_fin: '',
      cantidad_enviada: cantidadEfectiva, cantidad_recibida: cantidadEfectiva, tarifa_aplicada: 0, fecha_esperada_movimiento: '', observaciones: '',
    });
    const filtradas = personasProduccion.filter(p => {
      const tieneEnDetalle = (p.servicios_detalle || []).some(s => s.servicio_id === sug.servicio_id);
      const tieneEnServicios = (p.servicios || []).some(s => s.servicio_id === sug.servicio_id);
      const tieneEnIds = (p.servicio_ids || []).includes(sug.servicio_id);
      return tieneEnDetalle || tieneEnServicios || tieneEnIds;
    });
    setPersonasFiltradas(filtradas); setMovimientoDialogOpen(true);
  };

  const tallasDisponibles = useMemo(() => tallasCatalogo.filter(t => !tallasSeleccionadas.find(ts => ts.talla_id === t.id)), [tallasCatalogo, tallasSeleccionadas]);

  if (loadingData) return <div className="flex items-center justify-center h-64"><div className="text-muted-foreground">Cargando...</div></div>;

  // ========== RENDER ==========
  return (
    <div className="space-y-4 p-4 md:p-6 pb-8 min-w-0" data-testid="registro-form-page">
      {/* HEADER FULL WIDTH */}
      <RegistroHeader
        formData={formData} setFormData={setFormData} modeloSeleccionado={modeloSeleccionado}
        isEditing={isEditing} isParalizado={isParalizado} estados={estados} usaRuta={usaRuta}
        rutaNombre={rutaNombre} analisisEstado={analisisEstado} loading={loading} id={id}
        navigate={safeNavigate} API={API} autoGuardarEstado={autoGuardarEstado}
        setForzarEstadoDialog={setForzarEstadoDialog} setSugerenciaMovDialog={setSugerenciaMovDialog}
        setRetrocesoDialog={setRetrocesoDialog} setAdvertenciaCantidadDialog={setAdvertenciaCantidadDialog}
        handleSubmit={handleSubmit} permisos={perms} setConvOpen={setConvOpen} convRefreshKey={convRefreshKey}
        cameFromRegistro={cameFromRegistro}
      />

      {/* Banner incidencias abiertas (no paralizado) */}
      {isEditing && incidenciasAbiertas > 0 && !isParalizado && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700 px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangleIcon className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
              {incidenciasAbiertas} incidencia{incidenciasAbiertas > 1 ? 's' : ''} abierta{incidenciasAbiertas > 1 ? 's' : ''}
            </span>
          </div>
          <button type="button" className="text-xs text-amber-700 hover:text-amber-900 dark:text-amber-400 flex items-center gap-1 shrink-0"
            onClick={() => setActiveTab('incidencias')}>
            Ver incidencias <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
          {/* COLUMNA IZQUIERDA */}
          <div className="space-y-4 min-w-0">
            {/* Resumen mobile */}
            {isEditing && (
              <div className="lg:hidden flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2 overflow-x-auto" data-testid="resumen-mobile">
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs text-muted-foreground">Prendas</span>
                  <span className="font-mono font-bold text-sm">{prendasEfectivas}</span>
                </div>
                <div className="w-px h-5 bg-border shrink-0" />
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs text-muted-foreground">Movs</span>
                  <span className="font-mono font-bold text-sm">{movimientosProduccion.length}</span>
                </div>
                {incidenciasAbiertas > 0 && (
                  <>
                    <div className="w-px h-5 bg-border shrink-0" />
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs text-red-600">Inc. abiertas</span>
                      <span className="font-mono font-bold text-sm text-red-600">{incidenciasAbiertas}</span>
                    </div>
                  </>
                )}
                {modeloSeleccionado && (
                  <>
                    <div className="w-px h-5 bg-border shrink-0" />
                    <span className="text-xs text-muted-foreground shrink-0">{modeloSeleccionado.nombre}</span>
                  </>
                )}
              </div>
            )}

            {/* Stats rápidos (solo edición) */}
            {isEditing && (
              <div className="registro-stats-grid">
                <div className="registro-stat-card">
                  <p className="registro-stat-numero font-mono">{prendasEfectivas}</p>
                  <p className="registro-stat-label"><Package className="h-3 w-3" /> Prendas</p>
                </div>
                <div className="registro-stat-card">
                  <p className="registro-stat-numero font-mono">{movimientosProduccion.length}</p>
                  <p className="registro-stat-label"><Activity className="h-3 w-3" /> Movimientos</p>
                </div>
                <div className="registro-stat-card">
                  <p className={`registro-stat-numero font-mono ${incidenciasAbiertas > 0 ? 'registro-stat-danger' : ''}`}>{incidencias.length}</p>
                  <p className="registro-stat-label"><AlertTriangleIcon className="h-3 w-3" /> Incidencias</p>
                  {incidenciasAbiertas > 0 && <p className="registro-stat-sub-danger">{incidenciasAbiertas} abiertas</p>}
                </div>
                <div className="registro-stat-card">
                  <p className="registro-stat-numero font-mono">
                    {movimientosProduccion.length > 0 && movimientosProduccion[0].fecha_inicio
                      ? `${Math.max(0, Math.ceil((new Date() - new Date(movimientosProduccion[0].fecha_inicio)) / (1000 * 60 * 60 * 24)))}d`
                      : '0d'}
                  </p>
                  <p className="registro-stat-label"><Clock className="h-3 w-3" /> Días</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">en proceso</p>
                </div>
              </div>
            )}

            {!isEditing ? (
              /* Modo creación: sin pestañas */
              <>
                <RegistroDatosCard
                  formData={formData} setFormData={setFormData} divisionInfo={divisionInfo}
                  navigate={navigate} esCierreable={esCierreable} cierreExistente={cierreExistente}
                  cierrePreview={cierrePreview} cierreLoading={cierreLoading} ejecutandoCierre={ejecutandoCierre}
                  onEjecutarCierre={handleEjecutarCierre} onDescargarBalancePDF={descargarBalancePDF}
                  onReabrirCierre={handleReabrirCierre}
                  observacionCierre={observacionCierre} setObservacionCierre={setObservacionCierre}
                  modelos={modelos} modeloPopoverOpen={modeloPopoverOpen} setModeloPopoverOpen={setModeloPopoverOpen}
                  modeloSearch={modeloSearch} setModeloSearch={setModeloSearch} onModeloChange={handleModeloChange}
                  lineasNegocio={lineasNegocio} itemsInventario={itemsInventario} modeloSeleccionado={modeloSeleccionado}
                  onReunificar={handleReunificar} isEditing={isEditing} hilosEspecificos={hilosEspecificos}
                  modoManual={modoManual} setModoManual={setModoManual}
                  modeloManualForm={modeloManualForm} setModeloManualForm={setModeloManualForm}
                  catalogoMarcas={catalogoMarcas} catalogoTipos={catalogoTipos}
                  catalogoTelas={catalogoTelas} catalogoEntalles={catalogoEntalles}
                />
              </>
            ) : (
              /* Modo edición: con pestañas */
              <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <TabsList className="registro-tabs-list">
                  <TabsTrigger value="datos" className="registro-tab" data-testid="tab-datos">
                    <FileText className="h-3.5 w-3.5" /> Datos
                  </TabsTrigger>
                  <TabsTrigger value="tallas" className="registro-tab" data-testid="tab-general">
                    <Scissors className="h-3.5 w-3.5" /> Tallas
                  </TabsTrigger>
                  <TabsTrigger value="movimientos" className="registro-tab" data-testid="tab-produccion">
                    <Play className="h-3.5 w-3.5" /> Movimientos
                  </TabsTrigger>
                  <TabsTrigger value="materiales" className="registro-tab" data-testid="tab-materiales">
                    <Package className="h-3.5 w-3.5" /> Materiales
                  </TabsTrigger>
                  <TabsTrigger value="incidencias" className="registro-tab" data-testid="tab-control">
                    <ShieldAlert className="h-3.5 w-3.5" /> Incidencias
                    {incidenciasAbiertas > 0 && (
                      <span className="registro-tab-badge-red">
                        {incidenciasAbiertas}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="costos" className="registro-tab" data-testid="tab-costos">
                    <Cog className="h-3.5 w-3.5" /> Otros Costos
                  </TabsTrigger>
                  <TabsTrigger value="cierre" className="registro-tab" data-testid="tab-cierre">
                    <ShieldAlert className="h-3.5 w-3.5" /> Cierre
                  </TabsTrigger>
                  <TabsTrigger value="pt_odoo" className="registro-tab" data-testid="tab-pt-odoo">
                    <Package className="h-3.5 w-3.5" /> PT Odoo
                  </TabsTrigger>
                </TabsList>

                {/* TAB DATOS */}
                <TabsContent value="datos" className="space-y-4 mt-0">
                  <RegistroDatosCard
                    formData={formData} setFormData={setFormData} divisionInfo={divisionInfo}
                    navigate={navigate} esCierreable={esCierreable} cierreExistente={cierreExistente}
                    cierrePreview={cierrePreview} cierreLoading={cierreLoading} ejecutandoCierre={ejecutandoCierre}
                    onEjecutarCierre={handleEjecutarCierre} onDescargarBalancePDF={descargarBalancePDF}
                    onReabrirCierre={handleReabrirCierre}
                    observacionCierre={observacionCierre} setObservacionCierre={setObservacionCierre}
                    modelos={modelos} modeloPopoverOpen={modeloPopoverOpen} setModeloPopoverOpen={setModeloPopoverOpen}
                    modeloSearch={modeloSearch} setModeloSearch={setModeloSearch} onModeloChange={handleModeloChange}
                    lineasNegocio={lineasNegocio} itemsInventario={itemsInventario} modeloSeleccionado={modeloSeleccionado}
                    onReunificar={handleReunificar} isEditing={isEditing} hilosEspecificos={hilosEspecificos}
                    modoManual={modoManual} setModoManual={setModoManual}
                    modeloManualForm={modeloManualForm} setModeloManualForm={setModeloManualForm}
                    catalogoMarcas={catalogoMarcas} catalogoTipos={catalogoTipos}
                    catalogoTelas={catalogoTelas} catalogoEntalles={catalogoEntalles}
                  />
                </TabsContent>

                                {/* TAB MOVIMIENTOS */}
                <TabsContent value="movimientos" className="space-y-4 mt-0">
                  <RegistroMovimientosCard
                    movimientosProduccion={movimientosProduccion} serviciosProduccion={serviciosProduccion}
                    isParalizado={isParalizado} onOpenDialog={handleOpenMovimientoDialog}
                    onDelete={handleDeleteMovimiento} onGenerarGuia={handleGenerarGuia}
                    totalCantidad={totalCantidadMovimientos}
                    permisos={permsMovimientos}
                  />
                </TabsContent>

                {/* TAB TALLAS */}
                <TabsContent value="tallas" className="space-y-4 mt-0">
                  <RegistroTallasCard
                    tallasSeleccionadas={tallasSeleccionadas} tallasDisponibles={tallasDisponibles}
                    onAddTalla={handleAddTalla} onCantidadChange={handleTallaCantidadChange}
                    onRemoveTalla={handleRemoveTalla} tieneColores={tieneColores}
                    onOpenColoresDialog={handleOpenColoresDialog} distribucionColores={distribucionColores}
                  />
                </TabsContent>

                {/* TAB MATERIALES */}
                <TabsContent value="materiales" className="space-y-4 mt-0">
                  <Card><CardContent className="pt-4">
                    <MaterialesTab registroId={id} totalPrendas={1} modeloId={formData.modelo_id} lineaNegocioId={formData.linea_negocio_id}
                      lineasNegocio={lineasNegocio} permisos={permsInventario}
                    />
                  </CardContent></Card>
                </TabsContent>

                {/* TAB INCIDENCIAS */}
                <TabsContent value="incidencias" className="space-y-4 mt-0">
                  <RegistroIncidenciasCard
                    incidencias={incidencias} showResueltas={showResueltas}
                    onToggleResueltas={() => setShowResueltas(prev => !prev)}
                    onResolver={handleResolverIncidencia} onEliminar={handleEliminarIncidencia}
                    onNueva={() => { setIncidenciaForm({ motivo_id: '', comentario: '', paraliza: false }); setIncidenciaDialogOpen(true); }}
                    permisos={perms}
                  />
                  <ArreglosPanel registroId={id} servicios={serviciosProduccion} personas={personasProduccion} />
                </TabsContent>

                {/* TAB PT ODOO */}
                <TabsContent value="pt_odoo" className="space-y-4 mt-0">
                  <DistribucionPTPanel registroId={id} />
                </TabsContent>

                {/* TAB COSTOS */}
                <TabsContent value="costos" className="space-y-4 mt-0">
                  <CostosTab registroId={id} />
                </TabsContent>

                {/* TAB CIERRE */}
                <TabsContent value="cierre" className="space-y-4 mt-0">
                  <CierreTab
                    registroId={id}
                    registro={formData}
                    onCierreComplete={() => {
                      setFormData(prev => ({ ...prev, estado: 'CERRADA' }));
                    }}
                  />
                </TabsContent>

              </Tabs>
            )}

            {/* Mobile buttons */}
            <div className="lg:hidden flex flex-col gap-2 pt-2">
              <Button type="submit" className="w-full" disabled={loading} data-testid="btn-guardar-registro-mobile">
                <Save className="h-4 w-4 mr-2" />
                {loading ? 'Guardando...' : (isEditing ? 'Actualizar Registro' : 'Crear Registro')}
              </Button>
              {isEditing && tallasSeleccionadas.some(t => t.cantidad > 0) && perms.canAction('dividir_lotes') && (
                <Button type="button" variant="outline" size="sm" className="w-full border-blue-300 text-blue-700 hover:bg-blue-50" onClick={handleOpenDivision} data-testid="btn-dividir-lote-mobile">
                  <Scissors className="h-4 w-4 mr-2" /> Dividir Lote
                </Button>
              )}
              <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => safeNavigate('/registros')}>Cancelar</Button>
            </div>
          </div>

          {/* COLUMNA DERECHA (w-72 = 288px) */}
          <RegistroPanelLateral
            formData={formData} modeloSeleccionado={modeloSeleccionado}
            tallasSeleccionadas={tallasSeleccionadas} lineasNegocio={lineasNegocio}
            isParalizado={isParalizado} isEditing={isEditing}
            movimientosProduccion={movimientosProduccion} incidencias={incidencias}
            loading={loading} navigate={safeNavigate} onSubmit={handleSubmit}
            onOpenDivision={handleOpenDivision} id={id} API={API}
            convOpen={convOpen} setConvOpen={setConvOpen} user={user}
            permisos={perms} convRefreshKey={convRefreshKey}
          />
        </div>
      </form>

      {/* DIALOGS */}
      <ColoresDialog
        open={coloresDialogOpen} onOpenChange={setColoresDialogOpen}
        tallasSeleccionadas={tallasSeleccionadas} coloresSeleccionados={coloresSeleccionados}
        coloresCatalogo={coloresCatalogo} matrizCantidades={matrizCantidades}
        onColoresChange={handleColoresChange} onMatrizChange={handleMatrizChange}
        getCantidadMatriz={getCantidadMatriz} getTotalColor={getTotalColor}
        getTotalTallaAsignado={getTotalTallaAsignado} getTotalGeneralAsignado={getTotalGeneralAsignado}
        onProrratear={handleProrratear} onSave={handleSaveColores}
      />

      <SalidaInventarioDialog
        open={salidaDialogOpen} onOpenChange={setSalidaDialogOpen}
        salidaFormData={salidaFormData} setSalidaFormData={setSalidaFormData}
        selectedItemInventario={selectedItemInventario} selectedRollo={selectedRollo}
        itemsInventario={itemsInventario} rollosDisponibles={rollosDisponibles}
        busquedaItem={busquedaItem} setBusquedaItem={setBusquedaItem}
        itemSelectorOpen={itemSelectorOpen} setItemSelectorOpen={setItemSelectorOpen}
        onItemChange={handleItemInventarioChange} onRolloChange={handleRolloChange}
        onCreateSalida={handleCreateSalida} saving={saving}
      />

      <SalidaRollosDialog open={rollosDialogOpen} onOpenChange={setRollosDialogOpen} registroId={id}
        onSuccess={() => { fetchSalidasRegistro(); axios.get(`${API}/inventario?all=true`).then(res => setItemsInventario(res.data)); }} />

      <MovimientoDialog
        open={movimientoDialogOpen} onOpenChange={setMovimientoDialogOpen}
        editingMovimiento={editingMovimiento} movimientoFormData={movimientoFormData}
        setMovimientoFormData={setMovimientoFormData} serviciosProduccion={serviciosProduccion}
        personasFiltradas={personasFiltradas} modeloSeleccionado={modeloSeleccionado}
        servicioPopoverOpen={servicioPopoverOpen} setServicioPopoverOpen={setServicioPopoverOpen}
        personaPopoverOpen={personaPopoverOpen} setPersonaPopoverOpen={setPersonaPopoverOpen}
        onServicioChange={handleServicioChange} onPersonaChange={handlePersonaChange}
        onSave={handleSaveMovimiento} saving={saving}
        getTarifaPersonaServicio={getTarifaPersonaServicio} formatCurrency={formatCurrency}
        calcularCostoMovimiento={calcularCostoMovimiento} calcularDiferenciaMovimiento={calcularDiferenciaMovimiento}
        usaRuta={usaRuta} etapasCompletas={etapasCompletas} movimientosProduccion={movimientosProduccion}
        detalleCostos={detalleCostosMovimiento} setDetalleCostos={setDetalleCostosMovimiento}
      />

      <SugerenciaEstadoDialog dialog={sugerenciaEstadoDialog} onClose={() => setSugerenciaEstadoDialog(null)}
        formData={formData} onAutoGuardarEstado={autoGuardarEstado} />

      <SugerenciaMovDialog dialog={sugerenciaMovDialog} onClose={() => setSugerenciaMovDialog(null)}
        formData={formData} onOpenMovimientoPrelleno={handleOpenMovimientoPrelleno} />

      <IncidenciaDialog
        open={incidenciaDialogOpen} onOpenChange={setIncidenciaDialogOpen}
        incidenciaForm={incidenciaForm} setIncidenciaForm={setIncidenciaForm}
        motivosIncidencia={motivosIncidencia} onCrear={handleCrearIncidencia}
        nuevoMotivoNombre={nuevoMotivoNombre} setNuevoMotivoNombre={setNuevoMotivoNombre}
        onCrearMotivo={handleCrearMotivo} gestionMotivos={gestionMotivos} setGestionMotivos={setGestionMotivos}
        editandoMotivo={editandoMotivo} setEditandoMotivo={setEditandoMotivo}
        editMotivoNombre={editMotivoNombre} setEditMotivoNombre={setEditMotivoNombre}
        onEditarMotivo={handleEditarMotivo} onEliminarMotivo={handleEliminarMotivo}
      />

      <ForzarEstadoDialog dialog={forzarEstadoDialog} onClose={() => setForzarEstadoDialog(null)}
        onForzar={handleForzarEstado} movimientosProduccion={movimientosProduccion}
        onOpenMovimientoDialog={handleOpenMovimientoDialog} />

      <RetrocesoEstadoDialog dialog={retrocesoDialog} onClose={() => setRetrocesoDialog(null)}
        onConfirmar={handleConfirmarRetroceso} />

      <AdvertenciaCantidadDialog dialog={advertenciaCantidadDialog} onClose={() => setAdvertenciaCantidadDialog(null)}
        onContinuar={handleContinuarConAdvertencia} />

      <DivisionDialog open={divisionDialogOpen} onOpenChange={setDivisionDialogOpen}
        formData={formData} divisionTallas={divisionTallas} setDivisionTallas={setDivisionTallas}
        onDividir={handleDividirLote} />

      {/* Conversación */}
      {isEditing && (
        <>
          <div className="lg:hidden">
            {!convOpen && <ConversacionTrigger registroId={id} onClick={() => setConvOpen(true)} />}
          </div>
          <ConversacionPanel registroId={id} usuario={user?.nombre_completo || user?.username || 'Usuario'}
            open={convOpen} onClose={() => setConvOpen(false)} onMensajeChange={() => setConvRefreshKey(k => k + 1)} />
        </>
      )}

      {/* Dialog confirmación salir sin guardar */}
      <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cambios sin guardar</AlertDialogTitle>
            <AlertDialogDescription>
              Tienes cambios sin guardar. ¿Deseas salir sin guardar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowExitDialog(false)}>Seguir editando</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => {
              setShowExitDialog(false);
              savedRef.current = true;
              if (pendingNavRef.current) navigate(pendingNavRef.current);
            }}>
              Salir sin guardar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
