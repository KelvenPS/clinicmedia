import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import Layout from './components/Layout'
import Login from './pages/Login'
import LandingPage from './pages/LandingPage'
import Dashboard from './pages/Dashboard'
import Agenda from './pages/Agenda'
import Usuarios from './pages/Usuarios'
import FinanceiroResumo from './pages/financeiro/Resumo'
import FluxoCaixa from './pages/financeiro/FluxoCaixa'
import Extrato from './pages/financeiro/Extrato'
import Receitas from './pages/financeiro/Receitas'
import Despesas from './pages/financeiro/Despesas'
import AnaliseReceitas from './pages/financeiro/AnaliseReceitas'
import AnaliseDespesas from './pages/financeiro/AnaliseDespesas'
import AnaliseAvancada from './pages/financeiro/AnaliseAvancada'
import FinanceiroCategorias from './pages/financeiro/Categorias'
import ContasBancarias from './pages/financeiro/ContasBancarias'
import CentrosCusto from './pages/financeiro/CentrosCusto'
import OutrasConfiguracoes from './pages/financeiro/OutrasConfiguracoes'
import Pacientes from './pages/Pacientes'
import Prontuario from './pages/Prontuario'
import Perfil from './pages/configuracoes/Perfil'
import PlanoFinanceiro from './pages/configuracoes/PlanoFinanceiro'
import Ajuda from './pages/configuracoes/Ajuda'
import Documentacao from './pages/configuracoes/Documentacao'
import Equipe from './pages/configuracoes/Equipe'
import TiposAtendimento from './pages/configuracoes/TiposAtendimento'
import Salas from './pages/configuracoes/Salas'
import Documentos from './pages/configuracoes/Documentos'
import FormasPagamento from './pages/configuracoes/FormasPagamento'
import Assinatura from './pages/configuracoes/Assinatura'
import AssinaturaPendente from './pages/configuracoes/AssinaturaPendente'
import ConfigNotificacoes from './pages/configuracoes/ConfigNotificacoes'
import Integracoes from './pages/configuracoes/Integracoes'
import ChatbotLight from './pages/ChatbotLight'
import MinhasSalas from './pages/MinhasSalas'
import AdminGestao from './pages/AdminGestao'
import AdminPlanos from './pages/AdminPlanos'
import AdminSQL from './pages/AdminSQL'
import { SecretaryGate } from './components/ui/SecretaryGate'

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) {
  const { isAuthenticated, user } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (allowedRoles && user && !allowedRoles.includes(user.role)) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

export default function App() {
  const { isAuthenticated } = useAuthStore()

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />} />
        <Route path="/" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LandingPage />} />

        <Route path="/chatbot/light/*" element={<ProtectedRoute allowedRoles={['ADMIN', 'DOCTOR', 'SECRETARY']}><SecretaryGate permission={['chatbot_light_operar', 'chatbot_light_configurar']}><ChatbotLight /></SecretaryGate></ProtectedRoute>} />
        <Route path="/chatbot" element={<Navigate to="/chatbot/light" replace />} />
        <Route path="/chatbot/*" element={<Navigate to="/chatbot/light" replace />} />

        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="agenda" element={<Agenda />} />
          <Route path="pacientes" element={<Pacientes />} />
          <Route path="prontuario" element={<Prontuario />} />
          <Route path="financeiro" element={<Navigate to="/financeiro/resumo" replace />} />
          <Route path="financeiro/resumo" element={<SecretaryGate permission="financeiro"><FinanceiroResumo /></SecretaryGate>} />
          <Route path="financeiro/fluxo-caixa" element={<SecretaryGate permission="financeiro"><FluxoCaixa /></SecretaryGate>} />
          <Route path="financeiro/extrato" element={<SecretaryGate permission="financeiro"><Extrato /></SecretaryGate>} />
          <Route path="financeiro/receitas" element={<SecretaryGate permission="financeiro"><Receitas /></SecretaryGate>} />
          <Route path="financeiro/despesas" element={<SecretaryGate permission="financeiro"><Despesas /></SecretaryGate>} />
          <Route path="financeiro/analise-receitas" element={<SecretaryGate permission="financeiro"><AnaliseReceitas /></SecretaryGate>} />
          <Route path="financeiro/analise-despesas" element={<SecretaryGate permission="financeiro"><AnaliseDespesas /></SecretaryGate>} />
          <Route path="financeiro/analise-avancada" element={<ProtectedRoute allowedRoles={['ADMIN', 'DOCTOR']}><AnaliseAvancada /></ProtectedRoute>} />
          <Route path="financeiro/formas-pagamento" element={<ProtectedRoute allowedRoles={['ADMIN', 'DOCTOR']}><FormasPagamento /></ProtectedRoute>} />
          <Route path="financeiro/categorias" element={<ProtectedRoute allowedRoles={['ADMIN', 'DOCTOR']}><FinanceiroCategorias /></ProtectedRoute>} />
          <Route path="financeiro/contas-bancarias" element={<ProtectedRoute allowedRoles={['ADMIN', 'DOCTOR']}><ContasBancarias /></ProtectedRoute>} />
          <Route path="financeiro/centros-custo" element={<ProtectedRoute allowedRoles={['ADMIN', 'DOCTOR']}><CentrosCusto /></ProtectedRoute>} />
          <Route path="financeiro/outras-configuracoes" element={<ProtectedRoute allowedRoles={['ADMIN', 'DOCTOR']}><OutrasConfiguracoes /></ProtectedRoute>} />
          <Route path="usuarios" element={<ProtectedRoute allowedRoles={['ADMIN']}><Usuarios /></ProtectedRoute>} />
          <Route path="admin/gestao" element={<ProtectedRoute allowedRoles={['ADMIN']}><AdminGestao /></ProtectedRoute>} />
          <Route path="admin/planos" element={<ProtectedRoute allowedRoles={['ADMIN']}><AdminPlanos /></ProtectedRoute>} />
          <Route path="admin/sql" element={<ProtectedRoute allowedRoles={['ADMIN']}><AdminSQL /></ProtectedRoute>} />
          <Route path="minhas-salas" element={<ProtectedRoute allowedRoles={['SECRETARY']}><MinhasSalas /></ProtectedRoute>} />

          <Route path="configuracoes" element={<Navigate to="/configuracoes/perfil" replace />} />
          <Route path="configuracoes/perfil" element={<Perfil />} />
          <Route path="configuracoes/plano-financeiro" element={<PlanoFinanceiro />} />
          <Route path="configuracoes/equipe" element={<ProtectedRoute allowedRoles={['DOCTOR', 'ADMIN']}><Equipe /></ProtectedRoute>} />
          <Route path="configuracoes/ajuda" element={<Ajuda />} />
          <Route path="configuracoes/documentacao" element={<Documentacao />} />
          <Route path="configuracoes/tipos-atendimento" element={<ProtectedRoute allowedRoles={['ADMIN', 'DOCTOR', 'SECRETARY']}><TiposAtendimento /></ProtectedRoute>} />
          <Route path="configuracoes/salas" element={<ProtectedRoute allowedRoles={['ADMIN', 'DOCTOR', 'SECRETARY']}><SecretaryGate permission="salas"><Salas /></SecretaryGate></ProtectedRoute>} />
          <Route path="configuracoes/documentos" element={<ProtectedRoute allowedRoles={['ADMIN', 'DOCTOR', 'SECRETARY']}><SecretaryGate permission="documentos"><Documentos /></SecretaryGate></ProtectedRoute>} />
          <Route path="configuracoes/formas-pagamento" element={<ProtectedRoute allowedRoles={['ADMIN', 'DOCTOR']}><FormasPagamento /></ProtectedRoute>} />
          <Route path="configuracoes/notificacoes" element={<ConfigNotificacoes />} />
          <Route path="configuracoes/integracoes" element={<ProtectedRoute allowedRoles={['ADMIN', 'DOCTOR', 'SECRETARY']}><SecretaryGate permission="integracoes"><Integracoes /></SecretaryGate></ProtectedRoute>} />
          <Route path="configuracoes/assinatura" element={<Assinatura />} />
          <Route path="configuracoes/assinatura/pendente" element={<AssinaturaPendente />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
