import { LocalNotifications } from '@capacitor/local-notifications';
import { App } from '@capacitor/app';

const SEEN_KEY = 'notif_seen_ids';
const COUNTER_KEY = 'notif_counter';
const LEGACY_ENABLED_KEY = 'notificationsEnabled';
const SETTINGS_KEY = 'notificationSettings';
const SEOUL_TIME_ZONE = 'Asia/Seoul';
const REMINDER_SENT_LOG_KEY = 'reminder_sent_log';

const REMINDERS = [
  {
    key: 'morning',
    id: 9001,
    hour: 9,
    minute: 0,
    title: '🌞 좋은 아침이에요!',
    body: '오늘도 용돈 모아볼까요?',
  },
  {
    key: 'lunch',
    id: 12001,
    hour: 12,
    minute: 0,
    title: '🍱 점심 시간이에요!',
    body: '용돈주세요 앱 확인해봤나요?',
  },
  {
    key: 'dinner',
    id: 19001,
    hour: 19,
    minute: 0,
    title: '🌙 오늘 하루 어땠나요?',
    body: '오늘 용돈 얼마나 모았는지 확인해봐요!',
  },
] as const;

type ReminderKey = (typeof REMINDERS)[number]['key'];

export type NotificationSettings = Record<ReminderKey, boolean>;
export type ReminderSchedulePreview = Record<ReminderKey, string>;

type KstParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  morning: true,
  lunch: true,
  dinner: true,
};

const KST_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: SEOUL_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

let reminderListenersInitialized = false;

function getSeenSet(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function hasSeen(missionId: string, event: string): boolean {
  return getSeenSet().has(`${missionId}_${event}`);
}

function markSeen(missionId: string, event: string): void {
  const seen = getSeenSet();
  seen.add(`${missionId}_${event}`);
  const arr = [...seen];
  if (arr.length > 500) arr.splice(0, arr.length - 500);
  localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
}

function getNextId(): number {
  try {
    const current = parseInt(localStorage.getItem(COUNTER_KEY) || '0', 10);
    const next = current >= 9996 ? 1 : current + 1;
    localStorage.setItem(COUNTER_KEY, String(next));
    return next;
  } catch {
    return Math.floor(Math.random() * 9000) + 1;
  }
}

function parseStoredSettings(raw: string | null): NotificationSettings | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<NotificationSettings>;
    return {
      morning: parsed.morning !== false,
      lunch: parsed.lunch !== false,
      dinner: parsed.dinner !== false,
    };
  } catch {
    return null;
  }
}

function getKstParts(date: Date): KstParts {
  const parts = KST_DATE_FORMATTER.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value || '0');

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
}

// ==========================================================================
// 공통 유틸
// ==========================================================================

/** 개발 환경에서만 로그 출력 */
function devLog(...args: unknown[]): void {
  if (import.meta.env.DEV) {
    console.log(...args);
  }
}

// ==========================================================================
// 리마인더 발송 기록 (안전장치 1: 중복 수신 방지)
// 형식: { 'YYYY-MM-DD_morning': true, ... }
// ==========================================================================

