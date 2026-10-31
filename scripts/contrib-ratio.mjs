// コントリビューションの種類別の割合をドーナツグラフの SVG にする。
// 使い方: env GITHUB_TOKEN=... USERNAME=... node scripts/contrib-ratio.mjs [出力先]
// （zsh では USERNAME が特殊変数のため、env を付けないとログイン名で上書きされる）
// CONTRIB_JSON を渡すと API を呼ばずにその値で描く（表示確認用）。
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const OUTPUT = process.argv[2] ?? 'output/contrib-ratio.svg';

// 3D グラフのレーダーと同じ5種類・同じ並びに、種類別の内訳が返らない非公開分を加える。
// 6つの合計がカレンダーの総数（3D グラフの contributions）と一致する
const KINDS = [
  { key: 'totalCommitContributions', label: 'Commit', color: '#2da44e' },
  { key: 'totalIssueContributions', label: 'Issue', color: '#bf8700' },
  { key: 'totalPullRequestContributions', label: 'PullReq', color: '#0969da' },
  { key: 'totalPullRequestReviewContributions', label: 'Review', color: '#8250df' },
  { key: 'totalRepositoryContributions', label: 'Repo', color: '#cf222e' },
  { key: 'restrictedContributionsCount', label: 'Private', color: '#8c959f' },
];

const fetchCounts = async () => {
  if (process.env.CONTRIB_JSON) {
    return JSON.parse(process.env.CONTRIB_JSON);
  }
  const token = process.env.GITHUB_TOKEN;
  const login = process.env.USERNAME;
  if (!token || !login) {
    throw new Error('GITHUB_TOKEN と USERNAME が必要です');
  }
  // 期間を省略すると直近1年（3D グラフと同じ集計期間）
  const query = `query ($login: String!) {
    user(login: $login) {
      contributionsCollection { ${KINDS.map((k) => k.key).join(' ')} }
    }
  }`;
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { login } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    throw new Error(`GraphQL エラー: ${JSON.stringify(json.errors ?? json)}`);
  }
  return json.data.user.contributionsCollection;
};

const render = (counts) => {
  const items = KINDS.map((k) => ({ ...k, value: counts[k.key] ?? 0 }));
  const total = items.reduce((sum, i) => sum + i.value, 0);

  const cx = 110;
  const cy = 110;
  const r = 70;
  const stroke = 32;

  // pathLength=100 の円に stroke-dasharray で区間を描く。12時の位置から時計回り
  let offset = 0;
  const arcs = items
    .filter((i) => i.value > 0)
    .map((i) => {
      const pct = (i.value / total) * 100;
      const arc = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${i.color}" stroke-width="${stroke}" pathLength="100" stroke-dasharray="${pct.toFixed(3)} ${(100 - pct).toFixed(3)}" stroke-dashoffset="${(-offset).toFixed(3)}" transform="rotate(-90 ${cx} ${cy})"><title>${i.label} ${i.value}</title></circle>`;
      offset += pct;
      return arc;
    });

  const legend = items.map((i, n) => {
    const y = 30 + n * 32;
    const pct = total > 0 ? `${((i.value / total) * 100).toFixed(1)}%` : '-';
    return `<rect x="240" y="${y - 8}" width="16" height="16" rx="3" fill="${i.color}"/>
  <text x="266" y="${y}" class="fg">${i.label}</text>
  <text x="400" y="${y}" class="fg" text-anchor="end">${i.value}</text>
  <text x="470" y="${y}" class="sub" text-anchor="end">${pct}</text>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="490" height="220" viewBox="0 0 490 220">
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 15px; dominant-baseline: middle; }
    .fg { fill: #1f2328; }
    .sub { fill: #656d76; }
    .base { stroke: #d0d7de; }
    @media (prefers-color-scheme: dark) {
      .fg { fill: #e6edf3; }
      .sub { fill: #8d96a0; }
      .base { stroke: #30363d; }
    }
  </style>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" class="base" stroke-width="${stroke}"/>
  ${arcs.join('\n  ')}
  <text x="${cx}" y="${cy - 10}" class="fg" text-anchor="middle" style="font-size: 26px; font-weight: bold;">${total}</text>
  <text x="${cx}" y="${cy + 16}" class="sub" text-anchor="middle" style="font-size: 12px;">contributions</text>
  ${legend.join('\n  ')}
</svg>
`;
};

const counts = await fetchCounts();
await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, render(counts));
console.log(`wrote ${OUTPUT}`);
