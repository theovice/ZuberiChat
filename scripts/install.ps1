$installer = Get-ChildItem "C:\Users\PLUTO\github\Repo\ZuberiChat\src-tauri\target\release\bundle\nsis" -Filter "*.exe" | Select-Object -First 1
Write-Host "Installer: $($installer.FullName)"
Start-Process -FilePath $installer.FullName -ArgumentList "/S" -Wait
Write-Host "NSIS install completed"
