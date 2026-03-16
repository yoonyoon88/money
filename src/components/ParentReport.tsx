import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useUserPlan } from '../hooks/useUserPlan';
import { hasPremiumAccess } from '../utils/subscription';
import { subscribePointHistory, PointHistory } from '../firebase/pointHistory';
import { getUser } from '../firebase/users';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';

interface ChildSummary {
  id: string;
  name: string;
  monthTotal: number;
}

// 프리미엄용 통계 카드
const StatCard: React.FC<{ title: string; value: string }> = ({ title, value }) => (
  <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
    <p className="text-xs text-gray-500">{title}</p>
    <p className="mt-1 text-lg font-bold text-gray-800">{value}</p>
  </div>
);

// 월별 차트 데이터 타입 (자녀별 월 비교)
interface MonthlyChartChild {
  childId: string;
  name: string;
  value: number;
}
interface MonthlyChartItem {
  month: string;
  monthIndex: number;
  year: number;
  children: MonthlyChartChild[];
}

// 자녀별 월 비교 차트용 색상 (childId 고정 매핑)
const CHART_CHILD_GRADIENTS = [
  'from-purple-500 to-indigo-400',
  'from-blue-500 to-cyan-400',
  'from-pink-500 to-rose-400',
  'from-green-500 to-emerald-400',
  'from-orange-500 to-amber-400',
];

