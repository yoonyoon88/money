# 미션 만료 상태 관리 시스템 구현 가이드

## 📋 구현 완료 사항

### 1. 마감 시간의 단일 기준화

**파일: `src/utils/missionDateUtils.ts`**

```typescript
/**
 * 마감 시간 문구 포맷
 * Firestore의 dueAt을 단일 기준으로 사용
 */
export const formatDueDate = (
  dueAt: string,
  currentTime: number = Date.now()
): string => {
  const dueAtDate = new Date(dueAt);
  const now = new Date(currentTime);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueAtDateOnly = new Date(dueAtDate.getFullYear(), dueAtDate.getMonth(), dueAtDate.getDate());

  // 오늘 날짜인지 확인
  if (dueAtDateOnly.getTime() === today.getTime()) {
    // 오늘: "오늘 HH시 mm분까지"
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
};
```

**사용 예시:**
```typescript
// MissionCard에서 사용
import { formatDueDate } from '../utils/missionDateUtils';

<p className="text-sm text-gray-500">
  {formatDueDate(mission.dueAt, currentTime)}
</p>
```

---

### 2. 마감 시간 생성 코드 (Date.setHours 포함)

**파일: `src/utils/missionDateUtils.ts`**

```typescript
/**
 * 마감 시간 생성 (Date.setHours 사용)
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
```

**사용 예시:**
```typescript
// 미션 생성 시
import { createTodayDueDate } from '../utils/missionDateUtils';

const dueDate = createTodayDueDate(13, 0); // 오늘 13시 0분
const dueAtISO = dueDate.toISOString(); // Firestore에 저장할 ISO string
```

---

### 3. 상태 판별 함수

**파일: `src/utils/missionDateUtils.ts`**

```typescript
/**
 * 미션 상태 판별
 * 
 * 규칙:
 * - 현재 시간 >= dueAt → EXPIRED
 * - 현재 시간 < dueAt → IN_PROGRESS
 * - COMPLETED, PARTIAL_APPROVED, PENDING_REVIEW는 만료되지 않음
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

  // 검토 중인 미션은 만료되지 않음
  if (mission.status === 'PENDING_REVIEW') {
    return 'PENDING_REVIEW';
  }

  // 이미 만료된 미션은 그대로 유지
  if (mission.status === 'EXPIRED') {
    return 'EXPIRED';
  }

  // 진행 중인 미션만 마감 시간 체크
  if (mission.status !== 'IN_PROGRESS' && mission.status !== 'ACTIVE') {
    return mission.status as any;
  }

  // 마감 시간 비교
  try {
    const dueAtTime = new Date(mission.dueAt).getTime();
    
    if (isNaN(dueAtTime)) {
      console.warn('[getMissionStatus] 유효하지 않은 dueAt:', mission.dueAt);
      return 'IN_PROGRESS';
    }

    // 현재 시간 >= 마감 시간이면 만료
    if (currentTime >= dueAtTime) {
      return 'EXPIRED';
    } else {
      return 'IN_PROGRESS';
    }
  } catch (error) {
    console.error('[getMissionStatus] 상태 판별 에러:', error);
    return 'IN_PROGRESS';
  }
};
```

**파일: `src/firebase/missions.ts`**

```typescript
export const checkAndUpdateExpiredMission = (mission: Mission, now: Date | number = Date.now()): Mission => {
  // COMPLETED 상태는 변경하지 않음
  if (
    mission.status === 'COMPLETED' ||
    mission.status === 'PARTIAL_APPROVED' ||
    mission.status === 'DONE_APPROVED' || // 하위 호환성
    mission.status === 'PARTIAL' || // 하위 호환성
    (mission.completedAt !== null && mission.completedAt !== undefined)
  ) {
    return mission;
  }

  // PENDING_REVIEW 상태도 변경하지 않음
  if (mission.status === 'PENDING_REVIEW' || mission.status === 'DONE_PENDING') {
    return mission;
  }

  // IN_PROGRESS 또는 ACTIVE 상태만 처리
  if (mission.status !== 'IN_PROGRESS' && mission.status !== 'ACTIVE') {
    return mission;
  }

  const nowTime = typeof now === 'number' ? now : now.getTime();
  const dueAtTime = new Date(mission.dueAt).getTime();

  // 현재 시간 >= 마감 시간이면 만료
  if (nowTime >= dueAtTime) {
    return {
      ...mission,
      status: 'EXPIRED' as MissionStatus,
      expiredAt: mission.expiredAt || new Date(nowTime).toISOString(),
    };
  }

  return mission;
};
```

