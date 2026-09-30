#!/usr/bin/env python3
"""
PM GitHub Pipeline — Restartable helper for PM phase.

Encapsulates:
  1. Create GitHub repo (gh repo create)
  2. Use existing GitHub Project PVT ID (REQUIRED — do NOT create duplicates)
  3. Bulk create issues (REST POST /repos/{owner}/{repo}/issues)
  4. Link issues to project (GraphQL addProjectV2ItemById)
  5. Verify every link lands in the SAME project we asked for

Restartable: writes /tmp/pm-created-issues.json sidecar and skips already-
created items on rerun, so a timed-out `claude -p` invocation can resume
without double-creating tickets.

Usage:
  export GH_TOKEN=ghp_xxx
  python3 scripts/pm-github-pipeline.py \
      --owner arkinara \
      --repo cyclesync \
      --project-pvt PVT_kwHOEL4FrM4BegPc \
      --ticket-spec /tmp/pm-tickets.json

The ticket-spec JSON schema:
  [
    {
      "title": "FE-mobile: ...",
      "labels": ["FE"],
      "body": "optional inline body"
      // OR
      "body_file": "/tmp/ticket-1.md"
    },
    ...
  ]

Called by the orchestrator directly when recovering from a timed-out PM run
(see pitfall #25), or as the last step of a PM `claude -p` invocation.
See pitfall #26 for the split-into-small-invocations rule.

**Hard rule: never auto-create a new project.** `gh project create` with a
duplicate title creates a NEW project on every call, leaving "SpendFlow Board"
orphans scattered across the owner's project list. The pipeline aborts if
`--project-pvt` is missing or the project can't be resolved against that ID.
"""
import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

GITHUB_API = "https://api.github.com"


def run(cmd: str, check: bool = True) -> str:
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if check and r.returncode != 0:
        print(f"  FAIL: {cmd[:80]}", file=sys.stderr)
        print(f"  stderr: {r.stderr.strip()[:300]}", file=sys.stderr)
        return ""
    return r.stdout.strip()


def gh_token() -> str:
    tok = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if tok:
        return tok
    return run("gh auth token")


def gh_api(method: str, path: str, body: dict | None = None, token: str = "") -> dict:
    if not token:
        token = gh_token()
    req = urllib.request.Request(
        f"{GITHUB_API}{path}",
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
        },
        method=method,
    )
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body_txt = e.read().decode()[:500]
        raise RuntimeError(f"HTTP {e.code} {method} {path}: {body_txt}") from e


def gh_graphql(query: str, variables: dict, token: str = "") -> dict:
    if not token:
        token = gh_token()
    req = urllib.request.Request(
        f"{GITHUB_API}/graphql",
        data=json.dumps({"query": query, "variables": variables}).encode(),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req) as r:
        data = json.loads(r.read())
        if "errors" in data:
            raise RuntimeError(f"GraphQL: {data['errors']}")
        return data


def ensure_repo(owner: str, repo: str, description: str) -> str:
    try:
        info = gh_api("GET", f"/repos/{owner}/{repo}")
        return info["html_url"]
    except RuntimeError:
        pass
    run(
        f"gh repo create {owner}/{repo} --public "
        f"--description {json.dumps(description)} --source=."
    )
    info = gh_api("GET", f"/repos/{owner}/{repo}")
    return info["html_url"]


def ensure_project(owner: str, pvt_hint: str, title: str = "") -> str:
    """Resolve the target project. **REQUIRED** PVT hint — never create.

    Returns the canonical PVT ID (`PVT_kwHOEL4FrM4Bxxxx`) for the project.
    Aborts with a clear error if the hint is missing or doesn't resolve —
    auto-creating a project by name is what produced the original duplicate-
    board bug.

    Uses GraphQL `node(id:)` because the REST `/projects/{id}` endpoint does
    NOT exist for ProjectV2 IDs (returns 404 even for valid PVTs).
    """
    if not pvt_hint or not pvt_hint.startswith("PVT_"):
        raise SystemExit(
            f"[PM-PIPELINE] ABORT: --project-pvt is required (got "
            f"{pvt_hint!r}). Refusing to auto-create a project by name — "
            f"that path created the orphaned 'SpendFlow Board' duplicates. "
            f"Pass --project-pvt PVT_kwHOEL4FrM4Bxxxx explicitly."
        )
    # Validate via GraphQL node(id:) — the only reliable way to confirm a
    # ProjectV2 ID is real and visible to this token.
    try:
        res = gh_graphql(
            'query($id: ID!) { node(id: $id) { ... on ProjectV2 { id title number } } }',
            {"id": pvt_hint},
        )
    except RuntimeError as e:
        raise SystemExit(
            f"[PM-PIPELINE] ABORT: GraphQL validation of {pvt_hint!r} failed: "
            f"{e}. Verify with `gh project list --owner {owner}`."
        ) from e
    node = (res.get("data") or {}).get("node")
    if node is None or node.get("id") is None:
        raise SystemExit(
            f"[PM-PIPELINE] ABORT: --project-pvt {pvt_hint!r} did not resolve "
            f"to a ProjectV2 (response: {res!r}). Either the ID is wrong, "
            f"the project was deleted, or this token can't see it. Verify "
            f"with: `gh project list --owner {owner}`."
        )
    canonical = node["id"]
    resolved_title = node.get("title", "")
    if title and resolved_title != title:
        print(
            f"  NOTE: --project-title {title!r} does not match the resolved "
            f"project's title {resolved_title!r}. Using the resolved project "
            f"(PVT hint wins — see the ABORT rule above)."
        )
    if canonical != pvt_hint:
        print(
            f"  NOTE: --project-pvt hint {pvt_hint!r} normalized to canonical "
            f"{canonical!r}."
        )
    return canonical


