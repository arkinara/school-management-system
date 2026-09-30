"""Add 'In QA' option to School Management System Board Status field (project #17), preserving existing option IDs."""
import json, subprocess, sys

OWNER = "arkinara"
PROJECT_NUMBER = 17

# Current options (must include ALL existing options to preserve IDs)
existing_option_ids = ["f75ad846", "47fc9ee4", "98236657"]

r = subprocess.run(["gh", "project", "field-list", str(PROJECT_NUMBER), "--owner", OWNER, "--format", "json"], capture_output=True, text=True)
d = json.loads(r.stdout)
status_field = next(f for f in d["fields"] if f["name"] == "Status")
field_id = status_field["id"]
print("Status field id:", field_id)

mutation = """
mutation UpdateStatusField($fieldId: ID!) {
  updateProjectV2Field(input: {
    fieldId: $fieldId,
    name: "Status",
    singleSelectOptions: [
      {id: "f75ad846", name: "Todo", description: "Not yet picked up", color: GRAY}
      {id: "47fc9ee4", name: "In Progress", description: "Dev actively coding", color: YELLOW}
      {id: "71d7d6c3", name: "In QA", description: "Code on main, QA testing", color: ORANGE}
      {id: "98236657", name: "Done", description: "Pushed to main", color: GREEN}
    ]
  }) {
    projectV2Field { ... on ProjectV2SingleSelectField { id name options { id name color } } }
  }
}
"""

import urllib.request
token = subprocess.run(["gh", "auth", "token"], capture_output=True, text=True).stdout.strip()
req = urllib.request.Request(
    "https://api.github.com/graphql",
    data=json.dumps({"query": mutation, "variables": {"fieldId": field_id}}).encode(),
    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    method="POST",
)
with urllib.request.urlopen(req) as r:
    out = json.loads(r.read())
if "errors" in out:
    print("ERROR:", json.dumps(out["errors"], indent=2))
    sys.exit(1)
opts = out["data"]["updateProjectV2Field"]["projectV2Field"]["options"]
print(f"\nUpdated {len(opts)} Status options:")
for o in opts:
    print(f"  {o['name']}: {o['id']} (color={o.get('color')})")