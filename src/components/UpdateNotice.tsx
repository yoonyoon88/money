import React, { useEffect, useState } from 'react';
import { getLatestVersionInfo, isUpdateAvailable } from '../firebase/remoteConfig';
import { CURRENT_VERSION_CODE } from '../constants/version';

const STORAGE_KEY_DISMISSED = 'app_update_dismissed_version_code';

export default function UpdateNotice() {
  const [show, setShow] = useState(false);
  const [latestVersionName, setLatestVersionName] = useState<string | null>(null);
  const [latestVersionCode, setLatestVersionCode] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const latest = await getLatestVersionInfo();
        if (cancelled) return;
        const dismissed = Number(localStorage.getItem(STORAGE_KEY_DISMISSED) || '0');
        if (latest.versionCode <= dismissed) return;
        if (!isUpdateAvailable(CURRENT_VERSION_CODE, latest.versionCode)) return;
        setLatestVersionName(latest.versionName);
        setLatestVersionCode(latest.versionCode);
        setShow(true);
      } catch {
        // 무시
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleUpdate = () => {
    window.location.reload();
  };

  const handleDismiss = () => {
    if (latestVersionCode > 0) {
      localStorage.setItem(STORAGE_KEY_DISMISSED, String(latestVersionCode));
    }
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] mx-auto px-4 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2">
      <div className="bg-blue-600 text-white rounded-xl shadow-lg px-4 py-3 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">새 버전이 있어요</p>
          <p className="text-blue-100 text-xs mt-0.5">
            {latestVersionName ? `v${latestVersionName}로 업데이트할 수 있어요` : '최신 버전으로 업데이트해 주세요'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={handleDismiss}
            className="px-3 py-1.5 text-blue-200 hover:text-white text-xs font-medium transition-colors"
          >
            나중에
          </button>
          <button
            type="button"
            onClick={handleUpdate}
            className="px-4 py-2 bg-white text-blue-600 rounded-lg text-sm font-semibold hover:bg-blue-50 active:bg-blue-100 transition-colors"
          >
            업데이트
          </button>
        </div>
      </div>
    </div>
  );
}
