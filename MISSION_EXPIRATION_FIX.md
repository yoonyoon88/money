# 미션 만료 상태 자동 업데이트 해결 가이드

## 1️⃣ 왜 현재 코드가 안 바뀌는지 원인 설명

### 문제점 분석

**현재 구현된 코드의 문제:**
1. **10초 간격이 너무 김**: `setInterval`이 10초(10000ms)마다 실행되어 마감 시간이 지나도 최대 10초 지연됨
2. **초기 마운트 시 체크 누락**: 컴포넌트가 마운트될 때 즉시 체크하지 않고 첫 업데이트를 기다림
3. **Firestore Timestamp 변환 문제**: Firestore에서 가져온 `dueAt`이 Timestamp 객체일 경우 제대로 변환되지 않을 수 있음
4. **formatDueDate에서 new Date() 사용**: `formatDueDate` 함수가 컴포넌트 내부에서 `new Date()`를 직접 호출하여 `currentTime` state를 사용하지 않음

**핵심 원인:**
- `currentTime` state가 업데이트되어도 실제로 UI에 반영되는 미션이 `checkedMissions`를 사용하지 않을 수 있음
- 10초 간격으로는 "오늘 13시까지"가 지났을 때 즉시 반영되지 않음

---

## 2️⃣ useEffect + setInterval 예제 코드

### ✅ 올바른 구현 (1초 간격 + 즉시 체크)

```typescript
import React, { useState, useEffect, useMemo } from 'react';
import { Mission } from '../types';
import { checkAndUpdateExpiredMissions } from '../firebase/missions';

const MissionList: React.FC = () => {
  const [missions, setMissions] = useState<Mission[]>([]);
  
  // ✅ 현재 시간을 state로 관리 (밀리초 단위)
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  // ✅ 컴포넌트 마운트 시 즉시 체크 + 1초마다 업데이트
  useEffect(() => {
    // 즉시 한 번 실행 (마운트 시)
    setCurrentTime(Date.now());
    
    // 1초마다 업데이트 (더 빠른 반응성)
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000); // 1초 = 1000ms

    return () => clearInterval(interval);
  }, []);

  // ✅ 마감 체크: missions 또는 currentTime이 변경될 때마다 재계산
  const checkedMissions = useMemo(() => {
    const now = new Date(currentTime);
    return checkAndUpdateExpiredMissions(missions, now);
  }, [missions, currentTime]);

  // ✅ 반드시 checkedMissions를 사용하여 렌더링
  return (
    <div>
      {checkedMissions.map((mission) => (
        <MissionCard key={mission.id} mission={mission} />
      ))}
    </div>
  );
};
```

**핵심 포인트:**
- `useState<number>(Date.now())`: 밀리초 단위로 저장
- `setInterval(..., 1000)`: 1초마다 업데이트 (즉시 반영)
- `useMemo` dependency에 `currentTime` 포함 필수
- 렌더링 시 반드시 `checkedMissions` 사용

---

## 3️⃣ Firestore Timestamp 비교 예제

### ✅ Firestore Timestamp를 Date.now()와 정확히 비교

