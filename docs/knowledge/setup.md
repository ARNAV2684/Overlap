# Graphify setup and manual rebuild

Governing spec: [knowledge-map](../specs/knowledge-map.md). Pinned tool: **Graphify 0.9.92**, package `graphifyy`, isolated Python 3.12. macOS installation/build exercised; Windows commands are supplied but not executed here. See [validation](validation.md).

## Scope and limits

This manual recipe uses Graphify's published Python extraction/build/export APIs. Code receives structural extraction; Markdown receives explicit citation indexing. Component notes are reviewed by the host assistant, and their declared dependencies appear in a separate eleven-box view. This is **not** an unattended deep semantic extraction of every document. No provider SDK/API key or new subscription is used. Do not run `graphify extract`, `label`, `install`, `watch` or automatic skill installers as part of this recipe: those can introduce provider calls or settings changes beyond this milestone.

`graphify-config.json` is Overlap's reviewed input policy, consumed by the recipe below, not a native Graphify configuration file. Only tracked allowlisted inputs are copied into a new candidate directory before extraction. Tests, fixtures, old mock, historical plans and recordings remain outside the graph, but notes link their evidence. Configuration/placeholder files may yield only file nodes; inspect coverage rather than assuming their behaviour was analysed. The package may inspect symbols in supported languages; it cannot certify Bicep deployments or runtime connections.

The HTML renderer fetches its pinned vis-network JavaScript from unpkg on first load, so initial browser rendering needs internet. Package installation also needs internet. The build recipe makes no hosted model calls and does not send repository content to a model endpoint. Normal assistant review uses your existing session and quota.

## Install once per laptop

Run from the repository root with `uv` available:

```sh
uv venv --python 3.12 --managed-python .graphify-venv
uv pip install --python .graphify-venv/bin/python -r docs/knowledge/requirements.txt
```

Windows PowerShell: replace `.graphify-venv/bin/python` with `.graphify-venv/Scripts/python.exe`. No activation, global installation or assistant hook is required. The exact Graphify version is pinned; transitive dependency resolution can differ later, so record `uv pip freeze --python <isolated-python>` with validation. No application dependency files are changed.

## Build manually

Use a clean checkout after pulling the merged notes. For an intentional local preview, stage only the changed knowledge documents first so `git ls-files` includes them; provenance marks any dirty tree. Never `git add` credentials or generated output.

Open the isolated interpreter from the repository root:

```sh
.graphify-venv/bin/python
```

On Windows use `.graphify-venv/Scripts/python.exe`. Paste the following as one block using `exec(r""" ... """)` in the Python prompt, or ask your existing assistant to execute this exact recipe with that interpreter. Do not save it as a new tracked helper script. It writes only ignored local artifacts. Each run has its own candidate folder; `LATEST.txt` changes only after successful export.

