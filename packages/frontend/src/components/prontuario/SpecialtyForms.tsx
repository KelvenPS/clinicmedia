import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { format } from 'date-fns'
import type { Patient, User as UserType } from '../../types'
import type { SpecialtyKey } from './specialtyUtils'
import { generateContent, imcClassificacao } from './specialtyUtils'

export interface SpecialtySubmitData {
  patientId: string
  doctorId: string
  type: string
  title: string
  content: string
  date: string
  specialtyData: Record<string, unknown>
  specialtyType: string
}

interface BaseFormProps {
  patientId: string
  doctorId: string
  onSubmit: (data: SpecialtySubmitData) => void
  loading: boolean
}

const today = () => format(new Date(), 'yyyy-MM-dd')

// ─── Shared small components ─────────────────────────────────────────────────

function FormRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-4">{children}</div>
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}

function SubmitBtn({ loading, label }: { loading: boolean; label: string }) {
  return (
    <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
      {loading ? (
        <span className="flex items-center gap-2 justify-center">
          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          Salvando...
        </span>
      ) : label}
    </button>
  )
}

// ─── Psicologia ───────────────────────────────────────────────────────────────

type PsicoFields = {
  titulo: string
  tipo: string
  data: string
  tipoSessao: string
  abordagem: string
  objetivo: string
  sinteseClinica: string
  risco: string
  instrumentos: string
  encaminhamentos: string
  planoProximaSessao: string
}

function PsicologiaForm({ patientId, doctorId, onSubmit, loading }: BaseFormProps) {
  const { register, handleSubmit, formState: { errors } } = useForm<PsicoFields>({
    defaultValues: {
      titulo: 'Sessão terapêutica',
      tipo: 'EVOLUCAO',
      data: today(),
      tipoSessao: 'Psicoterapia',
      abordagem: '',
      objetivo: '',
      sinteseClinica: '',
      risco: 'Sem risco',
      instrumentos: '',
      encaminhamentos: '',
      planoProximaSessao: '',
    },
  })

  const submit = (fields: PsicoFields) => {
    const specialtyData = {
      tipoSessao: fields.tipoSessao,
      abordagem: fields.abordagem,
      objetivo: fields.objetivo,
      sinteseClinica: fields.sinteseClinica,
      risco: fields.risco,
      instrumentos: fields.instrumentos,
      encaminhamentos: fields.encaminhamentos,
      planoProximaSessao: fields.planoProximaSessao,
    }
    onSubmit({
      patientId, doctorId,
      type: fields.tipo,
      title: fields.titulo,
      content: generateContent('PSICOLOGIA', specialtyData),
      date: fields.data,
      specialtyData,
      specialtyType: 'PSICOLOGIA',
    })
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      <FormRow>
        <Field label="Título do Registro *" error={errors.titulo?.message}>
          <input {...register('titulo', { required: 'Obrigatório' })} className="input-field" />
        </Field>
        <Field label="Data">
          <input {...register('data')} type="date" className="input-field" />
        </Field>
      </FormRow>

      <FormRow>
        <Field label="Tipo de Registro">
          <select {...register('tipo')} className="input-field">
            <option value="ANAMNESE">Anamnese</option>
            <option value="EVOLUCAO">Evolução / Sessão</option>
            <option value="OUTROS">Outros</option>
          </select>
        </Field>
        <Field label="Tipo de Sessão">
          <select {...register('tipoSessao')} className="input-field">
            <option>Psicoterapia</option>
            <option>Avaliação Psicológica</option>
            <option>Orientação Parental</option>
            <option>Terapia de Casal</option>
            <option>Terapia de Grupo</option>
            <option>Neuropsicológica</option>
            <option>Outro</option>
          </select>
        </Field>
      </FormRow>

      <FormRow>
        <Field label="Abordagem Terapêutica">
          <select {...register('abordagem')} className="input-field">
            <option value="">— Selecione —</option>
            <option>TCC — Terapia Cognitivo-Comportamental</option>
            <option>Psicanálise</option>
            <option>Humanista / Centrada na Pessoa</option>
            <option>Sistêmica</option>
            <option>ABA — Análise do Comportamento</option>
            <option>Neuropsicologia</option>
            <option>Gestalt</option>
            <option>EMDR</option>
            <option>Outra</option>
          </select>
        </Field>
        <Field label="Nível de Risco">
          <select {...register('risco')} className="input-field">
            <option>Sem risco</option>
            <option>Baixo</option>
            <option>Moderado</option>
            <option>Alto</option>
          </select>
        </Field>
      </FormRow>

      <Field label="Objetivo da Sessão">
        <input {...register('objetivo')} className="input-field" placeholder="Foco trabalhado nesta sessão..." />
      </Field>

      <Field label="Síntese Clínica *" error={errors.sinteseClinica?.message}>
        <p className="text-xs text-slate-400 mb-1">Registro técnico restrito — conteúdo da sessão</p>
        <textarea
          {...register('sinteseClinica', { required: 'Síntese obrigatória', minLength: { value: 10, message: 'Mínimo 10 caracteres' } })}
          rows={5}
          className="input-field resize-none"
          placeholder="Síntese técnica: temas abordados, intervenções, observações clínicas, dinâmica da sessão..."
        />
      </Field>

      <FormRow>
        <Field label="Instrumentos Aplicados">
          <input {...register('instrumentos')} className="input-field" placeholder="BDI-II, BAI, WISC-V..." />
        </Field>
        <Field label="Plano Próxima Sessão">
          <input {...register('planoProximaSessao')} className="input-field" placeholder="Foco previsto..." />
        </Field>
      </FormRow>

      <Field label="Encaminhamentos">
        <input {...register('encaminhamentos')} className="input-field" placeholder="Psiquiatria, escola, CAPS, CRAS..." />
      </Field>

      <SubmitBtn loading={loading} label="Registrar Sessão" />
    </form>
  )
}

