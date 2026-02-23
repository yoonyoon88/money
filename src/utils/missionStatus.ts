import { Mission, MissionStatus } from '../types';

/**
 * ⚠️ DEPRECATED: 이 함수는 더 이상 사용되지 않습니다.
 * 
 * 대신 `checkAndUpdateExpiredMission` (src/firebase/missions.ts)를 사용하세요.
 * 
 * 이 함수는 `Date.now()` 기본값을 사용하여 React 리렌더링이 정상 작동하지 않습니다.
 * 
 * @deprecated
 */
export const getMissionStatus = (
  mission: Mission,
  currentTime: number
): MissionStatus => {
  // 1. COMPLETED 상태: 완료된 미션 (절대 변경하지 않음)
  if (
    mission.status === 'APPROVED' ||
    mission.status === 'COMPLETED' ||
    mission.status === 'PARTIAL_APPROVED' ||
    (mission.completedAt !== null && mission.completedAt !== undefined)
  ) {
    return mission.status;
  }

  // 2. SUBMITTED 상태: 부모 확인 대기 중 (만료되지 않음)
  if (mission.status === 'SUBMITTED' || mission.status === 'PENDING_REVIEW') {
    return mission.status;
  }

  // 3. EXPIRED 상태: 이미 만료된 미션
  if (mission.status === 'EXPIRED') {
    return 'EXPIRED';
  }

  // 4. TODO 또는 IN_PROGRESS 상태: 마감 시간 체크 필요
  if (mission.status === 'TODO' || mission.status === 'IN_PROGRESS') {
    const dueAtTime = new Date(mission.dueAt).getTime();
    
    // 마감 시간이 지났으면 EXPIRED
    if (currentTime > dueAtTime) {
      return 'EXPIRED';
    }
    
    // 아직 마감 전이면 원래 상태 유지
    return mission.status;
  }

  // 기본값: TODO
  return 'TODO';
};

/**
 * 미션 배열의 상태를 일괄 계산
 * 
 * @param missions - 미션 배열
 * @param currentTime - 현재 시간 (밀리초, 기본값: Date.now())
 * @returns 상태가 업데이트된 미션 배열
 */
/**
 * ⚠️ DEPRECATED: 이 함수는 더 이상 사용되지 않습니다.
 * 
 * 대신 `checkAndUpdateExpiredMissions` (src/firebase/missions.ts)를 사용하세요.
 * 
 * 이 함수는 `Date.now()` 기본값을 사용하여 React 리렌더링이 정상 작동하지 않습니다.
 * 
 * @deprecated
 */
export const updateMissionStatuses = (
  missions: Mission[],
  currentTime: number
): Mission[] => {
  return missions.map((mission) => {
    const newStatus = getMissionStatus(mission, currentTime);
    
    // 상태가 변경된 경우에만 업데이트
    if (newStatus !== mission.status) {
      return {
        ...mission,
        status: newStatus,
        // EXPIRED로 변경된 경우 expiredAt 설정
        expiredAt: newStatus === 'EXPIRED' && !mission.expiredAt
          ? new Date(currentTime).toISOString()
          : mission.expiredAt,
        resultStatus: newStatus === 'EXPIRED' ? 'expired' : mission.resultStatus,
      };
    }
    
    return mission;
  });
};

