import type { NextConfig } from 'next';

// Factoryskills のサブパス `/kgk/` 配下にリバースプロキシで公開する運用 (本番) に備え、
// basePath を環境変数で切替可能にする。開発時は未設定 → 空文字 → 既存挙動 (`/` 直下) と
// 完全に同等。本番は nginx で `/kgk/` を proxy_pass する側で `NEXT_PUBLIC_BASE_PATH=/kgk`
// を注入する。詳細: skills/kouji-genka/docs/adr/ADR-001-addon-integration-strategy.md
const nextConfig: NextConfig = {
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? '',
};

export default nextConfig;
