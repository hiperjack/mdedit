# mdedit 実装計画 v2

軽量なMarkdownエディタをTauri 2.xで自作する。`.md`ファイルをダブルクリックすると、その中身を編集できる単一ウィンドウ・複数タブのアプリ。

## プロダクトゴール

- `.md`ファイルをダブルクリック → 既存ウィンドウの新規タブで開く（シングルインスタンス）
- 上にタブバー、左に編集ペイン、右にライブプレビュー
- 編集していないタブを閉じれば、保存確認ダイアログは出ない
- インストーラ込みで20MB以下、起動1秒以内

## 技術スタック

| 層 | 採用 |
|---|---|
| デスクトップフレームワーク | Tauri 2.x |
| フロントエンドビルド | Vite + TypeScript |
| エディタ | CodeMirror 6 |
| Markdownレンダラ | markdown-it（GFM対応プラグイン込） |
| シンタックスハイライト | highlight.js |
| 状態管理 | 自前のストア（外部ライブラリなし） |
| ドラッグ並び替え | SortableJS（タブバー専用、軽量） |

UIフレームワーク（React/Vue）は使わない。状態の中心はストア、UIは関数で生成する素朴な構造。

## 機能スコープ

### v1.0に入れる

- `.md`ダブルクリック起動・既存ウィンドウの新規タブで開く
- **タブバー**: 上部、横並び、ドラッグで並び替え、長くなったら横スクロール
- **タブ操作**: クリックで切替、`×`ボタンで閉じる、ミドルクリックで閉じる
- **同じmdを再度開いた時**: 既に開いていればモーダルで尋ねる（「タブを切り替える」or「破棄して開き直す」）
- **全タブ閉じたら**: 空タブが1つ残る
- CodeMirror 6（行番号、Markdownハイライト、検索 `Ctrl+F`、ワードラップ）
- markdown-itによるライブプレビュー（200msデバウンス）
- GFM拡張（テーブル、タスクリスト、コードブロックの言語別色付け）
- ショートカット: `Ctrl+S` / `Ctrl+Shift+S` / `Ctrl+O` / `Ctrl+N` / `Ctrl+W` / `Ctrl+Tab` / `Ctrl+Shift+Tab` / `Ctrl+1〜9`
- 未保存マーク（タブと、タイトルバー先頭の `●`）
- タブ閉じる時の未保存確認（ただし未編集なら出さない）
- ダークモード固定

### v1.0で入れない

- ファイルツリー、ステータスバー
- 設定画面、自動保存、スクロール同期
- Wikiリンク、画像埋め込み、エクスポート、目次
- ライト/ダーク切替
- タブの別ウィンドウ化、タブのピン留め
- セッション復元（次回起動時にタブを復元）

## アーキテクチャ概要

```
┌────────────────────────────────────────────────────┐
│  mdedit.exe (Tauri)                                 │
│                                                     │
│  ┌─────────────────────┐  ┌─────────────────────┐  │
│  │  Rust Backend       │  │  Web Frontend        │  │
│  │  - 起動引数解析      │←→│  - タブストア        │  │
│  │  - シングルインスタンス│ │  - CodeMirror 6      │  │
│  │  - ファイルI/O       │  │  - markdown-it       │  │
│  │  - ダイアログ        │  │  - SortableJS        │  │
│  └─────────────────────┘  └─────────────────────┘  │
└────────────────────────────────────────────────────┘
        ↑
  .md (OS関連付け経由でパス渡し)
```

### 画面レイアウト

```
┌──────────────────────────────────────────────────┐
│ [foo.md ×] [●bar.md ×] [baz.md ×]      [+]      │ ← タブバー
├──────────────────────┬───────────────────────────┤
│                      │                           │
│   CodeMirror 6       │   markdown-it             │
│   （アクティブタブ    │   （アクティブタブの       │
│     のEditorState）   │     contentをレンダリング）│
│                      │                           │
└──────────────────────┴───────────────────────────┘
  ●bar.md - mdedit                                  ← ウィンドウタイトル
```

### 状態モデル

```typescript
type Tab = {
  id: string;              // UUID。タブの並びとは独立
  filePath: string | null; // null = 新規未保存タブ
  content: string;         // 現在のテキスト
  savedContent: string;    // 最後に保存した時点のテキスト
  editorState: EditorState | null; // CodeMirrorの状態（カーソル・undo・スクロール）
};

type AppState = {
  tabs: Tab[];             // 表示順（並び替えで変動）
  activeTabId: string | null;
};
```

`editorState`をタブごとに保持することで、タブ切替時にカーソル位置・選択範囲・undo履歴・スクロール位置が保たれる。