```typescript
import { Timestamp } from 'firebase/firestore';
import { Mission } from '../types';

/**
 * Firestore Timestamp와 현재 시간을 비교하는 함수
 */
export const compareFirestoreTimestamp = (
  firestoreTimestamp: Timestamp | string | Date,
  currentTime: number = Date.now()
): number => {
  let timestampMs: number;

  // Firestore Timestamp 객체인 경우
  if (firestoreTimestamp && typeof firestoreTimestamp === 'object' && 'toMillis' in firestoreTimestamp) {
    timestampMs = (firestoreTimestamp as Timestamp).toMillis();
  }
  // ISO string인 경우
  else if (typeof firestoreTimestamp === 'string') {
    timestampMs = new Date(firestoreTimestamp).getTime();
  }
  // Date 객체인 경우
  else if (firestoreTimestamp instanceof Date) {
    timestampMs = firestoreTimestamp.getTime();
  }
  // 이미 number인 경우 (밀리초)
  else {
    timestampMs = firestoreTimestamp as number;
  }

  // 현재 시간과 비교 (양수면 미래, 음수면 과거)
  return timestampMs - currentTime;
};

/**
 * 미션이 만료되었는지 확인
 */
export const isMissionExpired = (
  mission: Mission,
  currentTime: number = Date.now()
): boolean => {
  // 완료된 미션은 만료되지 않음
  if (mission.completedAt || mission.status === 'DONE_APPROVED' || mission.status === 'PARTIAL') {
    return false;
  }

  // DONE_PENDING 상태는 만료되지 않음 (부모 확인 대기 중)
  if (mission.status === 'DONE_PENDING') {
    return false;
  }

  // ACTIVE 상태만 체크
  if (mission.status !== 'ACTIVE') {
    return false;
  }

  // dueAt과 현재 시간 비교
  const dueAtTime = new Date(mission.dueAt).getTime();
  return currentTime > dueAtTime;
};

// 사용 예시
const mission: Mission = {
  id: '1',
  title: '숙제하기',
  dueAt: '2024-01-15T13:00:00.000Z', // ISO string
  status: 'ACTIVE',
  // ... 기타 필드
};

const now = Date.now();
const isExpired = isMissionExpired(mission, now);
console.log('만료 여부:', isExpired);
```

**핵심 포인트:**
- Firestore Timestamp는 `.toMillis()` 사용
- ISO string은 `new Date().getTime()` 사용
- 모든 시간을 밀리초로 통일하여 비교

---

## 4️⃣ getMissionStatus 함수 코드

### ✅ 미션 상태를 계산하는 함수

```typescript
import { Mission, MissionStatus } from '../types';

/**
 * 현재 시간 기준으로 미션 상태를 계산
 * 
 * @param mission - 미션 객체
 * @param currentTime - 현재 시간 (밀리초, 기본값: Date.now())
 * @returns 계산된 미션 상태
 */
export const getMissionStatus = (
  mission: Mission,
  currentTime: number = Date.now()
): MissionStatus => {
  // 1. COMPLETED 상태: 완료된 미션
  if (
    mission.status === 'DONE_APPROVED' ||
    mission.status === 'PARTIAL' ||
    mission.completedAt !== null &&
    mission.completedAt !== undefined
  ) {
    return mission.status; // DONE_APPROVED 또는 PARTIAL 유지
  }

  // 2. DONE_PENDING 상태: 부모 확인 대기 중 (만료되지 않음)
  if (mission.status === 'DONE_PENDING') {
    return 'DONE_PENDING';
  }

  // 3. EXPIRED 상태: 이미 만료된 미션
  if (mission.status === 'EXPIRED') {
    return 'EXPIRED';
  }

  // 4. ACTIVE 상태: 마감 시간 체크 필요
  if (mission.status === 'ACTIVE') {
    const dueAtTime = new Date(mission.dueAt).getTime();
    
    // 마감 시간이 지났으면 EXPIRED
    if (currentTime > dueAtTime) {
      return 'EXPIRED';
    }
    
    // 아직 마감 전이면 ACTIVE 유지
    return 'ACTIVE';
  }

  // 기본값: ACTIVE
  return 'ACTIVE';
};

/**
 * 미션 배열의 상태를 일괄 계산
 */
export const updateMissionStatuses = (
  missions: Mission[],
  currentTime: number = Date.now()
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
      };
    }
    
    return mission;
  });
};

// 사용 예시
const missions: Mission[] = [
  {
    id: '1',
    title: '숙제하기',
    dueAt: '2024-01-15T13:00:00.000Z',
    status: 'ACTIVE',
    // ... 기타 필드
  },
];

const now = Date.now();
const updatedMissions = updateMissionStatuses(missions, now);
```

