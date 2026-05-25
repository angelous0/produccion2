import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, Bell, Loader2 } from 'lucide-react';
import { NotifRow, tiempoRelativo } from '../components/BellNotificaciones';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Pantalla completa de notificaciones (el "historial" del bell).
 *
 *   GET  /api/notificaciones?limit=50&solo_no_leidas=...&severidad=...
 *   POST /api/notificaciones/:id/marcar-leida
 *   POST /api/notificaciones/marcar-todas-leidas
 *
 * Filtros: todas · no leídas · urgentes · atención · ok
 * Agrupado por fecha: Hoy / Ayer / Esta semana / Más antiguas
 */
const FILTROS = [
  { key: 'todas',    label: 'Todas',    params: {} },
  { key: 'no_leidas',label: 'No leídas',params: { solo_no_leidas: 'true' } },
  { key: 'urgente',  label: '🔴 Urgentes',  params: { severidad: 'urgente' } },
  { key: 'atencion', label: '🟡 Atención',  params: { severidad: 'atencion' } },
  { key: 'ok',       label: '🟢 OK',        params: { severidad: 'ok' } },
];

export const MobileNotificaciones = () => {
  const navigate = useNavigate();
  const [filtro, setFiltro] = useState('todas');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [marcando, setMarcando] = useState(false);
  const [contador, setContador] = useState(0);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const f = FILTROS.find(x => x.key === filtro);
      const params = new URLSearchParams({ limit: '50', ...(f?.params || {}) });
      const res = await axios.get(`${API}/notificaciones?${params}`);
      setItems(res.data?.items || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filtro]);

  const cargarContador = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/notificaciones/contador`);
      setContador(res.data?.total || 0);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { cargarContador(); }, [cargarContador]);

  const onTap = async (n) => {
    if (!n.leida) {
      try {
        await axios.post(`${API}/notificaciones/${n.id}/marcar-leida`);
      } catch { /* silent */ }
      setItems(prev => prev.map(x => x.id === n.id ? { ...x, leida: true } : x));
      cargarContador();
    }
    if (n.registro_id) {
      navigate(`/m/registros/${n.registro_id}`);
    }
  };

  const onMarcarTodas = async () => {
    if (contador === 0) return;
    if (!window.confirm(`¿Marcar las ${contador} notificaciones como leídas?`)) return;
    setMarcando(true);
    try {
      await axios.post(`${API}/notificaciones/marcar-todas-leidas`);
      setItems(prev => prev.map(x => ({ ...x, leida: true })));
      setContador(0);
    } catch { /* silent */ }
    finally { setMarcando(false); }
  };

  // Agrupar por fecha
  const grupos = useMemo(() => {
    const ahora = new Date();
    const hoy0 = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
    const ayer0 = new Date(hoy0); ayer0.setDate(ayer0.getDate() - 1);
    const sem0  = new Date(hoy0); sem0.setDate(sem0.getDate() - 7);

    const hoy = [];
    const ayer = [];
    const semana = [];
    const antiguas = [];

    for (const n of items) {
      const d = new Date(n.created_at);
      if (d >= hoy0) hoy.push(n);
      else if (d >= ayer0) ayer.push(n);
      else if (d >= sem0) semana.push(n);
      else antiguas.push(n);
    }
    return { hoy, ayer, semana, antiguas };
  }, [items]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      minHeight: '100vh',
    }}>
      <div className="m-header" style={{ flexShrink: 0 }}>
        <button className="m-h-icon" onClick={() => navigate(-1)} aria-label="Volver">
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, opacity: 0.85 }}>Hola</div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Notificaciones</div>
        </div>
        {contador > 0 && (
          <button
            onClick={onMarcarTodas}
            disabled={marcando}
            style={{
              background: 'rgba(255,255,255,0.15)', border: 0, color: 'white',
              fontSize: 11, fontWeight: 700, padding: '6px 10px',
              borderRadius: 999, cursor: 'pointer',
            }}
          >
            {marcando ? 'Marcando...' : 'Marcar todas'}
          </button>
        )}
      </div>

      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Filtros */}
        <div style={{
          display: 'flex', gap: 6, overflowX: 'auto',
          paddingBottom: 4, WebkitOverflowScrolling: 'touch',
        }}>
          {FILTROS.map(f => {
            const activo = filtro === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setFiltro(f.key)}
                className={`m-chip ${activo ? 'active' : ''}`}
                style={{ fontSize: 12, minHeight: 32, whiteSpace: 'nowrap' }}
              >
                {f.label}
                {f.key === 'no_leidas' && contador > 0 && (
                  <span style={{
                    marginLeft: 6,
                    background: activo ? 'rgba(255,255,255,0.25)' : '#fee2e2',
                    color: activo ? 'white' : '#b91c1c',
                    padding: '1px 7px', borderRadius: 999, fontWeight: 700,
                  }}>{contador}</span>
                )}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <Loader2 className="m-spin" size={24} style={{ color: '#94a3b8' }} />
          </div>
        ) : items.length === 0 ? (
          <div className="m-card" style={{
            textAlign: 'center', color: '#64748b', padding: 32,
          }}>
            <Bell size={32} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
            <p style={{ margin: 0, fontSize: 13 }}>
              {filtro === 'todas'
                ? 'Sin notificaciones por ahora.'
                : 'Sin notificaciones para este filtro.'}
            </p>
          </div>
        ) : (
          <>
            {grupos.hoy.length > 0 && (
              <SeccionFecha titulo="Hoy" items={grupos.hoy} onTap={onTap} />
            )}
            {grupos.ayer.length > 0 && (
              <SeccionFecha titulo="Ayer" items={grupos.ayer} onTap={onTap} />
            )}
            {grupos.semana.length > 0 && (
              <SeccionFecha titulo="Esta semana" items={grupos.semana} onTap={onTap} />
            )}
            {grupos.antiguas.length > 0 && (
              <SeccionFecha titulo="Más antiguas" items={grupos.antiguas} onTap={onTap} />
            )}
          </>
        )}
      </div>
    </div>
  );
};

const SeccionFecha = ({ titulo, items, onTap }) => (
  <div>
    <div className="m-label-xs" style={{ marginBottom: 8 }}>{titulo}</div>
    <div style={{
      background: 'white', border: '1px solid #e5e7eb',
      borderRadius: 12, overflow: 'hidden',
    }}>
      {items.map(n => (
        <NotifRow key={n.id} notif={n} onClick={() => onTap(n)} />
      ))}
    </div>
  </div>
);

export default MobileNotificaciones;
