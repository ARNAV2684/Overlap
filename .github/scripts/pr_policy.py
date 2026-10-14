"""Pull request checks for Overlap. Standard library only, so CI needs no setup.

Subcommands (run from the repository root inside a `pull_request` workflow):

  policy      AI-attribution lines in commits / PR text / branch name (blocking); branch name, PR template and commit
              identity (warnings)
  blocklist   private terms from the POLICY_BLOCKLIST secret in PR text, commits, file paths and added lines (blocking)
  scope       layers and hot files touched, spec gate and plan presence (warnings), overlaps with other open PRs and
              active plans; writes the report and, with --post, the PR comment
  projects    JSON list of changed Python projects (folders with a pyproject.toml) for the Python workflow

Exit code 1 only for blocking problems. Warnings are GitHub annotations. Blocklisted terms are never printed.
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

REPORT_MARKER = "<!-- overlap-pr-checks -->"
AREAS = {"generator", "stats", "archiver", "agents", "mcp_server", "functions", "web", "infra", "docs", "scripts",
         "contracts", "fixtures", "data", "mock", "ci", "plans", "setup"}
CODE_EXTENSIONS = {".py", ".ts", ".tsx", ".js", ".jsx", ".bicep"}
NOT_LAYER_CODE = ("mock/", ".github/", "plans/", "docs/", ".claude/")

# Generic AI-attribution patterns. No vendor names here: those live in the private blocklist (meta: terms).
AI_LINE_PATTERNS = [
    (re.compile(r"^\s*generated (with|by)\b", re.IGNORECASE), "a 'generated with/by' footer"),
    (re.compile(r"^\s*[\w-]+-session\s*:", re.IGNORECASE), "a session trailer"),
    (re.compile(r"https?://\S*/sessions?/\S+", re.IGNORECASE), "a session link"),
    (re.compile(r"\U0001F916"), "a robot-emoji footer"),
]
CO_AUTHOR = re.compile(r"^\s*co-authored-by\s*:\s*(?P<name>[^<]*)<(?P<email>[^>]+)>", re.IGNORECASE)
NOREPLY_HUMAN = re.compile(r"^(?:(?P<id>\d+)\+)?(?P<login>[A-Za-z0-9-]+)@users\.noreply\.github\.com$", re.IGNORECASE)


# --------------------------------------------------------------------------- results


@dataclass
class Result:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def error(self, msg: str, file: str | None = None, line: int | None = None):
        self.errors.append(msg)
        _annotate("error", msg, file, line)

    def warn(self, msg: str, file: str | None = None, line: int | None = None):
        self.warnings.append(msg)
        _annotate("warning", msg, file, line)

    def note(self, msg: str):
        self.notes.append(msg)
        _annotate("notice", msg)


def _annotate(level: str, msg: str, file: str | None = None, line: int | None = None):
    if not os.environ.get("GITHUB_ACTIONS"):
        print(f"{level.upper()}: {msg}" + (f" ({file}:{line})" if file else ""))
        return
    where = ""
    if file:
        where = f" file={file}" + (f",line={line}" if line else "")
    print(f"::{level}{where}::{msg}".replace("\n", " "))


def _summary(title: str, res: Result):
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    lines = [f"### {title}", ""]
    if not (res.errors or res.warnings or res.notes):
        lines.append("All clear.")
    for label, items in (("Blocking", res.errors), ("Warnings", res.warnings), ("Notes", res.notes)):
        if items:
            lines.append(f"**{label}**")
            lines += [f"- {i}" for i in items]
            lines.append("")
    text = "\n".join(lines) + "\n"
    if path:
        with open(path, "a", encoding="utf-8") as f:
            f.write(text)
    else:
        print(text)


# --------------------------------------------------------------------------- PR context


@dataclass
class PR:
    number: int
    title: str
    body: str
    branch: str
    author: str
    base_sha: str
    head_sha: str
    repo: str
    from_fork: bool


def load_pr() -> PR:
    path = os.environ.get("GITHUB_EVENT_PATH")
    if path and Path(path).exists():
        event = json.loads(Path(path).read_text(encoding="utf-8"))
        pr = event["pull_request"]
        return PR(
            number=pr["number"], title=pr.get("title") or "", body=pr.get("body") or "",
            branch=pr["head"]["ref"], author=pr["user"]["login"], base_sha=pr["base"]["sha"],
            head_sha=pr["head"]["sha"], repo=event["repository"]["full_name"],
            from_fork=pr["head"]["repo"]["full_name"] != event["repository"]["full_name"],
        )
    # Local use: compare the current branch with origin/main.
    branch = git("rev-parse", "--abbrev-ref", "HEAD").strip()
    return PR(0, os.environ.get("PR_TITLE", ""), os.environ.get("PR_BODY", ""), branch,
              os.environ.get("PR_AUTHOR", ""), git("merge-base", "origin/main", "HEAD").strip(),
              git("rev-parse", "HEAD").strip(), os.environ.get("GITHUB_REPOSITORY", ""), False)


def git(*args: str) -> str:
    return subprocess.run(["git", *args], check=True, capture_output=True, text=True, encoding="utf-8",
                          errors="replace").stdout


@dataclass
class Commit:
    sha: str
    author_name: str
    author_email: str
    message: str


def commits(pr: PR) -> list[Commit]:
    out = git("log", "--no-merges", "--format=%H%x1f%an%x1f%ae%x1f%B%x1e", f"{pr.base_sha}..{pr.head_sha}")
    result = []
    for rec in out.split("\x1e"):
        rec = rec.strip("\n")
        if not rec:
            continue
        sha, name, email, message = rec.split("\x1f", 3)
        result.append(Commit(sha, name, email, message))
    return result


def changed_files(pr: PR) -> list[tuple[str, str]]:
    """(status, path) for every file changed in the PR, renames reported at their new path."""
    out = git("diff", "--name-status", "--find-renames", f"{pr.base_sha}...{pr.head_sha}")
    files = []
    for line in out.splitlines():
        parts = line.split("\t")
        if len(parts) >= 2:
            files.append((parts[0][0], parts[-1]))
    return files


def added_lines(pr: PR) -> list[tuple[str, int, str]]:
    """(path, line number, text) for every added line in the PR."""
    out = git("diff", "-U0", "--no-color", "--find-renames", f"{pr.base_sha}...{pr.head_sha}")
    path, lineno, result = None, 0, []
    for line in out.splitlines():
        if line.startswith("+++ "):
            path = line[6:] if line.startswith("+++ b/") else None
        elif line.startswith("@@"):
            m = re.search(r"\+(\d+)", line)
            lineno = int(m.group(1)) if m else 0
        elif line.startswith("+") and path:
            result.append((path, lineno, line[1:]))
            lineno += 1
    return result


# --------------------------------------------------------------------------- policy


def ai_findings(text: str, meta_terms: list[str]) -> list[str]:
    """Reasons a piece of commit / PR text carries AI attribution."""
    found = []
    for raw in text.splitlines():
        for pattern, why in AI_LINE_PATTERNS:
            if pattern.search(raw):
                found.append(why)
        m = CO_AUTHOR.match(raw)
        if m:
            email = m.group("email").strip()
            name = m.group("name").strip()
            machine = email.lower().startswith("noreply@") or re.search(r"[@.]noreply\.", email, re.IGNORECASE)
            if machine and not NOREPLY_HUMAN.match(email):
                found.append("a co-author trailer with a non-person address")
            elif any(term_match(t, f"{name} {email}") for t in meta_terms):
                found.append("a co-author trailer naming a blocked tool")
    return sorted(set(found))


def branch_ok(branch: str) -> bool:
    m = re.fullmatch(r"([a-z0-9_]+)/[a-z0-9][a-z0-9._-]*", branch)
    return bool(m) and m.group(1) in AREAS


def template_problems(body: str) -> list[str]:
    problems = []
    sections = {}
    current = None
    for line in body.splitlines():
        h = re.match(r"^##\s+(.*)", line)
        if h:
            current = h.group(1).strip().lower()
            sections[current] = []
        elif current is not None:
            sections[current].append(line)

    def content(name: str) -> str:
        text = "\n".join(sections.get(name, []))
        text = re.sub(r"<!--.*?-->", "", text, flags=re.DOTALL)
        return text.strip()

    if not content("what changed"):
        problems.append("'What changed' is empty")
    if not content("how to test"):
        problems.append("'How to test' is empty")
    if "which layer(s)" in sections and "[x]" not in content("which layer(s)").lower() \
            and not re.search(r"^[^-\s].+", content("which layer(s)"), re.MULTILINE):
        problems.append("no layer ticked (or explained) under 'Which layer(s)'")
    if "contracts" in sections and "[x]" not in content("contracts").lower():
        problems.append("no box ticked under 'Contracts'")
    if not sections:
        problems.append("the PR template is missing")
    return problems


def identity_problems(cs: list[Commit], pr_author: str) -> list[str]:
    problems = []
    for c in cs:
        m = NOREPLY_HUMAN.match(c.author_email)
        short = c.sha[:7]
        if not m:
            problems.append(f"{short}: author email is not a GitHub noreply address (use your own GitHub identity)")
        elif pr_author and m.group("login").lower() != pr_author.lower():
            problems.append(f"{short}: authored by {m.group('login')}, PR opened by {pr_author} (fine when pairing)")
    return problems


def cmd_policy(args) -> int:
    pr = load_pr()
    res = Result()
    meta_terms = [t for scope, t in parse_blocklist(os.environ.get("POLICY_BLOCKLIST", "")) if scope == "meta"]
    cs = commits(pr)
    for c in cs:
        for why in ai_findings(c.message, meta_terms):
            res.error(f"Commit {c.sha[:7]} has {why}. Rewrite the message without it.")
    for label, text in (("PR title", pr.title), ("PR description", pr.body)):
        for why in ai_findings(text, meta_terms):
            res.error(f"The {label} has {why}. Edit it out.")
    if any(term_match(t, pr.branch) for t in meta_terms):
        res.error("The branch name contains a blocked term. Use <area>/<short-description>.")
    if not branch_ok(pr.branch):
        res.warn(f"Branch '{pr.branch}' doesn't follow <area>/<short-description> "
                 f"(areas: {', '.join(sorted(AREAS))}).")
    for p in template_problems(pr.body):
        res.warn(f"PR template: {p}.")
    for p in identity_problems(cs, pr.author):
        res.warn(f"Identity: {p}.")
    if not cs:
        res.note("No commits found between base and head.")
    _summary("Policy", res)
    return 1 if res.errors else 0


# --------------------------------------------------------------------------- blocklist


def parse_blocklist(raw: str) -> list[tuple[str, str]]:
    """Lines: `term` (checked everywhere) or `meta:term` (only commit messages, PR text, branch name).
    Blank lines and lines starting with # are ignored."""
    out = []
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.lower().startswith("meta:"):
            term = line[5:].strip()
            if term:
                out.append(("meta", term))
        else:
            out.append(("all", line))
    return out


