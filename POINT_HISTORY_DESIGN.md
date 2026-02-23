# 포인트 내역 시스템 설계 문서

## 1. Firestore 데이터 구조

### 컬렉션: `pointHistory`

```typescript
interface PointHistoryDocument {
  id: string;                    // 자동 생성
  childId: string;                // 필수: 자녀 ID
  parentId: string;               // 필수: 부모 ID
  type: "earn" | "use";           // 필수: 적립 / 사용
  amount: number;                 // 필수: +100, -200 등
  balanceAfter: number;          // 필수: 이 내역 이후 남은 포인트
  reason: string;                 // 필수: 사유 ("미션 완료", "소원 사용")
  rewardTitle?: string;           // 선택: 보상/소원 이름 (사용일 때 필수)
  missionId?: string;             // 선택: 관련 미션 ID (적립일 때)
  createdAt: Timestamp;           // 필수: serverTimestamp()
}
```

### 필드별 상세

| 필드 | 타입 | 필수 | 설명 | 예시 |
|------|------|------|------|------|
| childId | string | ✅ | 자녀 사용자 ID | "child123" |
| parentId | string | ✅ | 부모 사용자 ID | "parent456" |
| type | "earn" \| "use" | ✅ | 적립/사용 구분 | "earn" |
| amount | number | ✅ | 포인트 증감량 | +100, -200 |
| balanceAfter | number | ✅ | 거래 후 잔액 | 500 |
| reason | string | ✅ | 사유 텍스트 | "미션 완료" |
| rewardTitle | string | ❌ | 보상/소원 이름 | "로블록스" |
| missionId | string | ❌ | 관련 미션 ID | "mission789" |
| createdAt | Timestamp | ✅ | 생성 시각 | serverTimestamp() |

---

## 2. 포인트 적립 로직

### 흐름 다이어그램

```
[부모가 미션 승인]
    ↓
approveMission(missionId, approvedBy)
    ↓
[트랜잭션 시작]
    ├─ 미션 문서 읽기 (status, rewardPoint, childId, title)
    ├─ 사용자 문서 읽기 (totalPoint)
    ├─ 미션 상태 → APPROVED 업데이트
    └─ 사용자 totalPoint 증가
[트랜잭션 완료]
    ↓
[트랜잭션 외부]
    ├─ 새로운 totalPoint 계산
    ├─ addPointHistory 호출
    │   ├─ type: "earn"
    │   ├─ amount: +rewardPoint
    │   ├─ balanceAfter: newTotalPoint
    │   ├─ reason: "미션 완료"
    │   ├─ missionId: missionId
    │   ├─ parentId: approvedBy
    │   └─ rewardTitle: null
    └─ 이력 저장 완료
```

### 구현 위치

**파일**: `src/firebase/missions.ts` - `approveMission` 함수

```typescript
// 트랜잭션 완료 후
const newTotalPoint = currentPoints + missionData.rewardPoint;

await addPointHistory(
  missionData.childId,
  'earn',
  missionData.rewardPoint,        // amount: +100
  '미션 완료',                     // reason
  'parent',                       // createdBy
  missionData.title,              // rewardTitle: null (적립 시)
  missionData.parentId,            // parentId 추가 필요
  missionId,                       // missionId 추가 필요
  newTotalPoint                    // balanceAfter 추가 필요
);
```

---

## 3. 포인트 사용 로직

### 흐름 다이어그램

```
[부모 화면 - 사용하기 버튼 클릭]
    ↓
[포인트 사용 팝업 표시]
    ├─ 현재 포인트 표시
    ├─ 소원/보상 선택
    └─ 사용할 포인트 입력
    ↓
[확인 버튼 클릭]
    ↓
deductChildPoint(childId, amount)
    ├─ 현재 포인트 조회
    ├─ 포인트 차감
    └─ 새로운 totalPoint 계산
    ↓
addPointHistory 호출
    ├─ type: "use"
    ├─ amount: -deductAmount
    ├─ balanceAfter: newTotalPoint
    ├─ reason: "소원 사용" 또는 사용 사유
    ├─ rewardTitle: 선택한 소원/보상 이름 (필수)
    ├─ parentId: user.id
    └─ missionId: null
    ↓
[팝업 닫기 + 포인트 갱신]
```

### 구현 위치

**파일**: `src/components/ChildManagement.tsx` - 포인트 사용 모달

