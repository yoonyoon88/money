# 미션 만료 상태 관리 시스템 설계

## 📋 개요

미션 마감 시간이 지나면 자동으로 "만료됨" 상태로 변경하고, 아이/부모 화면에서 각각 다른 UX를 제공하는 시스템입니다.

---

## 1️⃣ 상태 전환 로직 코드

### 상태 정의

```typescript
// src/types/index.ts

export type MissionStatus = 
  | 'IN_PROGRESS'      // 진행 중 (마감 전, 미완료)
  | 'COMPLETED'        // 완료됨 (부모 승인 완료)
  | 'EXPIRED'          // 만료됨 (마감 시간 지남)
  | 'PARTIAL_APPROVED' // 부분 승인 (일부 포인트 지급)
  | 'PENDING_REVIEW';  // 검토 중 (아이 제출, 부모 확인 대기)

export interface Mission {
  id: string;
  title: string;
  description: string;
  rewardPoint: number;
  dueAt: string; // ISO date string - 마감일/시간
  status: MissionStatus;
  missionType: 'DAILY' | 'WEEKLY';
  
  // 시간 관련 필드
  createdAt?: string; // ISO date string
  completedAt?: string | null; // ISO date string - 제출 시간
  approvedAt?: string; // ISO date string - 승인 시간
  expiredAt?: string | null; // ISO date string - 만료 시간
  
  // 부분 승인 관련
  partialPoint?: number; // 부분 승인 시 지급된 포인트
  
  // 재도전 관련
  retryCount?: number; // 재도전 횟수
  originalMissionId?: string; // 재도전으로 생성된 경우 원본 미션 ID
  
  // 기타 필드
  childId: string;
  parentId: string;
  memo?: string;
  parentMemo?: string;
  isDeleted?: boolean;
}
```

### 상태 전환 로직

```typescript
// src/firebase/missions.ts

import { Mission, MissionStatus } from '../types';

/**
 * 미션 상태를 자동으로 계산하고 업데이트
 * 
 * 상태 전환 규칙:
 * 1. COMPLETED, PARTIAL_APPROVED, PENDING_REVIEW는 만료되지 않음
 * 2. IN_PROGRESS 상태만 마감 시간 체크
 * 3. 마감 시간 지나면 EXPIRED로 변경
 * 
 * @param mission - 체크할 미션
 * @param currentTime - 현재 시간 (밀리초, 기본값: Date.now())
 * @returns 상태가 업데이트된 미션
 */
export const checkAndUpdateExpiredMission = (
  mission: Mission,
  currentTime: number = Date.now()
): Mission => {
  // 1. 완료된 미션은 상태 변경하지 않음
  if (
    mission.status === 'COMPLETED' ||
    mission.status === 'PARTIAL_APPROVED' ||
    mission.completedAt !== null &&
    mission.completedAt !== undefined
  ) {
    return mission;
  }

  // 2. 검토 중인 미션은 만료되지 않음 (부모 확인 대기 중)
  if (mission.status === 'PENDING_REVIEW') {
    return mission;
  }

  // 3. 이미 만료된 미션은 그대로 유지
  if (mission.status === 'EXPIRED') {
    return mission;
  }

  // 4. 진행 중인 미션만 마감 시간 체크
  if (mission.status !== 'IN_PROGRESS') {
    return mission;
  }

  // 5. 마감 시간 비교
  try {
    const dueAtTime = new Date(mission.dueAt).getTime();
    
    // 유효하지 않은 날짜인 경우
    if (isNaN(dueAtTime)) {
      console.warn('[checkAndUpdateExpiredMission] 유효하지 않은 dueAt:', mission.dueAt);
      return mission;
    }

    // 마감 시간이 지났는지 확인
    if (currentTime > dueAtTime) {
      // 만료 처리
      return {
        ...mission,
        status: 'EXPIRED' as MissionStatus,
        expiredAt: mission.expiredAt || new Date(currentTime).toISOString(),
      };
    }
  } catch (error) {
    console.error('[checkAndUpdateExpiredMission] 날짜 파싱 에러:', error);
    return mission;
  }

  return mission;
};

/**
 * 미션 배열에 대해 만료 체크 적용
 */
export const checkAndUpdateExpiredMissions = (
  missions: Mission[],
  currentTime: number = Date.now()
): Mission[] => {
  return missions.map((mission) => checkAndUpdateExpiredMission(mission, currentTime));
};
```

### 자동 상태 전환 트리거

