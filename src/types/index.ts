// 미션 상태 정의 (정합성 필수)
// Firestore mission.status 값은 아래로 통일
// - TODO: 아직 시작하지 않은 미션
// - IN_PROGRESS: 아이가 진행 중인 미션
// - SUBMITTED: 아이가 결과를 제출했고 부모 확인을 기다리는 상태
// - RESUBMITTED: 부모가 '다시 해볼까'를 눌러 아이가 재도전 요청한 상태
// - APPROVED: 부모가 승인 완료한 상태
// - COMPLETED: 승인까지 끝나고 기록용으로 완료된 상태
// 하위 호환성: PENDING_REVIEW(SUBMITTED), REQUEST(RESUBMITTED), RETRY_REQUESTED(RESUBMITTED)
export type MissionStatus = 
  | 'TODO'               // 아직 시작하지 않은 미션
  | 'IN_PROGRESS'        // 아이가 진행 중인 미션
  | 'SUBMITTED'          // 아이가 결과를 제출했고 부모 확인을 기다리는 상태
  | 'RESUBMITTED'        // 부모가 '다시 해볼까'를 눌러 아이가 재도전 요청한 상태
  | 'APPROVED'           // 부모가 승인 완료한 상태
  | 'COMPLETED'          // 승인까지 끝나고 기록용으로 완료된 상태
  | 'EXPIRED'            // 기한 초과
  | 'PENDING_REVIEW'     // SUBMITTED와 동일 의미 (하위 호환성)
  | 'REQUEST'            // RESUBMITTED와 동일 의미 (하위 호환성)
  | 'RETRY_REQUESTED'    // RESUBMITTED와 동일 의미 (하위 호환성)
  | 'REJECTED'           // 부모가 미진행 처리 (하위 호환성)
  | 'PARTIAL_APPROVED'   // 부분 승인 (하위 호환성)
  | 'RETRY_APPROVED'     // 재도전 승인 (하위 호환성)
  | 'RETRY_REJECTED'     // 재도전 거절 (하위 호환성)
  | 'NOT_COMPLETED';     // 미진행 (하위 호환성)
export type MissionType = 'DAILY' | 'WEEKLY';
export type UserRole = 'PARENT' | 'CHILD';
export type MissionResultStatus = 'success' | 'partial' | 'expired';

export interface Mission {
  id: string;
  title: string;
  description: string;
  rewardPoint: number;
  dueAt: string; // ISO date string - 마감일/시간 (YYYY-MM-DD HH:mm)
  status: MissionStatus;
  missionType: MissionType; // 일별 미션 또는 주간 미션
  memo?: string; // 아이가 작성한 메모
  parentMemo?: string; // 부모가 작성한 문구 (선택사항)
  // Firebase 연동을 위한 필드
  childId: string; // 미션을 받은 아이의 ID
  parentId: string; // 미션을 준 부모의 ID
  createdAt?: string; // ISO date string - 미션 생성 시간
  completedAt?: string | null; // ISO date string - 완료(제출) 시간
  approvedAt?: string; // ISO date string - 승인 시간
  approvedBy?: string; // 승인한 부모의 UID
  // 반복 미션 필드
  isRepeat?: boolean; // 반복 미션 여부
  repeatDays?: number[]; // 반복 요일 배열 (0=일, 1=월, ..., 6=토)
  repeatStartDate?: string; // 반복 시작일 (ISO date string, required if isRepeat)
  repeatEndDate?: string | null; // 반복 종료일 (ISO date string, nullable)
  // 삭제 필드
  isDeleted?: boolean; // 논리 삭제 여부
  deletedAt?: string; // 삭제 시간 (ISO date string)
  // 마감 관련 필드
  expiredAt?: string | null; // ISO date string - 마감 지난 시간
  retryCount?: number; // 재도전 횟수 (default 0)
  resultStatus?: MissionResultStatus; // 통계용 결과 상태
  originalMissionId?: string; // 재도전으로 생성된 경우 원본 미션 ID
  partialPoint?: number; // 부분 승인 시 지급된 포인트
  requestedAt?: string; // ISO date string - 재도전 요청 시간
  retryRequestedBy?: 'parent' | 'child'; // 재도전 요청한 주체 (부모 또는 아이)
}

export interface User {
  id: string; // Firebase document ID
  name: string;
  totalPoint: number;
  role: UserRole; // 부모 또는 아이
  // Firebase 연동을 위한 필드
  email?: string; // 로그인용 이메일
  createdAt?: string; // ISO date string - 계정 생성 시간
  updatedAt?: string; // ISO date string - 마지막 업데이트 시간
  // 부모인 경우
  childrenIds?: string[]; // 자녀들의 ID 배열
  parentPin?: string; // 부모 PIN (4자리)
  // 아이인 경우
  parentId?: string; // 부모의 ID
  gender?: 'male' | 'female'; // 자녀 성별 (아이인 경우)
}