```typescript
// 포인트 차감 후
const childUser = await getUser(childId);
const newTotalPoint = childUser.totalPoint || 0;

await addPointHistory(
  childId,
  'use',
  -deductAmount,                   // amount: -200
  useReason.trim() || '소원 사용',  // reason
  'parent',                        // createdBy
  rewardTextRaw,                   // rewardTitle: "로블록스" (필수)
  user.id,                         // parentId 추가 필요
  undefined,                       // missionId: null
  newTotalPoint                    // balanceAfter 추가 필요
);
```

---

## 4. 포인트 내역 조회 로직

### Firestore 쿼리

```typescript
// src/firebase/pointHistory.ts

const q = query(
  collection(db, 'pointHistory'),
  where('childId', '==', childId),
  orderBy('createdAt', 'desc')  // 최신순
);
```

### 탭별 필터링 (프론트엔드)

```typescript
// src/components/PointHistory.tsx

const filteredHistory = useMemo(() => {
  if (activeTab === 'ALL') {
    return pointHistory;  // 모든 내역
  } else if (activeTab === 'EARN') {
    return pointHistory.filter(item => item.type === 'earn');
  } else if (activeTab === 'USE') {
    return pointHistory.filter(item => item.type === 'use');
  }
  return [];
}, [pointHistory, activeTab]);
```

### Firestore 인덱스 필요성

**현재 쿼리**: `childId == X && orderBy createdAt desc`

이 쿼리는 **복합 인덱스가 필요 없습니다** (단일 필드 필터 + 단일 필드 정렬).

만약 나중에 `parentId`로도 필터링한다면:
```typescript
where('parentId', '==', parentId),
where('childId', '==', childId),
orderBy('createdAt', 'desc')
```
이 경우 복합 인덱스 필요:
- Collection: `pointHistory`
- Fields: `parentId` (Ascending), `childId` (Ascending), `createdAt` (Descending)

---

## 5. 아이 화면 UI

### 화면 구조

```
┌─────────────────────────┐
│ ← 포인트 내역          │
├─────────────────────────┤
│ [요약 카드]             │
│ 지금 사용할 수 있는      │
│ 포인트예요              │
│ 389P                    │
├─────────────────────────┤
│ [전체] [적립] [사용]    │
├─────────────────────────┤
│ ➕ 방 청소 미션         │
│   2026.01.02           │
│              +100P      │
├─────────────────────────┤
│ ➖ 로블록스             │
│   2026.01.01           │
│              -200P      │
└─────────────────────────┘
```

### 리스트 항목 표시 정보

- **아이콘**: ➕ (적립), ➖ (사용)
- **사유 (reason)**: "미션 완료", "소원 사용"
- **보상명 (rewardTitle)**: 있을 경우만 표시
- **날짜**: YYYY.MM.DD 형식
- **금액**: +100P (초록), -200P (빨강)

### 진입 경로

**파일**: `src/components/ChildHome.tsx`

```typescript
// 포인트 숫자 클릭 시
<button onClick={() => navigate(`/points/history?childId=${childId}`)}>
  {displayPoint.toLocaleString()}P
</button>
```

---

## 6. 부모 화면 UI

### 포인트 내역 화면

- 아이 화면과 **동일한 리스트** 표시
- 진입: 포인트 숫자 클릭 → `/points/history?childId={childId}`

### 포인트 사용 팝업

**파일**: `src/components/ChildManagement.tsx`

- 포인트 숫자 클릭 ❌ (아무 동작 없음)
- **[사용하기] 버튼** 클릭 → 팝업 표시
- 팝업 구성:
  - 현재 포인트 표시
  - 소원/보상 선택
  - 사용할 포인트 입력
  - 사용 사유 입력 (선택)
  - 확인/취소 버튼

---

## 7. 정렬 및 UX 규칙

### 정렬 규칙

- **기본 정렬**: `createdAt DESC` (최신순)
- Firestore 쿼리에서 `orderBy('createdAt', 'desc')` 적용
- 프론트엔드에서 추가 정렬 불필요

### 빈 상태 메시지

```typescript
const emptyMessage = {
  ALL: "아직 포인트 내역이 없어요\n미션을 완료하거나 포인트를 사용하면 여기에 표시돼요.",
  EARN: "아직 적립된 포인트가 없어요",
  USE: "아직 포인트를 사용한 기록이 없어요"
};
```

---

## 8. 코드 수정 필요 사항