```typescript
// src/components/ChildHome.tsx 또는 Home.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { checkAndUpdateExpiredMissions } from '../firebase/missions';
import { Mission } from '../types';

const MissionList: React.FC = () => {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  const [lastDate, setLastDate] = useState<string>(''); // 날짜 변경 감지용

  // 1. 현재 시간을 1초마다 업데이트
  useEffect(() => {
    setCurrentTime(Date.now());
    
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // 2. 날짜 변경 감지 (자정 지나면 자동 체크)
  useEffect(() => {
    const today = new Date().toDateString();
    
    if (lastDate !== today) {
      console.log('[MissionList] 날짜 변경 감지:', { 이전날짜: lastDate, 새날짜: today });
      setLastDate(today);
      setCurrentTime(Date.now()); // 강제 업데이트
    }
  }, [lastDate]);

  // 3. 화면 진입 시 / 새로고침 시 / 날짜 변경 시 자동 체크
  const checkedMissions = useMemo(() => {
    return checkAndUpdateExpiredMissions(missions, currentTime);
  }, [missions, currentTime]);

  return (
    // ... 렌더링
  );
};
```

---

## 2️⃣ UI 분기 조건

### 아이 화면 (ChildHome)

```typescript
// src/components/MissionCard.tsx (아이 모드)

const MissionCard: React.FC<MissionCardProps> = ({ mission, onClick, isParentMode = false, onRetryRequest }) => {
  const isExpired = mission.status === 'EXPIRED';
  const isCompleted = mission.status === 'COMPLETED' || mission.status === 'PARTIAL_APPROVED';
  const isPending = mission.status === 'PENDING_REVIEW';
  const isInProgress = mission.status === 'IN_PROGRESS';

  // 아이 화면 렌더링
  if (!isParentMode) {
    return (
      <div
        className={`
          rounded-2xl p-4 mb-3 shadow-sm border-2
          ${isExpired ? 'bg-gray-50 border-gray-200 opacity-60' : 'bg-white'}
          ${isExpired ? 'cursor-not-allowed' : 'cursor-pointer hover:shadow-md'}
        `}
      >
        {isExpired ? (
          // ✅ 만료된 미션 UI
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center">
                <span className="text-2xl">⏰</span>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-800">{mission.title}</h3>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                  기한 만료
                </span>
              </div>
            </div>
            
            {/* 만료 메시지 */}
            <div className="text-sm text-gray-600 space-y-1">
              <p>시간이 지나서 도전이 종료됐어요 ⏰</p>
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
        ) : isCompleted ? (
          // 완료된 미션 UI
          <div>✅ 미션 완료!</div>
        ) : isPending ? (
          // 검토 중 미션 UI
          <div>⏳ 부모님이 확인 중이에요</div>
        ) : (
          // 진행 중 미션 UI
          <div>
            <h3>{mission.title}</h3>
            <button onClick={onClick} className="w-full py-2.5 bg-blue-500 text-white rounded-xl">
              완료하기
            </button>
          </div>
        )}
      </div>
    );
  }

  // 부모 화면 렌더링 (아래 참조)
  // ...
};
```

### 부모 화면 (Home)

```typescript
// src/components/MissionCard.tsx (부모 모드)

const MissionCard: React.FC<MissionCardProps> = ({ 
  mission, 
  isParentMode = true,
  onRetry,
  onFail,
  onPartialApprove
}) => {
  const isExpired = mission.status === 'EXPIRED';

  // 부모 화면 렌더링
  if (isParentMode) {
    return (
      <div className="bg-white rounded-2xl p-4 mb-3 shadow-sm border-2 border-gray-200">
        {isExpired ? (
          // ✅ 만료된 미션 UI (부모)
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-lg font-bold text-gray-800">{mission.title}</h3>
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                기한 만료
              </span>
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
          <div>
            {/* ... 일반 미션 렌더링 ... */}
          </div>
        )}
      </div>
    );
  }
};
```

### 상태별 UI 분기 요약

| 상태 | 아이 화면 | 부모 화면 |
|------|----------|----------|
| **IN_PROGRESS** | 완료 버튼 활성화 | 진행 중 표시 |
| **PENDING_REVIEW** | "부모님 확인 중" 메시지 | 승인/반려 버튼 |
| **COMPLETED** | "완료!" 메시지 | 완료 표시 |
| **EXPIRED** | 완료 버튼 비활성화<br>"도전이 종료됐어요"<br>"다시 도전 요청" 버튼 | "기한 만료" 배지<br>재도전/부분승인/실패처리 버튼 |
| **PARTIAL_APPROVED** | "부분 완료" 메시지 | 부분 승인 표시 |

---

## 3️⃣ Firestore 필드 구조

### Firestore 문서 구조

