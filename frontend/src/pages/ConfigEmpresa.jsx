import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '../components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
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
  // Preview desactivación
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [confirmingDesactivar, setConfirmingDesactivar] = useState(false);

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
      toast.error(typeof err.response?.data?.detail === 'string' ? err.response?.data?.detail : 'Error al cambiar empresa');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleMigracion = async (checked) => {
    if (checked) {
      // Activar directamente
      setSavingMigracion(true);
      try {
        const res = await axios.put(`${API}/configuracion/modo-migracion`, { activo: true });
        setModoMigracion(res.data.activo);
        toast.success(res.data.message);
        const migRes = await axios.get(`${API}/configuracion/modo-migracion`);
        setModoMigracionInfo(migRes.data);
      } catch (err) {
        toast.error(typeof err.response?.data?.detail === 'string' ? err.response?.data?.detail : 'Error al activar modo carga inicial');
      } finally {
        setSavingMigracion(false);
      }
    } else {
      // Mostrar preview antes de desactivar
      setLoadingPreview(true);
      try {
        const res = await axios.get(`${API}/configuracion/modo-migracion/preview-desactivacion`);
        setPreviewData(res.data);
        setPreviewOpen(true);
      } catch (err) {
        toast.error('Error al obtener preview de desactivación');
      } finally {
        setLoadingPreview(false);
      }
    }
  };

  const handleConfirmarDesactivar = async () => {
    setConfirmingDesactivar(true);
    try {
      const res = await axios.post(`${API}/configuracion/modo-migracion/desactivar`);
      setModoMigracion(false);
      setPreviewOpen(false);
      toast.success(res.data.message);
      const migRes = await axios.get(`${API}/configuracion/modo-migracion`);
      setModoMigracionInfo(migRes.data);
    } catch (err) {
      toast.error(typeof err.response?.data?.detail === 'string' ? err.response?.data?.detail : 'Error al desactivar modo carga inicial');
    } finally {
      setConfirmingDesactivar(false);
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
      {/* Card Modo Carga Inicial */}
      <Card className={modoMigracion ? 'border-yellow-400 bg-yellow-50/50 dark:bg-yellow-950/20' : ''}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className={`h-5 w-5 ${modoMigracion ? 'text-yellow-600' : ''}`} />
            Carga Inicial de Datos
          </CardTitle>
          <CardDescription>
            Activa este modo antes de cargar registros históricos. Todas las salidas de inventario ocurridas durante el período activo se revertirán automáticamente al desactivarlo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label className="text-sm font-medium">Modo Carga Inicial</label>
              {modoMigracion ? (
                <p className="text-xs font-medium text-green-600 dark:text-green-400">
                  Activo desde {modoMigracionInfo?.activado_at
                    ? new Date(modoMigracionInfo.activado_at).toLocaleString('es-PE', { timeZone: 'America/Lima' })
                    : '—'}
                  {modoMigracionInfo?.activado_by && ` · por ${modoMigracionInfo.activado_by}`}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Inactivo. Activalo antes de empezar a cargar registros históricos.
                </p>
              )}
            </div>
            <Switch
              checked={modoMigracion}
              onCheckedChange={handleToggleMigracion}
              disabled={savingMigracion || loadingPreview}
            />
          </div>

          {modoMigracion && (
            <div className="rounded-md bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 px-3 py-2">
              <p className="text-xs text-yellow-800 dark:text-yellow-200 font-medium flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                Todas las salidas de inventario que ocurran serán revertidas al desactivar
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de confirmación de desactivación */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              Confirmar desactivación de modo carga inicial
            </DialogTitle>
            <DialogDescription>
              {previewData && (
                <>
                  Durante el período activo (desde{' '}
                  <strong>
                    {new Date(previewData.periodo_activo_desde).toLocaleString('es-PE', { timeZone: 'America/Lima' })}
                  </strong>
                  ) se generaron <strong>{previewData.total_salidas}</strong> salidas de inventario.
                  Al desactivar, todas esas salidas se revertirán automáticamente con ajustes de ingreso.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {previewData && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <Badge variant={previewData.total_items_afectados > 0 ? 'destructive' : 'secondary'}>
                  {previewData.total_items_afectados} item{previewData.total_items_afectados !== 1 ? 's' : ''} afectados
                </Badge>
                <Badge variant="outline">{previewData.total_salidas} salidas totales</Badge>
              </div>

              {previewData.items?.length > 0 ? (
                <div className="max-h-64 overflow-y-auto border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">Cantidad</TableHead>
                        <TableHead className="text-right">Salidas</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewData.items.map((item) => (
                        <TableRow key={item.item_id}>
                          <TableCell className="font-mono text-xs">{item.codigo}</TableCell>
                          <TableCell className="font-medium">{item.nombre}</TableCell>
                          <TableCell className="text-right font-mono">{Number(item.cantidad_total).toFixed(2)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{item.salidas_count}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No hay salidas de inventario pendientes de revertir.</p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)} disabled={confirmingDesactivar}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmarDesactivar}
              disabled={confirmingDesactivar}
            >
              {confirmingDesactivar ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Desactivando...</>
              ) : (
                'Confirmar y desactivar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
