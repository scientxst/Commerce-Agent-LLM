import React from 'react';
import Markdown from 'markdown-to-jsx';
import '../styles/Message.css';

const Message = ({ message }) => {
  const isUser = message.role === 'user';

  return (
    <div className={`message ${message.role}`}>
      <div className="message-avatar">
        {isUser ? 'You' : 'S'}
      </div>
      <div className="message-content">
        {isUser ? (
          message.content
        ) : (
          <Markdown options={{ forceBlock: false }}>
            {message.content || ''}
          </Markdown>
        )}
      </div>
    </div>
  );
};

export default Message;
