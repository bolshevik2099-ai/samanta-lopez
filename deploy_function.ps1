# Script de Despliegue de la Función Edge de Supabase

Write-Host "=== Despliegue del Asistente de IA (Samanta) ===" -ForegroundColor Cyan

# 1. Verificar si Supabase CLI está instalado
if (!(Get-Command supabase -ErrorAction SilentlyContinue)) {
    Write-Host "Supabase CLI no está instalado en el sistema." -ForegroundColor Yellow
    Write-Host "Instalándolo globalmente vía npm..." -ForegroundColor Yellow
    npm install -g supabase
}

# 2. Iniciar sesión si es necesario
Write-Host "`nPara desplegar la función, es necesario iniciar sesión en Supabase." -ForegroundColor Cyan
Write-Host "Si se te solicita, autoriza el inicio de sesión en la ventana del navegador que se abrirá." -ForegroundColor Yellow
supabase login

# 3. Desplegar la función
Write-Host "`nDesplegando la función 'webhook-admin' al proyecto jglptpkrqbwvnhpoockb..." -ForegroundColor Cyan
supabase functions deploy webhook-admin --project-ref jglptpkrqbwvnhpoockb --no-verify-jwt

Write-Host "`n¡Proceso finalizado! Tu asistente de IA está listo para usarse." -ForegroundColor Green
Read-Host "Presiona Enter para salir"
