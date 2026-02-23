# 구조 정리 요약

현재 동작하는 구조를 고정하고 Firebase 연동을 위한 준비를 완료했습니다.

## ✅ 완료된 작업

### 1. AppContext 기준 상태 고정
- ✅ `loading`: mount 시 1회만 `true` → `false`로 전환
- ✅ `user`: Context에서만 변경 (컴포넌트에서 직접 변경 불가)
- ✅ `missions`: Context에서만 변경 (실시간 구독 또는 mock 데이터)
- ✅ `lastRewardPoint`: Context → ChildHome 단방향 흐름 보장

### 2. 컴포넌트 단순화
- ✅ `Home.tsx`: tempLogin 호출 제거, "user 준비 상태"만 가정
- ✅ `ChildHome.tsx`: tempLoginChild 호출 제거, "user 준비 상태"만 가정
- ✅ `Approval.tsx`: 이미 단순화되어 있음 (user 확인만)

### 3. 인증/권한/데이터 분리
- ✅ **인증(Auth)**: Firebase Auth 또는 임시 로그인 (명확히 분리)
- ✅ **권한(Role)**: `user.role` (PARENT / CHILD)
- ✅ **데이터(Missions)**: Firestore 실시간 구독 또는 mock 데이터

### 4. Firebase 연동 준비
- ✅ TODO 주석 추가 (인증, 데이터 구독, 비즈니스 로직)
- ✅ 임시 로그인 구조 유지 (Firebase 연동 시 교체 가능)
- ✅ 구조 설명 문서 작성 (`FIREBASE_INTEGRATION.md`)

## 📁 파일 구조

### 핵심 파일
- `src/context/AppContext.tsx`: 기준 상태 관리 (고정)
- `src/components/Home.tsx`: 부모 홈 화면 (단순화)
- `src/components/ChildHome.tsx`: 아이 홈 화면 (단순화)
- `src/components/Approval.tsx`: 승인 화면 (단순화)

### 문서
- `FIREBASE_INTEGRATION.md`: Firebase 연동 가이드
- `STRUCTURE_SUMMARY.md`: 이 문서

## 🔒 고정된 규칙

### AppContext
1. `loading`은 mount 시 1회만 `true` → `false`로 전환
2. `user`와 `missions`는 Context에서만 변경
3. 컴포넌트에서 `setUser`, `setMissions` 직접 호출 불가
4. `lastRewardPoint`는 Context → ChildHome 단방향 흐름

### 컴포넌트
1. "user가 이미 준비된 상태"만 가정
2. `loading` 또는 `!user`일 때만 로딩 UI 표시
3. 로그인/세션 변경 로직 없음
4. `tempLogin`/`tempLoginChild` 호출 없음 (Context에서 자동 처리)

## 🔄 데이터 흐름

### 현재 (임시 로그인 모드)
```
AppContext mount
  → Firebase 없음 감지
  → isTempLogin = true
  → setUser(initialParentUser)
  → setMissions(initialMissions)
  → setLoading(false)
```

### Firebase 연동 후
```
AppContext mount
  → Firebase Auth 감지
  → onAuthStateChanged
  → subscribeUser(uid)
  → setUser(userData)
  → subscribeMissions(user.role, selectedChildId)
  → setMissions(missionsData)
  → setLoading(false)
```

## 🎯 다음 단계 (Firebase 연동)

### Step 1: Firebase Auth
- `src/context/AppContext.tsx` 39-118줄의 TODO 주석 참고
- `onAuthStateChanged`에서 `subscribeUser` 호출
- `isTempLogin` 플래그 제거 또는 개발 모드로만 사용

### Step 2: Firestore 구독
- `src/context/AppContext.tsx` 120-170줄의 TODO 주석 참고
- `user.role`에 따라 적절한 구독 함수 호출
- 실시간 업데이트로 `missions` 상태 자동 반영

### Step 3: 비즈니스 로직
- 각 함수 내부의 TODO 주석 참고
- Firebase Storage, Firestore, Cloud Functions 연동
- 실시간 구독으로 자동 상태 업데이트

## ⚠️ 주의사항

1. **절대 변경하지 말 것**:
   - `loading` 전환 로직 (mount 시 1회만)
   - `user`/`missions` 상태 변경 위치 (Context에서만)
   - 컴포넌트의 "user 준비 상태" 가정

2. **Firebase 연동 시**:
   - TODO 주석 위치만 수정
   - 기존 구조는 유지
   - 임시 로그인 모드는 개발 모드로만 사용

3. **테스트**:
   - 무한 로딩 없이 정상 동작 확인
   - 부모/아이 화면 분기 확인
   - 포인트 애니메이션 확인

## 📝 TODO 주석 위치

### 인증 (Auth)
- `src/context/AppContext.tsx` 39-118줄

### 데이터 (Missions)
- `src/context/AppContext.tsx` 120-170줄

### 비즈니스 로직
- `submitMission`: 172-229줄
- `approveMission`: 231-291줄
- `rejectMission`: 293-333줄
- `createMission`: 335-393줄

### 임시 로그인
- `tempLogin`: 395-406줄
- `tempLoginChild`: 408-419줄

## 🎉 결과

- ✅ 현재 동작하는 구조 고정
- ✅ Firebase 연동 준비 완료
- ✅ 컴포넌트 단순화 완료
- ✅ 인증/권한/데이터 분리 완료
- ✅ TODO 주석 및 문서 작성 완료

