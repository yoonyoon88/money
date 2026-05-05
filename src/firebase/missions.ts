import {
  collection,
  doc,
  query,
  where,
  onSnapshot,
  updateDoc,
  addDoc,
  serverTimestamp,
  deleteField,
  Timestamp,
  QuerySnapshot,
  DocumentData,
  runTransaction,
  increment,
  getDoc,
  getDocs,
} from 'firebase/firestore';
import { db } from './config';
import { Mission, MissionStatus, MissionResultStatus } from '../types';
import { isDebugTimeEnabled, debugLog, debugGroup, debugGroupEnd, debugWarn, debugError } from '../utils/debug';

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
      return new Date(value).toISOString();
    }
  } catch (error) {
    debugWarn('[toISOString] 날짜 변환 실패:', { error, value });
  }

  return undefined;
};

// ============================================================================
// Firestore 문서 → Mission 타입 변환
// ============================================================================

/**
 * Firestore 문서를 Mission 타입으로 변환
 * 
 * 마감 시간 우선순위:
 * 1. deadlineAt (Timestamp) - 새로운 필드
 * 2. dueAt (Timestamp) - 기존 필드
 * 3. dueDate (Timestamp) - 하위 호환성
 */
export const docToMission = (docData: DocumentData, docId: string): Mission => {
  // ═══════════════════════════════════════════════════════════════════
  // [수정 요구 1] 상태 정규화 전 raw status 로그 (디버그 모드에서만)
  // ═══════════════════════════════════════════════════════════════════
  if (isDebugTimeEnabled) {
    debugGroup(`[MISSION RAW DATA] ${docId}`);
    debugLog('missionId:', docId);
    debugLog('raw status:', docData.status);
    debugLog('raw status type:', typeof docData.status);
    debugLog('raw deadlineAt:', docData.deadlineAt);
    debugLog('raw deadlineAt (toDate):', docData.deadlineAt?.toDate?.());
    debugLog('raw dueAt:', docData.dueAt);
    debugLog('raw dueAt (toDate):', docData.dueAt?.toDate?.());
    debugLog('raw dueDate:', docData.dueDate);
    debugLog('raw dueDate (toDate):', docData.dueDate?.toDate?.());
    debugGroupEnd();
  }

  // deadlineAt 우선, 없으면 dueAt, 그것도 없으면 dueDate
  const deadlineTimestamp = docData.deadlineAt || docData.dueAt || docData.dueDate;
  const dueAt = toISOString(deadlineTimestamp) || new Date().toISOString();
  
  const createdAt = toISOString(docData.createdAt);
  const completedAt = toISOString(docData.completedAt);
  const approvedAt = toISOString(docData.approvedAt);
  const expiredAt = toISOString(docData.expiredAt);
  const repeatStartDate = toISOString(docData.repeatStartDate);
  const repeatEndDate = toISOString(docData.repeatEndDate);
  const deletedAt = toISOString(docData.deletedAt);

  // 정규화된 status
  const normalizedStatus = (docData.status || 'IN_PROGRESS') as MissionStatus;

  return {
    id: docId,
    title: docData.title || '',
    description: docData.description || '',
    rewardPoint: docData.rewardPoint || 0,
    dueAt,
    status: normalizedStatus,
    missionType: (docData.missionType || 'DAILY') as 'DAILY' | 'WEEKLY',
    memo: docData.memo || undefined,
    photoUrl: docData.photoUrl || undefined,
    parentMemo: docData.parentMemo || undefined,
    childId: docData.childId || '',
    parentId: docData.parentId || '',
    createdAt,
    completedAt: completedAt || null,
    approvedAt,
    approvedBy: docData.approvedBy || undefined,
    isRepeat: docData.isRepeat || false,
    repeatDays: docData.repeatDays || [],
    repeatStartDate,
    repeatEndDate: repeatEndDate || null,
    isDeleted: docData.isDeleted || false,
    deletedAt,
    expiredAt: expiredAt || null,
    retryCount: docData.retryCount || 0,
    resultStatus: docData.resultStatus as MissionResultStatus | undefined,
    originalMissionId: docData.originalMissionId || undefined,
    partialPoint: docData.partialPoint || undefined,
    requestedAt: toISOString(docData.requestedAt),
    retryRequestedBy: docData.retryRequestedBy as 'parent' | 'child' | undefined,
  };
};

// ============================================================================
// 미션 만료 체크 함수
// ============================================================================

/**
 * 단일 미션의 만료 상태를 체크하고 업데이트
 * 
 * ⚠️ 주의: now 파라미터는 필수입니다. Date.now() 기본값을 사용하지 마세요.
 * React 컴포넌트에서는 nowMs state를 전달해야 리렌더링이 정상 작동합니다.
 */