function getKstDateString(date: Date = new Date()): string {
  const parts = getKstParts(date);
  const y = String(parts.year);
  const m = String(parts.month).padStart(2, '0');
  const d = String(parts.day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getReminderSentLog(): Record<string, true> {
  try {
    const raw = localStorage.getItem(REMINDER_SENT_LOG_KEY);
    return raw ? (JSON.parse(raw) as Record<string, true>) : {};
  } catch {
    return {};
  }
}

function saveReminderSentLog(log: Record<string, true>): void {
  try {
    localStorage.setItem(REMINDER_SENT_LOG_KEY, JSON.stringify(log));
  } catch {
    // localStorage 쓰기 실패 시 무시
  }
}

/** 오늘 특정 key의 리마인더가 이미 수신 처리됐는지 확인 */
function hasReminderBeenSentToday(key: ReminderKey): boolean {
  const logKey = `${getKstDateString()}_${key}`;
  return getReminderSentLog()[logKey] === true;
}

/** 오늘 특정 key의 리마인더 수신을 기록 */
function markReminderSentToday(key: ReminderKey): void {
  const log = getReminderSentLog();
  log[`${getKstDateString()}_${key}`] = true;
  saveReminderSentLog(log);
}

/** 오늘 특정 key의 리마인더 수신 기록 삭제 (시간 범위 벗어난 경우 재처리 허용) */
function unmarkReminderSentToday(key: ReminderKey): void {
  const log = getReminderSentLog();
  delete log[`${getKstDateString()}_${key}`];
  saveReminderSentLog(log);
}

/** 7일 이상 된 발송 기록 정리 */
function pruneReminderSentLog(): void {
  const log = getReminderSentLog();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffStr = getKstDateString(cutoff);

  const pruned: Record<string, true> = {};
  for (const key of Object.keys(log)) {
    const dateStr = key.slice(0, 10); // 'YYYY-MM-DD' 부분
    if (dateStr >= cutoffStr) {
      pruned[key] = true;
    }
  }
  saveReminderSentLog(pruned);
}

// ==========================================================================
// 안전장치 2: 발송 시간 검증 (±15분 범위 체크)
// ==========================================================================

const REMINDER_WINDOW_SECONDS = 15 * 60; // 15분

/**
 * 수신 시점(now)이 리마인더 설정 시각(hour:minute) 기준 ±15분 이내인지 확인.
 * KST 기준으로 비교하며 자정 경계(±15분)는 발생하지 않으므로 단순 차이 비교.
 */
function isWithinReminderWindow(hour: number, minute: number, now = new Date()): boolean {
  const nowKst = getKstParts(now);
  const nowSeconds = nowKst.hour * 3600 + nowKst.minute * 60 + nowKst.second;
  const targetSeconds = hour * 3600 + minute * 60;
  return Math.abs(nowSeconds - targetSeconds) <= REMINDER_WINDOW_SECONDS;
}

function getNextKstTriggerDate(hour: number, minute: number, now = new Date()): Date {
  const nowKst = getKstParts(now);
  const nowSeconds = nowKst.hour * 3600 + nowKst.minute * 60 + nowKst.second;
  const targetSeconds = hour * 3600 + minute * 60;
  const dayOffset = nowSeconds < targetSeconds ? 0 : 1;

  // KST는 항상 UTC+9 (DST 없음).
  // KST 당일 자정을 UTC ms로 구한 뒤 목표 시각(초)과 dayOffset을 더해 절대 시각을 계산.
  // Date.UTC의 hour에 -9를 전달하면 JS가 전날 15:00 UTC로 정규화하므로 오버플로 안전.
  const kstTodayMidnightUtcMs = Date.UTC(nowKst.year, nowKst.month - 1, nowKst.day, -9, 0, 0, 0);
  return new Date(kstTodayMidnightUtcMs + (dayOffset * 86400 + hour * 3600 + minute * 60) * 1000);
}

function formatKstTarget(date: Date): string {
  return date.toLocaleString('ko-KR', {
    timeZone: SEOUL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatKstPreview(date: Date): string {
  const parts = getKstParts(date);
  const year = String(parts.year);
  const month = String(parts.month).padStart(2, '0');
  const day = String(parts.day).padStart(2, '0');
  const hour = String(parts.hour).padStart(2, '0');
  const minute = String(parts.minute).padStart(2, '0');

  return `${year}-${month}-${day} ${hour}:${minute} KST`;
}

function getReminderById(id: number) {
  return REMINDERS.find((reminder) => reminder.id === id);
}

function isReminderId(id: number): boolean {
  return REMINDERS.some((reminder) => reminder.id === id);
}

function syncLegacyNotificationFlag(settings: NotificationSettings): void {
  localStorage.setItem(LEGACY_ENABLED_KEY, String(Object.values(settings).some(Boolean)));
}

export function getNotificationSettings(): NotificationSettings {
  const stored = parseStoredSettings(localStorage.getItem(SETTINGS_KEY));
  if (stored) return stored;

  if (localStorage.getItem(LEGACY_ENABLED_KEY) === 'false') {
    return {
      morning: false,
      lunch: false,
      dinner: false,
    };
  }

  return { ...DEFAULT_NOTIFICATION_SETTINGS };
}

export function saveNotificationSettings(settings: NotificationSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  syncLegacyNotificationFlag(settings);
}

export function updateNotificationSetting(
  key: ReminderKey,
  enabled: boolean
): NotificationSettings {
  const nextSettings = {
    ...getNotificationSettings(),
    [key]: enabled,
  };

  saveNotificationSettings(nextSettings);
  return nextSettings;
}

export function getReminderSchedulePreview(
  settings: NotificationSettings = getNotificationSettings()
): ReminderSchedulePreview {
  return {
    morning: settings.morning ? formatKstPreview(getNextKstTriggerDate(9, 0)) : '꺼짐',
    lunch: settings.lunch ? formatKstPreview(getNextKstTriggerDate(12, 0)) : '꺼짐',
    dinner: settings.dinner ? formatKstPreview(getNextKstTriggerDate(19, 0)) : '꺼짐',
  };
}

async function send(title: string, body: string): Promise<void> {
  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: getNextId(),
          title,
          body,
          schedule: { at: new Date(Date.now() + 300) },
          smallIcon: 'ic_stat_notify',
          actionTypeId: '',
          extra: null,
        },
      ],
    });
  } catch (err) {
    console.error('[NotificationService] 알림 발송 실패:', err);
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const { display } = await LocalNotifications.requestPermissions();
    console.log('[NotificationService] 권한 요청 결과:', display);
    return display === 'granted';
  } catch (err) {
    console.error('[NotificationService] 권한 요청 실패:', err);
    return false;
  }
}