// ─── Nutrição ─────────────────────────────────────────────────────────────────

type NutricaoFields = {
  titulo: string
  tipo: string
  data: string
  peso: number
  altura: number
  cintura: number
  objetivo: string
  recordatorio24h: string
  intolerancias: string
  diagnosticoNutricional: string
  prescricaoDietetica: string
  adesao: number
  metas: string
}

function NutricaoForm({ patientId, doctorId, onSubmit, loading }: BaseFormProps) {
  const { register, handleSubmit, watch, formState: { errors } } = useForm<NutricaoFields>({
    defaultValues: {
      titulo: 'Consulta nutricional',
      tipo: 'EVOLUCAO',
      data: today(),
      adesao: 7,
    },
  })

  const peso = watch('peso')
  const altura = watch('altura')
  const imc = peso > 0 && altura > 0
    ? (peso / Math.pow(altura / 100, 2)).toFixed(1)
    : ''
  const imcClass = imc ? imcClassificacao(parseFloat(imc)) : ''

  const submit = (fields: NutricaoFields) => {
    const specialtyData = {
      peso:    fields.peso    ? String(fields.peso)    : '',
      altura:  fields.altura  ? String(fields.altura)  : '',
      imc:     imc ? `${imc} (${imcClass})` : '',
      cintura: fields.cintura ? String(fields.cintura) : '',
      objetivo: fields.objetivo,
      recordatorio24h: fields.recordatorio24h,
      intolerancias: fields.intolerancias,
      diagnosticoNutricional: fields.diagnosticoNutricional,
      prescricaoDietetica: fields.prescricaoDietetica,
      adesao: String(fields.adesao ?? ''),
      metas: fields.metas,
    }
    onSubmit({
      patientId, doctorId,
      type: fields.tipo,
      title: fields.titulo,
      content: generateContent('NUTRICAO', specialtyData),
      date: fields.data,
      specialtyData,
      specialtyType: 'NUTRICAO',
    })
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      <FormRow>
        <Field label="Título do Registro *" error={errors.titulo?.message}>
          <input {...register('titulo', { required: 'Obrigatório' })} className="input-field" />
        </Field>
        <Field label="Data">
          <input {...register('data')} type="date" className="input-field" />
        </Field>
      </FormRow>

      <Field label="Tipo de Registro">
        <select {...register('tipo')} className="input-field">
          <option value="ANAMNESE">Anamnese</option>
          <option value="EVOLUCAO">Retorno / Evolução</option>
          <option value="OUTROS">Outros</option>
        </select>
      </Field>

      {/* Medidas Antropométricas */}
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide pt-1">Medidas Antropométricas</p>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Peso (kg)">
          <input {...register('peso', { valueAsNumber: true })} type="number" step="0.1" min="0" className="input-field" placeholder="70.5" />
        </Field>
        <Field label="Altura (cm)">
          <input {...register('altura', { valueAsNumber: true })} type="number" step="1" min="0" className="input-field" placeholder="170" />
        </Field>
        <Field label="Cintura (cm)">
          <input {...register('cintura', { valueAsNumber: true })} type="number" step="0.5" min="0" className="input-field" placeholder="85" />
        </Field>
      </div>

      {imc && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2 flex items-center gap-3">
          <div className="text-center">
            <p className="text-xs text-emerald-600 font-semibold">IMC</p>
            <p className="text-xl font-bold text-emerald-700">{imc}</p>
          </div>
          <div className="text-sm text-emerald-800 font-medium">{imcClass}</div>
        </div>
      )}

      <Field label="Objetivo do Atendimento">
        <input {...register('objetivo')} className="input-field" placeholder="Emagrecimento, hipertrofia, controle glicêmico..." />
      </Field>

      <Field label="Recordatório 24h">
        <textarea
          {...register('recordatorio24h')}
          rows={3}
          className="input-field resize-none"
          placeholder="Café da manhã: ...\nAlmoço: ...\nJantar: ..."
        />
      </Field>

      <FormRow>
        <Field label="Intolerâncias / Alergias">
          <input {...register('intolerancias')} className="input-field" placeholder="Lactose, glúten..." />
        </Field>
        <Field label="Diagnóstico Nutricional">
          <input {...register('diagnosticoNutricional')} className="input-field" placeholder="Sobrepeso, DEP, deficiência de ferro..." />
        </Field>
      </FormRow>

      <Field label="Prescrição Dietética *" error={errors.prescricaoDietetica?.message}>
        <textarea
          {...register('prescricaoDietetica', { required: 'Obrigatório', minLength: { value: 10, message: 'Mínimo 10 caracteres' } })}
          rows={4}
          className="input-field resize-none"
          placeholder="Descreva a prescrição alimentar, porções, distribuição de macros, orientações..."
        />
      </Field>

      <Field label={`Adesão ao Plano Atual: ${watch('adesao') ?? 7}/10`}>
        <input {...register('adesao', { valueAsNumber: true })} type="range" min={0} max={10} step={1} className="w-full accent-emerald-600" />
        <div className="flex justify-between text-xs text-slate-400 mt-0.5">
          <span>0 — Sem adesão</span>
          <span>10 — Adesão total</span>
        </div>
      </Field>

      <Field label="Metas para Próxima Consulta">
        <input {...register('metas')} className="input-field" placeholder="Aumentar proteína, reduzir sódio, beber 2L de água..." />
      </Field>

      <SubmitBtn loading={loading} label="Registrar Consulta" />
    </form>
  )
}

