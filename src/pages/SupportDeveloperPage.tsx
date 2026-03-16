import React from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase/config';
import {
  purchaseCoffee,
  purchaseBurger,
  purchasePizza,
  isBillingReady,
} from '../services/billingService';

const SupportDeveloperPage: React.FC = () => {
  const navigate = useNavigate();

  const handleDonate = async (product: 'coffee' | 'burger' | 'pizza') => {
    console.log('[DONATE] 버튼 클릭됨', { product });

    const billingReady = isBillingReady();
    const user = auth.currentUser;

    if (!user) {
      alert('로그인 후 이용해주세요.');
      return;
    }

    // Billing 모듈이 아직 준비 안 된 경우에만 한 번 물어보기
    if (!billingReady) {
      const proceed = window.confirm(
        '결제 모듈이 아직 완전히 준비되지 않았습니다.\n\n그래도 결제를 시도하시겠어요?'
      );
      if (!proceed) return;
    }

    try {
      if (product === 'coffee') {
        await purchaseCoffee();
      } else if (product === 'burger') {
        await purchaseBurger();
      } else {
        await purchasePizza();
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.';
      alert(`결제 실행 중 오류가 발생했습니다.\n\n${message}`);
    }
  };

  return (
    <div className="relative min-h-screen overflow-y-auto max-w-[420px] mx-auto bg-white flex flex-col px-6">
      {/* 닫기 버튼 */}
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="absolute right-4 top-4 w-8 h-8 flex items-center justify-center text-gray-500 text-xl"
        aria-label="닫기"
      >
        ✕
      </button>
      {/* 상단 제목 */}
      <h1 className="text-lg font-semibold text-center py-4 text-gray-800">개발자에게 후원하기</h1>

      {/* 설명 영역 */}
      <div className="text-center mt-6">
        <div className="text-4xl mb-4">☕</div>
        <p className="font-semibold text-base mb-3 text-gray-800">이 앱이 도움이 되셨나요?</p>
        <p className="text-sm text-gray-500 leading-relaxed mb-4">
          이 앱은 광고 없이 아이의 용돈 교육에 집중할 수 있도록
          <br />
          개발자가 직접 만들고 운영하고 있습니다.
        </p>
        <p className="text-sm text-gray-500 leading-relaxed mb-6">
          앞으로도 광고 없이 다양한 기능을 제공하기 위해
          <br />
          계속 개선하고 있습니다.
        </p>
        <p className="text-sm text-gray-400">
          후원은 선택 사항이며
          <br />
          서비스는 계속 무료로 이용할 수 있습니다.
        </p>
      </div>

      {/* 안내 문구 (버튼 위) */}
      <p className="mt-8 text-sm text-gray-600 text-center leading-relaxed">
        광고 없이 서비스를 유지하기 위해 노력하고 있습니다.
        <br />
        작은 후원이 큰 힘이 됩니다.
      </p>

      {/* 후원 버튼 영역 */}
      <div className="mt-4 space-y-3">
        {/* 커피 후원 */}
        <button
          type="button"
          onClick={() => handleDonate('coffee')}
          className="bg-yellow-100 rounded-xl p-4 w-full text-left flex items-center justify-between whitespace-nowrap"
        >
          <span className="text-gray-800">☕ 커피 한잔 후원</span>
          <span className="ml-2 font-semibold text-gray-700">1,000원</span>
        </button>

        {/* 햄버거 후원 */}
        <button
          type="button"
          onClick={() => handleDonate('burger')}
          className="bg-yellow-100 rounded-xl p-4 w-full text-left flex items-center justify-between whitespace-nowrap"
        >
          <span className="text-gray-800">🍔 햄버거 후원</span>
          <span className="ml-2 font-semibold text-gray-700">3,000원</span>
        </button>

        {/* 피자 후원 */}
        <button
          type="button"
          onClick={() => handleDonate('pizza')}
          className="bg-yellow-100 rounded-xl p-4 w-full text-left flex items-center justify-between whitespace-nowrap"
        >
          <span className="text-gray-800">🍕 피자 후원</span>
          <span className="ml-2 font-semibold text-gray-700">5,000원</span>
        </button>
      </div>

      {/* 하단 안내 문구 */}
      <p className="text-center text-xs text-gray-400 mt-8 mb-6">
        후원 금액은 서비스 유지 및 기능 개선에 사용됩니다.
      </p>
    </div>
  );
};

export default SupportDeveloperPage;