export async function cancelAllReminders(): Promise<void> {
  try {
    await LocalNotifications.cancel({
      notifications: REMINDERS.map(({ id }) => ({ id })),
    });
  } catch {
    // 등록된 알림이 없으면 무시
  }
}

const MIGRATION_KEY = 'notification_migrated_v1';

// 모듈 수준: 이전 권한 상태 추적 (null = 아직 확인 전)
let prevPermissionGranted: boolean | null = null;

// 중복 방지를 위해 전체 대기 알림 취소 후 재등록
async function normalizeNotifications(): Promise<void> {
  try {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel({
        notifications: pending.notifications.map((n) => ({ id: n.id })),
      });
    }
  } catch {
    // 등록된 알림이 없거나 취소 실패 시 무시
  }
  await scheduleAllReminders();
}

export async function migrateNotificationsIfNeeded(): Promise<void> {
  if (localStorage.getItem(MIGRATION_KEY)) return;
  await normalizeNotifications();
  localStorage.setItem(MIGRATION_KEY, '1');
}

// 앱 재시작 후 pending 리마인더가 없으면 재등록 (OS 알림 초기화 대응)
// [안전장치 3] CHILD 기기에서 pending 리마인더가 4개 이상이면 비정상으로 간주, 전체 재등록
export async function ensureRemindersScheduled(): Promise<void> {
  try {
    const { display } = await LocalNotifications.checkPermissions();
    if (display !== 'granted') return;

    const { notifications } = await LocalNotifications.getPending();
    const pendingReminderCount = notifications.filter((n) =>
      REMINDERS.some((r) => r.id === n.id)
    ).length;

    const deviceRole = localStorage.getItem('deviceRole');

    // [안전장치 3] CHILD 기기에서 리마인더 4개 이상 → 중복 등록 비정상 상태
    if (deviceRole === 'CHILD' && pendingReminderCount >= 4) {
      devLog(
        `[NotificationService] 안전장치3: pending 리마인더 비정상 (${pendingReminderCount}개), 전체 취소 후 재등록`
      );
      try {
        await LocalNotifications.cancel({
          notifications: notifications.map((n) => ({ id: n.id })),
        });
      } catch {
        // 취소 실패 시 무시하고 재등록 진행
      }
      await scheduleAllReminders();
      return;
    }

    const hasReminders = pendingReminderCount > 0;
    if (!hasReminders) {
      devLog('[NotificationService] pending 리마인더 없음, 재등록');
      await scheduleAllReminders();
    }
  } catch {
    // 권한 확인 또는 pending 조회 실패 시 무시
  }
}

