#!/bin/sh
# Renders the bento box at each level (0 to 10) into small transparent PNGs, using the real
# BentoBox component, for the badge list and the Insights button. Needs Google Chrome.
#   sh scripts/build-badge-thumbs.sh
set -e
cd "$(dirname "$0")/.."
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
TMP=$(mktemp -d)
mkdir -p .smoke src/assets/badges
cat > .smoke/thumbs.jsx <<'JS'
import { renderToStaticMarkup } from 'react-dom/server';
import { writeFileSync } from 'node:fs';
import BentoBox from '../src/components/Badges/BentoBox.jsx';
for (let l = 0; l <= 10; l++) {
  const svg = renderToStaticMarkup(<BentoBox level={l} size={240} />).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
  writeFileSync(process.argv[2] + '/box-' + l + '.svg', svg);
}
JS
npx esbuild .smoke/thumbs.jsx --bundle --platform=node --format=cjs --outfile=.smoke/thumbs.cjs --loader:.jsx=jsx --loader:.css=empty --jsx=automatic --log-level=error
node .smoke/thumbs.cjs "$TMP"
for l in 0 1 2 3 4 5 6 7 8 9 10; do
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$TMP/profile" \
    --default-background-color=00000000 --window-size=240,250 \
    --screenshot="src/assets/badges/box-$l.png" "file://$TMP/box-$l.svg" >/dev/null 2>&1
done
rm -rf .smoke "$TMP"
ls -la src/assets/badges
