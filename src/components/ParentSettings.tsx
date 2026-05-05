import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { useApp } from '../context/AppContext';
import { auth } from '../firebase/config';
import { getSubscriptionPlan } from '../types';
import { hasPremiumAccess } from '../utils/subscription';
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '../constants/policyUrls';
import PinResetModal from './PinResetModal';
import { CURRENT_VERSION_NAME } from '../constants/version';
import { ENABLE_SUBSCRIPTION } from '../subscription/config';
import {
  cancelAllReminders,
  getNotificationSettings,
  scheduleAllReminders,
  updateNotificationSetting,
  type NotificationSettings,
} from '../services/notificationService';

type SubscriptionPlan = 'free' | 'premium';

function getPlanUI(plan: SubscriptionPlan) {
  if (plan === 'premium') {
    return {
      planLabel: '프리미엄',
      badgeText: '이용 중',
      badgeClass: 'rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700',
    };
  }

  return {
    planLabel: '무료',
    badgeText: '무료',
    badgeClass: 'rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600',
  };
}

const reminderToggleItems: Array<{
  key: keyof NotificationSettings;
  label: string;
  time: string;
}> = [
  { key: 'morning', label: '아침', time: '09:00' },
  { key: 'lunch', label: '점심', time: '12:00' },
  { key: 'dinner', label: '저녁', time: '19:00' },
];

const ParentSettings: React.FC = () => {
  const { user } = useApp();
  const navigate = useNavigate();
  const [showPinResetModal, setShowPinResetModal] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(
    () => getNotificationSettings()
  );

  const displayName = auth.currentUser?.displayName ?? user?.name ?? '-';
  const email = auth.currentUser?.email ?? user?.email ?? '-';
  const subscriptionPlan = getSubscriptionPlan(user);
  const planUI = getPlanUI(hasPremiumAccess(subscriptionPlan) ? 'premium' : subscriptionPlan);

  const handleToggleReminder = async (
    key: keyof NotificationSettings,
    enabled: boolean
  ) => {
    const nextSettings = updateNotificationSetting(key, enabled);
    setNotificationSettings(nextSettings);

    if (!Capacitor.isNativePlatform()) {
      return;
    }

    if (Object.values(nextSettings).some(Boolean)) {
      await scheduleAllReminders(nextSettings);
      return;
    }

    await cancelAllReminders();
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login', { replace: true });
    } catch {
      alert('로그아웃에 실패했습니다.');
    }
  };

  return (
    <div className="mx-auto w-full bg-[#FFFEF9] px-4 pb-[72px] pt-1.5">
      <h1 className="py-1.5 text-center text-base font-semibold text-gray-800">설정</h1>

      <div className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2 shadow-sm">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-600">
          {(displayName !== '-' ? displayName[0] : '?').toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-tight text-gray-800">{displayName}</p>
          <p className="mt-0.5 truncate text-[11px] leading-tight text-gray-500">{email}</p>
        </div>
      </div>

      <div className="mt-2 overflow-hidden rounded-2xl bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setShowPinResetModal(true)}
          className="flex w-full items-center justify-between px-3 py-2.5 text-gray-700 transition-colors hover:bg-gray-50"
        >
          <span className="text-sm">부모 PIN 변경</span>
          <span className="text-base text-gray-400">›</span>
        </button>
      </div>

      {ENABLE_SUBSCRIPTION && (
        <div className="mt-2 rounded-2xl bg-white px-3 py-2.5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] text-gray-500">현재 플랜</p>
              <p className="text-sm font-semibold text-gray-800">{planUI.planLabel}</p>
            </div>
            <span className={planUI.badgeClass}>{planUI.badgeText}</span>
          </div>
          <button
            type="button"
            onClick={() => navigate('/parent/subscription')}
            className="mt-2 w-full rounded-xl bg-gray-100 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-200"
          >
            결제 관리
          </button>
        </div>
      )}

      <div className="mt-2 overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="border-b border-gray-100 px-3 py-1.5">
          <p className="text-sm font-medium text-gray-800">알림 설정</p>
        </div>
        {reminderToggleItems.map((item, index) => {
          const enabled = notificationSettings[item.key];

          return (
            <div
              key={item.key}
              className={`flex items-center justify-between px-3 py-2 ${
                index !== reminderToggleItems.length - 1 ? 'border-b border-gray-100' : ''
              }`}
            >
              <p className="text-sm leading-none text-gray-800">
                {item.label} <span className="text-gray-400">({item.time})</span>
              </p>
              <button
                type="button"
                onClick={() => handleToggleReminder(item.key, !enabled)}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors focus:outline-none ${
                  enabled ? 'border-blue-500 bg-blue-500' : 'border-gray-300 bg-gray-200'
                }`}
                aria-label={`${item.label} 알림`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
                    enabled ? 'translate-x-[18px]' : 'translate-x-[2px]'
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-2 overflow-hidden rounded-2xl border border-gray-100/70 bg-[#F8F9FB] shadow-sm">
        <button
          type="button"
          onClick={() => window.open('market://details?id=com.yondone.app', '_system')}
          className="flex w-full items-center justify-between border-b border-gray-100 px-3 py-2.5 text-left text-gray-700 transition-colors hover:bg-[#F2F4F7]"
        >
          <div className="flex items-center gap-2">
            <span className="text-amber-500">★</span>
            <span className="text-sm">앱 평가하기</span>
          </div>
          <span className="text-base text-gray-400">›</span>
        </button>
        <button
          type="button"
          onClick={() =>
            navigate(`/policy?title=이용약관&url=${encodeURIComponent(TERMS_OF_SERVICE_URL)}`)
          }
          className="flex w-full items-center justify-between border-b border-gray-100 px-3 py-2.5 text-left text-gray-700 transition-colors hover:bg-[#F2F4F7]"
        >
          <span className="text-sm">이용약관</span>
          <span className="text-base text-gray-400">›</span>
        </button>
        <button
          type="button"
          onClick={() =>
            navigate(
              `/policy?title=개인정보처리방침&url=${encodeURIComponent(PRIVACY_POLICY_URL)}`
            )
          }
          className="flex w-full items-center justify-between px-3 py-2.5 text-left text-gray-700 transition-colors hover:bg-[#F2F4F7]"
        >
          <span className="text-sm">개인정보처리방침</span>
          <span className="text-base text-gray-400">›</span>
        </button>
      </div>

      <div className="mt-1.5 text-center text-[11px] text-gray-400">앱 버전 v{CURRENT_VERSION_NAME}</div>

      <button
        type="button"
        onClick={handleLogout}
        className="mt-2.5 h-9 w-full rounded-xl bg-red-500 text-sm font-medium text-white transition-colors hover:bg-red-600 active:opacity-90"
      >
        로그아웃
      </button>

      <PinResetModal
        isOpen={showPinResetModal}
        onSuccess={() => setShowPinResetModal(false)}
        onCancel={() => setShowPinResetModal(false)}
      />
    </div>
  );
};

export default ParentSettings;
