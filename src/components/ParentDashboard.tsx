import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { getUser, updateChildInfo, deleteChild } from '../firebase/users';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import Character from './Character';
import ChildCard from './ChildCard';
import Toast from './Toast';
import RoleSelection from './RoleSelection';
import PinInput from './PinInput';
import PageLayout from './PageLayout';
import { NORMAL_HEADER_HEIGHT } from '../constants/layout';
import { getMaxChildren } from '../utils/planLimit';
import { getSubscriptionPlan } from '../types';
import { hasPremiumAccess, isPromoActive } from '../utils/subscription';
import { fetchMissionTemplates, deleteMissionTemplate, MissionTemplate } from '../firebase/missionTemplates';

interface ChildInfo {
  uid: string;
  name: string;
  totalPoint: number;
  gender: 'male' | 'female' | undefined; // 자녀 성별 (항상 존재하지만 undefined일 수 있음)
  inProgressCount: number; // 진행 중 미션 수 (TODO 상태)
  pendingCount: number; // 승인 대기 미션 수 (SUBMITTED 상태)
}

const ParentDashboard: React.FC = () => {
  const { user } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [childrenInfo, setChildrenInfo] = useState<ChildInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showRoleSelection, setShowRoleSelection] = useState(false);
  const [showUsageGuide, setShowUsageGuide] = useState(false);
  const [totalMissionCount, setTotalMissionCount] = useState<number>(0); // 전체 미션 개수
  const [editingChildId, setEditingChildId] = useState<string | null>(null); // 수정 중인 자녀 ID
  const [editingChildName, setEditingChildName] = useState<string>(''); // 수정 중인 자녀 이름
  const [editingChildGender, setEditingChildGender] = useState<'male' | 'female'>('female'); // 수정 중인 자녀 성별
  const [renameOpen, setRenameOpen] = useState(false); // 이름 변경 모달
  const [newName, setNewName] = useState(''); // 이름 변경 입력값
  const [renamingChildId, setRenamingChildId] = useState<string | null>(null); // 이름 변경 중인 자녀 ID
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false); // 삭제 확인 모달
  const [deletingChildId, setDeletingChildId] = useState<string | null>(null); // 삭제할 자녀 ID
  const [showDeletePinInput, setShowDeletePinInput] = useState(false); // 삭제 PIN 입력 모달
  const [isDeleting, setIsDeleting] = useState(false); // 삭제 진행 중
  const [showRoleSwitchGuide, setShowRoleSwitchGuide] = useState(false); // 역할 전환 안내 표시 여부
  const [showRoleSwitchBanner, setShowRoleSwitchBanner] = useState(false); // 역할 전환 완료 배너 표시 여부

  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // 자주 쓰는 미션 템플릿 관리
  const [missionTemplates, setMissionTemplates] = useState<MissionTemplate[]>([]);
  const [showTemplateSheet, setShowTemplateSheet] = useState(false);

  // location.state에서 역할 전환 완료 확인
  useEffect(() => {
    const state = location.state as { toastMessage?: string; isRoleSwitch?: boolean } | null;
    if (state?.isRoleSwitch) {
      // 최초 1회만 표시 (localStorage로 제어)
      const hasSeenBanner = localStorage.getItem('hasSeenRoleSwitchBanner');
      if (!hasSeenBanner) {
        setShowRoleSwitchBanner(true);
        localStorage.setItem('hasSeenRoleSwitchBanner', 'true');
        
        // 4초 후 자동으로 사라짐
        const timer = setTimeout(() => {
          setShowRoleSwitchBanner(false);
        }, 4000);
        
        // state를 초기화하여 뒤로가기 시 다시 표시되지 않도록
        window.history.replaceState({}, '');
        
        return () => clearTimeout(timer);
      }
    } else if (state?.toastMessage) {
      // 일반 토스트 메시지는 기존 로직 유지
      setToastMessage(state.toastMessage);
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  // 자녀 선택 화면 뒤로가기 처리: useBackHandler에서 처리
  // (웹 환경에서는 브라우저 기본 동작, 모바일에서는 useBackHandler에서 처리)

  // 자녀 정보 가져오기 (미션 개수는 ChildCard에서 실시간 구독)
  useEffect(() => {
    if (!user?.childrenIds || user.childrenIds.length === 0 || !db) {
      setChildrenInfo([]);
      setLoading(false);
      return;
    }

    // 모든 자녀 정보를 병렬로 조회 (isDeleted !== true 인 자녀만 표시)
    Promise.all(
      user.childrenIds.map(async (childId) => {
        try {
          const childUser = await getUser(childId);
          if (!childUser || childUser.isDeleted === true) {
            return null;
          }

          return {
            uid: childId,
            name: childUser.name,
            totalPoint: childUser.totalPoint || 0,
            gender: childUser.gender as 'male' | 'female' | undefined,
            inProgressCount: 0,
            pendingCount: 0,
          };
        } catch (error) {
          return null;
        }
      })
    ).then((children) => {
      // null 제거 로직을 중간 변수로 분리
      // 타입 가드를 사용하여 null을 제거하고 ChildInfo[]로 변환
      const validChildren: ChildInfo[] = children.filter(
        (c): c is ChildInfo => c !== null
      );
      setChildrenInfo(validChildren);
      setLoading(false);
    });
  }, [user?.childrenIds]);

  // 부모용: 자주 쓰는 미션 템플릿 불러오기
  useEffect(() => {
    const loadTemplates = async () => {
      if (!user || user.role !== 'PARENT') {
        setMissionTemplates([]);
        return;
      }
      try {
        const list = await fetchMissionTemplates(user.id);
        setMissionTemplates(list);
      } catch {
        setMissionTemplates([]);
      }
    };
    loadTemplates();
  }, [user]);

  // 첫 번째 자녀의 미션 개수 구독 (첫 미션 만들기 카드 표시 여부 결정)
  useEffect(() => {
    if (!db || !user?.childrenIds || user.childrenIds.length === 0) {
      setTotalMissionCount(0);
      return;
    }

    // 첫 번째 자녀의 미션 개수만 확인 (간단한 구현)
    const firstChildId = user.childrenIds[0];
    const missionsQuery = query(
      collection(db, 'missions'),
      where('childId', '==', firstChildId),
      where('isDeleted', '==', false)
    );

    let prevCount = 0; // 이전 미션 개수 추적

    const unsubscribe = onSnapshot(
      missionsQuery,
      (snapshot) => {
        const newCount = snapshot.size;
        setTotalMissionCount(newCount);

        // 첫 미션 생성 감지 (0개 → 1개로 변경)
        if (prevCount === 0 && newCount === 1) {
          // 이미 안내를 본 적이 있는지 확인
          const hasSeenGuide = localStorage.getItem('hasSeenFirstMissionGuide');
          if (!hasSeenGuide) {
            setShowRoleSwitchGuide(true);
            localStorage.setItem('hasSeenFirstMissionGuide', 'true');
          }
        }
        
        prevCount = newCount; // 다음 비교를 위해 이전 값 업데이트
      },
      (error) => {
        setTotalMissionCount(0);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [db, user?.childrenIds]);

  // ChildCard에서 미션 개수 업데이트 콜백
  const handleInProgressCountChange = useCallback((childId: string, count: number) => {
    setChildrenInfo((prev) =>
      prev.map((child) =>
        child.uid === childId ? { ...child, inProgressCount: count } : child
      )
    );
  }, []);

  const handlePendingCountChange = useCallback((childId: string, count: number) => {
    setChildrenInfo((prev) =>
      prev.map((child) =>
        child.uid === childId ? { ...child, pendingCount: count } : child
      )
    );
  }, []);

  // 자녀가 없을 때는 empty state 표시 (헤더는 유지하되 버튼 숨김)

  // 역할 전환 핸들러
  const handleRoleSwitch = () => {
    setShowRoleSelection(true);
  };

  const subscriptionPlan = hasPremiumAccess(getSubscriptionPlan(user))
    ? 'premium'
    : 'free';

  const maxChildren = getMaxChildren(subscriptionPlan);

  const handleAddChild = () => {
    const plan = getSubscriptionPlan(user);
    if (!hasPremiumAccess(plan) && childrenInfo.length >= 1) {
      alert('무료 플랜은 자녀 1명까지만 등록할 수 있어요.');
      return;
    }
    if (childrenInfo.length >= maxChildren) {
      setShowUpgradeModal(true);
      return;
    }
    navigate('/add-child');
  };

  // 역할 선택 완료 핸들러
  const handleRoleSelected = () => {
    setShowRoleSelection(false);
  };

  function renderPlanBadge(plan: 'free' | 'premium') {
    if (plan === 'premium') {
      return (
        <span className="whitespace-nowrap rounded-full bg-yellow-100 px-2 py-1 text-xs font-semibold text-yellow-800">
          👑 프리미엄
        </span>
      );
    }
    return (
      <span className="whitespace-nowrap rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
        무료
      </span>
    );
    }

  // 역할 선택 화면 표시
  if (showRoleSelection) {
    return (
      <RoleSelection 
        onRoleSelected={handleRoleSelected}
        showBackButton={true}
        onBack={handleRoleSelected}
      />
    );
  }

  return (
    <PageLayout headerHeight={0} noSafeArea className="pb-[88px]">
      {/* 1️⃣ 상단 기본 헤더: px-4 pt-6 pb-4, flex justify-between items-center */}
      <header className="px-4 pt-6 pb-4">
        <div className="h-[56px] flex justify-between items-center">
          <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg font-semibold text-gray-800 truncate">{user?.name} 님</span>
          {renderPlanBadge(subscriptionPlan)}
        </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {showRoleSwitchGuide && (
            <div className="absolute left-4 right-4 top-[72px] z-30 md:left-auto md:right-20 md:top-16">
                  <div className="bg-white rounded-xl shadow-2xl border-2 border-green-200 p-4 min-w-[240px] max-w-[280px]">
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <p className="text-sm text-gray-800 leading-relaxed mb-3">
                          아이가 미션을 확인하려면<br />
                          아이 화면으로 전환해 주세요 👧
                        </p>
                        <button
                          onClick={() => {
                            setShowRoleSwitchGuide(false);
                            handleRoleSwitch();
                          }}
                          className="w-full py-2 bg-green-500 text-white rounded-lg text-sm font-semibold hover:bg-green-600 transition-colors"
                        >
                          전환하기
                        </button>
                        <button
                          onClick={() => setShowRoleSwitchGuide(false)}
                          className="w-full mt-2 py-1.5 text-gray-500 text-xs hover:text-gray-700 transition-colors"
                        >
                          나중에
                        </button>
                      </div>
                      <button
                        onClick={() => setShowRoleSwitchGuide(false)}
                    className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600"
                        aria-label="닫기"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              )}
          <button
            onClick={handleRoleSwitch}
            className={`px-3 py-1.5 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition-colors whitespace-nowrap ${
              showRoleSwitchGuide ? 'ring-4 ring-green-300 ring-offset-2 animate-pulse' : ''
            }`}
          >
            역할 전환
          </button>
          {user?.childrenIds && user.childrenIds.length > 0 && (
            <button
              onClick={() => setShowUsageGuide(true)}
              className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors whitespace-nowrap"
            >
              사용법
            </button>
          )}
        </div>
        </div>
      </header>

      {isPromoActive() && (
        <div className="text-xs text-indigo-600 font-medium mb-2">
          5월까지 무료 체험 중
      </div>
      )}

      {/* 자녀가 없을 때 Empty State - 부모 홈의 기본 상태 */}
      {(!user?.childrenIds || user.childrenIds.length === 0) && !loading && (
        <div className="flex items-center justify-center min-h-[60vh] px-5">
          <div className="text-center max-w-md w-full">
            <div className="mb-8 flex justify-center">
              <Character size="large" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-3">
              자녀를 먼저 추가해주세요
            </h2>
            <p className="text-gray-500 text-base mb-10">
              관리할 자녀를 추가해주세요.
            </p>
            <button
              onClick={() => navigate('/add-child')}
              className="w-full py-4 bg-blue-500 text-white rounded-2xl font-bold text-lg shadow-lg hover:bg-blue-600 active:bg-blue-700 transition-colors"
            >
              + 자녀 추가하기
            </button>
          </div>
        </div>
      )}

      {/* 자녀가 있을 때: 아이 선택 영역 */}
      {user?.childrenIds && user.childrenIds.length > 0 && (
        <>
          {/* 안내 문구: 자녀가 1명 이상일 때만 표시 */}
          {childrenInfo.length > 0 && (
            <div className="mt-4 px-4 py-3 rounded-xl bg-indigo-50 text-indigo-700 text-sm flex items-center gap-2">
              <span>✨</span>
              <span>아이에게 미션을 주려면 카드를 눌러보세요 😊</span>
                      </div>
          )}
          <div className="px-4 mt-4">
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5">
              {loading ? (
                <div className="py-8 text-center text-gray-500 text-sm">
                  자녀 정보를 불러오는 중...
                    </div>
              ) : (
              <div className="space-y-4">
                {/* 자주 쓰는 미션 관리 버튼 */}
                {user?.role === 'PARENT' && (
                  <button
                    type="button"
                    onClick={() => setShowTemplateSheet(true)}
                    className="w-full flex items-center justify-between px-4 py-2 rounded-xl bg-amber-50 border border-amber-100 text-xs text-amber-800 hover:bg-amber-100 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <span>⭐</span>
                      <span>자주 쓰는 미션 관리</span>
                    </span>
                    <span className="text-[11px] text-amber-600">
                      {missionTemplates.length}개
                    </span>
                  </button>
                )}

                {childrenInfo.map((child) => (
                  <ChildCard
                    key={child.uid}
                    childId={child.uid}
                    childName={child.name}
                    totalPoint={child.totalPoint}
                    gender={child.gender}
                    onInProgressCountChange={handleInProgressCountChange}
                    onPendingCountChange={handlePendingCountChange}
                    onManageClick={() => navigate(`/parent/child/${child.uid}`)}
                    onViewChildScreenClick={() =>
                      navigate(`/child/${child.uid}`, { state: { isPreview: true } })
                    }
                    onEditClick={(childId) => {
                      const c = childrenInfo.find((x) => x.uid === childId);
                      if (c) {
                        setRenamingChildId(childId);
                        setNewName(c.name);
                        setRenameOpen(true);
                      }
                    }}
                    onDeleteClick={(childId) => {
                      setDeletingChildId(childId);
                      setShowDeleteConfirm(true);
                    }}
                  />
                ))}

                {childrenInfo.length < maxChildren && (
                  <button
                    type="button"
                    onClick={handleAddChild}
                    className="w-full py-3 rounded-xl border-2 border-dashed border-indigo-300 flex items-center justify-center gap-2 text-indigo-600 text-sm font-semibold mt-3 transition-colors hover:bg-indigo-50"
                  >
                    + 자녀 추가하기
                  </button>
                )}
            </div>
          )}
            </div>
          </div>
        </>
      )}

      {/* 토스트 메시지 */}
      {toastMessage && (
        <Toast
          message={toastMessage}
          type="success"
          onClose={() => setToastMessage(null)}
        />
      )}

      {/* 자주 쓰는 미션 관리 바텀시트 */}
      {showTemplateSheet && user?.role === 'PARENT' && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50">
          <div className="bg-white rounded-t-3xl w-full shadow-2xl">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-800">자주 쓰는 미션 관리</h2>
              <button
                type="button"
                onClick={() => setShowTemplateSheet(false)}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-4 space-y-3">
              {missionTemplates.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  아직 저장된 자주 쓰는 미션이 없어요.
                </p>
              ) : (
                missionTemplates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="w-full bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 flex items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{tpl.title}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        +{tpl.rewardPoint}P · {tpl.missionType === 'DAILY' ? '하루 미션' : '주간 미션'}
                      </p>
                      {tpl.description && (
                        <p className="text-xs text-gray-600 mt-1 line-clamp-2">{tpl.description}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await deleteMissionTemplate(tpl.id);
                          const list = await fetchMissionTemplates(user.id);
                          setMissionTemplates(list);
                        } catch (error) {
                          console.error(error);
                          setToastMessage('자주 쓰는 미션 삭제에 실패했어요');
                        }
                      }}
                      className="p-2 rounded-full hover:bg-blue-100 text-gray-400 hover:text-red-500 transition-colors"
                      aria-label="템플릿 삭제"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 사용법 안내 모달 */}
      {showUsageGuide && (
        <>
          {/* 배경 오버레이 */}
          <div
            className="fixed inset-0 bg-black/30 z-40"
            onClick={() => setShowUsageGuide(false)}
          />
          {/* 모달 카드 */}
          <div className="fixed inset-0 flex items-center justify-center z-50 px-5">
            <div
              className="bg-gradient-to-br from-pink-50 via-purple-50 to-blue-50 rounded-3xl shadow-2xl max-w-md w-full max-h-[85vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 헤더 - 닫기 버튼 */}
              <div className="px-6 pt-6 pb-4 flex items-center justify-end">
                <button
                  onClick={() => setShowUsageGuide(false)}
                  className="p-2 hover:bg-white/50 rounded-full transition-colors"
                  aria-label="닫기"
                >
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {/* 내용 */}
              <div className="px-6 pb-6 flex-1 overflow-y-auto">
                {/* 제목 */}
                <h2 className="text-xl font-bold text-gray-800 mb-6 text-center">
                  용돈 관리는 이렇게 진행돼요 👇
                </h2>
                
                <div className="space-y-4">
                  {/* 1단계 */}
                  <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-4 border border-white/50">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl flex-shrink-0">① 📝</span>
                      <div className="flex-1">
                        <h3 className="text-base font-semibold text-gray-800 mb-1">
                          부모가 미션을 만들어요
                        </h3>
                        <p className="text-xs text-gray-600 leading-relaxed">
                          아이가 할 일을 정해 주세요
                        </p>
                      </div>
                    </div>
                  </div>
                  {/* 2단계 */}
                  <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-4 border border-white/50">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl flex-shrink-0">② 🧒</span>
                      <div className="flex-1">
                        <h3 className="text-base font-semibold text-gray-800 mb-1">
                          아이가 미션을 완료해요
                        </h3>
                        <p className="text-xs text-gray-600 leading-relaxed">
                          끝나면 '완료' 버튼을 눌러요
                        </p>
                      </div>
                    </div>
                  </div>
                  {/* 3단계 */}
                  <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-4 border border-white/50">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl flex-shrink-0">③ ✅</span>
                      <div className="flex-1">
                        <h3 className="text-base font-semibold text-gray-800 mb-1">
                          부모가 확인해요
                        </h3>
                        <p className="text-xs text-gray-600 leading-relaxed">
                          확인하면 포인트가 지급돼요
                        </p>
                      </div>
                    </div>
                  </div>
                  {/* 4단계 */}
                  <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-4 border border-white/50">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl flex-shrink-0">④ 🎁</span>
                      <div className="flex-1">
                        <h3 className="text-base font-semibold text-gray-800 mb-1">
                          포인트로 소원을 이뤄요
                        </h3>
                        <p className="text-xs text-gray-600 leading-relaxed">
                          모은 포인트로 아이의 소원을 함께 실현해요
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* 하단 버튼 영역 */}
              <div className="px-6 pb-6 pt-4 border-t border-white/50">
                <button
                  onClick={() => {
                    setShowUsageGuide(false);
                    // 자녀가 있으면 첫 번째 자녀의 미션 관리 화면으로 이동
                    if (user?.childrenIds && user.childrenIds.length > 0) {
                      const firstChildId = user.childrenIds[0];
                      navigate(`/parent/child/${firstChildId}`);
                    } else {
                      // 자녀가 없으면 자녀 추가 화면으로 이동
                      navigate('/add-child');
                    }
                  }}
                  className="w-full py-3.5 bg-green-500 text-white rounded-xl font-semibold text-base shadow-md hover:bg-green-600 active:bg-green-700 transition-colors"
                >
                  미션 만들러 가기
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* 자녀 정보 수정 모달 */}
      {editingChildId && (
        <>
          {/* 배경 오버레이 */}
          <div
            className="fixed inset-0 bg-black/30 z-40"
            onClick={() => {
              setEditingChildId(null);
              setEditingChildName('');
              setEditingChildGender('female');
            }}
          />
          {/* 모달 */}
          <div className="fixed inset-0 flex items-center justify-center z-50 px-5">
            <div
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl font-bold text-gray-800 mb-4">자녀 정보 수정</h3>
              
              <div className="space-y-4">
                {/* 이름 입력 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    이름
                  </label>
                  <input
                    type="text"
                    value={editingChildName}
                    onChange={(e) => setEditingChildName(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="자녀 이름을 입력하세요"
                  />
                </div>

                {/* 성별 선택 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    성별
                  </label>
                  <div className="flex gap-4">
                    <label className={`flex-1 flex items-center gap-3 p-4 border-2 rounded-xl cursor-pointer transition-colors ${
                      editingChildGender === 'female'
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}>
                      <input
                        type="radio"
                        name="editGender"
                        value="female"
                        checked={editingChildGender === 'female'}
                        onChange={(e) => setEditingChildGender(e.target.value as 'female' | 'male')}
                        className="w-5 h-5 text-green-500 focus:ring-green-500 focus:ring-2"
                      />
                      <span className={`text-base font-medium ${
                        editingChildGender === 'female' ? 'text-green-700' : 'text-gray-700'
                      }`}>여자</span>
                    </label>
                    <label className={`flex-1 flex items-center gap-3 p-4 border-2 rounded-xl cursor-pointer transition-colors ${
                      editingChildGender === 'male'
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}>
                      <input
                        type="radio"
                        name="editGender"
                        value="male"
                        checked={editingChildGender === 'male'}
                        onChange={(e) => setEditingChildGender(e.target.value as 'female' | 'male')}
                        className="w-5 h-5 text-blue-500 focus:ring-blue-500 focus:ring-2"
                      />
                      <span className={`text-base font-medium ${
                        editingChildGender === 'male' ? 'text-blue-700' : 'text-gray-700'
                      }`}>남자</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => {
                    setEditingChildId(null);
                    setEditingChildName('');
                    setEditingChildGender('female');
                  }}
                  className="flex-1 py-2.5 px-4 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={async () => {
                    if (!editingChildId || !editingChildName.trim()) {
                      setToastMessage('이름을 입력해주세요.');
                      return;
                    }

                    try {
                      await updateChildInfo(editingChildId, {
                        name: editingChildName.trim(),
                        gender: editingChildGender,
                      });
                      
                      // childrenInfo state 즉시 업데이트 (새로고침 없이 UI 반영)
                      setChildrenInfo((prev) =>
                        prev.map((child) =>
                          child.uid === editingChildId
                            ? {
                                ...child,
                                name: editingChildName.trim(),
                                gender: editingChildGender,
                              }
                            : child
                        )
                      );
                      
                      setToastMessage('자녀 정보가 수정되었어요.');
                      setEditingChildId(null);
                      setEditingChildName('');
                      setEditingChildGender('female');
                    } catch (error) {
                      setToastMessage('수정에 실패했어요. 다시 시도해주세요.');
                    }
                  }}
                  className="flex-1 py-2.5 px-4 bg-green-500 text-white rounded-xl text-sm font-medium hover:bg-green-600 transition-colors"
                >
                  저장
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* 자녀 이름 변경 모달 */}
      {renameOpen && renamingChildId && (
        <>
          <div
            className="fixed inset-0 bg-black/30 z-40"
            onClick={() => {
              setRenameOpen(false);
              setRenamingChildId(null);
              setNewName('');
            }}
          />
          <div className="fixed inset-0 flex items-center justify-center z-50 px-5">
            <div
              className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-gray-800 mb-4">이름 변경</h3>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent mb-6"
                placeholder="자녀 이름"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setRenameOpen(false);
                    setRenamingChildId(null);
                    setNewName('');
                  }}
                  className="flex-1 py-2.5 px-4 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={async () => {
                    if (!newName.trim()) return;
                    try {
                      await updateChildInfo(renamingChildId, { name: newName.trim() });
                      setChildrenInfo((prev) =>
                        prev.map((child) =>
                          child.uid === renamingChildId ? { ...child, name: newName.trim() } : child
                        )
                      );
                      setRenameOpen(false);
                      setRenamingChildId(null);
                      setNewName('');
                      setToastMessage('이름이 변경되었어요.');
                    } catch {
                      setToastMessage('변경에 실패했어요. 다시 시도해주세요.');
                    }
                  }}
                  className="flex-1 py-2.5 px-4 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
                >
                  저장
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* 자녀 삭제 확인 모달 */}
      {showDeleteConfirm && deletingChildId && (
        <>
          {/* 배경 오버레이 */}
          <div
            className="fixed inset-0 bg-black/30 z-40"
            onClick={() => {
              setShowDeleteConfirm(false);
              setDeletingChildId(null);
            }}
          />
          {/* 다이얼로그 */}
          <div className="fixed inset-0 flex items-center justify-center z-50 px-5">
            <div
              className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-gray-800 mb-2">자녀 삭제</h3>
              <p className="text-sm text-gray-600 mb-6">
                자녀를 삭제하면 자녀 정보 및 미션 수행 내용이 더 이상 보이지 않습니다.
                삭제 후에는 복구할 수 없습니다.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeletingChildId(null);
                  }}
                  className="flex-1 py-2.5 px-4 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setShowDeletePinInput(true);
                  }}
                  className="flex-1 py-2.5 px-4 bg-white text-red-500 border border-red-200 rounded-xl text-sm font-medium hover:bg-red-50 transition-colors"
                >
                  삭제
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* 자녀 삭제 PIN 입력 모달 */}
      {showDeletePinInput && deletingChildId && (
        <>
          {/* 배경 dim 처리 */}
          <div
            className="fixed inset-0 bg-black/50 z-50"
            onClick={() => {
              setShowDeletePinInput(false);
              setDeletingChildId(null);
            }}
          />
          {/* PIN 입력 모달 */}
          <div className="fixed inset-0 flex items-center justify-center z-50 px-5">
            <div
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 relative"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 닫기 버튼 */}
              <button
                onClick={() => {
                  setShowDeletePinInput(false);
                  setDeletingChildId(null);
                }}
                className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="닫기"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* PIN 입력 컴포넌트 (모달 모드) */}
              <PinInput
                isModal={true}
                onSuccess={async () => {
                  if (!deletingChildId || !user?.id) {
                    setToastMessage('삭제할 수 없어요.');
                    setShowDeletePinInput(false);
                    setDeletingChildId(null);
                    return;
                  }

                  setIsDeleting(true);
                  try {
                    await deleteChild(deletingChildId, user.id);
                    setToastMessage('자녀가 삭제되었어요.');
                    setShowDeletePinInput(false);
                    setDeletingChildId(null);
                    // Soft Delete이므로 목록에서만 제거 (childrenIds는 유지)
                    setChildrenInfo((prev) => {
                      const next = prev.filter((c) => c.uid !== deletingChildId);
                      if (next.length === 0) {
                        setTimeout(() => navigate('/add-child', { replace: true }), 500);
                      }
                      return next;
                    });
                  } catch (error) {
                    setToastMessage('삭제에 실패했어요. 다시 시도해주세요.');
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                onCancel={() => {
                  setShowDeletePinInput(false);
                  setDeletingChildId(null);
                }}
                title="PIN 입력"
                description="자녀 삭제를 위해 PIN을 입력해주세요"
              />
            </div>
          </div>
        </>
      )}

      {/* 업그레이드 유도 모달 */}
      {showUpgradeModal && (
        <>
          <div
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/40"
            onClick={() => setShowUpgradeModal(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center px-5">
            <div
              className="w-80 rounded-2xl bg-white p-6 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="mb-2 text-lg font-semibold text-gray-800">
                다자녀 관리는 베이직에서 가능해요 👨‍👩‍👧
              </h3>
              <p className="mb-4 text-sm text-gray-600">
                월 1,900원으로 최대 3명까지 관리할 수 있어요.
              </p>
              <button
                type="button"
                onClick={() => {
                  setShowUpgradeModal(false);
                  navigate('/parent/subscription');
                }}
                className="w-full rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-500 py-2.5 text-sm font-medium text-white shadow-md transition-colors hover:from-indigo-600 hover:to-violet-600"
              >
                지금 베이직으로 업그레이드
              </button>
              <button
                type="button"
                onClick={() => setShowUpgradeModal(false)}
                className="mt-2 w-full text-sm text-gray-500 transition-colors hover:text-gray-700"
              >
                닫기
              </button>
            </div>
          </div>
        </>
      )}

      {/* Toast 메시지 */}
      {toastMessage && (
        <Toast
          message={toastMessage}
          type="success"
          onClose={() => setToastMessage(null)}
        />
      )}
    </PageLayout>
  );
};

export default ParentDashboard;
