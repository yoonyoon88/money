import { remoteConfig } from './config';
import { fetchAndActivate, getValue } from 'firebase/remote-config';
import { CURRENT_VERSION_CODE } from '../constants/version';

/** Remote Config 키 (Firebase 콘솔에서 동일한 키로 파라미터 생성) */
export const REMOTE_CONFIG_KEYS = {
  APP_LATEST_VERSION_CODE: 'app_latest_version_code',
  APP_LATEST_VERSION_NAME: 'app_latest_version_name',
} as const;

/** 기본값: fetch 전 또는 실패 시 사용 (현재 버전과 맞춰 두면 업데이트 알림이 뜨지 않음) */
remoteConfig.defaultConfig = {
  [REMOTE_CONFIG_KEYS.APP_LATEST_VERSION_CODE]: String(CURRENT_VERSION_CODE),
  [REMOTE_CONFIG_KEYS.APP_LATEST_VERSION_NAME]: '1.0.0',
};

/** 개발 시 캐시 제한 완화 (선택) */
if (import.meta.env.DEV) {
  (remoteConfig as { settings?: { minimumFetchIntervalMillis?: number } }).settings =
    (remoteConfig as { settings?: { minimumFetchIntervalMillis?: number } }).settings || {};
  (remoteConfig as { settings: { minimumFetchIntervalMillis: number } }).settings.minimumFetchIntervalMillis = 0;
}

export interface LatestVersionInfo {
  versionCode: number;
  versionName: string;
}

/**
 * Remote Config에서 최신 버전 정보를 가져옵니다.
 * 배포 시 Firebase 콘솔에서 app_latest_version_code, app_latest_version_name 값을 올려주세요.
 */
export async function getLatestVersionInfo(): Promise<LatestVersionInfo> {
  try {
    await fetchAndActivate(remoteConfig);
  } catch {
    // 네트워크 오류 등 시 기본값(현재 버전) 반환 → 업데이트 알림 안 띄움
    return {
      versionCode: CURRENT_VERSION_CODE,
      versionName: '1.0.0',
    };
  }
  const versionCodeVal = getValue(remoteConfig, REMOTE_CONFIG_KEYS.APP_LATEST_VERSION_CODE);
  const versionNameVal = getValue(remoteConfig, REMOTE_CONFIG_KEYS.APP_LATEST_VERSION_NAME);
  return {
    versionCode: Number(versionCodeVal.asString()) || CURRENT_VERSION_CODE,
    versionName: versionNameVal.asString() || '1.0.0',
  };
}

/** 현재 앱 버전이 최신보다 낮으면 true */
export function isUpdateAvailable(currentCode: number, latestCode: number): boolean {
  return latestCode > currentCode;
}