def term_match(term: str, text: str) -> bool:
    return re.search(r"(?<![A-Za-z0-9])" + re.escape(term) + r"(?![A-Za-z0-9])", text, re.IGNORECASE) is not None


def cmd_blocklist(args) -> int:
    pr = load_pr()
    res = Result()
    raw = os.environ.get("POLICY_BLOCKLIST", "")
    terms = parse_blocklist(raw)
    if not terms:
        if pr.from_fork:
            res.note("Blocklist skipped: secrets are not available to pull requests from forks. Review by hand.")
        else:
            res.note("Blocklist not configured: the repository secret POLICY_BLOCKLIST is empty or missing.")
        _summary("Private blocklist", res)
        return 0
    everywhere = [(i, t) for i, (scope, t) in enumerate(terms, 1) if scope == "all"]
    meta_or_all = list(enumerate((t for _, t in terms), 1))

    def check(text: str, where: str, pool):
        for i, t in pool:
            if term_match(t, text):
                res.error(f"Blocklisted term #{i} found in {where}.")

    check(pr.title, "the PR title", meta_or_all)
    check(pr.body, "the PR description", meta_or_all)
    check(pr.branch, "the branch name", meta_or_all)
    for c in commits(pr):
        check(c.message, f"commit {c.sha[:7]}'s message", meta_or_all)
    for _, path in changed_files(pr):
        check(path, f"the file path {path}", everywhere)
    for path, lineno, text in added_lines(pr):
        for i, t in everywhere:
            if term_match(t, text):
                res.error(f"Blocklisted term #{i} found in an added line.", path, lineno)
    res.note(f"{len(terms)} private terms checked; matches are reported by number only.")
    _summary("Private blocklist", res)
    return 1 if res.errors else 0


