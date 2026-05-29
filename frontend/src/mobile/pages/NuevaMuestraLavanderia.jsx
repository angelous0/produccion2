import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Loader2, Send, Plus, AlertTriangle, Check, X, Info,
  ChevronDown, ChevronRight, Palette, Ruler, Eye, MessageCircle, Search,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { puede, ACCIONES } from '../utils/permisos';
import { PantallaBloqueada } from '../components/PantallaBloqueada';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Nueva muestra (v2 — Sprint 43).
 *
 * Sostiene 2 destinos:
 *   - Lavandería: el flujo anterior (con paleta de colores filtrada por la regla).
 *                 Colores ahora son OPCIONALES: se pueden agregar después.
 *   - Diseño:    flujo más corto para préstamo interno. Pide persona del área,
 *                cantidad total, fecha y motivo (medidas/evaluación/consulta).
 *                NO pide colores.
 *
 * Reglas de colores (Lavandería):
 *   1. GET /reportes-produccion/registro-colores/:id → marca/tipo/entalle/hilo.
 *   2. GET /colores-catalogo?marca_id&tipo_id&entalle_id&hilo_id&solo_regla=true
 *      → paleta válida según las reglas configuradas en web.
 *   3. Si vacío, fallback con catálogo abierto (aviso).
 */
