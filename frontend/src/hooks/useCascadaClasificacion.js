import { useEffect, useState, useMemo, useCallback } from 'react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Hook para clasificar prendas con cascadas entre catálogos.
 *
 * Cascadas (server-side filter):
 *   - Tipo        → /api/tipos?marca_id
 *   - Género      → /api/generos?marca_id
 *   - Entalle     → /api/entalles?tipo_id
 *   - Cuello      → /api/cuellos?tipo_id   (solo si tipo == 'Polo')
 *   - Detalle     → /api/detalles?tipo_id
 *   - Lavado      → /api/lavados?tipo_id   (solo si tipo in [Pantalon, Short])
 *   - Tela        → /api/telas?entalle_id  (intersectado con tela_general si corresponde)
 *
 * Devuelve catálogos filtrados + banderas de visibilidad.
 *
 * @param {object} sel - {marca_id, tipo_id, entalle_id, tela_general_id}
 */
export function useCascadaClasificacion({ marca_id, tipo_id, entalle_id, tela_general_id }) {
  const [marcas, setMarcas] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [entalles, setEntalles] = useState([]);
  const [telas, setTelas] = useState([]);
  const [telasGenerales, setTelasGenerales] = useState([]);
  const [generos, setGeneros] = useState([]);
  const [cuellos, setCuellos] = useState([]);
  const [detalles, setDetalles] = useState([]);
  const [lavados, setLavados] = useState([]);
  const [categoriasColor, setCategoriasColor] = useState([]);

  // Marca + tela_general + color_general se cargan solo una vez (no dependen de nada)
  useEffect(() => {
    (async () => {
      try {
        const [m, tg, cc] = await Promise.all([
          axios.get(`${API}/marcas`),
          axios.get(`${API}/telas-general`),
          axios.get(`${API}/colores-generales`),
        ]);
        setMarcas(m.data || []);
        setTelasGenerales(tg.data || []);
        setCategoriasColor(cc.data || []);
      } catch {}
    })();
  }, []);

  // Tipos + géneros dependen de marca_id
  useEffect(() => {
    (async () => {
      try {
        const url = marca_id ? `${API}/tipos?marca_id=${marca_id}` : `${API}/tipos`;
        const r = await axios.get(url);
        setTipos(r.data || []);
      } catch {}
    })();
  }, [marca_id]);

  useEffect(() => {
    (async () => {
      try {
        const url = marca_id ? `${API}/generos?marca_id=${marca_id}` : `${API}/generos`;
        const r = await axios.get(url);
        setGeneros(r.data || []);
      } catch {}
    })();
  }, [marca_id]);

  // Entalle, cuello, detalle, lavado dependen de tipo_id
  useEffect(() => {
    (async () => {
      try {
        const url = tipo_id ? `${API}/entalles?tipo_id=${tipo_id}` : `${API}/entalles`;
        const r = await axios.get(url);
        setEntalles(r.data || []);
      } catch {}
    })();
  }, [tipo_id]);

  useEffect(() => {
    (async () => {
      try {
        const url = tipo_id ? `${API}/cuellos?tipo_id=${tipo_id}` : `${API}/cuellos`;
        const r = await axios.get(url);
        setCuellos(r.data || []);
      } catch {}
    })();
  }, [tipo_id]);

  useEffect(() => {
    (async () => {
      try {
        const url = tipo_id ? `${API}/detalles?tipo_id=${tipo_id}` : `${API}/detalles`;
        const r = await axios.get(url);
        setDetalles(r.data || []);
      } catch {}
    })();
  }, [tipo_id]);

  useEffect(() => {
    (async () => {
      try {
        const url = tipo_id ? `${API}/lavados?tipo_id=${tipo_id}` : `${API}/lavados`;
        const r = await axios.get(url);
        setLavados(r.data || []);
      } catch {}
    })();
  }, [tipo_id]);

  // Telas: filtradas por entalle_id (server-side) + intersección con tela_general_id (client-side)
  useEffect(() => {
    (async () => {
      try {
        const url = entalle_id ? `${API}/telas?entalle_id=${entalle_id}` : `${API}/telas`;
        const r = await axios.get(url);
        setTelas(r.data || []);
      } catch {}
    })();
  }, [entalle_id]);

  const telasFiltradas = useMemo(() => {
    if (!tela_general_id) return telas;
    return telas.filter(t => String(t.tela_general_id) === String(tela_general_id));
  }, [telas, tela_general_id]);

  // Nombre del tipo seleccionado (para banderas)
  const tipoSeleccionado = useMemo(
    () => tipos.find(t => t.id === tipo_id),
    [tipos, tipo_id],
  );
  const tipoNombre = tipoSeleccionado?.nombre?.toLowerCase() || '';

  const mostrarCuello = tipoNombre === 'polo';
  const mostrarLavado = tipoNombre === 'pantalon' || tipoNombre === 'short';

  // Helpers para validar que un id sigue siendo válido tras cambiar el padre
  const esIdValido = useCallback((id, lista) => {
    if (!id) return true; // vacío siempre es válido
    return lista.some(item => item.id === id);
  }, []);

  return {
    marcas,
    tipos,
    entalles,
    telas: telasFiltradas,
    telasGenerales,
    generos,
    cuellos,
    detalles,
    lavados,
    categoriasColor,
    mostrarCuello,
    mostrarLavado,
    tipoNombre: tipoSeleccionado?.nombre || null,
    esIdValido,
  };
}

export default useCascadaClasificacion;
