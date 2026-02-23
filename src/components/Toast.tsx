import React, { useEffect } from 'react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  duration?: number;
  onClose: () => void;
}

/**
 * 간단한 Toast 메시지 컴포넌트
 * - 모바일 친화적인 하단 중앙 배치
 * - 자동 사라짐 (기본 2초)
 * - 짧고 명확한 메시지 표시
 */
const Toast: React.FC<ToastProps> = ({ 
  message, 
  type = 'success', 
  duration = 2000,
  onClose 
}) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => {
      clearTimeout(timer);
    };
  }, [duration, onClose]);

  const bgColor = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    info: 'bg-blue-500',
  }[type];

  return (
    <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 animate-fade-in">
      <div
        className={`${bgColor} text-white px-6 py-3 rounded-xl shadow-lg text-center text-sm font-medium max-w-xs`}
      >
        {message}
      </div>
    </div>
  );
};

export default Toast;

