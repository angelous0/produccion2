import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Loader2, AlertTriangle, Check,
  CheckCircle2, PauseCircle, Send,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Reportar incidencia en un registro.
 * POST /api/incidencias
 *   { registro_id, motivo_id, comentario, paraliza, usuario, fecha_hora? }
 *
 * Si paraliza=true: el backend crea automáticamente la paralización en
 * prod_paralizacion + actualiza registro.estado_operativo = 'PARALIZADA'
 * + publica un mensaje fijado en el chat del registro.
 */
export const MobileNuevaIncidencia = () => {
  const { id: registroId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [registro, setRegistro] = useState(null);
  const [motivos, setMotivos] = useState([]);
  const [paralizacionActiva, setParalizacionActiva] = useState(false);
  const [loadingInicial, setLoadingInicial] = useState(true);

  // form
  const [motivoId, setMotivoId] = useState('');
  const [comentario, setComentario] = useState('');
  const [paraliza, setParaliza] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState(null);

  // Cargar registro + motivos + paralización
  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [regRes, motRes, parRes] = await Promise.all([
          axios.get(`${API}/registros/${registroId}`),
          axios.get(`${API}/motivos-incidencia`).catch(() => ({ data: [] })),
          axios.get(`${API}/incidencias/${registroId}`).catch(() => ({ data: [] })),
        ]);
        setRegistro(regRes.data);
        setMotivos(Array.isArray(motRes.data) ? motRes.data : (motRes.data?.items || []));
        // ¿Hay alguna paralización activa?
        const inc = Array.isArray(parRes.data) ? parRes.data : [];
        setParalizacionActiva(inc.some(i => i.paralizacion_activa));
      } catch {
        // no-op
      } finally {
        setLoadingInicial(false);
      }
    };
    fetchAll();
  }, [registroId]);

  const motivoActual = useMemo(
    () => motivos.find(m => m.id === motivoId),
    [motivos, motivoId]
  );

  const onGuardar = async () => {
    setError('');
    if (!motivoId) { setError('Selecciona un motivo'); return; }

    setEnviando(true);
    try {
      const res = await axios.post(`${API}/incidencias`, {
        registro_id: registroId,
        motivo_id: motivoId,
        comentario: comentario.trim(),
        paraliza,
        usuario: user?.nombre_completo || user?.username || 'Operario',
      });
      setExito({
        incidencia: res.data,
        motivo: motivoActual,
        paraliza,
        comentario: comentario.trim(),
      });
    } catch (e) {
      const detail = e?.response?.data?.detail || 'Error al reportar la incidencia';
      setError(typeof detail === 'string' ? detail : 'Error al reportar la incidencia');
    } finally {
      setEnviando(false);
    }
  };

  if (loadingInicial) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>
        <Loader2 className="m-spin" size={32} style={{ margin: '0 auto' }} />
      </div>
    );
  }

  if (exito) return <ExitoIncidencia data={exito} registroId={registroId} />;

  return (
    <>
      <div className="m-header">
        <button className="m-h-icon" onClick={() => navigate(-1)}>
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {registro?.modelo_nombre || registro?.modelo_manual?.nombre_modelo || '—'}
          </div>
          <div style={{
            fontSize: 11, opacity: 0.85, marginTop: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {registro?.n_corte}
            {registro?.estado && <> · {registro.estado}</>}
            {' · Nueva incidencia'}
          </div>
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Aviso si ya hay paralización */}
        {paralizacionActiva && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fca5a5',
            color: '#b91c1c', borderRadius: 12, padding: 12, fontSize: 13,
            display: 'flex', alignItems: 'flex-start', gap: 8,
          }}>
            <PauseCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontWeight: 700 }}>Registro ya paralizado</div>
              <div style={{ marginTop: 2 }}>
                Puedes reportar otra incidencia, pero no podrá paralizar de nuevo
                (ya hay una activa). Resuélvela primero si necesitas reiniciar.
              </div>
            </div>
          </div>
        )}

        {/* Motivo */}
        <div>
          <span className="m-label-xs">Motivo *</span>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6,
            marginTop: 8,
          }}>
            {motivos.map(m => (
              <button
                key={m.id}
                className={`m-chip ${motivoId === m.id ? 'active' : ''}`}
                style={{
                  fontSize: 13, minHeight: 44, padding: '8px 10px',
                  justifyContent: 'center', textAlign: 'center',
                }}
                onClick={() => setMotivoId(m.id)}
              >
                {m.nombre}
              </button>
            ))}
          </div>
          {motivos.length === 0 && (
            <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: 16 }}>
              No hay motivos configurados. Pide al admin que los agregue.
            </div>
          )}
        </div>

        {/* ¿Paraliza? */}
        <label
          className="m-card"
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            cursor: 'pointer',
            ...(paraliza && {
              borderColor: '#fca5a5', background: '#fef2f2',
            }),
            ...(paralizacionActiva && {
              opacity: 0.5, cursor: 'not-allowed',
            }),
          }}
          onClick={(e) => paralizacionActiva && e.preventDefault()}
        >
          <input
            type="checkbox"
            checked={paraliza}
            onChange={(e) => !paralizacionActiva && setParaliza(e.target.checked)}
            disabled={paralizacionActiva}
            style={{ width: 22, height: 22, accentColor: '#dc2626', cursor: paralizacionActiva ? 'not-allowed' : 'pointer' }}
          />
          <div style={{ flex: 1 }}>
            <div style={{
              fontWeight: 700, fontSize: 14,
              color: paraliza ? '#b91c1c' : '#0f172a',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <PauseCircle size={16} />
              Paraliza el registro
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              {paraliza
                ? 'Se bloquearán nuevos movimientos hasta resolver esta incidencia.'
                : 'Solo se reportará como aviso, sin bloquear el flujo.'}
            </div>
          </div>
        </label>

        {/* Comentario */}
        <div>
          <span className="m-label-xs">¿Qué pasó? (recomendado)</span>
          <textarea
            rows={4}
            className="m-input"
            style={{ padding: 12, marginTop: 6, fontFamily: 'inherit', resize: 'vertical' }}
            placeholder="Ej: María avisó que el taller tiene un retraso de 2 días por feriado..."
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
          />
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
            Se publicará automáticamente en el chat del registro
            {paraliza && <> · <strong style={{ color: '#b91c1c' }}>fijado como urgente</strong></>}.
          </div>
        </div>

        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fca5a5',
            color: '#b91c1c', borderRadius: 12, padding: 12, fontSize: 13,
            display: 'flex', alignItems: 'flex-start', gap: 8,
          }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button className="m-btn m-btn-outline" style={{ flex: 1 }} onClick={() => navigate(-1)}>
            Cancelar
          </button>
          <button
            className="m-btn"
            style={{
              flex: 2,
              background: paraliza ? '#dc2626' : 'var(--m-brand)',
              color: 'white',
            }}
            disabled={enviando || !motivoId}
            onClick={onGuardar}
          >
            {enviando
              ? <><Loader2 className="m-spin" size={18} /> Reportando...</>
              : paraliza
                ? <><PauseCircle size={18} /> Reportar y paralizar</>
                : <><Send size={18} /> Reportar incidencia</>}
          </button>
        </div>
      </div>
    </>
  );
};

