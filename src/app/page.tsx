export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">
          bisque-sales-analytics
        </h1>
        <p className="text-gray-600 mb-8">
          Phase 1a 基盤セットアップ完了。Phase 1b 以降で各機能を実装していきます。
        </p>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-4">
          <h2 className="text-lg font-semibold text-yellow-900 mb-2">
            次のステップ
          </h2>
          <ul className="text-sm text-yellow-800 space-y-1 list-disc list-inside">
            <li>Supabase Dashboard で migration SQL を実行</li>
            <li>Phase 1b：CSV取込MVP</li>
            <li>Phase 1c：作品マスタ・ダッシュボード</li>
            <li>Phase 1d〜1e：スクレイパー（DLsite/Fanza）</li>
            <li>Phase 1f：YouTube API</li>
            <li>Phase 1g：月次レポート画面＋Notion自動反映</li>
            <li>Phase 1h：スナップショット＋管理画面</li>
            <li>Phase 1i：デプロイ・過去分バックフィル</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
