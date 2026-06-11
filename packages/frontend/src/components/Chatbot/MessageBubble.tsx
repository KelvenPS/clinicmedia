import { Bot, FileText, ImageIcon, Mic, Video, Check, CheckCheck } from 'lucide-react'
import { type Message, formatMessageTime } from '../../types/chatbot'

interface Props {
  message: Message
}

function MediaPreview({ message }: { message: Message }) {
  if (message.type === 'IMAGE') {
    if (message.mediaUrl) {
      return (
        <img
          src={message.mediaUrl}
          alt="imagem"
          className="max-w-[240px] rounded-xl mb-1 cursor-pointer"
          onClick={() => window.open(message.mediaUrl!, '_blank')}
        />
      )
    }
    return (
      <div className="flex items-center gap-2 py-1">
        <ImageIcon className="w-4 h-4 opacity-70" />
        <span className="text-xs opacity-70">Imagem</span>
      </div>
    )
  }
  if (message.type === 'AUDIO') {
    return (
      <div className="flex items-center gap-2 py-1">
        <Mic className="w-4 h-4 opacity-70" />
        <span className="text-xs opacity-70">Áudio</span>
        {message.mediaUrl && (
          <a href={message.mediaUrl} target="_blank" rel="noopener noreferrer" className="text-xs underline opacity-70">
            Ouvir
          </a>
        )}
      </div>
    )
  }
  if (message.type === 'VIDEO') {
    return (
      <div className="flex items-center gap-2 py-1">
        <Video className="w-4 h-4 opacity-70" />
        <span className="text-xs opacity-70">Vídeo</span>
        {message.mediaUrl && (
          <a href={message.mediaUrl} target="_blank" rel="noopener noreferrer" className="text-xs underline opacity-70">
            Ver
          </a>
        )}
      </div>
    )
  }
  if (message.type === 'DOCUMENT') {
    return (
      <div className="flex items-center gap-2 py-1">
        <FileText className="w-4 h-4 opacity-70" />
        <span className="text-xs opacity-70">Documento</span>
        {message.mediaUrl && (
          <a href={message.mediaUrl} target="_blank" rel="noopener noreferrer" className="text-xs underline opacity-70">
            Baixar
          </a>
        )}
      </div>
    )
  }
  return null
}

export default function MessageBubble({ message }: Props) {
  const isMe = message.fromMe

  // Render ticks matching WhatsApp Web status
  const renderTicks = () => {
    if (!isMe) return null
    if (message.status === 'READ') {
      return <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" />
    }
    if (message.status === 'DELIVERED') {
      return <CheckCheck className="w-3.5 h-3.5 text-slate-400" />
    }
    return <Check className="w-3.5 h-3.5 text-slate-400" />
  }

  return (
    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} mb-1.5`}>
      <div className={`flex flex-col max-w-[65%] ${isMe ? 'items-end' : 'items-start'}`}>
        {message.isBot && (
          <div className="flex items-center gap-1 mb-0.5 px-1">
            <Bot className="w-3 h-3 text-violet-500" />
            <span className="text-[9px] text-violet-500 font-semibold">Bot</span>
          </div>
        )}

        <div
          className={`relative px-3.5 py-2 rounded-xl text-[13.5px] leading-relaxed shadow-sm pb-5 select-text ${
            isMe
              ? 'bg-[#d9fdd3] text-[#111b21] rounded-tr-none'
              : 'bg-white text-[#111b21] rounded-tl-none border border-slate-100'
          }`}
        >
          {message.type !== 'TEXT' && <MediaPreview message={message} />}
          {message.content && (
            <span className="whitespace-pre-wrap break-words block pr-8">
              {message.content}
            </span>
          )}
          
          {/* Time & status indicator inside bubble at bottom right */}
          <div className="absolute right-2.5 bottom-1 flex items-center gap-1 text-[9.5px] text-slate-400 font-medium select-none">
            <span>{formatMessageTime(message.timestamp)}</span>
            {renderTicks()}
          </div>
        </div>
      </div>
    </div>
  )
}
