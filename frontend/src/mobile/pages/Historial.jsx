import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Loader2, History, ArrowDownToLine, ArrowRight, Check,
  AlertTriangle, Plus, Trash2, Pencil, LogIn, Edit3,
  Package, Layers, AlertOctagon, FlaskConical, MessageSquare,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Historial / feed de actividad — bottom nav.
 *
 * Dos tabs:
 *   - Yo (N): mis acciones
 *   - Equipo (N): acciones de todo el equipo (con chips para filtrar por persona)
 *
 * Lista agrupada por fecha: Hoy / Ayer / Esta semana / Más antiguas.
 *
 * Endpoint: GET /api/actividad-feed?solo_yo=true|false&usuario_id=...
 */
export const MobileHistorial = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [tab, setTab] = useState('yo'); // 'yo' | 'equipo'
  const [items, setItems] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [filtroUsuario, setFiltroUsuario] = useState(null); // id de usuario o null
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '80' });
      if (tab === 'yo') {
        params.set('solo_yo', 'true');
      } else if (filtroUsuario) {
        params.set('usuario_id', filtroUsuario);
      }
      const res = await axios.get(`${API}/actividad-feed?${params}`);
      setItems(res.data?.items || []);
      setUsuarios(res.data?.usuarios || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [tab, filtroUsuario]);

  useEffect(() => { cargar(); }, [cargar]);

  // Cuando cambia el tab, reseteo el filtro de persona
  useEffect(() => { setFiltroUsuario(null); }, [tab]);

  // Contar mías vs equipo (necesitamos un fetch para contadores; usamos los del feed actual como aproximación)
  const totalYo = useMemo(() => {
    if (tab === 'yo') return items.length;
    return items.filter(it => String(it.usuario_id) === String(user?.id)).length;
  }, [items, tab, user]);

  const grupos = useMemo(() => agruparPorFecha(items), [items]);

  return (
    <div>
      <div className="m-header">
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, opacity: 0.8 }}>Historial</div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>
            {tab === 'yo' ? 'Mis acciones' : 'Actividad del equipo'}
          </div>
        </div>
      </div>

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Segmented Yo / Equipo */}
        <div style={{
          display: 'flex', background: '#f1f5f9',
          borderRadius: 12, padding: 3, gap: 2,
        }}>
          <button
            onClick={() => setTab('yo')}
            style={tabBtnStyle(tab === 'yo')}
          >
            Yo {tab === 'yo' && <Contador n={items.length} activo />}
          </button>
          <button
            onClick={() => setTab('equipo')}
            style={tabBtnStyle(tab === 'equipo')}
          >
            Equipo {tab === 'equipo' && <Contador n={items.length} activo />}
          </button>
        </div>

        {/* Chips de personas (solo en tab Equipo) */}
        {tab === 'equipo' && usuarios.length > 0 && (
          <div style={{
            display: 'flex', gap: 6, overflowX: 'auto',
            paddingBottom: 4,
          }}>
            <button
              className={`m-chip ${!filtroUsuario ? 'active' : ''}`}
              style={{ fontSize: 12, minHeight: 32, whiteSpace: 'nowrap' }}
              onClick={() => setFiltroUsuario(null)}
            >
              Todos
            </button>
            {usuarios.map(u => (
              <button
                key={u.id}
                className={`m-chip ${filtroUsuario === u.id ? 'active' : ''}`}
                style={{ fontSize: 12, minHeight: 32, whiteSpace: 'nowrap' }}
                onClick={() => setFiltroUsuario(u.id)}
              >
                {u.nombre}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <Loader2 className="m-spin" size={24} style={{ color: '#94a3b8' }} />
          </div>
        ) : items.length === 0 ? (
          <div className="m-card" style={{
            textAlign: 'center', color: '#64748b', padding: 32,
          }}>
            <History size={32} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
            <p style={{ margin: 0, fontSize: 13 }}>
              {tab === 'yo'
                ? 'No has hecho movimientos todavía.'
                : 'Sin actividad reciente del equipo.'}
            </p>
          </div>
        ) : (
          <>
            {grupos.hoy.length > 0 && (
              <Seccion titulo="Hoy" items={grupos.hoy} tab={tab} navigate={navigate} miId={user?.id} />
            )}
            {grupos.ayer.length > 0 && (
              <Seccion titulo="Ayer" items={grupos.ayer} tab={tab} navigate={navigate} miId={user?.id} />
            )}
            {grupos.semana.length > 0 && (
              <Seccion titulo="Esta semana" items={grupos.semana} tab={tab} navigate={navigate} miId={user?.id} />
            )}
            {grupos.antiguas.length > 0 && (
              <Seccion titulo="Más antiguas" items={grupos.antiguas} tab={tab} navigate={navigate} miId={user?.id} />
            )}
          </>
        )}
      </div>
    </div>
  );
};

/* ──────── Sección por fecha ──────── */
const Seccion = ({ titulo, items, tab, navigate, miId }) => (
  <div>
    <div className="m-label-xs" style={{ marginBottom: 8 }}>{titulo}</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map(it => (
        <ActividadCard
          key={it.id}
          item={it}
          mostrarUsuario={tab === 'equipo'}
          onClick={() => {
            if (it.registro_id) navigate(`/m/registros/${it.registro_id}`);
          }}
          esMio={String(it.usuario_id) === String(miId)}
        />
      ))}
    </div>
  </div>
);

