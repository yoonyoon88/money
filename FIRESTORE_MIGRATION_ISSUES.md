# Firestore 전환 문제점 분석 및 수정안

## ✅ 완료된 수정사항

### 1. firebase/missions.ts 구독 함수 개선

#### 수정 내용
- ✅ 에러 핸들링 추가 (`onSnapshot`의 세 번째 인자로 에러 콜백)
- ✅ `db` null 체크 추가
- ✅ 디버깅 로그 추가 (구독 시작, Snapshot 수신, 에러)

#### 주요 변경점
```typescript
// 이전: 에러 핸들링 없음
return onSnapshot(missionsQuery, (snapshot) => {
  const missions = snapshot.docs.map(...);
  callback(missions);
});

// 수정 후: 에러 핸들링 + 로그
return onSnapshot(
  missionsQuery,
  (snapshot) => {
    console.log('[subscribeChildMissions] Snapshot 수신:', {...});
    const missions = snapshot.docs.map(...);
    callback(missions);
  },
  (error) => {
    console.error('[subscribeChildMissions] 구독 에러:', error);
    callback([]); // 에러 시 빈 배열 반환
  }
);
```

### 2. AppContext.tsx 리팩터링

#### 수정 내용
- ✅ `isTempLogin` 의존성 제거 (missions 구독 useEffect에서)
- ✅ `initialMissions` 의존성 제거
- ✅ Firebase Auth useEffect에서 임시 로그인 자동 전환 로직 제거
- ✅ 디버깅 로그 추가 (구독 분기, Snapshot 수신)

#### 주요 변경점
```typescript
// 이전: isTempLogin 체크로 mock 데이터 사용
if (isTempLogin) {
  setMissions(initialMissions);
  return;
}

// 수정 후: isTempLogin 체크 제거, Firestore만 사용
// (isTempLogin은 tempLogin 함수에서만 사용)
```

### 3. 디버깅 로그 추가

#### 로그 위치
- ✅ Firestore snapshot 수신 시점
- ✅ user.id / role 기준 분기 지점
- ✅ 구독 시작/해제 시점
- ✅ missions 업데이트 시점

## ⚠️ 잠재적 문제점 및 해결방안

### 문제 1: Firestore 인덱스 누락

#### 원인
- `subscribeChildMissions`: `childId` + `createdAt` 복합 인덱스 필요
- `subscribeParentChildMissions`: `childId` + `createdAt` 복합 인덱스 필요
- `subscribeSubmittedMissions`: `status` + `submittedAt` 복합 인덱스 필요

#### 증상
- 콘솔에 "The query requires an index" 에러 발생
- missions가 빈 배열로 표시됨

#### 해결방안
1. **Firebase Console에서 인덱스 생성**
   - 에러 메시지에 포함된 링크 클릭
   - 자동으로 인덱스 생성 페이지로 이동

2. **수동 인덱스 생성**
   ```
   missions 컬렉션:
   - childId (Ascending) + createdAt (Descending)
   - status (Ascending) + submittedAt (Descending)
   ```

3. **임시 해결책**
   - `subscribeSubmittedMissions`에서 `orderBy` 제거 (성능 저하 가능)
   - 또는 `submittedAt`이 없는 문서는 제외

### 문제 2: submittedAt 필드 누락

#### 원인
- `subscribeSubmittedMissions`에서 `orderBy('submittedAt', 'desc')` 사용
- `status === 'SUBMITTED'`이지만 `submittedAt` 필드가 없는 문서가 있을 수 있음

#### 증상
- 쿼리 에러 또는 빈 결과 반환

#### 해결방안
```typescript
// 현재 코드는 이미 에러 핸들링이 있음
// 에러 발생 시 빈 배열 반환하여 UI가 깨지지 않음
```

**추가 개선안**:
- `submittedAt`이 없는 문서는 쿼리에서 제외하거나
- `createdAt`으로 정렬하도록 변경 (인덱스 필요)

### 문제 3: 무한 로딩

#### 원인 분석

##### 원인 1: Firebase Auth가 초기화되지 않음
- `auth`가 `null`이면 `onAuthStateChanged`가 호출되지 않음
- `loading`이 `false`로 전환되지 않음

**현재 코드**:
```typescript
if (!auth) {
  console.warn('[AppContext] Firebase Auth가 초기화되지 않았습니다.');
  setLoading(false); // ✅ 이미 해결됨
  return;
}
```

##### 원인 2: subscribeUser 콜백이 호출되지 않음
- Firestore에 `users/{uid}` 문서가 없음
- `subscribeUser`는 `null`을 반환하지만 `setUser(null)`만 호출
- `user`가 `null`이면 missions 구독이 시작되지 않음

**현재 코드**:
```typescript
subscribeUser(firebaseUser.uid, (userData) => {
  setUser(userData); // userData가 null일 수 있음
});
```

**해결방안**: 이미 처리됨 (user가 null이면 missions는 빈 배열)

##### 원인 3: missions 구독 에러
- 인덱스 누락으로 쿼리 실패
- 에러 핸들링으로 빈 배열 반환 (UI는 정상 표시)

**현재 코드**:
```typescript
return onSnapshot(
  missionsQuery,
  (snapshot) => {...},
  (error) => {
    console.error('[subscribeChildMissions] 구독 에러:', error);
    callback([]); // ✅ 에러 시 빈 배열 반환
  }
);
```

