# kbp (kintone plugins mono-repo)

- Package manager: npm workspaces
- Build: esbuild
- Checks:
  - `npm run kb:check` … config.css の外部URL/不在/HTML混入を検出
  - `npm run build` … app/ と config/ を生成
- Pack（ZIP化）は未実施。必要時に有効化します。