export const MobileNuevaMuestraLavanderia = () => {
  const { id: registroId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const puedeCrearMuestra = puede(user, ACCIONES.CREAR_MUESTRA_LAVANDERIA);

  const [registro, setRegistro] = useState(null);
  const [lavanderias, setLavanderias] = useState([]);
  const [personasDiseno, setPersonasDiseno] = useState([]);
  const [paleta, setPaleta] = useState([]);
  const [reglaSource, setReglaSource] = useState(null);
  const [reglaNombre, setReglaNombre] = useState(null);
  const [loading, setLoading] = useState(true);

  // ── Form ──
  const [destinoTipo, setDestinoTipo] = useState('lavanderia'); // 'lavanderia' | 'diseno'
  const [fechaEnvio, setFechaEnvio] = useState(hoyISO());
  const [personaId, setPersonaId] = useState('');           // genérico: aplica al destino actual
  const [cantidadTotal, setCantidadTotal] = useState('');   // input manual (siempre visible)
  const [motivoDiseno, setMotivoDiseno] = useState('medidas');
  const [observaciones, setObservaciones] = useState('');

  // Colores: array de líneas. Empieza vacío (opcional).
  const [lineas, setLineas] = useState([]);
  const [coloresAbiertos, setColoresAbiertos] = useState(false);
  const [picker, setPicker] = useState(null);

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [regRes, lavRes, disRes, regColRes] = await Promise.all([
          axios.get(`${API}/registros/${registroId}`),
          axios.get(`${API}/muestras-lavanderia/lavanderias`).catch(() => ({ data: [] })),
          axios.get(`${API}/muestras-lavanderia/personas-diseno`).catch(() => ({ data: [] })),
          axios.get(`${API}/reportes-produccion/registro-colores/${registroId}`)
            .catch(() => ({ data: null })),
        ]);
        setRegistro(regRes.data);
        setLavanderias(Array.isArray(lavRes.data) ? lavRes.data : []);
        setPersonasDiseno(Array.isArray(disRes.data) ? disRes.data : []);

        const ctx = regColRes.data;
        if (ctx) {
          const params = new URLSearchParams();
          if (ctx.marca_id)   params.set('marca_id',   ctx.marca_id);
          if (ctx.tipo_id)    params.set('tipo_id',    ctx.tipo_id);
          if (ctx.entalle_id) params.set('entalle_id', ctx.entalle_id);
          if (ctx.hilo_id)    params.set('hilo_id',    ctx.hilo_id);

          let cols = [];
          let src = null;
          let nombre = null;
          try {
            const pSolo = new URLSearchParams(params);
            pSolo.set('solo_regla', 'true');
            const r1 = await axios.get(`${API}/colores-catalogo?${pSolo}`);
            cols = Array.isArray(r1.data) ? r1.data : [];
            if (cols.length > 0) {
              src = cols[0].regla_color_source || 'regla';
              nombre = cols[0].regla_color_nombre || null;
            }
          } catch { cols = []; }

          if (cols.length === 0) {
            try {
              const r2 = await axios.get(`${API}/colores-catalogo`);
              cols = Array.isArray(r2.data) ? r2.data : [];
              src = null;
            } catch { cols = []; }
          }
          setPaleta(cols);
          setReglaSource(src);
          setReglaNombre(nombre);
        }
      } catch {
        setRegistro(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [registroId]);

  // Al cambiar de destino, limpiamos persona (las listas son distintas) y colores
  useEffect(() => {
    setPersonaId('');
    setError('');
    if (destinoTipo === 'diseno') {
      setLineas([]);
      setColoresAbiertos(false);
    }
  }, [destinoTipo]);

  const sumaColores = useMemo(
    () => lineas.reduce((s, l) => s + Number(l.cantidad || 0), 0),
    [lineas],
  );

  // Auto-completar cantidad_total cuando se editan colores en Lavandería
  // (si el usuario no la tocó manualmente, mantenemos en sync con la suma)
  const [cantidadTocada, setCantidadTocada] = useState(false);
  useEffect(() => {
    if (destinoTipo === 'lavanderia' && !cantidadTocada && lineas.length > 0) {
      setCantidadTotal(String(sumaColores || ''));
    }
  }, [sumaColores, destinoTipo, cantidadTocada, lineas.length]);

  const cantidadTotalNum = Number(cantidadTotal) || 0;
  const personas = destinoTipo === 'lavanderia' ? lavanderias : personasDiseno;
  const labelPersona = destinoTipo === 'lavanderia' ? 'Lavandería destino' : 'Persona de Diseño';

  // Manejo de líneas (solo Lavandería)
  const setLinea = (idx, patch) =>
    setLineas(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));
  const addLinea = () => {
    setLineas(prev => [...prev, { color_id: null, color_nombre: '', cantidad: 1, observaciones_envio: '' }]);
    setColoresAbiertos(true);
  };
  const quitarLinea = (idx) =>
    setLineas(prev => prev.filter((_, i) => i !== idx));

  const pickColor = (idx, color) => {
    setLinea(idx, { color_id: color.id, color_nombre: color.nombre });
    setPicker(null);
  };

  const colorFueraDeRegla = (nombre) => {
    if (!reglaSource) return false;
    if (!nombre || !nombre.trim()) return false;
    const ok = paleta.some(p =>
      String(p.nombre || '').trim().toLowerCase() === nombre.trim().toLowerCase()
    );
    return !ok;
  };

  const validar = () => {
    if (!fechaEnvio) return 'Indica la fecha de envío';
    if (!personaId) {
      return destinoTipo === 'lavanderia'
        ? 'Elegí la lavandería destino'
        : 'Elegí la persona de Diseño que recibe';
    }
    if (cantidadTotalNum <= 0) return 'Indica la cantidad de prendas (debe ser mayor a 0)';
    // Si hay líneas de colores con datos, validar que sean consistentes
    if (destinoTipo === 'lavanderia' && lineas.length > 0) {
      const conNombre = lineas.filter(l => l.color_nombre.trim());
      const conCant = lineas.filter(l => Number(l.cantidad) > 0);
      if (conNombre.length !== conCant.length) {
        return 'Cada color debe tener nombre y cantidad mayor a 0 (o eliminá la línea vacía)';
      }
      if (sumaColores > cantidadTotalNum) {
        return `La suma de colores (${sumaColores}) supera la cantidad total (${cantidadTotalNum})`;
      }
    }
    return null;
  };

  const enviar = async () => {
    setError('');
    const err = validar();
    if (err) return setError(err);

    setEnviando(true);
    try {
      const body = {
        fecha_envio: fechaEnvio,
        destino_tipo: destinoTipo,
        persona_id: personaId,
        cantidad_total: cantidadTotalNum,
        observaciones: observaciones.trim() || undefined,
      };
      if (destinoTipo === 'lavanderia') {
        body.persona_lavanderia_id = personaId; // legacy field para reportes existentes
        const validas = lineas.filter(l => l.color_nombre.trim() && Number(l.cantidad) > 0);
        body.colores = validas.map(l => ({
          color_id: l.color_id || undefined,
          color_nombre: l.color_nombre.trim(),
          cantidad: Number(l.cantidad),
          observaciones_envio: l.observaciones_envio.trim() || undefined,
        }));
      } else {
        body.motivo_diseno = motivoDiseno;
        body.colores = [];
      }

      await axios.post(`${API}/registros/${registroId}/muestras-lavanderia`, body);
      navigate(-1);
    } catch (e) {
      const det = e?.response?.data?.detail || 'Error al crear la muestra';
      setError(typeof det === 'string' ? det : String(det));
    } finally {
      setEnviando(false);
    }
  };

  if (!puedeCrearMuestra) {
    return <PantallaBloqueada titulo="Nueva muestra" mensaje="Tu rol no permite crear muestras." />;
  }
  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>
        <Loader2 className="m-spin" size={32} style={{ margin: '0 auto' }} />
      </div>
    );
  }

  const colorDestino = destinoTipo === 'lavanderia' ? '#0f766e' : '#7c3aed';
  const colorDestinoSoft = destinoTipo === 'lavanderia' ? 'var(--m-brand-soft)' : '#f3e8ff';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      minHeight: '100vh', paddingBottom: 76,
    }}>
      <div className="m-header" style={{ flexShrink: 0, background: colorDestino }}>
        <button className="m-h-icon" onClick={() => navigate(-1)} aria-label="Volver">
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, opacity: 0.85 }}>
            Muestra · {registro?.n_corte}
          </div>
          <div style={{
            fontWeight: 600, fontSize: 16, lineHeight: 1.2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            Nueva muestra
          </div>
        </div>
      </div>

      <div style={{
        flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        {/* ── Selector destino (chips grandes) ── */}
        <div>
          <span className="m-label-xs">¿A dónde va?</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
            <DestinoChip
              activo={destinoTipo === 'lavanderia'}
              color="#0f766e"
              colorSoft="var(--m-brand-soft)"
              onClick={() => setDestinoTipo('lavanderia')}
              icon={<Palette size={18} />}
              titulo="Lavandería"
              subtitulo="Envío directo · esperan tonos"
            />
            <DestinoChip
              activo={destinoTipo === 'diseno'}
              color="#7c3aed"
              colorSoft="#f3e8ff"
              onClick={() => setDestinoTipo('diseno')}
              icon={<Ruler size={18} />}
              titulo="Diseño"
              subtitulo="Uso interno · puede volver"
            />
          </div>
        </div>

        {/* ── Persona destino (con buscador) ── */}
        <div>
          <span className="m-label-xs">{labelPersona}</span>
          <PersonaPicker
            personas={personas}
            value={personaId}
            onChange={setPersonaId}
            color={colorDestino}
            colorSoft={colorDestinoSoft}
            placeholder={destinoTipo === 'lavanderia' ? 'Elegir lavandería...' : 'Elegir persona...'}
          />
          {personas.length === 0 && (
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
              {destinoTipo === 'lavanderia'
                ? 'No hay proveedores de lavandería configurados.'
                : 'No hay personas configuradas en el servicio Diseño. Agrega una desde el catálogo web.'}
            </div>
          )}
          {destinoTipo === 'diseno' && (
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 6, lineHeight: 1.5 }}>
              Diseño decide después si las devuelve o las pasa a una lavandería.
            </div>
          )}
        </div>

        {/* ── Cantidad y fecha ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <span className="m-label-xs">Cantidad</span>
            <div style={{
              position: 'relative', marginTop: 8,
            }}>
              <input
                type="number"
                className="m-input"
                value={cantidadTotal}
                onChange={(e) => { setCantidadTocada(true); setCantidadTotal(e.target.value); }}
                placeholder="0"
                min="1"
                style={{
                  fontSize: 18, fontWeight: 700, textAlign: 'right',
                  paddingRight: 76, fontVariantNumeric: 'tabular-nums',
                }}
              />
              <span style={{
                position: 'absolute', right: 12, top: '50%',
                transform: 'translateY(-50%)',
                fontSize: 10, color: '#64748b', textTransform: 'uppercase',
                fontWeight: 700, letterSpacing: '.04em',
                paddingLeft: 10, borderLeft: '1px solid #e5e7eb',
                pointerEvents: 'none',
              }}>
                prendas
              </span>
            </div>
          </div>
          <div>
            <span className="m-label-xs">Fecha envío</span>
            <input
              type="date"
              className="m-input"
              value={fechaEnvio}
              onChange={(e) => setFechaEnvio(e.target.value)}
              style={{ marginTop: 8, fontSize: 15 }}
            />
          </div>
        </div>

        {/* ── Específicos del destino ── */}
        {destinoTipo === 'diseno' ? (
          <>
            {/* Motivo (solo Diseño) */}
            <div>
              <span className="m-label-xs">¿Para qué?</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 8 }}>
                {[
                  { k: 'medidas',    l: 'Medidas',    icon: <Ruler size={14} /> },
                  { k: 'evaluacion', l: 'Evaluación', icon: <Eye size={14} /> },
                  { k: 'consulta',   l: 'Consulta',   icon: <MessageCircle size={14} /> },
                ].map(m => (
                  <button
                    key={m.k}
                    onClick={() => setMotivoDiseno(m.k)}
                    style={{
                      padding: '10px 6px', borderRadius: 10,
                      background: motivoDiseno === m.k ? '#f3e8ff' : 'white',
                      border: motivoDiseno === m.k ? '2px solid #7c3aed' : '1px solid #e5e7eb',
                      color: motivoDiseno === m.k ? '#5b21b6' : '#475569',
                      fontWeight: 700, fontSize: 12, cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                    }}
                  >
                    {m.icon}
                    {m.l}
                  </button>
                ))}
              </div>
            </div>

            {/* Aviso: sin colores en Diseño */}
            <div style={{
              background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12,
              padding: 10, display: 'flex', gap: 8, alignItems: 'flex-start',
              fontSize: 11, color: '#64748b', lineHeight: 1.5,
            }}>
              <Info size={14} style={{ flexShrink: 0, marginTop: 1, color: '#94a3b8' }} />
              <span>
                <b>Sin colores en Diseño.</b> Los colores se piden solo si después la muestra se pasa a una lavandería.
              </span>
            </div>
          </>
        ) : (
          <>
            {/* Aviso regla de colores (Lavandería) */}
            {reglaSource && (
              <div style={{
                background: colorDestinoSoft, borderRadius: 12,
                padding: 10, display: 'flex', gap: 10, alignItems: 'flex-start',
                fontSize: 11, color: colorDestino, lineHeight: 1.5,
              }}>
                <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>
                  Paleta limitada por la regla
                  {reglaNombre ? <strong> "{reglaNombre}"</strong> : ' del producto'}.
                  Hay {paleta.length} colores compatibles.
                </span>
              </div>
            )}

            {/* Sección colores plegable (opcional) */}
            <div style={{
              background: 'white', border: '1px solid #e5e7eb', borderRadius: 12,
              overflow: 'hidden',
            }}>
              <button
                onClick={() => setColoresAbiertos(v => !v)}
                style={{
                  width: '100%', padding: 12, background: 'transparent', border: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Colores a probar</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    Opcional · podés agregarlos después
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{
                    padding: '3px 8px', borderRadius: 999,
                    background: '#f1f5f9', color: '#475569',
                    fontSize: 10, fontWeight: 700,
                  }}>
                    {lineas.length}
                  </span>
                  {coloresAbiertos
                    ? <ChevronDown size={16} color="#94a3b8" />
                    : <ChevronRight size={16} color="#94a3b8" />}
                </div>
              </button>

              {coloresAbiertos && (
                <div style={{ borderTop: '1px solid #f1f5f9', padding: 12 }}>
                  {lineas.length === 0 ? (
                    <div style={{
                      fontSize: 12, color: '#94a3b8', textAlign: 'center',
                      padding: '10px 0',
                    }}>
                      Aún no agregaste colores. Tocá "Agregar color" para empezar.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {lineas.map((l, idx) => {
                        const fuera = colorFueraDeRegla(l.color_nombre);
                        return (
                          <div
                            key={idx}
                            style={{
                              background: 'white', border: '1px solid #e5e7eb',
                              borderRadius: 12, padding: 12, position: 'relative',
                              ...(fuera && { borderColor: '#fcd34d' }),
                            }}
                          >
                            <button
                              onClick={() => quitarLinea(idx)}
                              style={{
                                position: 'absolute', top: 6, right: 6,
                                width: 26, height: 26, borderRadius: '50%',
                                background: '#f1f5f9', border: 0, color: '#64748b',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer',
                              }}
                              aria-label="Quitar color"
                            >
                              <X size={14} />
                            </button>

                            <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                              <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                                <button
                                  onClick={() => setPicker(picker === idx ? null : idx)}
                                  style={{
                                    width: '100%', padding: '10px 32px 10px 12px',
                                    background: 'white', border: '1px solid #d1d5db',
                                    borderRadius: 10, fontSize: 14, fontWeight: 600,
                                    textAlign: 'left', cursor: 'pointer',
                                    color: l.color_nombre ? '#0f172a' : '#94a3b8',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  }}
                                >
                                  {l.color_nombre || 'Elegir color...'}
                                </button>
                                <ChevronDown size={14} style={{
                                  position: 'absolute', right: 10, top: '50%',
                                  transform: 'translateY(-50%)', color: '#94a3b8',
                                  pointerEvents: 'none',
                                }} />
                              </div>

                              <div style={{
                                display: 'inline-flex', alignItems: 'stretch',
                                border: '1px solid #d1d5db', borderRadius: 10, overflow: 'hidden',
                              }}>
                                <button
                                  onClick={() => setLinea(idx, { cantidad: Math.max(0, Number(l.cantidad) - 1) })}
                                  style={btnStep}
                                >−</button>
                                <input
                                  type="number"
                                  value={l.cantidad}
                                  onChange={(e) => setLinea(idx, { cantidad: Math.max(0, Number(e.target.value) || 0) })}
                                  style={inputStep}
                                />
                                <button
                                  onClick={() => setLinea(idx, { cantidad: Number(l.cantidad) + 1 })}
                                  style={btnStep}
                                >+</button>
                              </div>
                            </div>

                            <input
                              className="m-input"
                              style={{ marginTop: 8, fontSize: 13 }}
                              placeholder="Observaciones del envío (opcional)"
                              value={l.observaciones_envio}
                              onChange={(e) => setLinea(idx, { observaciones_envio: e.target.value })}
                            />

                            {fuera && (
                              <div style={{
                                marginTop: 8, padding: 8,
                                background: '#fffbeb', borderRadius: 8,
                                fontSize: 11, color: '#92400e',
                                display: 'flex', gap: 6, alignItems: 'flex-start',
                              }}>
                                <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
                                <span>
                                  Color fuera de la regla del producto. Se guarda igual.
                                </span>
                              </div>
                            )}

                            {picker === idx && (
                              <ColorPicker
                                paleta={paleta}
                                seleccionado={l.color_id}
                                yaUsados={lineas
                                  .filter((x, i) => i !== idx && x.color_id)
                                  .map(x => x.color_id)}
                                onPick={(c) => pickColor(idx, c)}
                                onClose={() => setPicker(null)}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <button
                    onClick={addLinea}
                    style={{
                      width: '100%', marginTop: 10,
                      padding: '10px', borderRadius: 10,
                      background: 'transparent', border: '2px dashed #cbd5e1',
                      color: '#64748b', fontSize: 13, fontWeight: 600,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      gap: 6, cursor: 'pointer',
                    }}
                  >
                    <Plus size={16} /> Agregar color
                  </button>

                  {lineas.length > 0 && cantidadTotalNum > 0 && sumaColores !== cantidadTotalNum && (
                    <div style={{
                      marginTop: 10, padding: 8,
                      background: sumaColores > cantidadTotalNum ? '#fef2f2' : '#fef9c3',
                      border: `1px solid ${sumaColores > cantidadTotalNum ? '#fca5a5' : '#fde68a'}`,
                      borderRadius: 8, fontSize: 11,
                      color: sumaColores > cantidadTotalNum ? '#b91c1c' : '#854d0e',
                    }}>
                      Suma colores: {sumaColores} · Total: {cantidadTotalNum}
                      {sumaColores > cantidadTotalNum && ' (excede el total)'}
                      {sumaColores < cantidadTotalNum && ' (faltan colores por asignar)'}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* Observaciones generales */}
        <div>
          <span className="m-label-xs">Observaciones (opcional)</span>
          <textarea
            rows={2}
            className="m-input"
            placeholder={destinoTipo === 'lavanderia'
              ? 'Ej: Cliente quiere ver 3 tonos de negro...'
              : 'Algún detalle para Diseño...'}
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            style={{ padding: 12, marginTop: 8, fontFamily: 'inherit', resize: 'vertical' }}
          />
        </div>

        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c',
            borderRadius: 12, padding: 12, fontSize: 13,
            display: 'flex', alignItems: 'flex-start', gap: 8,
          }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}
      </div>

      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'white', borderTop: '1px solid #e5e7eb',
        padding: '10px 16px',
        display: 'flex', gap: 10, zIndex: 50,
      }}>
        <button
          onClick={() => navigate(-1)}
          className="m-btn m-btn-outline"
          style={{ flex: 1, borderColor: '#cbd5e1', color: '#475569', minHeight: 48 }}
        >
          Cancelar
        </button>
        <button
          className="m-btn"
          disabled={enviando}
          onClick={enviar}
          style={{
            flex: 2, minHeight: 48,
            background: colorDestino, color: 'white', borderColor: colorDestino,
            fontWeight: 700,
          }}
        >
          {enviando
            ? <><Loader2 className="m-spin" size={18} /> Enviando...</>
            : <><Send size={18} /> {destinoTipo === 'lavanderia'
                ? `Registrar envío (${cantidadTotalNum || 0} pzs)`
                : `Entregar a Diseño (${cantidadTotalNum || 0} pzs)`}</>}
        </button>
      </div>
    </div>
  );
};

/* ──────── Sub-componentes ──────── */

/**
 * Selector con buscador. Muestra el nombre elegido en un botón, al tocar abre
 * un panel debajo con un input de búsqueda y la lista filtrada.
 */
const PersonaPicker = ({ personas, value, onChange, color, colorSoft, placeholder }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const sel = personas.find(p => p.id === value);
  const filtradas = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return personas;
    return personas.filter(p =>
      String(p.nombre || '').toLowerCase().includes(s)
    );
  }, [personas, q]);

  const pick = (p) => {
    onChange(p.id);
    setOpen(false);
    setQ('');
  };

  return (
    <div style={{ marginTop: 8, position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', padding: '10px 36px 10px 12px',
          background: 'white',
          border: open ? `2px solid ${color}` : '1px solid #d1d5db',
          borderRadius: 10, fontSize: 15, fontWeight: 600,
          textAlign: 'left', cursor: 'pointer',
          color: sel ? '#0f172a' : '#94a3b8',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          position: 'relative',
        }}
      >
        {sel ? sel.nombre : placeholder}
        <ChevronDown size={16} style={{
          position: 'absolute', right: 10, top: '50%',
          transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)`,
          color: '#94a3b8', transition: 'transform .15s',
          pointerEvents: 'none',
        }} />
      </button>

      {open && (
        <div style={{
          marginTop: 6, background: 'white',
          border: '1px solid #e5e7eb', borderRadius: 12,
          boxShadow: '0 10px 24px -8px rgba(0,0,0,.15)',
          overflow: 'hidden',
        }}>
          <div style={{ padding: 8, borderBottom: '1px solid #f1f5f9', position: 'relative' }}>
            <Search size={14} style={{
              position: 'absolute', left: 18, top: '50%',
              transform: 'translateY(-50%)', color: '#94a3b8',
              pointerEvents: 'none',
            }} />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Buscar (${personas.length})...`}
              style={{
                width: '100%', padding: '8px 30px 8px 30px',
                background: '#f8fafc', border: '1px solid #e5e7eb',
                borderRadius: 8, fontSize: 13, outline: 'none',
              }}
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ('')}
                style={{
                  position: 'absolute', right: 16, top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent', border: 0, cursor: 'pointer',
                  color: '#94a3b8', padding: 2,
                }}
                aria-label="Limpiar"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {filtradas.length === 0 ? (
              <div style={{ padding: 14, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
                Sin coincidencias para "{q}"
              </div>
            ) : (
              filtradas.map(p => {
                const activo = p.id === value;
                return (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => pick(p)}
                    style={{
                      width: '100%', padding: '10px 12px',
                      background: activo ? colorSoft : 'transparent',
                      border: 0, textAlign: 'left', cursor: 'pointer',
                      fontSize: 13, fontWeight: 600,
                      color: activo ? color : '#0f172a',
                      display: 'flex', alignItems: 'center', gap: 8,
                      borderBottom: '1px solid #f1f5f9',
                    }}
                  >
                    <div style={{
                      width: 26, height: 26, borderRadius: '50%',
                      background: color, color: 'white',
                      fontWeight: 700, fontSize: 10,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      {iniciales(p.nombre)}
                    </div>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.nombre}
                    </span>
                    {activo && <Check size={14} style={{ color }} />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const DestinoChip = ({ activo, color, colorSoft, onClick, icon, titulo, subtitulo }) => (
  <button
    onClick={onClick}
    style={{
      padding: 12, borderRadius: 12,
      background: activo ? colorSoft : 'white',
      border: activo ? `2px solid ${color}` : '1px solid #e5e7eb',
      cursor: 'pointer', textAlign: 'left',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, color: activo ? color : '#475569' }}>
      {icon}
      <span style={{ fontWeight: 700, fontSize: 14 }}>{titulo}</span>
    </div>
    <div style={{ fontSize: 10, color: activo ? color : '#94a3b8' }}>
      {subtitulo}
    </div>
  </button>
);

const ColorPicker = ({ paleta, seleccionado, yaUsados, onPick, onClose }) => {
  const [q, setQ] = useState('');
  const filtrados = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return paleta;
    return paleta.filter(c =>
      String(c.nombre || '').toLowerCase().includes(s) ||
      String(c.color_general_nombre || '').toLowerCase().includes(s)
    );
  }, [paleta, q]);

  return (
    <div style={{
      marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9',
    }}>
      <input
        className="m-input"
        autoFocus
        placeholder="Buscar color..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ fontSize: 13 }}
      />
      <div style={{
        marginTop: 8, maxHeight: 220, overflowY: 'auto',
        background: '#f8fafc', borderRadius: 8,
      }}>
        {filtrados.length === 0 ? (
          <div style={{ padding: 14, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
            Sin coincidencias
          </div>
        ) : (
          filtrados.map(c => {
            const usado = yaUsados.includes(c.id);
            const activo = c.id === seleccionado;
            return (
              <button
                key={c.id}
                onClick={() => onPick(c)}
                disabled={usado && !activo}
                style={{
                  width: '100%', padding: '10px 12px',
                  background: activo ? 'var(--m-brand-soft)' : 'transparent',
                  border: 0, textAlign: 'left', cursor: usado && !activo ? 'not-allowed' : 'pointer',
                  fontSize: 13, fontWeight: 600,
                  color: usado && !activo ? '#cbd5e1' : '#0f172a',
                  display: 'flex', alignItems: 'center', gap: 8,
                  borderBottom: '1px solid #f1f5f9',
                }}
              >
                {c.codigo_hex && (
                  <span style={{
                    width: 14, height: 14, borderRadius: 4,
                    background: c.codigo_hex, border: '1px solid #e5e7eb',
                    flexShrink: 0,
                  }} />
                )}
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.nombre}
                </span>
                {usado && <span style={{ fontSize: 10, color: '#94a3b8' }}>usado</span>}
                {activo && <Check size={14} style={{ color: 'var(--m-brand)' }} />}
              </button>
            );
          })
        )}
      </div>
      <button
        onClick={onClose}
        className="m-btn m-btn-outline"
        style={{ marginTop: 8, width: '100%', minHeight: 36, fontSize: 12 }}
      >
        Cerrar
      </button>
    </div>
  );
};

const btnStep = {
  width: 38, height: 42, fontSize: 18, fontWeight: 700,
  background: '#f8fafc', border: 0, cursor: 'pointer',
};
const inputStep = {
  width: 52, textAlign: 'center', fontSize: 15, fontWeight: 700,
  border: 'none', outline: 'none', fontVariantNumeric: 'tabular-nums',
};

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function iniciales(nombre) {
  if (!nombre) return '—';
  return String(nombre)
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(s => s[0])
    .join('')
    .toUpperCase();
}

export default MobileNuevaMuestraLavanderia;
