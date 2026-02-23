# 시간 비교 가이드 및 디버그 코드

## 1️⃣ 현재 기준 시간이 무엇인지 설명

### 클라이언트 시간 vs 서버 시간

**현재 구현:**
- ✅ **클라이언트 시간 사용**: `Date.now()` 또는 `new Date()`
- ❌ **서버 시간 미사용**: Firestore `serverTimestamp()`는 문서 저장 시에만 사용

**왜 클라이언트 시간을 사용하는가?**
1. 실시간 UI 업데이트를 위해 `setInterval`로 주기적 체크 필요
2. 서버 시간을 매번 가져오려면 Cloud Function 호출 필요 (비용/지연)
3. 마감 시간 비교는 클라이언트 시간으로도 충분히 정확함 (초 단위 정확도)

**주의사항:**
- 사용자가 시스템 시간을 조작하면 문제 발생 가능
- 프로덕션에서는 서버 시간 검증 권장 (Cloud Function)

---

## 2️⃣ React에서 현재 시간을 실시간으로 찍는 코드

### ✅ 현재 구현 (ChildHome.tsx)

```typescript
import React, { useState, useEffect } from 'react';

const ChildHome: React.FC = () => {
  // 현재 시간을 state로 관리 (밀리초)
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  // 1초마다 현재 시간 업데이트
  useEffect(() => {
    // 즉시 한 번 실행 (마운트 시)
    const initialTime = Date.now();
    setCurrentTime(initialTime);
    console.log('[ChildHome] 초기 시간 설정:', new Date(initialTime).toLocaleString('ko-KR'));
    
    // 1초마다 업데이트
    const interval = setInterval(() => {
      const newTime = Date.now();
      setCurrentTime(newTime);
      // 매 10초마다만 로그 출력 (너무 많은 로그 방지)
      if (newTime % 10000 < 1000) {
        console.log('[ChildHome] 현재 시간 업데이트:', new Date(newTime).toLocaleString('ko-KR'));
      }
    }, 1000); // 1초마다

    return () => clearInterval(interval);
  }, []);

  // currentTime이 변경될 때마다 마감 체크
  const checkedMissions = useMemo(() => {
    const now = new Date(currentTime);
    return checkAndUpdateExpiredMissions(allMissions, now);
  }, [allMissions, currentTime]);

  return (
    // ... 렌더링
  );
};
```

**핵심 포인트:**
- `Date.now()`: 밀리초 단위 숫자 반환 (1970-01-01부터 경과 시간)
- `new Date(currentTime)`: Date 객체로 변환
- `setInterval(1000)`: 1초마다 업데이트

---

## 3️⃣ Firestore Timestamp → Date 변환 코드

### ✅ 변환 예제

```typescript
import { Timestamp } from 'firebase/firestore';

// Firestore 문서에서 가져온 데이터 예시
const firestoreDoc = {
  dueAt: Timestamp.fromDate(new Date('2024-01-15T13:00:00Z')), // Firestore Timestamp
  // 또는
  dueAt: '2024-01-15T13:00:00.000Z', // ISO string (이미 변환된 경우)
};

// 방법 1: Firestore Timestamp 객체인 경우
let dueAtDate: Date;
if (firestoreDoc.dueAt instanceof Timestamp) {
  // Timestamp → Date 변환
  dueAtDate = firestoreDoc.dueAt.toDate();
  console.log('Firestore Timestamp 변환:', {
    timestamp: firestoreDoc.dueAt,
    milliseconds: firestoreDoc.dueAt.toMillis(),
    date: dueAtDate,
    iso: dueAtDate.toISOString(),
    local: dueAtDate.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
  });
} else if (typeof firestoreDoc.dueAt === 'string') {
  // ISO string인 경우
  dueAtDate = new Date(firestoreDoc.dueAt);
  console.log('ISO string 변환:', {
    iso: firestoreDoc.dueAt,
    date: dueAtDate,
    milliseconds: dueAtDate.getTime(),
    local: dueAtDate.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
  });
} else {
  console.error('알 수 없는 dueAt 타입:', typeof firestoreDoc.dueAt);
}

// 실제 사용 예시 (src/firebase/missions.ts의 toISOString 함수)
const toISOString = (
  value: Timestamp | string | number | undefined | null
): string | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }

  try {
    // 1. Firestore Timestamp 객체인 경우
    if (value instanceof Timestamp) {
      return value.toDate().toISOString();
    }

    // 2. 이미 ISO string인 경우
    if (typeof value === 'string') {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
      return undefined;
    }

    // 3. Unix timestamp (milliseconds)인 경우
    if (typeof value === 'number') {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
      return undefined;
    }

    return undefined;
  } catch (error) {
    console.error('[toISOString] 날짜 변환 에러:', error);
    return undefined;
  }
};
```

