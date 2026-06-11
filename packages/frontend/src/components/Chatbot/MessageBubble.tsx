import { Bot, FileText, ImageIcon, Mic, Video } from 'lucide-react'
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

  return (
    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex flex-col max-w-[68%] ${isMe ? 'items-end' : 'items-start'}`}>
        {message.isBot && (
          <div className="flex items-center gap-1 mb-1 px-1">
            <Bot className="w-3 h-3 text-violet-500" />
            <span className="text-[10px] text-violet-500 font-semibold">Bot</span>
          </div>
        )}

        <div
          className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm ${
            isMe
              ? 'bg-blue-600 text-white rounded-tr-sm'
              : 'bg-white text-slate-800 border border-slate-200 rounded-tl-sm'
          }`}
        >
          {message.type !== 'TEXT' && <MediaPreview message={message} />}
          {message.content && <span className="whitespace-pre-wrap break-words">{message.content}</span>}
        </div>

        <span className="text-[11px] text-slate-400 mt-1 px-1">{formatMessageTime(message.timestamp)}</span>
      </div>
    </div>
  )
}
