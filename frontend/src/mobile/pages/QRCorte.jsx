import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Loader2, Copy, Check, QrCode, AlertCircle, Printer,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Identificación del corte (vista QR placeholder).
 *
 * No tenemos lib QR instalada y la generación oficial se hace desde web
 * (decisión previa del proyecto). Esta pantalla muestra el n_corte muy
 * grande para que el operario lo pueda dictar/anotar fácilmente y un
 * botón para copiarlo al portapapeles.
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
        {/* Cuadro con el n_corte enorme */}
        <div style={{
          background: 'white', border: '1px solid #e5e7eb', borderRadius: 16,
          padding: '32px 16px', textAlign: 'center',
        }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 11, color: '#64748b', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '.06em',
          }}>
            <QrCode size={12} /> N° de corte
          </div>
          <div style={{
            fontFamily: 'ui-monospace, monospace', fontWeight: 800,
            fontSize: 'clamp(28px, 9vw, 44px)', lineHeight: 1.1,
            letterSpacing: '.04em', marginTop: 12, color: '#0f172a',
            wordBreak: 'break-all',
          }}>
            {registro?.n_corte || '—'}
          </div>
          {/* Patrón decorativo tipo código de barras (NO escaneable) */}
          <BarrasDecorativas seed={registro?.n_corte || ''} />
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
            (patrón decorativo · no escaneable)
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
        <button
          onClick={copiar}
          className="m-btn m-btn-primary"
          disabled={!registro?.n_corte || copiado}
          style={{ minHeight: 48 }}
        >
          {copiado ? <><Check size={18} /> Copiado al portapapeles</>
                   : <><Copy size={18} /> Copiar N° de corte</>}
        </button>

        {/* Aviso honesto */}
        <div style={{
          background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12,
          padding: 12, display: 'flex', gap: 10, alignItems: 'flex-start',
          fontSize: 12, color: '#475569', lineHeight: 1.5,
        }}>
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            El <strong>QR escaneable oficial</strong> se imprime desde la
            <Printer size={11} style={{ display: 'inline', verticalAlign: 'middle', margin: '0 2px' }} />
            versión web (Reportes → Etiquetas).
            En móvil sólo puedes consultar y compartir el código.
          </span>
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

/**
 * Genera un patrón visual estilo "barras" a partir del texto del n_corte.
 * NO es un código escaneable — sólo decorativo. La idea es que ayude a
 * distinguir visualmente dos cortes distintos y que la pantalla no se vea
 * vacía como un cuadro de solo texto.
 */
const BarrasDecorativas = ({ seed }) => {
  if (!seed) return null;
  // Hash simple determinístico
  const bytes = [];
  for (let i = 0; i < seed.length; i++) bytes.push(seed.charCodeAt(i));
  const barras = [];
  for (let i = 0; i < 48; i++) {
    const v = bytes[i % bytes.length] ^ (i * 31);
    const ancho = (v % 4) + 1; // 1 a 4
    const negro = (v % 2 === 0);
    barras.push({ ancho, negro });
  }
  return (
    <div style={{
      display: 'flex', alignItems: 'stretch', height: 40, marginTop: 18,
      justifyContent: 'center', overflow: 'hidden',
    }}>
      {barras.map((b, i) => (
        <div
          key={i}
          style={{
            width: `${b.ancho * 2}px`, marginRight: 1,
            background: b.negro ? '#0f172a' : 'transparent',
          }}
        />
      ))}
    </div>
  );
};

export default MobileQRCorte;
