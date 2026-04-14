import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import {
  Download, Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle,
  ArrowLeft, Loader2, FileUp, Check,
} from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

export default function ImportRegistros() {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [step, setStep] = useState(1); // 1=template, 2=validate, 3=result
  const [file, setFile] = useState(null);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [validation, setValidation] = useState(null);
  const [result, setResult] = useState(null);

  const downloadTemplate = async () => {
    try {
      const res = await axios.get(`${API}/registros/import-template`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'plantilla_importacion_registros.xlsx';
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('Plantilla descargada');
    } catch {
      toast.error('Error al descargar plantilla');
    }
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setValidation(null);
      setResult(null);
      setStep(2);
    }
  };

  const handleValidate = async () => {
    if (!file) return;
    setValidating(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await axios.post(`${API}/registros/import-validate`, formData);
      setValidation(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al validar archivo');
    } finally {
      setValidating(false);
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await axios.post(`${API}/registros/import-execute`, formData);
      setResult(res.data);
      setStep(3);
      toast.success(`${res.data.registros_creados} registros importados`);
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (typeof detail === 'object' && detail?.errors) {
        toast.error(`${detail.errors.length} errores de validación`);
        setValidation(prev => ({ ...prev, errors: detail.errors, valid: false }));
      } else {
        toast.error(detail || 'Error al importar');
      }
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setStep(1);
    setFile(null);
    setValidation(null);
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/registros')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Importar Registros desde Excel</h1>
            <p className="text-sm text-muted-foreground">Migración masiva de registros históricos</p>
          </div>
        </div>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-2 text-sm">
        {[
          { n: 1, label: 'Plantilla y archivo' },
          { n: 2, label: 'Validar datos' },
          { n: 3, label: 'Resultado' },
        ].map((s, i) => (
          <React.Fragment key={s.n}>
            {i > 0 && <div className="h-px w-8 bg-border" />}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
              step === s.n ? 'bg-primary text-primary-foreground' :
              step > s.n ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
              'bg-muted text-muted-foreground'
            }`}>
              {step > s.n ? <Check className="h-3 w-3" /> : <span>{s.n}</span>}
              <span className="hidden sm:inline">{s.label}</span>
            </div>
          </React.Fragment>
        ))}
      </div>

      {/* Step 1: Template & Upload */}
      {step <= 2 && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Download className="h-4 w-4" /> Paso 1: Descargar Plantilla
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Descarga la plantilla Excel con 3 pestañas: Registros, Movimientos y Tallas.
                La primera fila tiene datos de ejemplo.
              </p>
              <Button onClick={downloadTemplate} variant="outline" className="w-full">
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Descargar Plantilla Excel
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Upload className="h-4 w-4" /> Paso 2: Subir Excel
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Llena la plantilla con tus datos y súbela aquí para validar.
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="hidden"
              />
              <Button
                onClick={() => fileRef.current?.click()}
                variant={file ? 'secondary' : 'outline'}
                className="w-full"
              >
                <FileUp className="h-4 w-4 mr-2" />
                {file ? file.name : 'Seleccionar archivo...'}
              </Button>
              {file && !validation && (
                <Button onClick={handleValidate} disabled={validating} className="w-full">
                  {validating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                  {validating ? 'Validando...' : 'Validar Datos'}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Validation Results */}
      {validation && step === 2 && (
        <div className="space-y-4">
          {/* Summary */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                {validation.valid ? (
                  <><CheckCircle2 className="h-4 w-4 text-green-500" /> Validación exitosa</>
                ) : (
                  <><XCircle className="h-4 w-4 text-red-500" /> Errores encontrados</>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4 text-center">
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                  <div className="text-2xl font-bold text-blue-600">{validation.total_registros}</div>
                  <div className="text-xs text-muted-foreground">Registros</div>
                </div>
                <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20">
                  <div className="text-2xl font-bold text-purple-600">{validation.total_movimientos}</div>
                  <div className="text-xs text-muted-foreground">Movimientos</div>
                </div>
                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
                  <div className="text-2xl font-bold text-emerald-600">{validation.total_tallas}</div>
                  <div className="text-xs text-muted-foreground">Tallas</div>
                </div>
                <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-900/20">
                  <div className="text-2xl font-bold text-orange-600">{validation.total_materiales || 0}</div>
                  <div className="text-xs text-muted-foreground">Materiales</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Errors */}
          {validation.errors.length > 0 && (
            <Card className="border-red-200 dark:border-red-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-red-600 flex items-center gap-2">
                  <XCircle className="h-4 w-4" /> {validation.errors.length} Error{validation.errors.length !== 1 ? 'es' : ''}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-60 overflow-y-auto space-y-1">
                  {validation.errors.map((e, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs p-2 rounded bg-red-50 dark:bg-red-900/20">
                      <Badge variant="destructive" className="text-[10px] shrink-0">{e.sheet} fila {e.row}</Badge>
                      <span>{e.msg}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Warnings */}
          {validation.warnings?.length > 0 && (
            <Card className="border-amber-200 dark:border-amber-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-amber-600 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" /> {validation.warnings.length} Advertencia{validation.warnings.length !== 1 ? 's' : ''}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {validation.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs p-2 rounded bg-amber-50 dark:bg-amber-900/20">
                      <Badge variant="outline" className="text-[10px] shrink-0 border-amber-300">{w.sheet} fila {w.row}</Badge>
                      <span>{w.msg}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Preview table */}
          {validation.preview?.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Vista previa</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-80 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">N. Corte</TableHead>
                        <TableHead className="text-xs">Modelo</TableHead>
                        <TableHead className="text-xs">Marca</TableHead>
                        <TableHead className="text-xs">Tipo</TableHead>
                        <TableHead className="text-xs text-center">Estado</TableHead>
                        <TableHead className="text-xs text-right">Prendas</TableHead>
                        <TableHead className="text-xs text-right">Movs</TableHead>
                        <TableHead className="text-xs text-right">Tallas</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {validation.preview.map((p, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs font-mono font-medium">{p.n_corte}</TableCell>
                          <TableCell className="text-xs">{p.nombre_modelo || '—'}</TableCell>
                          <TableCell className="text-xs">{p.marca || '—'}</TableCell>
                          <TableCell className="text-xs">{p.tipo || '—'}</TableCell>
                          <TableCell className="text-xs text-center">
                            <Badge variant="outline" className="text-[10px]">{p.estado}</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-right font-mono">{p.prendas}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{p.movimientos}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{p.tallas}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={reset}>
              Cancelar
            </Button>
            {validation.valid && (
              <Button onClick={handleImport} disabled={importing}>
                {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                {importing ? 'Importando...' : `Importar ${validation.total_registros} registro${validation.total_registros !== 1 ? 's' : ''}`}
              </Button>
            )}
            {!validation.valid && (
              <Button variant="outline" onClick={() => { setValidation(null); setFile(null); if (fileRef.current) fileRef.current.value = ''; }}>
                Subir archivo corregido
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Step 3: Results */}
      {step === 3 && result && (
        <Card className="border-green-200 dark:border-green-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" /> Importación completada
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-4 gap-4 text-center">
              <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/20">
                <div className="text-3xl font-bold text-green-600">{result.registros_creados}</div>
                <div className="text-sm text-muted-foreground">Registros creados</div>
              </div>
              <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/20">
                <div className="text-3xl font-bold text-green-600">{result.movimientos_creados}</div>
                <div className="text-sm text-muted-foreground">Movimientos creados</div>
              </div>
              <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/20">
                <div className="text-3xl font-bold text-green-600">{result.tallas_creadas}</div>
                <div className="text-sm text-muted-foreground">Tallas asignadas</div>
              </div>
              <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/20">
                <div className="text-3xl font-bold text-green-600">{result.materiales_creados || 0}</div>
                <div className="text-sm text-muted-foreground">Materiales creados</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={() => navigate('/registros')}>
                Ver Registros
              </Button>
              <Button variant="outline" onClick={reset}>
                Importar más
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
