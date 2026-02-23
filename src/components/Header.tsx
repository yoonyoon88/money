import React from 'react';
import { useNavigate } from 'react-router-dom';

interface HeaderProps {
  showBackButton?: boolean; // 뒤로가기 버튼 표시 여부 (기본값: true)
  title?: string; // 헤더 제목 (선택사항)
  className?: string; // 추가 스타일 클래스
  onBack?: () => void; // 뒤로가기 핸들러 (선택사항, 없으면 navigate(-1))
}

/**
 * 공통 Header 컴포넌트
 * 
 * 사용 예시:
 * - <Header /> // 기본: 뒤로가기 버튼 표시
 * - <Header showBackButton={false} /> // 뒤로가기 버튼 숨김
 * - <Header title="제목" /> // 제목과 함께 표시
 */
const Header: React.FC<HeaderProps> = ({ 
  showBackButton = true,
  title,
  className = '',
  onBack
}) => {
  const navigate = useNavigate();

  // 뒤로가기 버튼이 없으면 헤더 자체를 렌더링하지 않음
  if (!showBackButton && !title) {
    return null;
  }

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  return (
    <header className={`flex items-center gap-3 px-5 py-4 bg-white ${className}`}>
      {/* 뒤로가기 버튼 */}
      {showBackButton && (
        <button
          onClick={handleBack}
          className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors"
          aria-label="뒤로가기"
        >
          <svg 
            className="w-6 h-6 text-gray-700" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M15 19l-7-7 7-7" 
            />
          </svg>
        </button>
      )}

      {/* 제목 */}
      {title && (
        <h1 className="text-xl font-bold text-gray-800">
          {title}
        </h1>
      )}
    </header>
  );
};

export default Header;

