import { useState } from 'react';
import { Button } from './ui/button';
import { FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Botón para exportar datos a PDF
 * 
 * @param {string} title - Título del reporte
 * @param {Array} columns - Columnas del reporte [{header: 'Nombre', key: 'nombre'}, ...]
 * @param {Array} data - Datos a exportar
 * @param {string} filename - Nombre del archivo (sin extensión)
 * @param {object} summary - Resumen opcional {label: value, ...}
 */
export const ExportPDFButton = ({ 
  title, 
  columns, 
  data, 
  filename = 'reporte',
  summary = null,
  variant = "outline", 
  size = "sm",
  label = "Exportar PDF"
}) => {
  const [loading, setLoading] = useState(false);

  const handleExport = () => {
    setLoading(true);
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      
      // Header
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text(title, pageWidth / 2, 20, { align: 'center' });
      
      // Fecha
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100);
      const fecha = new Date().toLocaleDateString('es-PE', { 
        day: '2-digit', 
        month: 'long', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      doc.text(`Generado: ${fecha}`, pageWidth / 2, 28, { align: 'center' });
      
      // Línea separadora
      doc.setDrawColor(200);
      doc.line(14, 32, pageWidth - 14, 32);
      
      let yPosition = 40;
      
      // Resumen si existe
      if (summary && Object.keys(summary).length > 0) {
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0);
        doc.text('Resumen', 14, yPosition);
        yPosition += 8;
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        Object.entries(summary).forEach(([key, value]) => {
          doc.text(`${key}: ${value}`, 14, yPosition);
          yPosition += 6;
        });
        yPosition += 5;
      }
      
      // Tabla de datos
      if (data && data.length > 0) {
        const tableColumns = columns.map(col => col.header);
        const tableData = data.map(row => 
          columns.map(col => {
            let value = row[col.key];
            if (value === null || value === undefined) return '-';
            if (typeof value === 'boolean') return value ? 'Sí' : 'No';
            if (value instanceof Date) return value.toLocaleDateString('es-PE');
            if (typeof value === 'number' && col.format === 'currency') {
              return `S/ ${value.toFixed(2)}`;
            }
            return String(value);
          })
        );
        
        autoTable(doc, {
          startY: yPosition,
          head: [tableColumns],
          body: tableData,
          theme: 'grid',
          headStyles: {
            fillColor: [59, 130, 246],
            textColor: 255,
            fontStyle: 'bold',
            fontSize: 9,
          },
          bodyStyles: {
            fontSize: 8,
          },
          alternateRowStyles: {
            fillColor: [245, 247, 250],
          },
          margin: { left: 14, right: 14 },
          styles: {
            cellPadding: 3,
            overflow: 'linebreak',
          },
        });
      } else {
        doc.setFontSize(10);
        doc.text('No hay datos para mostrar', pageWidth / 2, yPosition + 20, { align: 'center' });
      }
      
      // Footer con número de página
      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(
          `Página ${i} de ${pageCount}`,
          pageWidth / 2,
          doc.internal.pageSize.getHeight() - 10,
          { align: 'center' }
        );
        doc.text(
          'Sistema de Producción Textil',
          14,
          doc.internal.pageSize.getHeight() - 10
        );
      }
      
      // Descargar
      doc.save(`${filename}_${new Date().toISOString().slice(0,10)}.pdf`);
      toast.success('PDF exportado correctamente');
    } catch (error) {
      console.error('Error exporting PDF:', error);
      toast.error('Error al exportar PDF');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleExport}
      disabled={loading || !data || data.length === 0}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
      ) : (
        <FileText className="h-4 w-4 mr-2" />
      )}
      {label}
    </Button>
  );
};

export default ExportPDFButton;
