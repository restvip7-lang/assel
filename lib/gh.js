// Commits to the site repo through the GitHub API. Every commit to main redeploys the site on Vercel.
const repo = () => process.env.GITHUB_REPO || 'restvip7-lang/assel';
const BRANCH = 'main';

async function gh(path, opts = {}) {
  const r = await fetch(`https://api.github.com/repos/${repo()}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json', ...opts.headers,
    },
  });
  if (!r.ok) {
    const e = new Error(`GitHub ${opts.method || 'GET'} ${path}: ${r.status} ${await r.text()}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

export async function readObjects() {
  const f = await gh(`/contents/data/objects.json?ref=${BRANCH}`);
  return JSON.parse(Buffer.from(f.content, 'base64').toString('utf8'));
}

// change(list) returns { list, message, files: [{ path, buffer } | { path, remove: true }], result }; list: null means no commit. Retries if main moved meanwhile.
export async function commitObjects(change) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const ref = await gh(`/git/ref/heads/${BRANCH}`);
    const head = ref.object.sha;
    const commit = await gh(`/git/commits/${head}`);
    const f = await gh(`/contents/data/objects.json?ref=${head}`);
    const current = JSON.parse(Buffer.from(f.content, 'base64').toString('utf8'));
    const { list, message, files = [], result } = await change(current);
    if (!list) return result; // nothing to change

    const all = [...files, { path: 'data/objects.json', buffer: Buffer.from(JSON.stringify(list, null, 2) + '\n') }];
    const tree = [];
    for (const x of all) {
      if (x.remove) { tree.push({ path: x.path, mode: '100644', type: 'blob', sha: null }); continue; }
      const b = await gh('/git/blobs', { method: 'POST', body: JSON.stringify({ content: x.buffer.toString('base64'), encoding: 'base64' }) });
      tree.push({ path: x.path, mode: '100644', type: 'blob', sha: b.sha });
    }
    const t = await gh('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: commit.tree.sha, tree }) });
    const c = await gh('/git/commits', { method: 'POST', body: JSON.stringify({ message, tree: t.sha, parents: [head] }) });
    try {
      await gh(`/git/refs/heads/${BRANCH}`, { method: 'PATCH', body: JSON.stringify({ sha: c.sha }) });
      return result;
    } catch (e) {
      if (e.status !== 422 || attempt === 2) throw e;
    }
  }
}
