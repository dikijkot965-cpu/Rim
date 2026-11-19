# Вход через Google (Supabase OAuth)

Сложность: **низкая–средняя**. Код в клиенте уже вызывает `signInWithOAuth({ provider: 'google' })`.
Основная работа — настройка консолей (один раз).

## Что уже есть в RIM

- Кнопка **«Войти через Google»** на экране входа (`#googleAuthBtn`).
- `AuthFormController.signInWithGoogle()` → Supabase OAuth redirect.
- После возврата с Google срабатывает существующий `onAuthStateChange` / session bootstrap.

Google **не разделяет** «регистрацию» и «вход»: первый вход создаёт пользователя в Auth, повторный — входит.

## Шаги настройки (владелец проекта)

1. **Google Cloud Console**
   - Создать OAuth 2.0 Client ID (тип *Web application*).
   - Authorized JavaScript origins: origin сайта (например `https://your-domain` и `http://localhost:4173` для отладки).
   - Authorized redirect URIs:  
     `https://<PROJECT_REF>.supabase.co/auth/v1/callback`

2. **Supabase Dashboard → Authentication → Providers → Google**
   - Enable Google.
   - Вставить Client ID и Client Secret из Google Cloud.
   - Сохранить.

3. **Supabase → Authentication → URL Configuration**
   - Site URL = боевой origin мессенджера.
   - Redirect URLs: origin приложения + `/**` при необходимости.

4. Проверка: открыть мессенджер → «Войти через Google» → аккаунт Google → возврат в РИМ с сессией.

## Ограничения

- Без шагов 1–3 кнопка покажет ошибку провайдера — это ожидаемо.
- Нужен HTTPS на проде (кроме localhost).
- Профиль `profiles` по-прежнему создаётся через `ensureProfile` / `loadProfile` после первого OAuth-входа.

## Безопасность

- Secret Google хранится **только** в Supabase, не в клиентском коде.
- Publishable anon key по-прежнему публичный; RLS на таблицах обязателен.
