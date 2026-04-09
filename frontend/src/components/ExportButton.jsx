import { useState } from 'react';
import axios from 'axios';
import { Button } from './ui/button';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Botón reutilizable para exportar datos a Excel (CSV)
 * 
 * @param {string} tabla - Nombre de la tabla a exportar (registros, inventario, movimientos, productividad, personas, modelos)
 * @param {string} label - Texto del botón (opcional)
 * @param {string} variant - Variante del botón (opcional)
 */
export const ExportButton = ({ tabla, label = "Exportar Excel", variant = "outline", size = "sm", className = "" }) => {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/export/${tabla}`, {
        responseType: 'blob'
      });
      
      // Crear link de descarga
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const filename = `${tabla}_${new Date().toISOString().slice(0,10)}.csv`;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success('Archivo exportado correctamente');
    } catch (error) {
      toast.error('Error al exportar datos');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleExport}
      disabled={loading}
      className={className}
      data-testid={`export-${tabla}`}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
      ) : (
        <FileSpreadsheet className="h-4 w-4 mr-2" />
      )}
      {label}
    </Button>
  );
};

export default ExportButton;
