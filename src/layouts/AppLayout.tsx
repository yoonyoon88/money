import React from 'react';
import UpdateNotice from '../components/UpdateNotice';

/**
 * 전체 화면 공통 레이아웃 컨테이너
 *
 * 공통 규칙 (페이지에서 적용 시 참고):
 *
 * 2. 상단 헤더 영역
 *    - 컨테이너: px-4 pt-6 pb-4, h-[56px], flex items-center justify-between
 *    - 제목: text-lg font-semibold text-gray-800
 *
 * 3. 본문 영역
 *    - flex-1 px-4 pb-24
 *
 * 4. 카드 공통 스타일
 *    - bg-white rounded-2xl shadow-sm border border-gray-100 p-5
 *
 * 5. 카드 간 간격
 *    - mt-4
 *
 * 6. 하단 탭바
 *    - fixed bottom-0 max-w-[420px] w-full h-16 bg-white border-t border-gray-200 flex justify-around items-center
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="w-full min-h-screen overflow-y-auto bg-[#F9FAFB] flex flex-col"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <UpdateNotice />
      {children}
    </div>
  );
}
