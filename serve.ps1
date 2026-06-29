param(
  [int]$Port = 8010
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()
Write-Host "Serving $root at http://127.0.0.1:$Port/"

$contentTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".css" = "text/css; charset=utf-8"
  ".js" = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".webmanifest" = "application/manifest+json; charset=utf-8"
  ".svg" = "image/svg+xml"
}

while ($listener.IsListening) {
  $context = $listener.GetContext()
  $path = [uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart("/"))
  if ([string]::IsNullOrWhiteSpace($path)) {
    $path = "index.html"
  }

  $fullPath = [System.IO.Path]::GetFullPath((Join-Path $root $path))
  if ([System.IO.Directory]::Exists($fullPath)) {
    $fullPath = [System.IO.Path]::GetFullPath((Join-Path $fullPath "index.html"))
  }
  if (-not $fullPath.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
    $context.Response.StatusCode = 403
    $context.Response.Close()
    continue
  }

  if (-not [System.IO.File]::Exists($fullPath)) {
    $context.Response.StatusCode = 404
    $context.Response.Close()
    continue
  }

  $extension = [System.IO.Path]::GetExtension($fullPath)
  $context.Response.ContentType = $contentTypes[$extension]
  if (-not $context.Response.ContentType) {
    $context.Response.ContentType = "application/octet-stream"
  }

  $bytes = [System.IO.File]::ReadAllBytes($fullPath)
  $context.Response.ContentLength64 = $bytes.Length
  $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $context.Response.Close()
}
