import { prisma } from '../prisma'
import type { SystemAction } from './types'

// A ação não manda mensagem ao paciente — ela só registra a pendência pra
// secretaria (Notification), que decide o que fazer manualmente. O bloco de
// "Mensagem de sucesso" no Construtor é quem avisa o paciente.
export const requestDocuments: SystemAction = {
  key: 'request_documents',
  name: 'Solicitar documentos',
  description: 'Registra uma pendência de documentos do paciente para a secretaria acompanhar.',
  implemented: true,
  inputs: [
    { key: 'nome', label: 'Nome do paciente', required: true },
    { key: 'telefone', label: 'Telefone', required: true },
    { key: 'documentos', label: 'Documentos solicitados', required: true },
  ],
  outputs: [{ key: 'solicitacaoRegistrada', label: 'Solicitação registrada?', required: true }],
  async execute(ctx, input) {
    await prisma.notification.create({
      data: {
        userId: ctx.doctorId,
        title: 'Documentos solicitados via chatbot',
        message: `${input.nome ?? 'Paciente'} (${input.telefone ?? 's/ telefone'}) precisa enviar: ${input.documentos ?? 'documentos não especificados'}`,
        type: 'INFO',
      },
    })
    return { success: true, data: { solicitacaoRegistrada: true } }
  },
}