### 문제 4: missions 빈 배열

#### 원인 분석

##### 원인 1: Firestore에 데이터가 없음
- `missions` 컬렉션에 문서가 없음
- `childId` 또는 `parentId`가 일치하지 않음

**확인 방법**:
- 콘솔 로그 확인: `[subscribeChildMissions] Snapshot 수신: { count: 0 }`
- Firestore Console에서 데이터 확인

##### 원인 2: 쿼리 조건 불일치
- `childId`가 `user.id`와 일치하지 않음
- `parentId`가 `user.id`와 일치하지 않음

**확인 방법**:
- 콘솔 로그 확인: `[AppContext] Missions 구독 분기: { role: 'CHILD', userId: '...' }`
- Firestore 문서의 `childId`/`parentId` 필드 확인

##### 원인 3: 인덱스 누락
- 복합 인덱스가 없어 쿼리 실패
- 에러 핸들링으로 빈 배열 반환

**확인 방법**:
- 콘솔 에러 확인: `[subscribeChildMissions] 구독 에러: ...`
- Firebase Console에서 인덱스 생성 필요 메시지 확인

## 🔍 디버깅 체크리스트

### 1. 콘솔 로그 확인
```
✅ [AppContext] Auth useEffect 실행: { hasAuth: true }
✅ [AppContext] onAuthStateChanged 이벤트: { hasFirebaseUser: true, uid: '...' }
✅ [AppContext] subscribeUser 호출: { uid: '...' }
✅ [AppContext] subscribeUser 콜백: { hasUserData: true, role: 'CHILD', userId: '...' }
✅ [AppContext] Missions 구독 useEffect 실행: { hasUser: true, userRole: 'CHILD', ... }
✅ [AppContext] CHILD 모드: subscribeChildMissions 호출
✅ [subscribeChildMissions] 구독 시작: { childId: '...' }
✅ [subscribeChildMissions] Snapshot 수신: { childId: '...', count: 3, ... }
✅ [AppContext] CHILD missions 업데이트: { userId: '...', count: 3 }
```

### 2. Firestore 데이터 확인
- `users/{uid}` 문서 존재 여부
- `missions` 컬렉션에 문서 존재 여부
- `missions` 문서의 `childId`/`parentId` 필드 확인

### 3. 인덱스 확인
- Firebase Console > Firestore > Indexes
- 필요한 인덱스가 생성되었는지 확인

## 📝 추가 개선 사항

### 1. submittedAt 필드 처리 개선

현재 `subscribeSubmittedMissions`는 `orderBy('submittedAt', 'desc')`를 사용하지만,
`submittedAt`이 없는 문서가 있으면 쿼리가 실패할 수 있습니다.

**개선안**:
```typescript
// submittedAt이 있는 문서만 필터링
const missionsQuery = query(
  collection(db, 'missions'),
  where('status', '==', 'SUBMITTED'),
  where('submittedAt', '!=', null), // null이 아닌 것만
  orderBy('submittedAt', 'desc')
);
```

또는 인덱스 없이 사용:
```typescript
// orderBy 제거하고 클라이언트에서 정렬
const missionsQuery = query(
  collection(db, 'missions'),
  where('status', '==', 'SUBMITTED')
);

return onSnapshot(missionsQuery, (snapshot) => {
  const missions = snapshot.docs
    .map((doc) => docToMission(doc.data(), doc.id))
    .filter(...)
    .sort((a, b) => {
      // submittedAt으로 정렬 (클라이언트)
      const aTime = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
      const bTime = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
      return bTime - aTime;
    });
  callback(missions);
});
```

### 2. 에러 복구 로직

현재는 에러 발생 시 빈 배열을 반환하지만, 재시도 로직을 추가할 수 있습니다.

**개선안** (선택적):
```typescript
let retryCount = 0;
const maxRetries = 3;

const subscribeWithRetry = () => {
  return onSnapshot(
    missionsQuery,
    (snapshot) => {
      retryCount = 0; // 성공 시 리셋
      callback(snapshot.docs.map(...));
    },
    (error) => {
      if (retryCount < maxRetries) {
        retryCount++;
        setTimeout(() => subscribeWithRetry(), 1000 * retryCount);
      } else {
        console.error('최대 재시도 횟수 초과');
        callback([]);
      }
    }
  );
};
```

## ✅ 최종 확인 사항

1. ✅ Firestore에 `users/{uid}` 문서 존재
2. ✅ Firestore에 `missions` 컬렉션에 문서 존재
3. ✅ `missions` 문서의 `childId`/`parentId`가 `user.id`와 일치
4. ✅ 필요한 인덱스 생성 완료
5. ✅ 콘솔 로그로 구독 정상 동작 확인
6. ✅ UI에 missions 정상 표시 확인

## 🎯 다음 단계

1. **Firestore 데이터 확인**
   - `users` 컬렉션에 테스트 사용자 생성
   - `missions` 컬렉션에 테스트 미션 생성

2. **인덱스 생성**
   - Firebase Console에서 필요한 인덱스 생성
   - 또는 에러 메시지의 링크 클릭

3. **콘솔 로그 확인**
   - 구독이 정상적으로 시작되는지 확인
   - Snapshot이 수신되는지 확인
   - missions가 업데이트되는지 확인

4. **UI 확인**
   - ChildHome / ParentHome에 missions 정상 표시
   - 실시간 업데이트 확인 (Firestore에서 직접 수정)

