import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Bell, Loader2, AlertOctagon, AlertTriangle, Info, CheckCircle2,
  X, Check, Package,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const POLLING_MS = 30_000;

/**
 * Bell global + badge + bottom sheet con últimas notificaciones.
 *
 * Se monta una sola vez en MobileLayout. Hace polling cada 30s al
 * endpoint /api/notificaciones/contador para actualizar el badge.
 * Al tocar el bell abre un sheet con las últimas 6 + link a la
 * pantalla completa /m/notificaciones.
 */
export const BellNotificaciones = () => {
  const navigate = useNavigate();
  const [contador, setContador] = useState({ total: 0, por_severidad: {} });
  const [sheet, setSheet] = useState(false);
  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);

  const fetchContador = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/notificaciones/contador`);
      setContador(res.data || { total: 0, por_severidad: {} });
    } catch {
      // silent: si el endpoint no existe aún (backend sin reiniciar) no hacemos ruido
    }
  }, []);

  // Polling cada 30 segundos
  useEffect(() => {
    fetchContador();
    const t = setInterval(fetchContador, POLLING_MS);
    return () => clearInterval(t);
  }, [fetchContador]);

  const abrirSheet = async () => {
    setSheet(true);
    setLoadingItems(true);
    try {
      const res = await axios.get(`${API}/notificaciones?limit=6`);
      setItems(res.data?.items || []);
    } catch {
      setItems([]);
    } finally {
      setLoadingItems(false);
    }
  };

  const irANotif = async (n) => {
    // Marcar leída (sin esperar)
    if (!n.leida) {
      axios.post(`${API}/notificaciones/${n.id}/marcar-leida`).catch(() => {});
    }
    setSheet(false);
    setTimeout(() => fetchContador(), 200);
    if (n.registro_id) {
      navigate(`/m/registros/${n.registro_id}`);
    } else {
      navigate('/m/notificaciones');
    }
  };

  const marcarTodas = async () => {
    try {
      await axios.post(`${API}/notificaciones/marcar-todas-leidas`);
    } catch { /* silent */ }
    setItems(prev => prev.map(n => ({ ...n, leida: true })));
    fetchContador();
  };

  return (
    <>
      <button
        className="m-h-icon"
        aria-label="Notificaciones"
        onClick={abrirSheet}
        style={{ position: 'relative' }}
      >
        <Bell size={18} />
        {contador.total > 0 && (
          <span style={{
            position: 'absolute', top: -3, right: -3,
            minWidth: 18, height: 18, padding: '0 4px',
            borderRadius: 999,
            background: contador.por_severidad?.urgente > 0 ? '#dc2626' : '#f59e0b',
            color: 'white', fontSize: 10, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid var(--m-brand)',
            lineHeight: 1,
          }}>
            {contador.total > 99 ? '99+' : contador.total}
          </span>
        )}
      </button>

      {sheet && (
        <SheetNotificaciones
          items={items}
          loading={loadingItems}
          total={contador.total}
          onClose={() => setSheet(false)}
          onTap={irANotif}
          onMarcarTodas={marcarTodas}
        />
      )}
    </>
  );
};

/* ──────── Bottom sheet con últimas notificaciones ──────── */
const SheetNotificaciones = ({ items, loading, total, onClose, onTap, onMarcarTodas }) => createPortal(
  <div
    onClick={onClose}
    style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      zIndex: 200, display: 'flex', alignItems: 'flex-end',
    }}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        background: 'white', width: '100%',
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        padding: '12px 0 20px',
        paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
        maxHeight: '85vh',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{ width: 40, height: 4, background: '#cbd5e1', borderRadius: 2, margin: '0 auto 12px' }} />

      <div style={{
        padding: '0 16px 10px', borderBottom: '1px solid #f1f5f9',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <Bell size={16} style={{ color: 'var(--m-brand)' }} />
        <div style={{ flex: 1, fontWeight: 700, fontSize: 15 }}>
          Notificaciones
          {total > 0 && (
            <span style={{
              marginLeft: 6, fontSize: 11, fontWeight: 700,
              color: '#b91c1c',
            }}>
              · {total} nuevas
            </span>
          )}
        </div>
        {total > 0 && (
          <button
            onClick={onMarcarTodas}
            style={{
              background: 'none', border: 0, color: 'var(--m-brand)',
              fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Marcar todas
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', maxHeight: '60vh' }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center' }}>
            <Loader2 className="m-spin" size={20} style={{ color: '#94a3b8' }} />
          </div>
        ) : items.length === 0 ? (
          <div style={{
            padding: 32, textAlign: 'center', color: '#94a3b8',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          }}>
            <Bell size={28} style={{ opacity: 0.3 }} />
            <p style={{ margin: 0, fontSize: 13 }}>
              Sin notificaciones por ahora.
            </p>
          </div>
        ) : (
          items.map(n => <NotifRow key={n.id} notif={n} onClick={() => onTap(n)} />)
        )}
      </div>

      <div style={{
        padding: '10px 16px 0', borderTop: '1px solid #f1f5f9',
        textAlign: 'center',
      }}>
        <Link
          to="/m/notificaciones"
          onClick={onClose}
          style={{
            display: 'inline-block', padding: '10px 16px',
            color: 'var(--m-brand)', fontWeight: 700, fontSize: 13,
            textDecoration: 'none',
          }}
        >
          Ver todas →
        </Link>
      </div>
    </div>
  </div>,
  document.body
);

/* ──────── Fila de notificación (usada en sheet y en pantalla completa) ──────── */
export const NotifRow = ({ notif, onClick }) => {
  const cfg = severidadCfg(notif.severidad);
  const Icon = cfg.Icon;
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', padding: '10px 14px',
        background: notif.leida ? 'transparent' : '#f0fdfa',
        border: 0, borderBottom: '1px solid #f1f5f9',
        textAlign: 'left', cursor: 'pointer',
        display: 'flex', gap: 10, alignItems: 'flex-start',
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: cfg.bg, color: cfg.fg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon size={16} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 700, color: '#0f172a', lineHeight: 1.3,
          overflow: 'hidden', textOverflow: 'ellipsis',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>
          {notif.titulo}
        </div>
        {notif.mensaje && (
          <div style={{
            fontSize: 11, color: '#64748b', marginTop: 2, lineHeight: 1.4,
            overflow: 'hidden', textOverflow: 'ellipsis',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {notif.mensaje}
          </div>
        )}
        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
          {tiempoRelativo(notif.created_at)} · {cfg.label}
        </div>
      </div>
      {!notif.leida && (
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: 'var(--m-brand)', flexShrink: 0, marginTop: 14,
        }} />
      )}
    </button>
  );
};

/* ──────── Config por severidad ──────── */
export function severidadCfg(severidad) {
  switch (severidad) {
    case 'urgente':  return { label: '🔴 Urgente',  bg: '#fee2e2', fg: '#b91c1c', Icon: AlertOctagon };
    case 'atencion': return { label: '🟡 Atención', bg: '#fef3c7', fg: '#b45309', Icon: AlertTriangle };
    case 'ok':       return { label: '🟢 OK',       bg: '#dcfce7', fg: '#15803d', Icon: CheckCircle2 };
    case 'info':
    default:         return { label: '🔵 Info',     bg: '#dbeafe', fg: '#1d4ed8', Icon: Info };
  }
}

/* ──────── Tiempo relativo en español ──────── */
export function tiempoRelativo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const mins = Math.floor((now - d) / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `hace ${days} d`;
  return d.toLocaleDateString('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit', month: '2-digit', year: '2-digit',
  });
}

export default BellNotificaciones;
