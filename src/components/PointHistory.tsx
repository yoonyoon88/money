import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { subscribePointHistory, PointHistory } from '../firebase/pointHistory';
import { getUser } from '../firebase/users';
import Character from './Character';
import PageLayout from './PageLayout';
import { NORMAL_HEADER_HEIGHT } from '../constants/layout';

/**
 * 포인트 내역 화면
 * - 부모/아이 모두 조회 가능
 * - 읽기 전용
 */
const PointHistoryPage: React.FC = () => {
  const { user } = useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // childId는 URL 파라미터 또는 context에서 가져오기
  const childIdFromUrl = searchParams.get('childId');
  const childId = childIdFromUrl || (user?.role === 'CHILD' ? user.id : null);
  
  const [pointHistory, setPointHistory] = useState<PointHistory[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPoint, setCurrentPoint] = useState<number>(0); // 현재 남은 포인트
  const [activeTab, setActiveTab] = useState<'ALL' | 'EARN' | 'USE'>('ALL'); // 탭 상태

  // 부모/아이 여부 확인
  const isParent = user?.role === 'PARENT';
  const isChild = user?.role === 'CHILD';

  // childId가 없으면 에러
  useEffect(() => {
    if (!childId) {
      setError('자녀 정보를 찾을 수 없습니다.');
      setLoading(false);
      return;
    }

    // 권한 체크: 부모는 자신의 자녀만, 아이는 본인만 조회 가능
    if (isParent && user?.childrenIds && !user.childrenIds.includes(childId)) {
      setError('접근 권한이 없습니다.');
      setLoading(false);
      return;
    }

    if (isChild && user?.id !== childId) {
      setError('접근 권한이 없습니다.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // 현재 포인트 조회
    getUser(childId)
      .then((childUser) => {
        if (childUser) {
          setCurrentPoint(childUser.totalPoint || 0);
        }
      })
      .catch((error) => {
        // childId일 가능성이 있으므로 조용히 처리 (에러 throw하지 않음)
      });

    // 포인트 사용 이력 구독
    const unsubscribe = subscribePointHistory(childId, (history) => {
      setPointHistory(history);
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [childId, isParent, isChild, user]);

  // 날짜 포맷팅 (YYYY.MM.DD)
  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}.${month}.${day}`;
    } catch (error) {
      return '';
    }
  };

  // 탭별 필터링된 내역
  const filteredHistory = useMemo(() => {
    if (activeTab === 'ALL') {
      return pointHistory; // 모든 내역
    } else if (activeTab === 'EARN') {
      return pointHistory.filter((item) => item.type === 'earn'); // 적립만
    } else if (activeTab === 'USE') {
      return pointHistory.filter((item) => item.type === 'use'); // 사용만
    }
    return [];
  }, [pointHistory, activeTab]);

  // 로딩 스켈레톤 - ChildHome 톤 통일
  if (loading) {
    return (
      <PageLayout headerHeight={NORMAL_HEADER_HEIGHT}>
        <div className="bg-[#FFF9ED] min-h-screen">
          <div className="mx-auto min-h-screen px-5 pt-4 pb-6">
            <header className="flex items-center gap-4 pb-4">
          <button
            onClick={() => navigate(-1)}
                className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/60 transition-colors"
          >
            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-gray-800">포인트 내역</h1>
            </header>

            <div className="bg-gradient-to-r from-yellow-400 to-orange-500 rounded-3xl p-5 shadow-md animate-pulse">
              <div className="h-3 bg-white/30 rounded w-40 mb-3" />
              <div className="h-10 bg-white/30 rounded w-28" />
        </div>

            <div className="flex bg-white rounded-xl p-1 shadow-sm mt-5">
              <div className="flex-1 h-10 bg-gray-100 rounded-lg" />
              <div className="flex-1 h-10 bg-gray-100 rounded-lg mx-1" />
              <div className="flex-1 h-10 bg-gray-100 rounded-lg" />
          </div>

            <div className="mt-4 space-y-4">
          {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-2xl p-4 shadow-md border border-gray-100 animate-pulse">
                  <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-gray-200" />
                      <div>
                        <div className="h-4 bg-gray-200 rounded w-32 mb-2" />
                        <div className="h-3 bg-gray-200 rounded w-24" />
                      </div>
                </div>
                    <div className="h-6 bg-gray-200 rounded w-16" />
              </div>
            </div>
          ))}
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  // 에러 상태 - 동일 톤
  if (error) {
    return (
      <PageLayout headerHeight={NORMAL_HEADER_HEIGHT}>
        <div className="bg-[#FFF9ED] min-h-screen">
          <div className="mx-auto min-h-screen px-5 pt-4 pb-6">
            <header className="flex items-center gap-4 pb-4">
          <button
            onClick={() => navigate(-1)}
                className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/60 transition-colors"
          >
            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-gray-800">포인트 내역</h1>
            </header>

            <div className="bg-white rounded-2xl p-6 shadow-md border border-gray-100 text-center mt-4">
              <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-gray-800 font-semibold mb-1">오류가 발생했어요</p>
              <p className="text-sm text-gray-500 mb-4">{error}</p>
            <button
              onClick={() => navigate(-1)}
                className="px-5 py-2.5 bg-yellow-400 text-white rounded-lg text-sm font-semibold hover:bg-yellow-500 transition duration-200"
            >
              돌아가기
            </button>
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  // 빈 상태 문구 (탭별)
  const getEmptyMessage = () => {
    if (activeTab === 'ALL') {
      return {
        title: '아직 포인트 내역이 없어요',
        description: '미션을 완료하거나 포인트를 사용하면\n여기에 표시돼요',
      };
    } else if (activeTab === 'EARN') {
      return {
        title: '아직 적립된 포인트가 없어요',
        description: '',
      };
    } else if (activeTab === 'USE') {
      return {
        title: '아직 포인트를 사용한 기록이 없어요',
        description: '',
      };
    }
    return {
      title: '아직 포인트 내역이 없어요',
      description: '',
    };
  };

  return (
    <PageLayout headerHeight={NORMAL_HEADER_HEIGHT} className="pb-8">
      <div className="bg-[#FFF9ED] min-h-screen">
        <div className="mx-auto min-h-screen px-5 pt-4 pb-6">
      {/* Header */}
          <header className="flex items-center gap-4 pb-4">
        <button
          onClick={() => navigate(-1)}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/60 transition-colors"
        >
          <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-xl font-bold text-gray-800">포인트 내역</h1>
          </header>

          {/* 상단 포인트 카드 - ChildHome과 동일 그라데이션 */}
          <div className="bg-gradient-to-r from-yellow-400 to-orange-500 rounded-3xl p-5 shadow-md">
            <p className="text-xs text-white/90 mb-1">지금 사용할 수 있는 포인트예요</p>
            <p className="text-4xl font-extrabold text-white leading-none">
              {currentPoint.toLocaleString()}
              <span className="text-base ml-1 font-semibold opacity-90">P</span>
            </p>
      </div>

          {/* 탭 - 또렷한 스타일 */}
          <div className="flex bg-white rounded-xl p-1 shadow-sm mt-5">
          <button
            onClick={() => setActiveTab('ALL')}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition duration-200 ${
              activeTab === 'ALL'
                  ? 'bg-yellow-400 text-white'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            전체
          </button>
          <button
            onClick={() => setActiveTab('EARN')}
              className={`flex-1 rounded-lg px-4 py-2 text-sm transition duration-200 ${
              activeTab === 'EARN'
                  ? 'bg-yellow-400 text-white font-semibold'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            적립
          </button>
          <button
            onClick={() => setActiveTab('USE')}
              className={`flex-1 rounded-lg px-4 py-2 text-sm transition duration-200 ${
              activeTab === 'USE'
                  ? 'bg-yellow-400 text-white font-semibold'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            사용
          </button>
      </div>

      {/* 포인트 내역 리스트 */}
          <div className="mt-4">
        {filteredHistory.length === 0 ? (
          <div className="text-center py-12">
            <div className="mb-4 flex justify-center">
              <Character size="large" showSpeechBubble speechText={getEmptyMessage().title} />
            </div>
                <p className="text-gray-500 text-base mb-1">{getEmptyMessage().title}</p>
            {getEmptyMessage().description && (
                  <p className="text-sm text-gray-400 whitespace-pre-line text-center">
                {getEmptyMessage().description}
              </p>
            )}
          </div>
        ) : (
          filteredHistory.map((item) => {
            const isEarn = item.type === 'earn';
            const isUse = item.type === 'use';
                const isAdjust = item.type === 'adjust';
                // 적립: green, 사용: red, 조정: gray
                const iconBg = isEarn ? 'bg-green-100 text-green-500' : isUse ? 'bg-red-100 text-red-500' : 'bg-gray-100 text-gray-500';
                const amountColor = isEarn ? 'text-green-600' : isUse ? 'text-red-500' : 'text-gray-600';
                const amountSign = isEarn ? '+' : isUse ? '-' : (item.amount >= 0 ? '+' : '');
            
            return (
              <div
                key={item.id}
                    className="bg-white rounded-2xl shadow-md border border-gray-100 p-4 mt-4 flex items-center justify-between transition duration-200 hover:shadow-lg"
              >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {/* 왼쪽 아이콘 - 적립: green, 사용: red, 조정: gray */}
                      <div
                        className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 text-xl ${iconBg}`}
                      >
                        {isEarn ? (
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                          </svg>
                        ) : isUse ? (
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                          </svg>
                        ) : (
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        )}
                  </div>

                  <div className="flex-1 min-w-0">
                        <h3 className="text-base font-semibold text-gray-800 truncate">
                      {item.reason}
                    </h3>
                    {item.rewardTitle && (
                          <p className="text-xs text-gray-500 truncate mt-0.5">{item.rewardTitle}</p>
                    )}
                        <p className="text-xs text-gray-400 mt-1">{formatDate(item.createdAt)}</p>
                      </div>
                  </div>

                    {/* 금액 - 적립: green-600, 사용: red-500, 조정: gray */}
                    <div className={`text-lg font-bold flex-shrink-0 ml-3 ${amountColor}`}>
                      {amountSign}{Math.abs(item.amount)}P
                </div>
              </div>
            );
          })
        )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
};

export default PointHistoryPage;
