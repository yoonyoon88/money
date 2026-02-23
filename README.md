# 채이 - 아이 용돈 미션 관리 웹앱

아이들이 부모가 정한 미션을 수행하고, 사진과 메모를 제출하면 부모가 승인 후 포인트(용돈)가 적립되는 앱입니다.

## 기술 스택

- **React 18** + **TypeScript**
- **Vite** - 빌드 도구
- **React Router** - 라우팅
- **Tailwind CSS** - 스타일링
- **Context API** - 상태 관리
- **Firebase** - 백엔드 서비스
  - **Firestore** - 데이터베이스
  - **Storage** - 이미지 저장
  - **Cloud Functions** - 포인트 적립 처리
  - **Authentication** - 사용자 인증

## 프로젝트 구조

```
src/
├── components/          # 컴포넌트
│   ├── Home.tsx         # 아이 메인 화면
│   ├── MissionCard.tsx  # 미션 카드 컴포넌트
│   ├── MissionDetail.tsx # 미션 상세/제출 화면
│   └── Approval.tsx     # 부모 승인 화면
├── context/
│   └── AppContext.tsx   # 전역 상태 관리
├── data/
│   └── mockData.ts      # Mock 데이터
├── types/
│   └── index.ts         # TypeScript 타입 정의
├── App.tsx              # 메인 App 컴포넌트
├── main.tsx             # 진입점
└── index.css            # 전역 스타일
```

## 주요 기능

### 1. 아이 메인 화면 (Home)
- 사용자 인사 및 누적 포인트 표시
- 오늘의 할 일 목록
- 미션 필터링 (전체/완료/미완료)
- 미션 카드 형태로 표시
  - 상태 아이콘 (완료: 초록 체크, 미완료: 빨간 X)
  - 미션 제목, 기한, 보상 포인트

### 2. 미션 상세 화면 (MissionDetail)
- 미션 정보 및 보상 포인트 표시
- 사진 업로드 (모바일 카메라 접근 가능)
- 메모 입력
- 제출하기 버튼

### 3. 부모 승인 화면 (Approval)
- 제출된 미션 목록
- 사진 미리보기
- 아이가 작성한 메모 확인
- 승인/반려 버튼

## 상태 모델

```typescript
Mission {
  id: string
  title: string
  description: string
  rewardPoint: number
  dueDate: string (ISO date string)
  status: 'TODO' | 'SUBMITTED' | 'APPROVED'
  imageUrl?: string
  memo?: string
}

User {
  name: string
  totalPoint: number
}
```

## 설치 및 실행

```bash
# 의존성 설치
npm install

# Firebase 설정
# 1. .env 파일 생성 (프로젝트 루트에)
# 2. Firebase 콘솔에서 프로젝트 설정 복사하여 .env에 입력
# 예시:
# VITE_FIREBASE_API_KEY=your-api-key
# VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
# VITE_FIREBASE_PROJECT_ID=your-project-id
# VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
# VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
# VITE_FIREBASE_APP_ID=your-app-id

# 개발 서버 실행
npm run dev

# 빌드
npm run build

# 빌드 미리보기
npm run preview
```

## Firebase 설정

### 1. Firebase 프로젝트 생성
1. [Firebase Console](https://console.firebase.google.com/)에서 프로젝트 생성
2. Authentication 활성화 (이메일/비밀번호)
3. Firestore Database 생성
4. Storage 활성화
5. Functions 활성화

### 2. 환경 변수 설정
프로젝트 루트에 `.env` 파일을 생성하고 Firebase 설정을 입력하세요.

### 3. Firestore 인덱스 생성
다음 인덱스가 필요합니다:
- `missions` 컬렉션:
  - `childId` (Ascending) + `createdAt` (Descending)
  - `status` (Ascending) + `submittedAt` (Descending)
  - `parentId` (Ascending) + `status` (Ascending)

### 4. Cloud Functions 배포
```bash
cd functions
npm install
firebase deploy --only functions
```

### 5. 보안 규칙 설정
Firestore 및 Storage 보안 규칙은 `src/firebase/README.md`를 참고하세요.

## 상태 흐름

1. **미션 제출**
   - 아이가 미션 상세 화면에서 사진과 메모를 입력하고 제출
   - `submitMission` 함수 호출 → 미션 상태가 `SUBMITTED`로 변경

2. **부모 승인**
   - 부모 승인 화면에서 제출된 미션 확인
   - `approveMission` 함수 호출 → 미션 상태가 `APPROVED`로 변경, 포인트 적립

3. **부모 반려**
   - `rejectMission` 함수 호출 → 미션 상태가 `TODO`로 변경, 제출 데이터 초기화

## 모바일 카메라 업로드

`MissionDetail` 컴포넌트에서 다음과 같이 구현되어 있습니다:

```tsx
<input
  type="file"
  accept="image/*"
  capture="environment"
  onChange={handleImageChange}
/>
```

- `accept="image/*"`: 이미지 파일만 선택 가능
- `capture="environment"`: 모바일에서 카메라 직접 접근 가능

## Firebase 연동 완료

- ✅ Firestore 기반 데이터 저장
- ✅ 실시간 데이터 동기화
- ✅ Firebase Storage 이미지 업로드
- ✅ Cloud Functions 포인트 적립
- ✅ 부모/아이 권한 분리

## 향후 개선 사항

- 푸시 알림
- 미션 히스토리
- 통계 및 차트
- 다중 자녀 지원 강화

