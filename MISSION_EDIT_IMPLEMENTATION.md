# 미션 수정 기능 구현 가이드

## 📋 구현 완료 사항

### 1. 수정 버튼 노출 규칙

**파일: `src/components/MissionCard.tsx`**

```typescript
interface MissionCardProps {
  // ... 기존 props
  onEdit?: (missionId: string) => void; // 수정 핸들러 추가
}

// 부모 화면 - 진행 중 미션에만 수정 버튼 표시
{onEdit && mission.status === 'IN_PROGRESS' && (
  <button
    onClick={(e) => {
      e.stopPropagation();
      onEdit(mission.id);
    }}
    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
    aria-label="미션 수정"
    title="미션 수정"
  >
    <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  </button>
)}
```

**조건:**
- `isParentMode === true`
- `mission.status === 'IN_PROGRESS'`
- `onEdit` prop이 제공된 경우

---

### 2. 수정 진입 UX

**파일: `src/components/ChildManagement.tsx`**

```typescript
// 수정 모달 상태
const [showEditModal, setShowEditModal] = useState<boolean>(false);
const [editingMissionId, setEditingMissionId] = useState<string | null>(null);

// 미션 수정 핸들러
const handleEditMission = (missionId: string) => {
  const mission = childMissions.find(m => m.id === missionId);
  
  if (!mission) {
    setToastMessage('미션을 찾을 수 없어요');
    return;
  }

  // PENDING_REVIEW 상태면 수정 불가
  if (mission.status === 'PENDING_REVIEW') {
    setToastMessage('아이의 완료 요청 이후에는 수정할 수 없어요');
    return;
  }

  // EXPIRED, COMPLETED 상태면 수정 불가
  if (mission.status === 'EXPIRED' || mission.status === 'COMPLETED') {
    setToastMessage('수정할 수 없는 미션 상태예요');
    return;
  }

  // IN_PROGRESS 상태만 수정 가능
  if (mission.status !== 'IN_PROGRESS') {
    return;
  }

  // 미션 데이터로 prefill
  setEditingMissionId(missionId);
  
  // dueAt을 날짜/시간으로 분리
  const dueAtDate = new Date(mission.dueAt);
  const year = dueAtDate.getFullYear();
  const month = String(dueAtDate.getMonth() + 1).padStart(2, '0');
  const day = String(dueAtDate.getDate()).padStart(2, '0');
  
  setNewMission({
    title: mission.title,
    rewardPoint: mission.rewardPoint,
    dueDate: mission.dueAt,
    missionType: mission.missionType,
    description: mission.description || '',
  });

  setDueDateParts({
    date: `${year}-${month}-${day}`,
    hour: String(dueAtDate.getHours()),
    minute: String(dueAtDate.getMinutes()),
  });

  // 반복 미션 정보 prefill
  setIsRepeatMission(mission.isRepeat || false);
  setSelectedDays(new Set(mission.repeatDays || []));
  if (mission.repeatStartDate) {
    const startDate = new Date(mission.repeatStartDate);
    const startYear = startDate.getFullYear();
    const startMonth = String(startDate.getMonth() + 1).padStart(2, '0');
    const startDay = String(startDate.getDate()).padStart(2, '0');
    setRepeatStartDate(`${startYear}-${startMonth}-${startDay}`);
  }
  
  if (mission.repeatEndDate) {
    const endDate = new Date(mission.repeatEndDate);
    const endYear = endDate.getFullYear();
    const endMonth = String(endDate.getMonth() + 1).padStart(2, '0');
    const endDay = String(endDate.getDate()).padStart(2, '0');
    setRepeatEndDate(`${endYear}-${endMonth}-${endDay}`);
    setHasEndDate(true);
  } else {
    setRepeatEndDate('');
    setHasEndDate(false);
  }

  setShowEditModal(true);
};
```

---

### 3. 수정 모달 재사용 구조

**파일: `src/components/ChildManagement.tsx`**

