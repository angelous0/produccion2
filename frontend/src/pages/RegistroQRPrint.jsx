import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Loader2, Printer, ArrowLeft, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '../components/ui/button';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Vista imprimible del QR de un corte (Sprint 38a).
 *
 * Pensada para imprimir una etiqueta ~10×10 cm que se pega al lote físico.
 * Incluye QR escaneable + datos legibles del corte para que un humano lo
 * identifique sin lector.
 *
 * El botón "Imprimir" abre el diálogo nativo del navegador. Los estilos
 * @media print están definidos al final del componente para que solo se
 * vea la etiqueta al imprimir (sin sidebar, sin botones, etc.).
 */
export default function RegistroQRPrint() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [registro, setRegistro] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/registros/${id}`);
        setRegistro(res.data);
      } catch {
        setRegistro(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!registro) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Corte no encontrado.
        <div className="mt-4">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Volver
          </Button>
        </div>
      </div>
    );
  }

  const modelo = registro.modelo_nombre || registro.modelo_manual?.nombre_modelo || '—';
  const marca = registro.marca_nombre || registro.modelo_manual?.marca_texto || '';
  const tipo = registro.tipo_nombre || '';
  const totalPrendas = Object.values(registro.tallas || {}).reduce((s, n) => s + Number(n || 0), 0);

  // URL completa que se codifica en el QR.
  // Escanear con la cámara nativa abre directamente el corte en el móvil.
  // Usamos window.location.origin para que funcione tanto en localhost como en producción.
  const urlQR = `${window.location.origin}/m/registros/${id}`;

  return (
    <div className="qr-print-page">
      {/* Toolbar — solo visible en pantalla */}
      <div className="no-print mb-6 flex items-center justify-between">
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Volver
        </Button>
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-2" /> Imprimir
        </Button>
      </div>

      <div className="no-print text-sm text-muted-foreground mb-4 flex items-center gap-2">
        <QrCode className="h-4 w-4" />
        Vista previa de la etiqueta · usá <strong>Imprimir</strong> arriba (Cmd/Ctrl + P también funciona).
      </div>

      {/* Etiqueta — esto es lo que se imprime */}
      <div className="qr-label">
        <div className="qr-label-header">
          <div className="qr-label-brand">{marca || 'CORTE'}</div>
          {tipo && <div className="qr-label-tipo">{tipo}</div>}
        </div>

        <div className="qr-label-modelo">{modelo}</div>

        <div className="qr-label-qr">
          <QRCodeSVG
            value={urlQR}
            size={220}
            level="M"
            includeMargin={false}
          />
        </div>

        <div className="qr-label-codigo">{registro.n_corte}</div>

        <div className="qr-label-meta">
          {totalPrendas > 0 && <span><strong>{totalPrendas}</strong> pzs</span>}
          {registro.curva && <span> · curva {registro.curva}</span>}
          {registro.fecha_entrega_final && (
            <span> · entrega {formatearFecha(registro.fecha_entrega_final)}</span>
          )}
        </div>
      </div>

      <style>{`
        .qr-label {
          width: 380px;
          max-width: 100%;
          margin: 0 auto;
          padding: 16px;
          background: white;
          border: 2px solid #000;
          border-radius: 8px;
          text-align: center;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          color: #000;
        }
        .qr-label-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: 6px;
        }
        .qr-label-brand {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .qr-label-tipo {
          font-size: 10px;
          color: #555;
          text-transform: uppercase;
        }
        .qr-label-modelo {
          font-size: 16px;
          font-weight: 700;
          line-height: 1.2;
          margin-bottom: 10px;
          word-break: break-word;
        }
        .qr-label-qr {
          padding: 8px;
          display: inline-block;
        }
        .qr-label-codigo {
          font-family: ui-monospace, 'SF Mono', monospace;
          font-weight: 800;
          font-size: 20px;
          letter-spacing: 0.05em;
          margin-top: 8px;
        }
        .qr-label-meta {
          font-size: 11px;
          color: #444;
          margin-top: 6px;
        }
        @media print {
          .no-print { display: none !important; }
          @page { size: A6; margin: 6mm; }
          body { background: white !important; }
          .qr-label {
            margin: 0;
            border: 2px solid #000;
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
}

function formatearFecha(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: '2-digit' });
  } catch { return ''; }
}