**핵심 포인트:**
- `Timestamp.toDate()`: Timestamp → Date 객체
- `Timestamp.toMillis()`: Timestamp → 밀리초 숫자
- `new Date(isoString)`: ISO string → Date 객체
- `date.getTime()`: Date → 밀리초 숫자

---

## 4️⃣ 마감 시간(Date) 생성 예제

### ✅ "오늘 13시까지" Date 값 계산

```typescript
/**
 * "오늘 13시까지" Date 객체 생성
 */
const createTodayDueTime = (hour: number, minute: number = 0): Date => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  today.setHours(hour, minute, 0, 0); // 13시 0분 0초 0밀리초
  
  console.log('[createTodayDueTime] 오늘 13시까지 Date 생성:', {
    hour,
    minute,
    생성된Date: today,
    ISO: today.toISOString(),
    로컬: today.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
    밀리초: today.getTime(),
    현재시간: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
    현재시간밀리초: Date.now(),
    비교: Date.now() > today.getTime() ? '지남' : '남음',
  });
  
  return today;
};

// 사용 예시
const dueAt = createTodayDueTime(13, 0); // 오늘 13시 0분
const dueAtISO = dueAt.toISOString(); // Firestore에 저장할 ISO string

// 콘솔 출력 예시:
// [createTodayDueTime] 오늘 13시까지 Date 생성: {
//   hour: 13,
//   minute: 0,
//   생성된Date: 2024-01-15T04:00:00.000Z, // UTC (한국 시간 13시 = UTC 4시)
//   ISO: '2024-01-15T04:00:00.000Z',
//   로컬: '2024. 1. 15. 오후 1:00:00',
//   밀리초: 1705298400000,
//   현재시간: '2024. 1. 15. 오후 2:30:00',
//   현재시간밀리초: 1705303800000,
//   비교: '지남'
// }
```

### ✅ "내일 13시까지" Date 값 계산

```typescript
const createTomorrowDueTime = (hour: number, minute: number = 0): Date => {
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  tomorrow.setDate(tomorrow.getDate() + 1); // 내일
  tomorrow.setHours(hour, minute, 0, 0);
  
  return tomorrow;
};
```

### ✅ 특정 날짜 + 시간 Date 값 계산

```typescript
const createDueTime = (year: number, month: number, day: number, hour: number, minute: number = 0): Date => {
  const dueDate = new Date(year, month - 1, day, hour, minute, 0, 0); // month는 0부터 시작
  
  console.log('[createDueTime] 특정 날짜+시간 Date 생성:', {
    입력: { year, month, day, hour, minute },
    생성된Date: dueDate,
    ISO: dueDate.toISOString(),
    로컬: dueDate.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
    밀리초: dueDate.getTime(),
  });
  
  return dueDate;
};

// 사용 예시
const dueAt = createDueTime(2024, 1, 15, 13, 0); // 2024년 1월 15일 13시 0분
```

---

## 5️⃣ 비교 로직 코드 + console.log 예시

### ✅ 올바른 비교: 날짜 + 시간 비교

