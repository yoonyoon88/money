# EXPIRED 미션 UX 구현 가이드

## 📋 개요
EXPIRED 상태의 미션에 대한 통일된 UX를 제공하고, 부모의 재도전/부분 승인 기능을 확장 가능하게 설계합니다.

## 🎯 요구사항
1. ✅ EXPIRED 미션에 통일된 문구 표시: **"시간이 지나 미션이 종료됐어요 ⏰"**
2. ✅ 아이 화면: 모든 버튼 비활성화
3. ✅ 부모 화면: 재도전/부분 승인 버튼은 활성화 유지

---

## 💻 코드 구현

### 1. useEffect + useState를 사용한 실시간 마감 체크

**파일: `src/components/Home.tsx` 또는 `src/components/ChildHome.tsx`**

```typescript
import React, { useState, useEffect, useMemo } from 'react';
import { checkAndUpdateExpiredMissions } from '../firebase/missions';
import { Mission } from '../types';

const MissionList: React.FC = () => {
  const [missions, setMissions] = useState<Mission[]>([]);
  
  // ✅ 현재 시간을 state로 관리 (리렌더링 트리거)
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  // ✅ 주기적으로 현재 시간 업데이트 (10초마다)
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 10000); // 10초마다 업데이트

    return () => clearInterval(interval);
  }, []);

  // ✅ 마감 체크: missions 또는 currentTime이 변경될 때마다 재계산
  const checkedMissions = useMemo(() => {
    const now = new Date(currentTime);
    return checkAndUpdateExpiredMissions(missions, now);
  }, [missions, currentTime]);

  return (
    // ... 렌더링
  );
};
```

**핵심 포인트:**
- `currentTime`을 state로 관리하여 변경 시 자동 리렌더링
- `useMemo`로 마감 체크 결과를 메모이제이션 (성능 최적화)
- `setInterval`로 주기적 업데이트 (10초 간격 권장)

---

### 2. 상태 계산 함수

**파일: `src/firebase/missions.ts`**

```typescript
import { Mission, MissionStatus, MissionResultStatus } from '../types';

/**
 * 마감일이 지난 ACTIVE 미션을 EXPIRED로 변경
 * 
 * 상태 계산 로직:
 * - ACTIVE: 아직 마감 전, 완료되지 않음
 *   조건: status === 'ACTIVE' && now <= dueAt && !completedAt
 * 
 * - COMPLETED: 완료됨
 *   조건: status === 'DONE_APPROVED' || status === 'PARTIAL' || completedAt !== null
 * 
 * - EXPIRED: 마감 시간 초과 + 완료되지 않음
 *   조건: status === 'ACTIVE' && now > dueAt && !completedAt
 */
export const checkAndUpdateExpiredMission = (
  mission: Mission,
  now: Date | number = Date.now()
): Mission => {
  // ✅ COMPLETED 상태는 변경하지 않음
  if (
    mission.status === 'DONE_APPROVED' ||
    mission.status === 'PARTIAL' ||
    mission.completedAt
  ) {
    return mission;
  }

  // ✅ DONE_PENDING 상태도 변경하지 않음 (부모 확인 대기 중)
  if (mission.status === 'DONE_PENDING') {
    return mission;
  }

  // ✅ ACTIVE 상태만 처리
  if (mission.status !== 'ACTIVE') {
    return mission;
  }

  // ✅ 현재 시간을 밀리초로 변환
  const nowTime = typeof now === 'number' ? now : now.getTime();
  
  // ✅ dueAt을 밀리초로 변환 (Firestore Timestamp는 toMillis() 사용)
  const dueAt = new Date(mission.dueAt);
  const dueAtTime = dueAt.getTime();

  // ✅ 마감일이 지났는지 확인
  if (nowTime > dueAtTime) {
    // 이미 expired 상태이면 그대로 반환
    if (mission.status === 'EXPIRED') {
      return mission;
    }

    // ✅ expired로 변경
    const nowDate = typeof now === 'number' ? new Date(now) : now;
    return {
      ...mission,
      status: 'EXPIRED' as MissionStatus,
      expiredAt: mission.expiredAt || nowDate.toISOString(),
      resultStatus: 'expired' as MissionResultStatus,
    };
  }

  return mission;
};

/**
 * 미션 배열에 대해 마감 처리 적용
 */
export const checkAndUpdateExpiredMissions = (
  missions: Mission[],
  now: Date | number = Date.now()
): Mission[] => {
  return missions.map((mission) => checkAndUpdateExpiredMission(mission, now));
};
```

