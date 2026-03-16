import React from 'react';

interface PageLayoutProps {
  children: React.ReactNode;
  headerHeight?: number; // 헤더 높이 (기본값: HEADER_HEIGHT)
  className?: string; // 추가 클래스명
  /** 사용 안 함 (AppLayout이 safe-area 처리). 하위 호환용 유지 */
  noSafeArea?: boolean;
}

/**
 * 공통 페이지 레이아웃 컴포넌트
 * - 상단바 높이를 고려한 padding-top 적용 (safe-area는 AppLayout에서 처리)
 */
const PageLayout: React.FC<PageLayoutProps> = ({ 
  children, 
  headerHeight = 60,
  className = '',
  noSafeArea = true, // AppLayout이 safe-area 처리하므로 기본값 true
}) => {
  const paddingTop = `${headerHeight}px`;
  return (
    <div
      className={`min-h-screen flex flex-col bg-[#FFFEF9] ${className}`}
      style={{ paddingTop }}
    >
      {children}
    </div>
  );
};

export default PageLayout;

