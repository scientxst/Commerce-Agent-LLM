import Markdown from 'markdown-to-jsx'

export default function Message({ message }) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {/* Avatar */}
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 flex items-center justify-center text-white text-sm font-bold">
          S
        </div>
      )}

      {/* Message Bubble */}
      <div
        className={`flex-1 max-w-xs lg:max-w-md xl:max-w-lg ${
          isUser
            ? 'bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-2xl rounded-tr-none'
            : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-2xl rounded-tl-none'
        } px-4 py-3`}
      >
        {message.isStreaming && !message.content ? (
          // Typing indicator
          <div className="flex gap-1 py-2">
            <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" />
            <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0.1s' }} />
            <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0.2s' }} />
          </div>
        ) : (
          <div className="prose dark:prose-invert prose-sm max-w-none">
            <Markdown
              options={{
                forceBlock: true,
                overrides: {
                  p: {
                    props: { className: 'mb-2 last:mb-0 break-words' },
                  },
                  a: {
                    props: {
                      className: isUser
                        ? 'underline hover:opacity-80'
                        : 'text-purple-600 dark:text-purple-400 underline hover:opacity-80',
                      target: '_blank',
                      rel: 'noopener noreferrer',
                    },
                  },
                  strong: {
                    props: { className: 'font-semibold' },
                  },
                  em: {
                    props: { className: 'italic' },
                  },
                  ul: {
                    props: { className: 'list-disc list-inside mb-2' },
                  },
                  ol: {
                    props: { className: 'list-decimal list-inside mb-2' },
                  },
                  li: {
                    props: { className: 'mb-1' },
                  },
                  code: {
                    props: {
                      className: isUser
                        ? 'bg-white/20 px-2 py-1 rounded font-mono text-sm'
                        : 'bg-gray-200 dark:bg-gray-600 px-2 py-1 rounded font-mono text-sm',
                    },
                  },
                },
              }}
            >
              {message.content}
            </Markdown>
          </div>
        )}
      </div>

      {/* Avatar for user */}
      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-gray-700 dark:text-gray-200 text-sm font-bold">
          You
        </div>
      )}
    </div>
  )
}
