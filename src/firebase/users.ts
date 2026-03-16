import { doc, getDoc, onSnapshot, updateDoc, addDoc, collection, serverTimestamp, DocumentData, Timestamp, deleteDoc, getDocs, query, where, writeBatch, setDoc } from 'firebase/firestore';
import { db } from './config';
import { safeUserUpdate } from '../utils/firestoreSafeUpdate';
import { User, type Subscription } from '../types';

// ============================================================================
// 날짜 필드 변환 헬퍼 함수
// ============================================================================
// 
// Firestore 문서의 날짜 필드는 다음 형태로 올 수 있음:
// 1. Timestamp 객체 (정상적인 Firestore Timestamp)
// 2. string (ISO string으로 저장된 경우)
// 3. number (Unix timestamp in milliseconds)
// 4. undefined (필드가 없는 경우)
// 
// 이 함수는 모든 형태를 안전하게 ISO string으로 변환합니다.
// missions.ts와 동일한 로직을 사용하여 일관성 유지
// ============================================================================

/**
 * 다양한 형태의 날짜 값을 ISO string으로 안전하게 변환
 * 
 * @param value - Timestamp | string | number | undefined | null
 * @returns ISO string 또는 undefined
 * 
 * TODO: Firestore 데이터 정규화 필요
 * - 모든 날짜 필드는 Timestamp 타입으로 저장되어야 함
 * - 현재는 string으로 저장된 데이터도 처리하지만, 향후 정규화 권장
 */
const toISOString = (
  value: Timestamp | string | number | undefined | null
): string | undefined => {
  // null 또는 undefined 처리
  if (value === null || value === undefined) {
    return undefined;
  }

  try {
    // 1. Firestore Timestamp 객체인 경우
    if (value instanceof Timestamp) {
      return value.toDate().toISOString();
    }

    // 2. 이미 ISO string인 경우 (검증 후 반환)
    if (typeof value === 'string') {
      // ISO string 형식 검증 (YYYY-MM-DDTHH:mm:ss.sssZ)
      const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
      if (isoRegex.test(value)) {
        return value;
      }
      
      // 일반 날짜 문자열인 경우 Date 객체로 변환 시도
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
      
      return undefined;
    }

    // 3. Unix timestamp (milliseconds)인 경우
    if (typeof value === 'number') {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
      
      return undefined;
    }

    // 4. 알 수 없는 타입
    return undefined;
  } catch (error) {
    return undefined;
  }
};

// ============================================================================
// Firestore 문서 변환
// ============================================================================

/**
 * Firestore 문서를 User 타입으로 안전하게 변환
 * 
 * 모든 날짜 필드는 toISOString 헬퍼 함수를 통해 안전하게 변환됩니다.
 * 필수 필드가 없거나 잘못된 경우 기본값을 사용하여 앱이 깨지지 않도록 합니다.
 * 
 * TODO: Firestore 데이터 정규화 필요
 * - createdAt, updatedAt은 Timestamp 타입으로 저장되어야 함
 * - 현재는 string/Timestamp 혼재 상태를 처리하지만, 향후 정규화 권장
 */
const docToUser = (docData: DocumentData, id: string): User => {
  const data = docData;

  try {
    // gender 필드 처리: 'male' 또는 'female'인 경우만 사용
    const gender = data.gender === 'male' || data.gender === 'female' 
      ? data.gender 
      : undefined;

    return {
      id,
      name: data.name || '이름 없음',
      totalPoint: typeof data.totalPoint === 'number' ? data.totalPoint : 0,
      role: (data.role as 'PARENT' | 'CHILD') || 'CHILD', // 기본값: CHILD
      email: data.email || undefined,
      createdAt: toISOString(data.createdAt),
      updatedAt: toISOString(data.updatedAt),
      // 부모인 경우
      childrenIds: Array.isArray(data.childrenIds) ? data.childrenIds : undefined,
      parentPin: data.parentPin || undefined,
      // 아이인 경우
      parentId: data.parentId || undefined,
      gender, // 자녀 성별
      subscription: parseSubscription(data),
      // Soft delete
      isDeleted: data.isDeleted === true,
      deletedAt: data.deletedAt != null ? toISOString(data.deletedAt) ?? null : undefined,
    };
  } catch (error) {
    // 에러 발생 시 최소한의 User 객체 반환 (앱이 깨지지 않도록)
    return {
      id,
      name: '변환 오류',
      totalPoint: 0,
      role: 'CHILD',
    };
  }
};

