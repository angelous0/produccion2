/**
 * Detección de dispositivo móvil para redirección automática.
 *
 * Reglas:
 *   1. Si la URL tiene ?desktop=1 → forzar versión web y persistir en localStorage.
 *   2. Si localStorage tiene `force_desktop = "1"` → respetar versión web.
 *   3. Si viewport < 820px O user-agent es móvil → es móvil.
 *
 * El usuario puede volver a forzar móvil borrando la flag con clearDesktopOverride().
 */

const DESKTOP_OVERRIDE_KEY = 'force_desktop';
const MOBILE_VIEWPORT_BREAKPOINT = 820;

const MOBILE_USER_AGENT_RE = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet/i;

/**
 * Devuelve true si el dispositivo debe usar la versión móvil.
 */
export function shouldUseMobile() {
  if (typeof window === 'undefined') return false;

  // 1) Si la URL trae ?desktop=1, persistir y respetar
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('desktop') === '1') {
      window.localStorage.setItem(DESKTOP_OVERRIDE_KEY, '1');
      return false;
    }
  } catch { /* ignorar errores de SSR */ }

  // 2) Si el usuario ya forzó desktop antes, respetar
  try {
    if (window.localStorage.getItem(DESKTOP_OVERRIDE_KEY) === '1') return false;
  } catch { /* ignorar */ }

  // 3) Detección por viewport o user-agent
  const viewportMobile = (window.innerWidth || 9999) < MOBILE_VIEWPORT_BREAKPOINT;
  const uaMobile = MOBILE_USER_AGENT_RE.test(window.navigator?.userAgent || '');

  return viewportMobile || uaMobile;
}

/**
 * Borra la flag de "ver versión escritorio" — la próxima vez que el usuario entre
 * desde móvil, volverá a la versión móvil automáticamente.
 */
export function clearDesktopOverride() {
  try {
    window.localStorage.removeItem(DESKTOP_OVERRIDE_KEY);
  } catch { /* ignorar */ }
}

/**
 * Marca explícitamente que el usuario quiere la versión escritorio.
 * Equivalente a entrar con ?desktop=1.
 */
export function forceDesktop() {
  try {
    window.localStorage.setItem(DESKTOP_OVERRIDE_KEY, '1');
  } catch { /* ignorar */ }
}
