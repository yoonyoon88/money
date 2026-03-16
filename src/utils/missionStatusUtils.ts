import { Mission } from '../types';

/**
 * 미션 상태 해석 유틸 함수
 * RESUBMITTED 상태이지만 부모가 요청한 것이 아닌 경우 SUBMITTED로 보정
 */
export const getInterpretedStatus = (mission: Mission): string => {
  // 아이가 재도전 요청한 경우는 RETRY_REQUESTED 상태 유지
  if (
    (mission.status === 'RETRY_REQUESTED' || mission.status === 'REQUEST') &&
    mission.retryRequestedBy === 'child'
  ) {
    return 'RETRY_REQUESTED';
  }
  
  // RESUBMITTED 상태이지만 부모가 요청한 것이 아닌 경우 SUBMITTED로 보정
  if (
    (mission.status === 'RESUBMITTED' || 
     mission.status === 'REQUEST' || 
     mission.status === 'RETRY_REQUESTED') &&
    mission.retryRequestedBy !== 'parent'
  ) {
    return 'SUBMITTED';
  }
  
  // 하위 호환성 처리
  if (mission.status === 'PENDING_REVIEW') {
    return 'SUBMITTED';
  }
  if (mission.status === 'COMPLETED') {
    return 'APPROVED';
  }
  if (mission.status === 'IN_PROGRESS') {
    return 'IN_PROGRESS';
  }
  
  return mission.status;
};

/**
 * 아이 재도전 중인지 확인
 * 조건: status === IN_PROGRESS && retryRequestedBy === 'parent'
 */
export const isChildRetrying = (mission: Mission): boolean => {
  const interpretedStatus = getInterpretedStatus(mission);
  return (
    interpretedStatus === 'IN_PROGRESS' && 
    mission.retryRequestedBy === 'parent'
  );
};

/**
 * 부모가 재도전 요청한 상태인지 확인
 * 조건: status === RESUBMITTED && retryRequestedBy === 'parent'
 */
export const isParentRequestedRetry = (mission: Mission): boolean => {
  const interpretedStatus = getInterpretedStatus(mission);
  return (
    (interpretedStatus === 'RESUBMITTED' ||
     mission.status === 'RESUBMITTED' ||
     mission.status === 'REQUEST' ||
     mission.status === 'RETRY_REQUESTED') &&
    mission.retryRequestedBy === 'parent'
  );
};

/**
 * 아이가 재도전 요청한 상태인지 확인
 * 조건: retryRequestedBy === 'child'
 */
export const isChildRequestedRetry = (mission: Mission): boolean => {
  return mission.retryRequestedBy === 'child';
};

