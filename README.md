# B1NEP

本 repo 只放已打包好的 Windows 執行檔與必要檔案。

請保持 `B1NEP.exe` 和 `_internal` 在同一層，不要只複製 exe。

## 使用方式

### 1. 開啟圖形介面

直接雙擊 `B1NEP.exe`。

### 2. 命令列只跑 FEM

在 `B1NEP.exe` 所在資料夾用 cmd 執行：

```bat
B1NEP.exe FEM path\case.rio [output_dir]
```

程式會執行 FEM 計算，不開啟主介面，並在輸出資料夾產生 `result.txt`。

如果不希望命令列呼叫時看到 splash，可以用 PowerShell hidden 方式啟動：

```powershell
Start-Process -FilePath ".\B1NEP.exe" -ArgumentList @("FEM", "D:\case.rio", "D:\out") -Wait -WindowStyle Hidden
```

## 授權驗證

程式啟動時會連到 Cloudflare 驗證本機裝置資訊。新裝置需要管理者核准後才能使用；若裝置被停用，程式會停止執行。
