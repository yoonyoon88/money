import React, { useRef, useState, useCallback } from 'react';
import html2canvas from 'html2canvas';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import ShareCard, { ShareCardProps } from './ShareCard';

interface ShareModalProps extends ShareCardProps {
  onClose: () => void;
}

const isNativeApp = !!(window as any).Capacitor?.isNativePlatform?.();

const ShareModal: React.FC<ShareModalProps> = ({ onClose, ...cardProps }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);

  // ── html2canvas 캡처 ──
  const capture = useCallback(async (): Promise<string> => {
    if (!cardRef.current) throw new Error('card ref missing');
    const canvas = await html2canvas(cardRef.current, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      // 스크롤 영향 제거
      scrollX: 0,
      scrollY: 0,
    });
    return canvas.toDataURL('image/png');
  }, []);

  // ── 이미지로 저장 ──
  const handleSave = useCallback(async () => {
    if (busy) return;
    setBusy('save');
    try {
      const dataUrl = await capture();
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `미션리포트_${cardProps.childName}_${Date.now()}.png`;
      a.click();
    } catch {
      alert('이미지 저장에 실패했어요.');
    } finally {
      setBusy(null);
    }
  }, [busy, capture, cardProps.childName]);

  // ── 공유하기 ──
  const handleShare = useCallback(async () => {
    if (busy) return;
    setBusy('share');
    try {
      const dataUrl = await capture();
      if (isNativeApp) {
        const base64  = dataUrl.split(',')[1];
        const filename = `report_${Date.now()}.png`;
        await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache });
        const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache });
        await Share.share({
          title: `${cardProps.childName} 이번 달 미션 리포트`,
          files: [uri],
          dialogTitle: '리포트 공유하기',
        });
      } else {
        // PC fallback: 다운로드
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `미션리포트_${cardProps.childName}_${Date.now()}.png`;
        a.click();
      }
    } catch (err: any) {
      if (!err?.message?.includes('cancel')) alert('공유에 실패했어요. 다시 시도해주세요.');
    } finally {
      setBusy(null);
    }
  }, [busy, capture, cardProps.childName]);

  return (
    <>
      {/* 배경 오버레이 */}
      <div
        className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 모달 */}
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center px-4 py-8 overflow-y-auto">
        {/* 닫기 버튼 */}
        <button
          type="button"
          onClick={onClose}
          className="self-end mb-3 p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
          aria-label="닫기"
        >
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* 카드 미리보기 (스크롤 가능 영역 안에서 자연 높이) */}
        <div className="w-full flex justify-center mb-5">
          <ShareCard ref={cardRef} {...cardProps} />
        </div>

        {/* 액션 버튼 */}
        <div className="flex gap-3 w-full max-w-[360px]">
          <button
            type="button"
            onClick={handleSave}
            disabled={!!busy}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-white text-gray-800 rounded-2xl text-sm font-semibold shadow-md hover:bg-gray-50 transition-colors disabled:opacity-60"
          >
            {busy === 'save' ? (
              <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            )}
            이미지로 저장
          </button>

          <button
            type="button"
            onClick={handleShare}
            disabled={!!busy}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-orange-500 text-white rounded-2xl text-sm font-semibold shadow-md hover:bg-orange-600 transition-colors disabled:opacity-60"
          >
            {busy === 'share' ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
            )}
            공유하기
          </button>
        </div>
      </div>
    </>
  );
};

export default ShareModal;
