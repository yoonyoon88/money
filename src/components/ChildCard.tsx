import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, QuerySnapshot, DocumentData } from 'firebase/firestore';
import Character from './Character';
import BottomSheet from './BottomSheet';

interface ChildCardProps {
  childId: string;
  childName: string;
  totalPoint: number;
  gender?: 'male' | 'female';
  onInProgressCountChange: (childId: string, count: number) => void;
  onPendingCountChange: (childId: string, count: number) => void;
  onManageClick: () => void;
  onViewChildScreenClick?: () => void;
  onEditClick?: (childId: string) => void;
  onDeleteClick?: (childId: string) => void;
}

/**
 * 자녀 카드 컴포넌트
 * - 각 자녀별로 Firestore missions 컬렉션을 실시간 구독
 * - 진행 중 미션(TODO)과 승인 대기 미션(SUBMITTED) 개수를 실시간으로 업데이트
 */
const ChildCard: React.FC<ChildCardProps> = ({
  childId,
  childName,
  totalPoint,
  gender,
  onInProgressCountChange,
  onPendingCountChange,
  onManageClick,
  onViewChildScreenClick,
  onEditClick,
  onDeleteClick,
}) => {
  const [inProgressCount, setInProgressCount] = useState<number>(0);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [showBottomSheet, setShowBottomSheet] = useState<boolean>(false);

  // 진행 중 미션(TODO, IN_PROGRESS) 구독 - 오늘 날짜 기준
  useEffect(() => {
    if (!db || !childId) {
      setInProgressCount(0);
      onInProgressCountChange(childId, 0);
      return;
    }

    // 오늘 날짜의 진행 중 미션만 구독
    const missionsQuery = query(
      collection(db, 'missions'),
      where('childId', '==', childId),
      where('isDeleted', '==', false)
    );

    const unsubscribe = onSnapshot(
      missionsQuery,
      (snapshot: QuerySnapshot<DocumentData>) => {
        let count = 0;
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        snapshot.docs.forEach((doc) => {
          const mission = doc.data();
          if (mission.isDeleted === true) return;
          
          // 날짜 필드 우선순위: deadlineAt > dueAt > dueDate
          let dueAt: Date | null = null;
          
          if (mission.deadlineAt) {
            // deadlineAt이 Timestamp 객체인 경우
            if (mission.deadlineAt.toDate) {
              dueAt = mission.deadlineAt.toDate();
            } else if (typeof mission.deadlineAt === 'string') {
              dueAt = new Date(mission.deadlineAt);
            } else if (typeof mission.deadlineAt === 'number') {
              dueAt = new Date(mission.deadlineAt);
            }
          } else if (mission.dueAt) {
            // dueAt이 Timestamp 객체인 경우
            if (mission.dueAt.toDate) {
              dueAt = mission.dueAt.toDate();
            } else if (typeof mission.dueAt === 'string') {
              dueAt = new Date(mission.dueAt);
            } else if (typeof mission.dueAt === 'number') {
              dueAt = new Date(mission.dueAt);
            }
          } else if (mission.dueDate) {
            // dueDate가 Timestamp 객체인 경우
            if (mission.dueDate.toDate) {
              dueAt = mission.dueDate.toDate();
            } else if (typeof mission.dueDate === 'string') {
              dueAt = new Date(mission.dueDate);
            } else if (typeof mission.dueDate === 'number') {
              dueAt = new Date(mission.dueDate);
            }
          }
          
          if (!dueAt || isNaN(dueAt.getTime())) {
            return;
          }
          
          const missionDate = new Date(dueAt.getFullYear(), dueAt.getMonth(), dueAt.getDate());
          const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
          
          // 오늘 날짜의 미션이고 TODO 또는 IN_PROGRESS 상태인 경우
          if (missionDate.getTime() === todayDate.getTime() && 
              (mission.status === 'TODO' || mission.status === 'IN_PROGRESS')) {
            count++;
          }
        });

        setInProgressCount(count);
        onInProgressCountChange(childId, count);
      },
      (error) => {
        setInProgressCount(0);
        onInProgressCountChange(childId, 0);
      }
    );

    // cleanup: childId가 변경되면 이전 구독 해제
    return () => {
      unsubscribe();
    };
  }, [childId, onInProgressCountChange]);

  // 확인 필요 미션(SUBMITTED 또는 PENDING_REVIEW) 구독
  useEffect(() => {
    if (!db || !childId) {
      setPendingCount(0);
      onPendingCountChange(childId, 0);
      return;
    }

    // Firestore where는 OR를 지원하지 않으므로, 모든 미션을 가져온 후 클라이언트에서 필터링
    const missionsQuery = query(
      collection(db, 'missions'),
      where('childId', '==', childId),
      where('isDeleted', '==', false)
    );

    const unsubscribe = onSnapshot(
      missionsQuery,
      (snapshot: QuerySnapshot<DocumentData>) => {
        // SUBMITTED 또는 PENDING_REVIEW 상태의 미션만 카운트
        let count = 0;
        snapshot.docs.forEach((doc) => {
          const mission = doc.data();
          if (mission.isDeleted === true) return;
          
          // SUBMITTED 또는 PENDING_REVIEW 상태인 경우 (둘 다 승인 대기 상태)
          if (mission.status === 'SUBMITTED' || mission.status === 'PENDING_REVIEW') {
            count++;
          }
        });
        
        setPendingCount(count);
        // 콜백 호출 (부모 컴포넌트에 childId와 개수 전달)
        onPendingCountChange(childId, count);
      },
      (error) => {
        setPendingCount(0);
        onPendingCountChange(childId, 0);
      }
    );

    // cleanup: childId가 변경되면 이전 구독 해제
    return () => {
      unsubscribe();
    };
  }, [childId, onPendingCountChange]);


  // 상태 텍스트 한 줄: "확인 대기 N개" / "진행 중 N개" / "진행 미션 없음"
  const statusText = useMemo(() => {
    if (pendingCount > 0) return `확인 대기 ${pendingCount}개`;
    if (inProgressCount > 0) return `진행 중 ${inProgressCount}개`;
    return '진행 미션 없음';
  }, [pendingCount, inProgressCount]);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={onManageClick}
        onKeyDown={(e) => e.key === 'Enter' && onManageClick()}
        className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 relative flex items-center gap-4 cursor-pointer transition-opacity active:opacity-90"
      >
        <div className="w-14 h-14 rounded-xl flex-shrink-0 overflow-hidden">
          <Character size="cardSmall" gender={gender} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold text-gray-800 truncate">{childName}</p>
          <p className="text-sm text-gray-500 mt-1 truncate">{statusText}</p>
        </div>
        
        {/* 설정(⋮) 버튼 - MoreVertical */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowBottomSheet(true);
          }}
          className="absolute top-3 right-3 p-2 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="설정"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <circle cx="12" cy="5" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="12" cy="19" r="1.5" />
          </svg>
        </button>
      </div>

      {/* BottomSheet는 카드 외부에 렌더링하여 클릭 시 카드 onClick이 실행되지 않도록 함 */}
      <BottomSheet
        isOpen={showBottomSheet}
        onClose={() => setShowBottomSheet(false)}
        title={`${childName} 관리`}
      >
        <div className="divide-y divide-gray-100">
          {onEditClick && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowBottomSheet(false);
                onEditClick(childId);
              }}
              className="w-full py-4 border-b border-gray-100 text-left text-gray-800 hover:bg-gray-50 transition-colors"
                    >
              이름 변경
                    </button>
                  )}
                  {onDeleteClick && (
                    <button
              type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                setShowBottomSheet(false);
                        onDeleteClick(childId);
                      }}
              className="w-full py-4 border-b border-gray-100 text-left text-red-500 hover:bg-red-50 transition-colors last:border-b-0"
                    >
              자녀 삭제
                    </button>
                  )}
                </div>
      </BottomSheet>
    </>
  );
};

export default ChildCard;