/* ───────── Pantalla éxito ───────── */
const ExitoIncidencia = ({ data, registroId }) => {
  const grave = data.paraliza;
  return (
    <div style={{
      minHeight: '100%', display: 'flex', flexDirection: 'column',
      background: grave
        ? 'linear-gradient(180deg, #fef2f2 0%, white 100%)'
        : 'linear-gradient(180deg, var(--m-brand-soft) 0%, white 100%)',
      padding: 32, textAlign: 'center', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 96, height: 96, borderRadius: '50%', background: 'white',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: grave
          ? '0 10px 30px -10px rgba(220, 38, 38, .4)'
          : '0 10px 30px -10px rgba(15, 118, 110, .4)',
        marginBottom: 16,
      }}>
        {grave
          ? <PauseCircle size={56} style={{ color: '#dc2626' }} />
          : <CheckCircle2 size={56} style={{ color: 'var(--m-brand)' }} />}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>
        {grave ? 'Incidencia reportada · registro paralizado' : 'Incidencia reportada'}
      </div>
      <div style={{ fontSize: 14, color: '#475569', marginTop: 4, maxWidth: 280 }}>
        {grave
          ? 'No se podrán crear nuevos movimientos hasta resolverla.'
          : 'Quedó como aviso. El registro sigue operativo.'}
      </div>

      <div className="m-card" style={{ width: '100%', maxWidth: 320, marginTop: 24, textAlign: 'left' }}>
        <Row k="Motivo" v={data.motivo?.nombre || '—'} />
        {data.comentario && <Row k="Comentario" v={data.comentario} small />}
        <Row
          k="Tipo"
          v={grave ? 'Paraliza' : 'Aviso'}
          valueColor={grave ? '#b91c1c' : '#15803d'}
        />
      </div>

      <div style={{ width: '100%', maxWidth: 320, marginTop: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Link to={`/m/registros/${registroId}`} className="m-btn m-btn-primary" style={{ textDecoration: 'none' }}>
          Volver al registro
        </Link>
      </div>
    </div>
  );
};

const Row = ({ k, v, valueColor, small = false }) => (
  <div style={{
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: '6px 0', fontSize: small ? 12 : 13, gap: 12,
  }}>
    <span style={{ color: '#64748b', flexShrink: 0 }}>{k}</span>
    <span style={{
      fontWeight: 600,
      color: valueColor || 'inherit',
      textAlign: 'right',
    }}>{v}</span>
  </div>
);

export default MobileNuevaIncidencia;
