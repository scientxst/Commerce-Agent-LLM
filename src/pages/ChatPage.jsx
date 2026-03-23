import ChatInterface from '../components/chat/ChatInterface'

export default function ChatPage() {
  return (
    <div className="pt-16 h-[calc(100vh-4rem)]">
      <div className="h-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <ChatInterface />
      </div>
    </div>
  )
}