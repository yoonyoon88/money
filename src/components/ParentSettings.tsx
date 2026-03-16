import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { useApp } from '../context/AppContext';
import { auth } from '../firebase/config';
import { getSubscriptionPlan } from '../types';
import { hasPremiumAccess } from '../utils/subscription';
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '../constants/policyUrls';
import PinResetModal from './PinResetModal';
import { CURRENT_VERSION_NAME } from '../constants/version';
import { ENABLE_SUBSCRIPTION } from '../subscription/config';

type SubscriptionPlan = 'free' | 'premium';

function getPlanUI(plan: SubscriptionPlan) {
  if (plan === 'premium') {
    return {
      planLabel: '프리미엄',
      badgeText: '이용 중',
      badgeClass: 'bg-amber-100 text-amber-700 text-xs px-3 py-1 rounded-full',
    };
  }
  return {
    planLabel: '무료',
    badgeText: '무료',
    badgeClass: 'bg-gray-100 text-gray-600 text-xs px-3 py-1 rounded-full',
  };
}

const ParentSettings: React.FC = () => {
  const { user } = useApp();
  const navigate = useNavigate();
  const [showPinResetModal, setShowPinResetModal] = useState(false);

  const displayName = auth.currentUser?.displayName ?? user?.name ?? '-';
  const email = auth.currentUser?.email ?? user?.email ?? '-';

  const subscriptionPlan = getSubscriptionPlan(user);
  const planUI = getPlanUI(hasPremiumAccess(subscriptionPlan) ? 'premium' : subscriptionPlan);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login', { replace: true });
    } catch {
      alert('로그아웃에 실패했습니다.');
    }
  };

  return (
    <div className="mx-auto min-h-screen w-full overflow-y-auto bg-[#FFFEF9] px-5 pt-4 pb-24">
      {/* 상단 제목 */}
      <h1 className="text-lg font-semibold text-center py-4 text-gray-800">설정</h1>

      {/* 1️⃣ 프로필 카드 */}
      <div className="bg-white rounded-2xl shadow-sm p-4 flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-sm font-semibold text-gray-600">
          {(displayName !== '-' ? displayName[0] : '?').toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-gray-800 truncate">{displayName}</p>
          <p className="text-sm text-gray-500 truncate">{email}</p>
        </div>
      </div>

      {/* 2️⃣ 보안 설정 카드 */}
      <div className="bg-white rounded-2xl shadow-sm p-4 mt-4">
        <p className="text-sm text-gray-500 mb-3">보안</p>
        <button
          type="button"
          onClick={() => setShowPinResetModal(true)}
          className="w-full flex justify-between items-center py-2 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
        >
          <span className="text-sm">부모 PIN 변경</span>
          <span className="text-gray-400 text-lg">›</span>
        </button>
      </div>

      {/* 3️⃣ 서비스 메뉴 카드 */}
      <div className="bg-white rounded-2xl shadow-sm mt-4 overflow-hidden">
        {/* 개발자 후원하기 항목은 현재 숨김 처리 */}
        <button
          type="button"
          onClick={() =>
            navigate(`/policy?title=이용약관&url=${encodeURIComponent(TERMS_OF_SERVICE_URL)}`)
          }
          className="w-full flex justify-between items-center px-4 py-3 border-b border-gray-100 text-gray-700 hover:bg-gray-50 transition-colors text-left"
        >
          <span className="text-sm">이용약관</span>
          <span className="text-gray-400 text-lg">›</span>
        </button>
        <button
          type="button"
          onClick={() =>
            navigate(
              `/policy?title=개인정보처리방침&url=${encodeURIComponent(PRIVACY_POLICY_URL)}`
            )
          }
          className="w-full flex justify-between items-center px-4 py-3 text-gray-700 hover:bg-gray-50 transition-colors text-left"
        >
          <span className="text-sm">개인정보처리방침</span>
          <span className="text-gray-400 text-lg">›</span>
        </button>
      </div>

      {/* 4️⃣ 앱 정보 */}
      <div className="text-center text-sm text-gray-400 mt-4">앱 버전 v{CURRENT_VERSION_NAME}</div>

      {/* 5️⃣ 로그아웃 버튼 */}
      <button
        type="button"
        onClick={handleLogout}
        className="w-full mt-6 h-12 rounded-xl bg-red-500 text-white font-medium hover:bg-red-600 active:opacity-90 transition-colors"
      >
        로그아웃
      </button>

      {/* PIN 재설정 모달 */}
      <PinResetModal
        isOpen={showPinResetModal}
        onSuccess={() => setShowPinResetModal(false)}
        onCancel={() => setShowPinResetModal(false)}
      />
    </div>
  );
};

export default ParentSettings;