/* ──────── Card de actividad ──────── */
const ActividadCard = ({ item, mostrarUsuario, onClick, esMio }) => {
  const cfg = iconoYColor(item.tipo_accion, item.tabla_afectada);
  const Icon = cfg.Icon;
  const hora = fmtHora(item.created_at);
  const esCritico = item.tipo_accion === 'eliminar'
    || (item.descripcion || '').toLowerCase().includes('incidencia');

  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', padding: 12,
        background: esCritico ? '#fef2f2' : 'white',
        border: `1px solid ${esCritico ? '#fecaca' : '#e5e7eb'}`,
        borderRadius: 12, textAlign: 'left',
        cursor: 'pointer',
        display: 'flex', gap: 10, alignItems: 'flex-start',
      }}
    >
      {/* Icono o avatar */}
      {mostrarUsuario && item.usuario_nombre ? (
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: avatarBg(item.usuario_nombre), color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 800, flexShrink: 0,
        }}>
          {iniciales(item.usuario_nombre)}
        </div>
      ) : (
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: cfg.bg, color: cfg.fg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Icon size={16} />
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: '#0f172a', lineHeight: 1.35 }}>
          {mostrarUsuario && item.usuario_nombre
            ? <><strong>{esMio ? 'Tú' : item.usuario_nombre}</strong>{' '}{accionEnTexto(item.tipo_accion)}{' '}
                <strong style={{ color: cfg.fg }}>{labelTabla(item.tabla_afectada)}</strong></>
            : <strong>{descripcionCorta(item)}</strong>
          }
        </div>
        {(item.registro_nombre || item.descripcion) && (
          <div style={{
            fontSize: 11, color: '#64748b', marginTop: 2, lineHeight: 1.4,
            overflow: 'hidden', textOverflow: 'ellipsis',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {item.registro_nombre && <strong style={{ color: '#475569' }}>{item.registro_nombre}</strong>}
            {item.registro_nombre && item.descripcion && ' · '}
            {item.descripcion}
          </div>
        )}
        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
          {hora}
          {!mostrarUsuario && item.usuario_nombre && ` · por ${esMio ? 'ti' : item.usuario_nombre}`}
        </div>
      </div>
    </button>
  );
};

const Contador = ({ n, activo }) => (
  <span style={{
    marginLeft: 6,
    background: activo ? 'rgba(15,118,110,0.12)' : '#e5e7eb',
    color: activo ? 'var(--m-brand)' : '#64748b',
    padding: '1px 7px', borderRadius: 999,
    fontSize: 11, fontWeight: 700,
  }}>{n}</span>
);

const tabBtnStyle = (activo) => ({
  flex: 1, padding: '8px 10px', border: 0,
  background: activo ? 'white' : 'transparent',
  borderRadius: 8, fontSize: 13, fontWeight: 700,
  color: activo ? 'var(--m-brand)' : '#64748b',
  boxShadow: activo ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
  cursor: 'pointer',
});