const ParentReport: React.FC = () => {
  const { user } = useApp();
  const { userPlan } = useUserPlan();
  const navigate = useNavigate();
  const [children, setChildren] = useState<Omit<ChildSummary, 'monthTotal'>[]>([]);
  const [historyByChild, setHistoryByChild] = useState<Record<string, PointHistory[]>>({});
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [rawMonthChildMap, setRawMonthChildMap] = useState<Record<number, Record<string, number>>>({});
  const [selectedDetail, setSelectedDetail] = useState<{
    monthIndex: number;
    childId: string;
    year: number;
  } | null>(null);
  const [detailMissions, setDetailMissions] = useState<{
    id: string;
    title: string;
    approvedAt: string;
    points: number;
  }[]>([]);

  const parentId = user?.id ?? '';
  const childIds = user?.childrenIds ?? [];

  // 자녀 이름 로드 (삭제된 자녀 isDeleted=true 제외)
  useEffect(() => {
    if (childIds.length === 0) {
      setChildren([]);
      setLoading(false);
      return;
    }
    Promise.all(
      childIds.map(async (id) => {
        const u = await getUser(id);
        if (!u || u.isDeleted === true) return null;
        return { id, name: u.name ?? '자녀' };
      })
    ).then((list) => {
      setChildren(list.filter((x): x is { id: string; name: string } => x !== null));
      setLoading(false);
    });
  }, [childIds.join(',')]);

  // 삭제되지 않은 자녀 ID만 사용 (리포트 전체에서 사용)
  const activeChildIds = useMemo(() => children.map((c) => c.id), [children]);

  // 자녀별 포인트 이력 구독 (activeChildIds 기준)
  useEffect(() => {
    if (activeChildIds.length === 0) {
      setHistoryByChild({});
      return;
    }
    const unsubscribes = activeChildIds.map((childId) =>
      subscribePointHistory(childId, (history) => {
        setHistoryByChild((prev) => ({ ...prev, [childId]: history }));
      })
    );
    return () => {
      unsubscribes.forEach((u) => u());
    };
  }, [activeChildIds.join(',')]);

  const allPointHistory = useMemo(() => {
    const list: PointHistory[] = [];
    Object.values(historyByChild).forEach((arr) => list.push(...arr));
    return list.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [historyByChild]);

  // 승인 대기 미션 수 구독
  useEffect(() => {
    if (!db || !parentId) {
      setPendingCount(0);
      return;
    }
    const q = query(
      collection(db, 'missions'),
      where('parentId', '==', parentId),
      where('status', 'in', ['SUBMITTED', 'PENDING_REVIEW']),
      where('isDeleted', '==', false)
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => setPendingCount(snapshot.size),
      () => setPendingCount(0)
    );
    return () => unsubscribe();
  }, [parentId]);

  // 프리미엄: 승인된 미션 기준 월별·자녀별 지급 조회
  useEffect(() => {
    const fetchMonthlyData = async () => {
      if (!db || !parentId) {
        setRawMonthChildMap({});
        return;
      }
      const q = query(
        collection(db, 'missions'),
        where('parentId', '==', parentId),
        where('status', 'in', ['APPROVED', 'COMPLETED', 'PARTIAL_APPROVED'])
      );
      const snapshot = await getDocs(q);
      const monthChildMap: Record<number, Record<string, number>> = {};

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const date = data.approvedAt?.toDate?.()
          ? data.approvedAt.toDate()
          : typeof data.approvedAt === 'string'
            ? new Date(data.approvedAt)
            : null;
        if (!date) return;

        const month = date.getMonth();
        const childId = data.childId ?? '';
        const points = Number(data.partialPoint ?? data.rewardPoint ?? 0);

        if (!monthChildMap[month]) {
          monthChildMap[month] = {};
        }
        if (!monthChildMap[month][childId]) {
          monthChildMap[month][childId] = 0;
        }
        monthChildMap[month][childId] += points;
      });

      setRawMonthChildMap(monthChildMap);
    };
    fetchMonthlyData();
  }, [parentId]);

  const now = new Date();
  const recentMonths = useMemo(() => {
    const list: { monthIndex: number; label: string; year: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      list.push({
        monthIndex: d.getMonth(),
        label: `${d.getMonth() + 1}월`,
        year: d.getFullYear(),
      });
    }
    return list;
  }, [now.getFullYear(), now.getMonth()]);

  // 최근 6개월 + 자녀 목록으로 포맷팅
  const monthlyData = useMemo<MonthlyChartItem[]>(() => {
    return recentMonths.map((m) => {
      const childrenData: MonthlyChartChild[] = children.map((c) => ({
        childId: c.id,
        name: c.name,
        value: rawMonthChildMap[m.monthIndex]?.[c.id] ?? 0,
      }));
      return {
        month: m.label,
        monthIndex: m.monthIndex,
        year: m.year,
        children: childrenData,
      };
    });
  }, [recentMonths, children, rawMonthChildMap]);

  const startOfMonth = useMemo(
    () => new Date(now.getFullYear(), now.getMonth(), 1),
    [now]
  );

  const isThisMonth = (dateStr: string) => new Date(dateStr) >= startOfMonth;
  const earnOnly = (p: PointHistory) => p.type === 'earn';

  const thisMonthTotal = useMemo(
    () =>
      allPointHistory
        .filter((p) => earnOnly(p) && isThisMonth(p.createdAt))
        .reduce((sum, p) => sum + p.amount, 0),
    [allPointHistory, startOfMonth]
  );

  const perChildThisMonth = useMemo(() => {
    const map: Record<string, number> = {};
    activeChildIds.forEach((id) => {
      map[id] = allPointHistory
        .filter((p) => p.childId === id && earnOnly(p) && isThisMonth(p.createdAt))
        .reduce((s, p) => s + p.amount, 0);
    });
    return map;
  }, [allPointHistory, activeChildIds, startOfMonth]);

  // 자녀별 지급 리스트용 (이름 + monthTotal)
  const childrenWithTotal = useMemo<ChildSummary[]>(
    () =>
      children.map((c) => ({
        ...c,
        monthTotal: perChildThisMonth[c.id] ?? 0,
      })),
    [children, perChildThisMonth]
  );

  const maxChartValue = useMemo(() => {
    const allValues = monthlyData.flatMap((d) => d.children.map((c) => c.value));
    return Math.max(...allValues, 1);
  }, [monthlyData]);

  const childColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    children.forEach((child, index) => {
      map[child.id] = CHART_CHILD_GRADIENTS[index % CHART_CHILD_GRADIENTS.length];
    });
    return map;
  }, [children]);

  const handleBarClick = (monthIndex: number, childId: string, year: number) => {
    setSelectedDetail({ monthIndex, childId, year });
  };

  const closeDetail = () => {
    setSelectedDetail(null);
    setDetailMissions([]);
  };

  // 모달: 선택한 월·자녀의 승인 미션 목록 조회
  useEffect(() => {
    if (!selectedDetail || !db || !parentId) {
      setDetailMissions([]);
      return;
    }
    const start = new Date(selectedDetail.year, selectedDetail.monthIndex, 1);
    const end = new Date(selectedDetail.year, selectedDetail.monthIndex + 1, 0, 23, 59, 59);
    const startTime = start.getTime();
    const endTime = end.getTime();

    const fetchDetail = async () => {
      const q = query(
        collection(db, 'missions'),
        where('parentId', '==', parentId),
        where('childId', '==', selectedDetail.childId),
        where('status', 'in', ['APPROVED', 'COMPLETED', 'PARTIAL_APPROVED'])
      );
      const snapshot = await getDocs(q);
      const list: { id: string; title: string; approvedAt: string; points: number }[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const approvedAt = data.approvedAt?.toDate?.()
          ? data.approvedAt.toDate()
          : typeof data.approvedAt === 'string'
            ? new Date(data.approvedAt)
            : null;
        if (!approvedAt) return;
        const t = approvedAt.getTime();
        if (t < startTime || t > endTime) return;
        const points = Number(data.partialPoint ?? data.rewardPoint ?? 0);
        list.push({
          id: docSnap.id,
          title: data.title ?? '미션',
          approvedAt: approvedAt.toISOString(),
          points,
        });
      });
      list.sort((a, b) => new Date(b.approvedAt).getTime() - new Date(a.approvedAt).getTime());
      setDetailMissions(list);
    };
    fetchDetail();
  }, [selectedDetail, parentId]);

  const getMonthLabel = (monthIndex: number, year?: number) =>
    year != null ? `${year}년 ${monthIndex + 1}월` : `${monthIndex + 1}월`;
  const getChildName = (childId: string) => children.find((c) => c.id === childId)?.name ?? '자녀';
  const getMonthTotal = (monthIndex: number, childId: string) =>
    rawMonthChildMap[monthIndex]?.[childId] ?? 0;
  const formatDetailDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  };

  useEffect(() => {
    if (children.length > 0 || childIds.length === 0) setLoading(false);
  }, [children.length, childIds.length]);

  // ---------- 1) 무료: 잠금 화면 ----------
  if (!hasPremiumAccess(userPlan)) {
    return (
      <div className="mx-auto px-4">
        <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
          <div className="text-4xl mb-3">🔒</div>
          <h2 className="text-lg font-semibold mb-2">
            리포트는 프리미엄 플랜에서 제공됩니다
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            자녀별 통계와 분석을 확인해보세요
          </p>
          <button
            type="button"
            onClick={() => navigate('/parent/subscription')}
            className="w-full bg-purple-500 text-white py-3 rounded-xl"
          >
            월 2,900원으로 업그레이드
          </button>
        </div>
      </div>
    );
  }

  // 로딩 (프리미엄 접근 시 해당)
  if (loading && children.length === 0 && childIds.length > 0) {
    return (
      <div className="flex min-h-[200px] items-center justify-center p-4">
        <p className="text-sm text-gray-500">로딩 중...</p>
      </div>
    );
  }

  // ---------- 2) 프리미엄: 기본 통계 + 자녀별 지급 ----------
  return (
    <div className="mx-auto px-4">
      {/* 상단 3개 카드 */}
      <div className="grid grid-cols-3 gap-3 mt-4">
        <StatCard title="이번 달 지급" value={`${thisMonthTotal.toLocaleString()}P`} />
        <StatCard title="승인 대기" value={`${pendingCount}건`} />
        <StatCard title="자녀 수" value={`${activeChildIds.length}명`} />
      </div>

      {/* 자녀별 이번 달 지급 */}
      <div className="bg-white rounded-2xl p-4 mt-4 shadow-sm">
        <h3 className="text-sm font-semibold mb-3">
          자녀별 이번 달 지급
        </h3>
        {childrenWithTotal.length === 0 ? (
          <p className="text-sm text-gray-500">자녀가 없습니다.</p>
        ) : (
          childrenWithTotal.map((child) => (
            <div
              key={child.id}
              className="flex justify-between text-sm py-2 border-b border-gray-100 last:border-0"
            >
              <span>{child.name}</span>
              <span>{child.monthTotal.toLocaleString()}P</span>
            </div>
          ))
        )}
      </div>

      {/* ---------- 4) 프리미엄 전용: 월별 지급 차트 ---------- */}
      {hasPremiumAccess(userPlan) && (
        <div className="bg-white rounded-2xl p-4 mt-4 shadow-sm hover:shadow-md transition">
          <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
            📊 월별 지급 차트
          </h3>
          <p className="text-xs text-gray-400 mb-3">
            최근 6개월 기준
          </p>
          <div className="flex items-end justify-between h-52 px-2 border-t border-gray-100 pt-4">
            {monthlyData.map((item, idx) => {
              const childCount = item.children.length;
              const barWidth = Math.max(8, 24 / (childCount || 1));
              const isCurrentMonth = item.monthIndex === new Date().getMonth();
              return (
                <div key={idx} className="flex flex-col items-center flex-1">
                  <div
                    className="flex items-end h-full w-full justify-center"
                    style={{ gap: '4px' }}
                  >
                    {item.children.map((child, childIdx) => {
                      const baseHeight = (child.value / maxChartValue) * 120;
                      const height = child.value === 0 ? 6 : Math.max(baseHeight, 12);
                      return (
                        <div
                          key={child.childId}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleBarClick(item.monthIndex, child.childId, item.year)}
                          onKeyDown={(e) => e.key === 'Enter' && handleBarClick(item.monthIndex, child.childId, item.year)}
                          className={`rounded-t-md bg-gradient-to-t ${childColorMap[child.childId] ?? CHART_CHILD_GRADIENTS[0]} cursor-pointer hover:scale-105 transition-all duration-300 min-h-[6px]`}
                          style={{
                            width: `${barWidth}px`,
                            height: `${height}px`,
                            paddingLeft: '2px',
                            paddingRight: '2px',
                          }}
                          title={`${child.name}: ${child.value}P`}
                        />
                      );
                    })}
                  </div>
                  <span
                    className={`text-xs mt-2 ${
                      isCurrentMonth ? 'font-semibold text-purple-600' : 'text-gray-500'
                    }`}
                  >
                    {item.month}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-3 mt-4 text-xs">
            {children.map((child) => (
              <div key={child.id} className="flex items-center gap-2">
                <div
                  className={`w-3 h-3 rounded-full bg-gradient-to-t ${childColorMap[child.id] ?? CHART_CHILD_GRADIENTS[0]}`}
                />
                <span className="text-gray-700 font-medium">
                  {child.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---------- 5) 리포트 하단: 개발자 후원 카드 (현재 비활성화) ---------- */}
      {/*
      <div
        role="button"
        tabIndex={0}
        onClick={() => navigate('/support-developer')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            navigate('/support-developer');
          }
        }}
        className="bg-yellow-50 rounded-2xl p-4 mt-6 border border-yellow-200 cursor-pointer active:scale-[0.99]"
      >
        <div className="font-semibold">
          앱이 도움이 되셨나요? ☕
        </div>
        <div className="text-sm text-gray-600 mt-1">
          광고 없이 서비스를 유지하기 위해 노력하고 있습니다.
          <br />
          작은 후원이 큰 힘이 됩니다.
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            navigate('/support-developer');
          }}
          className="bg-purple-500 text-white rounded-xl px-4 py-2 mt-3 w-full"
        >
          개발자 후원하기
        </button>
      </div>
      */}

      {/* 하단 슬라이드 모달 */}
      {selectedDetail && (
        <>
          <div
            role="button"
            tabIndex={0}
            onClick={closeDetail}
            onKeyDown={(e) => e.key === 'Escape' && closeDetail()}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
            aria-label="모달 닫기"
          />
          <div
            className="
              fixed bottom-0 left-1/2
              -translate-x-1/2
              w-full
              bg-white
              rounded-t-3xl
              p-5
              z-50
              animate-slideUp
            "
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0) + 1.25rem)' }}
          >
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
            <h3 className="text-xl font-bold tracking-tight mb-1">
              {getMonthLabel(selectedDetail.monthIndex, selectedDetail.year)}
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              {getChildName(selectedDetail.childId)} 활동 내역
            </p>
            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-100 rounded-xl p-3 mb-4">
              <p className="text-sm text-gray-500">이번 달 총 지급</p>
              <p className="text-purple-700 text-2xl font-bold">
                {getMonthTotal(selectedDetail.monthIndex, selectedDetail.childId).toLocaleString()}P
              </p>
            </div>
            <div className="max-h-60 overflow-y-auto space-y-3">
              {detailMissions.map((mission) => (
                <div
                  key={mission.id}
                  className="border border-gray-100 rounded-xl p-4 shadow-sm hover:shadow-md transition"
                >
                  <p className="text-sm font-medium">{mission.title}</p>
                  <p className="text-xs text-gray-400">
                    {formatDetailDate(mission.approvedAt)}
                  </p>
                  <p className="text-sm text-green-500 font-semibold mt-1">
                    +{mission.points}P
                  </p>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={closeDetail}
              className="w-full mt-5 bg-black text-white rounded-xl py-3 text-sm font-medium active:scale-95 transition"
            >
              닫기
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default ParentReport;