---

### 4. UI 분기 JSX 예시

**파일: `src/components/MissionCard.tsx`**

#### 아이 화면 (EXPIRED 상태)

```typescript
{isExpired ? (
  // ✅ 만료된 미션 UI (아이)
  <div className="space-y-3">
    <div className="flex items-center gap-2 mb-2">
      <div className="w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center">
        <span className="text-2xl">⏰</span>
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-lg font-bold text-gray-800">{mission.title}</h3>
          {getStatusBadge()} {/* "⏰ 시간 초과" */}
        </div>
      </div>
    </div>
    
    {/* 만료 메시지 */}
    <div className="text-sm text-gray-600 space-y-1">
      <p>시간이 지나서 도전이 종료됐어요</p>
      <p>부모에게 다시 도전 요청을 할 수 있어요</p>
    </div>

    {/* 다시 도전 요청 버튼 */}
    {onRetryRequest && (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRetryRequest(mission.id);
        }}
        className="w-full py-2.5 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition-colors"
      >
        다시 도전 요청
      </button>
    )}

    {/* 완료 버튼 비활성화 (표시하지 않음) */}
  </div>
) : (
  // 진행 중 미션 UI
  // ...
)}
```

#### 부모 화면 (EXPIRED 상태)

```typescript
{isExpired ? (
  // ✅ 만료된 미션 UI (부모)
  <div className="space-y-3">
    <div className="flex items-center gap-2 mb-2">
      <h3 className="text-lg font-bold text-gray-800">{mission.title}</h3>
      {getStatusBadge()} {/* "기한 만료" */}
    </div>

    {/* 만료 메시지 */}
    <div className="text-sm text-gray-600 mb-3">
      <p>마감 시간이 지나 미션이 만료되었습니다</p>
    </div>

    {/* 선택지 버튼들 */}
    <div className="flex flex-col gap-2">
      {/* 1. 재도전 허용 */}
      {onRetry && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRetry(mission.id);
          }}
          className="w-full py-2.5 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors"
        >
          재도전 허용
        </button>
      )}

      {/* 2. 부분 승인 */}
      {onPartialApprove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPartialApprove(mission.id);
          }}
          className="w-full py-2.5 bg-yellow-600 text-white rounded-xl font-medium hover:bg-yellow-700 transition-colors"
        >
          부분 승인
        </button>
      )}

      {/* 3. 실패 처리 */}
      {onFail && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onFail(mission.id);
          }}
          className="w-full py-2.5 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors"
        >
          실패 처리
        </button>
      )}
    </div>
  </div>
) : (
  // 다른 상태의 미션 UI
  // ...
)}
```

---

### 5. 디버그 패널 (개발 모드)

**파일: `src/components/MissionDebugPanel.tsx`**