**핵심 포인트:**
- COMPLETED 상태는 절대 변경하지 않음
- DONE_PENDING 상태는 만료되지 않음
- ACTIVE 상태만 마감 시간 체크
- 상태 변경 시에만 새 객체 생성 (성능 최적화)

---

## 5️⃣ React JSX에서 상태 분기 예제

### ✅ MissionCard 컴포넌트에서 상태별 렌더링

```typescript
import React from 'react';
import { Mission, MissionStatus } from '../types';
import { getMissionStatus } from '../utils/missionStatus';

interface MissionCardProps {
  mission: Mission;
  currentTime: number; // 현재 시간을 prop으로 받음
  onClick?: () => void;
}

const MissionCard: React.FC<MissionCardProps> = ({ 
  mission, 
  currentTime,
  onClick 
}) => {
  // ✅ 현재 시간 기준으로 상태 계산
  const status = getMissionStatus(mission, currentTime);
  const isExpired = status === 'EXPIRED';
  const isCompleted = status === 'DONE_APPROVED' || status === 'PARTIAL';
  const isPending = status === 'DONE_PENDING';
  const isActive = status === 'ACTIVE';

  // ✅ 상태별 스타일
  const getCardStyle = () => {
    if (isExpired) {
      return 'bg-gray-50 border-gray-200 opacity-60';
    }
    if (isCompleted) {
      return 'bg-green-50 border-green-200';
    }
    if (isPending) {
      return 'bg-orange-50 border-orange-200';
    }
    return 'bg-white border-blue-200';
  };

  // ✅ 상태별 배지
  const getStatusBadge = () => {
    switch (status) {
      case 'EXPIRED':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
            ⏰ 만료됨
          </span>
        );
      case 'DONE_APPROVED':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
            ✅ 완료
          </span>
        );
      case 'DONE_PENDING':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
            ⏳ 검토 중
          </span>
        );
      case 'PARTIAL':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
            ✨ 부분 완료
          </span>
        );
      default:
        return (
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
            진행 중
          </span>
        );
    }
  };

  return (
    <div
      onClick={isExpired ? undefined : onClick}
      className={`
        rounded-2xl p-4 mb-3 shadow-sm border-2 transition-all
        ${getCardStyle()}
        ${isExpired ? 'cursor-not-allowed' : 'cursor-pointer hover:shadow-md'}
      `}
    >
      {/* 제목과 상태 배지 */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-bold text-gray-800">{mission.title}</h3>
        {getStatusBadge()}
      </div>

      {/* 상태별 메시지 */}
      {isExpired && (
        <div className="text-sm text-gray-600 space-y-1 mb-3">
          <p>⏰ 시간이 지나 미션이 종료됐어요</p>
          <p>다시 도전할 수 있어요!</p>
        </div>
      )}

      {isCompleted && (
        <div className="text-sm text-green-600 mb-2">
          <p>✅ 미션을 완료했어요! 잘했어요 🎉</p>
        </div>
      )}

      {isPending && (
        <div className="text-sm text-orange-600 mb-2">
          <p>⏳ 부모님이 확인 중이에요</p>
        </div>
      )}

      {isActive && (
        <div className="text-sm text-gray-600 mb-2">
          <p>마감: {new Date(mission.dueAt).toLocaleString('ko-KR')}</p>
        </div>
      )}

      {/* 포인트 표시 */}
      <div className="flex items-center justify-between mt-3">
        <span className="text-sm text-gray-500">보상</span>
        <span className="text-lg font-bold text-orange-500">
          +{mission.rewardPoint}P
        </span>
      </div>

      {/* 버튼 (EXPIRED일 때 비활성화) */}
      {!isExpired && (
        <button
          onClick={onClick}
          className="w-full mt-3 py-2 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition-colors"
        >
          {isActive ? '완료하기' : '상세보기'}
        </button>
      )}
    </div>
  );
};

export default MissionCard;
```

