import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { useApp } from '../context/AppContext';
import { auth } from '../firebase/config';
import { getSubscriptionPlan } from '../types';
import { hasPremiumAccess } from '../utils/subscription';
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '../constants/policyUrls';
import { CURRENT_VERSION_NAME } from '../constants/version';
import { ENABLE_SUBSCRIPTION } from '../subscription/config';
import {
  cancelAllReminders,
  getNotificationSettings,
  getReminderSchedulePreview,
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
      badgeClass: 'bg-yellow-100 text-yellow-700 text-xs px-3 py-1 rounded-full',
    };
  }

  return {
    planLabel: '무료',
    badgeText: '무료',
    badgeClass: 'bg-gray-100 text-gray-600 text-xs px-3 py-1 rounded-full',
  };
}

const reminderToggleItems: Array<{
  key: keyof NotificationSettings;
  label: string;
  description: string;
}> = [
  { key: 'morning', label: '아침 알림', description: '매일 오전 9:00' },
  { key: 'lunch', label: '점심 알림', description: '매일 오후 12:00' },
  { key: 'dinner', label: '저녁 알림', description: '매일 오후 7:00' },
];

const Settings: React.FC = () => {
  const { user } = useApp();
  const navigate = useNavigate();
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(
    () => getNotificationSettings()
  );
  const reminderSchedulePreview = getReminderSchedulePreview(notificationSettings);

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
    <div className="mx-auto min-h-screen w-full overflow-y-auto bg-[#FFFEF9] pb-20">
      <header className="relative flex items-center justify-between px-4 pb-1 pt-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="z-10 text-lg text-gray-600 transition-colors hover:text-gray-800"
          aria-label="뒤로가기"
        >
          ←
        </button>
        <h1 className="pointer-events-none absolute inset-0 flex items-center justify-center text-lg font-semibold text-gray-800">
          설정
        </h1>
        <button
          type="button"
          onClick={handleLogout}
          className="z-10 text-sm font-medium text-red-500 transition-colors hover:text-red-600"
        >
          로그아웃
        </button>
      </header>

      <div className="space-y-3 px-4 pt-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-3.5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-600">
              {(displayName !== '-' ? displayName[0] : '?').toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold text-gray-800">{displayName}</p>
              <p className="truncate text-sm text-gray-500">{email}</p>
            </div>
          </div>
        </div>

        {ENABLE_SUBSCRIPTION && (
          <div className="mt-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
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
              className="mt-3 w-full rounded-xl bg-gray-100 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-200"
            >
              결제 관리
            </button>
          </div>
        )}

        <div className="mt-3 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          {reminderToggleItems.map((item, index) => {
            const enabled = notificationSettings[item.key];

            return (
              <div
                key={item.key}
                className={`flex items-center justify-between px-4 py-3 ${
                  index !== reminderToggleItems.length - 1 ? 'border-b border-gray-100' : ''
                }`}
              >
                <div>
                  <p className="text-sm font-medium text-gray-800">{item.label}</p>
                  <p className="mt-0.5 text-xs text-gray-400">{item.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleReminder(item.key, !enabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                    enabled ? 'bg-blue-500' : 'bg-gray-200'
                  }`}
                  aria-label={item.label}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      enabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>

        {/* TODO: 배포 전 알림 디버그 UI 제거 */}
        <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50 px-4 py-3 text-sm text-gray-700 shadow-sm">
          <p className="font-medium text-blue-700">알림 예약 시간 확인용</p>
          <div className="mt-2 space-y-1">
            <p>아침 알림: {reminderSchedulePreview.morning}</p>
            <p>점심 알림: {reminderSchedulePreview.lunch}</p>
            <p>저녁 알림: {reminderSchedulePreview.dinner}</p>
          </div>
        </div>

        <div className="mt-3 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => window.open('market://details?id=com.yondone.app', '_system')}
            className="flex w-full items-center justify-between px-4 py-3 text-sm text-gray-700 transition hover:bg-gray-50"
          >
            <div className="flex items-center gap-2">
              <span>★</span>
              <span>앱 평가하기</span>
            </div>
            <svg
              className="h-5 w-5 flex-shrink-0 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <div className="mt-3 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <button
            type="button"
            onClick={() =>
              navigate(`/policy?title=이용약관&url=${encodeURIComponent(TERMS_OF_SERVICE_URL)}`)
            }
            className="flex w-full cursor-pointer items-center justify-between border-b border-gray-100 px-4 py-3 text-sm text-gray-700 transition hover:bg-gray-50"
          >
            <span>이용약관</span>
            <svg
              className="h-5 w-5 flex-shrink-0 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
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
            className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-sm text-gray-700 transition hover:bg-gray-50"
          >
            <span>개인정보처리방침</span>
            <svg
              className="h-5 w-5 flex-shrink-0 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <div className="mt-3 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
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