/* ──────── Helpers ──────── */

function agruparPorFecha(items) {
  const ahora = new Date();
  const hoy0 = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const ayer0 = new Date(hoy0); ayer0.setDate(ayer0.getDate() - 1);
  const sem0  = new Date(hoy0); sem0.setDate(sem0.getDate() - 7);

  const hoy = [], ayer = [], semana = [], antiguas = [];
  for (const it of items) {
    const d = new Date(it.created_at);
    if (d >= hoy0) hoy.push(it);
    else if (d >= ayer0) ayer.push(it);
    else if (d >= sem0) semana.push(it);
    else antiguas.push(it);
  }
  return { hoy, ayer, semana, antiguas };
}

function iconoYColor(tipoAccion, tabla) {
  const t = (tipoAccion || '').toLowerCase();
  const tb = (tabla || '').toLowerCase();

  if (t === 'login')   return { bg: '#dcfce7', fg: '#15803d', Icon: LogIn };
  if (t === 'eliminar')return { bg: '#fee2e2', fg: '#b91c1c', Icon: Trash2 };

  if (tb.includes('movimiento')) return { bg: '#dbeafe', fg: '#1d4ed8', Icon: Layers };
  if (tb.includes('salida') || tb.includes('inventario')) return { bg: '#dcfce7', fg: '#15803d', Icon: ArrowDownToLine };
  if (tb.includes('incidencia')) return { bg: '#fef3c7', fg: '#b45309', Icon: AlertTriangle };
  if (tb.includes('fallado') || tb.includes('arreglo')) return { bg: '#fee2e2', fg: '#b91c1c', Icon: AlertOctagon };
  if (tb.includes('muestra')) return { bg: '#fef9c3', fg: '#a16207', Icon: FlaskConical };
  if (tb.includes('conversacion') || tb.includes('chat')) return { bg: '#f3e8ff', fg: '#7e22ce', Icon: MessageSquare };
  if (tb.includes('registro')) return { bg: '#f0fdfa', fg: '#0f766e', Icon: Package };

  if (t === 'crear')   return { bg: '#dbeafe', fg: '#1d4ed8', Icon: Plus };
  if (t === 'editar')  return { bg: '#fef9c3', fg: '#a16207', Icon: Pencil };

  return { bg: '#f1f5f9', fg: '#475569', Icon: Edit3 };
}

function accionEnTexto(tipo) {
  const t = (tipo || '').toLowerCase();
  if (t === 'crear') return 'creó';
  if (t === 'editar') return 'editó';
  if (t === 'eliminar') return 'eliminó';
  if (t === 'login') return 'inició sesión';
  if (t === 'cerrar') return 'cerró';
  if (t === 'recibir') return 'recibió';
  return t || 'actualizó';
}

function labelTabla(tabla) {
  const t = (tabla || '').toLowerCase();
  if (t.includes('movimientos_produccion')) return 'movimiento';
  if (t.includes('movimiento')) return 'movimiento';
  if (t.includes('inventario_salida')) return 'salida MP';
  if (t.includes('inventario')) return 'inventario';
  if (t.includes('incidencia')) return 'incidencia';
  if (t.includes('fallado')) return 'fallado';
  if (t.includes('arreglo')) return 'arreglo';
  if (t.includes('muestra')) return 'muestra';
  if (t.includes('conversacion')) return 'mensaje';
  if (t.includes('registro')) return 'registro';
  return t || 'evento';
}

function descripcionCorta(item) {
  return item.descripcion ||
    `${accionEnTexto(item.tipo_accion)} ${labelTabla(item.tabla_afectada)}`;
}

function iniciales(nombre) {
  return (nombre || '?').split(' ').map(s => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

function avatarBg(nombre) {
  const colores = ['#0f766e', '#1d4ed8', '#b45309', '#7e22ce', '#15803d', '#b91c1c', '#0891b2'];
  let h = 0;
  for (let i = 0; i < (nombre || '').length; i++) h = (h * 31 + nombre.charCodeAt(i)) | 0;
  return colores[Math.abs(h) % colores.length];
}

function fmtHora(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('es-PE', {
    timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit',
  });
}

export default MobileHistorial;