export const checkAndUpdateExpiredMission = (mission: Mission, now: Date | number): Mission => {
  // ═══════════════════════════════════════════════════════════════════
  // [수정 요구 2] 상태 처리 가능 여부 명확화
  // ═══════════════════════════════════════════════════════════════════
  const processableStatuses = ['IN_PROGRESS', 'ACTIVE'];
  const isProcessableStatus = processableStatuses.includes(mission.status);
  const nowTime = typeof now === 'number' ? now : now.getTime();
  const nowDate = new Date(nowTime);
  
  // dueAt을 밀리초로 변환
  let deadlineMs: number | null = null;
  let deadlineDate: Date | null = null;
  try {
    deadlineDate = new Date(mission.dueAt);
    deadlineMs = deadlineDate.getTime();
    if (isNaN(deadlineMs)) {
      deadlineMs = null;
      deadlineDate = null;
    }
      } catch (error) {
        debugError('[checkAndUpdateExpiredMission] dueAt 파싱 실패:', error);
      }

  // ═══════════════════════════════════════════════════════════════════
  // [수정 요구 2] 상태 처리 가능 여부 명확화 (디버그 모드에서만)
  // ═══════════════════════════════════════════════════════════════════
  if (isDebugTimeEnabled) {
    debugGroup(`[MISSION STATUS CHECK] ${mission.id}`);
    debugLog('missionId:', mission.id);
    debugLog('title:', mission.title);
    debugLog('status:', mission.status);
    debugLog('status type:', typeof mission.status);
    debugLog('processableStatuses:', processableStatuses);
    debugLog('isProcessableStatus:', isProcessableStatus);
    debugLog('nowMs:', nowTime);
    debugLog('nowISO:', nowDate.toISOString());
    debugLog('nowLocal:', nowDate.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }));
    debugLog('dueAt (ISO):', mission.dueAt);
    debugLog('deadlineMs:', deadlineMs);
    debugLog('deadlineISO:', deadlineDate?.toISOString());
    debugLog('deadlineLocal:', deadlineDate?.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }));
    if (deadlineMs !== null) {
      debugLog('diffMs:', nowTime - deadlineMs);
      debugLog('diffMinutes:', Math.floor((nowTime - deadlineMs) / (1000 * 60)));
      debugLog('isExpired (nowMs >= deadlineMs):', nowTime >= deadlineMs);
    } else {
      debugWarn('deadlineMs is null - cannot compare');
    }
    debugGroupEnd();
  }

  // COMPLETED 상태는 변경하지 않음
  if (
    mission.status === 'COMPLETED' ||
    mission.status === 'PARTIAL_APPROVED' ||
    mission.status === 'FAILED' ||
    (mission.completedAt !== null && mission.completedAt !== undefined)
  ) {
    debugWarn(`[MISSION SKIPPED - COMPLETED/FAILED] ${mission.id}:`, {
      missionId: mission.id,
      status: mission.status,
      reason: 'COMPLETED 또는 FAILED 상태는 변경하지 않음',
    });
    return mission;
  }

  // PENDING_REVIEW 상태도 변경하지 않음
  if (mission.status === 'PENDING_REVIEW' || mission.status === 'SUBMITTED') {
    debugWarn(`[MISSION SKIPPED - PENDING_REVIEW] ${mission.id}:`, {
      missionId: mission.id,
      status: mission.status,
      reason: 'PENDING_REVIEW 상태는 변경하지 않음',
    });
    return mission;
  }

  // 재도전 관련 상태는 변경하지 않음
  if (
    mission.status === 'RETRY_REQUESTED' ||
    mission.status === 'REQUEST' ||
    mission.status === 'RETRY_APPROVED' ||
    mission.status === 'RETRY_REJECTED'
  ) {
    debugWarn(`[MISSION SKIPPED - RETRY STATUS] ${mission.id}:`, {
      missionId: mission.id,
      status: mission.status,
      reason: '재도전 관련 상태는 변경하지 않음',
    });
    return mission;
  }

  // retryRequestedBy가 설정되어 있지만 IN_PROGRESS 상태인 경우는 만료 체크 필요
  // (이미 RETRY_REQUESTED 상태로 변경된 경우는 위에서 보호됨)
  // IN_PROGRESS 상태는 만료 체크를 수행해야 함

  // ═══════════════════════════════════════════════════════════════════
  // [수정 요구 3] 처리 불가 상태 로그
  // ═══════════════════════════════════════════════════════════════════
  if (!isProcessableStatus) {
    debugWarn(`[MISSION SKIPPED - NOT PROCESSABLE] ${mission.id}:`, {
      missionId: mission.id,
      status: mission.status,
      reason: 'IN_PROGRESS 또는 ACTIVE 상태가 아님',
      processableStatuses,
    });
    return mission;
  }

  // deadlineMs는 이미 위에서 계산됨
  if (deadlineMs === null) {
    debugError(`[MISSION ERROR - INVALID DEADLINE] ${mission.id}:`, {
      missionId: mission.id,
      title: mission.title,
      dueAt: mission.dueAt,
      reason: 'dueAt 파싱 실패',
    });
    return mission;
  }

  const dueAtTime = deadlineMs;

  // 현재 시간 >= 마감 시간이면 만료 (밀리초 단위 비교, 타임존 무관)
  if (nowTime >= dueAtTime) {
    if (mission.status === 'EXPIRED') {
      debugLog(`[MISSION ALREADY EXPIRED] ${mission.id}:`, {
        missionId: mission.id,
        status: mission.status,
        reason: '이미 EXPIRED 상태',
      });
      return mission;
    }

    debugLog(`[MISSION EXPIRED - STATUS CHANGE] ${mission.id}:`, {
      missionId: mission.id,
      title: mission.title,
      oldStatus: mission.status,
      newStatus: 'EXPIRED',
      dueAt: mission.dueAt,
      dueAtTime: new Date(dueAtTime).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
      nowTime: new Date(nowTime).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
      diffMs: nowTime - dueAtTime,
      diffMinutes: Math.floor((nowTime - dueAtTime) / (1000 * 60)),
    });

    const nowDate = typeof now === 'number' ? new Date(now) : now;
    return {
      ...mission,
      status: 'EXPIRED' as MissionStatus,
      expiredAt: mission.expiredAt || nowDate.toISOString(),
      resultStatus: 'expired' as MissionResultStatus,
    };
  }

  debugLog(`[MISSION NOT EXPIRED] ${mission.id}:`, {
    missionId: mission.id,
    status: mission.status,
    reason: '아직 마감 시간 전',
    diffMs: nowTime - dueAtTime,
    diffMinutes: Math.floor((nowTime - dueAtTime) / (1000 * 60)),
  });

  return mission;
};