/** Firestore 구독 필드 → Subscription (2단: free/premium, 기존 basic→free) */
function parseSubscription(data: DocumentData): Subscription | undefined {
  if (data.subscription && typeof data.subscription === 'object') {
    const s = data.subscription;
    const plan = s.plan === 'premium' ? 'premium' : 'free'; // basic → free
    const status = s.status === 'canceled' ? 'canceled' : s.status === 'expired' ? 'expired' : 'active';
    const provider = s.provider === 'playstore' ? 'playstore' : s.provider === 'apple' ? 'apple' : s.provider === 'google' ? 'google' : s.provider === 'pg' ? 'pg' : 'none';
    return {
      plan,
      status,
      provider,
      currentPeriodEnd: toISOString(s.currentPeriodEnd),
      cancelAtPeriodEnd: !!s.cancelAtPeriodEnd,
    };
  }
  const plan = data.subscription === 'premium' ? 'premium' : 'free';
  return {
    plan,
    status: data.subscriptionStatus === 'canceled' ? 'canceled' : 'active',
    provider: 'none',
    currentPeriodEnd: toISOString(data.subscriptionExpireAt),
    cancelAtPeriodEnd: false,
  };
}

// ============================================================================
// 사용자 정보 조회 및 구독
// ============================================================================

/**
 * 사용자 정보 가져오기 (일회성)
 * 
 * @param userId - Firebase Auth uid (문서 ID와 동일)
 * @returns User 객체 또는 null (문서가 없을 경우)
 */
export const getUser = async (userId: string): Promise<User | null> => {
  if (!db) {
    return null;
  }

  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) {
      // childId일 가능성이 있으므로 조용히 처리 (에러 throw하지 않음)
      return null;
    }
    return docToUser(userDoc.data(), userDoc.id);
  } catch (error) {
    // childId일 가능성이 있으므로 조용히 처리 (에러 throw하지 않음)
    return null;
  }
};

/**
 * 부모의 홈에 표시되는 자녀 수 (isDeleted !== true 인 자녀만)
 * Soft Delete 후 자녀 추가 한도 등에 사용
 */
export const getVisibleChildrenCount = async (parentId: string): Promise<number> => {
  if (!db) return 0;
  try {
    const parentDoc = await getDoc(doc(db, 'users', parentId));
    const childrenIds = parentDoc.data()?.childrenIds;
    if (!Array.isArray(childrenIds) || childrenIds.length === 0) return 0;
    let count = 0;
    for (const childId of childrenIds) {
      const child = await getUser(childId);
      if (child && child.isDeleted !== true) count++;
    }
    return count;
  } catch {
    return 0;
  }
};

/**
 * 부모의 활성 자녀 목록 (isDeleted !== true 인 자녀만)
 * 역할 전환/자녀 선택 화면 등에서 사용
 */
export const getActiveChildren = async (
  parentId: string
): Promise<Array<{ id: string; name: string }>> => {
  if (!db) return [];
  try {
    const parentDoc = await getDoc(doc(db, 'users', parentId));
    const childrenIds = parentDoc.data()?.childrenIds;
    if (!Array.isArray(childrenIds) || childrenIds.length === 0) return [];
    const list: Array<{ id: string; name: string }> = [];
    for (const childId of childrenIds) {
      const child = await getUser(childId);
      if (child && child.isDeleted !== true) {
        list.push({ id: childId, name: child.name ?? '자녀' });
      }
    }
    return list;
  } catch {
    return [];
  }
};

/**
 * 기본 사용자 문서 생성
 * 
 * @param userId - Firebase Auth uid (문서 ID와 동일)
 * @param email - 사용자 이메일 (옵션)
 * @returns 생성된 User 객체 또는 null
 */
