import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { 
  Database, 
  Download, 
  Upload, 
  RefreshCw, 
  AlertTriangle,
  CheckCircle,
  Loader2,
  HardDrive,
  FileJson,
  Shield
} from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const Backups = () => {
  const { isAdmin } = useAuth();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, type: null });
  const fileInputRef = useRef(null);

  const fetchInfo = async () => {
    try {
      const response = await axios.get(`${API}/backup/info`);
      setInfo(response.data);
    } catch (error) {
      toast.error('Error al cargar información');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInfo();
  }, []);

  const handleCreateBackup = async () => {
    setCreatingBackup(true);
    try {
      const response = await axios.get(`${API}/backup/create`, {
        responseType: 'blob'
      });
      
      // Descargar archivo
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const filename = `backup_${new Date().toISOString().slice(0,10).replace(/-/g,'')}.json`;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success('Backup creado y descargado exitosamente');
      setConfirmDialog({ open: false, type: null });
    } catch (error) {
      toast.error('Error al crear backup');
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleRestoreClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.name.endsWith('.json')) {
      toast.error('Por favor selecciona un archivo JSON');
      return;
    }
    
    setConfirmDialog({ open: true, type: 'restore', file });
  };

  const handleRestore = async () => {
    const file = confirmDialog.file;
    if (!file) return;
    
    setRestoring(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await axios.post(`${API}/backup/restore`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      toast.success(`Backup restaurado: ${response.data.restored_tables.length} tablas`);
      if (response.data.errors?.length > 0) {
        toast.warning(`${response.data.errors.length} errores durante la restauración`);
      }
      
      setConfirmDialog({ open: false, type: null });
      fetchInfo();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Error al restaurar backup');
    } finally {
      setRestoring(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const getTotalRecords = () => {
    if (!info?.tables) return 0;
    return info.tables.reduce((sum, t) => sum + (t.count || 0), 0);
  };

  if (!isAdmin()) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <Shield className="h-16 w-16 text-muted-foreground" />
        <p className="text-muted-foreground">Solo administradores pueden acceder a esta página</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="backups-page">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Database className="h-6 w-6" />
          Copias de Seguridad
        </h2>
        <p className="text-muted-foreground">
          Crea y restaura backups de la base de datos
        </p>
      </div>

      {/* Acciones principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5 text-green-500" />
              Crear Backup
            </CardTitle>
            <CardDescription>
              Descarga una copia completa de todos los datos
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => setConfirmDialog({ open: true, type: 'create' })}
              className="w-full"
              disabled={creatingBackup}
            >
              {creatingBackup ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creando...
                </>
              ) : (
                <>
                  <FileJson className="mr-2 h-4 w-4" />
                  Crear y Descargar Backup
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-blue-500" />
              Restaurar Backup
            </CardTitle>
            <CardDescription>
              Restaura datos desde un archivo de backup
            </CardDescription>
          </CardHeader>
          <CardContent>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept=".json"
              className="hidden"
            />
            <Button 
              onClick={handleRestoreClick}
              variant="outline"
              className="w-full"
              disabled={restoring}
            >
              {restoring ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Restaurando...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Seleccionar Archivo
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Información de tablas */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5" />
              Estado de la Base de Datos
            </CardTitle>
            <CardDescription>
              {getTotalRecords().toLocaleString()} registros totales en {info?.tables?.length || 0} tablas
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchInfo}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tabla</TableHead>
                  <TableHead className="text-right">Registros</TableHead>
                  <TableHead className="text-right">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {info?.tables?.map((table) => (
                  <TableRow key={table.name}>
                    <TableCell className="font-mono text-sm">
                      {table.name.replace('prod_', '')}
                    </TableCell>
                    <TableCell className="text-right">
                      {table.count?.toLocaleString() || 0}
                    </TableCell>
                    <TableCell className="text-right">
                      {table.error ? (
                        <Badge variant="destructive">Error</Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-green-100 text-green-700">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          OK
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog de confirmación */}
      <Dialog open={confirmDialog.open} onOpenChange={(open) => !creatingBackup && !restoring && setConfirmDialog({ open, type: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {confirmDialog.type === 'create' ? (
                <>
                  <Download className="h-5 w-5 text-green-500" />
                  Crear Backup
                </>
              ) : (
                <>
                  <AlertTriangle className="h-5 w-5 text-orange-500" />
                  Restaurar Backup
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {confirmDialog.type === 'create' ? (
                'Se creará un archivo JSON con todos los datos de la base de datos. Este proceso puede tomar unos segundos.'
              ) : (
                <>
                  <span className="text-destructive font-semibold">¡ADVERTENCIA!</span> Esta acción reemplazará TODOS los datos actuales con los del backup. 
                  Esta acción no se puede deshacer.
                  <br /><br />
                  <span className="font-medium">Archivo: {confirmDialog.file?.name}</span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setConfirmDialog({ open: false, type: null })}
              disabled={creatingBackup || restoring}
            >
              Cancelar
            </Button>
            {confirmDialog.type === 'create' ? (
              <Button onClick={handleCreateBackup} disabled={creatingBackup}>
                {creatingBackup ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creando...
                  </>
                ) : (
                  'Crear Backup'
                )}
              </Button>
            ) : (
              <Button onClick={handleRestore} variant="destructive" disabled={restoring}>
                {restoring ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Restaurando...
                  </>
                ) : (
                  'Sí, Restaurar'
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
