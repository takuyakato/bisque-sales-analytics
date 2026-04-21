import { google, youtube_v3, youtubeAnalytics_v2 } from 'googleapis';

export type YoutubeChannelLabel = 'jp' | 'en' | 'ko';

export interface YoutubeVideo {
  video_id: string;
  title: string;
  published_at: string;
}

export interface YoutubeMetricRow {
  channel_id: string;
  channel_name: string;
  video_id: string;
  video_title: string;
  metric_date: string; // YYYY-MM-DD
  views: number;
  watch_time_minutes: number;
  subscribers_gained: number;
  estimated_revenue_usd: number;
  membership_revenue_usd: number;
}

/**
 * YouTube Data API + Analytics API スクレイパー
 * チャンネルラベル（jp/en/ko）でOAuth認可を切替、動画一覧とanalytics日次値を取得
 */
export class YoutubeScraper {
  static readonly VERSION = '2026-04-20';

  private label: YoutubeChannelLabel;
  private clientId: string;
  private clientSecret: string;
  private refreshToken: string;
  private channelIdFromEnv: string;

  private oauth2: InstanceType<typeof google.auth.OAuth2>;
  private youtube: youtube_v3.Youtube | null = null;
  private analytics: youtubeAnalytics_v2.Youtubeanalytics | null = null;

  private channelId: string | null = null;
  private channelName: string | null = null;
  private uploadsPlaylistId: string | null = null;

  constructor(label: YoutubeChannelLabel) {
    this.label = label;
    const upper = label.toUpperCase();
    const clientId = process.env.YOUTUBE_CLIENT_ID;
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
    const refreshToken = process.env[`YOUTUBE_REFRESH_TOKEN_${upper}`];
    const channelId = process.env[`YOUTUBE_CHANNEL_ID_${upper}`];
    if (!clientId || !clientSecret) throw new Error('YOUTUBE_CLIENT_ID/SECRET が未設定');
    if (!refreshToken) throw new Error(`YOUTUBE_REFRESH_TOKEN_${upper} が未設定`);
    if (!channelId) throw new Error(`YOUTUBE_CHANNEL_ID_${upper} が未設定`);

    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.refreshToken = refreshToken;
    this.channelIdFromEnv = channelId;

    this.oauth2 = new google.auth.OAuth2(this.clientId, this.clientSecret);
    this.oauth2.setCredentials({ refresh_token: this.refreshToken });
  }

  /** API クライアントを初期化＋チャンネル情報取得 */
  async init(): Promise<void> {
    this.youtube = google.youtube({ version: 'v3', auth: this.oauth2 });
    this.analytics = google.youtubeAnalytics({ version: 'v2', auth: this.oauth2 });

    // チャンネル情報＋アップロードプレイリストID
    const ch = await this.youtube.channels.list({
      part: ['id', 'snippet', 'contentDetails'],
      mine: true,
    });
    const me = ch.data.items?.[0];
    if (!me) throw new Error('channels.list mine=true で結果なし');
    this.channelId = me.id ?? this.channelIdFromEnv;
    this.channelName = me.snippet?.title ?? `(${this.label})`;
    this.uploadsPlaylistId = me.contentDetails?.relatedPlaylists?.uploads ?? null;
  }

  /**
   * チャンネルにアップされた全動画を取得（アップロードプレイリスト経由）
   * デフォルトは直近200件
   */
  async fetchVideos(maxCount = 500): Promise<YoutubeVideo[]> {
    if (!this.youtube || !this.uploadsPlaylistId) await this.init();
    if (!this.uploadsPlaylistId) throw new Error('uploads playlist が取得できません');

    const videos: YoutubeVideo[] = [];
    let pageToken: string | undefined;
    while (videos.length < maxCount) {
      const resp = await this.youtube!.playlistItems.list({
        part: ['snippet', 'contentDetails'],
        playlistId: this.uploadsPlaylistId,
        maxResults: 50,
        pageToken,
      });
      for (const item of resp.data.items ?? []) {
        const videoId = item.contentDetails?.videoId;
        const title = item.snippet?.title;
        const publishedAt = item.contentDetails?.videoPublishedAt ?? item.snippet?.publishedAt;
        if (videoId && title && publishedAt) {
          videos.push({ video_id: videoId, title, published_at: publishedAt });
        }
      }
      pageToken = resp.data.nextPageToken ?? undefined;
      if (!pageToken) break;
    }
    return videos.slice(0, maxCount);
  }

  /**
   * 指定期間・指定動画群の日次メトリクスを取得
   * @param from YYYY-MM-DD
   * @param to   YYYY-MM-DD
   * @param videoIds 対象動画ID配列。filter=video==id1,id2,... は 500 動画まで。超過時は分割。
   */
  async fetchDailyMetrics(from: string, to: string, videoIds: string[]): Promise<YoutubeMetricRow[]> {
    if (!this.analytics || !this.channelId) await this.init();
    if (!this.analytics) throw new Error('analytics not initialized');

    const rows: YoutubeMetricRow[] = [];
    const titleMap = new Map<string, string>();
    // 動画タイトル取得（後で紐付け）
    if (this.youtube) {
      for (let i = 0; i < videoIds.length; i += 50) {
        const chunk = videoIds.slice(i, i + 50);
        const resp = await this.youtube.videos.list({
          part: ['snippet'],
          id: chunk,
          maxResults: 50,
        });
        for (const v of resp.data.items ?? []) {
          if (v.id && v.snippet?.title) titleMap.set(v.id, v.snippet.title);
        }
      }
    }

    // video ID を 200件ずつのチャンクに分ける（API制限対策）
    const chunkSize = 200;
    for (let i = 0; i < videoIds.length; i += chunkSize) {
      const chunk = videoIds.slice(i, i + chunkSize);
      // monetary スコープ付与済みなら estimatedRevenue も取れる
      const resp = await this.analytics.reports.query({
        ids: 'channel==MINE',
        startDate: from,
        endDate: to,
        dimensions: 'video,day',
        metrics: 'views,estimatedMinutesWatched,subscribersGained,estimatedRevenue',
        filters: `video==${chunk.join(',')}`,
        maxResults: 10000,
      });
      const columnHeaders = resp.data.columnHeaders ?? [];
      const colIdx = (name: string) => columnHeaders.findIndex((c) => c.name === name);
      const iVideo = colIdx('video');
      const iDay = colIdx('day');
      const iViews = colIdx('views');
      const iWatch = colIdx('estimatedMinutesWatched');
      const iSubs = colIdx('subscribersGained');
      const iRev = colIdx('estimatedRevenue');

      for (const r of resp.data.rows ?? []) {
        const videoId = String(r[iVideo] ?? '');
        const day = String(r[iDay] ?? '');
        if (!videoId || !day) continue;
        rows.push({
          channel_id: this.channelId!,
          channel_name: this.channelName ?? `(${this.label})`,
          video_id: videoId,
          video_title: titleMap.get(videoId) ?? '',
          metric_date: day,
          views: Number(r[iViews] ?? 0),
          watch_time_minutes: Number(r[iWatch] ?? 0),
          subscribers_gained: Number(r[iSubs] ?? 0),
          estimated_revenue_usd: Number(r[iRev] ?? 0),
          membership_revenue_usd: 0, // Membership 収益は別メトリクス、必要なら別クエリ
        });
      }
    }
    return rows;
  }

  getChannelId(): string | null {
    return this.channelId;
  }
  getChannelName(): string | null {
    return this.channelName;
  }
}
