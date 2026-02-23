import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Header from '../components/Header';

/**
 * 약관을 표시하는 WebView 화면
 * 
 * URL 파라미터:
 * - title: 화면 상단에 표시할 제목
 * - url: 표시할 약관 URL (임시 문자열도 가능)
 * 
 * 사용 예시:
 * /policy?title=개인정보처리방침&url=https://example.com/privacy
 */
const PolicyWebView: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // URL 파라미터에서 title과 url 가져오기
  const title = searchParams.get('title') || '약관';
  const url = searchParams.get('url') || '';

  return (
    <div className="min-h-screen bg-[#FFFEF9] flex flex-col">
      {/* Header - 뒤로가기 버튼과 제목 (중앙 정렬) */}
      <header className="flex items-center justify-center relative px-5 py-4 bg-white border-b border-gray-100">
        {/* 뒤로가기 버튼 - 왼쪽 */}
        <button
          onClick={() => navigate(-1)}
          className="absolute left-5 flex items-center justify-center w-10 h-10 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors"
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
        {/* 제목 - 중앙 */}
        <h1 className="text-xl font-bold text-gray-800">
          {title}
        </h1>
      </header>
      
      {/* WebView 영역 */}
      <div className="flex-1 w-full overflow-hidden">
        {url ? (
          <iframe
            src={url}
            className="w-full h-full border-0"
            title={title}
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
            style={{ minHeight: 'calc(100vh - 60px)' }}
          />
        ) : (
          <div className="flex items-center justify-center h-full px-5">
            <div className="text-center">
              <p className="text-gray-500 text-base mb-2">
                약관 내용을 불러올 수 없습니다.
              </p>
              <p className="text-gray-400 text-sm">
                URL이 제공되지 않았습니다.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PolicyWebView;