/**
 * 여러 미션의 만료 상태를 일괄 체크
 * 
 * ⚠️ 주의: now 파라미터는 필수입니다. Date.now() 기본값을 사용하지 마세요.
 * React 컴포넌트에서는 nowMs state를 전달해야 리렌더링이 정상 작동합니다.
 */
export const checkAndUpdateExpiredMissions = (missions: Mission[], now: Date | number): Mission[] => {
  return missions.map(mission => checkAndUpdateExpiredMission(mission, now));
};

// ============================================================================
// 실시간 구독 함수
// ============================================================================

/**
 * 아이의 미션 목록 실시간 구독 (최근 등록순)
 */
export const subscribeChildMissions = (
  childId: string,
  callback: (missions: Mission[]) => void
): (() => void) => {
  if (!db) {
    return () => {};
  }

  const missionsRef = collection(db, 'missions');
  const q = query(
    missionsRef,
    where('childId', '==', childId),
    where('isDeleted', '==', false)
  );

  return onSnapshot(q, async (snapshot: QuerySnapshot<DocumentData>) => {
    let missions = snapshot.docs.map((doc) => docToMission(doc.data(), doc.id));
    // 최근 등록순 정렬 (createdAt 없으면 유지, 있으면 내림차순)
    const hasCreatedAt = (m: Mission) => m.createdAt != null && m.createdAt !== '';
    missions = [...missions].sort((a, b) => {
      if (!hasCreatedAt(a) || !hasCreatedAt(b)) return 0;
      return new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime();
    });
    // 하루 지난 만료 미션 자동 삭제 (비동기, 에러는 무시)
    deleteExpiredMissionsOlderThanOneDay(childId).catch((error) => {
      debugWarn('[subscribeChildMissions] 만료 미션 자동 삭제 실패:', error);
    });
    callback(missions);
  });
};

/**
 * 부모의 제출된 미션 목록 실시간 구독
 */
export const subscribeSubmittedMissions = (
  parentId: string,
  childrenIds: string[],
  callback: (missions: Mission[]) => void
): (() => void) => {
  if (!db) {
    return () => {};
  }

  if (childrenIds.length === 0) {
    callback([]);
    return () => {};
  }

  // SUBMITTED(신규)와 PENDING_REVIEW(하위 호환) 두 상태 모두 구독
  // Firestore는 OR 쿼리를 지원하지 않으므로 두 쿼리를 병렬 실행 후 병합
  const missionsRef = collection(db, 'missions');

  const makeQuery = (status: string) =>
    query(
      missionsRef,
      where('parentId', '==', parentId),
      where('childId', 'in', childrenIds),
      where('status', '==', status),
      where('isDeleted', '==', false)
    );

  const submittedMap = new Map<string, Mission>();
  const pendingMap = new Map<string, Mission>();

  const notify = () => {
    const merged = new Map([...pendingMap, ...submittedMap]);
    callback(Array.from(merged.values()));
  };

  const unsubSubmitted = onSnapshot(makeQuery('SUBMITTED'), (snapshot: QuerySnapshot<DocumentData>) => {
    submittedMap.clear();
    snapshot.docs.forEach((d) => submittedMap.set(d.id, docToMission(d.data(), d.id)));
    notify();
  });

  const unsubPending = onSnapshot(makeQuery('PENDING_REVIEW'), (snapshot: QuerySnapshot<DocumentData>) => {
    pendingMap.clear();
    snapshot.docs.forEach((d) => pendingMap.set(d.id, docToMission(d.data(), d.id)));
    notify();
  });

  return () => {
    unsubSubmitted();
    unsubPending();
  };
};

/**
 * 부모가 선택한 자녀의 미션 목록 실시간 구독 (최근 등록순)
 */
export const subscribeParentChildMissions = (
  childId: string,
  callback: (missions: Mission[]) => void
): (() => void) => {
  if (!db) {
    return () => {};
  }

  const missionsRef = collection(db, 'missions');
  const q = query(
    missionsRef,
    where('childId', '==', childId),
    where('isDeleted', '==', false)
  );

  return onSnapshot(q, async (snapshot: QuerySnapshot<DocumentData>) => {
    let missions = snapshot.docs.map((doc) => docToMission(doc.data(), doc.id));
    // 최근 등록순 정렬 (createdAt 없으면 유지, 있으면 내림차순)
    const hasCreatedAt = (m: Mission) => m.createdAt != null && m.createdAt !== '';
    missions = [...missions].sort((a, b) => {
      if (!hasCreatedAt(a) || !hasCreatedAt(b)) return 0;
      return new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime();
    });
    // 하루 지난 만료 미션 자동 삭제 (비동기, 에러는 무시)
    deleteExpiredMissionsOlderThanOneDay(childId).catch((error) => {
      debugWarn('[subscribeParentChildMissions] 만료 미션 자동 삭제 실패:', error);
    });
    callback(missions);
  });
};

/**
 * 특정 미션 실시간 구독
 * 
 * @param missionId - 구독할 미션 ID
 * @param callback - 미션 데이터가 업데이트될 때 호출되는 콜백 함수 (미션이 없으면 null 전달)
 * @returns 구독 해제 함수
 */
export const subscribeMission = (
  missionId: string,
  callback: (mission: Mission | null) => void
): (() => void) => {
  if (!db) {
    callback(null);
    return () => {};
  }

  const missionRef = doc(db, 'missions', missionId);

  return onSnapshot(missionRef, (snapshot) => {
    if (!snapshot.exists()) {
      callback(null);
      return;
    }

    const missionData = docToMission(snapshot.data(), snapshot.id);
    callback(missionData);
  });
};

// ============================================================================
// 미션 CRUD 함수
// ============================================================================

/**
 * 미션 제출 업데이트
 */