# --------------------------------------------------------------------------- scope


@dataclass
class Registry:
    layers: list[tuple[str, list[str], str]]  # (layer, path patterns, owners)
    hot: list[tuple[list[str], str]]  # (path patterns, who to tell)


def parse_registry(text: str) -> Registry:
    layers, hot, section = [], [], None
    for line in text.splitlines():
        if line.startswith("## "):
            section = line[3:].strip().lower()
            continue
        if not line.startswith("|") or set(line.replace("|", "").strip()) <= {"-", " "}:
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if section == "layer owners" and len(cells) >= 3 and cells[0] != "Layer":
            layers.append((cells[0], re.findall(r"`([^`]+)`", cells[1]), cells[2]))
        elif section == "hot shared files" and len(cells) >= 3 and not cells[0].startswith("File"):
            hot.append((re.findall(r"`([^`]+)`", cells[0]), cells[2]))
    return Registry(layers, hot)


def path_matches(path: str, pattern: str) -> bool:
    pattern = pattern.strip()
    if pattern.endswith("/"):
        return path.startswith(pattern)
    if any(ch in pattern for ch in "*?["):
        return fnmatch.fnmatch(path, pattern)
    return path == pattern or path.startswith(pattern.rstrip("/") + "/")


def spec_status(spec_text: str) -> str | None:
    m = re.search(r"^>\s*\*\*Status:\s*([^*]+?)\.?\*\*", spec_text, re.MULTILINE)
    return m.group(1).strip().lower() if m else None


