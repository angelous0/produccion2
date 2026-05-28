import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, AlertTriangle, Camera, RotateCw, Check, X, Search,
  Package, Layers, FileText, ScanLine,
} from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Escáner QR móvil — Sprint 38b.
 *
 * Estrategia de detección por orden:
 *   1. URL completa /m/registros/<UUID>  → navegar directo (caso ideal)
 *   2. UUID puro (36 chars con guiones)   → navegar a /m/registros/<UUID>
 *   3. Texto con prefijo conocido:
 *        CORTE-XXX  → buscar n_corte en /api/registros?search=...
 *        ROL-XXXX   → no se navega aún (no hay pantalla rollo específica)
 *        TEL-/AVI-  → no se navega aún
 *        FAC-XXXX   → buscar ingreso por documento
 *   4. Cualquier otro texto → mostrar al usuario y dejar elegir
 *
 * Si la cámara no se puede abrir (permiso denegado, no hay cámara, navegador
 * desktop) → fallback con input manual para escribir el código.
 */
export const MobileEscanearQR = () => {
  const navigate = useNavigate();
  const containerId = 'qr-scan-container';
  const scannerRef = useRef(null);

  const [estado, setEstado] = useState('iniciando'); // iniciando | escaneando | leido | error | manual
  const [error, setError] = useState('');
  const [textoLeido, setTextoLeido] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [manualInput, setManualInput] = useState('');

  // Arranca la cámara al montar
  useEffect(() => {
    let cancelado = false;
    let html5 = null;

    const arrancar = async () => {
      try {
        html5 = new Html5Qrcode(containerId, {
          verbose: false,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.EAN_13,
          ],
        });
        scannerRef.current = html5;

        await html5.start(
          { facingMode: 'environment' }, // cámara trasera
          {
            fps: 10,
            qrbox: (vw, vh) => {
              // Cuadro de escaneo cuadrado, 70% del menor lado
              const min = Math.min(vw, vh);
              const size = Math.floor(min * 0.7);
              return { width: size, height: size };
            },
            aspectRatio: 1,
          },
          (decodedText) => {
            if (cancelado) return;
            cancelado = true; // evitar dobles
            setTextoLeido(decodedText);
            setEstado('leido');
            // Detenemos la cámara
            html5.stop().catch(() => { /* silent */ });
            // Procesar
            procesarTexto(decodedText);
          },
          () => { /* ignorar errores de frame */ },
        );
        if (!cancelado) setEstado('escaneando');
      } catch (e) {
        if (cancelado) return;
        const msg = e?.message || 'No se pudo abrir la cámara';
        setError(msg);
        setEstado('error');
      }
    };

    arrancar();

    return () => {
      cancelado = true;
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => { /* silent */ });
        scannerRef.current.clear?.();
        scannerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Decide qué hacer con el texto detectado y navega.
   */
  const procesarTexto = async (texto) => {
    const t = (texto || '').trim();
    if (!t) return;

    // 1) URL del propio sistema → extraer ID y navegar
    //    Acepta /m/registros/<id>, /registros/<id>, etc.
    const urlMatch = t.match(/\/m?\/?registros\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (urlMatch) {
      navigate(`/m/registros/${urlMatch[1]}`);
      return;
    }

    // 2) UUID puro → tratar como id de registro
    const uuidMatch = t.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    if (uuidMatch) {
      navigate(`/m/registros/${t}`);
      return;
    }

    // 3) Texto con prefijo conocido → buscar
    if (/^CORTE-/i.test(t) || /^[0-9]+$/.test(t)) {
      setBuscando(true);
      try {
        const params = new URLSearchParams({ limit: '5', offset: '0', search: t });
        const res = await axios.get(`${API}/registros?${params}`);
        const items = res.data?.items || res.data || [];
        if (items.length === 1) {
          navigate(`/m/registros/${items[0].id}`);
          return;
        }
        if (items.length > 1) {
          // Más de un match: lo mando a la lista filtrada
          navigate(`/m/registros?q=${encodeURIComponent(t)}`);
          return;
        }
        // Sin resultados
        setError(`No se encontró un corte para "${t}"`);
      } catch (e) {
        setError('Error consultando registros');
      } finally {
        setBuscando(false);
      }
      return;
    }

    // 4) Texto desconocido → dejar que el usuario decida
    setError(`Código no reconocido: ${t}`);
  };

  // Reintentar (vuelve a abrir cámara)
  const reintentar = () => {
    setError('');
    setTextoLeido('');
    setEstado('iniciando');
    // Forzar re-mount del efecto
    window.location.reload();
  };

  return (
    <div>
      <div className="m-header">
        <button className="m-h-icon" onClick={() => navigate(-1)} aria-label="Volver">
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, opacity: 0.85 }}>Escáner</div>
          <div style={{ fontWeight: 600 }}>
            {estado === 'escaneando' ? 'Apuntá al código' :
              estado === 'leido' ? 'Código detectado' :
              estado === 'manual' ? 'Ingresar código manual' :
              estado === 'error' ? 'Error' : 'Iniciando cámara…'}
          </div>
        </div>
        {estado === 'escaneando' && (
          <button
            className="m-h-icon"
            onClick={() => setEstado('manual')}
            aria-label="Ingresar manualmente"
            title="Ingresar manualmente"
          >
            <FileText size={18} />
          </button>
        )}
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Contenedor donde html5-qrcode dibuja el preview */}
        {estado !== 'manual' && (
          <div
            id={containerId}
            style={{
              width: '100%', maxWidth: 480, margin: '0 auto',
              borderRadius: 16, overflow: 'hidden',
              background: '#000', minHeight: 280,
              position: 'relative',
            }}
          />
        )}

        {/* Estado iniciando / escaneando */}
        {estado === 'iniciando' && (
          <div style={{
            background: '#f8fafc', borderRadius: 12, padding: 14,
            fontSize: 13, color: '#475569', textAlign: 'center',
            display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center',
          }}>
            <Camera size={18} />
            Permitiendo cámara…
          </div>
        )}

        {estado === 'escaneando' && (
          <div style={{
            background: 'var(--m-brand-soft)', color: 'var(--m-brand)',
            borderRadius: 12, padding: 12,
            fontSize: 12, textAlign: 'center',
            display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center',
          }}>
            <ScanLine size={16} />
            Mantené el código dentro del recuadro
          </div>
        )}

        {/* Resultado leído */}
        {estado === 'leido' && (
          <div style={{
            background: '#dcfce7', border: '1px solid #86efac', color: '#15803d',
            borderRadius: 12, padding: 14,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Check size={18} />
              <strong>Código leído</strong>
            </div>
            <div style={{
              fontFamily: 'ui-monospace, monospace', fontSize: 12,
              wordBreak: 'break-all', background: 'white',
              padding: 8, borderRadius: 8, color: '#0f172a',
            }}>{textoLeido}</div>
            {buscando && (
              <div style={{ fontSize: 11, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Search size={12} />
                Buscando registro…
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c',
            borderRadius: 12, padding: 14,
            display: 'flex', gap: 10, alignItems: 'flex-start',
          }}>
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1, fontSize: 13 }}>
              {error}
              {estado === 'error' && (
                <div style={{ fontSize: 11, marginTop: 6 }}>
                  ¿Tu navegador tiene permiso de cámara? En iOS Safari, anda a
                  Ajustes → Safari → Cámara → Permitir. Después tocá "Reintentar".
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modo manual: input para escribir el código */}
        {estado === 'manual' && (
          <div className="m-card" style={{ padding: 14 }}>
            <div className="m-label-xs" style={{ marginBottom: 6 }}>Código del corte</div>
            <input
              className="m-input"
              autoFocus
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="ej: CORTE-128"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && manualInput.trim()) {
                  procesarTexto(manualInput.trim());
                }
              }}
            />
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button
                onClick={() => setEstado('escaneando')}
                className="m-btn m-btn-outline"
                style={{ flex: 1 }}
              >
                <Camera size={16} /> Usar cámara
              </button>
              <button
                onClick={() => procesarTexto(manualInput.trim())}
                disabled={!manualInput.trim() || buscando}
                className="m-btn m-btn-primary"
                style={{ flex: 1 }}
              >
                <Search size={16} /> Buscar
              </button>
            </div>
          </div>
        )}

        {/* Acciones cuando hubo error/sin match */}
        {(estado === 'error' || (estado === 'leido' && error)) && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={reintentar} className="m-btn m-btn-outline" style={{ flex: 1 }}>
              <RotateCw size={16} /> Reintentar
            </button>
            <button onClick={() => setEstado('manual')} className="m-btn m-btn-primary" style={{ flex: 1 }}>
              <FileText size={16} /> Manual
            </button>
          </div>
        )}

        {/* Ayuda al pie */}
        {estado === 'escaneando' && (
          <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 8 }}>
            <Layers size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
            Funciona con QRs impresos del sistema. También código de corte (CORTE-XXX).
          </div>
        )}
      </div>
    </div>
  );
};

export default MobileEscanearQR;