### ✅ 사용 예시 (부모 컴포넌트)

```typescript
import React, { useState, useEffect, useMemo } from 'react';
import MissionCard from './MissionCard';
import { Mission } from '../types';
import { updateMissionStatuses } from '../utils/missionStatus';

const Home: React.FC = () => {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  // ✅ 1초마다 현재 시간 업데이트
  useEffect(() => {
    setCurrentTime(Date.now());
    
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // ✅ 현재 시간 기준으로 미션 상태 업데이트
  const checkedMissions = useMemo(() => {
    return updateMissionStatuses(missions, currentTime);
  }, [missions, currentTime]);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">미션 목록</h1>
      
      {/* ✅ 반드시 checkedMissions 사용 */}
      {checkedMissions.map((mission) => (
        <MissionCard
          key={mission.id}
          mission={mission}
          currentTime={currentTime} // 현재 시간 전달
          onClick={() => console.log('미션 클릭:', mission.id)}
        />
      ))}
    </div>
  );
};

export default Home;
```

**핵심 포인트:**
- `currentTime`을 prop으로 전달하여 실시간 상태 계산
- `isExpired`, `isCompleted` 등 boolean 변수로 분기 처리
- 상태별 스타일과 메시지 분기
- EXPIRED일 때 버튼 비활성화

---

## 🎯 최종 체크리스트

- [x] `currentTime` state를 `useState<number>(Date.now())`로 관리
- [x] `useEffect`에서 즉시 체크 + `setInterval(1000)` 설정
- [x] `useMemo`에 `currentTime`을 dependency로 포함
- [x] Firestore Timestamp는 `.toMillis()` 또는 `new Date().getTime()` 사용
- [x] `getMissionStatus` 함수로 상태 계산
- [x] 렌더링 시 반드시 `checkedMissions` 사용
- [x] EXPIRED 상태일 때 버튼 비활성화

---

## 🚀 즉시 적용 가능한 수정 코드

### `src/utils/missionStatus.ts` (새 파일 생성)

```typescript
import { Mission, MissionStatus } from '../types';

export const getMissionStatus = (
  mission: Mission,
  currentTime: number = Date.now()
): MissionStatus => {
  if (mission.completedAt || mission.status === 'DONE_APPROVED' || mission.status === 'PARTIAL') {
    return mission.status;
  }
  if (mission.status === 'DONE_PENDING') {
    return 'DONE_PENDING';
  }
  if (mission.status === 'EXPIRED') {
    return 'EXPIRED';
  }
  if (mission.status === 'ACTIVE') {
    const dueAtTime = new Date(mission.dueAt).getTime();
    return currentTime > dueAtTime ? 'EXPIRED' : 'ACTIVE';
  }
  return 'ACTIVE';
};

export const updateMissionStatuses = (
  missions: Mission[],
  currentTime: number = Date.now()
): Mission[] => {
  return missions.map((mission) => {
    const newStatus = getMissionStatus(mission, currentTime);
    if (newStatus !== mission.status) {
      return {
        ...mission,
        status: newStatus,
        expiredAt: newStatus === 'EXPIRED' && !mission.expiredAt
          ? new Date(currentTime).toISOString()
          : mission.expiredAt,
      };
    }
    return mission;
  });
};
```

### `src/components/Home.tsx` 수정

```typescript
// 기존 코드에서 이 부분만 수정:
useEffect(() => {
  setCurrentTime(Date.now()); // 즉시 실행 추가
  
  const interval = setInterval(() => {
    setCurrentTime(Date.now());
  }, 1000); // 10000 → 1000으로 변경 (1초)
  
  return () => clearInterval(interval);
}, []);
```

이제 마감 시간이 지나면 **1초 이내**에 자동으로 EXPIRED 상태로 변경됩니다!

