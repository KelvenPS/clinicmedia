import type { SpecialtyKey } from './specialtyUtils'

interface Props {
  specialtyType: string
  data: Record<string, unknown>
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1 mb-2 mt-3 first:mt-0">
      {children}
    </p>
  )
}

function F({ label, value }: { label: string; value: unknown }) {
  const v = value as string | number | undefined | null
  if (!v && v !== 0) return null
  return (
    <div>
      <p className="text-xs text-slate-400 font-medium mb-0.5">{label}</p>
      <p className="text-sm text-slate-800">{String(v)}</p>
    </div>
  )
}

function FBlock({ label, value }: { label: string; value: unknown }) {
  const v = value as string | undefined | null
  if (!v) return null
  return (
    <div>
      <p className="text-xs text-slate-400 font-medium mb-0.5">{label}</p>
      <p className="text-sm text-slate-800 whitespace-pre-wrap bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 leading-relaxed">
        {v}
      </p>
    </div>
  )
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-6 gap-y-3">{children}</div>
}

function RiscoBadge({ level }: { level: string }) {
  if (!level || level === 'Sem risco') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        Sem risco identificado
      </span>
    )
  }
  const config: Record<string, string> = {
    Baixo:    'bg-yellow-50 text-yellow-700 border-yellow-200',
    Moderado: 'bg-orange-50 text-orange-700 border-orange-200',
    Alto:     'bg-red-50 text-red-700 border-red-200',
  }
  const cls = config[level] ?? 'bg-slate-50 text-slate-700 border-slate-200'
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${cls}`}>
      {(level === 'Alto' || level === 'Moderado') && '⚠️ '}
      {level}
    </span>
  )
}

// ─── Psicologia ───────────────────────────────────────────────────────────────

function PsicologiaView({ d }: { d: Record<string, unknown> }) {
  return (
    <div className="space-y-3">
      <Grid2>
        <F label="Tipo de Sessão"      value={d.tipoSessao} />
        <F label="Abordagem"           value={d.abordagem} />
        <F label="Objetivo da Sessão"  value={d.objetivo} />
        <div>
          <p className="text-xs text-slate-400 font-medium mb-1">Nível de Risco</p>
          <RiscoBadge level={String(d.risco ?? 'Sem risco')} />
        </div>
      </Grid2>

      <FBlock label="Síntese Clínica" value={d.sinteseClinica as string} />

      {!!(d.instrumentos || d.planoProximaSessao || d.encaminhamentos) && (
        <>
          <SectionTitle>Complementar</SectionTitle>
          <Grid2>
            <F label="Instrumentos Aplicados"   value={d.instrumentos} />
            <F label="Plano Próxima Sessão"     value={d.planoProximaSessao} />
          </Grid2>
          <F label="Encaminhamentos" value={d.encaminhamentos} />
        </>
      )}
    </div>
  )
}

// ─── Nutrição ─────────────────────────────────────────────────────────────────

function NutricaoView({ d }: { d: Record<string, unknown> }) {
  return (
    <div className="space-y-3">
      {!!(d.peso || d.altura || d.imc || d.cintura) && (
        <>
          <SectionTitle>Medidas Antropométricas</SectionTitle>
          <Grid2>
            <F label="Peso"         value={d.peso    ? `${d.peso} kg`    : null} />
            <F label="Altura"       value={d.altura  ? `${d.altura} cm`  : null} />
            <F label="IMC"          value={d.imc} />
            <F label="Cintura"      value={d.cintura ? `${d.cintura} cm` : null} />
          </Grid2>
        </>
      )}

      <Grid2>
        <F label="Objetivo"               value={d.objetivo} />
        <F label="Diagnóstico Nutricional" value={d.diagnosticoNutricional} />
        <F label="Intolerâncias / Alergias" value={d.intolerancias} />
        <F label={`Adesão ao Plano`}      value={d.adesao ? `${d.adesao}/10` : null} />
      </Grid2>

      <FBlock label="Recordatório 24h"    value={d.recordatorio24h as string} />
      <FBlock label="Prescrição Dietética" value={d.prescricaoDietetica as string} />
      <F label="Metas"                    value={d.metas} />
    </div>
  )
}

// ─── Nutrologia ───────────────────────────────────────────────────────────────

function NutrologiaView({ d }: { d: Record<string, unknown> }) {
  return (
    <div className="space-y-3">
      {!!(d.peso || d.imc || d.cintura) && (
        <>
          <SectionTitle>Medidas Antropométricas</SectionTitle>
          <Grid2>
            <F label="Peso"   value={d.peso    ? `${d.peso} kg`    : null} />
            <F label="IMC"    value={d.imc} />
            <F label="Cintura" value={d.cintura ? `${d.cintura} cm` : null} />
            <div>
              <p className="text-xs text-slate-400 font-medium mb-1">Risco Cardiometabólico</p>
              <RiscoBadge level={String(d.riscoCardiometabolico ?? 'Baixo')} />
            </div>
          </Grid2>
        </>
      )}

      <Grid2>
        <F label="Diagnóstico (CID-10)"       value={d.cid} />
        <F label="Deficiências Nutricionais"   value={d.deficiencias} />
      </Grid2>

      <FBlock label="Exames Laboratoriais"    value={d.examesLab as string} />
      <FBlock label="Conduta / Prescrição"    value={d.conduta as string} />
      <F label="Encaminhamentos"              value={d.encaminhamentos} />
    </div>
  )
}

// ─── Psiquiatria ──────────────────────────────────────────────────────────────

function PsiquiatriaView({ d }: { d: Record<string, unknown> }) {
  return (
    <div className="space-y-3">
      {!!(d.emcAparencia || d.emcHumor || d.emcPensamento || d.emcPercepcao) && (
        <>
          <SectionTitle>Exame do Estado Mental</SectionTitle>
          <Grid2>
            <F label="Aparência / Atitude"    value={d.emcAparencia} />
            <F label="Humor / Afeto"          value={d.emcHumor} />
            <F label="Pensamento / Linguagem" value={d.emcPensamento} />
            <F label="Percepção"              value={d.emcPercepcao} />
          </Grid2>
        </>
      )}

      <Grid2>
        <div>
          <p className="text-xs text-slate-400 font-medium mb-1">Risco Suicida</p>
          <RiscoBadge level={String(d.riscoSuicidio ?? 'Sem risco')} />
        </div>
        <F label="Diagnóstico (CID-10)" value={d.cid} />
      </Grid2>

      {!!(d.phq9 || d.gad7) && (
        <>
          <SectionTitle>Escalas</SectionTitle>
          <Grid2>
            <F label="PHQ-9 (Depressão)" value={d.phq9} />
            <F label="GAD-7 (Ansiedade)" value={d.gad7} />
          </Grid2>
        </>
      )}

      <F label="Uso de Substâncias"       value={d.substancias} />
      <FBlock label="Medicamentos / Resposta Terapêutica" value={d.medicamentos as string} />
      <FBlock label="Conduta"             value={d.conduta as string} />
      <FBlock label="Plano de Segurança"  value={d.planoSeguranca as string} />
    </div>
  )
}

// ─── SOAP ─────────────────────────────────────────────────────────────────────

function SoapView({ d }: { d: Record<string, unknown> }) {
  return (
    <div className="space-y-3">
      <F label="Diagnóstico (CID-10)"    value={d.cid} />
      <FBlock label="S — Subjetivo"      value={d.subjetivo as string} />
      <FBlock label="O — Objetivo"       value={d.objetivo as string} />
      <FBlock label="A — Avaliação"      value={d.avaliacao as string} />
      <FBlock label="P — Plano"          value={d.plano as string} />
    </div>
  )
}

// ─── Public export ────────────────────────────────────────────────────────────

export function SpecialtyRecordView({ specialtyType, data }: Props) {
  const key = specialtyType as SpecialtyKey
  if (key === 'PSICOLOGIA')    return <PsicologiaView  d={data} />
  if (key === 'NUTRICAO')      return <NutricaoView    d={data} />
  if (key === 'NUTROLOGIA')    return <NutrologiaView  d={data} />
  if (key === 'PSIQUIATRIA')   return <PsiquiatriaView d={data} />
  if (key === 'CLINICO_GERAL') return <SoapView        d={data} />
  return null
}
