// Utilidades para formateo de fechas en hora de Lima (UTC-5)

/**
 * Convierte una fecha UTC a hora de Lima (UTC-5) y la formatea
 * @param {string|Date} dateStr - Fecha en formato ISO o Date object
 * @param {boolean} includeTime - Si incluir la hora en el formato
 * @returns {string} Fecha formateada en hora de Lima
 */
export const formatDateLima = (dateStr, includeTime = false) => {
  if (!dateStr) return '-';
  
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '-';
    
    // Opciones de formato para Lima
    const options = {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    };
    
    if (includeTime) {
      options.hour = '2-digit';
      options.minute = '2-digit';
      options.hour12 = true;
    }
    
    return date.toLocaleString('es-PE', options);
  } catch (error) {
    return '-';
  }
};

/**
 * Formatea fecha para mostrar en tablas (solo fecha)
 * @param {string|Date} dateStr - Fecha en formato ISO o Date object
 * @returns {string} Fecha formateada DD/MM/YYYY
 */
export const formatDate = (dateStr) => {
  return formatDateLima(dateStr, false);
};

/**
 * Formatea fecha con hora para mostrar en detalles
 * @param {string|Date} dateStr - Fecha en formato ISO o Date object
 * @returns {string} Fecha formateada DD/MM/YYYY HH:MM AM/PM
 */
export const formatDateTime = (dateStr) => {
  return formatDateLima(dateStr, true);
};

/**
 * Obtiene la fecha actual en hora de Lima en formato YYYY-MM-DD para inputs
 * @returns {string} Fecha en formato YYYY-MM-DD
 */
export const getTodayLima = () => {
  const now = new Date();
  const limaDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Lima' }));
  return limaDate.toISOString().split('T')[0];
};

/**
 * Formatea fecha relativa (hace X minutos, hace X horas, etc.)
 * @param {string|Date} dateStr - Fecha en formato ISO o Date object
 * @returns {string} Texto relativo
 */
export const formatRelativeDate = (dateStr) => {
  if (!dateStr) return '-';
  
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '-';
    
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Justo ahora';
    if (diffMins < 60) return `Hace ${diffMins} min`;
    if (diffHours < 24) return `Hace ${diffHours}h`;
    if (diffDays < 7) return `Hace ${diffDays}d`;
    
    return formatDate(dateStr);
  } catch (error) {
    return '-';
  }
};
