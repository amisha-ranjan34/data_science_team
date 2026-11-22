"""Run from the backend folder:  uv run python check_ai.py
Sends one tiny request to your AI provider and prints exactly what happens. It never prints your key."""
import json
import sys
import urllib.request

from app.llm import ENV_PATH, PACKAGES, _key, get_llm

llm = get_llm()
info = llm.info()
print("Looking for .env at:", ENV_PATH, "| exists:", ENV_PATH.exists())
print("Provider:", info["provider"], "| Model:", info["model"], "| enabled:", info["enabled"])
if not llm.enabled:
    print("AI is off ->", info["hint"])
    raise SystemExit(1)

if "--models" in sys.argv:  # list the model ids your key can use (Groq and OpenAI)
    urls = {"groq": "https://api.groq.com/openai/v1/models", "openai": "https://api.openai.com/v1/models"}
    if llm.provider not in urls:
        print("Listing is only built in for groq and openai. See your provider's model list page.")
        raise SystemExit(0)
    req = urllib.request.Request(urls[llm.provider], headers={"Authorization": f"Bearer {_key(llm.provider)}", "User-Agent": "auto-ds-team"})
    try:
        ids = sorted(m["id"] for m in json.load(urllib.request.urlopen(req, timeout=20))["data"])
        print("Models your key can use (put one in backend/.env as LLM_MODEL=...):")
        print("\n".join("  " + i for i in ids))
    except Exception as exc:
        print("Could not list models:", exc.__class__.__name__, exc)
    raise SystemExit(0)

try:
    from agno.agent import Agent

    out = Agent(model=llm._model(), markdown=False).run("Reply with the single word: ready")
    status = str(getattr(out.status, "value", out.status)).lower()
    print("Status:", status)
    print("Reply from provider:", out.content)
    print("\nWORKS. The agents will use the AI." if status != "error" else "\nFAILED. Read the reply line above: it is the provider's own error message.")
except ImportError as exc:
    print("Missing package:", exc, "\nFix: uv add", PACKAGES.get(llm.provider, "agno"))
except Exception as exc:
    print("FAILED:", exc.__class__.__name__, exc)