### 「保存確認が誤発火しない」設計

`isDirty(tabId)`は`tab.content !== tab.savedContent`を返す派生関数。  
`savedContent`はファイルI/Oでしか書き換わらない（読み込み完了時、保存成功時、新規作成時の`''`）。  
WYSIWYGのような正規化処理が間に挟まらないため、ユーザーが何もしなければ`false`のまま。

タブ閉じる時、ウィンドウ閉じる時の確認ダイアログはこの値だけを見る。

### イベントフロー

```
A. 起動・別ファイル受信時:
   Rust → emit("open-file", {path, content}) 
        → main.tsで「既に開いているか」を判定
        → 開いていれば確認モーダル → 切替 or 開き直し
        → 開いていなければ新規タブ追加

B. 編集時:
   CodeMirror onChange 
        → activeTabのcontent更新 
        → デバウンス200ms 
        → preview再描画
        → タブ表示の●更新
        → タイトルバーの●更新

C. 保存時:
   Ctrl+S → invoke("write_file", {path, content}) 
        → activeTabのsavedContent更新

D. タブ切替時:
   tabs.tsでクリック検出 
        → 現在のview.stateをactiveTabに保存
        → activeTabIdを変更
        → 新activeTabのeditorStateをview.setState()で復元
        → previewをactiveTabのcontentで再描画
        → タイトルバー更新

E. タブ閉じる時:
   ×クリック / Ctrl+W / ミドルクリック 
        → isDirty()ならconfirm
        → tabsからtabを削除
        → 残タブがなければ空タブを追加
        → activeTabIdを隣接タブに移動
```

## ディレクトリ構成

```
mdedit/
├── src/                        # フロント (TypeScript + Vite)
│   ├── main.ts                 # エントリ、Tauriイベント購読
│   ├── editor.ts               # CodeMirror 6セットアップ、state差替え
│   ├── preview.ts              # markdown-it + デバウンス
│   ├── store.ts                # タブ配列の状態管理
│   ├── tabs.ts                 # タブバーUI、ドラッグ並び替え
│   ├── shortcuts.ts            # キーボードショートカット
│   ├── title.ts                # タイトルバー更新
│   ├── modal.ts                # 確認モーダル（保存確認・重複オープン）
│   └── style.css               # レイアウト + 装飾
├── src-tauri/                  # Rust側
│   ├── src/
│   │   ├── main.rs             # エントリ、プラグイン登録
│   │   ├── commands.rs         # read_file / write_file / frontend_ready
│   │   └── startup.rs          # 起動引数 → open-fileイベント
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── icons/
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## モジュール責務

### フロント

| ファイル | 責務 | 主要API |
|---|---|---|
| `store.ts` | タブ配列とアクティブIDの状態管理、購読通知 | `addTab`, `removeTab`, `setActive`, `updateContent`, `markSaved`, `reorder`, `findByPath`, `subscribe`, `getActive`, `isDirty(tabId)` |
| `editor.ts` | CodeMirror 6を生成。アクティブタブのstateを差し替え | `createEditor(parent)` → `{ view, swapTo(tab), captureState() }` |
| `preview.ts` | アクティブタブのcontentを購読してデバウンスレンダリング | `createPreview(parent)` |
| `tabs.ts` | タブバーDOM生成、SortableJSで並び替え、クリック・閉じる・ミドルクリック処理 | `createTabBar(parent)` |
| `title.ts` | アクティブタブのファイル名と`●`をウィンドウタイトルに反映 | `setupTitle()` |
| `shortcuts.ts` | Ctrl系ショートカット | `setupShortcuts(editor)` |
| `modal.ts` | Promiseベースの確認ダイアログ。保存確認、重複オープン確認 | `confirmSave(filename)`, `confirmDuplicate(filename)` |
| `main.ts` | 全体組み立て、`open-file`受信、`frontend_ready`通知、ウィンドウclose要求のフック | エントリ |

### Rust

| ファイル | 責務 |
|---|---|
| `main.rs` | アプリ生成、`tauri-plugin-single-instance`登録、`tauri-plugin-dialog`登録、コマンド登録 |
| `commands.rs` | `read_file(path)`, `write_file(path, content)`, `frontend_ready()` |
| `startup.rs` | 起動引数解析、フロント準備完了を待ってから`open-file`をemit。シングルインスタンスのコールバックも同じロジックを使う |

### Rustコマンド署名

```rust
#[tauri::command]
fn read_file(path: String) -> Result<String, String>;

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String>;