def spec_of(code_text: str) -> str | None:
    for line in code_text.splitlines()[:15]:
        m = re.search(r"Spec:\s+(\S+\.md)", line)
        if m:
            return m.group(1)
    return None


def read_at(sha: str, path: str) -> str | None:
    try:
        return git("show", f"{sha}:{path}")
    except subprocess.CalledProcessError:
        return None


def spec_gate(pr: PR, files: list[tuple[str, str]]) -> list[tuple[str, str]]:
    """(file, problem) for changed layer code whose governing spec isn't agreed."""
    problems = []
    for status, path in files:
        if status == "D" or Path(path).suffix not in CODE_EXTENSIONS or path.startswith(NOT_LAYER_CODE):
            continue
        if "/tests/" in f"/{path}" or Path(path).name.startswith("test_"):
            continue
        text = read_at(pr.head_sha, path) or ""
        spec = spec_of(text)
        if spec is None:
            problems.append((path, "has no `Spec:` header line naming its governing spec"))
            continue
        spec_text = read_at(pr.head_sha, spec)
        if spec_text is None:
            problems.append((path, f"names `{spec}`, which doesn't exist"))
            continue
        st = spec_status(spec_text)
        if st != "agreed":
            problems.append((path, f"is governed by `{spec}`, whose status is '{st or 'missing'}', not 'agreed'"))
    return problems


