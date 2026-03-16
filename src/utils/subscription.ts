import { ENABLE_SUBSCRIPTION } from '../subscription/config';

/**
 * 프로모션: 2025년 5월 31일까지 프리미엄 기능 무료 허용, 이후 자동 종료
 * - 현재는 구독 기능 비공개 상태이므로, ENABLE_SUBSCRIPTION=false일 때는 항상 false를 반환하여
 *   별도 프로모션 문구가 노출되지 않도록 합니다.
 */
export function isPromoActive(): boolean {
  if (!ENABLE_SUBSCRIPTION) return false;
  const promoEnd = new Date('2025-05-31T23:59:59');
  const now = new Date();
  return now <= promoEnd;
}

/**
 * 프리미엄 기능 접근 가능 여부
 * - 현재 런칭 버전: ENABLE_SUBSCRIPTION=false ⇒ 모든 사용자를 프리미엄으로 간주 (항상 true)
 * - 추후 구독 기능 오픈: ENABLE_SUBSCRIPTION=true 로 전환 후, 플랜/프로모션 기반으로 분기
 */
export function hasPremiumAccess(userPlan: string): boolean {
  // 구독 기능 비활성화 상태에서는 모든 사용자에게 프리미엄 기능 허용
  if (!ENABLE_SUBSCRIPTION) return true;

  if (userPlan === 'premium') return true;
  if (isPromoActive()) return true;
  return false;
}
