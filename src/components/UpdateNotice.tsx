import React, { useEffect, useState } from 'react';
import { getLatestVersionInfo, isUpdateAvailable } from '../firebase/remoteConfig';
import { CURRENT_VERSION_CODE } from '../constants/version';

const PLAY_STORE_URL = 'market://details?id=com.yondone.app';

// "나중에" 눌렀을 때 억제 만료 타임스탬프 저장 키
const SNOOZE_UNTIL_KEY = 'app_update_snooze_until';

function openPlayStore() {
  window.open(PLAY_STORE_URL, '_system');
}

function isSnoozed(): boolean {
  const until = Number(localStorage.getItem(SNOOZE_UNTIL_KEY) || '0');
  return Date.now() < until;
}

function snoozeForOneDay() {
  const until = Date.now() + 24 * 60 * 60 * 1000;
  localStorage.setItem(SNOOZE_UNTIL_KEY, String(until));
}

// ─────────────────────────────────────────────
// 강제 업데이트 팝업 (닫기 버튼 없음)
// ─────────────────────────────────────────────
function ForceUpdateModal({ versionName }: { versionName: string }) {
  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-[200]" />
      <div className="fixed inset-0 z-[201] flex items-center justify-center px-6">
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden">
          {/* 헤더 */}
          <div className="bg-orange-500 px-6 py-5 text-center">
            <div className="text-4xl mb-2">🚀</div>
            <p className="text-white font-bold text-lg">업데이트가 필요해요</p>
          </div>

          {/* 본문 */}
          <div className="px-6 py-5 text-center">
            <p className="text-gray-700 text-sm leading-relaxed">
              더 나은 서비스를 위해 앱을 최신 버전으로
              업데이트해 주세요.
            </p>
            {versionName && (
              <p className="text-orange-500 font-semibold text-sm mt-2">최신 버전 v{versionName}</p>
            )}
          </div>

          {/* 버튼 */}
          <div className="px-6 pb-6">
            <button
              type="button"
              onClick={openPlayStore}
              className="w-full py-3.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-2xl text-sm transition-colors active:scale-95"
            >
              지금 업데이트
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────
// 선택 업데이트 팝업 (나중에 / 지금 업데이트)
// ─────────────────────────────────────────────
function OptionalUpdateModal({
  versionName,
  onDismiss,
}: {
  versionName: string;
  onDismiss: () => void;
}) {
  const handleLater = () => {
    snoozeForOneDay();
    onDismiss();
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[200]" onClick={handleLater} />
      <div className="fixed inset-0 z-[201] flex items-center justify-center px-6">
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden">
          {/* 헤더 */}
          <div className="bg-blue-500 px-6 py-5 text-center">
            <div className="text-4xl mb-2">✨</div>
            <p className="text-white font-bold text-lg">새 버전이 있어요</p>
          </div>

          {/* 본문 */}
          <div className="px-6 py-5 text-center">
            <p className="text-gray-700 text-sm leading-relaxed">
              더 좋아진 기능과 개선사항이 준비됐어요.
              지금 업데이트해 보세요!
            </p>
            {versionName && (
              <p className="text-blue-500 font-semibold text-sm mt-2">최신 버전 v{versionName}</p>
            )}
          </div>

          {/* 버튼 */}
          <div className="px-6 pb-6 flex gap-3">
            <button
              type="button"
              onClick={handleLater}
              className="flex-1 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold rounded-2xl text-sm transition-colors"
            >
              나중에
            </button>
            <button
              type="button"
              onClick={openPlayStore}
              className="flex-1 py-3.5 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-2xl text-sm transition-colors active:scale-95"
            >
              지금 업데이트
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────
export default function UpdateNotice() {
  const [state, setState] = useState<{
    show: boolean;
    forceUpdate: boolean;
    versionName: string;
  }>({ show: false, forceUpdate: false, versionName: '' });

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const latest = await getLatestVersionInfo();
        if (cancelled) return;
        if (!isUpdateAvailable(CURRENT_VERSION_CODE, latest.versionCode)) return;

        // 선택 업데이트이고 오늘 이미 "나중에" 눌렀으면 스킵
        if (!latest.forceUpdate && isSnoozed()) return;

        setState({ show: true, forceUpdate: latest.forceUpdate, versionName: latest.versionName });
      } catch {
        // 네트워크 오류 등 → 무시
      }
    }

    check();
    return () => { cancelled = true; };
  }, []);

  if (!state.show) return null;

  if (state.forceUpdate) {
    return <ForceUpdateModal versionName={state.versionName} />;
  }

  return (
    <OptionalUpdateModal
      versionName={state.versionName}
      onDismiss={() => setState((s) => ({ ...s, show: false }))}
    />
  );
}