def active_plans(sha: str) -> dict[str, str]:
    out = {}
    for path in git("ls-tree", "-r", "--name-only", sha, "plans/active/").splitlines():
        if path.endswith(".md") and Path(path).name.startswith("PLAN_"):
            out[path] = read_at(sha, path) or ""
    return out


def plan_branch(text: str) -> str | None:
    m = re.search(r"^\|\s*Branch\s*\|\s*`?([^`|]+?)`?\s*\|", text, re.MULTILINE)
    return m.group(1).strip() if m else None


def plan_status(text: str) -> str:
    m = re.search(r"^\|\s*Status\s*\|\s*([^|]+)\|", text, re.MULTILINE)
    return m.group(1).strip() if m else "unknown"


def plan_files(text: str) -> list[str]:
    """Backticked paths in the first column of a plan's file map tables."""
    paths = []
    for line in text.splitlines():
        if not line.startswith("|"):
            continue
        first = line.strip().strip("|").split("|")[0]
        for p in re.findall(r"`([^`]+)`", first):
            if "/" in p or "." in p:
                paths.append(p)
    return paths


def github_api(path: str, method: str = "GET", data: dict | None = None):
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        raise RuntimeError("GITHUB_TOKEN not set")
    req = urllib.request.Request(f"https://api.github.com{path}", method=method,
                                 data=json.dumps(data).encode() if data is not None else None)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    with urllib.request.urlopen(req, timeout=30) as r:
        body = r.read()
        return json.loads(body) if body else None


def open_pr_files(pr: PR) -> dict[int, tuple[str, str, list[str]]]:
    result = {}
    for other in github_api(f"/repos/{pr.repo}/pulls?state=open&per_page=50") or []:
        if other["number"] == pr.number:
            continue
        files = [f["filename"] for f in github_api(f"/repos/{pr.repo}/pulls/{other['number']}/files?per_page=100") or []]
        result[other["number"]] = (other["title"], other["user"]["login"], files)
    return result


def cmd_scope(args) -> int:
    pr = load_pr()
    res = Result()
    files = changed_files(pr)
    paths = [p for _, p in files]
    reg = parse_registry(read_at(pr.head_sha, "plans/REGISTRY.md") or "")

    layers: dict[str, str] = {}
    unmapped = []
    for p in paths:
        hit = [(name, owners) for name, pats, owners in reg.layers if any(path_matches(p, pat) for pat in pats)]
        for name, owners in hit:
            layers[name] = owners
        if not hit:
            unmapped.append(p)
    hot_hits: dict[str, str] = {}
    for p in paths:
        for pats, tell in reg.hot:
            if any(path_matches(p, pat) for pat in pats):
                hot_hits[p] = tell

    for path, problem in spec_gate(pr, files):
        res.warn(f"Spec gate: {path} {problem}. Specs are agreed before their code (CONTRIBUTING.md).", path, 1)

    plans = active_plans(pr.head_sha)
    own_plans = [p for p in plans
                 if p in paths or plan_branch(plans[p]) == pr.branch or f"`{pr.branch}`" in plans[p]]
    if not own_plans and not any(p.startswith("plans/") for p in paths):
        res.warn(f"No plan found for branch '{pr.branch}': add or update one in plans/active/ "
                 f"(small fixes can use the quick template).")

    plan_overlaps = []
    for ppath, text in plans.items():
        if ppath in own_plans or plan_status(text).lower().startswith("done"):
            continue
        hits = sorted({p for p in paths for pat in plan_files(text) if path_matches(p, pat)})
        if hits:
            plan_overlaps.append((ppath, plan_status(text), hits))

    pr_overlaps, pr_note = [], None
    if args.github:
        try:
            for num, (title, user, ofiles) in open_pr_files(pr).items():
                hits = sorted(set(paths) & set(ofiles))
                if hits:
                    pr_overlaps.append((num, title, user, hits))
        except (RuntimeError, urllib.error.URLError) as ex:
            pr_note = f"Open PRs not checked ({ex})."

    report = build_report(pr, layers, unmapped, hot_hits, res, own_plans, plan_overlaps, pr_overlaps, pr_note)
    out = os.environ.get("GITHUB_STEP_SUMMARY")
    if out:
        with open(out, "a", encoding="utf-8") as f:
            f.write(report + "\n")
    else:
        print(report)
    if args.post:
        post_comment(pr, report)
    return 0


