import Markdown from 'markdown-to-jsx'

// Strip `javascript:` and `data:` URLs so an LLM-returned (or attacker-
// crafted) markdown link cannot execute script when clicked. Token storage
// is still in localStorage until the httpOnly-cookie migration lands;
// until then, sanitizing what the assistant renders is the cheapest XSS
// mitigation (review finding 1.4).
function linkSanitizer(value, tag, attribute) {
  if ((tag === 'a' && attribute === 'href') ||
      (tag === 'img' && attribute === 'src')) {
    if (typeof value !== 'string') return ''
    const trimmed = value.trim().toLowerCase()
    if (trimmed.startsWith('javascript:') || trimmed.startsWith('data:') ||
        trimmed.startsWith('vbscript:')) {
      return ''
    }
  }
  return value
}

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
        className={`flex-1 ${
          isUser
            ? 'max-w-xs lg:max-w-md xl:max-w-lg bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-2xl rounded-tr-none'
            : 'max-w-sm lg:max-w-xl xl:max-w-2xl bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-2xl rounded-tl-none'
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
                disableParsingRawHTML: true,
                sanitizer: linkSanitizer,
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
                  table: {
                    props: { className: 'w-full text-xs border-collapse my-2' },
                  },
                  thead: {
                    props: { className: isUser ? 'border-b border-white/30' : 'border-b border-gray-300 dark:border-gray-500' },
                  },
                  th: {
                    props: { className: 'text-left px-2 py-1 font-semibold' },
                  },
                  td: {
                    props: { className: 'px-2 py-1' },
                  },
                  tr: {
                    props: { className: isUser ? 'border-b border-white/10' : 'border-b border-gray-200 dark:border-gray-600' },
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
