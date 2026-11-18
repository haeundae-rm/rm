#!/bin/sh
# 버전 올리기 (2026-11-18): ./bump.sh  → 오늘 날짜 다음 번호로 아래 파일들의 버전 글자를 한 번에 바꿈
#   (손으로 고치다 한 곳을 빼먹어 '새 버전' 띠가 안 사라진 11/18 사고 방지)
cd "$(dirname "$0")" || exit 1
FILES="app/app.js app/version.json app/index.html index.html"
old=$(grep -o '20[0-9][0-9]\.[0-9][0-9]\.[0-9][0-9]-[0-9]*' app/version.json | head -1)
[ -n "$old" ] || { echo "지금 버전을 app/version.json 에서 못 찾았어요"; exit 1; }
today=$(TZ=Asia/Seoul date +%Y.%m.%d)
case "$old" in "$today"-*) n=$(( ${old##*-} + 1 ));; *) n=1;; esac
new="$today-$n"
re=$(printf '%s' "$old" | sed 's/\./\\./g')
for f in $FILES; do
  grep -q "$re" "$f" || { echo "❌ $f 에 지금 버전($old)이 없어요 — 손으로 확인해 주세요"; exit 1; }
done
sed -i "s/$re/$new/g" $FILES
for f in $FILES; do echo "  $f: $(grep -c "$new" "$f")곳"; done
left=$(grep -l "$re" $FILES || true)
[ -z "$left" ] || { echo "❌ 옛 버전이 남았어요: $left"; exit 1; }
echo "✅ $old → $new"
