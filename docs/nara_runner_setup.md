# Nara Prefecture Self-Hosted Runner

奈良県 scraper は GitHub-hosted runner から `403 Forbidden` を返されるため、専用の self-hosted runner に分離した。

対象 workflow:
- [.github/workflows/nara_prefecture_scrape.yml](C:\Users\jonso\.gemini\antigravity\playground\azimuthal-pioneer\naramania\.github\workflows\nara_prefecture_scrape.yml)

前提:
- Windows x64 マシン
- `gh auth login` 済み
- repo `jonsonpanson114/naramania` への admin 権限
- Node.js 20 系

## 登録

PowerShell:

```powershell
Set-Location C:\Users\jonso\.gemini\antigravity\playground\azimuthal-pioneer\naramania
.\scripts\setup_nara_runner.ps1
```

このスクリプトは次を行う。
- `actions/runner` の latest Windows x64 を取得
- `C:\actions-runner\naramania-nara-pref` に展開
- repo runner registration token を `gh api` で取得
- runner 名 `naramania-nara-pref` で登録
- labels:
  - `self-hosted`
  - `windows`
  - `x64`
  - `nara-pref`
- `run.cmd` を起動

## サービス化

常駐させるなら、GitHub Docs の Windows runner service 手順に従って `svc install` / `svc start` を使う。

参考:
- GitHub Docs: [Adding self-hosted runners](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners?learn=hosting_your_own_runners)
- GitHub Docs: [Configuring the self-hosted runner application as a service](https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/configuring-the-self-hosted-runner-application-as-a-service)

## 動作確認

1. GitHub repository Settings → Actions → Runners で `naramania-nara-pref` が `Idle`
2. Actions から `Nara Prefecture Scrape` を `workflow_dispatch`
3. 奈良県ログで `403 Forbidden` 以外の結果になるか確認

## 現在の設計

- [daily_scrape.yml](C:\Users\jonso\.gemini\antigravity\playground\azimuthal-pioneer\naramania\.github\workflows\daily_scrape.yml)
  - `SCRAPE_EXCEPT_MUNICIPALITIES=奈良県`
  - hosted runner では奈良県を除外
- [nara_prefecture_scrape.yml](C:\Users\jonso\.gemini\antigravity\playground\azimuthal-pioneer\naramania\.github\workflows\nara_prefecture_scrape.yml)
  - `SCRAPE_ONLY_MUNICIPALITIES=奈良県`
  - self-hosted runner 専用