// ─── Nutrologia ───────────────────────────────────────────────────────────────

type NutrologiaFields = {
  titulo: string
  tipo: string
  data: string
  peso: number
  altura: number
  cintura: number
  examesLab: string
  deficiencias: string
  riscoCardiometabolico: string
  cid: string
  prescricao: string
  encaminhamentos: string
  conduta: string
}

function NutrologiaForm({ patientId, doctorId, onSubmit, loading }: BaseFormProps) {
  const { register, handleSubmit, watch, formState: { errors } } = useForm<NutrologiaFields>({
    defaultValues: {
      titulo: 'Consulta de nutrologia',
      tipo: 'EVOLUCAO',
      data: today(),
      riscoCardiometabolico: 'Baixo',
    },
  })

  const peso = watch('peso')
  const altura = watch('altura')
  const imc = peso > 0 && altura > 0
    ? (peso / Math.pow(altura / 100, 2)).toFixed(1)
    : ''
  const imcClass = imc ? imcClassificacao(parseFloat(imc)) : ''

  const submit = (fields: NutrologiaFields) => {
    const specialtyData = {
      peso:    fields.peso    ? String(fields.peso)    : '',
      altura:  fields.altura  ? String(fields.altura)  : '',
      imc:     imc ? `${imc} (${imcClass})` : '',
      cintura: fields.cintura ? String(fields.cintura) : '',
      examesLab: fields.examesLab,
      deficiencias: fields.deficiencias,
      riscoCardiometabolico: fields.riscoCardiometabolico,
      cid: fields.cid,
      prescricao: fields.prescricao,
      encaminhamentos: fields.encaminhamentos,
      conduta: fields.conduta,
    }
    onSubmit({
      patientId, doctorId,
      type: fields.tipo,
      title: fields.titulo,
      content: generateContent('NUTROLOGIA', specialtyData),
      date: fields.data,
      specialtyData,
      specialtyType: 'NUTROLOGIA',
    })
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      <FormRow>
        <Field label="Título do Registro *" error={errors.titulo?.message}>
          <input {...register('titulo', { required: 'Obrigatório' })} className="input-field" />
        </Field>
        <Field label="Data">
          <input {...register('data')} type="date" className="input-field" />
        </Field>
      </FormRow>

      <Field label="Tipo de Registro">
        <select {...register('tipo')} className="input-field">
          <option value="ANAMNESE">Anamnese</option>
          <option value="EVOLUCAO">Evolução</option>
          <option value="EXAME">Análise de Exames</option>
          <option value="PRESCRICAO">Prescrição</option>
          <option value="OUTROS">Outros</option>
        </select>
      </Field>

      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide pt-1">Medidas Antropométricas</p>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Peso (kg)">
          <input {...register('peso', { valueAsNumber: true })} type="number" step="0.1" min="0" className="input-field" placeholder="70.5" />
        </Field>
        <Field label="Altura (cm)">
          <input {...register('altura', { valueAsNumber: true })} type="number" step="1" min="0" className="input-field" placeholder="170" />
        </Field>
        <Field label="Cintura (cm)">
          <input {...register('cintura', { valueAsNumber: true })} type="number" step="0.5" min="0" className="input-field" placeholder="85" />
        </Field>
      </div>

      {imc && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 flex items-center gap-3">
          <div className="text-center">
            <p className="text-xs text-blue-600 font-semibold">IMC</p>
            <p className="text-xl font-bold text-blue-700">{imc}</p>
          </div>
          <div className="text-sm text-blue-800 font-medium">{imcClass}</div>
        </div>
      )}

      <FormRow>
        <Field label="Diagnóstico (CID-10)">
          <input {...register('cid')} className="input-field" placeholder="E66.0, E43, E11..." />
        </Field>
        <Field label="Risco Cardiometabólico">
          <select {...register('riscoCardiometabolico')} className="input-field">
            <option>Baixo</option>
            <option>Moderado</option>
            <option>Alto</option>
            <option>Muito alto</option>
          </select>
        </Field>
      </FormRow>

      <Field label="Exames Laboratoriais Relevantes">
        <textarea
          {...register('examesLab')}
          rows={3}
          className="input-field resize-none"
          placeholder="Glicemia: 95, Colesterol Total: 180, HDL: 55, LDL: 110, Ferritina: 12..."
        />
      </Field>

      <Field label="Deficiências Nutricionais">
        <input {...register('deficiencias')} className="input-field" placeholder="Vitamina D, B12, Ferro, Zinco..." />
      </Field>

      <Field label="Conduta / Prescrição *" error={errors.conduta?.message}>
        <textarea
          {...register('conduta', { required: 'Obrigatório', minLength: { value: 10, message: 'Mínimo 10 caracteres' } })}
          rows={4}
          className="input-field resize-none"
          placeholder="Conduta médica, suplementação, orientações gerais, próximos passos..."
        />
      </Field>

      <Field label="Encaminhamentos">
        <input {...register('encaminhamentos')} className="input-field" placeholder="Cardiologista, endocrinologista, nutricionista..." />
      </Field>

      <SubmitBtn loading={loading} label="Registrar Consulta" />
    </form>
  )
}

