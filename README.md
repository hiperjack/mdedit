# mdedit

軽量なMarkdownエディタ。Tauri 2.x + Vite + TypeScript で構築された、単一ウィンドウ・複数タブのデスクトップアプリ。

`.md` ファイルをダブルクリックすると、既存ウィンドウの新規タブで開きます。

## 特徴

- **WYSIWYG編集**: [Milkdown Crepe](https://milkdown.dev/) を採用。書式が反映された状態のまま編集でき、別ペインのプレビューは不要
- **シングルインスタンス**: `.md` をダブルクリック → 既存ウィンドウの新規タブで開く
- **タブ操作**: ドラッグで並び替え、ミドルクリックで閉じる、横長になれば横スクロール
- **未保存検知**: 「Milkdown 正規化後の文字列」を baseline にして比較。WYSIWYG特有の自動正規化による誤発火を回避
- **GFM対応**: テーブル、タスクリスト、打ち消し線（CommonMark + GFM プリセット）
- **国際化**: 日本語 / 英語の切替（メニュー・設定UIともに連動）
- **フォント設定**: フォントファミリ・サイズの永続化（localStorage）
- **ドラッグ&ドロップ**: `.md` / `.markdown` ファイルをウィンドウへ直接ドロップ
- **行番号オーバーレイ**: WYSIWYGペインに行番号を重ねて表示

## 技術スタック

| 層 | 採用 |
|---|---|
| デスクトップフレームワーク | Tauri 2.x（Rust） |
| フロントエンドビルド | Vite + TypeScript |
| エディタ | [@milkdown/crepe](https://www.npmjs.com/package/@milkdown/crepe)（ProseMirror 系 WYSIWYG） |
| Markdown 拡張 | `@milkdown/kit` の commonmark / gfm preset |
| ドラッグ並び替え | SortableJS |
| 状態管理 | 自前ストア（外部ライブラリなし） |

UI フレームワーク（React/Vue）は不使用。状態の中心はストア、UI は関数生成する素朴な構造。

## 動作要件

- Node.js 18 以上
- Rust（Tauri 2.x の前提条件 / [Tauri 公式ガイド](https://v2.tauri.app/start/prerequisites/) 参照）

## セットアップ

```bash
# 依存パッケージのインストール
npm install

# 開発モード（Vite + Tauri）
npm run tauri:dev

# 型チェック
npm run typecheck

# プロダクションビルド（インストーラ生成）
npm run tauri:build
```

ビルド成果物は `src-tauri/target/release/bundle/` 配下に生成されます。

## キーボードショートカット

### ファイル操作

| ショートカット | 動作 |
|---|---|
| `Ctrl+N` | 新規タブ |
| `Ctrl+O` | ファイルを開く |
| `Ctrl+S` | 保存 |
| `Ctrl+Shift+S` | 名前を付けて保存 |
| `Ctrl+W` | タブを閉じる |

### タブ操作

| ショートカット | 動作 |
|---|---|
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | 次 / 前のタブへ切替 |
| `Ctrl+1`〜`Ctrl+9` | n 番目のタブへ切替 |

### 書式（ツールバーおよびネイティブメニュー）

| ショートカット | 動作 |
|---|---|
| `Ctrl+B` | 太字 |
| `Ctrl+I` | 斜体 |
| `Ctrl+Shift+X` | 打ち消し |
| `Ctrl+E` | インラインコード |
| `Ctrl+Alt+1` / `Ctrl+Alt+2` / `Ctrl+Alt+3` | 見出し1〜3 |
| `Ctrl+K` | リンク |

ツールバーには上記に加えてリスト / 引用 / コードブロック / 表 / 画像 / 水平線 ボタンも用意。

### 表示

| ショートカット | 動作 |
|---|---|
| `Ctrl+=` / `Ctrl+ホイール↑` | フォントサイズ拡大 |
| `Ctrl+-` / `Ctrl+ホイール↓` | フォントサイズ縮小 |
| `Ctrl+0` | フォントサイズをリセット |

## ディレクトリ構成

```
md-editor/
├── src/                         # フロントエンド（TypeScript）
│   ├── main.ts                  # エントリポイント
│   ├── editor.ts                # Milkdown Crepe 連携・タブ別エディタ管理
│   ├── store.ts                 # タブ状態管理
│   ├── tabs.ts                  # タブバーUI
│   ├── toolbar.ts               # 書式ツールバー
│   ├── shortcuts.ts             # キーボードショートカット
│   ├── actions.ts               # 開く / 保存 / 閉じる等のファイル操作
│   ├── modal.ts                 # 確認ダイアログ
│   ├── settings.ts              # フォント / 言語等の設定永続化
│   ├── settings-modal.ts        # 設定UI
│   ├── line-numbers.ts          # 行番号オーバーレイ
│   ├── i18n.ts                  # 多言語対応（ja/en）
│   ├── title.ts                 # ウィンドウタイトル更新
│   └── style.css
├── src-tauri/                   # バックエンド（Rust）
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs
│   │   ├── commands.rs          # フロントから呼ぶコマンド
│   │   ├── menu.rs              # ネイティブメニュー
│   │   ├── recent.rs            # 最近使ったファイル
│   │   ├── i18n.rs              # メニュー側の多言語対応
│   │   └── startup.rs           # 起動引数 / シングルインスタンス処理
│   ├── capabilities/            # Tauri権限定義
│   ├── icons/                   # アプリアイコン
│   ├── Cargo.toml
│   └── tauri.conf.json
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── IMPLEMENTATION_PLAN_v2.md    # 設計ドキュメント（初期計画）
```

## 設計メモ

### 「保存確認が誤発火しない」設計

Milkdown Crepe は WYSIWYG エディタなので、ファイル読み込み時に内容が正規化される（例: 末尾改行の調整、リスト記号の統一など）。生のファイル内容と比較すると、ユーザーが何もしていなくても dirty 判定になってしまう。

`editor.ts` ではこの問題を以下で回避している:

- 初回シリアライズ結果（`crepe.getMarkdown()`）を `baseline` として保持
- `markdownUpdated` イベントで現在の markdown と baseline を比較し、`isDirty` を判定
- 保存後は `baseline` を現在の markdown に再セット

### タブ別 EditorState の保持

各タブは独立した Crepe インスタンスを持つ。非アクティブなエディタは `#editor-pane-park` という退避用コンテナに DOM ごと移動させる。これは WebView2 が複数の合成レイヤを抱え込むと残像が出る問題を回避するためで、`display: none` ではなく親要素の付け替えで対応している。

## ライセンス

[MIT License](./LICENSE)
