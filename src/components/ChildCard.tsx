import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, QuerySnapshot, DocumentData } from 'firebase/firestore';
import Character from './Character';

interface ChildCardProps {
  childId: string;
  childName: string;
  totalPoint: number;
  gender?: 'male' | 'female'; // 자녀 성별
  onInProgressCountChange: (childId: string, count: number) => void;
  onPendingCountChange: (childId: string, count: number) => void;
  onManageClick: () => void; // 관리하기 버튼 클릭
  onViewChildScreenClick: () => void; // 아이 화면 보기 버튼 클릭
  onEditClick?: (childId: string) => void; // 자녀 정보 수정 클릭
  onDeleteClick?: (childId: string) => void; // 자녀 삭제 클릭
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
  const [inProgressCount, setInProgressCount] = useState<number>(0); // 오늘 날짜의 진행 중 미션 수 (TODO, IN_PROGRESS)
  const [pendingCount, setPendingCount] = useState<number>(0); // 확인 필요 미션 수 (PENDING_REVIEW)
  const [showMenu, setShowMenu] = useState<boolean>(false); // 더보기 메뉴 표시 여부

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


  // 상태 배지 정보 생성 (최대 2개까지)
  const statusBadges = useMemo(() => {
    const badges: Array<{ text: string; color: string; bgColor: string }> = [];
    
    // 1. 확인중 미션 (최우선)
    if (pendingCount > 0) {
      badges.push({
        text: `확인 중 ${pendingCount}개`,
        color: 'text-orange-700',
        bgColor: 'bg-orange-100'
      });
    }
    
    // 2. 오늘 남은 미션 (확인 필요가 없을 때만 표시)
    if (inProgressCount > 0 && badges.length < 2) {
      badges.push({
        text: `진행 중 ${inProgressCount}개`,
        color: 'text-blue-700',
        bgColor: 'bg-blue-100'
      });
    }
    
    return badges;
  }, [pendingCount, inProgressCount]);

  return (
    <div className="w-full bg-white rounded-2xl border-2 border-gray-200 p-4 shadow-sm relative">
      {/* 1️⃣ 자녀 이름 + 아바타 + 더보기 메뉴 */}
      <div className="flex items-center gap-3 mb-3">
        {/* 자녀 캐릭터 이미지 */}
        <div className="flex-shrink-0">
          <Character size="medium" gender={gender} />
        </div>
        
        {/* 자녀 이름 */}
        <h3 className="text-lg font-bold text-gray-800 flex-1">{childName}</h3>

        {/* 더보기 메뉴 버튼 */}
        {(onEditClick || onDeleteClick) && (
          <div className="relative flex-shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="더보기"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
            </button>

            {/* 더보기 메뉴 드롭다운 */}
            {showMenu && (
              <>
                {/* 배경 오버레이 (메뉴 외부 클릭 시 닫기) */}
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowMenu(false)}
                />
                {/* 메뉴 */}
                <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-20 min-w-[160px]">
                  {onEditClick && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMenu(false);
                        onEditClick(childId);
                      }}
                      className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
                    >
                      <span>✏️</span>
                      <span>자녀 정보 수정</span>
                    </button>
                  )}
                  {onDeleteClick && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMenu(false);
                        onDeleteClick(childId);
                      }}
                      className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
                    >
                      <span>🗑️</span>
                      <span>자녀 삭제</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* 2️⃣ 오늘 남은 미션 개수 + 3️⃣ 처리 대기 상태 요약 - 간격 축소 */}
      <div className="mb-3">
        {/* 상태 배지 (최대 2개까지) */}
        {statusBadges.length > 0 ? (
          <div className="flex items-center gap-2 flex-wrap">
            {statusBadges.map((badge, index) => (
              <div
                key={index}
                className={`${badge.bgColor} ${badge.color} px-2.5 py-1 rounded-full`}
              >
                <span className="text-xs font-medium">
                  {badge.text}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-400">진행 중인 미션이 없어요</p>
        )}
      </div>

      {/* 버튼 영역 - 정보 카드와 명확히 분리, 간격 축소 */}
      <div className="flex gap-2 pt-3 border-t border-gray-100">
        {/* ① 미션 확인하기 (Primary) - 부모 행동의 시작점 */}
        <button
          onClick={onManageClick}
          className="flex-1 py-2.5 bg-blue-500 text-white rounded-xl font-semibold text-sm hover:bg-blue-600 transition-colors"
        >
          미션 보기
        </button>
        
        {/* ② 아이 화면 보기 (Secondary) - 보조 행동, 시각적 강조 낮춤 */}
        <button
          onClick={onViewChildScreenClick}
          className="flex-1 py-2.5 bg-gray-50 text-gray-600 rounded-xl font-normal text-sm hover:bg-gray-100 transition-colors border border-gray-200"
        >
          아이 화면 보기
        </button>
      </div>
    </div>
  );
};

export default ChildCard;

