import React from 'react';
import { useNavigate } from 'react-router-dom';

interface FixedHeaderProps {
  title: string; // 헤더 타이틀
  onBack?: () => void; // 뒤로가기 핸들러 (선택사항, 없으면 navigate(-1))
  showBackButton?: boolean; // 뒤로가기 버튼 표시 여부 (기본값: true)
  rightActions?: React.ReactNode; // 오른쪽 액션 영역 (기록 공유, 포인트란? 등)
  className?: string; // 추가 스타일 클래스
}

/**
 * 고정 헤더 컴포넌트
 * - 뒤로가기 버튼과 타이틀을 같은 행에 배치
 * - 헤더 높이 고정 (60px)
 * - 스크롤 시에도 상단에 고정
 * - Safe Area 고려
 */
const FixedHeader: React.FC<FixedHeaderProps> = ({
  title,
  onBack,
  showBackButton = true,
  rightActions,
  className = '',
}) => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 ${className}`}
      style={{
        height: '60px',
        paddingTop: 'env(safe-area-inset-top, 0)',
      }}
    >
      <div className="h-full flex items-center px-4 pt-3">
        {/* 왼쪽: 뒤로가기 버튼 */}
        {showBackButton && (
          <button
            onClick={handleBack}
            className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors flex-shrink-0"
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

        {/* 중앙: 타이틀 (한 줄로 표시, 줄바꿈 없음) */}
        <div className="flex-1 min-w-0 px-3">
          <h1 className="text-lg font-bold text-gray-900 truncate">
            {title}
          </h1>
        </div>

        {/* 오른쪽: 액션 버튼들 */}
        {rightActions && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {rightActions}
          </div>
        )}
      </div>
    </header>
  );
};

export default FixedHeader;

