/**
 * Interceptor global de axios: convierte strings datetime sin tz info
 * en UTC explícito (agrega 'Z' al final).
 *
 * Motivo: el backend guarda fechas como `timestamp without time zone` en
 * PostgreSQL y las serializa como "2026-04-20T19:05:00.123456" (sin sufijo).
 * JavaScript `new Date(str)` interpreta eso como hora LOCAL del navegador,
 * causando un desfase de ±5 horas al aplicar timeZone: 'America/Lima'.
 *
 * Al agregar 'Z' el string se interpreta como UTC y toLocaleString convierte
 * correctamente a hora Lima (UTC-5).
 *
 * Regex: captura "YYYY-MM-DDTHH:MM:SS" con o sin fracción de segundos,
 * y sólo si NO tiene ya tz info (Z o ±HH:MM al final).
 */
import axios from 'axios';

// Patrón: ISO datetime sin tz (no termina en Z ni +HH:MM ni -HH:MM)
const NAIVE_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/;

/**
 * Recorre el objeto recursivamente y convierte strings de fecha naive a UTC.
 * Muta in-place por performance. Maneja arrays, objetos anidados, null, etc.
 */
function fixNaiveDatesDeep(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const v = obj[i];
      if (typeof v === 'string' && NAIVE_DATETIME_RE.test(v)) {
        obj[i] = v + 'Z';
      } else if (v && typeof v === 'object') {
        fixNaiveDatesDeep(v);
      }
    }
    return obj;
  }
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (typeof v === 'string' && NAIVE_DATETIME_RE.test(v)) {
      obj[k] = v + 'Z';
    } else if (v && typeof v === 'object') {
      fixNaiveDatesDeep(v);
    }
  }
  return obj;
}

let installed = false;

export function installUtcFix() {
  if (installed) return;
  installed = true;
  axios.interceptors.response.use(
    (response) => {
      if (response && response.data) {
        try { fixNaiveDatesDeep(response.data); } catch { /* ignore */ }
      }
      return response;
    },
    (error) => Promise.reject(error),
  );
}

export default installUtcFix;
