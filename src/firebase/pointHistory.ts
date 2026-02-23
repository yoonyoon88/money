import { collection, query, where, onSnapshot, orderBy, addDoc, serverTimestamp, DocumentData, Timestamp } from 'firebase/firestore';
import { db } from './config';

// ============================================================================
// 포인트 사용 이력 타입 정의
// ============================================================================

export type PointHistoryType = 'earn' | 'use' | 'adjust';
export type PointHistoryCreatedBy = 'parent' | 'child';

export interface PointHistory {
  id: string;
  childId: string;
  parentId: string; // 필수: 부모 ID
  type: PointHistoryType;
  amount: number; // 사용: -100, 적립: +100
  balanceAfter: number; // 필수: 이 내역 이후 남은 포인트
  reason: string; // 사유 (예: "미션 완료", "소원 사용")
  rewardTitle?: string; // 보상/소원 이름 (사용일 때 필수)
  missionId?: string; // 관련 미션 ID (적립일 때)
  createdAt: string; // ISO date string
  createdBy?: PointHistoryCreatedBy; // 선택 필드
}

// ============================================================================
// 날짜 필드 변환 헬퍼 함수 (users.ts와 동일한 로직)
// ============================================================================

const toISOString = (
  value: Timestamp | string | number | undefined | null
): string | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }

  try {
    if (value instanceof Timestamp) {
      return value.toDate().toISOString();
    }

    if (typeof value === 'string') {
      const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
      if (isoRegex.test(value)) {
        return value;
      }
      const parsed = new Date(value);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }

    if (typeof value === 'number') {
      const parsed = new Date(value);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }
  } catch (error) {
    return undefined;
  }

  return undefined;
};

// ============================================================================
// Firestore 문서를 PointHistory 객체로 변환
// ============================================================================

const docToPointHistory = (docData: DocumentData, docId: string): PointHistory => {
  const createdAt = toISOString(docData.createdAt);

  return {
    id: docId,
    childId: docData.childId || '',
    parentId: docData.parentId || '', // 필수: 부모 ID
    type: (docData.type || 'use') as PointHistoryType,
    amount: docData.amount || 0,
    balanceAfter: docData.balanceAfter || 0, // 필수: 거래 후 잔액
    reason: docData.reason || docData.title || '', // 하위 호환성: title도 확인
    rewardTitle: docData.rewardTitle || docData.rewardItem || undefined, // 보상/소원 이름
    missionId: docData.missionId || undefined, // 관련 미션 ID
    createdAt: createdAt || new Date().toISOString(),
    createdBy: (docData.createdBy || 'parent') as PointHistoryCreatedBy,
  };
};

// ============================================================================
// 포인트 사용 이력 구독
// ============================================================================

/**
 * 특정 자녀의 포인트 사용 이력 실시간 구독
 * 
 * @param childId - 자녀 ID
 * @param callback - 이력 목록이 업데이트될 때 호출되는 콜백
 * @returns 구독 해제 함수
 */
export const subscribePointHistory = (
  childId: string,
  callback: (history: PointHistory[]) => void
): (() => void) => {
  if (!db) {
    callback([]);
    return () => {};
  }

  if (!childId) {
    callback([]);
    return () => {};
  }

  try {
    const pointHistoryRef = collection(db, 'pointHistory');
    const q = query(
      pointHistoryRef,
      where('childId', '==', childId),
      orderBy('createdAt', 'desc') // 최신순 정렬
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const history = snapshot.docs.map((doc) => docToPointHistory(doc.data(), doc.id));
        callback(history);
      },
      (error) => {
        callback([]);
      }
    );

    return unsubscribe;
  } catch (error) {
    callback([]);
    return () => {};
  }
};

// ============================================================================
// 포인트 사용 이력 추가
// ============================================================================

/**
 * 포인트 사용 이력 추가
 * 
 * @param childId - 자녀 ID
 * @param type - 이력 타입 (earn: 적립, use: 사용, adjust: 수동 조정)
 * @param amount - 포인트 수치 (사용: 음수, 적립: 양수)
 * @param reason - 사유 (예: "미션 완료", "소원 사용")
 * @param createdBy - 생성 주체 ('parent' | 'child', 선택)
 * @param rewardTitle - 보상/소원 이름 (사용일 때 필수, 선택)
 * @param parentId - 부모 ID (필수)
 * @param missionId - 관련 미션 ID (적립일 때, 선택)
 * @param balanceAfter - 거래 후 잔액 (필수)
 */
export const addPointHistory = async (
  childId: string,
  type: PointHistoryType,
  amount: number,
  reason: string,
  createdBy?: PointHistoryCreatedBy,
  rewardTitle?: string,
  parentId?: string,
  missionId?: string,
  balanceAfter?: number
): Promise<void> => {
  if (!db) {
    throw new Error('Firestore가 초기화되지 않았습니다.');
  }

  if (!childId) {
    throw new Error('자녀 ID가 필요합니다.');
  }

  if (!parentId) {
    throw new Error('부모 ID가 필요합니다.');
  }

  if (balanceAfter === undefined) {
    throw new Error('거래 후 잔액(balanceAfter)이 필요합니다.');
  }

  try {
    const historyData: any = {
      childId,
      parentId, // 필수: 부모 ID
      type,
      amount, // 사용: -100, 적립: +100
      balanceAfter, // 필수: 거래 후 잔액
      reason,
      createdAt: serverTimestamp(),
      createdBy: createdBy || 'parent',
    };

    // rewardTitle이 있으면 추가 (사용일 때 필수)
    if (rewardTitle) {
      historyData.rewardTitle = rewardTitle;
    }

    // missionId가 있으면 추가 (적립일 때)
    if (missionId) {
      historyData.missionId = missionId;
    }

    await addDoc(collection(db, 'pointHistory'), historyData);
  } catch (error) {
    throw error;
  }
};
