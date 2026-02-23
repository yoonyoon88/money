import React from 'react';

interface PageLayoutProps {
  children: React.ReactNode;
  headerHeight?: number; // 헤더 높이 (기본값: HEADER_HEIGHT)
  className?: string; // 추가 클래스명
}

/**
 * 공통 페이지 레이아웃 컴포넌트
 * - 상단바 높이를 고려한 padding-top 자동 적용
 * - Safe Area 고려
 * - 모든 화면에서 일관된 여백 제공
 */
const PageLayout: React.FC<PageLayoutProps> = ({ 
  children, 
  headerHeight = 60, // FixedHeader 기본 높이
  className = '' 
}) => {
  return (
    <div
      className={`min-h-screen bg-[#FFFEF9] ${className}`}
      style={{
        paddingTop: `calc(${headerHeight}px + env(safe-area-inset-top, 0))`,
      }}
    >
      {children}
    </div>
  );
};

export default PageLayout;