// 권한 변경(denied → granted) 감지: 앱이 포그라운드로 복귀할 때 확인
export function initPermissionChangeListener(): void {
  // 초기 권한 상태 기록
  LocalNotifications.checkPermissions()
    .then(({ display }) => {
      prevPermissionGranted = display === 'granted';
    })
    .catch(() => {
      prevPermissionGranted = false;
    });

  App.addListener('appStateChange', async ({ isActive }) => {
    if (!isActive) return;

    try {
      const { display } = await LocalNotifications.checkPermissions();
      const isGranted = display === 'granted';

      if (prevPermissionGranted === false && isGranted) {
        // denied → granted 전환 감지: 전체 취소 후 재등록
        console.log('[NotificationService] 권한 변경 감지 (denied→granted), 알림 정상화 시작');
        await normalizeNotifications();
        localStorage.setItem(MIGRATION_KEY, '1');
      }

      prevPermissionGranted = isGranted;
    } catch {
      // 권한 확인 실패 시 무시
    }
  }).catch((err) => {
    console.error('[NotificationService] appStateChange 리스너 등록 실패:', err);
  });
}

async function scheduleReminder(reminder: (typeof REMINDERS)[number]): Promise<void> {
  const scheduledAt = getNextKstTriggerDate(reminder.hour, reminder.minute);

  console.log('[NotificationService] reminder scheduled', {
    type: reminder.key,
    kstTargetTime: formatKstTarget(scheduledAt),
    scheduledAtIso: scheduledAt.toISOString(),
    scheduledAtString: scheduledAt.toString(),
  });

  await LocalNotifications.schedule({
    notifications: [
      {
        id: reminder.id,
        title: reminder.title,
        body: reminder.body,
        schedule: { at: scheduledAt },
        smallIcon: 'ic_stat_notify',
        actionTypeId: '',
        extra: { reminderType: reminder.key },
      },
    ],
  });
}

// 동일 id에 대한 동시 재예약 방지 (localNotificationReceived + localNotificationActionPerformed 중복 방지)
const rescheduleInProgress = new Set<number>();

async function rescheduleReminderById(id: number): Promise<void> {
  if (rescheduleInProgress.has(id)) return;
  rescheduleInProgress.add(id);

  try {
    const reminder = getReminderById(id);
    if (!reminder) return;

    const settings = getNotificationSettings();
    if (!settings[reminder.key]) return;

    try {
      await LocalNotifications.cancel({
        notifications: [{ id: reminder.id }],
      });
    } catch {
      // 이미 전달된 알림이면 취소 대상이 없을 수 있음
    }

    await scheduleReminder(reminder);
  } finally {
    rescheduleInProgress.delete(id);
  }
}

