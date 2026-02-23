import { User, Mission, UserRole } from '../types';

/**
 * 사용자가 부모인지 확인
 */
export const isParent = (user: User): boolean => {
  return user.role === 'PARENT';
};

/**
 * 사용자가 아이인지 확인
 */
export const isChild = (user: User): boolean => {
  return user.role === 'CHILD';
};

/**
 * 미션을 제출할 수 있는 권한이 있는지 확인
 * - 아이만 제출 가능
 * - 자신의 미션이어야 함 (childId === user.id)
 * - 미션 상태가 ACTIVE여야 함
 */
export const canSubmitMission = (user: User, mission: Mission): boolean => {
  if (!isChild(user)) {
    return false;
  }
  if (mission.childId !== user.id) {
    return false;
  }
  // TODO 또는 IN_PROGRESS 상태만 제출 가능
  if (mission.status !== 'TODO' && mission.status !== 'IN_PROGRESS') {
    return false;
  }
  return true;
};

/**
 * 미션을 승인할 수 있는 권한이 있는지 확인
 * - 부모만 승인 가능
 * - 자신이 만든 미션이어야 함 (parentId === user.id) 또는 자녀의 미션이어야 함
 * - 미션 상태가 SUBMITTED 또는 REQUEST여야 함
 */
export const canApproveMission = (user: User, mission: Mission): boolean => {
  if (!isParent(user)) {
    return false;
  }
  // 자신이 만든 미션이거나 자녀의 미션이어야 함
  const isOwnMission = mission.parentId === user.id;
  const isChildMission = user.childrenIds?.includes(mission.childId) ?? false;
  if (!isOwnMission && !isChildMission) {
    return false;
  }
  // SUBMITTED 또는 RESUBMITTED 상태만 승인 가능
  const isApprovableStatus = 
    mission.status === 'SUBMITTED' ||
    mission.status === 'PENDING_REVIEW' || // 하위 호환성
    mission.status === 'RESUBMITTED' ||
    mission.status === 'REQUEST' || // 하위 호환성
    mission.status === 'RETRY_REQUESTED'; // 하위 호환성
  if (!isApprovableStatus) {
    return false;
  }
  return true;
};

/**
 * 미션을 반려할 수 있는 권한이 있는지 확인
 * - 부모만 반려 가능
 * - 자신이 만든 미션이어야 함 (parentId === user.id) 또는 자녀의 미션이어야 함
 * - 미션 상태가 SUBMITTED 또는 REQUEST여야 함
 */
export const canRejectMission = (user: User, mission: Mission): boolean => {
  if (!isParent(user)) {
    return false;
  }
  // 자신이 만든 미션이거나 자녀의 미션이어야 함
  const isOwnMission = mission.parentId === user.id;
  const isChildMission = user.childrenIds?.includes(mission.childId) ?? false;
  if (!isOwnMission && !isChildMission) {
    return false;
  }
  // SUBMITTED 또는 RESUBMITTED 상태만 재도전 요청 가능
  const isRejectableStatus = 
    mission.status === 'SUBMITTED' ||
    mission.status === 'PENDING_REVIEW' || // 하위 호환성
    mission.status === 'RESUBMITTED' ||
    mission.status === 'REQUEST' || // 하위 호환성
    mission.status === 'RETRY_REQUESTED'; // 하위 호환성
  if (!isRejectableStatus) {
    return false;
  }
  return true;
};

/**
 * 미션을 볼 수 있는 권한이 있는지 확인
 * - 아이: 자신의 미션만 볼 수 있음 (childId === user.id)
 * - 부모: 자신이 만든 미션이거나 자녀의 미션만 볼 수 있음
 */
export const canViewMission = (user: User, mission: Mission): boolean => {
  if (isChild(user)) {
    return mission.childId === user.id;
  }
  if (isParent(user)) {
    // 부모는 자신이 만든 미션이거나 자녀의 미션을 볼 수 있음
    return mission.parentId === user.id || 
           (user.childrenIds?.includes(mission.childId) ?? false);
  }
  return false;
};

/**
 * 미션을 수정할 수 있는지 확인
 * 
 * TODO: 반복 미션 기능은 출시 이후 재도입 예정. 현재는 단일 미션만 지원
 * 
 * 수정 가능 조건 (단일 미션 기준):
 * - status가 'COMPLETED' 또는 'APPROVED' → ❌ 수정 불가
 * - 그 외 상태 → ✅ 수정 가능
 * 
 * @param mission - 수정할 미션
 * @returns 수정 가능 여부
 */
export const canEditMission = (mission: Mission): boolean => {
  // 단일 미션인 경우: COMPLETED 또는 APPROVED 상태면 수정 불가
  const isCompleted = mission.status === 'COMPLETED' || mission.status === 'APPROVED';
  return !isCompleted;
};

