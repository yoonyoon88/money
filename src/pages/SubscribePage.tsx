import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { getSubscriptionPlan } from '../types';
import { hasPremiumAccess } from '../utils/subscription';

const FREE_BENEFITS = [
  '자녀 1명 관리',
  '기본 미션 / 포인트',
  '광고 포함',
];

const PREMIUM_BENEFITS = [
  '자녀 최대 5명',
  '사진 인증 무제한',
  '전체 리포트 보기',
  '광고 제거',
];

const SubscribePage: React.FC = () => {
  const { user } = useApp();
  const navigate = useNavigate();
  const isPremium = hasPremiumAccess(getSubscriptionPlan(user));

  const handleStartPremium = () => {
    if (!user?.id || isPremium) return;
    alert('구독 기능은 준비 중입니다.');
  };

  return (
    <div className="min-h-screen bg-[#FFFEF9]">
      <div className="mx-auto px-4 pt-6 pb-28">
        {/* 상단 헤더: 뒤로가기 + 제목 */}
        <div className="flex items-center justify-between mt-2 mb-4">
          <button
            type="button"
            onClick={() => navigate('/parent/settings')}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-700 transition-colors"
            aria-label="뒤로가기"
          >
            ←
          </button>
          <h1 className="text-lg font-semibold text-gray-800">
            결제 관리
          </h1>
          <div className="w-8" />
        </div>

        {/* 현재 플랜 카드 (상단) */}
        <div className="rounded-3xl bg-gradient-to-r from-indigo-500 to-blue-500 text-white p-6 mt-4">
          <p className="text-white/90 text-xs">현재 플랜</p>
          <p className="text-xl font-bold text-white mt-0.5">
            {isPremium ? '프리미엄' : '무료'}
          </p>
        </div>

        {/* 플랜 비교 영역: 2열 */}
        <div className="grid grid-cols-2 gap-4 mt-6">
          {/* 무료 카드 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 flex flex-col justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-800">무료</h2>
              <p className="text-lg font-bold text-gray-800 mt-1">0원 / 월</p>
              <ul className="text-sm text-gray-600 space-y-2 mt-3">
                {FREE_BENEFITS.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
            <div className="mt-4">
              {!isPremium ? (
                <div className="w-full bg-gray-200 text-gray-600 rounded-xl py-3 font-medium text-center text-sm">
                  적용 중
                </div>
              ) : null}
            </div>
          </div>

          {/* 프리미엄 카드 */}
          <div
            className={`bg-white rounded-2xl shadow-sm border-2 border-indigo-500 p-5 flex flex-col justify-between ${
              isPremium ? 'bg-indigo-50' : ''
            }`}
          >
            <div>
              <h2 className="text-base font-bold text-gray-800">프리미엄</h2>
              <p className="text-lg font-bold text-gray-800 mt-1">2,900원 / 월</p>
              <ul className="text-sm text-gray-700 space-y-2 mt-3">
                {PREMIUM_BENEFITS.map((b) => (
                  <li key={b} className="flex items-center gap-1.5">
                    <span className="text-indigo-500 shrink-0">✓</span>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-4">
              {isPremium ? (
                <div className="w-full bg-gray-200 text-gray-600 rounded-xl py-3 font-medium text-center text-sm">
                  적용 중
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleStartPremium}
                  className="w-full bg-indigo-600 text-white rounded-xl py-3 font-semibold text-sm hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                >
                  구독 준비 중
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SubscribePage;
