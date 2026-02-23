# Firebase 연동 가이드

이 문서는 현재 동작하는 구조를 유지하면서 Firebase를 안전하게 연동하기 위한 가이드를 제공합니다.

## 현재 구조 (고정)

### 1. AppContext 기준 상태
- `loading`: mount 시 1회만 `true` → `false`로 전환
- `user`: Context에서만 변경 (컴포넌트에서 직접 변경 불가)
- `missions`: Context에서만 변경 (실시간 구독 또는 mock 데이터)
- `lastRewardPoint`: Context → ChildHome 단방향 흐름

### 2. 컴포넌트 단순화
- `Home`, `ChildHome`, `Approval` 컴포넌트는 "user가 이미 준비된 상태"만 가정
- 로그인/세션 변경 로직은 컴포넌트에 없음
- `loading` 또는 `!user`일 때만 로딩 UI 표시

### 3. 인증/권한/데이터 분리
- **인증(Auth)**: Firebase Auth 또는 임시 로그인
- **권한(Role)**: `user.role` (PARENT / CHILD)
- **데이터(Missions)**: Firestore 실시간 구독 또는 mock 데이터

## Firebase 연동 단계

### Step 1: Firebase Auth 연동

**위치**: `src/context/AppContext.tsx` - 인증(Auth) 관리 섹션

**현재 코드**:
```typescript
// Firebase Auth 상태 변경 감지
unsubscribeAuth = auth.onAuthStateChanged(async (firebaseUser) => {
  setLoading(false);
  if (firebaseUser) {
    subscribeUser(firebaseUser.uid, (userData) => {
      setUser(userData);
    });
  } else {
    setUser(null);
    setMissions([]);
  }
});
```

**연동 시 변경사항**:
1. `subscribeUser` 함수가 Firestore의 `users/{uid}` 문서를 실시간 구독
2. `userData`에 `role`, `name`, `totalPoint` 등이 포함됨
3. `isTempLogin` 플래그 제거 (Firebase Auth 사용 시)

**TODO 주석 위치**: `src/context/AppContext.tsx` 39-118줄

### Step 2: Firestore 데이터 구독

**위치**: `src/context/AppContext.tsx` - 데이터(Missions) 관리 섹션

**현재 코드**:
```typescript
if (user.role === 'CHILD') {
  unsubscribe = subscribeChildMissions(user.id, (missionsData) => {
    setMissions(missionsData);
  });
} else if (user.role === 'PARENT') {
  if (selectedChildId) {
    unsubscribe = subscribeParentChildMissions(selectedChildId, (missionsData) => {
      setMissions(missionsData);
    });
  } else {
    unsubscribe = subscribeSubmittedMissions(...);
  }
}
```

**연동 시 변경사항**:
1. `subscribeChildMissions`: `missions` 컬렉션에서 `childId === user.id` 필터링
2. `subscribeParentChildMissions`: `missions` 컬렉션에서 `childId === selectedChildId` 필터링
3. `subscribeSubmittedMissions`: `missions` 컬렉션에서 `status === 'SUBMITTED'` 필터링
4. 모든 구독은 `onSnapshot`으로 실시간 업데이트

**TODO 주석 위치**: `src/context/AppContext.tsx` 120-170줄

### Step 3: 비즈니스 로직 함수

**위치**: `src/context/AppContext.tsx` - 비즈니스 로직 함수 섹션

**함수별 연동**:

#### `submitMission`
- `uploadMissionImage`: Firebase Storage에 이미지 업로드
- `updateMissionSubmission`: Firestore에 미션 상태 업데이트
- 실시간 구독으로 자동으로 `missions` 상태 업데이트

#### `approveMission`
- `approveMissionWithPoints`: Cloud Function 호출 (포인트 적립)
- `approveMissionInFirebase`: Firestore에 미션 상태 업데이트
- 실시간 구독으로 `user.totalPoint`와 `missions` 상태 자동 업데이트
- `setLastRewardPoint`: 애니메이션용 상태 설정

#### `rejectMission`
- `rejectMissionInFirebase`: Firestore에 미션 상태 업데이트
- 실시간 구독으로 자동으로 `missions` 상태 업데이트

#### `createMission`
- `createMissionInFirebase`: Firestore에 미션 생성
- 실시간 구독으로 자동으로 `missions` 상태 업데이트

**TODO 주석 위치**: 각 함수 내부

## 임시 로그인 모드 유지

### 현재 동작
- Firebase가 없으면 자동으로 임시 로그인 모드로 전환
- `isTempLogin` 플래그로 mock 데이터 사용
- `tempLogin()`, `tempLoginChild()` 함수로 수동 전환 가능

### Firebase 연동 후
- `tempLogin`, `tempLoginChild` 함수는 개발 모드에서만 사용
- 프로덕션에서는 Firebase Auth 필수
- `isTempLogin` 플래그는 개발 모드 체크로 변경 가능

## 보안 고려사항

### 1. Firestore Security Rules
- 역할 기반 접근 제어
- 부모: 미션 생성, 승인/반려만 가능
- 아이: 미션 제출만 가능
- 포인트 수정: Cloud Function에서만 가능

### 2. Cloud Functions
- 포인트 적립은 서버 측에서만 처리
- 트랜잭션으로 원자적 처리
- 권한 검증 포함

### 3. 클라이언트 보호
- `user.totalPoint`는 읽기 전용 (컨텍스트에서 직접 수정 불가)
- 모든 상태 변경은 Firestore 실시간 구독을 통해 자동 반영

## 테스트 체크리스트

- [ ] Firebase Auth 로그인/로그아웃 정상 동작
- [ ] 부모/아이 역할에 따른 화면 분기 정상
- [ ] 미션 생성/제출/승인/반려 정상 동작
- [ ] 포인트 적립 및 애니메이션 정상 동작
- [ ] 실시간 구독으로 데이터 자동 업데이트 확인
- [ ] 무한 로딩 없이 정상 동작 확인

## 롤백 계획

Firebase 연동 중 문제 발생 시:
1. `isTempLogin` 플래그를 `true`로 설정
2. `tempLogin()` 또는 `tempLoginChild()` 호출
3. mock 데이터로 즉시 복구

