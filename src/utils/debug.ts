/**
 * 디버그 모드 제어 유틸리티
 * 
 * 환경 변수 VITE_DEBUG_TIME으로 제어
 * - 'true': 디버그 모드 활성화 (로그 출력, 디버그 패널 표시)
 * - 'false' 또는 미설정: 디버그 모드 비활성화 (production 모드)
 * 
 * 사용 예시:
 * ```typescript
 * import { isDebugTimeEnabled, debugLog } from '../utils/debug';
 * 
 * // 또는
 * debugLog('디버그 정보', { data: 'value' });
 * ```
 */

/**
 * 디버그 모드 활성화 여부
 * 
 * 환경 변수 VITE_DEBUG_TIME이 'true'인 경우에만 true
 * 기본값: false (production 안전)
 */
export const isDebugTimeEnabled = import.meta.env.VITE_DEBUG_TIME === 'true';

/**
 * 디버그 로그 출력 (조건부)
 * 
 * @param message - 로그 메시지
 * @param data - 추가 데이터 (선택)
 */
export const debugLog = (message: string, data?: any): void => {
};

/**
 * 디버그 그룹 시작 (조건부)
 * 
 * @param label - 그룹 레이블
 */
export const debugGroup = (label: string): void => {
};

/**
 * 디버그 그룹 종료 (조건부)
 */
export const debugGroupEnd = (): void => {
};

/**
 * 디버그 경고 출력 (조건부)
 * 
 * @param message - 경고 메시지
 * @param data - 추가 데이터 (선택)
 */
export const debugWarn = (message: string, data?: any): void => {
};

/**
 * 디버그 에러 출력 (조건부)
 * 
 * ⚠️ 주의: 에러는 항상 출력됩니다 (디버그 모드와 무관)
 * 
 * @param message - 에러 메시지
 * @param data - 추가 데이터 (선택)
 */
export const debugError = (message: string, data?: any): void => {
};