### 8.1 `src/firebase/pointHistory.ts`

**수정 필요**:
1. `PointHistory` 인터페이스에 필드 추가:
   - `parentId: string`
   - `balanceAfter: number`
   - `rewardTitle?: string` (기존 `rewardItem` → `rewardTitle`로 변경)
   - `missionId?: string`

2. `addPointHistory` 함수 시그니처 변경:
```typescript
export const addPointHistory = async (
  childId: string,
  type: PointHistoryType,
  amount: number,
  reason: string,
  createdBy?: PointHistoryCreatedBy,
  rewardTitle?: string,      // rewardItem → rewardTitle
  parentId?: string,         // 추가
  missionId?: string,        // 추가
  balanceAfter?: number     // 추가
): Promise<void>
```

3. `docToPointHistory` 함수 수정:
```typescript
return {
  id: docId,
  childId: docData.childId || '',
  parentId: docData.parentId || '',  // 추가
  type: (docData.type || 'use') as PointHistoryType,
  amount: docData.amount || 0,
  balanceAfter: docData.balanceAfter || 0,  // 추가
  reason: docData.reason || '',
  rewardTitle: docData.rewardTitle || docData.rewardItem || undefined,  // 변경
  missionId: docData.missionId || undefined,  // 추가
  createdAt: createdAt || new Date().toISOString(),
  createdBy: (docData.createdBy || 'parent') as PointHistoryCreatedBy,
};
```

### 8.2 `src/firebase/missions.ts`

**수정 필요**: `approveMission` 함수에서 이력 저장 시 필드 추가

```typescript
await addPointHistory(
  missionData.childId,
  'earn',
  missionData.rewardPoint,
  '미션 완료',
  'parent',
  undefined,                    // rewardTitle: null
  approvedBy,                   // parentId
  missionId,                    // missionId
  newTotalPoint                 // balanceAfter
);
```

### 8.3 `src/components/ChildManagement.tsx`

**수정 필요**: 포인트 사용 시 이력 저장 필드 추가

```typescript
await addPointHistory(
  childId,
  'use',
  -deductAmount,
  useReason.trim() || '소원 사용',
  'parent',
  rewardTextRaw,               // rewardTitle (필수)
  user.id,                     // parentId
  undefined,                   // missionId: null
  newTotalPoint                // balanceAfter
);
```

### 8.4 `src/components/PointHistory.tsx`

**수정 필요**: UI에 `rewardTitle` 표시 추가

```typescript
{item.rewardTitle && (
  <p className="text-sm text-gray-600">{item.rewardTitle}</p>
)}
```

---

## 9. 핵심 주의사항

### 9.1 트랜잭션과 이력 저장

- **포인트 적립**: 트랜잭션 내부에서 포인트 업데이트, 트랜잭션 외부에서 이력 저장
- **이유**: `pointHistory` 컬렉션은 별도이므로 트랜잭션에 포함할 필요 없음
- **주의**: 이력 저장 실패해도 포인트 적립은 성공해야 함 (에러 핸들링)

### 9.2 balanceAfter 계산

- **적립 시**: `currentPoints + rewardPoint`
- **사용 시**: `currentPoints - deductAmount`
- **중요**: 포인트 업데이트 **직후**의 값을 저장해야 함

### 9.3 parentId 필수

- 모든 이력에 `parentId` 필수 저장
- 부모가 승인/사용한 내역임을 명확히 기록

### 9.4 rewardTitle vs reason

- **reason**: "미션 완료", "소원 사용" (고정 문구)
- **rewardTitle**: "방 청소 미션", "로블록스" (구체적 이름)
- **사용 시**: `rewardTitle` 필수
- **적립 시**: `rewardTitle` null, `missionId`로 연결

---

## 10. 테스트 체크리스트

- [ ] 미션 승인 시 `pointHistory`에 `type: "earn"` 기록 생성
- [ ] 포인트 사용 시 `pointHistory`에 `type: "use"` 기록 생성
- [ ] 모든 이력에 `balanceAfter` 정확히 저장
- [ ] 모든 이력에 `parentId` 저장
- [ ] 적립 시 `missionId` 저장, `rewardTitle` null
- [ ] 사용 시 `rewardTitle` 저장, `missionId` null
- [ ] 포인트 내역 화면에서 탭별 필터링 정상 동작
- [ ] 최신순 정렬 정상 동작
- [ ] 빈 상태 메시지 탭별로 다르게 표시

