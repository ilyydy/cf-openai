#! /usr/bin/env bash

PROJECT_ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"

vtest() {
  if [ -z "$1" ]; then
    npm test
  else
    npm test src/"$1"
  fi
}

vcoverage() {
  if [ -z "$1" ]; then
    npm run coverage
  else
    npm run coverage src/"$1"
  fi
}

reload-dev() {
  # shellcheck source=/dev/null
  source "$PROJECT_ROOT_DIR"/dev.sh
}

_test_autotab() {
  cur_dir=$(pwd)

  _get_comp_words_by_ref -n : cur

  if [ "${#COMP_WORDS[@]}" -eq 2 ]; then
    cd "$PROJECT_ROOT_DIR"/src 2>/dev/null && _filedir 'test.ts'

    for ((i = 0; i < ${#COMPREPLY[@]}; i++)); do
      # 为目录时追加 /
      # 如果已经在 src 目录则会由补全自动追加，不需要额外处理
      if [ -d "${COMPREPLY[$i]}" ] && [ "$PROJECT_ROOT_DIR/src" != "${cur_dir}" ]; then
        COMPREPLY["$i"]="${COMPREPLY[$i]}/"
      else
        COMPREPLY["$i"]="${COMPREPLY[$i]}"
      fi
    done

    cd "${cur_dir}" || exit
  fi
}

complete -o filenames -o nospace -o bashdefault -F _test_autotab vtest vcoverage