**핵심 포인트:**
- Firestore Timestamp는 `toMillis()` 또는 `new Date()`로 변환하여 비교
- `Date | number` 타입을 받아 유연성 확보
- COMPLETED 상태는 절대 EXPIRED로 변경하지 않음

---

### 3. MissionCard 렌더링 분기 예시

**파일: `src/components/MissionCard.tsx`**

```typescript
import React from 'react';
import { Mission } from '../types';

interface MissionCardProps {
  mission: Mission;
  onClick?: () => void;
  isParentMode?: boolean;
  onRetry?: (missionId: string) => void; // 재도전 핸들러
  onPartialApprove?: (missionId: string) => void; // 부분 승인 핸들러
  onClose?: (missionId: string) => void; // 하위 호환성 유지
}

const MissionCard: React.FC<MissionCardProps> = ({
  mission,
  onClick,
  isParentMode = false,
  onRetry,
  onPartialApprove,
  onClose,
}) => {
  const isExpired = mission.status === 'EXPIRED';
  const isCompleted = mission.status === 'DONE_APPROVED' || mission.status === 'PARTIAL';

  // ✅ 아이 화면: EXPIRED 미션은 클릭 불가
  // ✅ 부모 화면: EXPIRED 미션은 재도전/부분 승인 버튼으로 처리
  const isClickable = isParentMode
    ? mission.status === 'DONE_PENDING' // 부모는 DONE_PENDING만 클릭 가능
    : !isExpired && !isCompleted; // 아이는 EXPIRED, COMPLETED 제외

  if (isParentMode) {
    // ============================================
    // 부모 화면 렌더링
    // ============================================
    return (
      <div className="bg-white rounded-2xl p-4 mb-3 shadow-sm border-2 border-gray-200">
        {isExpired ? (
          // ✅ EXPIRED 미션: 재도전/부분 승인 버튼 제공
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-lg font-bold text-gray-800">{mission.title}</h3>
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                ⏰ 마감 지남
              </span>
            </div>
            
            {/* ✅ 통일된 문구 */}
            <div className="text-sm text-gray-600 mb-3">
              <p>시간이 지나 미션이 종료됐어요 ⏰</p>
            </div>

            {/* ✅ 재도전/부분 승인 버튼 (활성화) */}
            <div className="flex gap-2">
              {onRetry && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRetry(mission.id);
                  }}
                  className="flex-1 py-2.5 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors"
                >
                  재도전 요청 보내기
                </button>
              )}
              {(onPartialApprove || onClose) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onPartialApprove) {
                      onPartialApprove(mission.id);
                    } else if (onClose) {
                      onClose(mission.id);
                    }
                  }}
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
                >
                  부분 승인하기
                </button>
              )}
            </div>
          </div>
        ) : (
          // 일반 미션 UI
          <div>
            {/* ... 일반 미션 렌더링 ... */}
          </div>
        )}
      </div>
    );
  }

  // ============================================
  // 아이 화면 렌더링
  // ============================================
  return (
    <div
      onClick={isClickable ? onClick : undefined}
      className={`
        rounded-2xl p-4 mb-3 shadow-sm border-2
        ${isExpired ? 'bg-gray-50 border-gray-200' : 'bg-white'}
        ${isClickable ? 'cursor-pointer hover:shadow-md' : 'opacity-60 cursor-not-allowed'}
      `}
    >
      {isExpired ? (
        // ✅ EXPIRED 미션: 통일된 문구, 버튼 비활성화
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center">
              <span className="text-2xl">⏰</span>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-gray-800">{mission.title}</h3>
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                ⏰ 시간 초과
              </span>
            </div>
          </div>
          
          {/* ✅ 통일된 문구 */}
          <div className="text-sm text-gray-600 space-y-1">
            <p>시간이 지나 미션이 종료됐어요 ⏰</p>
            <p>다시 도전할 수 있어요!</p>
          </div>

          {/* ✅ 버튼 비활성화 (onClick이 undefined이므로 클릭 불가) */}
        </div>
      ) : (
        // 일반 미션 UI
        <div>
          {/* ... 일반 미션 렌더링 ... */}
        </div>
      )}
    </div>
  );
};

export default MissionCard;
```

**핵심 포인트:**
- `isExpired` 변수로 분기 처리
- 아이 화면: `onClick={undefined}`로 버튼 비활성화
- 부모 화면: 재도전/부분 승인 버튼은 활성화 유지
- 통일된 문구: **"시간이 지나 미션이 종료됐어요 ⏰"**