export const updateMissionSubmission = async (
  missionId: string,
  memo: string
): Promise<void> => {
  if (!db) {
    throw new Error('Firestore가 초기화되지 않았습니다.');
  }

  const missionRef = doc(db, 'missions', missionId);
  await updateDoc(missionRef, {
    status: 'SUBMITTED' as MissionStatus, // 아이가 제출함 (부모 확인 대기)
    memo,
    completedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

/**
 * 미션 승인
 */
export const approveMission = async (
  missionId: string,
  approvedBy: string
): Promise<void> => {
  if (!db) {
    throw new Error('Firestore가 초기화되지 않았습니다.');
  }

  const missionRef = doc(db, 'missions', missionId);
  
  // 트랜잭션 전에 미션 데이터를 읽어서 이력 저장에 사용
  type MissionDataForHistory = {
    childId: string; 
    rewardPoint: number; 
    title?: string; 
    description?: string;
    parentId: string;
  };
  let missionDataForHistory: MissionDataForHistory | null = null;
  let newTotalPoint: number = 0;
  
  await runTransaction(db, async (transaction) => {
    // ⚠️ Firestore 트랜잭션 규칙: 모든 읽기를 먼저 실행한 후 모든 쓰기를 실행해야 함
    
    // 1. 모든 읽기 먼저 실행
    const missionDoc = await transaction.get(missionRef);
    if (!missionDoc.exists()) {
      throw new Error('미션을 찾을 수 없습니다.');
    }

    const missionData = missionDoc.data();
    // SUBMITTED 또는 RESUBMITTED 상태만 승인 가능
    const isApprovableStatus = 
      missionData.status === 'SUBMITTED' ||
      missionData.status === 'PENDING_REVIEW' || // 하위 호환성
      missionData.status === 'RESUBMITTED' ||
      missionData.status === 'REQUEST' || // 하위 호환성
      missionData.status === 'RETRY_REQUESTED'; // 하위 호환성
    if (!isApprovableStatus) {
      throw new Error('승인 대기 상태의 미션이 아닙니다.');
    }

    // 아이 포인트 업데이트를 위한 사용자 문서 읽기 (읽기는 모두 먼저 실행)
    const userRef = doc(db, 'users', missionData.childId);
    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists()) {
      throw new Error('사용자를 찾을 수 없습니다.');
    }

    const userData = userDoc.data();
    const currentPoints = userData.totalPoint || 0;
    newTotalPoint = currentPoints + missionData.rewardPoint;
    
    // 이력 저장을 위해 미션 데이터 저장 (트랜잭션 외부에서 사용)
    missionDataForHistory = {
      childId: missionData.childId,
      rewardPoint: missionData.rewardPoint,
      title: missionData.title,
      description: missionData.description,
      parentId: missionData.parentId || approvedBy, // 미션의 parentId 또는 승인한 부모 ID
    };
    
    // 2. 모든 쓰기는 읽기 완료 후 실행
    // 미션 상태 업데이트 (APPROVED로 통일)
    transaction.update(missionRef, {
      status: 'APPROVED' as MissionStatus,
      approvedAt: serverTimestamp(),
      approvedBy,
      updatedAt: serverTimestamp(),
    });

    // 아이 포인트 업데이트
    transaction.update(userRef, {
      totalPoint: newTotalPoint,
      updatedAt: serverTimestamp(),
    });
  });

  // 포인트 적립 이력 추가 (트랜잭션 외부에서 실행 - pointHistory 컬렉션은 별도)
  if (missionDataForHistory !== null) {
    try {
      const { addPointHistory } = await import('./pointHistory');
      // 타입 가드: missionDataForHistory가 null이 아니므로 타입이 좁혀짐
      const data: MissionDataForHistory = missionDataForHistory;
      await addPointHistory(
        data.childId,
        'earn',
        data.rewardPoint,
        '미션 완료',
        'parent',
        data.title || '미션 완료', // rewardTitle: 실제 미션 이름
        data.parentId, // parentId
        missionId, // missionId
        newTotalPoint // balanceAfter
      );
    } catch (error) {
      // 이력 저장 실패는 포인트 적립을 막지 않음
    }
  }
};

/**
 * 미션 반려
 */
export const rejectMission = async (missionId: string): Promise<void> => {
  if (!db) {
    throw new Error('Firestore가 초기화되지 않았습니다.');
  }

  const missionRef = doc(db, 'missions', missionId);
  const missionDoc = await getDoc(missionRef);
  if (!missionDoc.exists()) {
    throw new Error('미션을 찾을 수 없습니다.');
  }

  const missionData = missionDoc.data();
  // SUBMITTED 또는 REQUEST 상태만 반려 가능
  const isRejectableStatus = 
    missionData.status === 'SUBMITTED' ||
    missionData.status === 'PENDING_REVIEW' || // 하위 호환성
    missionData.status === 'REQUEST' ||
    missionData.status === 'RETRY_REQUESTED' || // 하위 호환성
    missionData.status === 'DONE_PENDING'; // 하위 호환성
  if (!isRejectableStatus) {
    throw new Error('반려할 수 없는 미션 상태입니다.');
  }

  // 부모가 "다시 해볼까요?"를 선택한 경우 RESUBMITTED 상태로 변경
  // 아이가 다시 도전할 수 있도록 함
  // 기존 제출 기록(memo, completedAt)은 유지
  await updateDoc(missionRef, {
    status: 'RESUBMITTED' as MissionStatus,
    requestedAt: serverTimestamp(),
    retryRequestedBy: 'parent', // 부모가 요청했음을 표시
    updatedAt: serverTimestamp(),
  });
};

/**
 * 미션 생성
 */
export const createMission = async (
  title: string,
  description: string,
  rewardPoint: number,
  dueDate: string,
  missionType: 'DAILY' | 'WEEKLY',
  childId: string,
  parentId: string,
  isRepeat: boolean = false,
  repeatDays: number[] = [],
  repeatStartDate?: string,
  repeatEndDate?: string | null
): Promise<string> => {
  if (!db) {
    throw new Error('Firestore가 초기화되지 않았습니다.');
  }

  const missionsRef = collection(db, 'missions');
  
  // 마감 시간을 Date 객체로 변환 (ISO string을 파싱)
  const deadlineDate = new Date(dueDate);
  const deadlineTimestamp = Timestamp.fromDate(deadlineDate);

  // TODO: 반복 미션 기능은 출시 이후 재도입 예정. 현재는 단일 미션만 지원
  const missionData: any = {
    title,
    description,
    rewardPoint,
    deadlineAt: deadlineTimestamp, // 새로운 필드 (요구사항)
    dueAt: deadlineTimestamp, // 기존 필드 (하위 호환성)
    dueDate: deadlineTimestamp, // 하위 호환성
    status: 'IN_PROGRESS' as MissionStatus,
    missionType,
    childId,
    parentId,
    createdAt: serverTimestamp(),
    completedAt: null,
    isRepeat: false, // 출시 버전에서는 항상 false
    repeatDays: [], // 출시 버전에서는 빈 배열
    isDeleted: false,
  };

  const docRef = await addDoc(missionsRef, missionData);
  return docRef.id;
};

/**
 * 미션 삭제 (논리 삭제)
 */
export const deleteMission = async (
  missionId: string,
  deletedBy: string
): Promise<void> => {
  if (!db) {
    throw new Error('Firestore가 초기화되지 않았습니다.');
  }

  const missionRef = doc(db, 'missions', missionId);
  const missionDoc = await getDoc(missionRef);
  if (!missionDoc.exists()) {
    throw new Error('미션을 찾을 수 없습니다.');
  }

  const missionData = missionDoc.data();
  if (missionData.parentId !== deletedBy) {
    throw new Error('이 미션을 삭제할 권한이 없습니다.');
  }

  await updateDoc(missionRef, {
    isDeleted: true,
    deletedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

/**
 * 미션 재도전
 */
export const retryMission = async (
  missionId: string,
  newDueDate: string,
  parentId: string
): Promise<string> => {
  if (!db) {
    throw new Error('Firestore가 초기화되지 않았습니다.');
  }

  const missionRef = doc(db, 'missions', missionId);
  const missionDoc = await getDoc(missionRef);
  if (!missionDoc.exists()) {
    throw new Error('원본 미션을 찾을 수 없습니다.');
  }

  const originalMission = missionDoc.data();
  if (originalMission.parentId !== parentId) {
    throw new Error('이 미션을 재도전할 권한이 없습니다.');
  }

  const missionsRef = collection(db, 'missions');
  const deadlineDate = new Date(newDueDate);
  const deadlineTimestamp = Timestamp.fromDate(deadlineDate);
  
  const newMissionData: any = {
    title: originalMission.title,
    description: originalMission.description,
    rewardPoint: originalMission.rewardPoint,
    deadlineAt: deadlineTimestamp, // 새로운 필드 (요구사항)
    dueAt: deadlineTimestamp, // 기존 필드 (하위 호환성)
    dueDate: deadlineTimestamp, // 하위 호환성
    status: 'IN_PROGRESS' as MissionStatus,
    missionType: originalMission.missionType,
    childId: originalMission.childId,
    parentId: originalMission.parentId,
    createdAt: serverTimestamp(),
    completedAt: null,
    // TODO: 반복 미션 기능은 출시 이후 재도입 예정. 현재는 단일 미션만 지원
    isRepeat: false, // 출시 버전에서는 항상 false
    repeatDays: [], // 출시 버전에서는 빈 배열
    isDeleted: false,
    retryCount: (originalMission.retryCount || 0) + 1,
    originalMissionId: missionId,
  };

  const docRef = await addDoc(missionsRef, newMissionData);
  return docRef.id;
};

/**
 * 미션 수정
 */
export const updateMission = async (
  missionId: string,
  title: string,
  description: string,
  rewardPoint: number,
  dueDate: string,
  missionType: 'DAILY' | 'WEEKLY',
  isRepeat: boolean = false,
  repeatDays: number[] = [],
  repeatStartDate?: string,
  repeatEndDate?: string | null,
  parentId?: string
): Promise<void> => {
  if (!db) {
    throw new Error('Firestore가 초기화되지 않았습니다.');
  }

  const missionRef = doc(db, 'missions', missionId);

  // 미션 조회하여 권한 확인
  const missionDoc = await getDoc(missionRef);
  if (!missionDoc.exists()) {
    throw new Error('미션을 찾을 수 없습니다.');
  }

  const missionData = missionDoc.data();

  // 부모 권한 확인
  if (parentId && missionData.parentId !== parentId) {
    throw new Error('이 미션을 수정할 권한이 없습니다.');
  }

  // 수정 가능한 상태 정의
  const EDITABLE_STATUSES = ['IN_PROGRESS', 'RETRY_REQUESTED', 'REQUEST', 'TODO'];

  // 수정 불가 상태 확인
  if (!EDITABLE_STATUSES.includes(missionData.status)) {
    throw new Error('수정할 수 없는 미션 상태입니다.');
  }

  // 마감 시간을 Date 객체로 변환
  const deadlineDate = new Date(dueDate);
  const deadlineTimestamp = Timestamp.fromDate(deadlineDate);

  // TODO: 반복 미션 기능은 출시 이후 재도입 예정. 현재는 단일 미션만 지원
  // 업데이트할 데이터 준비
  const updateData: any = {
    title,
    description,
    rewardPoint,
    deadlineAt: deadlineTimestamp, // 새로운 필드 (요구사항)
    dueAt: deadlineTimestamp, // 기존 필드 (하위 호환성)
    dueDate: deadlineTimestamp, // 하위 호환성
    missionType,
    status: 'IN_PROGRESS' as MissionStatus, // 수정 시 다시 진행 중 상태로 전환
    updatedAt: serverTimestamp(),
    isRepeat: false, // 출시 버전에서는 항상 false
    repeatDays: [], // 출시 버전에서는 빈 배열
  };

  await updateDoc(missionRef, updateData);
};

/**
 * 미진행으로 처리 (부모가 미션을 완료하지 않은 상태로 종료)
 * 
 * @param missionId - 미션 ID
 * @param parentId - 부모 ID (권한 확인용)
 */
export const markMissionAsNotCompleted = async (
  missionId: string,
  parentId: string
): Promise<void> => {
  if (!db) {
    throw new Error('Firestore가 초기화되지 않았습니다.');
  }

  const missionRef = doc(db, 'missions', missionId);
  const missionDoc = await getDoc(missionRef);

  if (!missionDoc.exists()) {
    throw new Error('미션을 찾을 수 없습니다.');
  }

  const missionData = missionDoc.data();

  // 부모 권한 확인
  if (missionData.parentId !== parentId) {
    throw new Error('이 미션을 처리할 권한이 없습니다.');
  }

  // 완료된 미션은 미진행으로 변경 불가
  if (
    missionData.status === 'COMPLETED' ||
    missionData.status === 'PARTIAL_APPROVED' ||
    missionData.status === 'APPROVED'
  ) {
    throw new Error('완료된 미션은 미진행으로 처리할 수 없습니다.');
  }

  await updateDoc(missionRef, {
    status: 'NOT_COMPLETED' as MissionStatus,
    updatedAt: serverTimestamp(),
  });
};

/**
 * 재도전 요청 (아이가 요청)
 * 
 * @param missionId - 미션 ID
 * @param childId - 아이 ID (권한 확인용)
 */
export const requestRetry = async (missionId: string, childId: string): Promise<void> => {
  if (!db) {
    throw new Error('Firestore가 초기화되지 않았습니다.');
  }

  const missionRef = doc(db, 'missions', missionId);
  const missionDoc = await getDoc(missionRef);

  if (!missionDoc.exists()) {
    throw new Error('미션을 찾을 수 없습니다.');
  }

  const missionData = missionDoc.data();
  
  // 권한 확인: 아이만 요청 가능
  if (missionData.childId !== childId) {
    throw new Error('이 미션을 재도전 요청할 권한이 없습니다.');
  }

  // 완료된 미션은 재도전 요청 불가
  if (
    missionData.status === 'COMPLETED' ||
    missionData.status === 'PARTIAL_APPROVED' ||
    missionData.status === 'APPROVED' ||
    missionData.status === 'DONE_APPROVED' ||
    missionData.status === 'PARTIAL' ||
    (missionData.completedAt !== null && missionData.completedAt !== undefined)
  ) {
    throw new Error('완료된 미션은 재도전 요청할 수 없습니다.');
  }

  // 이미 재도전 요청한 미션은 중복 요청 불가
  if (missionData.status === 'RETRY_REQUESTED') {
    throw new Error('이미 재도전 요청한 미션입니다.');
  }

  // 만료 여부 확인: dueAt과 현재 시간 비교
  // Firestore에서 가져온 dueAt은 Timestamp, string, 또는 다른 형식일 수 있음
  const deadlineTimestamp = missionData.deadlineAt || missionData.dueAt || missionData.dueDate;
  if (!deadlineTimestamp) {
    throw new Error('마감 시간이 설정되지 않은 미션입니다.');
  }

  try {
    // toISOString 함수를 사용하여 안전하게 변환
    const dueAtISO = toISOString(deadlineTimestamp);
    if (!dueAtISO) {
      throw new Error('마감 시간 형식이 올바르지 않습니다.');
    }

    const dueAtTime = new Date(dueAtISO).getTime();
    const nowTime = Date.now();
    
    if (isNaN(dueAtTime)) {
      throw new Error('마감 시간 형식이 올바르지 않습니다.');
    }

    // 현재 시간이 마감 시간보다 이전이면 아직 만료되지 않음
    if (nowTime < dueAtTime) {
      throw new Error('만료된 미션만 재도전 요청할 수 있습니다.');
    }
  } catch (error) {
    // 날짜 파싱 에러가 아닌 경우 원본 에러 전달
    if (error instanceof Error && error.message.includes('만료된 미션만')) {
      throw error;
    }
    throw new Error('마감 시간을 확인할 수 없습니다.');
  }

  // 아이가 재도전 요청한 경우: 상태를 RETRY_REQUESTED로 변경
  // 부모 화면에서 재도전 요청 상태를 명확히 인식할 수 있도록 함
  const updateData: any = {
    status: 'RETRY_REQUESTED' as MissionStatus,
    requestedAt: serverTimestamp(),
    retryRequestedBy: 'child', // 아이가 요청했음을 표시
    updatedAt: serverTimestamp(),
  };

  console.log('[requestRetry] 상태 업데이트 시작', {
    missionId,
    oldStatus: missionData.status,
    newStatus: 'RETRY_REQUESTED',
    updateData
  });

  try {
    await updateDoc(missionRef, updateData);
    console.log('[requestRetry] 상태 업데이트 완료', { missionId });
  } catch (error) {
    console.error('[requestRetry] 상태 업데이트 실패', { missionId, error });
    throw error;
  }
};

/**
 * 하루 지난 만료 미션 자동 삭제
 * 
 * 만료된 미션 중에서 마감 시간(dueAt)으로부터 24시간 이상 지난 미션을 찾아서 삭제합니다.
 * 
 * @param childId - 아이 ID (해당 아이의 미션만 체크)
 * @returns 삭제된 미션 ID 배열
 */
export const deleteExpiredMissionsOlderThanOneDay = async (
  childId: string
): Promise<string[]> => {
  if (!db) {
    throw new Error('Firestore가 초기화되지 않았습니다.');
  }

  const missionsRef = collection(db, 'missions');
  const q = query(
    missionsRef,
    where('childId', '==', childId),
    where('status', '==', 'EXPIRED'),
    where('isDeleted', '==', false)
  );

  const snapshot = await getDocs(q);
  const nowTime = Date.now();
  const oneDayInMs = 24 * 60 * 60 * 1000; // 24시간 (밀리초)
  const deletedMissionIds: string[] = [];

  for (const docSnapshot of snapshot.docs) {
    const missionData = docSnapshot.data();
    const deadlineTimestamp = missionData.deadlineAt || missionData.dueAt || missionData.dueDate;
    
    if (!deadlineTimestamp) {
      continue; // 마감 시간이 없으면 스킵
    }

    try {
      const dueAtISO = toISOString(deadlineTimestamp);
      if (!dueAtISO) {
        continue; // 변환 실패 시 스킵
      }

      const dueAtTime = new Date(dueAtISO).getTime();
      if (isNaN(dueAtTime)) {
        continue; // 유효하지 않은 날짜면 스킵
      }

      // 마감 시간으로부터 24시간 이상 지났는지 확인
      const timeSinceExpiration = nowTime - dueAtTime;
      if (timeSinceExpiration >= oneDayInMs) {
        // 하루 이상 지난 만료 미션 삭제
        const missionRef = doc(db, 'missions', docSnapshot.id);
        await updateDoc(missionRef, {
          isDeleted: true,
          deletedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        deletedMissionIds.push(docSnapshot.id);
      }
    } catch (error) {
      // 개별 미션 처리 실패는 무시하고 계속 진행
      debugWarn(`[deleteExpiredMissionsOlderThanOneDay] 미션 ${docSnapshot.id} 처리 실패:`, error);
    }
  }

  return deletedMissionIds;
};

/**
 * 재도전 승인 (부모가 승인)
 * 
 * 정책:
 * - 기존 미션은 기록용으로 유지 (retryRequestStatus: "approved"로 업데이트)
 * - 새로운 미션을 오늘 날짜 기준으로 복제 생성
 * - 새 미션 상태는 "in_progress"
 * - 완료/승인 관련 데이터는 제거
 * - 마감기한은 "오늘 + 기존 미션 기간"
 * 
 * @param missionId - 미션 ID
 * @param parentId - 부모 ID (권한 확인용)
 * @param newDueDate - 새로운 마감 시간 (ISO string, 선택사항)
 */
export const approveRetry = async (
  missionId: string,
  parentId: string,
  newDueDate?: string
): Promise<void> => {
  if (!db) {
    throw new Error('Firestore가 초기화되지 않았습니다.');
  }

  const missionRef = doc(db, 'missions', missionId);
  const missionDoc = await getDoc(missionRef);

  if (!missionDoc.exists()) {
    throw new Error('미션을 찾을 수 없습니다.');
  }

  const missionData = missionDoc.data();
  
  // 권한 확인: 부모만 승인 가능
  if (missionData.parentId !== parentId) {
    throw new Error('이 미션을 재도전 승인할 권한이 없습니다.');
  }

  // 상태 확인: REQUEST 또는 RETRY_REQUESTED 상태만 승인 가능
  if (missionData.status !== 'RETRY_REQUESTED' && missionData.status !== 'REQUEST') {
    throw new Error('재도전 요청된 미션만 승인할 수 있습니다.');
  }

  // 기존 미션의 생성 시간과 마감 시간 계산
  const now = new Date();
  let originalCreated: Date;
  let originalDue: Date;

  // createdAt 파싱
  const createdAtValue = missionData.createdAt;
  if (createdAtValue instanceof Timestamp) {
    originalCreated = createdAtValue.toDate();
  } else if (typeof createdAtValue === 'string') {
    originalCreated = new Date(createdAtValue);
  } else {
    originalCreated = now; // fallback
  }

  // dueAt/deadlineAt/dueDate 파싱
  const deadlineValue = missionData.deadlineAt || missionData.dueAt || missionData.dueDate;
  if (deadlineValue instanceof Timestamp) {
    originalDue = deadlineValue.toDate();
  } else if (typeof deadlineValue === 'string') {
    originalDue = new Date(deadlineValue);
  } else {
    originalDue = new Date(now.getTime() + 24 * 60 * 60 * 1000); // fallback: +1일
  }

  // 기존 미션 기간 계산 (일수 기준 - "기간"을 날짜 단위로 해석)
  // 예: 2/28 ~ 3/1 (23:59) => 2일
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 0, 0);

  const originalCreatedDay = startOfDay(originalCreated);
  const originalDueDay = startOfDay(originalDue);
  const durationDays = Math.max(
    1,
    Math.round((originalDueDay.getTime() - originalCreatedDay.getTime()) / MS_PER_DAY)
  );

  // 새로운 마감 시간 계산
  let newDueDateObj: Date;
  if (newDueDate) {
    // 부모가 새로 지정한 마감 시간 사용
    newDueDateObj = new Date(newDueDate);
  } else {
    // 오늘 + 기존 미션 기간(일수)
    const todayStart = startOfDay(now);
    const dueDay = new Date(todayStart.getTime() + durationDays * MS_PER_DAY);
    newDueDateObj = endOfDay(dueDay);
  }

  const newDeadlineTimestamp = Timestamp.fromDate(newDueDateObj);
  const nowTimestamp = Timestamp.fromDate(now);

  // 기존 미션 상태 업데이트 + 새 미션 생성을 트랜잭션으로 묶어 원자적 처리
  // → 둘 중 하나라도 실패하면 전체 롤백
  const newMissionData: any = {
    title: missionData.title,
    description: missionData.description || '',
    rewardPoint: missionData.rewardPoint || 0,
    status: 'IN_PROGRESS' as MissionStatus,
    childId: missionData.childId,
    parentId: missionData.parentId,
    missionType: missionData.missionType || 'DAILY',
    isRepeat: missionData.isRepeat || false,
    repeatDays: missionData.repeatDays || [],
    isDeleted: false,
    createdAt: nowTimestamp,
    deadlineAt: newDeadlineTimestamp,
    dueAt: newDeadlineTimestamp,
    dueDate: newDeadlineTimestamp,
    updatedAt: serverTimestamp(),
    completedAt: null,
    approvedAt: null,
    resultImageUrl: null,
    resultComment: null,
    memo: null,
    submittedAt: null,
    retryRequestStatus: null,
    retryRequestedBy: null,
    requestedAt: null,
    retryApprovedAt: null,
    retryRejectedAt: null,
    expiredAt: null,
    resultStatus: null,
    originalMissionId: missionId,
  };

  // 반복 미션 관련 필드 (있는 경우만 복사)
  if (missionData.repeatStartDate) {
    newMissionData.repeatStartDate = missionData.repeatStartDate;
  }
  if (missionData.repeatEndDate) {
    newMissionData.repeatEndDate = missionData.repeatEndDate;
  }

  const missionsRef = collection(db, 'missions');
  const newMissionRef = doc(missionsRef); // 새 문서 ref를 트랜잭션 밖에서 미리 생성

  await runTransaction(db, async (transaction) => {
    // 1. 기존 미션 상태를 RETRY_APPROVED로 변경
    transaction.update(missionRef, {
      status: 'RETRY_APPROVED' as MissionStatus,
      retryRequestedBy: null,
      retryRequestStatus: 'approved',
      retryApprovedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // 2. 새 미션 생성 (트랜잭션 내 set 사용)
    transaction.set(newMissionRef, newMissionData);
  });
};

/**
 * 부모가 만료된 미션을 재도전 요청 상태로 변경
 * 
 * @param missionId - 미션 ID
 * @param parentId - 부모 ID (권한 확인용)
 */
export const requestRetryByParent = async (
  missionId: string,
  parentId: string
): Promise<void> => {
  if (!db) {
    throw new Error('Firestore가 초기화되지 않았습니다.');
  }

  const missionRef = doc(db, 'missions', missionId);
  const missionDoc = await getDoc(missionRef);

  if (!missionDoc.exists()) {
    throw new Error('미션을 찾을 수 없습니다.');
  }

  const missionData = missionDoc.data();
  
  // 권한 확인: 부모만 요청 가능
  if (missionData.parentId !== parentId) {
    throw new Error('이 미션을 재도전 요청할 권한이 없습니다.');
  }

  // 만료된 미션이 아니면 재도전 요청 불가
  if (missionData.status !== 'EXPIRED') {
    throw new Error('만료된 미션만 재도전 요청할 수 있습니다.');
  }

  // 이미 재도전 요청한 미션은 중복 요청 불가
  if (missionData.status === 'RETRY_REQUESTED' || missionData.status === 'REQUEST') {
    throw new Error('이미 재도전 요청한 미션입니다.');
  }

  await updateDoc(missionRef, {
    status: 'REQUEST' as MissionStatus,
    requestedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

/**
 * 재도전 거절 (부모가 거절)
 * 
 * 정책:
 * - 기존 미션 상태를 "failed"로 변경
 * - retryRequestStatus = "rejected"
 * - 미션 종료 처리
 * 
 * @param missionId - 미션 ID
 * @param parentId - 부모 ID (권한 확인용)
 */
export const rejectRetry = async (missionId: string, parentId: string): Promise<void> => {
  if (!db) {
    throw new Error('Firestore가 초기화되지 않았습니다.');
  }

  const missionRef = doc(db, 'missions', missionId);
  const missionDoc = await getDoc(missionRef);

  if (!missionDoc.exists()) {
    throw new Error('미션을 찾을 수 없습니다.');
  }

  const missionData = missionDoc.data();
  
  // 권한 확인: 부모만 거절 가능
  if (missionData.parentId !== parentId) {
    throw new Error('이 미션을 재도전 거절할 권한이 없습니다.');
  }

  // 상태 확인: REQUEST 또는 RETRY_REQUESTED 상태만 거절 가능
  if (missionData.status !== 'RETRY_REQUESTED' && missionData.status !== 'REQUEST') {
    throw new Error('재도전 요청된 미션만 거절할 수 있습니다.');
  }

  await updateDoc(missionRef, {
    status: 'FAILED' as MissionStatus,
    retryRequestStatus: 'rejected',
    retryRejectedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

// ============================================================================
// 1회 마이그레이션: missions 문서에 createdAt 추가 (실행 후 버튼/호출 제거)
// ============================================================================

/**
 * missions 컬렉션에서 createdAt이 없는 문서에 serverTimestamp()를 설정합니다.
 * 설정 화면의 임시 버튼으로 1회 실행 후, 해당 버튼을 제거하세요.
 */
export const migrateCreatedAt = async (): Promise<void> => {
  if (!db) {
    alert('Firestore가 초기화되지 않았습니다.');
    return;
  }

  const snapshot = await getDocs(collection(db, 'missions'));

  for (const document of snapshot.docs) {
    const data = document.data();

    if (!data.createdAt) {
      await updateDoc(doc(db, 'missions', document.id), {
        createdAt: serverTimestamp(),
      });
      console.log('updated:', document.id);
    }
  }

  alert('createdAt 마이그레이션 완료');
};
