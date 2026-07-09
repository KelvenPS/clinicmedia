// Fase 3, item 5 do plano: migração do legado (mensagens dentro de
// LightSystemActionConfig.config.messages) para blocos visíveis no
// Construtor. Não apaga nem desliga nada do motor legado — só oferece a
// opção de recriar a mesma mensagem como um bloco novo no rascunho do
// visual_builder.

import { prisma } from './prisma'
import { getOrCreateDraftVersion, nextOrderIndex } from './chatbot-block-templates'

export interface LegacyMessage {
  key: string // `${configId}:${field}`
  configId: string
  configName: string
  actionKey: string
  field: string
  text: string
  status: 'active' | 'migrated' | 'ignored'
}

export async function listLegacyMessages(chatbotId: string): Promise<LegacyMessage[]> {
  const instance = await prisma.whatsAppInstance.findUnique({ where: { chatbotId } })
  if (!instance) return []

  const configs = await prisma.lightSystemActionConfig.findMany({ where: { instanceId: instance.id } })
  const mappings = await prisma.legacyActionMapping.findMany({ where: { chatbotId } })
  const statusByKey = new Map(mappings.map(m => [m.legacyActionId, m.status as LegacyMessage['status']]))

  const results: LegacyMessage[] = []
  for (const cfg of configs) {
    const config = (cfg.config ?? {}) as any
    const messages: Record<string, string> = config.messages ?? {}
    for (const [field, text] of Object.entries(messages)) {
      if (!text) continue
      const key = `${cfg.id}:${field}`
      results.push({
        key,
        configId: cfg.id,
        configName: cfg.name,
        actionKey: cfg.actionKey,
        field,
        text: String(text),
        status: statusByKey.get(key) ?? 'active',
      })
    }
  }
  return results
}

// Mapeamento fixo de qual tipo de bloco cada mensagem legada conhecida vira.
// Campos sem mapeamento específico viram um bloco "message" simples — ainda
// assim ficam visíveis no Construtor, só sem pré-configuração de variável.
const FIELD_TO_BLOCK: Record<string, { type: string; buildConfig: (text: string) => any }> = {
  askName: { type: 'collect_data', buildConfig: (text) => ({ question: text, saveTo: 'nome', dataType: 'texto', validation: { required: true } }) },
  askCpf: { type: 'collect_data', buildConfig: (text) => ({ question: text, saveTo: 'cpf', dataType: 'cpf', validation: { required: true } }) },
  askPhoneText: { type: 'collect_data', buildConfig: (text) => ({ question: text, saveTo: 'telefone', dataType: 'telefone', validation: { required: true } }) },
  askDate: { type: 'collect_data', buildConfig: (text) => ({ question: text, saveTo: 'dataDesejada', dataType: 'texto', validation: { required: true } }) },
  askPlan: { type: 'menu_dynamic', buildConfig: (text) => ({ message: text, actionKey: 'list_services', optionsField: 'services', labelField: 'name', saveTo: 'servicoId', saveLabelTo: 'servicoNome' }) },
  askConfirm: { type: 'confirm_data', buildConfig: (text) => ({ message: text }) },
}

export async function convertLegacyMessage(chatbotId: string, key: string): Promise<{ blockId: string }> {
  const [configId, field] = key.split(':')
  const config = await prisma.lightSystemActionConfig.findUnique({ where: { id: configId } })
  if (!config) throw new Error('Configuração legada não encontrada')
  const messages = ((config.config ?? {}) as any).messages ?? {}
  const text = String(messages[field] ?? '')

  const mapping = FIELD_TO_BLOCK[field] ?? { type: 'message', buildConfig: (t: string) => ({ message: t }) }
  const version = await getOrCreateDraftVersion(chatbotId)
  const orderIndex = await nextOrderIndex(version.id)

  const block = await prisma.chatbotBlock.create({
    data: {
      versionId: version.id,
      chatbotId,
      type: mapping.type,
      name: `[Herdado] ${config.name} · ${field}`,
      orderIndex,
      config: mapping.buildConfig(text),
    },
  })

  // legacyActionId (key) não é a PK da tabela — sem @@unique nela, upsert()
  // não se aplica; resolvido com findFirst + create/update.
  const existingMapping = await prisma.legacyActionMapping.findFirst({ where: { chatbotId, legacyActionId: key } })
  if (existingMapping) {
    await prisma.legacyActionMapping.update({ where: { id: existingMapping.id }, data: { status: 'migrated' } })
  } else {
    await prisma.legacyActionMapping.create({ data: { chatbotId, legacyActionId: key, status: 'migrated' } })
  }

  return { blockId: block.id }
}
