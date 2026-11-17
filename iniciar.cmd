@echo off
rem Inicia o Sprite Forge. Use "iniciar.cmd celular" para abrir tambem no celular (mesma rede Wi-Fi).
cd /d "%~dp0"
if /i "%1"=="celular" (
  echo No celular, abra o endereco "Network" mostrado abaixo.
  call npm.cmd run dev -- --host --open
) else (
  call npm.cmd run dev -- --open
)
pause