// ─── Psiquiatria ──────────────────────────────────────────────────────────────

type PsiquiatriaFields = {
  titulo: string
  tipo: string
  data: string
  emcAparencia: string
  emcHumor: string
  emcPensamento: string
  emcPercepcao: string
  riscoSuicidio: string
  substancias: string
  medicamentos: string
  phq9: number
  gad7: number
  cid: string
  planoSeguranca: string
  conduta: string
}

function PsiquiatriaForm({ patientId, doctorId, onSubmit, loading }: BaseFormProps) {
  const { register, handleSubmit, watch, formState: { errors } } = useForm<PsiquiatriaFields>({
    defaultValues: {
      titulo: 'Consulta psiquiátrica',
      tipo: 'EVOLUCAO',
      data: today(),
      riscoSuicidio: 'Sem risco',
    },
  })

  const phq9Val = watch('phq9')
  const gad7Val = watch('gad7')

  const phq9Label = !phq9Val ? '' :
    phq9Val <= 4  ? 'Mínimo' :
    phq9Val <= 9  ? 'Leve' :
    phq9Val <= 14 ? 'Moderado' :
    phq9Val <= 19 ? 'Mod. Grave' : 'Grave'

  const gad7Label = !gad7Val ? '' :
    gad7Val <= 4  ? 'Mínimo' :
    gad7Val <= 9  ? 'Leve' :
    gad7Val <= 14 ? 'Moderado' : 'Grave'

  const submit = (fields: PsiquiatriaFields) => {
    const specialtyData = {
      emcAparencia:  fields.emcAparencia,
      emcHumor:      fields.emcHumor,
      emcPensamento: fields.emcPensamento,
      emcPercepcao:  fields.emcPercepcao,
      riscoSuicidio: fields.riscoSuicidio,
      substancias:   fields.substancias,
      medicamentos:  fields.medicamentos,
      phq9:  fields.phq9 ? `${fields.phq9} (${phq9Label})` : '',
      gad7:  fields.gad7 ? `${fields.gad7} (${gad7Label})` : '',
      cid:   fields.cid,
      planoSeguranca: fields.planoSeguranca,
      conduta: fields.conduta,
    }
    onSubmit({
      patientId, doctorId,
      type: fields.tipo,
      title: fields.titulo,
      content: generateContent('PSIQUIATRIA', specialtyData),
      date: fields.data,
      specialtyData,
      specialtyType: 'PSIQUIATRIA',
    })
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      <FormRow>
        <Field label="Título do Registro *" error={errors.titulo?.message}>
          <input {...register('titulo', { required: 'Obrigatório' })} className="input-field" />
        </Field>
        <Field label="Data">
          <input {...register('data')} type="date" className="input-field" />
        </Field>
      </FormRow>

      <FormRow>
        <Field label="Tipo de Registro">
          <select {...register('tipo')} className="input-field">
            <option value="ANAMNESE">Anamnese</option>
            <option value="EVOLUCAO">Evolução</option>
            <option value="PRESCRICAO">Prescrição</option>
            <option value="OUTROS">Outros</option>
          </select>
        </Field>
        <Field label="Risco Suicida">
          <select {...register('riscoSuicidio')} className="input-field">
            <option>Sem risco</option>
            <option>Baixo</option>
            <option>Moderado</option>
            <option>Alto</option>
          </select>
        </Field>
      </FormRow>

      {/* Exame do Estado Mental */}
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide pt-1">Exame do Estado Mental</p>
      <FormRow>
        <Field label="Aparência / Atitude">
          <input {...register('emcAparencia')} className="input-field" placeholder="Bem arrumado, agitado..." />
        </Field>
        <Field label="Humor / Afeto">
          <input {...register('emcHumor')} className="input-field" placeholder="Eutímico, deprimido, ansioso..." />
        </Field>
      </FormRow>
      <FormRow>
        <Field label="Pensamento / Linguagem">
          <input {...register('emcPensamento')} className="input-field" placeholder="Lógico, coerente, acelerado..." />
        </Field>
        <Field label="Percepção">
          <input {...register('emcPercepcao')} className="input-field" placeholder="Sem alterações, alucinações..." />
        </Field>
      </FormRow>

      {/* Escalas */}
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide pt-1">Escalas (opcional)</p>
      <FormRow>
        <Field label={`PHQ-9${phq9Val ? ` — ${phq9Val} pts: ${phq9Label}` : ' (0–27)'}`}>
          <input {...register('phq9', { valueAsNumber: true })} type="number" min={0} max={27} className="input-field" placeholder="Score" />
        </Field>
        <Field label={`GAD-7${gad7Val ? ` — ${gad7Val} pts: ${gad7Label}` : ' (0–21)'}`}>
          <input {...register('gad7', { valueAsNumber: true })} type="number" min={0} max={21} className="input-field" placeholder="Score" />
        </Field>
      </FormRow>

      <FormRow>
        <Field label="Uso de Substâncias">
          <input {...register('substancias')} className="input-field" placeholder="Álcool, tabaco, drogas ilícitas..." />
        </Field>
        <Field label="Diagnóstico (CID-10)">
          <input {...register('cid')} className="input-field" placeholder="F32.1, F41.1, F20..." />
        </Field>
      </FormRow>

      <Field label="Medicamentos Atuais / Resposta Terapêutica">
        <textarea
          {...register('medicamentos')}
          rows={3}
          className="input-field resize-none"
          placeholder="Sertralina 100mg/dia — boa tolerância, melhora parcial do humor..."
        />
      </Field>

      <Field label="Conduta *" error={errors.conduta?.message}>
        <textarea
          {...register('conduta', { required: 'Obrigatório', minLength: { value: 10, message: 'Mínimo 10 caracteres' } })}
          rows={4}
          className="input-field resize-none"
          placeholder="Manter esquema atual, ajustar dose, iniciar novo medicamento, orientações..."
        />
      </Field>

      <Field label="Plano de Segurança">
        <textarea
          {...register('planoSeguranca')}
          rows={2}
          className="input-field resize-none"
          placeholder="Preencher apenas se há risco identificado — sinais de alerta, contatos de crise, internação..."
        />
      </Field>

      <SubmitBtn loading={loading} label="Registrar Consulta" />
    </form>
  )
}

