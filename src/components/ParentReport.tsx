import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useUserPlan } from '../hooks/useUserPlan';
import { hasPremiumAccess } from '../utils/subscription';
import { getUser } from '../firebase/users';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import ShareModal from './ShareModal';
import { ShareCardProps } from './ShareCard';

// ============================================================================
// 타입
// ============================================================================

interface ChildInfo { id: string; name: string }

interface ReportMission {
  id: string;
  childId: string;
  title: string;
  rewardPoint: number;
  approvedAt: string;
}

interface ChildMonthStat {
  completed: number;
  points: number;
  total: number;   // 이번 달 생성된 전체 미션 수 (달성률 분모)
}

interface MonthlyChartItem {
  month: string;
  monthIndex: number;
  year: number;
  children: { childId: string; name: string; value: number }[];
}

// ============================================================================
// 상수
// ============================================================================

const CHART_GRADIENTS = [
  'from-purple-500 to-indigo-400',
  'from-blue-500 to-cyan-400',
  'from-pink-500 to-rose-400',
  'from-green-500 to-emerald-400',
  'from-orange-500 to-amber-400',
];
const CHART_SOLID = ['#8b5cf6', '#3b82f6', '#ec4899', '#10b981', '#f97316'];

// ============================================================================
// 유틸
// ============================================================================

function getThisMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  return { start, end, now };
}

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (typeof (v as any).toDate === 'function') return (v as any).toDate();
  if (typeof v === 'string') { const d = new Date(v); return isNaN(d.getTime()) ? null : d; }
  return null;
}

function formatKoreanMonth(d: Date) {
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
}

function formatDetailDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}

function calcRate(completed: number, total: number) {
  return total > 0 ? Math.round((completed / total) * 100) : 0;
}

// ============================================================================
// 컴포넌트
// ============================================================================

const ALL_TAB = 'ALL';

