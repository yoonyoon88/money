/**
 * 앱 버전 (Gradle versionCode / versionName와 맞춰 관리)
 *
 * - 배포 시 이 값과 android/app/build.gradle의 versionCode, versionName를 함께 올려주세요.
 * - 새 버전 배포 후 Firebase 콘솔 > Remote Config에서 app_latest_version_code, app_latest_version_name 값을
 *   이 파일과 동일하게 올려주면 사용자에게 "새 버전이 있어요" 배너가 표시됩니다.
 * - Capacitor 빌드 시 네이티브에서 주입하려면 이 파일을 빌드 스크립트로 교체하면 됩니다.
 */
export const CURRENT_VERSION_CODE = 29;
export const CURRENT_VERSION_NAME = '1.0.0';