const createDefaultUserDocument = async (
  userId: string,
  email?: string
): Promise<User | null> => {
  if (!db) {
    console.error('[users] Firestore가 초기화되지 않았습니다.');
    return null;
  }

  try {
    const now = new Date().toISOString();
    const defaultUserData = {
      id: userId,
      name: '사용자',
      totalPoint: 0,
      role: 'PARENT' as const, // 기본값은 PARENT
      email: email || undefined,
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(doc(db, 'users', userId), defaultUserData, { merge: true });
    
    console.log('[users] 기본 사용자 문서 생성 완료:', userId);
    return defaultUserData;
  } catch (error) {
    console.error('[users] 기본 사용자 문서 생성 실패:', error);
    return null;
  }
};

/**
 * 사용자 정보 실시간 구독
 * 
 * Firebase Auth의 uid를 받아서 Firestore의 users/{uid} 문서를 실시간 구독합니다.
 * 문서가 업데이트되면 자동으로 callback이 호출됩니다.
 * 문서가 없을 경우 기본 사용자 문서를 생성합니다.
 * 
 * @param userId - Firebase Auth uid (문서 ID와 동일)
 * @param callback - 사용자 정보가 업데이트될 때 호출되는 콜백 함수
 * @param email - 사용자 이메일 (문서 생성 시 사용, 옵션)
 * @returns 구독 해제 함수
 * 
 * 사용 예시:
 * ```typescript
 * const unsubscribe = subscribeUser(firebaseUser.uid, (userData) => {
 *   if (userData) {
 *     setUser(userData);
 *   } else {
 *     setUser(null);
 *   }
 * }, firebaseUser.email);
 * 
 * // 구독 해제
 * unsubscribe();
 * ```
 */
export const subscribeUser = (
  userId: string,
  callback: (user: User | null) => void,
  email?: string
): (() => void) => {
  if (!db) {
    console.error('[users] Firestore가 초기화되지 않았습니다.');
    callback(null);
    return () => {}; // 빈 cleanup 함수 반환
  }

  let isCreatingDocument = false; // 문서 생성 중 플래그 (중복 생성 방지)

  return onSnapshot(
    doc(db, 'users', userId),
    async (docSnapshot) => {
      try {
        if (!docSnapshot.exists()) {
          // 문서가 없을 경우 기본 사용자 문서 생성
          if (!isCreatingDocument) {
            isCreatingDocument = true;
            console.log('[users] 사용자 문서가 없습니다. 기본 문서 생성 중...', userId);
            
            const defaultUser = await createDefaultUserDocument(userId, email);
            
            if (defaultUser) {
              // 문서 생성 성공 시 onSnapshot이 자동으로 다시 호출됨
              // 따라서 여기서는 callback을 호출하지 않음
              isCreatingDocument = false;
            } else {
              // 문서 생성 실패 시 null 반환
              console.error('[users] 기본 사용자 문서 생성 실패, null 반환');
              isCreatingDocument = false;
              callback(null);
            }
          }
          return;
        }

        // 문서가 존재하는 경우
        isCreatingDocument = false;
        const userData = docToUser(docSnapshot.data(), docSnapshot.id);
        callback(userData);
      } catch (error) {
        console.error('[users] subscribeUser snapshot 처리 중 오류:', error);
        isCreatingDocument = false;
        callback(null);
      }
    },
    (error) => {
      // 에러 발생 시 null 반환하여 UI가 깨지지 않도록
      console.error('[users] subscribeUser 에러:', error);
      isCreatingDocument = false;
      callback(null);
    }
  );
};

// ============================================================================
// 구독 관리 (2단: 무료/프리미엄, Google Play 기준 - 실제 결제 없이 subscription만 변경)
// ============================================================================

export type SubscriptionPlan = 'free' | 'premium';

function getNextBillingDate(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d;
}

/**
 * 구독 플랜 변경 (시뮬레이션)
 * Firestore: subscription = { plan, status, provider, currentPeriodEnd, cancelAtPeriodEnd }
 */
export const updateUserSubscription = async (
  userId: string,
  plan: SubscriptionPlan
): Promise<void> => {
  if (!db) {
    throw new Error('Firestore가 초기화되지 않았습니다.');
  }

  const nextBilling = plan === 'premium' ? getNextBillingDate() : null;

  const subscription: Record<string, unknown> = {
    plan,
    status: 'active',
    provider: plan === 'premium' ? 'playstore' : 'none',
    cancelAtPeriodEnd: false,
  };

  if (nextBilling) {
    subscription.currentPeriodEnd = Timestamp.fromDate(nextBilling);
  } else {
    subscription.currentPeriodEnd = null;
  }

  await safeUserUpdate(userId, {
    subscription,
    updatedAt: serverTimestamp(),
  });
};

/**
 * 구독 해지 (기간 종료 후 해지) - subscription.cancelAtPeriodEnd = true
 */
export const cancelUserSubscription = async (userId: string): Promise<void> => {
  if (!db) {
    throw new Error('Firestore가 초기화되지 않았습니다.');
  }

  const userRef = doc(db, 'users', userId);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    throw new Error('사용자 정보를 찾을 수 없습니다.');
  }

  const data = snap.data();
  const current = data.subscription && typeof data.subscription === 'object'
    ? { ...data.subscription }
    : {
        plan: data.subscription === 'premium' ? 'premium' : 'free',
        status: 'active',
        provider: 'none',
        currentPeriodEnd: data.subscriptionExpireAt ?? null,
        cancelAtPeriodEnd: false,
      };

  await updateDoc(userRef, {
    subscription: {
      ...current,
      cancelAtPeriodEnd: true,
    },
    updatedAt: serverTimestamp(),
  });
};