const ParentReport: React.FC = () => {
  const { user }    = useApp();
  const { userPlan } = useUserPlan();
  const navigate    = useNavigate();

  // ── 기본 상태 ──
  const [children, setChildren]     = useState<ChildInfo[]>([]);
  const [loading,  setLoading]      = useState(true);
  const [activeTab, setActiveTab]   = useState<string>(ALL_TAB);

  // ── 이번 달 완료 미션 (자녀 ID → 목록) ──
  const [missionsByChild, setMissionsByChild]         = useState<Record<string, ReportMission[]>>({});
  const [totalCountByChild, setTotalCountByChild]     = useState<Record<string, number>>({});

  // ── 월별 차트 (자녀 ID → 월 index → 포인트) ──
  const [rawMonthChildMap, setRawMonthChildMap]       = useState<Record<number, Record<string, number>>>({});

  // ── 드릴다운 모달 ──
  const [selectedDetail, setSelectedDetail]           = useState<{ monthIndex: number; childId: string; year: number } | null>(null);
  const [detailMissions, setDetailMissions]           = useState<{ id: string; title: string; approvedAt: string; points: number }[]>([]);

  // ── 승인 대기 ──
  const [pendingCount, setPendingCount] = useState(0);

  // ── 공유 모달 ──
  const [showShareModal, setShowShareModal] = useState(false);

  const parentId = user?.id ?? '';
  const childIds = user?.childrenIds ?? [];

  // ─────────────────────────────────────────────
  // 자녀 목록 로드
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (childIds.length === 0) { setChildren([]); setLoading(false); return; }
    Promise.all(
      childIds.map(async (id) => {
        const u = await getUser(id);
        if (!u || u.isDeleted) return null;
        return { id, name: u.name ?? '자녀' };
      })
    ).then((list) => {
      const valid = list.filter((x): x is ChildInfo => x !== null);
      setChildren(valid);
      setLoading(false);
    });
  }, [childIds.join(',')]);

  // ─────────────────────────────────────────────
  // 승인 대기 구독
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (!db || !parentId) return;
    const q = query(
      collection(db, 'missions'),
      where('parentId', '==', parentId),
      where('status', 'in', ['SUBMITTED', 'PENDING_REVIEW']),
      where('isDeleted', '==', false)
    );
    return onSnapshot(q, (s) => setPendingCount(s.size), () => setPendingCount(0));
  }, [parentId]);

  // ─────────────────────────────────────────────
  // 이번 달 데이터 (전체 자녀, 한 번에 로드)
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (!db || !parentId || children.length === 0) return;
    const { start, end } = getThisMonthRange();

    const fetchAll = async () => {
      // 완료 미션
      const qDone = query(
        collection(db, 'missions'),
        where('parentId', '==', parentId),
        where('status', 'in', ['APPROVED', 'COMPLETED'])
      );
      const snapDone = await getDocs(qDone);
      const byChild: Record<string, ReportMission[]> = {};
      children.forEach((c) => { byChild[c.id] = []; });

      snapDone.forEach((doc) => {
        const d = doc.data();
        const approvedAt = toDate(d.approvedAt);
        if (!approvedAt || approvedAt < start || approvedAt > end) return;
        const cid = d.childId ?? '';
        if (!byChild[cid]) return; // 삭제된 자녀 등 제외
        byChild[cid].push({
          id: doc.id,
          childId: cid,
          title: d.title ?? '미션',
          rewardPoint: Number(d.rewardPoint ?? 0),
          approvedAt: approvedAt.toISOString(),
        });
      });
      // 날짜 내림차순 정렬
      Object.values(byChild).forEach((arr) =>
        arr.sort((a, b) => new Date(b.approvedAt).getTime() - new Date(a.approvedAt).getTime())
      );
      setMissionsByChild(byChild);

      // 전체 미션 수 (달성률 분모)
      const qTotal = query(
        collection(db, 'missions'),
        where('parentId', '==', parentId),
        where('isDeleted', '==', false)
      );
      const snapTotal = await getDocs(qTotal);
      const countByChild: Record<string, number> = {};
      children.forEach((c) => { countByChild[c.id] = 0; });
      snapTotal.forEach((doc) => {
        const d = doc.data();
        const cid = d.childId ?? '';
        if (!(cid in countByChild)) return;
        const createdAt = toDate(d.createdAt);
        if (createdAt && createdAt >= start && createdAt <= end) countByChild[cid]++;
      });
      setTotalCountByChild(countByChild);
    };

    fetchAll();
  }, [parentId, children.map((c) => c.id).join(',')]);

  // ─────────────────────────────────────────────
  // 월별 차트 데이터 (전체 자녀, 6개월)
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (!db || !parentId) return;
    const fetchMonthly = async () => {
      const q = query(
        collection(db, 'missions'),
        where('parentId', '==', parentId),
        where('status', 'in', ['APPROVED', 'COMPLETED', 'PARTIAL_APPROVED'])
      );
      const snap = await getDocs(q);
      const map: Record<number, Record<string, number>> = {};
      snap.forEach((doc) => {
        const d    = doc.data();
        const date = toDate(d.approvedAt);
        if (!date) return;
        const month = date.getMonth();
        const cid   = d.childId ?? '';
        const pts   = Number(d.partialPoint ?? d.rewardPoint ?? 0);
        if (!map[month]) map[month] = {};
        map[month][cid] = (map[month][cid] ?? 0) + pts;
      });
      setRawMonthChildMap(map);
    };
    fetchMonthly();
  }, [parentId]);

  // ─────────────────────────────────────────────
  // 드릴다운 모달 데이터
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (!selectedDetail || !db || !parentId) { setDetailMissions([]); return; }
    const { monthIndex, childId, year } = selectedDetail;
    const start = new Date(year, monthIndex, 1);
    const end   = new Date(year, monthIndex + 1, 0, 23, 59, 59);
    const fetch = async () => {
      const q = query(
        collection(db, 'missions'),
        where('parentId', '==', parentId),
        where('childId', '==', childId),
        where('status', 'in', ['APPROVED', 'COMPLETED', 'PARTIAL_APPROVED'])
      );
      const snap = await getDocs(q);
      const list: { id: string; title: string; approvedAt: string; points: number }[] = [];
      snap.forEach((doc) => {
        const d = doc.data();
        const at = toDate(d.approvedAt);
        if (!at || at < start || at > end) return;
        list.push({ id: doc.id, title: d.title ?? '미션', approvedAt: at.toISOString(), points: Number(d.partialPoint ?? d.rewardPoint ?? 0) });
      });
      list.sort((a, b) => new Date(b.approvedAt).getTime() - new Date(a.approvedAt).getTime());
      setDetailMissions(list);
    };
    fetch();
  }, [selectedDetail, parentId]);

  // ─────────────────────────────────────────────
  // 파생값 계산
  // ─────────────────────────────────────────────
  const { now } = getThisMonthRange();

  // 자녀별 이번 달 통계
  const childStats = useMemo<Record<string, ChildMonthStat>>(() => {
    const map: Record<string, ChildMonthStat> = {};
    children.forEach((c) => {
      const missions  = missionsByChild[c.id] ?? [];
      const completed = missions.length;
      const points    = missions.reduce((s, m) => s + m.rewardPoint, 0);
      const total     = totalCountByChild[c.id] ?? 0;
      map[c.id] = { completed, points, total };
    });
    return map;
  }, [children, missionsByChild, totalCountByChild]);

  // 현재 탭 기준 리포트 카드 데이터
  const isAllTab = activeTab === ALL_TAB;

  const tabMissions = useMemo<ReportMission[]>(() => {
    if (isAllTab) return Object.values(missionsByChild).flat().sort((a, b) => new Date(b.approvedAt).getTime() - new Date(a.approvedAt).getTime());
    return missionsByChild[activeTab] ?? [];
  }, [isAllTab, activeTab, missionsByChild]);

  const tabCompletedCount = tabMissions.length;
  const tabEarnedPoints   = tabMissions.reduce((s, m) => s + m.rewardPoint, 0);
  const tabTotalCount     = isAllTab
    ? Object.values(totalCountByChild).reduce((s, n) => s + n, 0)
    : (totalCountByChild[activeTab] ?? 0);
  const tabCompletionRate = calcRate(tabCompletedCount, tabTotalCount);

  const selectedChildName = isAllTab ? '전체' : (children.find((c) => c.id === activeTab)?.name ?? '자녀');

  // 카드에 표시할 미션 목록 (최대 3개)
  const visibleMissions = tabMissions.slice(0, 3);
  const hiddenCount     = tabMissions.length - visibleMissions.length;

  // ─────────────────────────────────────────────
  // 월별 차트 계산
  // ─────────────────────────────────────────────
  const recentMonths = useMemo(() => {
    const list: { monthIndex: number; label: string; year: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      list.push({ monthIndex: d.getMonth(), label: `${d.getMonth() + 1}월`, year: d.getFullYear() });
    }
    return list;
  }, [now.getFullYear(), now.getMonth()]);

  // 전체 월별 데이터 (모든 자녀)
  const fullMonthlyData = useMemo<MonthlyChartItem[]>(() => {
    return recentMonths.map((m) => ({
      month: m.label,
      monthIndex: m.monthIndex,
      year: m.year,
      children: children.map((c) => ({ childId: c.id, name: c.name, value: rawMonthChildMap[m.monthIndex]?.[c.id] ?? 0 })),
    }));
  }, [recentMonths, children, rawMonthChildMap]);

  // 탭에 따라 차트 필터링
  const chartMonthlyData = useMemo<MonthlyChartItem[]>(() => {
    if (isAllTab) return fullMonthlyData;
    return fullMonthlyData.map((item) => ({
      ...item,
      children: item.children.filter((c) => c.childId === activeTab),
    }));
  }, [isAllTab, activeTab, fullMonthlyData]);

  const maxChartValue = useMemo(
    () => Math.max(...chartMonthlyData.flatMap((d) => d.children.map((c) => c.value)), 1),
    [chartMonthlyData]
  );

  const childColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    children.forEach((c, i) => { map[c.id] = CHART_GRADIENTS[i % CHART_GRADIENTS.length]; });
    return map;
  }, [children]);

  const childSolidMap = useMemo(() => {
    const map: Record<string, string> = {};
    children.forEach((c, i) => { map[c.id] = CHART_SOLID[i % CHART_SOLID.length]; });
    return map;
  }, [children]);

  // ─────────────────────────────────────────────
  // 공유
  // ─────────────────────────────────────────────
  // 공유 카드에 전달할 props 계산
  const shareCardProps = useMemo<ShareCardProps>(() => {
    const avgRate = isAllTab && children.length > 1
      ? Math.round(children.reduce((s, c) => s + calcRate(childStats[c.id]?.completed ?? 0, childStats[c.id]?.total ?? 0), 0) / (children.length || 1))
      : tabCompletionRate;

    return {
      month: formatKoreanMonth(now),
      childName: selectedChildName,
      completedCount: tabCompletedCount,
      earnedPoints: tabEarnedPoints,
      completionRate: avgRate,
      isAllTab,
      missions: isAllTab ? [] : tabMissions.slice(0, 3).map((m) => ({ id: m.id, title: m.title, rewardPoint: m.rewardPoint })),
      hiddenCount: isAllTab ? 0 : Math.max(0, tabMissions.length - 3),
      childSummaries: isAllTab
        ? children.map((c) => ({
            id: c.id,
            name: c.name,
            points: childStats[c.id]?.points ?? 0,
            rate: calcRate(childStats[c.id]?.completed ?? 0, childStats[c.id]?.total ?? 0),
            color: childSolidMap[c.id] ?? '#9ca3af',
          }))
        : [],
    };
  }, [isAllTab, children, childStats, tabMissions, tabCompletedCount, tabEarnedPoints, tabCompletionRate, selectedChildName, now, childSolidMap]);

  const closeDetail = useCallback(() => { setSelectedDetail(null); setDetailMissions([]); }, []);

  // ─────────────────────────────────────────────
  // 렌더
  // ─────────────────────────────────────────────

  if (!hasPremiumAccess(userPlan)) {
    return (
      <div className="mx-auto px-4">
        <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
          <div className="text-4xl mb-3">🔒</div>
          <h2 className="text-lg font-semibold mb-2">리포트는 프리미엄 플랜에서 제공됩니다</h2>
          <p className="text-sm text-gray-500 mb-4">자녀별 통계와 분석을 확인해보세요</p>
          <button type="button" onClick={() => navigate('/parent/subscription')} className="w-full bg-purple-500 text-white py-3 rounded-xl">
            월 2,900원으로 업그레이드
          </button>
        </div>
      </div>
    );
  }

  if (loading && children.length === 0 && childIds.length > 0) {
    return <div className="flex min-h-[200px] items-center justify-center p-4"><p className="text-sm text-gray-500">로딩 중...</p></div>;
  }

  if (children.length === 0) {
    return <div className="mx-auto px-4 py-10 text-center"><p className="text-gray-400 text-sm">등록된 자녀가 없어요</p></div>;
  }

  return (
    <div className="mx-auto px-4 pb-10">

      {/* ── 탭 (전체 + 자녀별) ── */}
      <div className="flex gap-2 mt-4 overflow-x-auto pb-1 no-scrollbar">
        {/* 전체 탭 */}
        <button
          type="button"
          onClick={() => setActiveTab(ALL_TAB)}
          className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            activeTab === ALL_TAB
              ? 'bg-orange-500 text-white shadow-sm'
              : 'bg-white border border-gray-200 text-gray-600'
          }`}
        >
          전체
        </button>
        {/* 자녀별 탭 */}
        {children.map((child) => (
          <button
            key={child.id}
            type="button"
            onClick={() => setActiveTab(child.id)}
            className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeTab === child.id
                ? 'bg-orange-500 text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-600'
            }`}
          >
            {child.name}
          </button>
        ))}
      </div>

      {/* ── 리포트 카드 헤더 (공유 버튼) ── */}
      <div className="flex items-center justify-between mt-4 mb-2">
        <span className="text-sm font-medium text-gray-500">이번 달 리포트</span>
        <button
          type="button"
          onClick={() => setShowShareModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-full shadow-sm transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          공유하기
        </button>
      </div>

      {/* ── 리포트 카드 (화면 표시용) ── */}
      <div className="rounded-2xl overflow-hidden shadow-md bg-white">

        {/* 주황 헤더 */}
        <div className="bg-orange-500 px-5 py-4">
          <p className="text-orange-100 text-xs font-medium">{formatKoreanMonth(now)}</p>
          <h2 className="text-white text-xl font-bold mt-0.5">
            {selectedChildName}의 미션 리포트
          </h2>
        </div>

        {/* ── 전체 탭 전용: 자녀별 요약 ── */}
        {isAllTab && children.length > 1 && (
          <div className="px-4 pt-4 pb-2 space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">자녀별 현황</p>
            {children.map((child, i) => {
              const stat = childStats[child.id];
              const rate = stat ? calcRate(stat.completed, stat.total) : 0;
              return (
                <div key={child.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: childSolidMap[child.id] }} />
                    <p className="text-sm font-medium text-gray-800 truncate">{child.name}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                    <span className="text-sm font-semibold text-green-600">+{(stat?.points ?? 0).toLocaleString()}P</span>
                    <span className="text-xs text-gray-400 bg-white border border-gray-200 rounded-full px-2 py-0.5">{rate}%</span>
                  </div>
                </div>
              );
            })}
            <div className="border-t border-gray-100 mt-2 pt-2" />
          </div>
        )}

        {/* 통계 3개 카드 */}
        <div className={`grid grid-cols-3 gap-3 px-4 ${isAllTab && children.length > 1 ? 'pt-1 pb-4' : 'py-4'}`}>
          <div className="bg-orange-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-extrabold text-orange-500">{tabCompletedCount}</p>
            <p className="text-xs text-gray-500 mt-0.5">완료 미션</p>
          </div>
          <div className="bg-green-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-extrabold text-green-500">{tabEarnedPoints.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-0.5">획득 포인트</p>
          </div>
          <div className="bg-blue-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-extrabold text-blue-500">
              {isAllTab && children.length > 1
                ? `${Math.round(children.reduce((s, c) => s + calcRate(childStats[c.id]?.completed ?? 0, childStats[c.id]?.total ?? 0), 0) / (children.length || 1))}%`
                : `${tabCompletionRate}%`
              }
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{isAllTab && children.length > 1 ? '평균 달성률' : '달성률'}</p>
          </div>
        </div>

        {/* 완료 미션 목록 */}
        <div className="px-4 pb-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">완료한 미션</p>
          {visibleMissions.length === 0 ? (
            <p className="text-sm text-gray-400 py-3 text-center">이번 달 완료한 미션이 없어요</p>
          ) : (
            <div className="space-y-2">
              {visibleMissions.map((m) => (
                <div key={m.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    {/* 전체 탭이면 자녀 컬러 dot 표시 */}
                    {isAllTab && children.length > 1 ? (
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: childSolidMap[m.childId] ?? '#9ca3af' }} />
                    ) : (
                      <span className="text-green-500 text-sm flex-shrink-0">✅</span>
                    )}
                    <p className="text-sm text-gray-800 font-medium truncate">{m.title}</p>
                  </div>
                  <span className="text-sm font-semibold text-green-600 flex-shrink-0 ml-2">+{m.rewardPoint}P</span>
                </div>
              ))}
              {hiddenCount > 0 && (
                <p className="text-xs text-gray-400 text-center pt-1">{hiddenCount}개 더 있어요</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── 월별 차트 ── */}
      <div className="bg-white rounded-2xl p-4 mt-4 shadow-sm">
        <h3 className="text-sm font-semibold mb-1">📊 월별 지급 차트</h3>
        <p className="text-xs text-gray-400 mb-3">
          최근 6개월 기준
          {!isAllTab && ` · ${selectedChildName}`}
        </p>

        <div className="flex items-end justify-between h-44 px-2 border-t border-gray-100 pt-4">
          {chartMonthlyData.map((item, idx) => {
            const childCount  = item.children.length || 1;
            const barWidth    = Math.max(8, 24 / childCount);
            const isCurMonth  = item.monthIndex === now.getMonth() && item.year === now.getFullYear();
            return (
              <div key={idx} className="flex flex-col items-center flex-1">
                <div className="flex items-end h-full w-full justify-center gap-1">
                  {item.children.map((child) => {
                    const baseH  = (child.value / maxChartValue) * 100;
                    const height = child.value === 0 ? 4 : Math.max(baseH, 10);
                    return (
                      <div
                        key={child.childId}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedDetail({ monthIndex: item.monthIndex, childId: child.childId, year: item.year })}
                        onKeyDown={(e) => e.key === 'Enter' && setSelectedDetail({ monthIndex: item.monthIndex, childId: child.childId, year: item.year })}
                        className={`rounded-t-md bg-gradient-to-t ${childColorMap[child.childId] ?? CHART_GRADIENTS[0]} cursor-pointer hover:opacity-80 transition-opacity min-h-[4px]`}
                        style={{ width: `${barWidth}px`, height: `${height}px` }}
                        title={`${child.name}: ${child.value.toLocaleString()}P`}
                      />
                    );
                  })}
                </div>
                <span className={`text-xs mt-1.5 ${isCurMonth ? 'font-bold text-orange-500' : 'text-gray-400'}`}>
                  {item.month}
                </span>
              </div>
            );
          })}
        </div>

        {/* 범례: 전체 탭 + 자녀 2명 이상일 때만 */}
        {isAllTab && children.length > 1 && (
          <div className="flex flex-wrap gap-3 mt-3 text-xs">
            {children.map((child) => (
              <div key={child.id} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: childSolidMap[child.id] }} />
                <span className="text-gray-600">{child.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 공유 모달 ── */}
      {showShareModal && (
        <ShareModal {...shareCardProps} onClose={() => setShowShareModal(false)} />
      )}

      {/* ── 드릴다운 모달 ── */}
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
            className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full bg-white rounded-t-3xl p-5 z-50"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0) + 1.25rem)' }}
          >
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
            <h3 className="text-xl font-bold tracking-tight mb-1">
              {selectedDetail.year}년 {selectedDetail.monthIndex + 1}월
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              {children.find((c) => c.id === selectedDetail.childId)?.name ?? '자녀'} 활동 내역
            </p>
            <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 mb-4">
              <p className="text-sm text-gray-500">이 달 총 지급</p>
              <p className="text-orange-600 text-2xl font-bold">
                {(rawMonthChildMap[selectedDetail.monthIndex]?.[selectedDetail.childId] ?? 0).toLocaleString()}P
              </p>
            </div>
            <div className="max-h-60 overflow-y-auto space-y-2">
              {detailMissions.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">완료된 미션이 없어요</p>
              ) : detailMissions.map((m) => (
                <div key={m.id} className="border border-gray-100 rounded-xl px-4 py-3 shadow-sm">
                  <p className="text-sm font-medium text-gray-800">{m.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatDetailDate(m.approvedAt)}</p>
                  <p className="text-sm text-green-500 font-semibold mt-1">+{m.points}P</p>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={closeDetail}
              className="w-full mt-4 bg-gray-900 text-white rounded-xl py-3 text-sm font-medium active:scale-95 transition"
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
