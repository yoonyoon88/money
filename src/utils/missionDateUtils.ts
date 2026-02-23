/**
 * 미션 마감 시간 관련 유틸리티 함수
 * 모든 마감 시간 표시와 비교는 이 파일의 함수를 사용하여 단일 기준을 유지
 */

/**
 * 마감 시간 문구 포맷
 * 
 * 규칙:
 * - 오늘 날짜일 경우: "오늘 HH시 mm분까지"
 * - 다른 날짜일 경우: "YYYY년 M월 D일 HH시 mm분까지"
 * 
 * @param dueAt - ISO date string (Firestore에서 가져온 dueAt)
 * @param currentTime - 현재 시간 (밀리초, 기본값: Date.now())
 * @returns 포맷된 마감 시간 문구
 */
export const formatDueDate = (
  dueAt: string,
  currentTime: number = Date.now()
): string => {
  try {
    // dueAt을 Date 객체로 변환 (단일 기준)
    const dueAtDate = new Date(dueAt);
    
    // 유효하지 않은 날짜인 경우
    if (isNaN(dueAtDate.getTime())) {
      return '마감 시간 없음';
    }

    // 현재 시간을 Date 객체로 변환
    const now = new Date(currentTime);
    
    // 오늘 날짜 (시간 제외)
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dueAtDateOnly = new Date(dueAtDate.getFullYear(), dueAtDate.getMonth(), dueAtDate.getDate());

    // 오늘 날짜인지 확인
    if (dueAtDateOnly.getTime() === today.getTime()) {
      // 오늘 날짜: "오늘 HH시 mm분까지"
      const hours = dueAtDate.getHours();
      const minutes = dueAtDate.getMinutes();
      
      if (minutes === 0) {
        return `오늘 ${hours}시까지`;
      } else {
        return `오늘 ${hours}시 ${minutes}분까지`;
      }
    } else {
      // 다른 날짜: "YYYY년 M월 D일 HH시 mm분까지"
      const year = dueAtDate.getFullYear();
      const month = dueAtDate.getMonth() + 1;
      const day = dueAtDate.getDate();
      const hours = dueAtDate.getHours();
      const minutes = dueAtDate.getMinutes();
      
      if (minutes === 0) {
        return `${year}년 ${month}월 ${day}일 ${hours}시까지`;
      } else {
        return `${year}년 ${month}월 ${day}일 ${hours}시 ${minutes}분까지`;
      }
    }
  } catch (error) {
    return '마감 시간 오류';
  }
};

/**
 * 마감 시간 생성 (Date.setHours 사용)
 * 
 * @param year - 년도
 * @param month - 월 (1-12)
 * @param day - 일
 * @param hour - 시 (0-23)
 * @param minute - 분 (0-59, 기본값: 0)
 * @returns Date 객체
 */
export const createDueDate = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number = 0
): Date => {
  const dueDate = new Date(year, month - 1, day); // month는 0부터 시작
  dueDate.setHours(hour, minute, 0, 0); // 초와 밀리초는 0으로 설정
  
  return dueDate;
};

/**
 * 오늘 날짜에 특정 시간 설정
 * 
 * @param hour - 시 (0-23)
 * @param minute - 분 (0-59, 기본값: 0)
 * @returns Date 객체
 */
export const createTodayDueDate = (
  hour: number,
  minute: number = 0
): Date => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  today.setHours(hour, minute, 0, 0);
  
  return today;
};

/**
 * 미션 상태 판별
 * 
 * 규칙:
 * - 현재 시간 >= dueAt → EXPIRED
 * - 현재 시간 < dueAt → IN_PROGRESS
 * - COMPLETED, PARTIAL_APPROVED, PENDING_REVIEW는 만료되지 않음
 * 
 * @param mission - 미션 객체
 * @param currentTime - 현재 시간 (밀리초, 기본값: Date.now())
 * @returns 계산된 상태
 */
export const getMissionStatus = (
  mission: { status: string; dueAt: string; completedAt?: string | null },
  currentTime: number = Date.now()
): 'IN_PROGRESS' | 'EXPIRED' | 'COMPLETED' | 'PARTIAL_APPROVED' | 'PENDING_REVIEW' => {
  // 완료된 미션은 상태 변경하지 않음
  if (
    mission.status === 'COMPLETED' ||
    mission.status === 'PARTIAL_APPROVED' ||
    (mission.completedAt !== null && mission.completedAt !== undefined)
  ) {
    return mission.status as 'COMPLETED' | 'PARTIAL_APPROVED';
  }

  // 확인 중인 미션은 만료되지 않음
  if (mission.status === 'PENDING_REVIEW') {
    return 'PENDING_REVIEW';
  }

  // 이미 만료된 미션은 그대로 유지
  if (mission.status === 'EXPIRED') {
    return 'EXPIRED';
  }

  // 진행 중인 미션만 마감 시간 체크
  if (mission.status !== 'IN_PROGRESS' && mission.status !== 'ACTIVE') {
    // 기존 ACTIVE 상태도 처리 (하위 호환성)
    return mission.status as any;
  }

  // 마감 시간 비교
  try {
    const dueAtTime = new Date(mission.dueAt).getTime();
    
    // 유효하지 않은 날짜인 경우
    if (isNaN(dueAtTime)) {
      return 'IN_PROGRESS';
    }

    // 현재 시간 >= 마감 시간이면 만료
    if (currentTime >= dueAtTime) {
      return 'EXPIRED';
    } else {
      return 'IN_PROGRESS';
    }
  } catch (error) {
    return 'IN_PROGRESS';
  }
};

