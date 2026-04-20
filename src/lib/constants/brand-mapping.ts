/**
 * サークル名・YouTubeチャンネルID → Brand のマッピング
 * v3.6 §4-1-1 準拠
 */
export type Brand = 'CAPURI' | 'BerryFeel' | 'BLsand' | 'unknown';

/**
 * サークル名から Brand を推測（DLsite / Fanza のCSV取込時に使用）
 * 一致しなければ 'unknown'
 */
export function brandFromCircle(circleName: string): Brand {
  const normalized = circleName.trim();
  if (normalized === 'CAPURI') return 'CAPURI';
  if (normalized === 'BerryFeel') return 'BerryFeel';
  return 'unknown';
}

/**
 * YouTube チャンネルIDから Brand を推測（YouTube API取込時に使用）
 */
export function brandFromChannelId(channelId: string): Brand {
  const jpId = process.env.YOUTUBE_CHANNEL_ID_JP;
  const enId = process.env.YOUTUBE_CHANNEL_ID_EN;
  if (channelId && (channelId === jpId || channelId === enId)) return 'BLsand';
  return 'unknown';
}
