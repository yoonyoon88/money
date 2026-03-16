import React from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { useApp } from '../context/AppContext';
import { auth } from '../firebase/config';
import { getSubscriptionPlan } from '../types';
import { hasPremiumAccess } from '../utils/subscription';
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '../constants/policyUrls';
import { CURRENT_VERSION_NAME } from '../constants/version';
import { ENABLE_SUBSCRIPTION } from '../subscription/config';

type SubscriptionPlan = 'free' | 'premium';

function getPlanUI(plan: SubscriptionPlan) {
  if (plan === 'premium') {
    return {
      planLabel: '프리미엄',
      badgeText: '이용 중',
      badgeClass: 'bg-yellow-100 text-yellow-700 text-xs px-3 py-1 rounded-full',
    };
  }
  return {
    planLabel: '무료',
    badgeText: '무료',
    badgeClass: 'bg-gray-100 text-gray-600 text-xs px-3 py-1 rounded-full',
  };
}

const Settings: React.FC = () => {
  const { user } = useApp();
  const navigate = useNavigate();

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
    <div className="mx-auto min-h-screen w-full overflow-y-auto bg-[#FFFEF9] pb-20">
      <header className="relative flex items-center justify-between px-4 pt-3 pb-1">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="z-10 text-lg text-gray-600 transition-colors hover:text-gray-800"
          aria-label="뒤로가기"
        >
          ←
        </button>
        <h1 className="absolute inset-0 flex items-center justify-center text-lg font-semibold text-gray-800 pointer-events-none">
          설정
        </h1>
        <button
          type="button"
          onClick={handleLogout}
          className="z-10 text-sm text-red-500 font-medium transition-colors hover:text-red-600"
        >
          로그아웃
        </button>
      </header>

      <div className="px-4 pt-3 space-y-3">
        {/* 프로필 카드 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-600">
              {(displayName !== '-' ? displayName[0] : '?').toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold text-gray-800 truncate">{displayName}</p>
              <p className="text-sm text-gray-500 truncate">{email}</p>
            </div>
          </div>
        </div>

        {/* 플랜 카드 - 초기 런칭 단계에서는 숨김 (ENABLE_SUBSCRIPTION=false) */}
        {ENABLE_SUBSCRIPTION && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mt-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">현재 플랜</p>
                <p className="text-base font-semibold text-gray-800">{planUI.planLabel}</p>
              </div>
              <span className={planUI.badgeClass}>{planUI.badgeText}</span>
            </div>
            <button
              type="button"
              onClick={() => navigate('/parent/subscription')}
              className="mt-3 w-full bg-gray-100 hover:bg-gray-200 text-xs rounded-xl py-2 transition font-medium text-gray-700"
            >
              결제 관리
            </button>
          </div>
        )}

        {/* 이용약관 / 개인정보처리방침 카드 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mt-3 overflow-hidden">
          <button
            type="button"
            onClick={() =>
              navigate(`/policy?title=이용약관&url=${encodeURIComponent(TERMS_OF_SERVICE_URL)}`)
            }
            className="flex w-full cursor-pointer items-center justify-between py-3 px-4 text-sm text-gray-700 hover:bg-gray-50 transition border-b border-gray-100"
          >
            <span>이용약관</span>
            <svg className="h-5 w-5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
          </button>
          <button
            type="button"
            onClick={() =>
              navigate(
                `/policy?title=개인정보처리방침&url=${encodeURIComponent(PRIVACY_POLICY_URL)}`
              )
            }
            className="flex w-full cursor-pointer items-center justify-between py-3 px-4 text-sm text-gray-700 hover:bg-gray-50 transition"
          >
            <span>개인정보처리방침</span>
            <svg className="h-5 w-5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* 메뉴 리스트 카드: 앱 버전 (개발자 후원 항목은 현재 숨김 처리) */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mt-3">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-xs text-gray-500">앱 버전</span>
            <span className="text-xs text-gray-400">v{CURRENT_VERSION_NAME}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
