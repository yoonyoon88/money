import { useApp } from '../context/AppContext';
import { getSubscriptionPlan } from '../types';

export type UserPlan = 'free' | 'premium';

/**
 * 현재 사용자 구독 플랜을 반환합니다. (2단: 무료/프리미엄)
 */
export function useUserPlan(): { userPlan: UserPlan } {
  const { user } = useApp();
  const userPlan = getSubscriptionPlan(user);
  return { userPlan };
}