---

## ⚠️ 실수하기 쉬운 포인트

### 1. **Firestore Timestamp 변환 누락**
```typescript
// ❌ 잘못된 예시
const dueAt = mission.dueAt; // Firestore Timestamp 객체
if (now > dueAt) { ... } // 타입 에러 또는 잘못된 비교

// ✅ 올바른 예시
const dueAt = new Date(mission.dueAt); // ISO string을 Date로 변환
const dueAtTime = dueAt.getTime(); // 밀리초로 변환
if (nowTime > dueAtTime) { ... }
```

### 2. **currentTime state 업데이트 누락**
```typescript
// ❌ 잘못된 예시
const [currentTime, setCurrentTime] = useState<number>(Date.now());
// setInterval 없이 한 번만 초기화 → 리렌더링 안 됨

// ✅ 올바른 예시
useEffect(() => {
  const interval = setInterval(() => {
    setCurrentTime(Date.now()); // 주기적으로 업데이트
  }, 10000);
  return () => clearInterval(interval);
}, []);
```

### 3. **useMemo dependency 누락**
```typescript
// ❌ 잘못된 예시
const checkedMissions = useMemo(() => {
  return checkAndUpdateExpiredMissions(missions, new Date());
}, [missions]); // currentTime이 dependency에 없음 → 업데이트 안 됨

// ✅ 올바른 예시
const checkedMissions = useMemo(() => {
  const now = new Date(currentTime);
  return checkAndUpdateExpiredMissions(missions, now);
}, [missions, currentTime]); // currentTime도 dependency에 포함
```

### 4. **COMPLETED 상태를 EXPIRED로 변경**
```typescript
// ❌ 잘못된 예시
if (mission.status === 'ACTIVE' && now > dueAt) {
  return { ...mission, status: 'EXPIRED' };
}
// completedAt이 있는 경우도 EXPIRED로 변경됨 (버그!)

// ✅ 올바른 예시
if (mission.completedAt || mission.status === 'DONE_APPROVED') {
  return mission; // COMPLETED 상태는 변경하지 않음
}
if (mission.status === 'ACTIVE' && now > dueAt && !mission.completedAt) {
  return { ...mission, status: 'EXPIRED' };
}
```

### 5. **아이 화면에서 버튼 활성화**
```typescript
// ❌ 잘못된 예시
{isExpired && (
  <button onClick={onClick}>완료</button> // EXPIRED인데도 버튼 활성화
)}

// ✅ 올바른 예시
{isExpired ? (
  <div>시간이 지나 미션이 종료됐어요 ⏰</div>
) : (
  <button onClick={onClick}>완료</button>
)}
```

### 6. **부모 화면에서 버튼 비활성화**
```typescript
// ❌ 잘못된 예시
{isExpired && (
  <button disabled>재도전 요청 보내기</button> // EXPIRED인데 버튼 비활성화
)}

// ✅ 올바른 예시
{isExpired && onRetry && (
  <button onClick={() => onRetry(mission.id)}>
    재도전 요청 보내기
  </button>
)}
```

---

## 📝 체크리스트

- [x] `currentTime` state를 `useState`로 관리
- [x] `setInterval`로 주기적 업데이트 (10초 간격)
- [x] `useMemo`에 `currentTime`을 dependency로 포함
- [x] Firestore Timestamp는 `toMillis()` 또는 `new Date()`로 변환
- [x] COMPLETED 상태는 EXPIRED로 변경하지 않음
- [x] 아이 화면: EXPIRED 미션 버튼 비활성화
- [x] 부모 화면: EXPIRED 미션 재도전/부분 승인 버튼 활성화
- [x] 통일된 문구: **"시간이 지나 미션이 종료됐어요 ⏰"**

---

## 🎨 확장 가능한 설계

### 재도전 기능 추가
```typescript
interface MissionCardProps {
  onRetry?: (missionId: string) => void;
}

// 부모 화면에서만 사용
{isExpired && onRetry && (
  <button onClick={() => onRetry(mission.id)}>
    재도전 요청 보내기
  </button>
)}
```

### 부분 승인 기능 추가
```typescript
interface MissionCardProps {
  onPartialApprove?: (missionId: string) => void;
}

// 부모 화면에서만 사용
{isExpired && onPartialApprove && (
  <button onClick={() => onPartialApprove(mission.id)}>
    부분 승인하기
  </button>
)}
```

이렇게 설계하면 향후 기능 추가가 용이합니다.