```typescript
// Firestore missions/{missionId}

{
  // ===== 기본 필드 =====
  id: string;                    // 문서 ID
  title: string;                 // 미션 제목
  description: string;           // 미션 설명
  rewardPoint: number;           // 보상 포인트
  missionType: 'DAILY' | 'WEEKLY'; // 미션 타입
  
  // ===== 상태 필드 =====
  status: 'IN_PROGRESS' | 'COMPLETED' | 'EXPIRED' | 'PARTIAL_APPROVED' | 'PENDING_REVIEW';
  
  // ===== 시간 필드 (Timestamp) =====
  dueAt: Timestamp;             // 마감일/시간 (필수)
  createdAt: Timestamp;         // 생성 시간
  completedAt: Timestamp | null; // 제출 시간 (null 가능)
  approvedAt: Timestamp | null; // 승인 시간 (null 가능)
  expiredAt: Timestamp | null;  // 만료 시간 (null 가능)
  
  // ===== 관계 필드 =====
  childId: string;              // 수행할 아이 ID
  parentId: string;             // 생성한 부모 ID
  
  // ===== 부분 승인 관련 =====
  partialPoint?: number;        // 부분 승인 시 지급된 포인트
  
  // ===== 재도전 관련 =====
  retryCount?: number;          // 재도전 횟수 (기본값: 0)
  originalMissionId?: string;   // 재도전으로 생성된 경우 원본 미션 ID
  
  // ===== 메모 필드 =====
  memo?: string;                // 아이 메모
  parentMemo?: string;          // 부모 메모
  
  // ===== 삭제 필드 =====
  isDeleted: boolean;           // 논리 삭제 여부 (기본값: false)
  deletedAt?: Timestamp;       // 삭제 시간
}
```

### 상태별 Firestore 값 예시

#### 1. 진행 중 (IN_PROGRESS)
```json
{
  "id": "mission_001",
  "title": "숙제하기",
  "status": "IN_PROGRESS",
  "dueAt": "2024-01-15T13:00:00Z",
  "completedAt": null,
  "expiredAt": null,
  "retryCount": 0
}
```

#### 2. 만료됨 (EXPIRED)
```json
{
  "id": "mission_001",
  "title": "숙제하기",
  "status": "EXPIRED",
  "dueAt": "2024-01-15T13:00:00Z",
  "completedAt": null,
  "expiredAt": "2024-01-15T14:00:00Z", // 만료 시간 기록
  "retryCount": 0
}
```

#### 3. 부분 승인 (PARTIAL_APPROVED)
```json
{
  "id": "mission_001",
  "title": "숙제하기",
  "status": "PARTIAL_APPROVED",
  "dueAt": "2024-01-15T13:00:00Z",
  "completedAt": "2024-01-15T12:00:00Z",
  "approvedAt": "2024-01-15T14:30:00Z",
  "partialPoint": 150, // 전체 300P 중 150P 지급
  "rewardPoint": 300
}
```

#### 4. 완료됨 (COMPLETED)
```json
{
  "id": "mission_001",
  "title": "숙제하기",
  "status": "COMPLETED",
  "dueAt": "2024-01-15T13:00:00Z",
  "completedAt": "2024-01-15T12:00:00Z",
  "approvedAt": "2024-01-15T12:30:00Z",
  "rewardPoint": 300
}
```

---

## 4️⃣ 상태 전환 시나리오

### 시나리오 1: 마감 시간 지남 (자동 전환)

```
IN_PROGRESS (마감 전)
  ↓ (마감 시간 지남, 자동 체크)
EXPIRED (만료됨)
```

**트리거:**
- 화면 진입 시
- 앱 새로고침 시
- 날짜 변경 시 (자정 지남)
- 1초마다 자동 체크

### 시나리오 2: 재도전 허용

```
EXPIRED (만료됨)
  ↓ (부모가 재도전 허용)
새 미션 생성 (IN_PROGRESS)
  - originalMissionId: 원본 미션 ID
  - retryCount: 원본 retryCount + 1
```

### 시나리오 3: 부분 승인

```
EXPIRED (만료됨)
  ↓ (부모가 부분 승인)
PARTIAL_APPROVED (부분 승인)
  - partialPoint: 지급된 포인트
```

### 시나리오 4: 실패 처리

```
EXPIRED (만료됨)
  ↓ (부모가 실패 처리)
EXPIRED (그대로 유지, resultStatus: 'failed')
```

---

## 5️⃣ 구현 체크리스트

- [x] 상태 타입 정의 (IN_PROGRESS, COMPLETED, EXPIRED, PARTIAL_APPROVED, PENDING_REVIEW)
- [x] 상태 전환 로직 (`checkAndUpdateExpiredMission`)
- [x] 자동 상태 전환 트리거 (화면 진입, 새로고침, 날짜 변경)
- [x] 아이 화면 UI 분기 (만료 시 완료 버튼 비활성화, 다시 도전 요청 버튼)
- [x] 부모 화면 UI 분기 (재도전/부분승인/실패처리 버튼)
- [x] Firestore 필드 구조 정의
- [ ] 재도전 허용 함수 구현
- [ ] 부분 승인 함수 구현
- [ ] 실패 처리 함수 구현

---

이 설계를 기반으로 실제 코드를 구현하면 됩니다!

