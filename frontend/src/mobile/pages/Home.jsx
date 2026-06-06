import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import {
  AlertOctagon, ChevronRight, Loader2, AlertTriangle, Clock, Layers,
  QrCode, Package, ArrowUpRight, Plus, DollarSign, Sliders, FlaskConical,
  Send, BookmarkCheck, History, Box, PauseCircle, BarChart3, Palette,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { puede, ACCIONES } from '../utils/permisos';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Home móvil — Launcher contextual por rol (Sprint 39+).
 *
 * Estructura:
 *   1. Header verde con saludo + bell + avatar
 *   2. Panel "Requiere atención"  (contextual, se oculta si no hay nada)
 *   3. KPIs sumarios               (3 números grandes, contextuales)
 *   4. Lista compacta agrupada     (Producción / Inventario / Acabado / Reportar)
 *
 * Los datos vienen de varios GETs paralelos a endpoints existentes (Forma B).
 * Cada item de la lista se filtra con puede(user, ACCION).
 */
export const MobileHome = () => {
  const { user } = useAuth();

  // ─── Estado de carga + datos ────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    registros: [],          // lista completa de registros activos (urg/paraliz se calculan acá)
    fallados_vencidos: 0,
    fallados_por_vencer: 0,
    ingresos_pendientes: 0,
    stock_bajo: 0,
    stock_agotado: 0,
    notif_no_leidas: 0,
    inc_abiertas: 0,
    inc_paralizadas: 0,
  });

  useEffect(() => {
    let cancelado = false;
    (async () => {
      // Disparamos en paralelo. Cada uno con .catch para no tirar todo.
      const [
        regsRes,
        falladosRes,
        ingresosRes,
        stockRes,
        notifRes,
        incRes,
      ] = await Promise.all([
        // Registros activos (urgentes/paralizados/normales)
        axios.get(`${API}/registros?limit=200&excluir_estados=Tienda,CERRADA,ANULADA`)
          .catch(() => ({ data: { items: [] } })),
        // Fallados — solo si tiene acceso a calidad
        puede(user, ACCIONES.REPORTAR_FALLADO) || puede(user, ACCIONES.PRORROGA_ARREGLO)
          ? axios.get(`${API}/fallados/tablero`).catch(() => ({ data: null }))
          : Promise.resolve({ data: null }),
        // Ingresos pendientes de facturación — solo si tiene acceso a inventario
        puede(user, ACCIONES.CREAR_INGRESO_MP)
          ? axios.get(`${API}/inventario-ingresos`).catch(() => ({ data: [] }))
          : Promise.resolve({ data: [] }),
        // Alertas de stock — solo para supervisor_inventario
        puede(user, ACCIONES.CREAR_INGRESO_MP) || user?.rol === 'admin'
          ? axios.get(`${API}/inventario/alertas-stock`).catch(() => ({ data: { items: [] } }))
          : Promise.resolve({ data: { items: [] } }),
        // Notificaciones no leídas
        axios.get(`${API}/notificaciones?solo_no_leidas=true&limit=1`)
          .catch(() => ({ data: { total: 0 } })),
        // Incidencias globales — solo KPIs (limit=1)
        axios.get(`${API}/incidencias?estado=todas&limit=1`)
          .catch(() => ({ data: { kpis: {} } })),
      ]);
      if (cancelado) return;

      // Procesar registros
      const regs = regsRes.data?.items || regsRes.data || [];
      // Procesar fallados
      const fall = falladosRes.data || {};
      const kpis = fall.kpis || fall;
      // Procesar ingresos pendientes
      const ingresosRaw = Array.isArray(ingresosRes.data)
        ? ingresosRes.data
        : (ingresosRes.data?.items || []);
      const pendientes = ingresosRaw.filter(
        i => (i.estado_facturacion || '').toUpperCase() === 'PENDIENTE'
      ).length;
      // Procesar stock
      const stockItems = stockRes.data?.items || stockRes.data || [];
      const stockBajo = stockItems.filter(s => Number(s.stock_actual) > 0).length;
      const stockAgotado = stockItems.filter(s => Number(s.stock_actual) <= 0).length;
      // Notificaciones
      const notifTotal = typeof notifRes.data?.total === 'number'
        ? notifRes.data.total
        : (Array.isArray(notifRes.data) ? notifRes.data.length : 0);

      // Incidencias (KPIs globales)
      const incKpis = incRes.data?.kpis || {};
      const incAbiertas = Number(incKpis.abiertas || 0);
      const incParalizadas = Number(incKpis.paralizadas || 0);

      setStats({
        registros: regs,
        fallados_vencidos: Number(kpis.vencidos || kpis.fallados_vencidos || 0),
        fallados_por_vencer: Number(kpis.por_vencer || kpis.fallados_por_vencer || 0),
        ingresos_pendientes: pendientes,
        stock_bajo: stockBajo,
        stock_agotado: stockAgotado,
        notif_no_leidas: notifTotal,
        inc_abiertas: incAbiertas,
        inc_paralizadas: incParalizadas,
      });
      setLoading(false);
    })();
    return () => { cancelado = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.rol, user?.username]);

  // ─── Cálculos derivados ─────────────────────────────────────────────────
  const urgentes = useMemo(() => stats.registros.filter(r => r.urgente), [stats.registros]);
  const paralizados = useMemo(
    () => stats.registros.filter(r => (r.estado_operativo === 'PARALIZADA' || r.paralizacion_activa)),
    [stats.registros]
  );

  const nombre = (user?.nombre_completo || user?.username || 'Operario').split(' ')[0];

  // ─── Resumen contextual del panel "Requiere atención" ───────────────────
  // Devuelve { tono, items: [{n, label}] } o null si no hay nada.
  const resumenAtencion = useMemo(
    () => buildResumenAtencion(user, { ...stats, urgentes, paralizados }),
    [user, stats, urgentes, paralizados]
  );

  // ─── KPIs sumarios contextuales ─────────────────────────────────────────
  const kpisSumarios = useMemo(
    () => buildKPIs(user, { ...stats, urgentes, paralizados }),
    [user, stats, urgentes, paralizados]
  );

  // ─── Items del launcher por sección, filtrados por puede() ──────────────
  const secciones = useMemo(() => buildSecciones(user, stats), [user, stats]);

  return (
    <div>
      {/* Nota: el header verde con saludo + bell + avatar lo provee
          MobileLayout (común a todas las pantallas). Antes había uno aquí
          también, lo que producía un header duplicado. */}
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Saludo + fecha */}
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.1 }}>
            {saludo()}, {nombre}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
            {fechaHoy()}
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40, color: '#64748b' }}>
            <Loader2 className="m-spin" size={24} />
          </div>
        ) : (
          <>
            {/* Panel "Requiere atención" — solo si hay algo */}
            {resumenAtencion && resumenAtencion.items.length > 0 && (
              <PanelAtencion resumen={resumenAtencion} />
            )}

            {/* KPIs sumarios */}
            {kpisSumarios && (
              <div className="m-card" style={{ padding: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, textAlign: 'center' }}>
                  {kpisSumarios.map((k, i) => (
                    <div key={i}>
                      <div style={{
                        fontSize: 20, fontWeight: 800, lineHeight: 1.1,
                        color: k.color || 'var(--m-brand)',
                        fontFamily: 'ui-monospace, monospace',
                      }}>{k.value}</div>
                      <div style={{
                        fontSize: 9, color: '#64748b', fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: '.04em', marginTop: 2,
                      }}>{k.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Lista compacta agrupada */}
            {secciones.map(sec => (
              <SeccionLista key={sec.titulo} sec={sec} />
            ))}
          </>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
//   Panel "Requiere atención" — gradiente rojo/ámbar según severidad
// ═══════════════════════════════════════════════════════════════════════════
const PanelAtencion = ({ resumen }) => {
  const tono = resumen.tono || 'rojo';
  const gradient = tono === 'rojo'
    ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)'
    : 'linear-gradient(135deg, #d97706 0%, #b45309 100%)';
  const shadow = tono === 'rojo'
    ? '0 10px 25px -10px rgba(220,38,38,.5)'
    : '0 10px 25px -10px rgba(217,119,6,.4)';
  const ctaColor = tono === 'rojo' ? '#b91c1c' : '#b45309';

  return (
    <div style={{
      borderRadius: 16, padding: 14, color: 'white',
      background: gradient, boxShadow: shadow,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, opacity: 0.9,
        textTransform: 'uppercase', letterSpacing: '.06em',
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
      }}>
        <AlertOctagon size={14} />
        Requieren atención
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.min(resumen.items.length, 3)}, 1fr)`,
        gap: 8,
      }}>
        {resumen.items.map((it, i) => (
          <div key={i} style={{
            background: 'rgba(255,255,255,0.15)',
            borderRadius: 10, padding: 8, textAlign: 'center',
          }}>
            <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1, fontFamily: 'ui-monospace, monospace' }}>
              {it.n}
            </div>
            <div style={{ fontSize: 9, opacity: 0.9, marginTop: 4, fontWeight: 600 }}>
              {it.label.toUpperCase()}
            </div>
          </div>
        ))}
      </div>
      {resumen.cta && (
        <Link
          to={resumen.cta.to}
          style={{
            display: 'block', textAlign: 'center',
            marginTop: 10, padding: '8px 12px',
            background: 'white', color: ctaColor,
            borderRadius: 10, fontSize: 12, fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          {resumen.cta.label} →
        </Link>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
//   Sección de lista compacta agrupada
// ═══════════════════════════════════════════════════════════════════════════
const SeccionLista = ({ sec }) => (
  <div>
    <div className="m-label-xs" style={{ marginBottom: 8 }}>{sec.titulo}</div>
    <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 16, overflow: 'hidden' }}>
      {sec.items.map((it, i) => (
        <Link
          key={it.label}
          to={it.to}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: 12,
            borderBottom: i < sec.items.length - 1 ? '1px solid #f1f5f9' : 0,
            textDecoration: 'none', color: 'inherit',
          }}
        >
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: it.bg, color: it.fg,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            {it.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{it.label}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>{it.meta}</div>
          </div>
          {it.badge ? (
            <span style={{
              background: it.badgeColor || '#ef4444',
              color: 'white', fontSize: 10, fontWeight: 700,
              borderRadius: 999, padding: '2px 8px', minWidth: 22, textAlign: 'center',
            }}>{it.badge}</span>
          ) : it.nuevo ? (
            <span style={{ fontSize: 10, fontWeight: 700, color: '#059669', textTransform: 'uppercase' }}>
              Nuevo
            </span>
          ) : (
            <ChevronRight size={16} style={{ color: '#cbd5e1' }} />
          )}
        </Link>
      ))}
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════
//   Lógica contextual: panel, KPIs, secciones
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Determina qué mostrar en el panel "Requiere atención" según el rol.
 * Devuelve null si el rol no tiene nada relevante.
 */
function buildResumenAtencion(user, stats) {
  const rol = user?.rol || '';
  const urgentes = stats.urgentes?.length || 0;
  const paralizados = stats.paralizados?.length || 0;
  const fallados = stats.fallados_vencidos || 0;
  const stockBajo = stats.stock_bajo || 0;
  const stockAgotado = stats.stock_agotado || 0;

  // SUPERVISOR INVENTARIO → stock crítico
  if (rol === 'supervisor_inventario') {
    if (stockBajo === 0 && stockAgotado === 0) return null;
    return {
      tono: stockAgotado > 0 ? 'rojo' : 'ambar',
      items: [
        ...(stockBajo > 0 ? [{ n: stockBajo, label: 'Stock bajo' }] : []),
        ...(stockAgotado > 0 ? [{ n: stockAgotado, label: 'Agotados' }] : []),
      ],
      cta: { label: 'Ver alertas', to: '/m/registros' }, // TODO: pantalla de alertas móvil
    };
  }

  // SUPERVISOR ACABADO → fallados + urgentes
  if (rol === 'supervisor_acabado') {
    if (urgentes === 0 && fallados === 0) return null;
    return {
      tono: 'ambar',
      items: [
        ...(fallados > 0 ? [{ n: fallados, label: 'Fallados venc.' }] : []),
        ...(urgentes > 0 ? [{ n: urgentes, label: 'Urg. acabado' }] : []),
      ],
      cta: { label: 'Ver registros urgentes', to: '/m/registros' },
    };
  }

  // Incidencias paralizadas (de cualquier corte) — vienen del endpoint global.
  const incParalizadas = stats.inc_paralizadas || 0;

  // ADMIN → todo
  if (rol === 'admin') {
    if (urgentes === 0 && paralizados === 0 && fallados === 0 && incParalizadas === 0) return null;
    return {
      tono: 'rojo',
      items: [
        ...(urgentes > 0 ? [{ n: urgentes, label: 'Urgentes' }] : []),
        ...(incParalizadas > 0 ? [{ n: incParalizadas, label: 'Inc. paraliz.' }] : []),
        ...(fallados > 0 ? [{ n: fallados, label: 'Fallados' }] : []),
        ...(paralizados > 0 ? [{ n: paralizados, label: 'Paraliz.' }] : []),
      ].slice(0, 3),
      cta: { label: 'Ver registros', to: '/m/registros' },
    };
  }

  // Operarios y supervisores de producción → urgentes + paralizados + inc. paralizadas
  if (urgentes === 0 && paralizados === 0 && incParalizadas === 0) return null;
  return {
    tono: 'rojo',
    items: [
      ...(urgentes > 0 ? [{ n: urgentes, label: 'Urgentes' }] : []),
      ...(incParalizadas > 0 ? [{ n: incParalizadas, label: 'Inc. paraliz.' }] : []),
      ...(paralizados > 0 ? [{ n: paralizados, label: 'Paraliz.' }] : []),
    ],
    cta: { label: 'Ver registros', to: '/m/registros' },
  };
}

/**
 * KPIs sumarios contextuales por rol.
 */
function buildKPIs(user, stats) {
  const rol = user?.rol || '';
  const totalActivos = stats.registros?.length || 0;
  const urgentes = stats.urgentes?.length || 0;

  if (rol === 'supervisor_inventario') {
    return [
      { value: totalActivos, label: 'Cortes activos', color: 'var(--m-brand)' },
      { value: stats.ingresos_pendientes || 0, label: 'Ing. pendientes', color: '#b45309' },
      { value: stats.stock_bajo || 0, label: 'Stock bajo', color: '#dc2626' },
    ];
  }

  if (rol === 'supervisor_acabado') {
    return [
      { value: totalActivos, label: 'Activos', color: 'var(--m-brand)' },
      { value: stats.fallados_vencidos || 0, label: 'Fallados', color: '#b45309' },
      { value: stats.fallados_por_vencer || 0, label: 'Por vencer', color: '#0f172a' },
    ];
  }

  // Default (admin, supervisores, operarios)
  return [
    { value: totalActivos, label: 'Activos', color: 'var(--m-brand)' },
    { value: urgentes, label: 'Urgentes', color: '#dc2626' },
    { value: stats.fallados_vencidos || 0, label: 'Fallados', color: '#b45309' },
  ];
}

/**
 * Construye las secciones de la lista, filtrando items por permiso.
 * Si una sección queda vacía, no se incluye.
 */
function buildSecciones(user, stats) {
  const secs = [];
  const totalActivos = stats.registros?.length || 0;
  const urgentes = stats.registros?.filter(r => r.urgente).length || 0;

  // ─── Producción ────────────────────────────────────────────────────
  const produccion = [];
  produccion.push({
    label: 'Registros', icon: <Layers size={18} />,
    bg: '#dbeafe', fg: '#2563eb',
    meta: `${totalActivos} activos${urgentes > 0 ? ` · ${urgentes} urgentes` : ''}`,
    to: '/m/registros',
  });
  produccion.push({
    label: 'Escanear QR', icon: <QrCode size={18} />,
    bg: 'var(--m-brand-soft)', fg: 'var(--m-brand)',
    meta: 'Abrir corte con cámara',
    to: '/m/escanear',
  });
  // Incidencias globales — visible para todos los autenticados (es de seguimiento)
  const incAbiertas = stats.inc_abiertas || 0;
  const incParaliz = stats.inc_paralizadas || 0;
  produccion.push({
    label: 'Incidencias', icon: <PauseCircle size={18} />,
    bg: incParaliz > 0 ? '#fee2e2' : '#fef3c7',
    fg: incParaliz > 0 ? '#dc2626' : '#b45309',
    meta: incAbiertas === 0
      ? 'Sin incidencias abiertas'
      : `${incAbiertas} abierta${incAbiertas !== 1 ? 's' : ''}${incParaliz > 0 ? ` · ${incParaliz} ⛔` : ''}`,
    to: '/m/incidencias',
    badge: incParaliz > 0 ? incParaliz : (incAbiertas > 0 ? incAbiertas : null),
    badgeColor: incParaliz > 0 ? '#dc2626' : '#b45309',
  });
  // Reporte operativo — seguimiento por servicio/persona/corte
  produccion.push({
    label: 'Reporte operativo', icon: <BarChart3 size={18} />,
    bg: '#f0fdfa', fg: '#0f766e',
    meta: 'Cortes por servicio y persona',
    to: '/m/reporte-operativo',
  });
  // Cortes sin colores — pendientes de matriz desde Lavandería en adelante
  produccion.push({
    label: 'Cortes sin colores', icon: <Palette size={18} />,
    bg: '#ccfbf1', fg: '#0f766e',
    meta: 'Asignar matriz (Lavandería en adelante)',
    to: '/m/cortes-sin-colores',
  });
  // Envíos de muestra (Lavandería + Diseño)
  const muestrasSinVolver = stats.muestras_sin_volver || 0;
  const muestrasDemoradas = stats.muestras_demoradas || 0;
  if (puede(user, ACCIONES.CREAR_MUESTRA_LAVANDERIA) || muestrasSinVolver > 0) {
    produccion.push({
      label: 'Envíos de muestra', icon: <FlaskConical size={18} />,
      bg: '#f3e8ff', fg: '#7c3aed',
      meta: muestrasSinVolver === 0
        ? 'Lavandería o Diseño'
        : `${muestrasSinVolver} sin volver${muestrasDemoradas > 0 ? ` · ${muestrasDemoradas} demoradas` : ''}`,
      to: '/m/envios-muestra',
      badge: muestrasSinVolver > 0 ? muestrasSinVolver : null,
      badgeColor: muestrasDemoradas > 0 ? '#b45309' : '#7c3aed',
    });
  }
  if (puede(user, ACCIONES.CREAR_CORTE)) {
    produccion.push({
      label: 'Nuevo corte', icon: <Plus size={18} />,
      bg: '#f3e8ff', fg: '#7e22ce',
      meta: 'Crear registro',
      to: '/m/registros/nuevo',
    });
  }
  if (produccion.length > 0) secs.push({ titulo: 'Producción', items: produccion });

  // ─── Inventario ────────────────────────────────────────────────────
  const inventario = [];
  if (puede(user, ACCIONES.CREAR_INGRESO_MP)) {
    inventario.push({
      label: 'Ingresos de MP', icon: <Package size={18} />,
      bg: '#ecfdf5', fg: '#059669',
      meta: stats.ingresos_pendientes > 0
        ? `${stats.ingresos_pendientes} pendientes`
        : 'Recepciones de material',
      to: '/m/ingresos',
      badge: stats.ingresos_pendientes > 0 ? stats.ingresos_pendientes : null,
    });
  }
  if (puede(user, ACCIONES.CREAR_SALIDA_LIBRE)) {
    inventario.push({
      label: 'Salidas libres', icon: <ArrowUpRight size={18} />,
      bg: '#f0fdfa', fg: 'var(--m-brand)',
      meta: 'Mermas, muestras, daño',
      to: '/m/salidas-libres',
    });
  }
  // Sprint 39 — pantallas nuevas (pendientes de implementar después)
  // Las dejamos comentadas hasta que existan
  // if (puede(user, ACCIONES.AJUSTAR_STOCK)) {
  //   inventario.push({
  //     label: 'Crear material', ... to: '/m/inventario/nuevo', nuevo: true,
  //   });
  //   inventario.push({
  //     label: 'Ajuste de stock', ... to: '/m/ajustes/nuevo', nuevo: true,
  //   });
  // }
  if (inventario.length > 0) secs.push({ titulo: 'Inventario', items: inventario });

  // ─── Acabado y calidad ─────────────────────────────────────────────
  const acabado = [];
  if (puede(user, ACCIONES.PRORROGA_ARREGLO) || puede(user, ACCIONES.MARCAR_PARA_COBRO)) {
    acabado.push({
      label: 'Fallados pendientes', icon: <AlertOctagon size={18} />,
      bg: '#fee2e2', fg: '#dc2626',
      meta: stats.fallados_vencidos > 0
        ? `${stats.fallados_vencidos} vencidos · ${stats.fallados_por_vencer} por vencer`
        : 'Tablero de calidad',
      to: '/m/fallados',
      badge: stats.fallados_vencidos > 0 ? stats.fallados_vencidos : null,
    });
  }
  if (puede(user, ACCIONES.GENERAR_NOTA_COBRO)) {
    acabado.push({
      label: 'Cobro de arreglos', icon: <DollarSign size={18} />,
      bg: '#fef9c3', fg: '#a16207',
      meta: 'Notas por proveedor',
      to: '/m/cobro',
    });
  }
  // (La entrada "Muestras lavandería" fue movida a "Envíos de muestra" en Producción - Sprint 43)
  if (acabado.length > 0) secs.push({ titulo: 'Acabado y calidad', items: acabado });

  // ─── Otros ─────────────────────────────────────────────────────────
  const otros = [];
  otros.push({
    label: 'Mi historial', icon: <History size={18} />,
    bg: '#fef3c7', fg: '#b45309',
    meta: 'Mis acciones recientes',
    to: '/m/historial',
  });
  otros.push({
    label: 'Notificaciones', icon: <Send size={18} />,
    bg: '#fff7ed', fg: '#c2410c',
    meta: stats.notif_no_leidas > 0
      ? `${stats.notif_no_leidas} nuevas`
      : 'Tus alertas',
    to: '/m/notificaciones',
    badge: stats.notif_no_leidas > 0 ? stats.notif_no_leidas : null,
    badgeColor: stats.notif_no_leidas > 0 ? '#ef4444' : null,
  });
  if (otros.length > 0) secs.push({ titulo: 'Otros', items: otros });

  return secs;
}

// ═══════════════════════════════════════════════════════════════════════════
//   RegistroCard — exportado porque RegistrosList lo importa
// ═══════════════════════════════════════════════════════════════════════════
export const RegistroCard = ({ registro: r }) => {
  return (
    <Link
      to={`/m/registros/${r.id}`}
      className="m-card"
      style={{
        display: 'block', textDecoration: 'none', color: 'inherit',
        padding: 12,
        ...(r.urgente ? { borderLeft: '3px solid #ef4444' } : {}),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {r.urgente && (
              <span style={{
                background: '#fee2e2', color: '#b91c1c',
                fontSize: 9, fontWeight: 700, padding: '1px 6px',
                borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 2,
              }}>
                <AlertOctagon size={9} /> URG
              </span>
            )}
            {r.estado && (
              <span style={{
                background: '#f1f5f9', color: '#475569',
                fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 999,
                textTransform: 'uppercase',
              }}>{r.estado}</span>
            )}
          </div>
          <div style={{
            fontWeight: 600, fontSize: 14, marginTop: 4,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {r.modelo_nombre || r.modelo_manual?.nombre_modelo || '—'}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, fontFamily: 'ui-monospace, monospace' }}>
            {r.n_corte}
          </div>
        </div>
        <ChevronRight size={18} style={{ color: '#cbd5e1', flexShrink: 0 }} />
      </div>
    </Link>
  );
};

function saludo() {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

function fechaHoy() {
  return new Date().toLocaleDateString('es-PE', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

export default MobileHome;