```python
# Manual Graphify build recipe; run from the repository root with the isolated Python.
import fnmatch, hashlib, json, re, subprocess, shutil
from datetime import datetime, timezone
from pathlib import Path
from importlib.metadata import version
from graphify.extract import collect_files, extract
from graphify.build import build_from_json
from graphify.cluster import cluster
from graphify.export import to_json, to_html

root = Path.cwd().resolve()
cfg = json.loads((root/'docs/knowledge/graphify-config.json').read_text())
assert version('graphifyy') == cfg['graphify_version']
out = root/'graphify-out'
# Build in an isolated candidate directory. Never overwrite a previous successful run.
run = out/('run-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
inputs = run/'input'
inputs.mkdir(parents=True)
tracked = subprocess.check_output(['git','ls-files','-z'],cwd=root).decode().split('\0')
selected, excluded, hashes = [], [], {}
for name in sorted(filter(None,tracked)):
    p = Path(name)
    allowed = (p.parts[0] in cfg['include_roots'] or name in cfg['include_root_files'])
    allowed &= p.suffix in cfg['extensions']
    allowed &= not any(x in cfg['exclude_parts'] for x in p.parts)
    allowed &= p.name not in cfg['exclude_names']
    allowed &= not any(fnmatch.fnmatch(p.name,g) for g in cfg['exclude_globs'])
    src=root/p
    if not allowed or src.is_symlink() or not src.is_file():
        excluded.append(name); continue
    payload=src.read_bytes()
    hashes[name]=hashlib.sha256(payload).hexdigest()
    dst=inputs/p; dst.parent.mkdir(parents=True,exist_ok=True); dst.write_bytes(payload)
    selected.append(name)
manifest={'source_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),
          'dirty':bool(subprocess.check_output(['git','status','--porcelain'],cwd=root,text=True).strip()),
          'generated_at':datetime.now(timezone.utc).isoformat(),'graphify_version':version('graphifyy'),
          'mode':'local AST + explicit document citations and component dependencies; host-reviewed notes; no provider calls',
          'inputs_sha256':hashes,'excluded':excluded}
(run/'provenance.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
# Input is now limited to the manifest: no tool scans the original checkout.
code=[]
for name in selected:
    if Path(name).suffix != '.md': code.extend(collect_files(inputs/name,root=inputs))
code=sorted(set(code))
ast=extract(code,cache_root=inputs,root=inputs,parallel=False)
# Documents are citation-indexed, not automatically claimed to have deep semantic coverage.
# Component prose was reviewed in the existing assistant session. Only its explicit links become edges.
docs=[x for x in selected if x.endswith('.md')]
def docid(name): return re.sub('[^a-z0-9_]','_',str(Path(name).with_suffix('')).lower())+'_document'
nodes=list(ast['nodes']); edges=list(ast['edges']); known={n['id'] for n in nodes}
for name in docs:
    content=(inputs/name).read_text(encoding='utf-8')
    heading=next((x[2:].strip() for x in content.splitlines() if x.startswith('# ')),name)
    nid=docid(name)
    nodes.append({'id':nid,'label':heading,'file_type':'document','source_file':name,'source_location':'L1','_origin':'semantic'})
    known.add(nid)
# Make file-to-symbol links so note citations reach AST symbols as well as other notes.
files={}
for n in ast['nodes']:
    sf=n.get('source_file','')
    if sf: files.setdefault(sf,[]).append(n['id'])
for name in docs:
    content=(inputs/name).read_text(encoding='utf-8')
    for line_no,line in enumerate(content.splitlines(),1):
        for link in re.findall(r'\]\(([^)]+)\)',line):
            if '://' in link or link.startswith('#'): continue
            target=((inputs/name).parent/link.split('#')[0]).resolve()
            try: rel=target.relative_to(inputs).as_posix()
            except ValueError: continue
            destinations=[docid(rel)] if rel in docs else files.get(rel,[])
            # Folder evidence remains in notes but is not expanded into invented relationships.
            for dest in destinations:
                edges.append({'source':docid(name),'target':dest,'relation':'references','confidence':'EXTRACTED','confidence_score':1.0,'weight':1.0,'source_file':name,'source_location':f'L{line_no}','_origin':'semantic'})
    if name.startswith('docs/knowledge/') and name.endswith('.md'):
        for line_no,line in enumerate(content.splitlines(),1):
            if line.startswith('Downstream / consumers:'):
                for dest in re.findall(r'\]\(([^)]+\.md)\)',line):
                    rel=(Path('docs/knowledge')/dest).as_posix()
                    if rel in docs: edges.append({'source':docid(name),'target':docid(rel),'relation':'declares_downstream_dependency','confidence':'EXTRACTED','confidence_score':1.0,'weight':1.0,'source_file':name,'source_location':f'L{line_no}','_origin':'semantic','context':'May be planned; consult component status. Not proof of runtime delivery.'})
# Preserve separate relations between the same endpoints in raw extraction even if Graphify merges them.
extraction={'nodes':nodes,'edges':edges,'hyperedges':[]}
(run/'extraction.json').write_text(json.dumps(extraction),encoding='utf-8')
G=build_from_json(extraction,root=inputs,directed=True)
assert len(G)>0
communities=cluster(G)
assert to_json(G,communities,str(run/'graph.json'),built_at_commit=manifest['source_commit'])
assert to_html(G,communities,str(run/'graph.html'),node_limit=max(len(G),5000))
component_names=['generator','event-hubs','screen-relay','archiver','stats-engine','storage','ai-insights','mcp','web-pubsub','frontend','environments']
component_ids=[docid('docs/knowledge/'+x+'.md') for x in component_names]
C=G.subgraph(component_ids).copy()
assert len(C)==11
assert to_json(C,{i:[n] for i,n in enumerate(C)},str(run/'components.json'),built_at_commit=manifest['source_commit'])
assert to_html(C,{i:[n] for i,n in enumerate(C)},str(run/'components.html'),community_labels={i:C.nodes[n]['label'] for i,n in enumerate(C)})
covered={p.relative_to(inputs).as_posix() for p in code}
manifest['coverage']={'files_with_only_file_node':[x for x in covered if len(files.get(x,[])) <= 1], 'ast_files':len(code),'citation_documents':len(docs),'unsupported_or_unparsed':[x for x in selected if x not in covered and x not in docs], 'deep_document_semantic_extraction':False}
manifest['graph']={'nodes':len(G),'edges':G.number_of_edges()}
(run/'provenance.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
report=f"# Overlap knowledge graph\n\nSource: `{manifest['source_commit']}`; dirty preview: {manifest['dirty']}. Graphify {version('graphifyy')}.\n\n{len(G)} nodes; {G.number_of_edges()} edges. {len(code)} AST inputs; {len(docs)} citation-indexed documents.\n\nComponent semantics were reviewed in the existing assistant session; document connections here are explicit citations/dependencies. No headless model calls or automatic deep semantic extraction. Read component status before interpreting any edge.\n\nOpen graph.html to search/filter and inspect source. Full file hashes, exclusions and coverage gaps are in provenance.json; original extraction preserves relations potentially collapsed by graph construction.\n\nThis is code/document navigation, not integration testing. The renderer may download its pinned vis-network JavaScript from unpkg; initial rendering therefore needs internet. No repository payload is submitted to that CDN by this recipe.\n"
(run/'GRAPH_REPORT.md').write_text(report,encoding='utf-8')
(out/'LATEST.txt').write_text(run.name+'\n',encoding='utf-8')
print(json.dumps({'run':str(run),'nodes':len(G),'edges':G.number_of_edges(),'ast_files':len(code),'documents':len(docs),'coverage_gaps':manifest['coverage']['unsupported_or_unparsed']},indent=2))

```