#[tauri::command]
fn frontend_ready(app: tauri::AppHandle) -> Result<(), String>;
```

## ストアAPIの詳細

```typescript
// store.ts の公開API
export const store = {
  // 読み取り
  getState(): AppState;
  getActive(): Tab | null;
  isDirty(tabId: string): boolean;
  hasAnyDirty(): boolean;
  findByPath(path: string): Tab | null;
  
  // タブ操作
  addTab(opts?: { filePath?: string; content?: string }): string; // 戻り値: 新タブID
  removeTab(tabId: string): void;
  setActive(tabId: string): void;
  reorder(fromIndex: number, toIndex: number): void;
  
  // 内容操作
  updateContent(tabId: string, content: string): void;
  markSaved(tabId: string, savedPath: string): void;
  setEditorState(tabId: string, state: EditorState): void;
  
  // 購読
  subscribe(fn: (state: AppState) => void): () => void;
};
```

操作APIを意味のある単位にまとめることで、UI側は何が起きたかを伝えるだけで済む。`set`を露出させない。

## タブの主要シナリオ

### 新規タブを開く

```
1. ユーザーがCtrl+Nを押す
2. shortcuts.ts → store.addTab() で空タブ作成
3. store: 新Tab生成（filePath=null, content='', savedContent=''）→ tabsへpush
4. store: activeTabIdを新タブに変更
5. 購読者全員に通知
   - tabs.ts: タブを描画追加
   - editor.ts: 新タブのEditorState（空）を生成してview.setState()
   - preview.ts: 空をレンダリング
   - title.ts: "Untitled - mdedit"
```

### ダブルクリックで既存タブと同じファイルが来た

```
1. Rust → emit("open-file", { path, content })
2. main.tsの受信ハンドラ:
   const existing = store.findByPath(path);
   if (existing) {
     // 内容が同じか比較
     if (existing.content === content && !store.isDirty(existing.id)) {
       store.setActive(existing.id);  // 単に切替
     } else {
       const choice = await confirmDuplicate(filename);
       // choice: 'switch' | 'reload' | 'cancel'
       if (choice === 'switch') store.setActive(existing.id);
       if (choice === 'reload') {
         store.updateContent(existing.id, content);
         store.markSaved(existing.id, path);
         store.setActive(existing.id);
       }
     }
   } else {
     const id = store.addTab({ filePath: path, content });
     store.markSaved(id, path);  // savedContent = content
     store.setActive(id);
   }
```

### タブを閉じる

```
1. ユーザーが×をクリック / Ctrl+W / ミドルクリック
2. tabs.ts / shortcuts.ts → 対象タブIDを得る
3. if (store.isDirty(tabId)) { 
     const choice = await confirmSave(filename);
     if (choice === 'cancel') return;
     if (choice === 'save') await saveFile(tabId);
   }
4. store.removeTab(tabId)
5. store内部処理:
   - tabsから削除
   - もしactiveTabIdが削除対象だったら、隣接タブに移す（右隣 → なければ左隣）
   - 残0個になったら空タブを1つ追加してactiveに
6. 購読者通知
```

### タブをドラッグで並び替え

```
1. SortableJSがタブDOMの並び替えイベントを発火
2. tabs.tsが onEnd で fromIndex, toIndex を取得
3. store.reorder(fromIndex, toIndex) を呼ぶ
4. store: tabs配列を並び替え（activeTabIdは変えない）
5. 購読者通知（タブバー再描画）
```

## CodeMirrorのstate差し替え戦略

タブ切替時の挙動。

```typescript
// editor.ts
function swapTo(tab: Tab) {
  // 1. 現在のviewのstateをアクティブだったタブに保存
  const prevActive = store.getActive();
  if (prevActive && prevActive.id !== tab.id) {
    store.setEditorState(prevActive.id, view.state);
  }
  
  // 2. 新タブのstateで差し替え
  if (tab.editorState) {
    view.setState(tab.editorState);
  } else {
    // 新規タブなら新しいstateを作って保存
    const newState = EditorState.create({
      doc: tab.content,
      extensions: [...],
    });
    view.setState(newState);
    store.setEditorState(tab.id, newState);
  }
}
```

これでカーソル位置・undo履歴・選択範囲・スクロールがタブごとに保持される。

## ウィンドウを閉じる時のフック

ユーザーが`×`でウィンドウを閉じた時、未保存タブがあれば確認したい。Tauri 2.xの`onCloseRequested`を使う。

```typescript
// main.ts
import { getCurrentWindow } from '@tauri-apps/api/window';

