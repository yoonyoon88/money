import { remoteConfig } from './config';
import { fetchAndActivate, getValue } from 'firebase/remote-config';
import { CURRENT_VERSION_CODE } from '../constants/version';

/** Remote Config 키 (Firebase 콘솔에서 동일한 키로 파라미터 생성) */
export const REMOTE_CONFIG_KEYS = {
  APP_LATEST_VERSION_CODE: 'app_latest_version_code',
  APP_LATEST_VERSION_NAME: 'app_latest_version_name',
  FORCE_UPDATE:            'force_update',
} as const;

/** 기본값: fetch 전 또는 실패 시 사용 (현재 버전 = 업데이트 알림 없음) */
remoteConfig.defaultConfig = {
  [REMOTE_CONFIG_KEYS.APP_LATEST_VERSION_CODE]: String(CURRENT_VERSION_CODE),
  [REMOTE_CONFIG_KEYS.APP_LATEST_VERSION_NAME]: '1.0.0',
  [REMOTE_CONFIG_KEYS.FORCE_UPDATE]:            'false',
};

/** 개발 환경: Remote Config 캐시 비활성화 */
if (import.meta.env.DEV) {
  remoteConfig.settings = {
    ...remoteConfig.settings,
    minimumFetchIntervalMillis: 0,
  };
}

export interface LatestVersionInfo {
  versionCode:  number;
  versionName:  string;
  forceUpdate:  boolean;
}

/**
 * Remote Config에서 최신 버전 정보를 가져옵니다.
 * 실패 시 기본값(현재 버전) 반환 → 팝업 미표시
 */
export async function getLatestVersionInfo(): Promise<LatestVersionInfo> {
  try {
    await fetchAndActivate(remoteConfig);
  } catch {
    return { versionCode: CURRENT_VERSION_CODE, versionName: '1.0.0', forceUpdate: false };
  }

  const versionCode = Number(getValue(remoteConfig, REMOTE_CONFIG_KEYS.APP_LATEST_VERSION_CODE).asString()) || CURRENT_VERSION_CODE;
  const versionName = getValue(remoteConfig, REMOTE_CONFIG_KEYS.APP_LATEST_VERSION_NAME).asString() || '1.0.0';
  const forceUpdate = getValue(remoteConfig, REMOTE_CONFIG_KEYS.FORCE_UPDATE).asBoolean();

  return { versionCode, versionName, forceUpdate };
}

/** 현재 앱 버전이 최신보다 낮으면 true */
export function isUpdateAvailable(currentCode: number, latestCode: number): boolean {
  return latestCode > currentCode;
}
