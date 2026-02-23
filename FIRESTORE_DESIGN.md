# Firestore 컬렉션 구조 설계

부모-자녀 미션/용돈 앱을 위한 Firestore 데이터베이스 구조 설계 문서입니다.

## 목차
1. [컬렉션 개요](#컬렉션-개요)
2. [users 컬렉션](#users-컬렉션)
3. [children 컬렉션](#children-컬렉션)
4. [missions 컬렉션](#missions-컬렉션)
5. [관계 및 제약사항](#관계-및-제약사항)
6. [AppContext 매핑](#appcontext-매핑)
7. [보안 규칙 고려사항](#보안-규칙-고려사항)

---

## 컬렉션 개요

### 컬렉션 목록
1. **users**: 모든 사용자 (부모 + 아이)
2. **children**: 부모-자녀 관계 정보 (선택적, 관계 관리용)
3. **missions**: 미션 데이터

### 관계도
```
users (부모)
  └─ childrenIds: [childId1, childId2, ...]
      └─ users (아이)
          └─ parentId: parentId
              └─ missions
                  ├─ parentId: parentId (생성자)
                  └─ childId: childId (수행자)
```

---

## users 컬렉션

### 문서 ID
- Firebase Auth의 `uid` 사용
- 예: `users/{auth.uid}`

### 문서 구조

```typescript
{
  // ===== 필수 필드 =====
  id: string;                    // 문서 ID (uid와 동일)
  name: string;                  // 사용자 이름
  role: 'PARENT' | 'CHILD';     // 역할 (필수)
  totalPoint: number;            // 누적 포인트 (초기값: 0)
  createdAt: Timestamp;          // 생성 시각
  updatedAt: Timestamp;          // 최종 수정 시각
  
  // ===== 부모 전용 필드 =====
  childrenIds?: string[];        // 자녀 ID 배열 (부모만)
  email?: string;                // 이메일 (선택)
  
  // ===== 아이 전용 필드 =====
  parentId?: string;             // 부모 ID (아이만)
}
```

### 필드 상세

#### 필수 필드
| 필드 | 타입 | 설명 | 제약사항 |
|------|------|------|----------|
| `id` | `string` | 문서 ID (uid) | Firebase Auth uid와 동일 |
| `name` | `string` | 사용자 이름 | 빈 문자열 불가 |
| `role` | `'PARENT' \| 'CHILD'` | 역할 | 반드시 둘 중 하나 |
| `totalPoint` | `number` | 누적 포인트 | 초기값: 0, 음수 불가 |
| `createdAt` | `Timestamp` | 생성 시각 | 서버 타임스탬프 |
| `updatedAt` | `Timestamp` | 최종 수정 시각 | 서버 타임스탬프 |

#### 부모 전용 필드
| 필드 | 타입 | 설명 | 제약사항 |
|------|------|------|----------|
| `childrenIds` | `string[]` | 자녀 ID 배열 | `role === 'PARENT'`일 때만 존재 |
| `email` | `string?` | 이메일 | 선택적 |

#### 아이 전용 필드
| 필드 | 타입 | 설명 | 제약사항 |
|------|------|------|----------|
| `parentId` | `string?` | 부모 ID | `role === 'CHILD'`일 때만 존재 |

### 예시

#### 부모 사용자
```json
{
  "id": "parent_uid_123",
  "name": "김부모",
  "role": "PARENT",
  "totalPoint": 0,
  "childrenIds": ["child_uid_456", "child_uid_789"],
  "email": "parent@example.com",
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

#### 아이 사용자
```json
{
  "id": "child_uid_456",
  "name": "김아이",
  "role": "CHILD",
  "totalPoint": 1500,
  "parentId": "parent_uid_123",
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

---

## children 컬렉션

### 문서 ID
- 자동 생성 ID 또는 `{parentId}_{childId}` 형태
- 예: `children/{parentId}_{childId}` 또는 `children/{autoId}`

### 문서 구조

```typescript
{
  // ===== 필수 필드 =====
  id: string;                    // 문서 ID
  parentId: string;               // 부모 ID (users 컬렉션 참조)
  childId: string;                // 자녀 ID (users 컬렉션 참조)
  createdAt: Timestamp;           // 생성 시각
  
  // ===== 옵션 필드 =====
  nickname?: string;              // 부모가 설정한 자녀 별명
  notes?: string;                 // 부모 메모
}
```

### 필드 상세

#### 필수 필드
| 필드 | 타입 | 설명 | 제약사항 |
|------|------|------|----------|
| `id` | `string` | 문서 ID | 고유값 |
| `parentId` | `string` | 부모 ID | `users/{parentId}` 존재해야 함 |
| `childId` | `string` | 자녀 ID | `users/{childId}` 존재해야 함, `role === 'CHILD'` |
| `createdAt` | `Timestamp` | 생성 시각 | 서버 타임스탬프 |

#### 옵션 필드
| 필드 | 타입 | 설명 |
|------|------|------|
| `nickname` | `string?` | 부모가 설정한 자녀 별명 |
| `notes` | `string?` | 부모 메모 |

### 용도
- **선택적 컬렉션**: 부모-자녀 관계를 별도로 관리하고 싶을 때 사용
- **대안**: `users` 컬렉션의 `childrenIds`와 `parentId`로도 관계 관리 가능
- **권장**: 간단한 구조에서는 `children` 컬렉션 생략 가능

### 예시
```json
{
  "id": "parent_123_child_456",
  "parentId": "parent_uid_123",
  "childId": "child_uid_456",
  "nickname": "첫째",
  "notes": "매일 숙제 확인 필요",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

---

## missions 컬렉션

### 문서 ID
- 자동 생성 ID
- 예: `missions/{autoId}`

### 문서 구조

```typescript
{
  // ===== 필수 필드 =====
  id: string;                     // 문서 ID
  title: string;                   // 미션 제목
  description: string;             // 미션 설명
  rewardPoint: number;            // 보상 포인트
  dueDate: Timestamp;             // 마감일
  status: 'TODO' | 'SUBMITTED' | 'APPROVED';  // 상태
  missionType: 'DAILY' | 'WEEKLY'; // 미션 타입
  childId: string;                 // 수행할 아이 ID (users 참조)
  parentId: string;               // 생성한 부모 ID (users 참조)
  createdAt: Timestamp;           // 생성 시각
  
  // ===== 제출 시 필드 =====
  imageUrl?: string;              // 제출 이미지 URL (Storage)
  memo?: string;                  // 아이 메모
  submittedAt?: Timestamp;        // 제출 시각
  
  // ===== 승인 시 필드 =====
  approvedAt?: Timestamp;         // 승인 시각
  parentMemo?: string;            // 부모 메모 (선택)
}
```

### 필드 상세

#### 필수 필드
| 필드 | 타입 | 설명 | 제약사항 |
|------|------|------|----------|
| `id` | `string` | 문서 ID | 고유값 |
| `title` | `string` | 미션 제목 | 빈 문자열 불가 |
| `description` | `string` | 미션 설명 | 빈 문자열 불가 |
| `rewardPoint` | `number` | 보상 포인트 | 양수만 가능 |
| `dueDate` | `Timestamp` | 마감일 | 미래 날짜 가능 |
| `status` | `'TODO' \| 'SUBMITTED' \| 'APPROVED'` | 상태 | 초기값: 'TODO' |
| `missionType` | `'DAILY' \| 'WEEKLY'` | 미션 타입 | 일일/주간 구분 |
| `childId` | `string` | 수행할 아이 ID | `users/{childId}` 존재, `role === 'CHILD'` |
| `parentId` | `string` | 생성한 부모 ID | `users/{parentId}` 존재, `role === 'PARENT'` |
| `createdAt` | `Timestamp` | 생성 시각 | 서버 타임스탬프 |

#### 제출 시 필드 (status === 'SUBMITTED')
| 필드 | 타입 | 설명 | 제약사항 |
|------|------|------|----------|
| `imageUrl` | `string?` | 제출 이미지 URL | Firebase Storage URL |
| `memo` | `string?` | 아이 메모 | 선택적 |
| `submittedAt` | `Timestamp?` | 제출 시각 | 서버 타임스탬프 |

#### 승인 시 필드 (status === 'APPROVED')
| 필드 | 타입 | 설명 | 제약사항 |
|------|------|------|----------|
| `approvedAt` | `Timestamp?` | 승인 시각 | 서버 타임스탬프 |
| `parentMemo` | `string?` | 부모 메모 | 선택적 |

### 상태 전이
```
TODO (생성)
  ↓ (아이 제출)
SUBMITTED (제출)
  ↓ (부모 승인)        ↓ (부모 반려)
APPROVED (완료)       TODO (재시도)
```

### 예시

#### 생성 시 (TODO)
```json
{
  "id": "mission_001",
  "title": "숙제하기",
  "description": "오늘 수학 숙제 10페이지 완료하기",
  "rewardPoint": 300,
  "dueDate": "2024-01-15T18:00:00Z",
  "status": "TODO",
  "missionType": "DAILY",
  "childId": "child_uid_456",
  "parentId": "parent_uid_123",
  "createdAt": "2024-01-15T09:00:00Z"
}
```

#### 제출 시 (SUBMITTED)
```json
{
  "id": "mission_001",
  "title": "숙제하기",
  "description": "오늘 수학 숙제 10페이지 완료하기",
  "rewardPoint": 300,
  "dueDate": "2024-01-15T18:00:00Z",
  "status": "SUBMITTED",
  "missionType": "DAILY",
  "childId": "child_uid_456",
  "parentId": "parent_uid_123",
  "createdAt": "2024-01-15T09:00:00Z",
  "imageUrl": "https://storage.googleapis.com/.../mission_001/image.jpg",
  "memo": "10페이지 모두 완료했습니다!",
  "submittedAt": "2024-01-15T17:30:00Z"
}
```

#### 승인 시 (APPROVED)
```json
{
  "id": "mission_001",
  "title": "숙제하기",
  "description": "오늘 수학 숙제 10페이지 완료하기",
  "rewardPoint": 300,
  "dueDate": "2024-01-15T18:00:00Z",
  "status": "APPROVED",
  "missionType": "DAILY",
  "childId": "child_uid_456",
  "parentId": "parent_uid_123",
  "createdAt": "2024-01-15T09:00:00Z",
  "imageUrl": "https://storage.googleapis.com/.../mission_001/image.jpg",
  "memo": "10페이지 모두 완료했습니다!",
  "submittedAt": "2024-01-15T17:30:00Z",
  "approvedAt": "2024-01-15T18:15:00Z",
  "parentMemo": "잘했어요!"
}
```

---

## 관계 및 제약사항

### 1. 부모-자녀 관계

#### 관계 설정 방법
- **방법 1**: `users` 컬렉션만 사용
  - 부모: `users/{parentId}.childrenIds = [childId1, childId2, ...]`
  - 아이: `users/{childId}.parentId = parentId`
  
- **방법 2**: `children` 컬렉션 추가 사용
  - `children` 컬렉션에 관계 문서 생성
  - `users` 컬렉션의 필드와 중복 관리

#### 제약사항
- 부모의 `childrenIds`에 포함된 아이만 미션 생성 가능
- 아이의 `parentId`는 반드시 존재하는 부모 ID여야 함
- 부모와 아이는 서로 다른 `role`을 가져야 함

### 2. 미션 관계

#### 제약사항
- `missions.parentId`는 반드시 `role === 'PARENT'`인 사용자여야 함
- `missions.childId`는 반드시 `role === 'CHILD'`인 사용자여야 함
- `missions.parentId`는 `users/{parentId}.childrenIds`에 `childId`가 포함되어야 함
- 미션 생성은 부모만 가능 (`parentId === auth.uid`)
- 미션 제출은 해당 아이만 가능 (`childId === auth.uid`)
- 미션 승인/반려는 해당 부모만 가능 (`parentId === auth.uid`)

### 3. 포인트 관리

#### 제약사항
- `users.totalPoint`는 클라이언트에서 직접 수정 불가
- 포인트 증가는 Cloud Function에서만 처리
- 승인 시에만 포인트 증가 (`status: 'SUBMITTED' → 'APPROVED'`)
- 포인트는 음수가 될 수 없음

---

## AppContext 매핑

### User 타입 매핑

#### AppContext → Firestore
```typescript
// AppContext
interface User {
  id: string;
  name: string;
  totalPoint: number;
  role: 'PARENT' | 'CHILD';
  email?: string;
  createdAt?: string;      // ISO string
  updatedAt?: string;       // ISO string
  childrenIds?: string[];   // 부모만
  parentId?: string;        // 아이만
}

// Firestore users/{uid}
{
  id: string;              // 동일
  name: string;           // 동일
  totalPoint: number;      // 동일
  role: 'PARENT' | 'CHILD'; // 동일
  email?: string;         // 동일
  createdAt: Timestamp;   // Timestamp → ISO string 변환
  updatedAt: Timestamp;   // Timestamp → ISO string 변환
  childrenIds?: string[]; // 동일
  parentId?: string;      // 동일
}
```

#### 변환 로직
- `Timestamp` → `ISO string`: `timestamp.toDate().toISOString()`
- `ISO string` → `Timestamp`: `Timestamp.fromDate(new Date(isoString))`

### Mission 타입 매핑

#### AppContext → Firestore
```typescript
// AppContext
interface Mission {
  id: string;
  title: string;
  description: string;
  rewardPoint: number;
  dueDate: string;        // ISO string
  status: 'TODO' | 'SUBMITTED' | 'APPROVED';
  missionType: 'DAILY' | 'WEEKLY';
  imageUrl?: string;
  memo?: string;
  childId: string;
  parentId: string;
  createdAt?: string;     // ISO string
  submittedAt?: string;    // ISO string
  approvedAt?: string;     // ISO string
  parentMemo?: string;
}

// Firestore missions/{missionId}
{
  id: string;              // 동일
  title: string;           // 동일
  description: string;     // 동일
  rewardPoint: number;     // 동일
  dueDate: Timestamp;      // Timestamp → ISO string 변환
  status: 'TODO' | 'SUBMITTED' | 'APPROVED'; // 동일
  missionType: 'DAILY' | 'WEEKLY'; // 동일
  imageUrl?: string;       // 동일
  memo?: string;          // 동일
  childId: string;        // 동일
  parentId: string;       // 동일
  createdAt: Timestamp;   // Timestamp → ISO string 변환
  submittedAt?: Timestamp; // Timestamp → ISO string 변환
  approvedAt?: Timestamp; // Timestamp → ISO string 변환
  parentMemo?: string;    // 동일
}
```

### 상태 관리 흐름

#### 1. 사용자 정보 구독
```typescript
// AppContext
subscribeUser(firebaseUser.uid, (userData) => {
  setUser(userData); // Firestore users/{uid} → User 타입 변환
});
```

#### 2. 미션 목록 구독
```typescript
// AppContext
// 아이인 경우
subscribeChildMissions(user.id, (missionsData) => {
  setMissions(missionsData); // Firestore missions → Mission[] 변환
});

// 부모인 경우 (선택된 자녀)
subscribeParentChildMissions(selectedChildId, (missionsData) => {
  setMissions(missionsData);
});
```

#### 3. 미션 생성
```typescript
// AppContext
createMission(title, rewardPoint, dueDate, ...)
  → createMissionInFirebase(...)
    → Firestore missions 컬렉션에 문서 추가
      → 실시간 구독으로 missions 상태 자동 업데이트
```

#### 4. 미션 제출
```typescript
// AppContext
submitMission(missionId, imageUrl, memo, imageFile)
  → uploadMissionImage(...) // Storage 업로드
  → updateMissionSubmission(...)
    → Firestore missions/{missionId} 업데이트
      → 실시간 구독으로 missions 상태 자동 업데이트
```

#### 5. 미션 승인
```typescript
// AppContext
approveMission(missionId)
  → approveMissionWithPoints({ missionId }) // Cloud Function
    → users/{childId}.totalPoint 증가 (트랜잭션)
  → approveMissionInFirebase(missionId)
    → Firestore missions/{missionId} 업데이트
      → 실시간 구독으로 user.totalPoint와 missions 상태 자동 업데이트
```

---

## 보안 규칙 고려사항

### 1. users 컬렉션

#### 읽기 권한
- 자신의 문서만 읽기 가능: `request.auth.uid == userId`

#### 쓰기 권한
- 생성: 인증된 사용자만 자신의 문서 생성 가능
- 업데이트: 자신의 문서만 업데이트 가능
- **제한**: `totalPoint`는 클라이언트에서 직접 수정 불가 (Cloud Function에서만)

### 2. missions 컬렉션

#### 읽기 권한
- 아이: `resource.data.childId == request.auth.uid`
- 부모: `resource.data.parentId == request.auth.uid`

#### 쓰기 권한
- 생성: 부모만 가능, `request.resource.data.parentId == request.auth.uid`
- 업데이트:
  - 아이: 제출만 가능 (`status: 'TODO' → 'SUBMITTED'`)
  - 부모: 승인/반려만 가능 (`status: 'SUBMITTED' → 'APPROVED'/'TODO'`)

### 3. children 컬렉션 (선택적)

#### 읽기 권한
- 부모: `resource.data.parentId == request.auth.uid`
- 아이: `resource.data.childId == request.auth.uid`

#### 쓰기 권한
- 생성: 부모만 가능, `request.resource.data.parentId == request.auth.uid`
- 업데이트: 부모만 가능, `resource.data.parentId == request.auth.uid`

### 4. Storage (이미지)

#### 읽기 권한
- 인증된 사용자만 읽기 가능

#### 쓰기 권한
- 인증된 사용자만 업로드 가능
- 파일 크기 제한: 5MB
- 파일 타입 제한: 이미지만

---

## 인덱스 요구사항

### missions 컬렉션
1. `childId` (Ascending) + `createdAt` (Descending)
   - 용도: 아이의 미션 목록 조회 (최신순)
   
2. `childId` (Ascending) + `status` (Ascending) + `createdAt` (Descending)
   - 용도: 아이의 특정 상태 미션 조회
   
3. `parentId` (Ascending) + `status` (Ascending) + `submittedAt` (Descending)
   - 용도: 부모의 승인 대기 미션 조회
   
4. `status` (Ascending) + `submittedAt` (Descending)
   - 용도: 전체 승인 대기 미션 조회 (부모용)

### users 컬렉션
1. `parentId` (Ascending)
   - 용도: 특정 부모의 자녀 조회 (아이용)
   
2. `role` (Ascending)
   - 용도: 역할별 사용자 조회 (관리용)

---

## 요약

### 컬렉션 구조
- **users**: 모든 사용자 (부모 + 아이)
- **children**: 부모-자녀 관계 (선택적)
- **missions**: 미션 데이터

### 핵심 관계
- 부모 ↔ 자녀: `users.parentId` / `users.childrenIds`
- 부모 → 미션: `missions.parentId`
- 아이 → 미션: `missions.childId`

### 보안 원칙
- 자신의 데이터만 읽기/쓰기 가능
- 역할 기반 접근 제어
- 포인트는 서버에서만 수정 가능

### AppContext 연동
- 실시간 구독으로 자동 상태 동기화
- Timestamp ↔ ISO string 변환
- 타입 안전성 보장