const win = getCurrentWindow();
win.onCloseRequested(async (event) => {
  if (store.hasAnyDirty()) {
    event.preventDefault();
    const choice = await confirmCloseAll(); 
    // choice: 'discard' | 'cancel' | 'review'
    if (choice === 'cancel') return;
    if (choice === 'review') {
      // 最初の未保存タブにフォーカスを当てるだけで終わる
      const firstDirty = store.getState().tabs.find(t => store.isDirty(t.id));
      if (firstDirty) store.setActive(firstDirty.id);
      return;
    }
    // discardなら何もせず、再度closeを呼ぶ
    win.destroy();
  }
});
```

## キーボードショートカット一覧

| ショートカット | 動作 |
|---|---|
| `Ctrl+S` | 現在のタブを保存 |
| `Ctrl+Shift+S` | 現在のタブを名前を付けて保存 |
| `Ctrl+O` | ファイルを開く（新規タブで） |
| `Ctrl+N` | 新規タブ |
| `Ctrl+W` | 現在のタブを閉じる |
| `Ctrl+Tab` | 次のタブ |
| `Ctrl+Shift+Tab` | 前のタブ |
| `Ctrl+1` 〜 `Ctrl+9` | 番号順のタブへ移動 |
| `Ctrl+F` | エディタ内検索（CodeMirror標準） |

## シングルインスタンスの設計

`tauri-plugin-single-instance`を使う。挙動は前計画と同じだが、フロント側の処理がタブ前提に変わる。

```
[2回目起動: mdedit.exe "b.md"]
       ↓
ロック取得失敗 → 既存プロセスへargvを送信して終了
       ↓
[1回目プロセスのコールバック]
新しいargvを受け取る
       ↓
read_file で内容読み込み
       ↓
emit("open-file", { path, content })
       ↓
[main.tsのリスナ]
findByPath() で既存タブを探す
   - あれば: 確認モーダル → 切替 or 開き直し
   - なければ: 新規タブ追加 → アクティブに
       ↓
ウィンドウを前面に出す（set_focus）
```

## 起動シーケンス

```
1. mdedit.exe起動
2. main.rs:
   - シングルインスタンス確認
   - WebView生成
   - 起動引数を保留状態（Mutex<Option<String>>）に保存
3. WebView内でmain.tsが実行
4. main.ts:
   - store.addTab() で空タブを1つ用意（後で起動引数があれば置き換える）
   - editor / preview / tabs / title / shortcuts初期化
   - listen("open-file", ...) を登録
   - invoke("frontend_ready") をRustへ送信
5. Rust frontend_readyハンドラ:
   - 保留中のパスがあれば read_file → emit("open-file", {path, content})
   - なければ何もしない
6. main.ts open-fileリスナ:
   - 起動直後で空タブのみなら、空タブを置き換え（addTabせずupdateContent + markSaved）
   - すでに他タブがあるなら、新規タブで開く
