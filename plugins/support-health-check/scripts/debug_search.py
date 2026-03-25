import base64, json, os, urllib.request, urllib.parse

email = os.environ["ATLASSIAN_EMAIL"]
token = os.environ["ATLASSIAN_TOKEN"]
headers = {
    "Authorization": "Basic " + base64.b64encode(f"{email}:{token}".encode()).decode(),
    "Accept": "application/json"
}

cql = 'type=page AND space="SS" AND text~"Power module Not Operational"'
params = urllib.parse.urlencode({"cql": cql, "limit": 2})
req = urllib.request.Request(
    f"https://sol-jira.atlassian.net/wiki/rest/api/search?{params}",
    headers=headers
)
with urllib.request.urlopen(req, timeout=10) as r:
    data = json.loads(r.read())
    print(json.dumps(data, indent=2))
