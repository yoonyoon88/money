/**
 * 플랜별 자녀 수 제한 (2단: 무료 1명, 프리미엄 5명)
 */
export function getMaxChildren(plan: string): number {
  if (plan === 'premium') return 5;
  return 1; // free 또는 기타
}