export function initializeReminderNotificationListeners(): void {
  if (reminderListenersInitialized) return;
  reminderListenersInitialized = true;

  LocalNotifications.addListener('localNotificationReceived', async (notification) => {
    if (!isReminderId(notification.id)) return;

    const reminder = getReminderById(notification.id);
    if (reminder) {
      // [안전장치 2] 발송 시간 검증: ±15분 범위 외이면 무시 + 재예약만
      if (!isWithinReminderWindow(reminder.hour, reminder.minute)) {
        const nowKst = getKstParts(new Date());
        devLog(
          `[NotificationService] 안전장치2: 시간 범위 벗어난 수신 차단 (${reminder.key})`,
          `수신 시각 KST ${nowKst.hour}:${String(nowKst.minute).padStart(2, '0')}`,
          `허용 범위 ${reminder.hour}:${String(reminder.minute).padStart(2, '0')} ±15분`
        );
        try {
          await LocalNotifications.cancel({ notifications: [{ id: notification.id }] });
        } catch {
          // 이미 전달된 알림이면 취소 실패 가능
        }
        // 오늘 기록이 있다면 삭제해 다음 정상 수신 시 재처리 허용
        unmarkReminderSentToday(reminder.key);
        // 다음 정상 시각으로 재예약
        try {
          await rescheduleReminderById(notification.id);
        } catch (err) {
          console.error('[NotificationService] 시간 범위 벗어난 알림 재예약 실패:', err);
        }
        return;
      }

      // [안전장치 1] 발송 기록 체크: 오늘 이미 수신 처리됐으면 차단
      pruneReminderSentLog();

      if (hasReminderBeenSentToday(reminder.key)) {
        devLog('[NotificationService] 안전장치1: 중복 수신 차단:', reminder.key);
        try {
          await LocalNotifications.cancel({ notifications: [{ id: notification.id }] });
        } catch {
          // 이미 전달된 알림이면 취소 실패 가능
        }
        return;
      }

      // 오늘 첫 정상 수신 → 기록 후 정상 처리
      markReminderSentToday(reminder.key);
    }

    try {
      await rescheduleReminderById(notification.id);
    } catch (err) {
      console.error('[NotificationService] 수신 후 재예약 실패:', err);
    }
  }).catch((err) => {
    console.error('[NotificationService] 수신 리스너 등록 실패:', err);
  });

  LocalNotifications.addListener('localNotificationActionPerformed', async ({ notification }) => {
    if (!isReminderId(notification.id)) return;
    try {
      await rescheduleReminderById(notification.id);
    } catch (err) {
      console.error('[NotificationService] 액션 후 재예약 실패:', err);
    }
  }).catch((err) => {
    console.error('[NotificationService] 액션 리스너 등록 실패:', err);
  });
}

export async function scheduleAllReminders(
  settings: NotificationSettings = getNotificationSettings(),
  deviceRole: string | null = localStorage.getItem('deviceRole')
): Promise<void> {
  // 리마인더(아침/점심/저녁)는 아이 기기에서만 등록.
  // 부모 기기는 미션 이벤트 알림(notifyMissionSubmitted 등)만 사용.
  if (deviceRole !== 'CHILD') {
    console.log('[NotificationService] 리마인더 등록 건너뜀 (role:', deviceRole, ')');
    return;
  }

  initializeReminderNotificationListeners();
  await cancelAllReminders();

  try {
    const enabledReminders = REMINDERS.filter((reminder) => settings[reminder.key]);
    for (const reminder of enabledReminders) {
      await scheduleReminder(reminder);
    }
    console.log('[NotificationService] 리마인더 등록 완료', settings);
  } catch (err) {
    console.error('[NotificationService] 리마인더 등록 실패:', err);
  }
}

export async function notifyNewMission(missionId: string, title: string): Promise<void> {
  if (hasSeen(missionId, 'todo')) return;
  markSeen(missionId, 'todo');
  await send('새 미션이 도착했어요', `"${title}" 미션을 확인해보세요.`);
}

export async function notifyMissionSubmitted(missionId: string, title: string): Promise<void> {
  if (hasSeen(missionId, 'submitted')) return;
  markSeen(missionId, 'submitted');
  await send('아이가 미션을 제출했어요', `"${title}" 미션을 검토해주세요.`);
}

export async function notifyMissionApproved(
  missionId: string,
  title: string,
  rewardPoint: number
): Promise<void> {
  if (hasSeen(missionId, 'approved')) return;
  markSeen(missionId, 'approved');
  await send(
    '미션 승인! 포인트가 적립되었어요',
    `"${title}" 완료! ${rewardPoint}포인트가 적립됐어요!`
  );
}

export async function notifyMissionRejected(missionId: string, title: string): Promise<void> {
  if (hasSeen(missionId, 'rejected')) return;
  markSeen(missionId, 'rejected');
  await send('미션이 반려되었어요', `"${title}" 미션을 다시 확인해보세요.`);
}
