export type SpecialtyKey =
  | 'PSICOLOGIA'
  | 'NUTRICAO'
  | 'NUTROLOGIA'
  | 'PSIQUIATRIA'
  | 'CLINICO_GERAL'

export const SPECIALTY_LABELS: Record<SpecialtyKey, string> = {
  PSICOLOGIA:    'Psicologia',
  NUTRICAO:      'Nutrição',
  NUTROLOGIA:    'Nutrologia',
  PSIQUIATRIA:   'Psiquiatria',
  CLINICO_GERAL: 'Clínico Geral',
}

export function getSpecialtyKey(specialty?: string | null): SpecialtyKey {
  const s = (specialty ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
  if (s.includes('psicolog'))  return 'PSICOLOGIA'
  if (s.includes('nutrol'))    return 'NUTROLOGIA'
  if (s.includes('nutri'))     return 'NUTRICAO'
  if (s.includes('psiquiat'))  return 'PSIQUIATRIA'
  return 'CLINICO_GERAL'
}

type SpecialtyDataMap = Record<string, string | number | undefined | null>

function parts(...items: unknown[]): string {
  return (items.filter(Boolean) as string[]).join(' | ')
}

export function generateContent(key: SpecialtyKey, data: SpecialtyDataMap): string {
  const lines: string[] = []

  if (key === 'PSICOLOGIA') {
    const header = parts(
      data.tipoSessao && `Tipo: ${data.tipoSessao}`,
      data.abordagem  && `Abordagem: ${data.abordagem}`,
    )
    if (header) lines.push(header)
    if (data.objetivo) lines.push(`Objetivo: ${data.objetivo}`)
    if (data.risco && data.risco !== 'Sem risco') lines.push(`⚠️ Risco: ${data.risco}`)
    if (data.sinteseClinica) lines.push(`\nSíntese clínica:\n${data.sinteseClinica}`)
    if (data.instrumentos) lines.push(`\nInstrumentos: ${data.instrumentos}`)
    if (data.encaminhamentos) lines.push(`Encaminhamentos: ${data.encaminhamentos}`)
    if (data.planoProximaSessao) lines.push(`Plano próxima sessão: ${data.planoProximaSessao}`)
  }

  if (key === 'NUTRICAO') {
    const medidas = parts(
      data.peso    && `Peso: ${data.peso}kg`,
      data.altura  && `Altura: ${data.altura}cm`,
      data.imc     && `IMC: ${data.imc}`,
      data.cintura && `Cintura: ${data.cintura}cm`,
    )
    if (medidas) lines.push(medidas)
    if (data.objetivo) lines.push(`Objetivo: ${data.objetivo}`)
    if (data.diagnosticoNutricional) lines.push(`Diagnóstico: ${data.diagnosticoNutricional}`)
    if (data.prescricaoDietetica) lines.push(`\nPrescrição dietética:\n${data.prescricaoDietetica}`)
    if (data.adesao !== undefined && data.adesao !== null && data.adesao !== '')
      lines.push(`Adesão ao plano: ${data.adesao}/10`)
    if (data.metas) lines.push(`Metas: ${data.metas}`)
  }

  if (key === 'NUTROLOGIA') {
    const medidas = parts(
      data.peso    && `Peso: ${data.peso}kg`,
      data.imc     && `IMC: ${data.imc}`,
      data.cintura && `Cintura: ${data.cintura}cm`,
    )
    if (medidas) lines.push(medidas)
    if (data.cid) lines.push(`CID: ${data.cid}`)
    if (data.riscoCardiometabolico) lines.push(`Risco cardiometabólico: ${data.riscoCardiometabolico}`)
    if (data.deficiencias) lines.push(`Deficiências nutricionais: ${data.deficiencias}`)
    if (data.conduta) lines.push(`\nConduta:\n${data.conduta}`)
    if (data.encaminhamentos) lines.push(`Encaminhamentos: ${data.encaminhamentos}`)
  }

  if (key === 'PSIQUIATRIA') {
    const emc = parts(
      data.emcAparencia  && `Aparência: ${data.emcAparencia}`,
      data.emcHumor      && `Humor: ${data.emcHumor}`,
      data.emcPensamento && `Pensamento: ${data.emcPensamento}`,
      data.emcPercepcao  && `Percepção: ${data.emcPercepcao}`,
    )
    if (emc) lines.push(`Exame do Estado Mental — ${emc}`)
    if (data.riscoSuicidio && data.riscoSuicidio !== 'Sem risco')
      lines.push(`⚠️ Risco suicida: ${data.riscoSuicidio}`)
    if (data.medicamentos) lines.push(`Medicamentos: ${data.medicamentos}`)
    if (data.cid) lines.push(`CID: ${data.cid}`)
    if (data.conduta) lines.push(`\nConduta:\n${data.conduta}`)
    if (data.planoSeguranca) lines.push(`Plano de segurança: ${data.planoSeguranca}`)
  }

  if (key === 'CLINICO_GERAL') {
    if (data.subjetivo) lines.push(`S: ${data.subjetivo}`)
    if (data.objetivo)  lines.push(`O: ${data.objetivo}`)
    if (data.avaliacao) lines.push(`A: ${data.avaliacao}`)
    if (data.plano)     lines.push(`P: ${data.plano}`)
    if (data.cid)       lines.push(`CID: ${data.cid}`)
  }

  return lines.join('\n') || 'Registro clínico'
}

export function imcClassificacao(imc: number): string {
  if (imc < 18.5)  return 'Abaixo do peso'
  if (imc < 25.0)  return 'Peso normal'
  if (imc < 30.0)  return 'Sobrepeso'
  if (imc < 35.0)  return 'Obesidade Grau I'
  if (imc < 40.0)  return 'Obesidade Grau II'
  return 'Obesidade Grau III'
}
