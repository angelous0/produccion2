import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
  ArrowLeft, RefreshCw, ShieldAlert, CheckCircle2, Loader2,
  ChevronDown, ChevronRight, ExternalLink, Package, Scissors,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STAGE_COLORS = {
  'Para Costura': 'bg-sky-100 text-sky-800 border-sky-200',
  'Costura': 'bg-sky-100 text-sky-800 border-sky-200',
  'Para Atraque': 'bg-violet-100 text-violet-800 border-violet-200',
  'Atraque': 'bg-violet-100 text-violet-800 border-violet-200',
  'Para Lavandería': 'bg-blue-100 text-blue-800 border-blue-200',
  'Lavandería': 'bg-blue-100 text-blue-800 border-blue-200',
  'Muestra Lavanderia': 'bg-blue-100 text-blue-800 border-blue-200',
  'Para Acabado': 'bg-amber-100 text-amber-800 border-amber-200',
  'Acabado': 'bg-orange-100 text-orange-800 border-orange-200',
  'Almacén PT': 'bg-red-100 text-red-800 border-red-200',
};

const MP_ITEMS = ['tocuyo', 'tela principal', 'Cierre', 'Tallas', 'Botón', 'Remache x2',
  'Hangtag Bolsillero', 'Hangtag Pretinero', 'Hangtag Entalle', 'Colgante', 'Adhesivo por talla'];

function isMaterial(faltante) {
  return MP_ITEMS.some(mp => faltante.toLowerCase().includes(mp.toLowerCase()));
}

function FaltanteChip({ label }) {
  const isMat = isMaterial(label);
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium
      ${isMat ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
      {isMat ? <Package className="h-3 w-3" /> : <Scissors className="h-3 w-3" />}
      {label}
    </span>
  );
}

function GrupoCard({ grupo, onNavigate }) {
  const [expanded, setExpanded] = useState(true);
  const colorCls = STAGE_COLORS[grupo.estado] || 'bg-gray-100 text-gray-800 border-gray-200';

  return (
    <Card>
      <CardHeader
        className="pb-3 cursor-pointer select-none"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            <CardTitle className="text-base">{grupo.estado}</CardTitle>
            <Badge variant="outline" className={`text-xs ${colorCls}`}>
              {grupo.total} registro{grupo.total !== 1 ? 's' : ''}
            </Badge>
          </div>
          <ShieldAlert className="h-4 w-4 text-destructive" />
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-2">
          {grupo.registros.map(reg => (
            <div
              key={reg.id}
              className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{reg.n_corte || reg.id}</span>
                  {reg.modelo && (
                    <span className="text-xs text-muted-foreground truncate">{reg.modelo}</span>
                  )}
                  {reg.total_prendas > 0 && (
                    <span className="text-xs text-muted-foreground">{reg.total_prendas} prendas</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {reg.faltantes.map(f => <FaltanteChip key={f} label={f} />)}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => onNavigate(reg.id)}
                title="Ver registro"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}

export function ValidacionRegistros() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/reportes-produccion/validacion-registros`);
      setData(res.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const grupos = data?.grupos || [];
  const totalFaltantes = data?.total_con_faltantes ?? 0;
  const totalRevisados = data?.total_revisados ?? 0;
  const totalOk = totalRevisados - totalFaltantes;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Validación de Registros</h2>
          <p className="text-muted-foreground text-sm">
            Pantalones, Shorts y Casacas — MP y servicios requeridos por etapa
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver
          </Button>
          <Button variant="outline" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-muted">
              <Package className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Revisados</p>
              <p className="text-xl font-bold">{totalRevisados}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={totalFaltantes > 0 ? 'border-red-200 bg-red-50/30' : ''}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${totalFaltantes > 0 ? 'bg-red-100' : 'bg-muted'}`}>
              <ShieldAlert className={`h-4 w-4 ${totalFaltantes > 0 ? 'text-red-600' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Con faltantes</p>
              <p className={`text-xl font-bold ${totalFaltantes > 0 ? 'text-red-700' : ''}`}>{totalFaltantes}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={totalOk > 0 ? 'border-green-200 bg-green-50/30' : ''}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${totalOk > 0 ? 'bg-green-100' : 'bg-muted'}`}>
              <CheckCircle2 className={`h-4 w-4 ${totalOk > 0 ? 'text-green-600' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Completos</p>
              <p className={`text-xl font-bold ${totalOk > 0 ? 'text-green-700' : ''}`}>{totalOk}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Leyenda */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1">
          <Package className="h-3.5 w-3.5 text-amber-600" />
          <span className="text-amber-700 font-medium">Ámbar</span> = materia prima faltante
        </span>
        <span className="flex items-center gap-1">
          <Scissors className="h-3.5 w-3.5 text-red-600" />
          <span className="text-red-700 font-medium">Rojo</span> = servicio faltante
        </span>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-12 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Analizando registros...
          </CardContent>
        </Card>
      ) : grupos.length === 0 ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center justify-center gap-3 text-center">
            <CheckCircle2 className="h-10 w-10 text-green-500" />
            <p className="font-semibold text-green-700">Todo completo</p>
            <p className="text-sm text-muted-foreground">
              {totalRevisados > 0
                ? `Los ${totalRevisados} registros revisados tienen todos los MP y servicios requeridos.`
                : 'No hay registros activos de pantalones, shorts o casacas.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {grupos.map(g => (
            <GrupoCard
              key={g.estado}
              grupo={g}
              onNavigate={id => navigate(`/registros/editar/${id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default ValidacionRegistros;
