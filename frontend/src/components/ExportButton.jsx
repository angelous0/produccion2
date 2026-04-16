import { useState } from 'react';
import axios from 'axios';
import { Button } from './ui/button';
import { FileSpreadsheet, FileText, Loader2, ChevronDown } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Column definitions for known tables
const TABLE_COLUMNS = {
  registros: [
    { key: 'n_corte',               label: 'N Corte' },
    { key: 'modelo_nombre',         label: 'Modelo' },
    { key: 'marca_nombre',          label: 'Marca' },
    { key: 'tipo_nombre',           label: 'Tipo' },
    { key: 'entalle_nombre',        label: 'Entalle' },
    { key: 'tela_nombre',           label: 'Tela' },
    { key: 'hilo_nombre',           label: 'Hilo' },
    { key: 'hilo_especifico_nombre', label: 'Hilo Especifico' },
    { key: 'linea_negocio_nombre',  label: 'Linea' },
    { key: 'estado',                label: 'Estado' },
    { key: 'curva',                 label: 'Curva' },
    { key: '_total_prendas',        label: 'Prendas' },
    { key: 'fecha_entrega_final',   label: 'Fecha Entrega' },
    { key: 'urgente',               label: 'Urgente' },
    { key: 'responsable_actual',    label: 'Responsable' },
  ],
};

// Preprocesar items según tabla antes de exportar
function preprocessItems(tabla, items) {
  if (tabla === 'registros') {
    return items.map(item => ({
      ...item,
      _total_prendas: Array.isArray(item.tallas)
        ? item.tallas.reduce((s, t) => s + (parseInt(t.cantidad) || 0), 0)
        : (item.cantidad_divisiones || 0),
    }));
  }
  return items;
}

function escapeCSV(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function generateCSV(items, columns) {
  const header = columns.map(c => escapeCSV(c.label)).join(',');
  const rows = items.map(item =>
    columns.map(c => {
      const val = item[c.key];
      if (typeof val === 'boolean') return val ? 'Si' : 'No';
      return escapeCSV(val);
    }).join(',')
  );
  return '\uFEFF' + [header, ...rows].join('\n'); // BOM for Excel UTF-8
}

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export const ExportButton = ({ tabla, label = "Exportar", variant = "outline", size = "sm", className = "", filters = {}, items = null }) => {
  const [loading, setLoading] = useState(false);

  const handleExport = async (format) => {
    setLoading(true);
    const date = new Date().toISOString().slice(0, 10);

    try {
      // ── Client-side CSV/Excel if items provided ───────────────────────
      if (items && items.length > 0) {
        const processedItems = preprocessItems(tabla, items);
        const columns = TABLE_COLUMNS[tabla] || Object.keys(items[0]).map(k => ({ key: k, label: k }));

        if (format === 'csv') {
          const csv = generateCSV(processedItems, columns);
          downloadBlob(csv, tabla + '_' + date + '.csv', 'text/csv;charset=utf-8');
          toast.success(items.length + ' registros exportados a CSV');
          return;
        }

        if (format === 'xlsx') {
          const csv = generateCSV(processedItems, columns);
          downloadBlob(csv, tabla + '_' + date + '.xlsx', 'application/vnd.ms-excel');
          toast.success(items.length + ' registros exportados a Excel (filtrados)');
          return;
        }

        if (format === 'pdf') {
          const cols = columns;
          const titulo = tabla.charAt(0).toUpperCase() + tabla.slice(1);
          const htmlRows = processedItems.map(item =>
            '<tr>' + cols.map(c => {
              const val = item[c.key];
              const display = val === null || val === undefined ? '' : typeof val === 'boolean' ? (val ? 'Si' : 'No') : String(val);
              return '<td style="padding:4px 8px;border:1px solid #ddd;font-size:11px">' + display + '</td>';
            }).join('') + '</tr>'
          ).join('');
          const htmlHeaders = cols.map(c => '<th style="padding:6px 8px;background:#3b82f6;color:white;border:1px solid #2563eb;font-size:11px;text-align:left">' + c.label + '</th>').join('');
          const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${titulo} — ${date}</title>
            <style>
              body{font-family:Arial,sans-serif;padding:24px;color:#111}
              .header{display:flex;align-items:baseline;gap:12px;margin-bottom:4px}
              h2{font-size:16px;margin:0}
              .meta{font-size:12px;color:#666}
              table{border-collapse:collapse;width:100%;margin-top:16px}
              tr:nth-child(even) td{background:#f8fafc}
              @media print{.no-print{display:none}}
            </style>
            </head><body>
            <div class="header">
              <h2>${titulo}</h2>
              <span class="meta">${items.length} registros &nbsp;·&nbsp; ${date}</span>
            </div>
            <button class="no-print" onclick="window.print()" style="padding:6px 16px;background:#3b82f6;color:white;border:none;border-radius:6px;cursor:pointer;font-size:13px">Imprimir / Guardar PDF</button>
            <table><thead><tr>${htmlHeaders}</tr></thead><tbody>${htmlRows}</tbody></table>
            </body></html>`;
          const blob = new Blob([html], { type: 'text/html' });
          const url = window.URL.createObjectURL(blob);
          window.open(url, '_blank');
          toast.success('Vista de impresion abierta — usa Ctrl+P para guardar como PDF');
          return;
        }
      }

      // ── Server-side export (when no items provided) ───────────────────
      const params = new URLSearchParams({ format });
      // Only pass params the backend supports
      if (filters.search) params.set('search', filters.search);
      if (filters.excluir_estados) params.set('excluir_estados', filters.excluir_estados);
      if (filters.estados) params.set('estados', filters.estados);

      const url = `${API}/export/${tabla}?${params.toString()}`;
      const response = await axios.get(url, { responseType: 'blob' });

      if (!response.data || response.data.size === 0) throw new Error('Respuesta vacia');

      const ext = format === 'pdf' ? 'pdf' : 'xlsx';
      const mime = format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const blob = new Blob([response.data], { type: mime });
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', tabla + '_' + date + '.' + ext);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
      toast.success((format === 'pdf' ? 'PDF' : 'Excel') + ' exportado correctamente');

    } catch (err) {
      console.error('Export error:', err);
      toast.error(err.response?.status === 404 ? 'Endpoint no encontrado' : err.message || 'Error al exportar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} disabled={loading} className={className} data-testid={`export-${tabla}`}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <FileSpreadsheet className="h-4 w-4 mr-1.5" />}
          {label}
          {items && items.length > 0 && <span className="ml-1 text-xs opacity-70">({items.length})</span>}
          <ChevronDown className="h-3 w-3 ml-1 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleExport('xlsx')} data-testid={`export-${tabla}-xlsx`}>
          <FileSpreadsheet className="h-4 w-4 mr-2 text-green-600" />
          Exportar Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport('csv')} data-testid={`export-${tabla}-csv`}>
          <FileText className="h-4 w-4 mr-2 text-blue-600" />
          Exportar CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport('pdf')} data-testid={`export-${tabla}-pdf`}>
          <FileText className="h-4 w-4 mr-2 text-red-600" />
          Exportar PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ExportButton;
