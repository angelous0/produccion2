import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Loader2, Copy, Check, QrCode, Share2,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Identificación del corte — QR escaneable real (Sprint 38a).
 *
 * El QR contiene el `n_corte` directamente. El móvil escáner usa el prefijo
 * "CORTE-" para identificar que es un corte y navega a /m/registros/:id.
 *
 * Esta misma pantalla también sirve para que el operario lea/copie/comparta
 * el número si no tiene cámara a la mano.
 */
export const MobileQRCorte = () => {
  const { id: registroId } = useParams();
  const navigate = useNavigate();

  const [registro, setRegistro] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/registros/${registroId}`);
        setRegistro(res.data);
      } catch {
        setRegistro(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [registroId]);

  const copiar = async () => {
    if (!registro?.n_corte) return;
    try {
      await navigator.clipboard.writeText(registro.n_corte);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch { /* silent */ }
  };

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>
        <Loader2 className="m-spin" size={32} style={{ margin: '0 auto' }} />
      </div>
    );
  }

  return (
    <>
      <div className="m-header">
        <button className="m-h-icon" onClick={() => navigate(-1)} aria-label="Volver">
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 600, fontSize: 15, lineHeight: 1.2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {registro?.modelo_nombre || registro?.modelo_manual?.nombre_modelo || 'Identificación'}
          </div>
          <div style={{
            fontSize: 11, opacity: 0.85, marginTop: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            Identificación del corte
          </div>
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* QR escaneable del corte */}
        <div style={{
          background: 'white', border: '1px solid #e5e7eb', borderRadius: 16,
          padding: '24px 16px', textAlign: 'center',
        }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 11, color: '#64748b', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '.06em',
            marginBottom: 12,
          }}>
            <QrCode size={12} /> Código del corte
          </div>

          {registro?.n_corte && (
            <div style={{
              display: 'inline-block', padding: 12, background: 'white',
              borderRadius: 8, border: '1px solid #f1f5f9',
            }}>
              <QRCodeSVG
                value={`${window.location.origin}/m/registros/${registroId}`}
                size={200}
                level="M"
                includeMargin={false}
              />
            </div>
          )}

          <div style={{
            fontFamily: 'ui-monospace, monospace', fontWeight: 800,
            fontSize: 'clamp(20px, 6vw, 28px)', lineHeight: 1.1,
            letterSpacing: '.04em', marginTop: 16, color: '#0f172a',
            wordBreak: 'break-all',
          }}>
            {registro?.n_corte || '—'}
          </div>
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 6 }}>
            Escaneá este código con la cámara del móvil para abrir el corte.
          </div>
        </div>

        {/* Datos del registro */}
        <div className="m-card" style={{ background: 'white' }}>
          <Fila label="Modelo" value={registro?.modelo_nombre || registro?.modelo_manual?.nombre_modelo || '—'} />
          <Fila label="Marca" value={registro?.marca_nombre || registro?.modelo_manual?.marca_texto || '—'} />
          <Fila label="Tipo" value={registro?.tipo_nombre || '—'} />
          <Fila label="Curva" value={registro?.curva || '—'} />
          <Fila label="Estado" value={registro?.estado || '—'} />
        </div>

        {/* Botones */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={copiar}
            className="m-btn m-btn-outline"
            disabled={!registro?.n_corte || copiado}
            style={{ flex: 1, minHeight: 44 }}
          >
            {copiado ? <><Check size={16} /> Copiado</>
                     : <><Copy size={16} /> Copiar código</>}
          </button>
          {typeof navigator !== 'undefined' && navigator.share && registro?.n_corte && (
            <button
              onClick={() => navigator.share({
                title: `Corte ${registro.n_corte}`,
                text: `${registro.modelo_nombre || ''} · ${registro.n_corte}`,
              }).catch(() => { /* user canceled */ })}
              className="m-btn m-btn-outline"
              style={{ flex: 1, minHeight: 44 }}
            >
              <Share2 size={16} /> Compartir
            </button>
          )}
        </div>

        <div style={{
          background: '#f0fdfa', border: '1px solid #99f6e4',
          color: '#0f766e', borderRadius: 12,
          padding: 12, fontSize: 12, lineHeight: 1.5,
        }}>
          <strong>Imprimir la etiqueta física:</strong> desde la versión escritorio,
          abrí el corte y usá el botón "Imprimir QR" para sacar la etiqueta 10×10 cm.
        </div>
      </div>
    </>
  );
};

const Fila = ({ label, value }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '10px 0', borderBottom: '1px solid #f1f5f9',
  }}>
    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600,
      textTransform: 'uppercase', letterSpacing: '.04em', flexShrink: 0,
      width: 70,
    }}>{label}</div>
    <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600,
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    }}>{value}</div>
  </div>
);

export default MobileQRCorte;
