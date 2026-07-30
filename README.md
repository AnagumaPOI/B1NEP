# B1NEP

B1NEP is distributed as a packaged Windows application.

## 使用方式

1. 下載整個 `B1NEP` 資料夾。
2. 保持 `B1NEP.exe` 和 `_internal` 在同一層，不要只複製 exe。
3. 雙擊 `B1NEP.exe` 可啟動圖形介面。
4. 命令列可直接跑 FEM，不開啟主介面：

```bat
B1NEP.exe FEM path\case.rio [output_dir]
```

CLI 模式會輸出一般 FEM 結果，並在輸出資料夾另外產生固定檔名 `result.txt`。

## 授權驗證

第一次啟動會連到 Cloudflare 驗證本機裝置資訊。新裝置預設需要管理者核准，核准後才能使用。

之後每次啟動都會連到 Cloudflare 確認狀態；如果該裝置被停用，程式會停止執行。
