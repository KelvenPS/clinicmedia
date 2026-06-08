import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import Layout from './components/Layout'
import Login from './pages/Login'
import LandingPage from './pages/LandingPage'
import Dashboard from './pages/Dashboard'
import Agenda from './pages/Agenda'
import Financeiro from './pages/Financeiro'
import Usuarios from './pages/Usuarios'
import Pacientes from './pages/Pacientes'
import Prontuario from './pages/Prontuario'
import Avaliacoes from './pages/Avaliacoes'
import Perfil from './pages/configuracoes/Perfil'
import PlanoFinanceiro from './pages/configuracoes/PlanoFinanceiro'
import Ajuda from './pages/configuracoes/Ajuda'
import Documentacao from './pages/configuracoes/Documentacao'
import Equipe from './pages/configuracoes/Equipe'
import TiposAtendimento from './pages/configuracoes/TiposAtendimento'
import Salas from './pages/configuracoes/Salas'
import Documentos from './pages/configuracoes/Documentos'
import FormasPagamento from './pages/configuracoes/FormasPagamento'
import Planos from './pages/configuracoes/Planos'
import ConfigNotificacoes from './pages/configuracoes/ConfigNotificacoes'
import Integracoes from './pages/configuracoes/Integracoes'
import ChatbotIA from './pages/ChatbotIA'
import AdminGestao from './pages/AdminGestao'

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

        <Route path="/chatbot/*" element={<ProtectedRoute allowedRoles={['ADMIN', 'DOCTOR']}><ChatbotIA /></ProtectedRoute>} />

        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="agenda" element={<Agenda />} />
          <Route path="pacientes" element={<Pacientes />} />
          <Route path="prontuario" element={<Prontuario />} />
          <Route path="avaliacoes" element={<ProtectedRoute allowedRoles={['ADMIN', 'DOCTOR']}><Avaliacoes /></ProtectedRoute>} />
          <Route path="financeiro" element={<ProtectedRoute allowedRoles={['ADMIN', 'DOCTOR']}><Financeiro /></ProtectedRoute>} />
          <Route path="usuarios" element={<ProtectedRoute allowedRoles={['ADMIN']}><Usuarios /></ProtectedRoute>} />
          <Route path="admin/gestao" element={<ProtectedRoute allowedRoles={['ADMIN']}><AdminGestao /></ProtectedRoute>} />

          <Route path="configuracoes" element={<Navigate to="/configuracoes/perfil" replace />} />
          <Route path="configuracoes/perfil" element={<Perfil />} />
          <Route path="configuracoes/plano-financeiro" element={<PlanoFinanceiro />} />
          <Route path="configuracoes/equipe" element={<ProtectedRoute allowedRoles={['DOCTOR', 'ADMIN']}><Equipe /></ProtectedRoute>} />
          <Route path="configuracoes/ajuda" element={<Ajuda />} />
          <Route path="configuracoes/documentacao" element={<Documentacao />} />
          <Route path="configuracoes/tipos-atendimento" element={<ProtectedRoute allowedRoles={['ADMIN', 'DOCTOR']}><TiposAtendimento /></ProtectedRoute>} />
          <Route path="configuracoes/salas" element={<ProtectedRoute allowedRoles={['ADMIN', 'DOCTOR']}><Salas /></ProtectedRoute>} />
          <Route path="configuracoes/documentos" element={<ProtectedRoute allowedRoles={['ADMIN', 'DOCTOR']}><Documentos /></ProtectedRoute>} />
          <Route path="configuracoes/formas-pagamento" element={<ProtectedRoute allowedRoles={['ADMIN', 'DOCTOR']}><FormasPagamento /></ProtectedRoute>} />
          <Route path="configuracoes/planos" element={<ProtectedRoute allowedRoles={['ADMIN', 'DOCTOR']}><Planos /></ProtectedRoute>} />
          <Route path="configuracoes/notificacoes" element={<ConfigNotificacoes />} />
          <Route path="configuracoes/integracoes" element={<ProtectedRoute allowedRoles={['ADMIN', 'DOCTOR']}><Integracoes /></ProtectedRoute>} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