```typescript
/**
 * 올바른 비교: 날짜 + 시간까지 비교
 */
const compareMissionDueTime = (mission: Mission, currentTime: number = Date.now()): boolean => {
  // 1. 현재 시간 (밀리초)
  const nowTime = currentTime;
  const nowDate = new Date(nowTime);
  
  // 2. 마감 시간 (밀리초)
  const dueAtDate = new Date(mission.dueAt);
  const dueAtTime = dueAtDate.getTime();
  
  // 3. 비교 (밀리초 단위로 정확히 비교)
  const isExpired = nowTime > dueAtTime;
  const diff = nowTime - dueAtTime;
  
  // 4. 상세 로그
  console.log(`[compareMissionDueTime] 미션: ${mission.title}`, {
    // 현재 시간 정보
    현재시간_Date_now: Date.now(),
    현재시간_밀리초: nowTime,
    현재시간_Date객체: nowDate,
    현재시간_ISO: nowDate.toISOString(),
    현재시간_로컬: nowDate.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
    현재시간_년월일시분초: {
      년: nowDate.getFullYear(),
      월: nowDate.getMonth() + 1,
      일: nowDate.getDate(),
      시: nowDate.getHours(),
      분: nowDate.getMinutes(),
      초: nowDate.getSeconds(),
    },
    
    // 마감 시간 정보
    마감시간_dueAt원본: mission.dueAt,
    마감시간_밀리초: dueAtTime,
    마감시간_Date객체: dueAtDate,
    마감시간_ISO: dueAtDate.toISOString(),
    마감시간_로컬: dueAtDate.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
    마감시간_년월일시분초: {
      년: dueAtDate.getFullYear(),
      월: dueAtDate.getMonth() + 1,
      일: dueAtDate.getDate(),
      시: dueAtDate.getHours(),
      분: dueAtDate.getMinutes(),
      초: dueAtDate.getSeconds(),
    },
    
    // 비교 결과
    비교결과_만료여부: isExpired,
    비교결과_차이밀리초: diff,
    비교결과_차이시간: formatDiff(diff),
    비교코드: `${nowTime} > ${dueAtTime} = ${isExpired}`,
  });
  
  return isExpired;
};

const formatDiff = (diffMs: number): string => {
  const absDiff = Math.abs(diffMs);
  const seconds = Math.floor(absDiff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}일 ${hours % 24}시간 ${minutes % 60}분`;
  } else if (hours > 0) {
    return `${hours}시간 ${minutes % 60}분 ${seconds % 60}초`;
  } else if (minutes > 0) {
    return `${minutes}분 ${seconds % 60}초`;
  } else {
    return `${seconds}초`;
  }
};

// 사용 예시
const mission: Mission = {
  id: '1',
  title: '숙제하기',
  dueAt: '2024-01-15T04:00:00.000Z', // 오늘 13시 (UTC 4시)
  status: 'ACTIVE',
  // ... 기타 필드
};

const isExpired = compareMissionDueTime(mission, Date.now());
console.log('만료 여부:', isExpired);
```

### ❌ 잘못된 비교: 날짜만 비교

```typescript
/**
 * ❌ 잘못된 비교: 날짜만 비교 (시간 무시)
 */
const compareMissionDueDate_WRONG = (mission: Mission): boolean => {
  const now = new Date();
  const dueAt = new Date(mission.dueAt);
  
  // ❌ 날짜만 비교 (시간 무시)
  const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueAtDateOnly = new Date(dueAt.getFullYear(), dueAt.getMonth(), dueAt.getDate());
  
  const isExpired = nowDateOnly > dueAtDateOnly; // ❌ 시간을 무시함!
  
  console.log('[compareMissionDueDate_WRONG] 잘못된 비교:', {
    현재시간: now.toLocaleString('ko-KR'),
    마감시간: dueAt.toLocaleString('ko-KR'),
    현재날짜만: nowDateOnly.toLocaleString('ko-KR'),
    마감날짜만: dueAtDateOnly.toLocaleString('ko-KR'),
    비교결과: isExpired,
    문제: '시간(13시)을 무시하고 날짜만 비교하여 오늘 13시가 지나도 내일까지 ACTIVE로 유지됨',
  });
  
  return isExpired;
};

/**
 * ✅ 올바른 비교: 날짜 + 시간 비교
 */
const compareMissionDueDate_CORRECT = (mission: Mission, currentTime: number = Date.now()): boolean => {
  const nowTime = currentTime;
  const dueAtTime = new Date(mission.dueAt).getTime();
  
  const isExpired = nowTime > dueAtTime; // ✅ 밀리초 단위로 정확히 비교
  
  console.log('[compareMissionDueDate_CORRECT] 올바른 비교:', {
    현재시간_밀리초: nowTime,
    마감시간_밀리초: dueAtTime,
    비교결과: isExpired,
    설명: '밀리초 단위로 비교하여 시간까지 정확히 체크',
  });
  
  return isExpired;
};
```

### 비교 예시

```typescript
// 현재 시간: 2024-01-15 14:00:00 (오후 2시)
// 마감 시간: 2024-01-15 13:00:00 (오후 1시)

// ❌ 잘못된 비교 (날짜만)
const nowDateOnly = new Date(2024, 0, 15); // 2024-01-15 00:00:00
const dueAtDateOnly = new Date(2024, 0, 15); // 2024-01-15 00:00:00
nowDateOnly > dueAtDateOnly; // false (같은 날짜이므로)