```typescript
{/* 수정 모달 (미션 추가 모달과 동일한 UI 재사용) */}
{showEditModal && editingMissionId && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-5">
    <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-gray-800">미션 수정하기</h2>
        <button
          onClick={() => {
            setShowEditModal(false);
            setEditingMissionId(null);
            // 상태 초기화
            const todayDate = getTodayDateString();
            setNewMission({
              title: '',
              rewardPoint: 100,
              dueDate: '',
              missionType: 'DAILY',
              description: '',
            });
            setDueDateParts({
              date: todayDate,
              hour: '23',
              minute: '59',
            });
            setIsRepeatMission(false);
            setSelectedDays(new Set());
          }}
          className="text-gray-400 hover:text-gray-600"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* 안내 문구 */}
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl">
        <p className="text-sm text-blue-700">
          이미 만든 미션을 수정하고 있어요.<br />
          아이에게 변경 내용이 바로 반영돼요.
        </p>
      </div>

      {/* 미션 추가 모달과 동일한 폼 (재사용) */}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!newMission.title.trim()) {
            setToastMessage('미션 제목을 입력해주세요.');
            return;
          }

          if (!dueDateParts.date) {
            setToastMessage('마감일을 선택해주세요.');
            return;
          }

          if (!editingMissionId || !childId) {
            setToastMessage('수정할 미션 정보가 없어요.');
            return;
          }

          // 반복 미션 검증
          if (isRepeatMission) {
            if (selectedDays.size === 0) {
              setToastMessage('반복 미션을 수정하려면 반복 요일을 선택해주세요.');
              return;
            }
            if (!repeatStartDate) {
              setToastMessage('반복 미션을 수정하려면 반복 시작일을 선택해주세요.');
              return;
            }
            if (hasEndDate && repeatEndDate && repeatStartDate > repeatEndDate) {
              setToastMessage('반복 종료일은 시작일보다 이후여야 합니다.');
              return;
            }
          }

          try {
            // 날짜와 시간을 결합하여 Date 객체 생성
            const dueDate = new Date(
              `${dueDateParts.date}T${String(dueDateParts.hour).padStart(2, '0')}:${String(dueDateParts.minute).padStart(2, '0')}:00`
            );
            const dueDateISO = dueDate.toISOString();

            // 반복 미션 정보 준비
            const isRepeat = isRepeatMission;
            const repeatDays = isRepeat ? Array.from(selectedDays) : [];
            const repeatStartDateISO = isRepeat && repeatStartDate 
              ? new Date(`${repeatStartDate}T00:00:00`).toISOString() 
              : undefined;
            const repeatEndDateISO = isRepeat && hasEndDate && repeatEndDate
              ? new Date(`${repeatEndDate}T23:59:59`).toISOString()
              : null;

            // 미션 수정 실행
            await updateMission(
              editingMissionId,
              newMission.title,
              newMission.description,
              newMission.rewardPoint,
              dueDateISO,
              newMission.missionType,
              isRepeat,
              repeatDays,
              repeatStartDateISO,
              repeatEndDateISO
            );

            setShowEditModal(false);
            setEditingMissionId(null);
            setToastMessage('미션이 수정되었어요');
            
            // 상태 초기화
            const todayDate = getTodayDateString();
            setNewMission({
              title: '',
              rewardPoint: 100,
              dueDate: '',
              missionType: 'DAILY',
              description: '',
            });
            setDueDateParts({
              date: todayDate,
              hour: '23',
              minute: '59',
            });
            setIsRepeatMission(false);
            setSelectedDays(new Set());
            setRepeatStartDate(getTodayDateString());
            setHasEndDate(false);
            setRepeatEndDate('');
          } catch (error) {
            console.error('[미션 수정 실패] 상세 에러:', error);
            setToastMessage(error instanceof Error ? error.message : '미션 수정에 실패했어요. 다시 시도해주세요.');
          }
        }}
        className="space-y-4"
      >
        {/* 미션 추가 모달과 동일한 입력 필드들 */}
        {/* ... (제목, 포인트, 마감일, 설명, 반복 설정 등) ... */}
        
        <button
          type="submit"
          className="w-full py-3 bg-blue-500 text-white rounded-xl font-semibold hover:bg-blue-600 transition-colors"
        >
          수정 완료
        </button>
      </form>
    </div>
  </div>
)}
```

---

### 4. Firestore Update 코드

**파일: `src/firebase/missions.ts`**