// ─── SOAP — Clínico Geral / fallback ──────────────────────────────────────────

type SoapFields = {
  titulo: string
  tipo: string
  data: string
  subjetivo: string
  objetivo: string
  avaliacao: string
  plano: string
  cid: string
}

function SoapForm({ patientId, doctorId, onSubmit, loading }: BaseFormProps) {
  const { register, handleSubmit, formState: { errors } } = useForm<SoapFields>({
    defaultValues: {
      titulo: 'Consulta médica',
      tipo: 'EVOLUCAO',
      data: today(),
    },
  })

  const submit = (fields: SoapFields) => {
    const specialtyData = {
      subjetivo: fields.subjetivo,
      objetivo:  fields.objetivo,
      avaliacao: fields.avaliacao,
      plano:     fields.plano,
      cid:       fields.cid,
    }
    onSubmit({
      patientId, doctorId,
      type: fields.tipo,
      title: fields.titulo,
      content: generateContent('CLINICO_GERAL', specialtyData),
      date: fields.data,
      specialtyData,
      specialtyType: 'CLINICO_GERAL',
    })
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      <FormRow>
        <Field label="Título do Registro *" error={errors.titulo?.message}>
          <input {...register('titulo', { required: 'Obrigatório' })} className="input-field" />
        </Field>
        <Field label="Data">
          <input {...register('data')} type="date" className="input-field" />
        </Field>
      </FormRow>

      <FormRow>
        <Field label="Tipo de Registro">
          <select {...register('tipo')} className="input-field">
            {['ANAMNESE','EVOLUCAO','PRESCRICAO','EXAME','ATESTADO','OUTROS'].map(t => (
              <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>
            ))}
          </select>
        </Field>
        <Field label="Diagnóstico (CID-10)">
          <input {...register('cid')} className="input-field" placeholder="J00, K59.0..." />
        </Field>
      </FormRow>

      <Field label="S — Subjetivo (queixa do paciente)">
        <textarea {...register('subjetivo')} rows={2} className="input-field resize-none"
          placeholder="O que o paciente relata: sintomas, queixas, histórico recente..." />
      </Field>

      <Field label="O — Objetivo (achados do exame)">
        <textarea {...register('objetivo')} rows={2} className="input-field resize-none"
          placeholder="Sinais vitais, exame físico, resultados laboratoriais..." />
      </Field>

      <Field label="A — Avaliação / Diagnóstico" error={errors.avaliacao?.message}>
        <textarea
          {...register('avaliacao', { required: 'Obrigatório', minLength: { value: 5, message: 'Mínimo 5 caracteres' } })}
          rows={2} className="input-field resize-none"
          placeholder="Hipótese ou diagnóstico, raciocínio clínico..." />
      </Field>

      <Field label="P — Plano / Conduta *" error={errors.plano?.message}>
        <textarea
          {...register('plano', { required: 'Obrigatório', minLength: { value: 5, message: 'Mínimo 5 caracteres' } })}
          rows={3} className="input-field resize-none"
          placeholder="Tratamento, medicamentos, encaminhamentos, retorno, orientações..." />
      </Field>

      <SubmitBtn loading={loading} label="Salvar Prontuário" />
    </form>
  )
}

