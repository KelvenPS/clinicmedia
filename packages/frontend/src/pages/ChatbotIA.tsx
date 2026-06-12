import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { type ActivePanel, type ConversationCategory, type Conversation, type Flow, type Template } from '../types/chatbot'
import api from '../lib/api'
import { useAuthStore } from '../store/authStore'

import FlowCanvasEditor, { type CanvasNode, type CanvasEdge } from './FlowCanvasEditor'
import AppSidebar from '../components/Chatbot/AppSidebar'
import ChatTopBar from '../components/Chatbot/ChatTopBar'
import ConversationList from '../components/Chatbot/ConversationList'
import ChatArea from '../components/Chatbot/ChatArea'
import ContactDetailsPanel from '../components/Chatbot/ContactDetailsPanel'
import TemplatesPanel from '../components/Chatbot/TemplatesPanel'
import FluxosPanel from '../components/Chatbot/FluxosPanel'
import ConfiguracoesPanel from '../components/Chatbot/ConfiguracoesPanel'

export default function ChatbotIA() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()

  // Navigation state
  const [activePanel, setActivePanel] = useState<ActivePanel>('atendimento')
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  // Atendimento state (lifted so ConversationList, ChatArea and ContactDetailsPanel share it)
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [conversationCategory, setConversationCategory] = useState<ConversationCategory>('TODOS')
  const [showDetails, setShowDetails] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  // Canvas state
  const [canvasFlow, setCanvasFlow] = useState<Flow | null>(null)

  const saveFlowMutation = useMutation({
    mutationFn: ({ id, name, nodes, edges, active }: { id: string; name: string; nodes: CanvasNode[]; edges: CanvasEdge[]; active?: boolean }) =>
      api.put(`/chatbot/flows/${id}`, { name, nodes, edges, ...(active !== undefined && { active }) }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['chatbot-flows'] })
      toast.success('Fluxo salvo com sucesso!')
      setCanvasFlow(res.data as Flow)
    },
    onError: (err: any) => {
      console.error('Erro ao salvar fluxo:', err)
      toast.error('Erro ao salvar o fluxo: ' + (err.response?.data?.message || err.message))
    }
  })

  function handleUseTemplate(tpl: Template) {
    api.post('/chatbot/flows', {
      name: tpl.name,
      description: tpl.description,
      trigger: 'FIRST_MESSAGE',
      botType: 'LIGHT',
      nodes: tpl.nodes ?? [],
      edges: tpl.edges ?? [],
    }).then(res => {
      queryClient.invalidateQueries({ queryKey: ['chatbot-flows'] })
      setCanvasFlow(res.data as Flow)
      setActivePanel('fluxos')
    })
  }

  function handleOpenCanvas(flow: Flow) {
    setCanvasFlow(flow)
  }

  function handleSaveCanvas(name: string, nodes: CanvasNode[], edges: CanvasEdge[], active?: boolean) {
    if (!canvasFlow) return
    saveFlowMutation.mutate({ id: canvasFlow.id, name, nodes, edges, active })
  }

  function handleSelectPanel(panel: ActivePanel) {
    setActivePanel(panel)
    setMobileSidebarOpen(false)
    setCanvasFlow(null)
  }

  function handleSelectCategory(cat: ConversationCategory) {
    setConversationCategory(cat)
    setSelectedConversation(null)
  }

  function handleSelectConversation(conv: Conversation) {
    setSelectedConversation(conv)
  }

  function handleUpdateConversation(updated: Conversation) {
    setSelectedConversation(updated)
  }

  // Canvas full-screen mode
  if (canvasFlow) {
    return (
      <div className="flex h-screen bg-slate-50 overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <FlowCanvasEditor
            flowId={canvasFlow.id}
            flowName={canvasFlow.name}
            botType={(canvasFlow.botType as 'LIGHT' | 'AI_AGENT') ?? 'LIGHT'}
            initialActive={canvasFlow.active}
            initialNodes={(canvasFlow.nodes as CanvasNode[] | undefined) ?? []}
            initialEdges={(canvasFlow.edges as CanvasEdge[] | undefined) ?? []}
            onSave={handleSaveCanvas}
            onBack={() => setCanvasFlow(null)}
            isSaving={saveFlowMutation.isPending}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden relative">
      {/* Mobile sidebar overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 transition-transform duration-300 lg:static lg:translate-x-0 ${
        mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <AppSidebar
          activePanel={activePanel}
          onSelectPanel={handleSelectPanel}
          onSelectCategory={handleSelectCategory}
          userName={user?.name ?? 'Usuário'}
          userRole={user?.role ?? ''}
          userSpecialty={user?.specialty}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        <ChatTopBar
          activePanel={activePanel}
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
          userName={user?.name ?? 'KP'}
        />

        <div className="flex-1 overflow-hidden">
          {/* Atendimento — 3-column layout */}
          {activePanel === 'atendimento' && (
            <div className="flex h-full">
              {/* Left: conversation list — hidden on mobile when conversation selected */}
              <div className={`${selectedConversation ? 'hidden lg:flex' : 'flex'} h-full`}>
                <ConversationList
                  selectedId={selectedConversation?.id ?? null}
                  onSelect={handleSelectConversation}
                  category={conversationCategory}
                  onCategoryChange={handleSelectCategory}
                  searchQuery={searchQuery}
                  onSearchQueryChange={setSearchQuery}
                />
              </div>

              {/* Center: chat area — hidden on mobile when no conversation */}
              <div className={`flex-1 flex flex-col overflow-hidden ${!selectedConversation ? 'hidden lg:flex' : 'flex'}`}>
                <ChatArea
                  conversation={selectedConversation}
                  currentUserId={user?.id ?? ''}
                  showDetails={showDetails}
                  onBack={() => setSelectedConversation(null)}
                  onToggleDetails={() => setShowDetails(v => !v)}
                  onUpdateConversation={handleUpdateConversation}
                />
              </div>

              {/* Right: details panel — visible on desktop when showDetails & conversation selected */}
              {selectedConversation && showDetails && (
                <div className="hidden xl:flex">
                  <ContactDetailsPanel
                    conversation={selectedConversation}
                    onClose={() => setShowDetails(false)}
                    onSwitchToTemplates={() => handleSelectPanel('templates')}
                  />
                </div>
              )}
            </div>
          )}

          {activePanel === 'templates' && (
            <div className="h-full overflow-auto">
              <TemplatesPanel onUseTemplate={handleUseTemplate} />
            </div>
          )}

          {activePanel === 'fluxos' && (
            <div className="h-full overflow-auto">
              <FluxosPanel onOpenCanvas={handleOpenCanvas} />
            </div>
          )}

          {activePanel === 'configuracoes' && (
            <div className="h-full overflow-auto">
              <ConfiguracoesPanel />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
