import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export const toTitleCase = (value) => {
  if (value == null) return '';
  const text = String(value).trim().replace(/\s+/g, ' ');
  if (!text) return '';
  return text
    .toLocaleLowerCase('es-PE')
    .replace(/(^|[\s./-])(\p{L}|\p{N})/gu, (_, separator, char) => (
      `${separator}${char.toLocaleUpperCase('es-PE')}`
    ));
};

export const formatColorName = toTitleCase;

export const getStatusClass = (estado) => {
  const estadoLower = estado.toLowerCase();
  if (estadoLower.includes('corte')) return 'status-corte';
  if (estadoLower.includes('costura') || estadoLower.includes('atraque')) return 'status-costura';
  if (estadoLower.includes('lavandería') || estadoLower.includes('lavanderia')) return 'status-lavanderia';
  if (estadoLower.includes('acabado')) return 'status-acabado';
  if (estadoLower.includes('almacén') || estadoLower.includes('tienda')) return 'status-almacen';
  return '';
};

export const formatCurrency = (value) => {
  if (value == null || value === '') return '—';
  return `S/ ${Number(value).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const formatNumber = (value, decimals = 2) => {
  if (value == null || value === '') return '—';
  return Number(value).toLocaleString('es-PE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};
