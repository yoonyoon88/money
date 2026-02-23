import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { getUser, updateChildInfo, deleteChild } from '../firebase/users';
import { db, auth } from '../firebase/config';
import { signOut } from 'firebase/auth';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import Character from './Character';
import ChildCard from './ChildCard';
import Toast from './Toast';
import RoleSelection from './RoleSelection';
import PinInput from './PinInput';
import PageLayout from './PageLayout';
import { NORMAL_HEADER_HEIGHT } from '../constants/layout';

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
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [totalMissionCount, setTotalMissionCount] = useState<number>(0); // 전체 미션 개수
  const [editingChildId, setEditingChildId] = useState<string | null>(null); // 수정 중인 자녀 ID
  const [editingChildName, setEditingChildName] = useState<string>(''); // 수정 중인 자녀 이름
  const [editingChildGender, setEditingChildGender] = useState<'male' | 'female'>('female'); // 수정 중인 자녀 성별
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false); // 삭제 확인 모달
  const [deletingChildId, setDeletingChildId] = useState<string | null>(null); // 삭제할 자녀 ID
  const [showDeletePinInput, setShowDeletePinInput] = useState(false); // 삭제 PIN 입력 모달
  const [isDeleting, setIsDeleting] = useState(false); // 삭제 진행 중
  const [showRoleSwitchGuide, setShowRoleSwitchGuide] = useState(false); // 역할 전환 안내 표시 여부
  const [showRoleSwitchBanner, setShowRoleSwitchBanner] = useState(false); // 역할 전환 완료 배너 표시 여부

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

    // 모든 자녀 정보를 병렬로 조회
    Promise.all(
      user.childrenIds.map(async (childId) => {
        try {
          // childId일 가능성이 있으므로 getUser 호출 (문서가 없으면 조용히 null 반환)
          const childUser = await getUser(childId);
          if (!childUser) {
            // childId가 user 문서가 아닐 수 있으므로 조용히 skip
            return null;
          }

          // User 타입에 gender 필드가 포함되어 있으므로 직접 사용
          // gender는 'male' | 'female' | undefined 형태로 항상 존재
          return {
            uid: childId,
            name: childUser.name,
            totalPoint: childUser.totalPoint || 0,
            gender: childUser.gender as 'male' | 'female' | undefined,
            inProgressCount: 0, // ChildCard에서 실시간으로 업데이트
            pendingCount: 0, // ChildCard에서 실시간으로 업데이트
          };
        } catch (error) {
          // childId일 가능성이 있으므로 조용히 처리
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

  // 역할 선택 완료 핸들러
  const handleRoleSelected = () => {
    setShowRoleSelection(false);
  };

  // 로그아웃 핸들러
  const handleLogout = async () => {
    try {
      await signOut(auth);
      // 로그아웃 성공 시 로그인 화면으로 이동 (AppContext에서 자동 처리됨)
      navigate('/login', { replace: true });
    } catch (error) {
      alert('로그아웃에 실패했습니다.');
    }
  };

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
    <PageLayout headerHeight={NORMAL_HEADER_HEIGHT} className="pb-8">
      {/* 상단 헤더 영역 - 보호자 이름 + 액션 버튼 한 줄 구성 */}
      <div className="bg-white px-5 pt-4 pb-2">
        {/* 1️⃣ 보호자 이름 + 액션 버튼 한 줄 구성 */}
        <div className="flex items-center justify-between gap-3 mb-2">
          {/* 보호자 이름 - 좌측 정렬, 굵은 텍스트, 가장 먼저 인지되도록 강조 */}
          <h1 className="text-xl font-bold text-gray-800 flex-shrink-0">
            {user?.name} 님
          </h1>
          
          {/* 액션 버튼 그룹 - 우측 정렬, 좁은 간격으로 하나의 컨트롤 그룹처럼 (자녀가 있을 때만 표시) */}
          {user?.childrenIds && user.childrenIds.length > 0 && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* 역할 전환 버튼 - Primary 스타일 */}
              <div className="relative">
                <button
                  onClick={handleRoleSwitch}
                  className={`px-3 py-1.5 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition-colors whitespace-nowrap ${
                    showRoleSwitchGuide ? 'ring-4 ring-green-300 ring-offset-2 animate-pulse' : ''
                  }`}
                >
                  역할 전환
                </button>
              
              {/* 역할 전환 안내 말풍선 (첫 미션 생성 후) */}
              {showRoleSwitchGuide && (
                <div className="absolute bottom-full right-0 mb-2 z-30">
                  <div className="bg-white rounded-xl shadow-2xl border-2 border-green-200 p-4 min-w-[240px] max-w-[280px]">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0">
                        <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                          <span className="text-xl">👧</span>
                        </div>
                      </div>
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
                        className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                        aria-label="닫기"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    {/* 말풍선 꼬리 */}
                    <div className="absolute bottom-0 right-6 transform translate-y-full">
                      <div className="w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-white"></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {/* 사용법 버튼 - Secondary 스타일 */}
            <button
              onClick={() => setShowUsageGuide(true)}
              className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors whitespace-nowrap"
            >
              사용법
            </button>
            
            {/* 로그아웃 아이콘 버튼 - 아이콘만 표시, 회색 중립 색상 */}
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="로그아웃"
              title="로그아웃"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
            </div>
          )}
        </div>
        
        {/* 2️⃣ 안내 문구 - 헤더 바로 아래, 작고 연한 색상, 보조 설명 느낌 (자녀가 있을 때만 표시) */}
        {user?.childrenIds && user.childrenIds.length > 0 && (
          <p className="text-xs text-gray-400">아이를 선택해 주세요 😊</p>
        )}
      </div>

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

      {/* 자녀가 있을 때만 표시되는 컨텐츠 */}
      {user?.childrenIds && user.childrenIds.length > 0 && !loading && (
        <>
          {/* 역할 전환 완료 배너 (아이 카드 영역 위에 인라인 표시) */}
          {showRoleSwitchBanner && (
            <div className="px-5 mt-4">
              <div className="bg-gradient-to-r from-green-50 to-blue-50 border-2 border-green-200 rounded-2xl p-4 shadow-md">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                        <span className="text-xl">👧</span>
                      </div>
                    </div>
                    <p className="text-sm font-medium text-gray-800">
                      아이 화면으로 전환했어요 👧
                    </p>
                  </div>
                  <button
                    onClick={() => setShowRoleSwitchBanner(false)}
                    className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 transition-colors"
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

          {/* 자녀 카드 목록 */}
          <div className="px-5 mt-3">
            {loading ? (
              <div className="text-center py-8 text-gray-400">
                <p className="text-sm">자녀 정보를 불러오는 중...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {childrenInfo.map((child) => (
                  <ChildCard
                    key={child.uid}
                    childId={child.uid}
                    childName={child.name}
                    totalPoint={child.totalPoint}
                    gender={child.gender}
                    onInProgressCountChange={handleInProgressCountChange}
                    onPendingCountChange={handlePendingCountChange}
                    onManageClick={() => {
                      // 자녀 관리 상세 화면으로 이동
                      navigate(`/parent/child/${child.uid}`);
                    }}
                    onViewChildScreenClick={() => {
                      // 아이 화면 미리보기 모드로 이동
                      navigate(`/child/${child.uid}`, {
                        state: { isPreview: true },
                      });
                    }}
                    onEditClick={(childId) => {
                      const child = childrenInfo.find(c => c.uid === childId);
                      if (child) {
                        setEditingChildId(childId);
                        setEditingChildName(child.name);
                        setEditingChildGender(child.gender || 'female');
                      }
                    }}
                    onDeleteClick={(childId) => {
                      setDeletingChildId(childId);
                      setShowDeleteConfirm(true);
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* 다자녀 안내 문구 - 접기 가능한 형태 */}
          {user.childrenIds.length >= 1 && (
            <div className="px-5 mt-4">
              <details className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
                <summary className="px-4 py-2.5 text-xs text-gray-500 cursor-pointer hover:bg-gray-100 transition-colors list-none">
                  <span className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span className="text-gray-400">ⓘ</span>
                      <span>다자녀 관리 안내</span>
                    </span>
                    <svg 
                      className="w-4 h-4 text-gray-400 transition-transform"
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </span>
                </summary>
                <div className="px-4 pb-4 pt-2">
                  <p className="text-xs text-gray-600 leading-relaxed">
                    현재는 한 명의 자녀만 관리할 수 있어요. 다자녀 관리는 추후 업데이트에서 제공될 예정이에요.
                  </p>
                </div>
              </details>
            </div>
          )}
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

      {/* 로그아웃 확인 다이얼로그 */}
      {showLogoutConfirm && (
        <>
          {/* 배경 오버레이 */}
          <div
            className="fixed inset-0 bg-black/30 z-40"
            onClick={() => setShowLogoutConfirm(false)}
          />
          {/* 다이얼로그 */}
          <div className="fixed inset-0 flex items-center justify-center z-50 px-5">
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-2">로그아웃</h3>
              <p className="text-sm text-gray-600 mb-6">
                정말 로그아웃하시겠어요?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 py-2.5 px-4 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleLogout}
                  className="flex-1 py-2.5 px-4 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 transition-colors"
                >
                  로그아웃
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

              <div className="flex gap-3 mt-6">
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
                정말 삭제하시겠어요?<br />
                삭제된 자녀의 모든 미션, 포인트, 기록이 영구적으로 삭제됩니다.
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
                  className="flex-1 py-2.5 px-4 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 transition-colors"
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
                    // 삭제 전 자녀 수 확인
                    const currentChildrenCount = user.childrenIds?.length || 0;
                    
                    await deleteChild(deletingChildId, user.id);
                    setToastMessage('자녀가 삭제되었어요.');
                    setShowDeletePinInput(false);
                    setDeletingChildId(null);
                    
                    // 삭제 후 자녀가 0명이 되면 자녀 추가 화면으로 이동
                    // Firestore 업데이트가 완료되기 전이므로 현재 자녀 수 - 1로 계산
                    if (currentChildrenCount <= 1) {
                      // 자녀가 0명이 됨 (마지막 자녀 삭제)
                      setTimeout(() => {
                        navigate('/add-child', { replace: true });
                      }, 500); // Firestore 업데이트 대기
                    } else {
                      // 자녀가 남아있음 (부모 홈 유지, 자동으로 childrenInfo가 업데이트됨)
                    }
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
