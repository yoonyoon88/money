# Firebase 배포 가이드

이 문서는 Firebase DB와 권한 기반으로 동작하는 앱을 배포하기 위한 가이드를 제공합니다.

## 1. Firebase 프로젝트 설정

### 1.1 Firebase 프로젝트 생성
1. [Firebase Console](https://console.firebase.google.com/)에 접속
2. 새 프로젝트 생성
3. Authentication, Firestore, Storage, Functions 활성화

### 1.2 환경 변수 설정
프로젝트 루트에 `.env` 파일 생성:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

## 2. Firestore Security Rules 배포

```bash
firebase deploy --only firestore:rules
```

또는 Firebase Console에서 직접 `firestore.rules` 내용을 복사하여 배포합니다.

## 3. Storage Security Rules 배포

```bash
firebase deploy --only storage
```

또는 Firebase Console에서 직접 `storage.rules` 내용을 복사하여 배포합니다.

## 4. Cloud Functions 배포

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

## 5. Firestore 인덱스 생성

Firebase Console > Firestore > Indexes에서 다음 복합 인덱스를 생성합니다:

### missions 컬렉션
- `childId` (Ascending) + `createdAt` (Descending)
- `status` (Ascending) + `submittedAt` (Descending)
- `parentId` (Ascending) + `status` (Ascending)

### users 컬렉션
- `parentId` (Ascending) - 아이 조회용
- `role` (Ascending) - 역할별 조회용

## 6. 초기 데이터 설정

### 6.1 부모 사용자 생성
Firebase Console > Authentication에서 부모 계정을 생성하고, Firestore의 `users` 컬렉션에 다음 데이터를 추가:

```json
{
  "id": "parent_user_id",
  "name": "부모 이름",
  "totalPoint": 0,
  "role": "PARENT",
  "email": "parent@example.com",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "childrenIds": ["child_user_id_1", "child_user_id_2"]
}
```

### 6.2 아이 사용자 생성
Firebase Console > Authentication에서 아이 계정을 생성하고, Firestore의 `users` 컬렉션에 다음 데이터를 추가:

```json
{
  "id": "child_user_id",
  "name": "아이 이름",
  "totalPoint": 0,
  "role": "CHILD",
  "email": "child@example.com",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "parentId": "parent_user_id"
}
```

## 7. 권한 확인

### 7.1 부모 권한
- ✅ 자신의 사용자 정보 읽기/업데이트
- ✅ 자녀의 미션 생성
- ✅ 자녀의 미션 읽기
- ✅ 제출된 미션 승인/반려
- ❌ 포인트 직접 수정 불가 (Cloud Function에서만 가능)

### 7.2 아이 권한
- ✅ 자신의 사용자 정보 읽기/업데이트 (totalPoint 제외)
- ✅ 자신의 미션 읽기
- ✅ 미션 제출 (TODO -> SUBMITTED)
- ❌ 미션 생성 불가
- ❌ 포인트 직접 수정 불가

## 8. 보안 체크리스트

- [ ] Firestore Rules가 배포되었는지 확인
- [ ] Storage Rules가 배포되었는지 확인
- [ ] Cloud Functions가 배포되었는지 확인
- [ ] 모든 인덱스가 생성되었는지 확인
- [ ] Authentication이 활성화되었는지 확인
- [ ] 테스트 계정으로 권한 테스트 완료

## 9. 문제 해결

### 9.1 권한 오류
- Firestore Rules가 올바르게 배포되었는지 확인
- 사용자의 `role` 필드가 올바르게 설정되었는지 확인
- `parentId`와 `childId` 관계가 올바르게 설정되었는지 확인

### 9.2 인덱스 오류
- Firestore Console에서 누락된 인덱스를 확인하고 생성
- 쿼리 로그를 확인하여 필요한 인덱스 파악

### 9.3 Cloud Function 오류
- Functions 로그 확인: `firebase functions:log`
- 함수가 올바르게 배포되었는지 확인
- 함수 권한이 올바르게 설정되었는지 확인

