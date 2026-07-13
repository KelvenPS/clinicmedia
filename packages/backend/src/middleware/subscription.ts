import { Response, NextFunction } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from './auth'
import { getEffectiveDoctorId } from '../lib/secretaryAccess'
import { calculateClinicAccess } from '../lib/subscription-access'
import { SUBSCRIPTION_ENFORCEMENT_ENABLED } from '../lib/billing-config'

// Gate de assinatura — aplicado nos routers operacionais (agenda, pacientes,
// prontuário, financeiro, WhatsApp/chatbot etc). Roda depois de authenticate().
// Enquanto SUBSCRIPTION_ENFORCEMENT_ENABLED=false (padrão), não bloqueia nada —
// isso permite publicar o backend/banco antes de configurar a Kiwify de verdade
// e só então ativar o bloqueio real (ver docs/assinatura-kiwify.md).
export async function requireActiveSubscription(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  if (!SUBSCRIPTION_ENFORCEMENT_ENABLED) {
    next()
    return
  }

  if (req.user?.role === 'ADMIN') {
    next()
    return
  }

  try {
    const doctorId = await getEffectiveDoctorId(req)
    if (!doctorId) {
      next()
      return
    }

    const subscription = await prisma.doctorSubscription.findUnique({ where: { doctorId } })
    const access = calculateClinicAccess(subscription, new Date())

    if (!access.allowed) {
      res.status(402).json({
        code: 'SUBSCRIPTION_REQUIRED',
        reason: access.reason,
        redirectTo: access.redirectTo ?? '/configuracoes/assinatura',
      })
      return
    }

    next()
  } catch (err) {
    console.error('[SUBSCRIPTION] Erro ao verificar assinatura:', err)
    next() // Falha no banco não pode derrubar a requisição
  }
}