// ============================================================================
// 포인트 관리 함수
// ============================================================================

/**
 * 자녀의 포인트를 초기화 (0으로 설정)
 * 부모만 사용 가능하며, PIN 인증 후 호출되어야 함
 * 
 * @param childId - 자녀의 사용자 ID
 * @returns 성공 여부
 */
export const resetChildPoint = async (childId: string): Promise<void> => {
  if (!db) {
    throw new Error('Firestore가 초기화되지 않았습니다.');
  }

  try {
    const userRef = doc(db, 'users', childId);
    await updateDoc(userRef, {
      totalPoint: 0,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw error;
  }
};

/**
 * 자녀의 포인트를 차감
 * 부모만 사용 가능하며, PIN 인증 후 호출되어야 함
 * 
 * @param childId - 자녀의 사용자 ID
 * @param amount - 차감할 포인트 양 (양수)
 * @returns 성공 여부
 */
export const deductChildPoint = async (childId: string, amount: number): Promise<void> => {
  if (!db) {
    throw new Error('Firestore가 초기화되지 않았습니다.');
  }

  if (amount <= 0) {
    throw new Error('차감할 포인트는 0보다 커야 합니다.');
  }

  try {
    // 현재 포인트 조회
    const userDoc = await getDoc(doc(db, 'users', childId));
    if (!userDoc.exists()) {
      throw new Error('자녀 정보를 찾을 수 없습니다.');
    }

    const currentPoint = userDoc.data().totalPoint || 0;
    const newPoint = Math.max(0, currentPoint - amount); // 음수 방지

    const userRef = doc(db, 'users', childId);
    await updateDoc(userRef, {
      totalPoint: newPoint,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw error;
  }
};

/**
 * 포인트 사용 기록 저장
 * 향후 통계/분석/추천 기능을 위한 데이터 저장
 * 
 * @param childId - 자녀의 사용자 ID
 * @param parentId - 부모의 사용자 ID
 * @param rewardTypeRaw - 보상 종류 (원본 문자열)
 * @param rewardTextRaw - 보상 텍스트 (원본 문자열, 항상 저장)
 * @param deductAmount - 차감된 포인트
 */
export const savePointUsageRecord = async (
  childId: string,
  parentId: string,
  rewardTypeRaw: string,
  rewardTextRaw: string,
  deductAmount: number
): Promise<void> => {
  if (!db) {
    throw new Error('Firestore가 초기화되지 않았습니다.');
  }

  try {
    await addDoc(collection(db, 'pointUsages'), {
      childId,
      parentId,
      rewardTypeRaw, // 원본 그대로 저장
      rewardTextRaw, // 항상 저장 (기타가 아니면 rewardTypeRaw와 동일)
      context: 'reward', // 현재는 "reward"
      isCustomPoint: true,
      triggeredFrom: 'parent_home',
      deductAmount,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    // 기록 저장 실패는 포인트 차감을 막지 않음 (로깅만)
  }
};

// ============================================================================
// 자녀 관리 함수
// ============================================================================

/**
 * 자녀 정보 수정 (이름, 성별)
 * 
 * @param childId - 자녀의 사용자 ID
 * @param updates - 수정할 정보 (name, gender)
 */
export const updateChildInfo = async (
  childId: string,
  updates: { name?: string; gender?: 'male' | 'female' }
): Promise<void> => {
  if (!db) {
    throw new Error('Firestore가 초기화되지 않았습니다.');
  }

  try {
    const childRef = doc(db, 'users', childId);
    const updateData: any = {
      updatedAt: serverTimestamp(),
    };

    if (updates.name !== undefined) {
      updateData.name = updates.name.trim();
    }

    if (updates.gender !== undefined) {
      updateData.gender = updates.gender;
    }

    await updateDoc(childRef, updateData);
  } catch (error) {
    throw error;
  }
};

/**
 * 자녀 삭제 (Soft Delete)
 * - 자녀의 모든 미션: isDeleted = true, deletedAt = serverTimestamp()
 * - 자녀 사용자 문서: isDeleted = true, deletedAt = serverTimestamp() (문서는 삭제하지 않음)
 * - 부모의 childrenIds는 유지 (홈에서는 isDeleted === false인 자녀만 표시)
 * - pointUsages, wishlist는 기존대로 처리
 * 
 * @param childId - 삭제할 자녀의 사용자 ID
 * @param parentId - 부모의 사용자 ID
 */
export const deleteChild = async (
  childId: string,
  parentId: string
): Promise<void> => {
  if (!db) {
    throw new Error('Firestore가 초기화되지 않았습니다.');
  }

  try {
    const batch = writeBatch(db);

    // 1. 자녀의 모든 미션 Soft Delete (isDeleted = true, deletedAt = serverTimestamp())
    const missionsQuery = query(
      collection(db, 'missions'),
      where('childId', '==', childId),
      where('isDeleted', '==', false)
    );
    const missionsSnapshot = await getDocs(missionsQuery);
    missionsSnapshot.docs.forEach((missionDoc) => {
      const missionRef = doc(db, 'missions', missionDoc.id);
      batch.update(missionRef, {
        isDeleted: true,
        deletedAt: serverTimestamp(),
      });
    });

    // 2. 자녀의 포인트 사용 기록 삭제 (pointUsages 컬렉션)
    const pointUsagesQuery = query(
      collection(db, 'pointUsages'),
      where('childId', '==', childId)
    );
    const pointUsagesSnapshot = await getDocs(pointUsagesQuery);
    pointUsagesSnapshot.docs.forEach((usageDoc) => {
      const usageRef = doc(db, 'pointUsages', usageDoc.id);
      batch.delete(usageRef);
    });

    // 3. 자녀의 소원 목록 삭제 (wishlist 컬렉션)
    const wishlistQuery = query(
      collection(db, 'wishlist'),
      where('childId', '==', childId)
    );
    const wishlistSnapshot = await getDocs(wishlistQuery);
    wishlistSnapshot.docs.forEach((wishDoc) => {
      const wishRef = doc(db, 'wishlist', wishDoc.id);
      batch.delete(wishRef);
    });

    // 4. 자녀 사용자 문서 Soft Delete (문서 삭제하지 않음)
    const childRef = doc(db, 'users', childId);
    batch.update(childRef, {
      isDeleted: true,
      deletedAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    throw error;
  }
};
