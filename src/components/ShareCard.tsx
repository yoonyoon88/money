import React from 'react';

// ============================================================================
// 타입
// ============================================================================

export interface ShareCardMission {
  id: string;
  title: string;
  rewardPoint: number;
}

export interface ShareCardChildSummary {
  id: string;
  name: string;
  points: number;
  rate: number;
  color: string; // hex
}

export interface ShareCardProps {
  month: string;           // "2026년 4월"
  childName: string;       // "전체" or specific name
  completedCount: number;
  earnedPoints: number;
  completionRate: number;
  isAllTab: boolean;
  // 개별 탭 전용
  missions?: ShareCardMission[];
  hiddenCount?: number;
  // 전체 탭 전용
  childSummaries?: ShareCardChildSummary[];
}

// ============================================================================
// 컴포넌트
// ============================================================================

const ShareCard = React.forwardRef<HTMLDivElement, ShareCardProps>((props, ref) => {
  const {
    month,
    childName,
    completedCount,
    earnedPoints,
    completionRate,
    isAllTab,
    missions = [],
    hiddenCount = 0,
    childSummaries = [],
  } = props;

  return (
    <div
      ref={ref}
      style={{ width: 360, backgroundColor: '#ffffff', fontFamily: 'sans-serif' }}
      className="rounded-2xl overflow-hidden shadow-lg"
    >
      {/* ── 주황 헤더 ── */}
      <div style={{ backgroundColor: '#f97316', padding: '16px 20px' }}>
        <p style={{ color: '#fed7aa', fontSize: 12, margin: 0 }}>{month}</p>
        <p style={{ color: '#ffffff', fontSize: 20, fontWeight: 800, margin: '4px 0 0' }}>
          {isAllTab ? '우리 가족 미션 리포트' : `${childName}의 미션 리포트`}
        </p>
      </div>

      {/* ── 전체 탭: 자녀별 포인트 요약 ── */}
      {isAllTab && childSummaries.length > 1 && (
        <div style={{ padding: '16px 16px 8px' }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }}>
            자녀별 현황
          </p>
          {childSummaries.map((child) => (
            <div
              key={child.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: '#f9fafb',
                borderRadius: 12,
                padding: '10px 12px',
                marginBottom: 6,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: child.color, flexShrink: 0 }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: '#1f2937' }}>{child.name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#16a34a' }}>+{child.points.toLocaleString()}P</span>
                <span style={{
                  fontSize: 11,
                  color: '#6b7280',
                  backgroundColor: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: 999,
                  padding: '2px 8px',
                }}>
                  {child.rate}%
                </span>
              </div>
            </div>
          ))}
          <div style={{ borderTop: '1px solid #f3f4f6', marginTop: 8 }} />
        </div>
      )}

      {/* ── 통계 3개 ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: 10,
        padding: isAllTab && childSummaries.length > 1 ? '4px 16px 16px' : '16px',
      }}>
        <div style={{ backgroundColor: '#fff7ed', borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
          <p style={{ fontSize: 24, fontWeight: 800, color: '#f97316', margin: 0 }}>{completedCount}</p>
          <p style={{ fontSize: 11, color: '#6b7280', margin: '2px 0 0' }}>완료 미션</p>
        </div>
        <div style={{ backgroundColor: '#f0fdf4', borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
          <p style={{ fontSize: completedCount >= 1000 ? 18 : 24, fontWeight: 800, color: '#16a34a', margin: 0 }}>
            {earnedPoints.toLocaleString()}
          </p>
          <p style={{ fontSize: 11, color: '#6b7280', margin: '2px 0 0' }}>획득 포인트</p>
        </div>
        <div style={{ backgroundColor: '#eff6ff', borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
          <p style={{ fontSize: 24, fontWeight: 800, color: '#2563eb', margin: 0 }}>{completionRate}%</p>
          <p style={{ fontSize: 11, color: '#6b7280', margin: '2px 0 0' }}>{isAllTab && childSummaries.length > 1 ? '평균 달성률' : '달성률'}</p>
        </div>
      </div>

      {/* ── 개별 탭: 완료 미션 목록 ── */}
      {!isAllTab && (
        <div style={{ padding: '0 16px 16px' }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }}>
            완료한 미션
          </p>
          {missions.length === 0 ? (
            <p style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: '12px 0', margin: 0 }}>
              이번 달 완료한 미션이 없어요
            </p>
          ) : (
            <>
              {missions.map((m) => (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    backgroundColor: '#f9fafb',
                    borderRadius: 12,
                    padding: '10px 12px',
                    marginBottom: 6,
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, color: '#22c55e', flexShrink: 0, lineHeight: '20px' }}>✅</span>
                    {/* 텍스트 줄바꿈 허용 — 잘림 없음 */}
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#1f2937', margin: 0, lineHeight: 1.4, wordBreak: 'break-word' }}>
                      {m.title}
                    </p>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#16a34a', flexShrink: 0, lineHeight: '20px' }}>
                    +{m.rewardPoint}P
                  </span>
                </div>
              ))}
              {hiddenCount > 0 && (
                <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', margin: '4px 0 0' }}>
                  {hiddenCount}개 더 있어요
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* ── 하단 앱 배지 ── */}
      <div style={{
        borderTop: '1px solid #f3f4f6',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <img
          src="/app-icon.png"
          alt="용돈주세요 앱 아이콘"
          style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0, objectFit: 'cover' }}
          crossOrigin="anonymous"
        />
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#1f2937', margin: 0 }}>용돈주세요</p>
          <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0 0' }}>용돈주세요 앱으로 기록했어요</p>
        </div>
      </div>
    </div>
  );
});

ShareCard.displayName = 'ShareCard';
export default ShareCard;
