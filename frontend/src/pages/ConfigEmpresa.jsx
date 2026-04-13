import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { Building2, Loader2, CheckCircle2 } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

export default function ConfigEmpresa() {
  const { empresaId, updateEmpresaId } = useAuth();
  const [empresas, setEmpresas] = useState([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get(`${API}/configuracion/empresa`);
        setEmpresas(res.data.empresas || []);
        const current = res.data.empresa_actual_id;
        setSelected(current ? String(current) : '');
        if (current && !empresaId) {
          updateEmpresaId(current);
        }
      } catch (err) {
        toast.error('Error al cargar configuración de empresa');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await axios.put(`${API}/configuracion/empresa`, {
        empresa_id: parseInt(selected, 10),
      });
      updateEmpresaId(selected);

      const tablas = res.data.tablas_actualizadas || {};
      const count = Object.values(tablas).reduce((a, b) => a + b, 0);
      if (count > 0) {
        toast.success(`Empresa actualizada. ${count} registros modificados en ${Object.keys(tablas).length} tablas.`);
      } else {
        toast.success('Empresa configurada correctamente (sin cambios necesarios).');
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al cambiar empresa');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const empresaActual = empresas.find(e => String(e.id) === selected);

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Empresa Activa</h2>
        <p className="text-sm text-muted-foreground">
          Selecciona la empresa para el módulo de producción. Todas las tablas se actualizarán automáticamente.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Configuración de Empresa
          </CardTitle>
          <CardDescription>
            Al cambiar la empresa, se actualizará el empresa_id en todas las tablas de producción (inventario, registros, ingresos, salidas, etc.)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Empresa</label>
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona una empresa" />
              </SelectTrigger>
              <SelectContent>
                {empresas.map(e => (
                  <SelectItem key={e.id} value={String(e.id)}>
                    {e.nombre} {e.ruc ? `(${e.ruc})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {empresaActual && String(empresaId) === selected && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              Empresa activa actualmente
            </div>
          )}

          <Button
            onClick={handleSave}
            disabled={saving || !selected}
            className="w-full"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Actualizando tablas...
              </>
            ) : (
              'Guardar y Aplicar'
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
