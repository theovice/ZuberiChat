<#
.SYNOPSIS
  Captures a screenshot of the live ZuberiChat Tauri window.

.DESCRIPTION
  Finds the ZuberiChat window by process name (default "Zuberi") or window title,
  captures the window client area as PNG, and writes the output path to stdout.
  Does NOT interact with the window in any way -- observation only.

.PARAMETER ProcessName
  Process name to find the window. Default: "Zuberi".

.PARAMETER WindowTitle
  Window title substring to match. Ignored if -ProcessName is also provided.

.PARAMETER OutputPath
  Full path for the output PNG. Default: screenshots\capture-YYYYMMDD-HHmmss.png
#>
param(
    [string]$ProcessName,
    [string]$WindowTitle,
    [string]$OutputPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ── Win32 interop for window bounds and DPI ──────────────────────────────
$winCaptureSource = @"
using System;
using System.Runtime.InteropServices;
using System.Drawing;
using System.Drawing.Imaging;

public class WinCapture {
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("dwmapi.dll")]
    public static extern int DwmGetWindowAttribute(IntPtr hwnd, int dwAttribute, out RECT pvAttribute, int cbAttribute);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    public static Bitmap CaptureWindow(IntPtr hWnd) {
        RECT rect;
        // DWMWA_EXTENDED_FRAME_BOUNDS = 9 -- accurate bounds on DPI-scaled displays
        int hr = DwmGetWindowAttribute(hWnd, 9, out rect, Marshal.SizeOf(typeof(RECT)));
        if (hr != 0) {
            // Fallback to GetWindowRect if DWM fails
            GetWindowRect(hWnd, out rect);
        }

        int width = rect.Right - rect.Left;
        int height = rect.Bottom - rect.Top;

        if (width <= 0 || height <= 0) {
            throw new InvalidOperationException("Window has zero or negative dimensions");
        }

        Bitmap bmp = new Bitmap(width, height, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(bmp)) {
            g.CopyFromScreen(rect.Left, rect.Top, 0, 0, new Size(width, height), CopyPixelOperation.SourceCopy);
        }
        return bmp;
    }
}
"@

# Try with System.Drawing.Common first (newer .NET), fall back to System.Drawing only
try {
    Add-Type -TypeDefinition $winCaptureSource -ReferencedAssemblies System.Drawing, System.Drawing.Common
} catch {
    # System.Drawing.Common not available -- retry with System.Drawing only (Windows PowerShell 5.1)
    if (-not ([System.Management.Automation.PSTypeName]'WinCapture').Type) {
        Add-Type -TypeDefinition $winCaptureSource -ReferencedAssemblies System.Drawing
    }
}

# ── Resolve target window ────────────────────────────────────────────────

# Default process name
if (-not $ProcessName -and -not $WindowTitle) {
    $ProcessName = "Zuberi"
}

$targetHwnd = $null
$targetLabel = ""

if ($ProcessName) {
    $procs = @(Get-Process -Name $ProcessName -ErrorAction SilentlyContinue |
               Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero })
    if ($procs.Count -eq 0) {
        [Console]::Error.WriteLine("CAPTURE_FAIL|No window found for process $ProcessName")
        exit 1
    }
    $proc = $procs[0]
    $targetHwnd = $proc.MainWindowHandle
    $targetLabel = "process $ProcessName (PID $($proc.Id))"
} elseif ($WindowTitle) {
    $procs = @(Get-Process | Where-Object {
        $_.MainWindowHandle -ne [IntPtr]::Zero -and
        $_.MainWindowTitle -like "*$WindowTitle*"
    })
    if ($procs.Count -eq 0) {
        [Console]::Error.WriteLine("CAPTURE_FAIL|No window found for title '$WindowTitle'")
        exit 1
    }
    $proc = $procs[0]
    $targetHwnd = $proc.MainWindowHandle
    $targetLabel = "title '$($proc.MainWindowTitle)' (PID $($proc.Id))"
}

# ── Check minimized state ────────────────────────────────────────────────
if ([WinCapture]::IsIconic($targetHwnd)) {
    [Console]::Error.WriteLine("CAPTURE_FAIL|Window is minimized -- cannot capture. Restore the window and retry.")
    exit 1
}

# ── Resolve output path ─────────────────────────────────────────────────
if (-not $OutputPath) {
    $screenshotsDir = Join-Path $PSScriptRoot "..\screenshots"
    if (-not (Test-Path $screenshotsDir)) {
        New-Item -ItemType Directory -Path $screenshotsDir -Force | Out-Null
    }
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $OutputPath = Join-Path $screenshotsDir "capture-$timestamp.png"
}

# Ensure parent directory exists
$parentDir = Split-Path $OutputPath -Parent
if ($parentDir -and -not (Test-Path $parentDir)) {
    New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
}

# ── Capture ──────────────────────────────────────────────────────────────
try {
    $bmp = [WinCapture]::CaptureWindow($targetHwnd)
    $bmp.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
} catch {
    [Console]::Error.WriteLine("CAPTURE_FAIL|Screenshot write failed: $($_.Exception.Message)")
    exit 1
}

# ── Verify output ────────────────────────────────────────────────────────
$fullPath = (Resolve-Path $OutputPath).Path
if (-not (Test-Path $fullPath)) {
    [Console]::Error.WriteLine("CAPTURE_FAIL|Screenshot write failed: file not found after save")
    exit 1
}

Write-Output "CAPTURE_OK|$fullPath"
exit 0
