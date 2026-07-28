# B1NEP

這個 repository 只放已經用 PyInstaller 打包好的 B1NEP 執行檔與必要檔案，不包含原始 Python 程式碼。

## 使用方式

1. 下載整個 repository，或用 `git clone https://github.com/AnagumaPOI/B1NEP.git`。
2. 保持 `B1NEP.exe` 和 `_internal` 資料夾在同一層，不要只單獨移動 exe。
3. 雙擊 `B1NEP.exe` 啟動程式。
4. 第一次啟動時，程式會連到 Cloudflare 登記並驗證本機裝置資訊。
5. 新裝置預設為 pending，需要管理者在 Cloudflare KV 改成 active 後才能使用。
6. 之後每次啟動都會連到 Cloudflare 確認狀態；若被改成 revoked，程式會停止使用。
7. 如果 Windows 出現安全性提示，確認來源可信後再選擇繼續執行。

## 注意

目前版本為 Windows 桌面版。若要更新程式，請重新下載最新版整個資料夾。
