/**
 * 구독/프리미엄 관련 핵심 로직
 * - 향후 Play Billing 연동 시 이 모듈 중심으로 확장
 */
export function isPromoActive(): boolean {
  // 기존 프로모션 로직 유지 (필요 시 날짜만 갱신)
  const promoEnd = new Date('2025-05-31T23:59:59');
  const now = new Date();
  return now <= promoEnd;
}

/**
 * 플랜 문자열 기반 프리미엄 접근 여부
 * - 'premium' 플랜이거나 프로모션 기간이면 true
 * - 기존 free/premium 분기 로직과의 하위 호환을 위해 유지
 */
export function hasPremiumAccess(userPlan: string): boolean {
  if (userPlan === 'premium') return true;
  if (isPromoActive()) return true;
  return false;
}

/**
 * 신규 가입 사용자용 기본 구독 필드
 * - 현재: 모두 프리미엄 (런칭 free_launch)
 * - 추후: 일반 사용자 기본값으로 이 함수만 수정하면 됨
 */
export function getInitialSubscriptionForNewUser() {
  return {
    plan: 'premium' as const,
    isPremium: true,
    subscriptionType: 'free_launch' as const,
    subscriptionExpireAt: null as null,
  };
}