// ✅ 올바른 비교 (날짜 + 시간)
const nowTime = new Date(2024, 0, 15, 14, 0, 0).getTime(); // 1705302000000
const dueAtTime = new Date(2024, 0, 15, 13, 0, 0).getTime(); // 1705298400000
nowTime > dueAtTime; // true (14시 > 13시이므로 만료됨)
```

---

## 📊 날짜만 비교 vs 날짜+시간 비교 차이

### 문제 시나리오

**상황:**
- 현재 시간: 2024-01-15 14:00:00 (오후 2시)
- 마감 시간: 2024-01-15 13:00:00 (오후 1시)

### ❌ 날짜만 비교 (잘못된 방법)

```typescript
const now = new Date(2024, 0, 15, 14, 0, 0); // 2024-01-15 14:00
const dueAt = new Date(2024, 0, 15, 13, 0, 0); // 2024-01-15 13:00

// 날짜만 추출 (시간 제거)
const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
// → 2024-01-15 00:00:00

const dueAtDateOnly = new Date(dueAt.getFullYear(), dueAt.getMonth(), dueAt.getDate());
// → 2024-01-15 00:00:00

// 비교
nowDateOnly > dueAtDateOnly; // false (같은 날짜이므로)
// ❌ 결과: 만료되지 않음 (잘못됨!)
```

**문제점:**
- 오후 1시가 지났는데도 만료되지 않음
- 같은 날짜이면 시간이 지나도 ACTIVE 상태 유지

### ✅ 날짜 + 시간 비교 (올바른 방법)

```typescript
const now = new Date(2024, 0, 15, 14, 0, 0); // 2024-01-15 14:00
const dueAt = new Date(2024, 0, 15, 13, 0, 0); // 2024-01-15 13:00

// 밀리초로 변환하여 비교
const nowTime = now.getTime(); // 1705302000000
const dueAtTime = dueAt.getTime(); // 1705298400000

// 비교
nowTime > dueAtTime; // true (14시 > 13시이므로)
// ✅ 결과: 만료됨 (올바름!)
```

**장점:**
- 시간까지 정확히 비교
- 밀리초 단위 정확도
- 오후 1시가 지나면 즉시 만료 처리

---

## 🎯 실제 사용 코드 (ChildHome.tsx)

```typescript
// 마감 체크: allMissions 또는 currentTime이 변경될 때마다 마감 처리 적용
const checkedMissions = useMemo(() => {
  const nowTime = currentTime; // 밀리초
  
  // 디버깅: 각 미션의 마감 시간 비교 상세 로그
  allMissions.forEach((mission) => {
    if (mission.status === 'ACTIVE' && !mission.completedAt) {
      const dueAtTime = new Date(mission.dueAt).getTime();
      const isExpired = nowTime > dueAtTime;
      const diff = nowTime - dueAtTime;
      
      console.log(`[ChildHome] 미션 마감 시간 비교: ${mission.title}`, {
        missionId: mission.id,
        현재시간_Date_now: Date.now(),
        현재시간_currentTime: currentTime,
        현재시간_로컬: new Date(currentTime).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
        현재시간_ISO: new Date(currentTime).toISOString(),
        마감시간_dueAt: mission.dueAt,
        마감시간_파싱: new Date(mission.dueAt).getTime(),
        마감시간_로컬: new Date(mission.dueAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
        마감시간_ISO: new Date(mission.dueAt).toISOString(),
        비교결과_만료여부: isExpired,
        비교결과_차이밀리초: diff,
        비교결과_차이시간: `${Math.floor(diff / (1000 * 60 * 60))}시간 ${Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))}분`,
        비교코드: `Date.now() (${nowTime}) > new Date('${mission.dueAt}').getTime() (${dueAtTime}) = ${isExpired}`,
      });
    }
  });
  
  const checked = checkAndUpdateExpiredMissions(allMissions, new Date(currentTime));
  return checked;
}, [allMissions, currentTime]);
```

---

## 📝 체크리스트

- [x] 현재 시간: `Date.now()` (클라이언트 시간)
- [x] 실시간 업데이트: `setInterval(1000)` (1초마다)
- [x] Firestore Timestamp 변환: `timestamp.toDate()` 또는 `new Date(isoString)`
- [x] 마감 시간 비교: `nowTime > dueAtTime` (밀리초 단위)
- [x] 날짜 + 시간 비교: ✅ 올바른 방법
- [x] 날짜만 비교: ❌ 잘못된 방법 (사용하지 않음)
- [x] 디버그 UI: `TimeDebugPanel` 컴포넌트
- [x] 콘솔 로그: 상세 비교 정보 출력

---

이제 브라우저 콘솔과 디버그 패널에서 실제 시간 비교 결과를 확인할 수 있습니다!