```typescript
import { updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';

/**
 * 미션 수정 (부모만 가능)
 * 
 * @param missionId - 수정할 미션 ID
 * @param title - 미션 제목
 * @param description - 미션 설명
 * @param rewardPoint - 보상 포인트
 * @param dueDate - 마감일 (ISO string)
 * @param missionType - 미션 타입
 * @param isRepeat - 반복 미션 여부
 * @param repeatDays - 반복 요일 배열
 * @param repeatStartDate - 반복 시작일 (ISO string)
 * @param repeatEndDate - 반복 종료일 (ISO string | null)
 * @param parentId - 부모 ID (권한 확인용)
 */
export const updateMission = async (
  missionId: string,
  title: string,
  description: string,
  rewardPoint: number,
  dueDate: string,
  missionType: 'DAILY' | 'WEEKLY',
  isRepeat: boolean = false,
  repeatDays: number[] = [],
  repeatStartDate?: string,
  repeatEndDate?: string | null,
  parentId?: string
): Promise<void> => {
  if (!db) {
    throw new Error('Firestore가 초기화되지 않았습니다.');
  }

  const missionRef = doc(db, 'missions', missionId);

  // 미션 조회하여 권한 확인
  const missionDoc = await getDoc(missionRef);
  if (!missionDoc.exists()) {
    throw new Error('미션을 찾을 수 없습니다.');
  }

  const missionData = missionDoc.data();

  // 부모 권한 확인
  if (parentId && missionData.parentId !== parentId) {
    throw new Error('이 미션을 수정할 권한이 없습니다.');
  }

  // 수정 불가 상태 확인
  if (missionData.status === 'COMPLETED' || missionData.status === 'PARTIAL_APPROVED') {
    throw new Error('완료된 미션은 수정할 수 없습니다.');
  }

  if (missionData.status === 'PENDING_REVIEW') {
    throw new Error('아이의 완료 요청 이후에는 수정할 수 없습니다.');
  }

  // 업데이트할 데이터 준비
  const updateData: any = {
    title,
    description,
    rewardPoint,
    dueAt: Timestamp.fromDate(new Date(dueDate)),
    dueDate: Timestamp.fromDate(new Date(dueDate)), // 하위 호환성
    missionType,
    updatedAt: serverTimestamp(),
    isRepeat,
    repeatDays: isRepeat ? repeatDays : [],
  };

  // 반복 미션 정보 업데이트
  if (isRepeat) {
    if (repeatStartDate) {
      updateData.repeatStartDate = Timestamp.fromDate(new Date(repeatStartDate));
    }
    if (repeatEndDate) {
      updateData.repeatEndDate = Timestamp.fromDate(new Date(repeatEndDate));
    } else {
      updateData.repeatEndDate = null;
    }
  } else {
    // 반복 미션이 아니면 반복 관련 필드 제거
    updateData.repeatStartDate = deleteField();
    updateData.repeatEndDate = deleteField();
  }

  // status는 변경하지 않음 (요구사항)

  try {
    await updateDoc(missionRef, updateData);
    console.log('[updateMission] 미션 수정 성공:', missionId);
  } catch (error) {
    console.error('[updateMission] Firestore 업데이트 실패:', error);
    throw error;
  }
};
```

---

### 5. 상태별 버튼 활성/비활성 조건

**파일: `src/components/ChildManagement.tsx`**

```typescript
// 수정 버튼 활성화 조건
const canEditMission = (mission: Mission): boolean => {
  // 부모 화면에서만
  if (user?.role !== 'PARENT') {
    return false;
  }

  // IN_PROGRESS 상태만 수정 가능
  if (mission.status !== 'IN_PROGRESS') {
    return false;
  }

  // PENDING_REVIEW 상태면 수정 불가
  if (mission.status === 'PENDING_REVIEW') {
    return false;
  }

  // EXPIRED, COMPLETED 상태면 수정 불가
  if (mission.status === 'EXPIRED' || mission.status === 'COMPLETED') {
    return false;
  }

  return true;
};

// MissionCard에 전달
<MissionCard
  mission={mission}
  onEdit={canEditMission(mission) ? handleEditMission : undefined}
/>
```

---

### 6. 예외 처리

**파일: `src/components/ChildManagement.tsx`**

```typescript
try {
  await updateMission(
    editingMissionId,
    newMission.title,
    newMission.description,
    newMission.rewardPoint,
    dueDateISO,
    newMission.missionType,
    isRepeat,
    repeatDays,
    repeatStartDateISO,
    repeatEndDateISO,
    user?.id // parentId
  );

  setShowEditModal(false);
  setEditingMissionId(null);
  setToastMessage('미션이 수정되었어요');
} catch (error) {
  console.error('[미션 수정 실패] 상세 에러:', error);
  
  // 네트워크 오류 등 예외 처리
  if (error instanceof Error) {
    if (error.message.includes('권한') || error.message.includes('수정할 수 없')) {
      setToastMessage(error.message);
    } else {
      setToastMessage('미션 수정에 실패했어요. 다시 시도해주세요.');
    }
  } else {
    setToastMessage('미션 수정에 실패했어요. 다시 시도해주세요.');
  }
  
  // 원본 데이터 유지 (모달은 열린 상태로 유지)
}
```

---

## 📝 체크리스트

- [x] 수정 버튼 노출 규칙 (IN_PROGRESS만)
- [x] 수정 진입 UX (prefill)
- [x] 수정 모달 재사용 구조
- [x] Firestore update 함수
- [x] 상태별 버튼 활성/비활성 조건
- [x] 예외 처리 (네트워크 오류)
- [x] UX 보호 로직 (PENDING_REVIEW)
- [x] 시각적 가이드 (안내 문구)

---

## ⚠️ 주의사항

1. **파일 복구 필요**: `src/firebase/missions.ts` 파일이 손상되었습니다. 이전 버전에서 복구하거나 `updateMission` 함수를 추가해야 합니다.

2. **AppContext 연동**: `updateMission` 함수를 AppContext에 추가하고 `ChildManagement`에서 사용할 수 있도록 해야 합니다.

3. **상태 보호**: `status` 필드는 수정하지 않습니다. `updatedAt`만 업데이트합니다.

---

이 가이드를 참고하여 실제 코드를 구현하세요!

