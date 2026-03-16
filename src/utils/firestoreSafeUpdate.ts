import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

/**
 * users/{uid} 문서 업데이트 시 parentPin 무결성을 보호하기 위한 유틸리티.
 *
 * - parentPin이 null/undefined 로 넘어오면 필드를 제거하여 덮어쓰기를 방지
 * - 나머지 필드는 그대로 updateDoc 에 전달
 */
export const safeUserUpdate = async (uid: string, updateData: any): Promise<void> => {
  if (!db) {
    throw new Error('Firestore가 초기화되지 않았습니다.');
  }

  const cleanedData: any = { ...updateData };

  // parentPin 보호: null/undefined 인 경우에는 업데이트 대상에서 제거
  if (cleanedData.parentPin === null || cleanedData.parentPin === undefined) {
    delete cleanedData.parentPin;
  }

  await updateDoc(doc(db, 'users', uid), cleanedData);
};