def load_sidecar(path: str) -> list:
    if not os.path.exists(path):
        return []
    with open(path) as f:
        return json.load(f)


def validate_body(t: dict, idx: int) -> str:
    """Resolve the body string from a ticket spec entry. Aborts on empty.

    Accepted shapes (only one of `body` or `body_file` per entry):
      - `body`: literal string in the spec
      - `body_file`: path to a file containing the body

    Rejected:
      - neither key present
      - both keys present (ambiguous)
      - empty `body` literal
      - `body_file` path doesn't exist
      - `body_file` reads to empty content

    Returns the resolved body string.

    The previous version silently accepted empty bodies, which is how
    3 empty-body issues (#48-#50) got created on 2026-08-08.
    """
    has_inline = "body" in t
    has_file = "body_file" in t and bool(t["body_file"])
    if has_inline and has_file:
        raise SystemExit(
            f"[PM-PIPELINE] ticket-spec[{idx}] has BOTH 'body' and 'body_file'. "
            f"Pick exactly one. Title: {t.get('title', '?')!r}"
        )
    if not has_inline and not has_file:
        raise SystemExit(
            f"[PM-PIPELINE] ticket-spec[{idx}] has neither 'body' nor 'body_file'. "
            f"Every issue needs a body. Title: {t.get('title', '?')!r}"
        )
    if has_inline:
        body = t["body"] or ""
        if not body.strip():
            raise SystemExit(
                f"[PM-PIPELINE] ticket-spec[{idx}] has empty 'body'. Title: "
                f"{t.get('title', '?')!r}"
            )
        return body
    # has_file
    path = t["body_file"]
    if not os.path.exists(path):
        raise SystemExit(
            f"[PM-PIPELINE] ticket-spec[{idx}] body_file {path!r} does not "
            f"exist (typo or stale). Title: {t.get('title', '?')!r}"
        )
    with open(path) as f:
        body = f.read()
    if not body.strip():
        raise SystemExit(
            f"[PM-PIPELINE] ticket-spec[{idx}] body_file {path!r} is empty. "
            f"Title: {t.get('title', '?')!r}"
        )
    return body


def create_issue(
    repo_full: str, title: str, body: str, labels: list, token: str
) -> dict:
    return gh_api(
        "POST",
        f"/repos/{repo_full}/issues",
        {"title": title, "body": body, "labels": labels},
        token=token,
    )


def link_to_project(pvt_id: str, issue_node_id: str, token: str) -> str:
    mutation = """
    mutation AddItem($project: ID!, $content: ID!) {
      addProjectV2ItemById(input: { projectId: $project, contentId: $content }) {
        item { id }
      }
    }
    """
    res = gh_graphql(
        mutation, {"project": pvt_id, "content": issue_node_id}, token=token
    )
    return res["data"]["addProjectV2ItemById"]["item"]["id"]


