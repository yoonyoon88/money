import React from 'react';
import { useNavigate } from 'react-router-dom';

const SupportThankYouPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen overflow-y-auto max-w-[420px] mx-auto bg-white flex flex-col justify-center px-6 text-center">
      {/* 아이콘 */}
      <div className="text-6xl mb-6">🙏</div>

      {/* 제목 */}
      <h1 className="text-xl font-semibold mb-3 text-gray-800">정말 감사합니다!</h1>

      {/* 설명 문구 */}
      <p className="text-gray-600 text-sm leading-relaxed mb-4">
        후원해주셔서 정말 감사합니다.
      </p>
      <p className="text-gray-600 text-sm leading-relaxed mb-6">
        후원해주신 금액은 서비스 유지와
        <br />
        새로운 기능 개발에 사용됩니다.
      </p>
      <p className="text-gray-500 text-sm">
        앞으로도 아이와 부모에게 도움이 되는
        <br />
        용돈 관리 서비스를 만들겠습니다.
      </p>

      {/* 홈으로 돌아가기 버튼 */}
      <button
        type="button"
        onClick={() => navigate('/parent')}
        className="mt-8 w-full h-12 rounded-xl bg-purple-500 text-white font-medium hover:bg-purple-600 active:scale-95 transition-colors"
      >
        홈으로 돌아가기
      </button>

      {/* 추가 안내 문구 */}
      <p className="text-xs text-gray-400 mt-6">
        여러분의 응원이 큰 힘이 됩니다 ☕
      </p>
    </div>
  );
};

export default SupportThankYouPage;