// ─── Router ───────────────────────────────────────────────────────────────────

interface RouterProps {
  patients: Patient[]
  doctors: UserType[]
  currentUser: { id: string; role: string } | null
  defaultPatientId?: string
  specialtyKey: SpecialtyKey
  onSubmit: (data: SpecialtySubmitData) => void
  loading: boolean
}

export function SpecialtyFormRouter({
  patients,
  doctors,
  currentUser,
  defaultPatientId,
  specialtyKey,
  onSubmit,
  loading,
}: RouterProps) {
  const [patientId, setPatientId] = useState(defaultPatientId || '')
  const [doctorId, setDoctorId] = useState(
    currentUser?.role === 'DOCTOR' ? currentUser.id : ''
  )

  const baseProps: BaseFormProps = { patientId, doctorId, onSubmit, loading }
  const ready = patientId && doctorId

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Paciente *</label>
          <select
            value={patientId}
            onChange={e => setPatientId(e.target.value)}
            className="input-field"
          >
            <option value="">Selecione o paciente</option>
            {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Médico</label>
          <select
            value={doctorId}
            onChange={e => setDoctorId(e.target.value)}
            className="input-field"
            disabled={currentUser?.role === 'DOCTOR'}
          >
            <option value="">Selecione</option>
            {doctors.map(d => <option key={d.id} value={d.id}>Dr(a). {d.name}</option>)}
          </select>
        </div>
      </div>

      {ready ? (
        <div className="border-t border-slate-100 pt-4">
          {specialtyKey === 'PSICOLOGIA'    && <PsicologiaForm  {...baseProps} />}
          {specialtyKey === 'NUTRICAO'      && <NutricaoForm    {...baseProps} />}
          {specialtyKey === 'NUTROLOGIA'    && <NutrologiaForm  {...baseProps} />}
          {specialtyKey === 'PSIQUIATRIA'   && <PsiquiatriaForm {...baseProps} />}
          {specialtyKey === 'CLINICO_GERAL' && <SoapForm        {...baseProps} />}
        </div>
      ) : (
        <p className="text-sm text-slate-400 text-center py-4 border-t border-slate-100 mt-2">
          Selecione o paciente para exibir o formulário clínico
        </p>
      )}
    </div>
  )
}