def verify_link(
    pvt_id: str, item_id: str, issue_node_id: str, token: str = ""
) -> bool:
    """Confirm the link landed in the project we asked for — defense in depth.

    The `addProjectV2ItemById` mutation can succeed even when an item is
    accidentally created in a different project (e.g. via a stale CLI flag).
    Verify by fetching the item's owning project node and comparing IDs.
    """
    if not token:
        token = gh_token()
    query = """
    query Verify($item: ID!) {
      node(id: $item) {
        ... on ProjectV2Item {
          id
          project { id }
          content { ... on Issue { id } }
        }
      }
    }
    """
    res = gh_graphql(query, {"item": item_id}, token=token)
    node = (res.get("data") or {}).get("node") or {}
    if not node:
        return False
    owning = (node.get("project") or {}).get("id")
    linked = (node.get("content") or {}).get("id")
    return owning == pvt_id and linked == issue_node_id


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--owner", required=True)
    ap.add_argument("--repo", required=True)
    ap.add_argument("--repo-description", default="")
    ap.add_argument("--project-title", default="")
    ap.add_argument(
        "--project-pvt",
        required=True,
        help="REQUIRED. Project PVT ID (e.g. PVT_kwHOEL4FrM4BesaS). The "
        "pipeline refuses to auto-create a project by name — that path "
        "previously created duplicate orphaned boards. Verify with: "
        "`gh project list --owner <owner>`.",
    )
    ap.add_argument(
        "--ticket-spec",
        required=True,
        help="JSON file: [{title, labels:[...], body OR body_file}, ...]. "
        "Every entry MUST have either 'body' (literal) or 'body_file' "
        "(path); neither is an error.",
    )
    ap.add_argument(
        "--sidecar",
        default="/tmp/pm-created-issues.json",
        help="Resume state path. Skips already-created issues on rerun.",
    )
    args = ap.parse_args()

    repo_full = f"{args.owner}/{args.repo}"
    token = gh_token()

    print(f"\n[PM-PIPELINE] Owner: {args.owner}, Repo: {repo_full}")
    url = ensure_repo(args.owner, args.repo, args.repo_description)
    print(f"  Repo: {url}")
    pvt_id = ensure_project(args.owner, args.project_pvt, args.project_title)
    print(f"  Project PVT: {pvt_id}")

    with open(args.ticket_spec) as f:
        tickets = json.load(f)

    # Resolve and validate every body up front so we never silently create an
    # empty issue. The previous version of this script let `body: ""` through
    # and 3 empty-body issues slipped into GitHub on 2026-08-08.
    for idx, t in enumerate(tickets):
        t["_body"] = validate_body(t, idx)
    print(f"  Validated {len(tickets)} ticket bodies ({sum(len(t['_body']) for t in tickets)} chars total)")

    done = load_sidecar(args.sidecar)
    done_keys = {(d.get("label", ""), d["title"]) for d in done}
    print(
        f"  Sidecar shows {len(done)} already-created tickets. "
        f"{len(tickets) - len(done_keys)} remaining."
    )

    new_issues = []
    for t in tickets:
        key = (t["labels"][0] if t["labels"] else "", t["title"])
        if key in done_keys:
            continue
        issue = create_issue(
            repo_full, t["title"], t["_body"], t.get("labels", ["FE"]), token
        )
        print(f"  Created #{issue['number']}: {t['title'][:60]}")
        new_issues.append(
            {
                "label": t["labels"][0] if t["labels"] else "FE",
                "title": t["title"],
                "number": issue["number"],
                "node_id": issue["node_id"],
            }
        )

    all_issues = done + new_issues
    with open(args.sidecar, "w") as f:
        json.dump(all_issues, f, indent=2)

    print(
        f"\n[PM-PIPELINE] Linking {len(all_issues)} issues to project {pvt_id}..."
    )
    linked = 0
    mismatches = []
    for issue in all_issues:
        if issue.get("project_item_id") and issue.get("verified"):
            linked += 1
            continue
        try:
            pid = link_to_project(pvt_id, issue["node_id"], token)
            ok = verify_link(pvt_id, pid, issue["node_id"], token=token)
            if not ok:
                mismatches.append(issue["number"])
                print(
                    f"  MISMATCH #{issue['number']}: link returned id={pid} "
                    f"but verify_link says it isn't in {pvt_id}."
                )
                continue
            issue["project_item_id"] = pid
            issue["verified"] = True
            linked += 1
        except Exception as e:
            print(f"  Link failed #{issue['number']}: {e}")

    with open(args.sidecar, "w") as f:
        json.dump(all_issues, f, indent=2)

    print(
        f"\n[PM-PIPELINE] Done. Created {len(new_issues)}, "
        f"linked {linked}/{len(all_issues)} to {pvt_id}."
    )
    if mismatches:
        print(
            f"  WARNING: {len(mismatches)} item(s) didn't verify against the "
            f"target project — investigate and re-link with: "
            f"`gh project item-add {args.project_pvt.replace('PVT_', '')} "
            f"--owner {args.owner} --url https://github.com/{repo_full}/issues/<N>`."
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())