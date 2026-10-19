#!/usr/bin/env bash
# Сервер Remote Control (claude remote-control) под launchd — агент local.selen.remote-control (ADR-0018).
#
# make host-install копирует этот файл в ~/.local/share/selen/remote-control.sh: агент не зависит от ветки,
# открытой в основной копии. Параметры — из окружения (задаёт plist агента):
#   SELEN_MAIN_DIR       — основная копия Selen (новые сессии — git worktree в ней, --spawn worktree)
#   CLAUDE_BIN           — путь к claude
#   SELEN_RC_NAME_PREFIX — префикс имён новых сессий
#   SELEN_RC_LOG         — лог (больше 5 МБ при запуске — в .1)
#
# Без терминала сервер раз в секунду перерисовывает статус — 40 МБ лога в сутки. Фильтр убирает управляющие
# последовательности терминала и пишет строку, только если её не было в логе последние 10 минут: новые события
# и ошибки — сразу, неизменный статус — раз в 10 минут (видно, что сервер жив).
set -uo pipefail

log_file="${SELEN_RC_LOG:?}"
mkdir -p "$(dirname "$log_file")"
if [[ -f "$log_file" && "$(du -k "$log_file" | cut -f1)" -gt 5120 ]]; then mv "$log_file" "$log_file.1"; fi
exec >> "$log_file" 2>&1

cd "${SELEN_MAIN_DIR:?}" || exit 1
printf '[%s] === Сервер Remote Control: каталог %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$SELEN_MAIN_DIR"

"${CLAUDE_BIN:?}" remote-control --spawn worktree --remote-control-session-name-prefix "${SELEN_RC_NAME_PREFIX:?}" 2>&1 \
  | perl -ne '
      BEGIN { $| = 1; use POSIX qw(strftime); }
      s/\e\]8;;([^\a\e]+)(?:\a|\e\\)(.*?)\e\]8;;(?:\a|\e\\)/$2 ($1)/g;   # ссылка терминала → «текст (адрес)»
      s/\e\][^\a]*(?:\a|\e\\)//g; s/\e\[[0-9;?]*[ -\/]*[@-~]//g; s/\r//g; s/^\s+|\s+$//g;
      next if $_ eq "";
      my $now = time;
      next if exists $printed{$_} && $now - $printed{$_} < 600;
      $printed{$_} = $now;
      print strftime("[%Y-%m-%d %H:%M:%S] ", localtime), $_, "\n";'
status=${PIPESTATUS[0]}
printf '[%s] Сервер Remote Control завершился (код %s) — launchd перезапустит его через минуту\n' \
  "$(date '+%Y-%m-%d %H:%M:%S')" "$status"
exit "$status"
