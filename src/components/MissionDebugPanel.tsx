import React, { useState, useEffect } from 'react';
import { Mission } from '../types';
import { getMissionStatus } from '../utils/missionDateUtils';

interface MissionDebugPanelProps {
  mission: Mission;
  currentTime?: number;
}

/**
 * 미션 디버그 패널 (개발 모드에서만 표시)
 * 현재 시간, 마감 시간, 상태 판정 결과를 표시
 */
const MissionDebugPanel: React.FC<MissionDebugPanelProps> = ({ 
  mission,
  currentTime = Date.now()
}) => {
  const [now, setNow] = useState<number>(currentTime);

  // 1초마다 현재 시간 업데이트
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // 상태 판정
  const calculatedStatus = getMissionStatus(mission, now);
  const dueAtTime = new Date(mission.dueAt).getTime();
  const remainingTime = dueAtTime - now;
  const isExpired = now >= dueAtTime;

  return (
    <div className="fixed bottom-4 left-4 bg-white border-2 border-blue-500 rounded-lg p-4 shadow-lg z-50 max-w-sm text-xs">
      <div className="font-bold text-blue-600 mb-3 text-sm">🔍 미션 디버그 패널</div>
      
      {/* 미션 정보 */}
      <div className="mb-3 p-2 bg-gray-50 rounded">
        <div className="font-semibold text-gray-700 mb-1">미션 정보</div>
        <div className="text-gray-600">
          <div>ID: {mission.id}</div>
          <div>제목: {mission.title}</div>
          <div>현재 상태: {mission.status}</div>
          <div>계산된 상태: {calculatedStatus}</div>
        </div>
      </div>

      {/* 현재 시간 */}
      <div className="mb-3 p-2 bg-gray-50 rounded">
        <div className="font-semibold text-gray-700 mb-1">현재 클라이언트 시간</div>
        <div className="text-gray-600">
          <div>밀리초: {now}</div>
          <div>ISO: {new Date(now).toISOString()}</div>
          <div>로컬: {new Date(now).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</div>
        </div>
      </div>

      {/* 마감 시간 */}
      <div className="mb-3 p-2 bg-gray-50 rounded">
        <div className="font-semibold text-gray-700 mb-1">마감 시간 (dueAt)</div>
        <div className="text-gray-600">
          <div>원본: {mission.dueAt}</div>
          <div>밀리초: {dueAtTime}</div>
          <div>ISO: {new Date(mission.dueAt).toISOString()}</div>
          <div>로컬: {new Date(mission.dueAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</div>
        </div>
      </div>

      {/* 비교 결과 */}
      <div className={`mb-3 p-2 rounded ${isExpired ? 'bg-red-50' : 'bg-green-50'}`}>
        <div className="font-semibold text-gray-700 mb-1">상태 판정 결과</div>
        <div className={`font-bold ${isExpired ? 'text-red-600' : 'text-green-600'}`}>
          {isExpired ? '❌ 만료됨' : '✅ 진행 중'}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          <div>비교: {now} {'>='} {dueAtTime} = {isExpired ? 'true' : 'false'}</div>
          <div>남은 시간: {formatRemainingTime(remainingTime)}</div>
        </div>
      </div>

      {/* 시간대 정보 */}
      <div className="text-xs text-gray-500">
        <div>타임존: {Intl.DateTimeFormat().resolvedOptions().timeZone}</div>
        <div>오프셋: {new Date().getTimezoneOffset()}분</div>
      </div>
    </div>
  );
};

const formatRemainingTime = (ms: number): string => {
  const abs = Math.abs(ms);
  const seconds = Math.floor(abs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (ms < 0) {
    return `지남: ${days > 0 ? `${days}일 ` : ''}${hours % 24}시간 ${minutes % 60}분`;
  } else {
    return `남음: ${days > 0 ? `${days}일 ` : ''}${hours % 24}시간 ${minutes % 60}분`;
  }
};

export default MissionDebugPanel;