def build_report(pr, layers, unmapped, hot_hits, res, own_plans, plan_overlaps, pr_overlaps, pr_note) -> str:
    L = [REPORT_MARKER, "### PR checks: scope report", ""]
    L.append("**Layers touched**")
    if layers:
        L += [f"- {name}: owners {owners}" for name, owners in sorted(layers.items())]
    if unmapped:
        L.append(f"- Not mapped to a layer in `plans/REGISTRY.md`: {', '.join(f'`{p}`' for p in unmapped[:15])}"
                 + (" …" if len(unmapped) > 15 else ""))
    L.append("")
    L.append("**Hot shared files** (tell these people before merging)")
    L += [f"- `{p}`: {tell}" for p, tell in sorted(hot_hits.items())] or ["- none"]
    L.append("")
    L.append("**Plan**")
    L += [f"- `{p}`" for p in own_plans] or ["- none found for this branch (warning)"]
    L.append("")
    L.append("**Overlaps with other work**")
    for num, title, user, hits in pr_overlaps:
        L.append(f"- PR #{num} ({user}, \"{title}\") also changes: {', '.join(f'`{h}`' for h in hits)}")
    for ppath, status, hits in plan_overlaps:
        L.append(f"- Active plan `{ppath}` ({status}) lists: {', '.join(f'`{h}`' for h in hits)}")
    if not pr_overlaps and not plan_overlaps:
        L.append("- none found")
    if pr_note:
        L.append(f"- {pr_note}")
    L.append("")
    if res.warnings:
        L.append("**Warnings** (don't block merging)")
        L += [f"- {w}" for w in res.warnings]
        L.append("")
    L.append("_Owners come from `plans/REGISTRY.md`. This comment is updated on every push._")
    return "\n".join(L)


def post_comment(pr: PR, report: str):
    if pr.number == 0:
        return
    try:
        comments = github_api(f"/repos/{pr.repo}/issues/{pr.number}/comments?per_page=100") or []
        mine = next((c for c in comments if REPORT_MARKER in (c.get("body") or "")), None)
        if mine:
            github_api(f"/repos/{pr.repo}/issues/comments/{mine['id']}", "PATCH", {"body": report})
        else:
            github_api(f"/repos/{pr.repo}/issues/{pr.number}/comments", "POST", {"body": report})
    except (RuntimeError, urllib.error.URLError) as ex:
        _annotate("notice", f"Could not post the scope comment ({ex}); it is in the job summary instead.")


# --------------------------------------------------------------------------- projects


def cmd_projects(args) -> int:
    pr = load_pr()
    projects = set()
    for _, path in changed_files(pr):
        p = Path(path)
        for parent in [p.parent, *p.parent.parents]:
            if str(parent) == ".":
                break
            if (Path(parent) / "pyproject.toml").exists():
                projects.add(parent.as_posix())
                break
    print(json.dumps(sorted(projects)))
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="pr_policy")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("policy").set_defaults(fn=cmd_policy)
    sub.add_parser("blocklist").set_defaults(fn=cmd_blocklist)
    s = sub.add_parser("scope")
    s.add_argument("--github", action="store_true", help="also check other open PRs through the GitHub API")
    s.add_argument("--post", action="store_true", help="post or update the PR comment")
    s.set_defaults(fn=cmd_scope)
    sub.add_parser("projects").set_defaults(fn=cmd_projects)
    args = ap.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
