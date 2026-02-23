import React, { useState, useEffect } from 'react';
import { Timestamp, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import { debugError } from '../utils/debug';

/**
 * 시간 디버그 패널 컴포넌트
 * 현재 시간 기준과 Firestore 서버 시간을 비교하여 표시
 */
const TimeDebugPanel: React.FC<{ missionDueAt?: string; currentTime?: number }> = ({ missionDueAt, currentTime: propCurrentTime }) => {
  const [currentTime, setCurrentTime] = useState<number>(propCurrentTime || Date.now());
  const [serverTime, setServerTime] = useState<number | null>(null);
  const [comparisonResult, setComparisonResult] = useState<{
    isExpired: boolean;
    diff: number;
    diffText: string;
  } | null>(null);

  // prop으로 받은 currentTime이 있으면 사용, 없으면 자체 업데이트
  useEffect(() => {
    if (propCurrentTime !== undefined) {
      setCurrentTime(propCurrentTime);
      return; // prop으로 받으면 자체 interval 불필요
    }

    // prop이 없으면 자체적으로 1초마다 업데이트
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [propCurrentTime]);

  // Firestore 서버 시간 가져오기 (한 번만)
  useEffect(() => {
    const fetchServerTime = async () => {
      try {
        // Firestore의 임시 문서를 생성하여 serverTimestamp 가져오기
        // 실제로는 별도의 서버 시간 문서를 사용하거나 Cloud Function을 호출해야 함
        // 여기서는 클라이언트 시간을 기준으로 표시하고, 실제 서버 시간은 Cloud Function에서 가져와야 함
        
        // 대안: 현재 시간을 기준으로 표시 (실제 서버 시간은 Cloud Function 필요)
        setServerTime(Date.now());
      } catch (error) {
        debugError('[TimeDebugPanel] 서버 시간 가져오기 실패:', error);
      }
    };

    fetchServerTime();
  }, []);

  // 마감 시간과 비교
  useEffect(() => {
    if (missionDueAt) {
      const dueAtTime = new Date(missionDueAt).getTime();
      const nowTime = currentTime;
      const diff = nowTime - dueAtTime;
      const isExpired = nowTime > dueAtTime;

      setComparisonResult({
        isExpired,
        diff,
        diffText: formatDiff(diff),
      });
    }
  }, [missionDueAt, currentTime]);

  const formatDiff = (diffMs: number): string => {
    const absDiff = Math.abs(diffMs);
    const seconds = Math.floor(absDiff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}일 ${hours % 24}시간`;
    } else if (hours > 0) {
      return `${hours}시간 ${minutes % 60}분`;
    } else if (minutes > 0) {
      return `${minutes}분 ${seconds % 60}초`;
    } else {
      return `${seconds}초`;
    }
  };

  const clientDate = new Date(currentTime);
  const serverDate = serverTime ? new Date(serverTime) : null;

  return (
    <div className="fixed bottom-4 right-4 bg-white border-2 border-blue-500 rounded-lg p-4 shadow-lg z-50 max-w-md text-xs">
      <div className="font-bold text-blue-600 mb-3 text-sm">🕐 시간 디버그 패널</div>
      
      {/* 클라이언트 시간 */}
      <div className="mb-3 p-2 bg-gray-50 rounded">
        <div className="font-semibold text-gray-700 mb-1">클라이언트 시간 (Date.now())</div>
        <div className="text-gray-600">
          <div>밀리초: {currentTime}</div>
          <div>ISO: {clientDate.toISOString()}</div>
          <div>로컬: {clientDate.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</div>
          <div>toString: {clientDate.toString()}</div>
        </div>
      </div>

      {/* 서버 시간 (시뮬레이션) */}
      {serverDate && (
        <div className="mb-3 p-2 bg-yellow-50 rounded">
          <div className="font-semibold text-gray-700 mb-1">서버 시간 (시뮬레이션)</div>
          <div className="text-gray-600">
            <div>밀리초: {serverTime}</div>
            <div>ISO: {serverDate.toISOString()}</div>
            <div>로컬: {serverDate.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</div>
          </div>
          <div className="text-xs text-yellow-600 mt-1">
            ⚠️ 실제 서버 시간은 Cloud Function 필요
          </div>
        </div>
      )}

      {/* 마감 시간 비교 */}
      {missionDueAt && comparisonResult && (
        <div className={`mb-3 p-2 rounded ${comparisonResult.isExpired ? 'bg-red-50' : 'bg-green-50'}`}>
          <div className="font-semibold text-gray-700 mb-1">마감 시간 비교</div>
          <div className="text-gray-600 mb-2">
            <div>마감 시간: {new Date(missionDueAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</div>
            <div>마감 ISO: {missionDueAt}</div>
          </div>
          <div className={`font-bold ${comparisonResult.isExpired ? 'text-red-600' : 'text-green-600'}`}>
            {comparisonResult.isExpired ? '❌ 만료됨' : '✅ 진행 중'}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            차이: {comparisonResult.diffText} ({comparisonResult.diff > 0 ? '지남' : '남음'})
          </div>
        </div>
      )}

      {/* 시간대 정보 */}
      <div className="text-xs text-gray-500">
        <div>타임존: {Intl.DateTimeFormat().resolvedOptions().timeZone}</div>
        <div>오프셋: {clientDate.getTimezoneOffset()}분</div>
      </div>
    </div>
  );
};

export default TimeDebugPanel;

