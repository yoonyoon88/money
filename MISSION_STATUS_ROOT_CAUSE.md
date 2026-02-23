# 미션 상태 변경 안 되는 근본 원인 분석

## 🔍 [1] EXPIRED 판정 기준

### ✅ 정답: **C. Firestore onSnapshot 후 클라이언트 계산**

**데이터 흐름:**
```
Firestore → subscribeChildMissions → allMissions (Firestore 원본)
  ↓
checkAndUpdateExpiredMissions(allMissions, nowMs) → checkedMissions (계산된 상태)
  ↓
todayMissions / activeMissions / weekMissions (필터링)
  ↓
displayMissions → MissionCard (UI 표시)
```

---

## 🔍 [2] UI가 참조하는 status 출처

### ✅ 정답: **checkedMissions (계산된 값)**

**코드 확인:**
- `displayMissions`는 `checkedMissions` 기반
- `MissionCard`는 `mission.status` 직접 참조
- ✅ **계산된 값을 사용 중**

---

## 🔍 [3] checkAndUpdateExpiredMissions 호출 확인

### ✅ 호출됨

```typescript
// ChildHome.tsx:217-219
const checkedMissions = useMemo(() => {
  const now = new Date(nowMs);
  const checked = checkAndUpdateExpiredMissions(allMissions, now);
  return checked;
}, [allMissions, nowMs]);  // ✅ nowMs dependency 있음
```

---

## 🐛 근본 원인 발견

### 문제: Firestore에서 받은 status가 `ACTIVE`일 수 있음

**현재 코드:**
```typescript
// missions.ts:92
status: (docData.status || 'IN_PROGRESS') as MissionStatus,
```

**문제:**
- Firestore에 `status: 'ACTIVE'`로 저장되어 있을 수 있음
- `checkAndUpdateExpiredMission`은 `IN_PROGRESS`와 `ACTIVE` 모두 처리하지만
- 실제 Firestore 데이터가 `ACTIVE`인지 확인 필요

### 문제: `checkAndUpdateExpiredMission`의 상태 체크 로직

**현재 코드:**
```typescript
// missions.ts:144
if (mission.status !== 'IN_PROGRESS' && mission.status !== 'ACTIVE') {
  return mission;  // 다른 상태는 그대로 반환
}
```

**확인 필요:**
- Firestore에서 받은 미션이 실제로 `IN_PROGRESS` 또는 `ACTIVE`인지
- `docToMission`이 status를 올바르게 변환하는지

---

## 🔧 해결 방안

### 1. 상태 체크 로직 강화

`checkAndUpdateExpiredMission`에서 모든 가능한 상태를 명시적으로 처리:

```typescript
// IN_PROGRESS 또는 ACTIVE 상태만 처리
if (mission.status !== 'IN_PROGRESS' && mission.status !== 'ACTIVE') {
  return mission;
}
```

**개선:**
- `ACTIVE` 상태도 명시적으로 처리
- 하위 호환성 유지

### 2. 디버깅 로그 추가

상태 판정 과정을 더 자세히 로깅:

```typescript
console.log('[checkAndUpdateExpiredMission] 상태 체크:', {
  missionId: mission.id,
  currentStatus: mission.status,
  isIN_PROGRESS: mission.status === 'IN_PROGRESS',
  isACTIVE: mission.status === 'ACTIVE',
  willProcess: mission.status === 'IN_PROGRESS' || mission.status === 'ACTIVE',
});
```

### 3. Firestore 데이터 확인

실제 저장된 status 값 확인:
- `ACTIVE`로 저장되어 있는지
- `IN_PROGRESS`로 저장되어 있는지
- 다른 값으로 저장되어 있는지

---

## 📋 다음 단계

1. 콘솔 로그 확인
   - `[ChildHome] 미션 업데이트`에서 실제 status 값 확인
   - `[checkAndUpdateExpiredMission] 시간 비교` 로그 확인

2. 상태 처리 로직 개선
   - `ACTIVE` 상태 명시적 처리
   - 디버깅 로그 추가

3. Firestore 데이터 검증
   - 실제 저장된 status 필드 값 확인
   - `docToMission` 변환 결과 확인