Exit the interpreter using `exit()`. The command prints the run directory. Open its `components.html` for the box map and `graph.html` for the code/document graph. Search **MCP context tools** or **Screen relay**, click a node, and inspect its source and connections. The code graph can be queried from the terminal:

```sh
.graphify-venv/bin/graphify explain "MCP context tools" --graph graphify-out/<run-name>/graph.json
```

Windows: `.graphify-venv/Scripts/graphify.exe`. Replace `<run-name>` with the printed directory name / contents of `graphify-out/LATEST.txt`.

## Check freshness before using a graph

Run this in the same isolated Python from the repository root:

```python
import hashlib, json, subprocess
from pathlib import Path
out=Path('graphify-out'); run=out/(out/'LATEST.txt').read_text().strip()
p=json.loads((run/'provenance.json').read_text())
changed=[name for name,digest in p['inputs_sha256'].items() if not Path(name).is_file() or hashlib.sha256(Path(name).read_bytes()).hexdigest()!=digest]
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
print('STALE: rebuild' if changed or head!=p['source_commit'] else 'Recorded inputs match; inspect git status for newly added inputs')
print('Changed inputs:',changed)
```

Also inspect `git status --short` and rebuild after newly tracked inputs/configuration changes. An unchanged HEAD alone is insufficient. Dirty preview provenance is not a merged release snapshot. A failed command must not be treated as a new successful graph.

## Teammate walkthrough

1. Pull the merged branch (or explicitly check out the review branch); read [overview](README.md).
2. Read the component note and linked contract/source before changing that component.
3. Install the pinned isolated tool, then run the manual recipe.
4. Open `components.html` and follow the live, archive and insight dependencies. Planned edges remain planned regardless of their visual appearance.
5. Use `graph.html` or `graphify explain` to reach code; verify the evidence revision before relying on status.
6. Update the note with the code PR, then regenerate after merge. Never commit graphs, input copies, caches or credentials.

To remove the setup, remove only this checkout's `.graphify-venv/` and `graphify-out/`. Notes and application code remain intact. Avoid touching other environments or services. No Docker/Azure process is started by this workflow.
