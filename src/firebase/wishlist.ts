import { collection, doc, addDoc, deleteDoc, updateDoc, query, where, onSnapshot, QuerySnapshot, DocumentData, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from './config';

// ============================================================================
// 타입 정의
// ============================================================================

export type WishStatus = 'active' | 'completed';

export interface WishItem {
  id: string;
  childId: string;
  text: string;
  status: WishStatus; // 활성 소원 또는 완료된 소원
  createdAt: string; // ISO date string
  completedAt?: string; // ISO date string - 완료된 시간 (히스토리용)
  pointDeducted?: number; // 차감된 포인트 (완료된 소원의 경우, 통계/리포트용)
}

// ============================================================================
// 날짜 필드 변환 헬퍼 함수
// ============================================================================

/**
 * 다양한 형태의 날짜 값을 ISO string으로 안전하게 변환
 */
const toISOString = (
  value: Timestamp | string | number | undefined | null
): string | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }

  try {
    // Firestore Timestamp 객체인 경우
    if (value instanceof Timestamp) {
      return value.toDate().toISOString();
    }

    // 이미 ISO string인 경우
    if (typeof value === 'string') {
      const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
      if (isoRegex.test(value)) {
        return value;
      }
      
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
      
      return undefined;
    }

    // Unix timestamp (milliseconds)인 경우
    if (typeof value === 'number') {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
      
      return undefined;
    }

    return undefined;
  } catch (error) {
    return undefined;
  }
};

// ============================================================================
// Firestore 문서 변환
// ============================================================================

/**
 * Firestore 문서를 WishItem 타입으로 안전하게 변환
 */
const docToWishItem = (docData: DocumentData, id: string): WishItem => {
  const data = docData;

  try {
    return {
      id,
      childId: data.childId || '',
      text: data.text || '',
      status: (data.status === 'completed' ? 'completed' : 'active') as WishStatus,
      createdAt: toISOString(data.createdAt) || new Date().toISOString(),
      completedAt: data.completedAt ? toISOString(data.completedAt) : undefined,
      pointDeducted: typeof data.pointDeducted === 'number' ? data.pointDeducted : undefined,
    };
  } catch (error) {
    // 에러 발생 시 최소한의 WishItem 객체 반환
    return {
      id,
      childId: '',
      text: '',
      status: 'active',
      createdAt: new Date().toISOString(),
    };
  }
};

// ============================================================================
// Wishlist CRUD 함수
// ============================================================================

/**
 * 하고 싶은 항목 추가
 * 
 * @param childId - 자녀의 사용자 ID
 * @param text - 하고 싶은 내용
 * @returns 생성된 항목의 ID
 */
export const addWishItem = async (childId: string, text: string): Promise<string> => {
  if (!db) {
    throw new Error('Firestore가 초기화되지 않았습니다.');
  }

  if (!text.trim()) {
    throw new Error('내용을 입력해주세요.');
  }

  try {
    const docRef = await addDoc(collection(db, 'wishlist'), {
      childId,
      text: text.trim(),
      status: 'active', // 기본값: 활성 소원
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    throw error;
  }
};

/**
 * 하고 싶은 항목 삭제
 * 
 * @param itemId - 삭제할 항목의 ID
 */
export const deleteWishItem = async (itemId: string): Promise<void> => {
  if (!db) {
    throw new Error('Firestore가 초기화되지 않았습니다.');
  }

  try {
    await deleteDoc(doc(db, 'wishlist', itemId));
  } catch (error) {
    throw error;
  }
};

/**
 * 하고 싶은 항목 수정
 * 
 * @param itemId - 수정할 항목의 ID
 * @param text - 수정할 내용
 */
export const updateWishItem = async (itemId: string, text: string): Promise<void> => {
  if (!db) {
    throw new Error('Firestore가 초기화되지 않았습니다.');
  }

  if (!text.trim()) {
    throw new Error('내용을 입력해주세요.');
  }

  try {
    await updateDoc(doc(db, 'wishlist', itemId), {
      text: text.trim(),
    });
  } catch (error) {
    throw error;
  }
};

/**
 * 소원을 완료 처리 (부모만 사용)
 * 
 * @param itemId - 완료할 소원의 ID
 * @param pointDeducted - 차감된 포인트 (선택사항, 통계/리포트용)
 */
export const completeWishItem = async (itemId: string, pointDeducted?: number): Promise<void> => {
  if (!db) {
    throw new Error('Firestore가 초기화되지 않았습니다.');
  }

  try {
    const updateData: any = {
      status: 'completed',
      completedAt: serverTimestamp(),
    };
    
    // 포인트 차감 여부가 있으면 기록
    if (pointDeducted !== undefined && pointDeducted > 0) {
      updateData.pointDeducted = pointDeducted;
    }
    
    await updateDoc(doc(db, 'wishlist', itemId), updateData);
  } catch (error) {
    throw error;
  }
};

/**
 * 자녀의 활성 소원 리스트 실시간 구독 (완료된 소원 제외)
 * 
 * @param childId - 자녀의 사용자 ID
 * @param callback - 리스트가 업데이트될 때 호출되는 콜백 함수
 * @returns 구독 해제 함수
 */
export const subscribeWishlist = (
  childId: string,
  callback: (items: WishItem[]) => void
): (() => void) => {
  if (!db) {
    callback([]);
    return () => {}; // 빈 cleanup 함수 반환
  }

  const wishlistQuery = query(
    collection(db, 'wishlist'),
    where('childId', '==', childId),
    where('status', '==', 'active') // 활성 소원만 조회
  );

  return onSnapshot(
    wishlistQuery,
    (snapshot: QuerySnapshot<DocumentData>) => {
      const items = snapshot.docs.map((doc) => docToWishItem(doc.data(), doc.id));
      // createdAt 기준 내림차순 정렬 (최신순)
      items.sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateB - dateA;
      });
      callback(items);
    },
    (error) => {
      // 에러 발생 시 빈 배열 반환하여 UI가 깨지지 않도록
      callback([]);
    }
  );
};

