import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { Building2, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

export default function ConfigEmpresa() {
  const { empresaId, updateEmpresaId } = useAuth();
  const [empresas, setEmpresas] = useState([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Modo migración
  const [modoMigracion, setModoMigracion] = useState(false);
  const [modoMigracionInfo, setModoMigracionInfo] = useState(null);
  const [savingMigracion, setSavingMigracion] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [empRes, migRes] = await Promise.all([
          axios.get(`${API}/configuracion/empresa`),
          axios.get(`${API}/configuracion/modo-migracion`),
        ]);
        setEmpresas(empRes.data.empresas || []);
        const current = empRes.data.empresa_actual_id;
        setSelected(current ? String(current) : '');
        if (current && !empresaId) {
          updateEmpresaId(current);
        }
        setModoMigracion(migRes.data.activo || false);
        setModoMigracionInfo(migRes.data);
      } catch (err) {
        toast.error('Error al cargar configuración');
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

  const handleToggleMigracion = async (checked) => {
    setSavingMigracion(true);
    try {
      const res = await axios.put(`${API}/configuracion/modo-migracion`, { activo: checked });
      setModoMigracion(res.data.activo);
      toast.success(res.data.message);
      // Recargar info
      const migRes = await axios.get(`${API}/configuracion/modo-migracion`);
      setModoMigracionInfo(migRes.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al cambiar modo migración');
    } finally {
      setSavingMigracion(false);
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
      {/* Card Modo Migración */}
      <Card className={modoMigracion ? 'border-yellow-400 bg-yellow-50/50 dark:bg-yellow-950/20' : ''}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className={`h-5 w-5 ${modoMigracion ? 'text-yellow-600' : ''}`} />
            Migración de Datos
          </CardTitle>
          <CardDescription>
            Cuando está activo, los registros creados NO descontarán inventario automáticamente. Útil para migrar datos históricos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label className="text-sm font-medium">Modo Migración activo</label>
              <p className={`text-xs font-medium ${modoMigracion ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                {modoMigracion
                  ? 'Los registros creados NO descontarán inventario'
                  : 'Comportamiento normal — inventario se descuenta automáticamente'}
              </p>
            </div>
            <Switch
              checked={modoMigracion}
              onCheckedChange={handleToggleMigracion}
              disabled={savingMigracion}
            />
          </div>

          {modoMigracion && (
            <div className="rounded-md bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 px-3 py-2">
              <p className="text-xs text-yellow-800 dark:text-yellow-200 font-medium flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                Modo migración activo — los registros no descontarán inventario
              </p>
            </div>
          )}

          {modoMigracionInfo?.updated_by && (
            <p className="text-xs text-muted-foreground">
              Última modificación por <span className="font-medium">{modoMigracionInfo.updated_by}</span>
              {modoMigracionInfo.updated_at && ` el ${new Date(modoMigracionInfo.updated_at).toLocaleString('es-PE', { timeZone: 'America/Lima' })}`}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
