# 미션 상태 변경 흐름 분석

## 🔍 [1] EXPIRED 판정 기준 확인

### 실제 기준: **C. Firestore onSnapshot 후 클라이언트 계산**

**데이터 흐름:**
```
Firestore onSnapshot
  ↓
subscribeChildMissions(childId, callback)
  ↓
setAllMissions(missions)  // Firestore 원본 데이터
  ↓
checkAndUpdateExpiredMissions(allMissions, nowMs)  // 클라이언트 계산
  ↓
checkedMissions  // 계산된 상태 (EXPIRED 포함)
  ↓
todayMissions / activeMissions / weekMissions  // 필터링
  ↓
displayMissions  // UI에 표시
  ↓
MissionCard  // mission.status 참조
```

**결론**: ✅ **C. Firestore onSnapshot 후 클라이언트 계산**이 정답

---

## 🔍 [2] UI가 참조하는 status 출처 확인

### 실제 출처: **checkedMissions (계산된 값)**

**코드 확인:**

```typescript
// ChildHome.tsx:217
const checkedMissions = useMemo(() => {
  const now = new Date(nowMs);
  const checked = checkAndUpdateExpiredMissions(allMissions, now);
  return checked;
}, [allMissions, nowMs]);

// ChildHome.tsx:231
const todayMissions = useMemo(() => {
  return checkedMissions.filter(...);  // ✅ checkedMissions 사용
}, [checkedMissions, childId, nowMs]);

// ChildHome.tsx:317
const displayMissions = useMemo(() => {
  if (activeTab === 'today') return todayMissions;  // ✅ checkedMissions 기반
  if (activeTab === 'week') return weekMissions;    // ✅ checkedMissions 기반
  return activeMissions;                            // ✅ checkedMissions 기반
}, [activeTab, todayMissions, weekMissions, activeMissions]);

// ChildHome.tsx:716
{displayMissions.map((mission) => (
  <MissionCard mission={mission} />  // ✅ 계산된 mission.status 전달
))}
```

**결론**: ✅ UI는 **checkedMissions (계산된 값)**을 참조하고 있음

---

## 🔍 [3] checkAndUpdateExpiredMissions 실제 호출 확인

### ✅ 호출 확인됨

**코드:**
```typescript
// ChildHome.tsx:217-219
const checkedMissions = useMemo(() => {
  const now = new Date(nowMs);
  const checked = checkAndUpdateExpiredMissions(allMissions, now);  // ✅ 호출됨
  return checked;
}, [allMissions, nowMs]);  // ✅ nowMs dependency 있음
```

**결론**: ✅ `checkAndUpdateExpiredMissions`는 `useMemo` 내부에서 호출되고, `nowMs`가 dependency에 포함되어 있음

---

## 🐛 실제 문제 원인 추정

### 가능성 1: `allMissions`가 Firestore 원본을 그대로 사용

**문제 코드:**
```typescript
// ChildHome.tsx:162-176
const unsubscribe = subscribeChildMissions(childId, (missions) => {
  setAllMissions(missions);  // Firestore 원본 데이터
});
```

**확인 필요:**
- `subscribeChildMissions`가 반환하는 `missions`가 이미 `EXPIRED` 상태인지
- `docToMission`이 Firestore의 `status` 필드를 그대로 사용하는지

### 가능성 2: `checkAndUpdateExpiredMission`이 `IN_PROGRESS` 상태를 제대로 처리하지 않음

**현재 코드:**
```typescript
// missions.ts:140-143
if (mission.status !== 'IN_PROGRESS' && mission.status !== 'ACTIVE') {
  return mission;  // 다른 상태는 그대로 반환
}
```

**확인 필요:**
- Firestore에서 받은 미션이 실제로 `IN_PROGRESS` 상태인지
- `ACTIVE` 상태로 저장되어 있는지

### 가능성 3: `dueAt` 파싱 실패

**현재 코드:**
```typescript
// missions.ts:149-156
const dueAtDate = new Date(mission.dueAt);
dueAtTime = dueAtDate.getTime();

if (isNaN(dueAtTime)) {
  console.warn('[checkAndUpdateExpiredMission] 유효하지 않은 dueAt:', mission.dueAt, mission.id);
  return mission;  // 파싱 실패 시 원본 반환
}
```

**확인 필요:**
- 콘솔에 파싱 실패 경고가 출력되는지
- `mission.dueAt` 형식이 올바른지

---

## 🔧 해결 방안

### 1. Firestore 원본 데이터 확인
- `subscribeChildMissions`가 반환하는 데이터의 `status` 필드 확인
- `docToMission`이 `status`를 어떻게 변환하는지 확인

### 2. 상태 처리 로직 강화
- `IN_PROGRESS`와 `ACTIVE` 모두 명확히 처리
- 디버깅 로그 추가

### 3. `dueAt` 파싱 검증
- 파싱 실패 시 더 명확한 에러 처리
- `deadlineAt` 필드 우선 사용

---

## 📋 다음 단계

1. 콘솔 로그 확인
   - `[ChildHome] 상태 변경된 미션` 로그가 출력되는지
   - `[checkAndUpdateExpiredMission] 미션 만료 처리` 로그가 출력되는지

2. Firestore 데이터 확인
   - 실제 저장된 `status` 필드 값
   - `dueAt` 또는 `deadlineAt` 필드 형식

3. 상태 비교 로직 확인
   - `nowMs >= dueAtTime` 비교가 정확한지
   - 타임존 문제는 없는지

