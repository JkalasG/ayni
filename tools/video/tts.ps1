param(
  [Parameter(Mandatory = $true)][string]$TextFile,
  [Parameter(Mandatory = $true)][string]$OutWav,
  [string]$Voice = "Microsoft Zira Desktop",
  [int]$Rate = 0
)
# Windows' own speech engine (SAPI): works offline and the voice is free to use.
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice($Voice)
$synth.Rate = $Rate
$synth.Volume = 100
$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(44100, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$synth.SetOutputToWaveFile($OutWav, $format)
$synth.Speak([System.IO.File]::ReadAllText($TextFile, [System.Text.Encoding]::UTF8))
$synth.Dispose()
