# Firebase 연동 가이드

이 문서는 Firebase 연동을 위한 데이터 구조와 구현 가이드를 제공합니다.

## Firebase 데이터베이스 구조

### Firestore Collections

#### 1. `users` 컬렉션
사용자 정보를 저장합니다.

```typescript
users/{userId}
{
  id: string,              // 문서 ID
  name: string,
  totalPoint: number,
  role: 'PARENT' | 'CHILD',
  email?: string,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  // 부모인 경우
  childrenIds?: string[],  // 자녀들의 ID 배열
  // 아이인 경우
  parentId?: string       // 부모의 ID
}
```

**인덱스 필요:**
- `parentId` (아이 조회용)
- `role` (역할별 조회용)

#### 2. `missions` 컬렉션
미션 정보를 저장합니다.

```typescript
missions/{missionId}
{
  id: string,                    // 문서 ID
  title: string,
  description: string,
  rewardPoint: number,
  dueDate: Timestamp,
  status: 'TODO' | 'SUBMITTED' | 'APPROVED',
  missionType: 'DAILY' | 'WEEKLY',
  imageUrl?: string,              // Firebase Storage URL
  memo?: string,
  childId: string,                // 미션을 받은 아이의 ID
  parentId: string,               // 미션을 준 부모의 ID
  createdAt: Timestamp,
  submittedAt?: Timestamp,
  approvedAt?: Timestamp
}
```

**인덱스 필요:**
- `childId` + `status` (아이의 미션 조회용)
- `childId` + `createdAt` (정렬용)
- `parentId` + `status` (부모의 미션 조회용)
- `status` = 'SUBMITTED' (승인 대기 미션 조회용)

### Firebase Storage 구조

```
missions/
  {missionId}/
    {timestamp}.jpg  (또는 다른 이미지 형식)
```

## 구현 단계

### 1. Firebase 초기화
- `firebase/config.ts` 파일 생성
- Firebase 프로젝트 설정
- Auth, Firestore, Storage 초기화

### 2. 인증 (Authentication)
- 이메일/비밀번호 로그인
- 부모/아이 역할 구분
- 현재 사용자 정보 관리

### 3. 데이터 로드
- `AppContext`의 `useEffect`에서 실시간 구독 설정
- `onSnapshot`을 사용하여 실시간 업데이트

### 4. 이미지 업로드
- `submitMission`에서 Firebase Storage에 이미지 업로드
- 업로드된 URL을 Firestore에 저장

### 5. 트랜잭션 처리
- `approveMission`에서 Batch Write 사용
- 미션 상태 업데이트 + 포인트 적립을 원자적으로 처리

## 주요 함수 구현 위치

모든 Firebase 연동 코드는 `src/context/AppContext.tsx`의 TODO 주석 위치에 구현하면 됩니다.

### 필요한 Firebase 함수들:
- `getDoc`, `getDocs` - 데이터 읽기
- `setDoc`, `updateDoc` - 데이터 쓰기/업데이트
- `addDoc` - 새 문서 추가
- `deleteDoc` - 문서 삭제
- `onSnapshot` - 실시간 구독
- `writeBatch` - 배치 쓰기
- `serverTimestamp` - 서버 타임스탬프
- `increment` - 숫자 증가
- `query`, `where`, `orderBy` - 쿼리
- `uploadBytes`, `getDownloadURL` - Storage 업로드

## 보안 규칙 (Firestore Rules)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users 컬렉션
    match /users/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Missions 컬렉션
    match /missions/{missionId} {
      allow read: if request.auth != null && (
        resource.data.childId == request.auth.uid ||
        resource.data.parentId == request.auth.uid
      );
      allow create: if request.auth != null && 
        request.resource.data.parentId == request.auth.uid;
      allow update: if request.auth != null && (
        resource.data.childId == request.auth.uid || // 아이는 제출만 가능
        resource.data.parentId == request.auth.uid   // 부모는 승인/반려만 가능
      );
    }
  }
}
```

## Storage 보안 규칙

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /missions/{missionId}/{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        request.resource.size < 5 * 1024 * 1024; // 5MB 제한
    }
  }
}
```