```

「起動直後の空タブを置き換え」処理は地味に重要。これがないと、`mdedit.exe foo.md`で起動した時に「空タブ」と「foo.md」の2タブができてしまう。

## ファイル関連付け

`tauri.conf.json`の`bundle.windows.fileAssociations`で設定。

```json
{
  "bundle": {
    "windows": {
      "fileAssociations": [
        {
          "ext": ["md", "markdown"],
          "name": "Markdown File",
          "description": "Markdown Document",
          "role": "Editor"
        }
      ]
    }
  }
}
```

## 依存パッケージ

### package.json

```json
{
  "dependencies": {
    "@codemirror/lang-markdown": "^6.2.5",
    "@codemirror/state": "^6.4.1",
    "@codemirror/theme-one-dark": "^6.1.2",
    "@tauri-apps/api": "^2.0.0",
    "@tauri-apps/plugin-dialog": "^2.0.0",
    "codemirror": "^6.0.1",
    "highlight.js": "^11.9.0",
    "markdown-it": "^14.0.0",
    "markdown-it-task-lists": "^2.1.1",
    "sortablejs": "^1.15.0"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0",
    "@types/markdown-it": "^14.0.0",
    "@types/sortablejs": "^1.15.0",
    "typescript": "^5.4.0",
    "vite": "^5.2.0"
  }
}
```

### Cargo.toml

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-dialog = "2"
tauri-plugin-single-instance = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

## 実装順序（推奨）

タブ機能が中核なので、ストアとタブUIを早めに固める。

1. **Tauri雛形生成**（Vanilla TypeScript選択）
2. **store.ts**を最初に書く。タブ配列＋アクティブIDの操作APIを完成させる。単体でテスト可能
3. **modal.ts**でPromiseベースの確認ダイアログを作る（タブ操作で多用するため早めに）
4. **editor.ts**でCodeMirror 6を立ち上げ、`swapTo`によるstate差替えを動かす
   - ストアを直接いじって2タブ切替が成立することをconsoleで確認
5. **preview.ts**でライブプレビュー
6. **tabs.ts**でタブバーDOM生成、クリック・閉じる・ミドルクリック
7. **SortableJS**でドラッグ並び替え。store.reorder連携
8. **shortcuts.ts**で全ショートカット
9. **title.ts**でウィンドウタイトル
10. **Rust commands.rs**: read_file / write_file / frontend_ready
11. **Rust startup.rs**: 起動引数解析、open-fileイベント
12. **main.ts**でTauri連携の最終結線（onCloseRequested含む）
13. **tauri-plugin-single-instance**を組み込み、複数起動の挙動確認
14. **tauri.conf.jsonのfileAssociations**設定
15. `npm run tauri build`でインストーラ生成
16. インストールして`.md`ダブルクリック動作確認

各ステップ単独で動作確認できる粒度。ストア完成後はブラウザ単独でかなり進められる。

## 動作確認チェックリスト（v1.0完了条件）

### 基本動作
- [ ] 何も開いていない状態でアプリが起動し、空タブが1つ表示される
- [ ] `.md`をダブルクリックでアプリが起動し、その内容が空タブを置き換えて表示される
- [ ] `.md`をダブルクリックすると別ウィンドウは開かない（シングルインスタンス）
- [ ] アプリ起動中に別の`.md`をダブルクリックすると、新規タブで開く
- [ ] アプリ起動中に既に開いている`.md`をダブルクリックすると、確認モーダルが出る
- [ ] 確認モーダルで「切替」を選ぶと、そのタブがアクティブになる
- [ ] 確認モーダルで「開き直し」を選ぶと、そのタブの内容が更新される

### 編集とプレビュー
- [ ] 編集するとプレビューが200ms以内に更新される
- [ ] タブ切替で、カーソル位置・選択範囲・undo履歴・スクロール位置が保たれる
- [ ] タブ切替で、プレビューが新タブの内容に切り替わる
- [ ] テーブル、タスクリスト、コードブロックがプレビューで正しくレンダリングされる

### 未保存マーク（**MarkText問題の検証**）
- [ ] **編集していないタブを閉じても、保存確認ダイアログが出ない**
- [ ] 編集すると、タブとタイトルバーに`●`が出る
- [ ] 保存すると、`●`が消える
- [ ] 編集している状態でタブを閉じると、保存確認ダイアログが出る
- [ ] 保存確認ダイアログでキャンセルを選ぶと、タブは閉じない

### タブ操作
- [ ] タブを`×`ボタンで閉じられる
- [ ] タブをミドルクリックで閉じられる
- [ ] `Ctrl+W`でアクティブタブが閉じる
- [ ] アクティブタブを閉じると、隣接タブがアクティブになる
- [ ] 全タブを閉じると、空タブが1つ残る
- [ ] タブをドラッグで並び替えられる
- [ ] 並び替えてもアクティブタブは変わらない
- [ ] タブが多くなるとタブバーが横スクロールする

### ショートカット
- [ ] `Ctrl+S`で保存
- [ ] `Ctrl+Shift+S`で名前を付けて保存
- [ ] `Ctrl+O`でファイルを開く（新規タブ）
- [ ] `Ctrl+N`で新規タブ
- [ ] `Ctrl+Tab`で次のタブ
- [ ] `Ctrl+Shift+Tab`で前のタブ
- [ ] `Ctrl+1` ~ `Ctrl+9`で番号指定タブへ移動
- [ ] `Ctrl+F`でエディタ内検索

### ウィンドウ閉じる
- [ ] 未保存タブがない状態でウィンドウを閉じると、確認なしで閉じる
- [ ] 未保存タブがある状態でウィンドウを閉じると、確認モーダルが出る

### パフォーマンス
- [ ] インストーラサイズが20MB以下
- [ ] 起動から編集可能になるまで1秒以内

## v1.1以降の拡張候補

- ライト/ダーク切替（OS追従）
- セッション復元（次回起動時にタブを復元）
- 最近開いたファイル
- フォントサイズ変更
- スクロール同期
- 設定の永続化（`tauri-plugin-store`）
- タブのピン留め
- タブの別ウィンドウ化
- 数式（KaTeX）
- 画像埋め込み（相対パス解決）

## 参考リンク

- Tauri 2.x: https://v2.tauri.app/
- CodeMirror 6: https://codemirror.net/
- markdown-it: https://github.com/markdown-it/markdown-it
- tauri-plugin-single-instance: https://v2.tauri.app/plugin/single-instance/
- SortableJS: https://github.com/SortableJS/Sortable
