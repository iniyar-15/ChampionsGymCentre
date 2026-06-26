Add-Type -AssemblyName System.Speech

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$audioDir = Join-Path $root "audio"
New-Item -ItemType Directory -Force -Path $audioDir | Out-Null

$narration = Get-Content (Join-Path $root "narration.json") -Raw | ConvertFrom-Json

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voices = $synth.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }
Write-Host "Installed voices: $($voices -join ', ')"

$preferred = $voices | Where-Object { $_ -like "*David*" } | Select-Object -First 1
if (-not $preferred) { $preferred = $voices | Select-Object -First 1 }
$synth.SelectVoice($preferred)
Write-Host "Using voice: $preferred"

$synth.Rate = 0
$synth.Volume = 100

foreach ($item in $narration) {
  $outPath = Join-Path $audioDir "$($item.scene).wav"
  $synth.SetOutputToWaveFile($outPath, (New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)))
  $synth.Speak($item.text)
  $synth.SetOutputToNull()
  Write-Host "Wrote $outPath"
}

Write-Host "Done."
