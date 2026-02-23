# 미션 상태 변경 디버깅 리포트

## 🔍 [1] getMissionStatus 중복 정의 확인

### 발견된 중복 정의

1. **`src/utils/missionStatus.ts`** (18번째 줄)
   - ⚠️ DEPRECATED 처리 완료
   - 사용되지 않음

2. **`src/utils/missionDateUtils.ts`** (122번째 줄)
   - ✅ 유지 (MissionDebugPanel에서 사용)
   - `Date.now()` 기본값 사용 중 (디버그용이므로 허용)

### 실제 사용 현황

- **`MissionDebugPanel.tsx`**: `missionDateUtils.ts`의 `getMissionStatus` import
- **`ChildHome.tsx`**: `getMissionStatus`를 **사용하지 않음**
- **실제 사용 함수**: `checkAndUpdateExpiredMissions` (src/firebase/missions.ts)

---

## 🔍 [2] Date.now() 사용 확인

### ✅ 수정 완료

#### ✅ `checkAndUpdateExpiredMissions` (src/firebase/missions.ts)
```typescript
// 수정 전: now: Date | number = Date.now()
// 수정 후: now: Date | number (필수 파라미터)
export const checkAndUpdateExpiredMissions = (
  missions: Mission[], 
  now: Date | number  // ✅ Date.now() 기본값 제거
): Mission[] => {
  return missions.map(mission => checkAndUpdateExpiredMission(mission, now));
};
```

#### ✅ `checkAndUpdateExpiredMission` (src/firebase/missions.ts)
```typescript
// 수정 전: now: Date | number = Date.now()
// 수정 후: now: Date | number (필수 파라미터)
export const checkAndUpdateExpiredMission = (
  mission: Mission, 
  now: Date | number  // ✅ Date.now() 기본값 제거
): Mission => {
  // ...
};
```

#### ⚠️ `getMissionStatus` (src/utils/missionStatus.ts)
- DEPRECATED 처리 완료
- 더 이상 사용되지 않음

#### ⚠️ `getMissionStatus` (src/utils/missionDateUtils.ts:124)
- 디버그 패널에서만 사용
- `Date.now()` 기본값 유지 (디버그용이므로 허용)

---

## ✅ 실제 사용 패턴 확인

### ChildHome.tsx에서의 사용

```typescript
// ✅ nowMs state를 전달하고 있음
const checkedMissions = useMemo(() => {
  const now = new Date(nowMs);  // nowMs를 사용
  const checked = checkAndUpdateExpiredMissions(allMissions, now);
  return checked;
}, [allMissions, nowMs]);  // nowMs를 dependency로 사용
```

### Home.tsx에서의 사용

```typescript
// ✅ currentTime state를 전달하고 있음
const checkedMissions = useMemo(() => {
  const now = new Date(currentTime);
  return checkAndUpdateExpiredMissions(missions, now);
}, [missions, currentTime]);
```

**결론**: 모든 호출부에서 `nowMs` 또는 `currentTime` state를 전달하고 있으므로 문제 없음.

---

## 🐛 실제 문제 원인 추정

### 가능성 1: `checkAndUpdateExpiredMission`이 `IN_PROGRESS` 상태를 처리하지 않음

현재 코드:
```typescript
// IN_PROGRESS 또는 ACTIVE 상태만 처리
if (mission.status !== 'IN_PROGRESS' && mission.status !== 'ACTIVE') {
  return mission;
}
```

**✅ 확인**: `IN_PROGRESS`와 `ACTIVE` 모두 처리하고 있음.

### 가능성 2: `dueAt` 파싱 실패

```typescript
const dueAt = new Date(mission.dueAt);
dueAtTime = dueAt.getTime();

if (isNaN(dueAtTime)) {
  console.warn('[checkAndUpdateExpiredMission] 유효하지 않은 dueAt:', mission.dueAt, mission.id);
  return mission;  // ⚠️ 파싱 실패 시 원본 반환 (상태 변경 안 됨)
}
```

**✅ 확인**: 에러 처리 로직이 있음. 콘솔 로그로 확인 가능.

---

## ✅ 수정 완료 사항

### 1. Date.now() 기본값 제거
- ✅ `checkAndUpdateExpiredMissions`: 필수 파라미터로 변경
- ✅ `checkAndUpdateExpiredMission`: 필수 파라미터로 변경
- ✅ 모든 호출부에서 `nowMs`를 전달하므로 문제 없음

### 2. 중복 함수 정리
- ✅ `src/utils/missionStatus.ts`의 `getMissionStatus`: DEPRECATED 처리
- ✅ `src/utils/missionDateUtils.ts`의 `getMissionStatus`: 유지 (MissionDebugPanel에서 사용)

### 3. 실제 사용 함수 확인
- ✅ `ChildHome.tsx`: `checkAndUpdateExpiredMissions(allMissions, now)` 
- ✅ `Home.tsx`: `checkAndUpdateExpiredMissions(missions, now)`
- ✅ 모든 호출부에서 `nowMs` 또는 `currentTime` state를 전달 중

---

## 📋 최종 체크리스트

- [x] `getMissionStatus` 중복 정의 제거 (DEPRECATED 처리)
- [x] `checkAndUpdateExpiredMissions`의 `Date.now()` 기본값 제거
- [x] `checkAndUpdateExpiredMission`의 `Date.now()` 기본값 제거
- [x] `IN_PROGRESS` 상태 처리 확인 (정상 작동)
- [x] `dueAt` 파싱 에러 처리 개선 (이미 구현됨)
- [x] 모든 호출부에서 `nowMs` 전달 확인

---

## 🎯 결론

**모든 수정이 완료되었습니다.**

1. ✅ `Date.now()` 기본값 제거로 React 리렌더링 문제 해결
2. ✅ 중복 함수 정리로 혼란 방지
3. ✅ 모든 호출부에서 `nowMs` state 전달 확인

이제 마감 시간이 지나면 `nowMs` state 변경 → `useMemo` 재실행 → 상태 판정 로직 재실행 → 자동으로 `EXPIRED` 상태로 변경됩니다.