```typescript
import { getMissionStatus } from '../utils/missionDateUtils';

const MissionDebugPanel: React.FC<{ mission: Mission; currentTime?: number }> = ({ 
  mission,
  currentTime = Date.now()
}) => {
  const calculatedStatus = getMissionStatus(mission, currentTime);
  const dueAtTime = new Date(mission.dueAt).getTime();
  const remainingTime = dueAtTime - currentTime;
  const isExpired = currentTime >= dueAtTime;

  return (
    <div className="fixed bottom-4 left-4 bg-white border-2 border-blue-500 rounded-lg p-4 shadow-lg z-50">
      <div className="font-bold text-blue-600 mb-3">🔍 미션 디버그 패널</div>
      
      {/* 현재 클라이언트 시간 */}
      <div className="mb-3">
        <div className="font-semibold">현재 클라이언트 시간</div>
        <div>밀리초: {currentTime}</div>
        <div>ISO: {new Date(currentTime).toISOString()}</div>
        <div>로컬: {new Date(currentTime).toLocaleString('ko-KR')}</div>
      </div>

      {/* dueAt ISO / 로컬 시간 */}
      <div className="mb-3">
        <div className="font-semibold">마감 시간 (dueAt)</div>
        <div>원본: {mission.dueAt}</div>
        <div>밀리초: {dueAtTime}</div>
        <div>ISO: {new Date(mission.dueAt).toISOString()}</div>
        <div>로컬: {new Date(mission.dueAt).toLocaleString('ko-KR')}</div>
      </div>

      {/* 남은 시간(ms) */}
      <div className="mb-3">
        <div className="font-semibold">남은 시간</div>
        <div>밀리초: {remainingTime}</div>
        <div>시간: {formatRemainingTime(remainingTime)}</div>
      </div>

      {/* 상태 판정 결과 */}
      <div className={`${isExpired ? 'bg-red-50' : 'bg-green-50'}`}>
        <div className="font-semibold">상태 판정 결과</div>
        <div className={`font-bold ${isExpired ? 'text-red-600' : 'text-green-600'}`}>
          {isExpired ? '❌ 만료됨' : '✅ 진행 중'}
        </div>
        <div>비교: {currentTime} >= {dueAtTime} = {isExpired ? 'true' : 'false'}</div>
        <div>계산된 상태: {calculatedStatus}</div>
      </div>
    </div>
  );
};
```

**사용 예시:**
```typescript
// ChildHome.tsx 또는 Home.tsx
import MissionDebugPanel from './MissionDebugPanel';

{process.env.NODE_ENV === 'development' && (
  <MissionDebugPanel 
    mission={checkedMissions[0]} 
    currentTime={currentTime}
  />
)}
```

---

## 📝 Firestore 상태 구조

### 상태 enum

```typescript
export type MissionStatus = 
  | 'IN_PROGRESS'      // 진행 중
  | 'COMPLETED'        // 완료됨
  | 'EXPIRED'          // 만료됨
  | 'PARTIAL_APPROVED' // 부분 승인
  | 'PENDING_REVIEW';  // 검토 중
```

### Firestore 문서 구조

```typescript
{
  id: string;
  title: string;
  description: string;
  rewardPoint: number;
  dueAt: Timestamp; // 마감일/시간 (단일 기준)
  status: MissionStatus;
  missionType: 'DAILY' | 'WEEKLY';
  
  // 시간 필드
  createdAt: Timestamp;
  completedAt: Timestamp | null;
  approvedAt: Timestamp | null;
  expiredAt: Timestamp | null;
  
  // 부분 승인
  partialPoint?: number;
  
  // 재도전
  retryCount?: number;
  originalMissionId?: string;
  
  // 관계
  childId: string;
  parentId: string;
  
  // 메모
  memo?: string;
  parentMemo?: string;
}
```

---

## ✅ 체크리스트

- [x] 마감 시간의 단일 기준화 (dueAt 기반)
- [x] 마감 문구 포맷 함수 (오늘/다른 날짜 구분)
- [x] 상태 판별 함수 (현재 시간 >= dueAt → EXPIRED)
- [x] 아이 화면 UX (완료 버튼 비활성화, 다시 도전 요청)
- [x] 부모 화면 UX (재도전/부분승인/실패처리)
- [x] Firestore 상태 구조 정의
- [x] 자동 상태 반영 (화면 진입, 새로고침, 날짜 변경)
- [x] 디버그 패널 (개발 모드)

---

모든 요구사항이 구현되었습니다!

